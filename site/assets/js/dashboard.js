ETI.ui.exigirSessao()
ETI.ui.montarTopo('dashboard.html')

const app = Vue.createApp({
    data() {
        return {
            sala: ETI.data.sala(),
            st: {},
            config: { nomes: {}, equipamentos: [], grade: [] },
            estado: {},
            ocupacao: { ocupada: false, manual: false, ate: null },
            economia: { ativo: false, motivo: null },
            dias: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
            alertas: [],
            eventos: [],
            historico: [],
            gateway: null,
            online: false,

            suportaSerial: ETI.gateway.suportado,
            serial: { conectado: false, erro: null, linhas: [] },

            form: { tempoInatividade: 30, limiteTemp: 28, umidMin: 40, umidMax: 75, equipMax: 40,
                limiteLuz: 700, horarioEconomia: '23:00', capacidade: 40 },
            editando: false,
            simForm: { ativa: false, valor: 30 },
            editandoSim: false,
            regrasSalvas: false,
            enviado: ''
        }
    },

    computed: {
        tempSala() {
            return ETI.data.tempSala(this.st)
        },
        setpoint() {
            return this.st.setar != null && this.online ? this.st.setar : (this.config.arSetpoint || 21)
        },

        // Equipamentos que têm chave no painel (os outros só entram na conta de energia)
        equipamentosControle() {
            return (this.config.equipamentos || []).filter(eq => ETI.data.controlaveis.includes(eq.id))
        },
        potencia() {
            this.st; this.estado; this.config
            return ETI.data.potencia()
        },
        lotacaoPct() {
            const cap = this.config.capacidade || 0
            return cap ? Math.min(100, Math.round((this.st.pessoas || 0) / cap * 100)) : 0
        },
        lotacaoCheia() {
            return (this.st.pessoas || 0) >= (this.config.capacidade || Infinity)
        },
        modoOcupacao() {
            if (!this.ocupacao.manual) return 'grade'
            return this.ocupacao.ocupada ? 'ocupada' : 'vazia'
        },
        notaOcupacao() {
            if (this.ocupacao.manual) return 'Marcada à mão até as ' + ETI.ui.hora(this.ocupacao.ate) + '. Depois volta a seguir a grade e o cartão.'
            return 'Automática: ocupada quando alguém entrou pelo cartão ou no horário de aulas.'
        },
        notaEconomia() {
            const m = this.economia.motivo
            if (m === 'forcada') return 'Ativado à mão: iluminação, ar, ventilação e projetor desligados e travados.'
            if (m === 'horario') return 'Em vigor pelo desligamento programado das ' + this.config.horarioEconomia + '. Ativar aqui mantém a economia mesmo depois.'
            if (m === 'vazia') return 'Em vigor porque a sala está vazia. Ativar aqui mantém a economia mesmo quando a sala voltar a ser usada.'
            return 'Desliga iluminação, ar, ventilação e projetor e trava os controles até ser desativado.'
        },
        notaManual() {
            if (this.economia.ativo) return 'Controles travados enquanto o modo economia estiver ativo.'
            if (this.config.modoManual) return 'Você assumiu os equipamentos. A luz, o ar e a ventilação não mudam sozinhos até retomar as automações.'
            return 'Luz, ar e ventilação seguem as regras automaticamente. Mexer em um equipamento suspende as regras.'
        },

        luzPct() {
            return this.st.luz == null ? 0 : Math.round(this.st.luz / 1023 * 100)
        },
        presentes() {
            this.eventos
            return ETI.data.presentes()
        },
        cartoesVistos() {
            const uids = new Set(Object.keys(this.config.nomes || {}))
            this.eventos.forEach(e => { if (e.cartao) uids.add(e.cartao) })
            return Array.from(uids).sort()
        },
        linhasSerial() {
            return this.serial.linhas.map(l => (l.dir === 'out' ? '→ ' : '← ') + l.txt).join('\n')
        },

        graficoRotulos() {
            return this.historico.map(p => ETI.ui.hora(p.ts))
        },
        graficoSeries() {
            return [
                {
                    rotulo: 'Temperatura', cor: '#07296F', eixo: 'y', unidade: '°C', casas: 1,
                    escala: { suggestedMin: 15, suggestedMax: 35 },
                    dados: this.historico.map(p => p.temp)
                },
                {
                    rotulo: 'Projetor', cor: '#D1531F', eixo: 'y', unidade: '°C', casas: 1,
                    dados: this.historico.map(p => p.equip)
                },
                {
                    rotulo: 'Umidade', cor: '#8DB6FF', eixo: 'y2', unidade: '%', casas: 0,
                    escala: { suggestedMin: 0, suggestedMax: 100 },
                    dados: this.historico.map(p => p.umid)
                },
                {
                    rotulo: 'Luminosidade', cor: '#C99A06', eixo: 'y2', unidade: '%', casas: 0,
                    dados: this.historico.map(p => p.luz == null ? null : Math.round(p.luz / 1023 * 100))
                }
            ]
        }
    },

    methods: {
        num(valor, casas) {
            return ETI.ui.numero(valor, casas)
        },
        hora(ts) {
            return ts ? ETI.ui.hora(ts) : '—'
        },
        nomeCartao(uid) {
            this.config
            return ETI.data.nomeCartao(uid)
        },
        comando(cmd) {
            ETI.data.enviarComando(cmd)
            this.enviado = 'Comando "' + cmd + '" enviado.'
            clearTimeout(this.timerEnviado)
            this.timerEnviado = setTimeout(() => { this.enviado = '' }, 2500)
        },
        // Recebe o evento 'alternar' do componente chave-equipamento
        alternar(id) {
            if (this.economia.ativo) return
            ETI.data.setEstado(id, !ETI.data.ligado(id))
        },
        ligado(id) {
            this.st; this.estado
            return ETI.data.ligado(id)
        },
        setOcupacao(valor) {
            ETI.data.setOcupacao(valor)
        },
        alternarEconomia() {
            if (this.config.economiaForcada) ETI.data.desativarEconomia()
            else ETI.data.forcarEconomia()
        },
        retomar() {
            ETI.data.setConfig({ modoManual: false })
        },
        atualizarRegras() {
            this.ocupacao = ETI.data.ocupacao()
            this.economia = ETI.data.economia()
            this.online = ETI.data.online()
        },
        ligarAr(ligar) {
            ETI.data.setEstado('ar', ligar)
            this.avisar('Comando para ' + (ligar ? 'ligar' : 'desligar') + ' o ar enviado.')
        },
        mudarSetpoint(delta) {
            ETI.data.ar.setSetpoint(this.setpoint + delta)
        },
        aplicarFonte() {
            ETI.data.ar.setSimulada(this.simForm.ativa, this.simForm.valor)
        },
        aplicarSimulada() {
            this.simForm.ativa = true
            ETI.data.ar.setSimulada(true, this.simForm.valor)
        },
        avisar(txt) {
            this.enviado = txt
            clearTimeout(this.timerEnviado)
            this.timerEnviado = setTimeout(() => { this.enviado = '' }, 2500)
        },
        zerar() {
            if (confirm('Zerar a contagem de pessoas no Arduino?')) this.comando('ZERAR')
        },
        limparTudo() {
            const msg = 'Apagar TODOS os dados de teste?\n\n' +
                '• eventos e gráfico\n• cartões e seus nomes\n• bonecos do mapa\n• contagem de pessoas\n\n' +
                'As regras (limites, ar, simulada) continuam. Não dá para desfazer.'
            if (!confirm(msg)) return
            ETI.data.limparTudo()
                .then(() => this.avisar('Dados de teste apagados.'))
                .catch(e => this.avisar('Erro ao limpar: ' + e.message))
        },
        nomear(uid, nome) {
            ETI.data.setNomeCartao(uid, nome.trim())
        },
        salvarRegras() {
            const f = this.form
            const tempo = Math.max(5, Math.round(f.tempoInatividade || 30))
            ETI.data.setConfig({
                tempoInatividade: tempo,
                limiteTemp: f.limiteTemp, umidMin: f.umidMin, umidMax: f.umidMax,
                equipMax: f.equipMax,
                limiteLuz: Math.max(0, Math.min(1023, Math.round(f.limiteLuz))),
                horarioEconomia: f.horarioEconomia,
                capacidade: Math.max(1, Math.round(f.capacidade))
            })
            ETI.data.enviarComando('LUZMIN ' + Math.max(0, Math.min(1023, Math.round(f.limiteLuz))))
            ETI.data.enviarComando('TEMPO ' + tempo)
            ETI.data.enviarComando('LIMITE ' + f.limiteTemp)
            this.regrasSalvas = true
            clearTimeout(this.timerSalvo)
            this.timerSalvo = setTimeout(() => { this.regrasSalvas = false }, 2500)
        },
        alternarSerial() {
            if (this.serial.conectado) ETI.gateway.desconectar()
            else ETI.gateway.conectar()
        }
    },

    mounted() {
        this.cancelamentos = [
            ETI.data.onStatus(s => { this.st = s || {}; this.atualizarRegras() }),
            ETI.data.onEstado(e => { this.estado = e }),
            ETI.data.onConfig(c => {
                this.config = c
                this.sala = ETI.data.sala()
                this.atualizarRegras()
                if (!this.editando) {
                    Object.keys(this.form).forEach(k => { if (c[k] != null) this.form[k] = c[k] })
                }
                this.simForm.ativa = !!c.tempSimAtiva
                if (!this.editandoSim) this.simForm.valor = c.tempSimValor
            }),
            ETI.data.onAlertas(a => {
                this.alertas = a.ativos
                this.online = ETI.data.online()
            }),
            ETI.data.onEventos(e => { this.eventos = e }),
            ETI.data.onHistorico(h => { this.historico = h }),
            ETI.data.onGateway(g => { this.gateway = g }),
            ETI.gateway.onEstado(s => {
                this.serial = { conectado: s.conectado, erro: s.erro, linhas: s.linhas.slice() }
            })
        ]

        this.timerOnline = setInterval(() => this.atualizarRegras(), 1000)
    },

    unmounted() {
        this.cancelamentos.forEach(cancelar => cancelar())
        clearInterval(this.timerOnline)
    }
})
