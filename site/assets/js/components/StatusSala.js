app.component('status-sala', {
    props: {
        online: { type: Boolean, default: false },
        pessoas: { type: Number, default: 0 },
        lampada: { type: Boolean, default: false },
        curto: { type: Boolean, default: false }
    },
    template:  `<span>{{ frase }}</span>`,
    computed: {
        textoPessoas() {
            if (this.pessoas === 0) return 'Sala vazia'
            return 'Sala em uso, ' + this.pessoas + (this.pessoas === 1 ? ' pessoa' : ' pessoas')
        },
        frase() {
            if (!this.online) return this.curto ? 'Arduino desconectado' : 'Arduino desconectado, mostrando a última leitura recebida.'
            if (this.curto) return this.textoPessoas
            return this.textoPessoas + '. Lâmpada ' + (this.lampada ? 'acesa' : 'apagada') + '. Leituras ao vivo.'
        }
    }
})
