const ROTACAO_MS = 9000

const app = Vue.createApp({
    data() {
        return {
            sala: ETI.data.sala(),
            st: {},
            config: { limiteTemp: 28, capacidade: 40 },
            online: false,
            ocupacao: { ocupada: false },
            economia: { ativo: false, motivo: null },
            alertas: [],
            avisos: [],
            indice: 0,
            hora: ETI.ui.hora(Date.now()),
            suportaSerial: ETI.gateway.suportado,
            serial: { conectado: false, erro: null }
        }
    },

    computed: {

        itens() {
            const alertas = this.alertas.map(a => ({
                chave: 'alerta:' + a.id, alerta: true, titulo: a.titulo, texto: a.texto
            }))
            const avisos = this.avisos.map(a => ({
                chave: 'aviso:' + a.id, alerta: false, titulo: a.titulo, texto: a.texto
            }))
            return alertas.concat(avisos)
        },
        atual() {
            if (!this.itens.length) return null
            return this.itens[this.indice % this.itens.length]
        }
    },

    watch: {

        itens(novos, velhos) {
            const antes = velhos.map(i => i.chave)
            const depois = novos.map(i => i.chave)
            const chaveAtual = velhos.length ? velhos[this.indice % velhos.length].chave : null

            const novoAlerta = novos.find(i => i.alerta && !antes.includes(i.chave))
            if (novoAlerta) {
                this.indice = depois.indexOf(novoAlerta.chave)
            } else {
                const pos = chaveAtual ? depois.indexOf(chaveAtual) : -1
                this.indice = pos >= 0 ? pos : 0
            }

            if (antes.join('|') !== depois.join('|')) this.reagendar()
        }
    },

    methods: {
        alternarSerial() {
            if (this.serial.conectado) ETI.gateway.desconectar()
            else ETI.gateway.conectar()
        },
        enviar(cmd) {
            ETI.data.enviarComando(cmd)
        },
        num(valor, casas) {
            return ETI.ui.numero(valor, casas)
        },
        tempSala(st) {
            return ETI.data.tempSala(st)
        },
        atualizarRegras() {
            this.online = ETI.data.online()
            this.ocupacao = ETI.data.ocupacao()
            this.economia = ETI.data.economia()
        },
        reagendar() {
            clearInterval(this.timerRotacao)
            this.timerRotacao = setInterval(() => {
                if (this.itens.length > 1) this.indice = (this.indice + 1) % this.itens.length
            }, ROTACAO_MS)
        },
        teclado(e) {
            if (e.key === 'f' || e.key === 'F') {
                const p = document.fullscreenElement
                    ? document.exitFullscreen()
                    : document.documentElement.requestFullscreen()
                if (p && p.catch) p.catch(() => {})
                return
            }
            const n = this.itens.length
            if (!n) return
            if (e.key === 'ArrowRight') this.indice = (this.indice + 1) % n
            else if (e.key === 'ArrowLeft') this.indice = (this.indice - 1 + n) % n
            else return
            this.reagendar()
        }
    },

    mounted() {
        this.cancelamentos = [
            ETI.data.onStatus(s => { this.st = s || {}; this.atualizarRegras() }),
            ETI.data.onConfig(c => { this.config = c; this.sala = ETI.data.sala(); this.atualizarRegras() }),
            ETI.data.onAlertas(a => {
                this.alertas = a.ativos
                this.online = ETI.data.online()
            }),
            ETI.data.onAvisos(lista => {
                this.avisos = lista.filter(a => a.ativo)
            }),
            ETI.gateway.onEstado(s => {
                this.serial = { conectado: s.conectado, erro: s.erro }
            })
        ]

        this.timerRelogio = setInterval(() => {
            this.hora = ETI.ui.hora(Date.now())
            this.atualizarRegras()
        }, 1000)

        this.reagendar()
        document.addEventListener('keydown', this.teclado)
    },

    unmounted() {
        this.cancelamentos.forEach(cancelar => cancelar())
        clearInterval(this.timerRelogio)
        clearInterval(this.timerRotacao)
        document.removeEventListener('keydown', this.teclado)
    }
})
