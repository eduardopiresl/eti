window.ETI = window.ETI || {};

(function () {
  const TS = firebase.database.ServerValue.TIMESTAMP;
  const INTERVALO_HISTORICO = 30000;
  const COMANDO_VELHO_MS = 30000;

  let porta = null;
  let leitor = null;
  let escritor = null;
  let cancelarComandos = null;
  let ultimoHistorico = 0;

  const estado = { conectado: false, erro: null, linhas: [] };
  const ouvintes = [];
  function avisar() { ouvintes.forEach(function (fn) { fn(estado); }); }

  function registrarLinha(txt, direcao) {
    estado.linhas.unshift({ txt: txt, dir: direcao, ts: Date.now() });
    if (estado.linhas.length > 12) estado.linhas.length = 12;
    avisar();
  }

  function tratarLinha(linha) {
    linha = linha.trim();
    if (!linha) return;
    registrarLinha(linha, 'in');

    let msg;
    try { msg = JSON.parse(linha); }
    catch (e) { return; }

    const raiz = ETI.data.raiz;

    if (msg.tipo === 'status') {
      delete msg.tipo;
      msg.ts = TS;
      raiz.child('status').set(msg);

      if (Date.now() - ultimoHistorico >= INTERVALO_HISTORICO) {
        ultimoHistorico = Date.now();
        raiz.child('historico').push({
          temp: msg.temp, umid: msg.umid, agua: msg.agua,
          luz: msg.luz, pessoas: msg.pessoas, ts: TS
        });
      }
    } else if (msg.tipo === 'evento' || msg.tipo === 'inicio') {
      if (msg.tipo === 'inicio') msg.acao = 'inicio';
      delete msg.tipo;
      msg.ts = TS;
      raiz.child('eventos').push(msg);

      if (msg.acao === 'inicio') {
        const off = ETI.data.onConfig(function (c) {
          if (c.tempoInatividade) escrever('TEMPO ' + c.tempoInatividade);
        });
        off();
      }
    }
  }

  async function lerSempre() {
    const decodificador = new TextDecoderStream();
    porta.readable.pipeTo(decodificador.writable).catch(function () {});
    leitor = decodificador.readable.getReader();

    let resto = '';
    try {
      while (true) {
        const { value, done } = await leitor.read();
        if (done) break;
        resto += value;
        const partes = resto.split('\n');
        resto = partes.pop();
        partes.forEach(tratarLinha);
      }
    } catch (e) {
      estado.erro = 'A leitura parou: ' + e.message;
    }
    if (estado.conectado) desconectar();
  }

  async function escrever(cmd) {
    if (!escritor) return;
    await escritor.write(new TextEncoder().encode(cmd + '\n'));
    registrarLinha(cmd, 'out');
  }

  function ouvirComandos() {
    const ref = ETI.data.raiz.child('comandos');
    const fn = ref.on('child_added', function (snap) {
      const c = snap.val() || {};
      snap.ref.remove();
      if (!c.cmd) return;
      if (c.ts && ETI.data.agora() - c.ts > COMANDO_VELHO_MS) return;
      escrever(c.cmd);
    });
    return function () { ref.off('child_added', fn); };
  }

  async function conectar() {
    estado.erro = null;
    try {
      porta = await navigator.serial.requestPort();
      await porta.open({ baudRate: 9600 });
    } catch (e) {
      estado.erro = e.name === 'NotFoundError'
        ? 'Nenhuma porta escolhida.'
        : 'Não deu para abrir a porta. Feche o Monitor Serial do Arduino IDE e tente de novo. (' + e.message + ')';
      porta = null;
      avisar();
      return;
    }

    escritor = porta.writable.getWriter();
    estado.conectado = true;
    ultimoHistorico = 0;

    const gw = ETI.data.raiz.child('gateway');
    gw.set({ online: true, desde: TS, navegador: navigator.userAgent.slice(0, 120) });
    gw.onDisconnect().remove();

    cancelarComandos = ouvirComandos();
    avisar();
    lerSempre();
  }

  async function desconectar() {
    estado.conectado = false;
    if (cancelarComandos) { cancelarComandos(); cancelarComandos = null; }
    ETI.data.raiz.child('gateway').remove();
    try { if (leitor) await leitor.cancel(); } catch (e) {}
    try { if (escritor) escritor.releaseLock(); } catch (e) {}
    try { if (porta) await porta.close(); } catch (e) {}
    leitor = null; escritor = null; porta = null;
    avisar();
  }

  if ('serial' in navigator) {
    navigator.serial.addEventListener('disconnect', function (e) {
      if (porta && e.target === porta) {
        estado.erro = 'O cabo USB do Arduino foi desconectado.';
        desconectar();
      }
    });
  }

  ETI.gateway = {
    suportado: 'serial' in navigator,
    conectar: conectar,
    desconectar: desconectar,
    estado: function () { return estado; },
    onEstado: function (fn) {
      ouvintes.push(fn);
      fn(estado);
      return function () { ouvintes.splice(ouvintes.indexOf(fn), 1); };
    }
  };
})();
