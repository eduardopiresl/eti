ETI.ui.exigirSessao()
ETI.ui.montarTopo('dashboard.html')

const app = Vue.createApp({
    data() {
        return {
            sala: ETI.data.sala(),
            st: {},
            config: { nomes: {} },
            alertas: [],
            eventos: [],
            historico: [],
            gateway: null,
            online: false,

            suportaSerial: ETI.gateway.suportado,
            serial: { conectado: false, erro: null, linhas: [] },

            form: { tempoInatividade: 30, limiteTemp: 28, umidMin: 40, umidMax: 75, aguaMin: 15, aguaMax: 30 },
            editando: false,
            regrasSalvas: false,
            enviado: ''
        }
    },

    computed: {

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
                    rotulo: 'Água do filtro', cor: '#D1531F', eixo: 'y', unidade: '°C', casas: 1,
                    dados: this.historico.map(p => p.agua)
                },
                {
                    rotulo: 'Umidade', cor: '#8DB6FF', eixo: 'y2', unidade: '%', casas: 0,
                    escala: { suggestedMin: 0, suggestedMax: 100 },
                    dados: this.historico.map(p => p.umid)
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
        zerar() {
            if (confirm('Zerar a contagem de pessoas no Arduino?')) this.comando('ZERAR')
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
                aguaMin: f.aguaMin, aguaMax: f.aguaMax
            })
            ETI.data.enviarComando('TEMPO ' + tempo)
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
            ETI.data.onStatus(s => { this.st = s || {} }),
            ETI.data.onConfig(c => {
                this.config = c
                if (!this.editando) {
                    Object.keys(this.form).forEach(k => { if (c[k] != null) this.form[k] = c[k] })
                }
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

        this.timerOnline = setInterval(() => { this.online = ETI.data.online() }, 1000)
    },

    unmounted() {
        this.cancelamentos.forEach(cancelar => cancelar())
        clearInterval(this.timerOnline)
    }
})
