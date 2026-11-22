// Frase que descreve a situação da sala.
// `curto` é a versão do painel de TV ("Sala em uso", "Sala vazia"...).
app.component('status-sala', {
    props: {
        online: { type: Boolean, default: false },
        pessoas: { type: Number, default: 0 },
        lampada: { type: Boolean, default: false },
        ocupada: { type: Boolean, default: false },
        modoEconomia: { type: Boolean, default: false },
        modoManual: { type: Boolean, default: false },
        horarioEconomia: { type: String, default: '' },
        motivoEconomia: { type: String, default: null },
        marcadaManual: { type: Boolean, default: false },
        marcadaAte: { type: Number, default: null },
        curto: { type: Boolean, default: false }
    },
    template: /*html*/ `<span>{{ frase }}</span>`,
    computed: {
        textoOcupacao() {
            if (this.marcadaManual) {
                return (this.ocupada ? 'Sala marcada como ocupada' : 'Sala marcada como vazia') +
                    (this.marcadaAte ? ' até as ' + ETI.ui.hora(this.marcadaAte) : '')
            }
            if (this.online && this.pessoas > 0) {
                return 'Sala em uso, ' + this.pessoas + (this.pessoas === 1 ? ' pessoa' : ' pessoas') + ' pelo cartão'
            }
            return this.ocupada
                ? 'Sala ocupada pelo horário de aulas'
                : 'Sala vazia, fora do horário de aulas'
        },
        textoAutomacao() {
            if (this.modoEconomia) {
                if (this.motivoEconomia === 'forcada') return 'Modo economia ativado manualmente, equipamentos desligados'
                if (this.motivoEconomia === 'horario') return 'Desligamento programado das ' + this.horarioEconomia + ' em vigor, equipamentos desligados'
                return 'Equipamentos desligados porque a sala está vazia'
            }
            return this.modoManual
                ? 'Equipamentos no controle manual, limites automáticos suspensos'
                : 'Automações ativas'
        },
        frase() {
            if (this.curto) {
                if (!this.online) return 'Arduino desconectado'
                if (this.modoEconomia) return 'Modo economia, equipamentos desligados'
                if (this.pessoas > 0) return 'Sala em uso, ' + this.pessoas + (this.pessoas === 1 ? ' pessoa' : ' pessoas')
                return this.ocupada ? 'Sala em uso' : 'Sala vazia'
            }
            const arduino = this.online
                ? 'Lâmpada ' + (this.lampada ? 'acesa' : 'apagada') + ', leituras ao vivo.'
                : 'Arduino desconectado, mostrando a última leitura recebida.'
            return this.textoOcupacao + '. ' + this.textoAutomacao + '. ' + arduino
        }
    }
})
