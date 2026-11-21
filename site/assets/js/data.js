window.ETI = window.ETI || {};

(function () {
  firebase.initializeApp(window.FIREBASE_CONFIG);
  const db = firebase.database();
  const raiz = db.ref('sala');

  const SALA = { nome: 'Sala Inteligente', bloco: 'Protótipo com Arduino Nano' };

  const CONFIG_PADRAO = {
    limiteTemp: 28,
    umidMin: 40,
    umidMax: 75,
    aguaMin: 15,
    aguaMax: 30,
    tempoInatividade: 30,
    arSetpoint: 21,
    tempSimAtiva: false,
    tempSimValor: 30,
    nomes: {}
  };

  const SEM_LEITURA_MS = 15000;
  const LIMITE_EVENTOS = 80;
  const LIMITE_HISTORICO = 120;

  let desvioRelogio = 0;
  db.ref('.info/serverTimeOffset').on('value', function (s) { desvioRelogio = s.val() || 0; });
  function agora() { return Date.now() + desvioRelogio; }

  const valores = {};
  const ouvintes = {};

  function emitir(canal, valor) {
    valores[canal] = valor;
    (ouvintes[canal] || []).forEach(function (fn) { fn(valor); });
  }

  function inscrever(canal, fn) {
    (ouvintes[canal] = ouvintes[canal] || []).push(fn);
    if (canal in valores) fn(valores[canal]);
    return function () {
      ouvintes[canal] = ouvintes[canal].filter(function (f) { return f !== fn; });
    };
  }

  function lista(snap) {
    const itens = [];
    snap.forEach(function (filho) {
      const v = filho.val() || {};
      v.id = filho.key;
      itens.push(v);
    });
    return itens;
  }

  let iniciado = false;
  firebase.auth().onAuthStateChanged(function (usuario) {
    if (!usuario) {
      if (!window.ETI_PAGINA_LOGIN) location.replace('index.html');
      return;
    }
    emitir('usuario', usuario);
    if (!iniciado && !window.ETI_PAGINA_LOGIN) { iniciado = true; assinar(); }
  });

  function assinar() {
    raiz.child('status').on('value', function (s) { emitir('status', s.val()); recalcular(); });

    raiz.child('eventos').orderByChild('ts').limitToLast(LIMITE_EVENTOS).on('value', function (s) {
      emitir('eventos', lista(s).reverse());
      recalcular();
    });

    raiz.child('historico').orderByChild('ts').limitToLast(LIMITE_HISTORICO).on('value', function (s) {
      emitir('historico', lista(s));
    });

    raiz.child('config').on('value', function (s) {
      const c = Object.assign({}, CONFIG_PADRAO, s.val() || {});
      c.nomes = c.nomes || {};
      emitir('config', c);
      recalcular();
    });

    raiz.child('gateway').on('value', function (s) { emitir('gateway', s.val()); });

    db.ref('avisos').orderByChild('criadoEm').on('value', function (s) {
      emitir('avisos', lista(s).reverse());
    });

    db.ref('.info/connected').on('value', function (s) { emitir('conectadoFirebase', !!s.val()); });

    setInterval(recalcular, 2000);
  }

  ETI.auth = {
    entrar: function (email, senha) {
      return firebase.auth().signInWithEmailAndPassword(email, senha);
    },
    sair: function () {
      return firebase.auth().signOut().then(function () { location.replace('index.html'); });
    },
    onUsuario: function (fn) { return inscrever('usuario', fn); }
  };

  function tempSala(st) {
    if (!st) return null;
    return st.sim != null ? st.sim : st.temp;
  }

  function comandosConfig(c) {
    return [
      'TEMPO ' + c.tempoInatividade,
      'LIMITE ' + c.limiteTemp,
      'SETAR ' + c.arSetpoint,
      c.tempSimAtiva ? 'SIM ' + c.tempSimValor : 'SIM OFF'
    ];
  }

  function eventoRecente(acao, ms) {
    const ev = (valores.eventos || []).find(function (e) { return e.acao === acao; });
    return ev && agora() - ev.ts < ms ? ev : null;
  }

  function inatividadeAtiva(status) {
    if (!status || !status.pessoas) return null;

    const ev = (valores.eventos || []).find(function (e) {
      return e.acao === 'inatividade' || e.acao === 'entrada' || e.acao === 'saida' ||
        e.acao === 'movimento_virtual' || e.acao === 'zerado' ||
        (e.acao === 'lampada' && e.motivo === 'movimento');
    });
    return ev && ev.acao === 'inatividade' ? ev : null;
  }

  function calcularAlertas() {
    const st = valores.status;
    const c = valores.config || CONFIG_PADRAO;
    const ativos = [];
    function add(id, titulo, texto, desde) {
      ativos.push({ id: id, titulo: titulo, texto: texto, desde: desde || (st && st.ts) || agora() });
    }

    if (!st || !st.ts || agora() - st.ts > SEM_LEITURA_MS) {
      add('offline', 'Arduino desconectado',
        st && st.ts
          ? 'Nenhuma leitura desde as ' + ETI.ui.hora(st.ts) + '. Ligue o Arduino na USB do computador da sala e clique em "Conectar Arduino".'
          : 'Ainda não chegou nenhuma leitura. Ligue o Arduino na USB e clique em "Conectar Arduino".',
        st && st.ts);
      return ativos;
    }

    const intruso = eventoRecente('intruso', 2 * 60000);
    if (intruso) add('intruso', 'Movimento sem cartão',
      'O sensor de presença detectou alguém com a sala vazia, sem passar o cartão.', intruso.ts);

    const inativ = inatividadeAtiva(st);
    if (inativ) add('inatividade', 'Sala parada',
      'Tem ' + st.pessoas + (st.pessoas === 1 ? ' pessoa registrada' : ' pessoas registradas') +
      ', mas nenhum movimento há mais de ' + st.inatividade + ' s. A lâmpada e o ar foram desligados.', inativ.ts);

    const lotada = eventoRecente('lotada', 60000);
    if (lotada) add('lotada', 'Sala lotada', 'Um cartão tentou entrar, mas a sala já está no limite.', lotada.ts);

    const temp = tempSala(st);
    if (st.temp == null) add('dht', 'Falha no DHT22', 'O sensor de temperatura e umidade não respondeu.');
    if (temp != null && temp > c.limiteTemp) add('calor', 'Sala quente',
      'Temperatura ' + (st.sim != null ? 'simulada ' : '') + 'de ' + ETI.ui.numero(temp, 1) + ' °C, acima do limite de ' +
      c.limiteTemp + ' °C.' + (st.ar ? ' O ar-condicionado está ligado.' : ''));

    if (st.umid != null && (st.umid < c.umidMin || st.umid > c.umidMax)) add('umidade',
      st.umid < c.umidMin ? 'Ar seco' : 'Ar úmido demais',
      'Umidade de ' + ETI.ui.numero(st.umid) + ' %, fora da faixa de ' + c.umidMin + ' a ' + c.umidMax + ' %.');

    if (st.agua == null) add('ds18b20', 'Sem leitura da água', 'O sensor DS18B20 do filtro não respondeu.');
    else if (st.agua < c.aguaMin || st.agua > c.aguaMax) add('agua',
      st.agua > c.aguaMax ? 'Água do filtro quente' : 'Água do filtro fria',
      'Água a ' + ETI.ui.numero(st.agua, 1) + ' °C, fora da faixa de ' + c.aguaMin + ' a ' + c.aguaMax + ' °C.');

    return ativos;
  }

  let ultimoAlertas = null;
  function recalcular() {
    const ativos = calcularAlertas();
    const chave = JSON.stringify(ativos);
    if (chave === ultimoAlertas) return;
    ultimoAlertas = chave;
    emitir('alertas', { ativos: ativos });
  }

  function presentes() {
    const evs = (valores.eventos || []).slice().reverse();
    let dentro = [];
    evs.forEach(function (e) {
      if (e.acao === 'entrada' && e.cartao) dentro.push({ cartao: e.cartao, desde: e.ts });
      else if (e.acao === 'saida') dentro = dentro.filter(function (p) { return p.cartao !== e.cartao; });
      else if (e.acao === 'zerado' || e.acao === 'inicio') dentro = [];
    });
    return dentro;
  }

  ETI.data = {
    db: db,
    raiz: raiz,
    agora: agora,
    sala: function () { return SALA; },

    onStatus: function (fn) { return inscrever('status', fn); },
    onEventos: function (fn) { return inscrever('eventos', fn); },
    onHistorico: function (fn) { return inscrever('historico', fn); },
    onConfig: function (fn) { return inscrever('config', fn); },
    onAlertas: function (fn) { return inscrever('alertas', fn); },
    onGateway: function (fn) { return inscrever('gateway', fn); },
    onAvisos: function (fn) { return inscrever('avisos', fn); },
    onConectadoFirebase: function (fn) { return inscrever('conectadoFirebase', fn); },

    presentes: presentes,
    tempSala: tempSala,
    comandosConfig: comandosConfig,

    ar: {
      ligar: function (sim) {
        return ETI.data.enviarComando('AR ' + (sim ? 1 : 0));
      },
      setSetpoint: function (graus) {
        graus = Math.max(16, Math.min(30, Math.round(graus)));
        ETI.data.setConfig({ arSetpoint: graus });
        return ETI.data.enviarComando('SETAR ' + graus);
      },
      setSimulada: function (ativa, valor) {
        valor = Math.round(Math.max(0, Math.min(50, Number(valor) || 0)) * 10) / 10;
        ETI.data.setConfig({ tempSimAtiva: !!ativa, tempSimValor: valor });
        return ETI.data.enviarComando(ativa ? 'SIM ' + valor : 'SIM OFF');
      }
    },

    online: function () {
      const st = valores.status;
      return !!(st && st.ts && agora() - st.ts <= SEM_LEITURA_MS);
    },

    nomeCartao: function (uid) {
      const c = valores.config || CONFIG_PADRAO;
      return (c.nomes && c.nomes[uid]) || ('Cartão ' + uid);
    },

    enviarComando: function (cmd) {
      return raiz.child('comandos').push({ cmd: String(cmd), ts: firebase.database.ServerValue.TIMESTAMP });
    },

    setConfig: function (parcial) {
      return raiz.child('config').update(parcial);
    },

    setNomeCartao: function (uid, nome) {
      const ref = raiz.child('config/nomes/' + uid);
      return nome ? ref.set(nome) : ref.remove();
    },

    limparEventos: function () { return raiz.child('eventos').remove(); },
    limparHistorico: function () { return raiz.child('historico').remove(); },

    // Apaga os dados de teste: eventos, gráfico, nomes dos cartões e bonecos do mapa.
    // As regras (limites, ar, simulada) ficam. Depois zera a contagem no Arduino.
    limparTudo: function () {
      return raiz.update({
        eventos: null,
        historico: null,
        comandos: null,
        mapa: null,
        'config/nomes': null
      }).then(function () { return ETI.data.enviarComando('ZERAR'); });
    },

    addAviso: function (a) {
      return db.ref('avisos').push({
        titulo: a.titulo, texto: a.texto, ativo: true,
        criadoEm: firebase.database.ServerValue.TIMESTAMP
      });
    },
    setAvisoAtivo: function (id, ativo) { return db.ref('avisos/' + id + '/ativo').set(!!ativo); },
    removerAviso: function (id) { return db.ref('avisos/' + id).remove(); },

    descreverEvento: function (e) {
      const quem = e.cartao ? ETI.data.nomeCartao(e.cartao) : '';
      switch (e.acao) {
        case 'porta_liberada': return quem + ' passou o cartão. Porta liberada, esperando movimento.';
        case 'entrada': return quem + ' entrou na sala.';
        case 'entrada_cancelada': return quem + ' passou o cartão, mas ninguém entrou.';
        case 'saida': return quem + ' saiu da sala.';
        case 'lotada': return quem + ' tentou entrar, mas a sala está lotada.';
        case 'intruso': return 'Movimento sem cartão com a sala vazia.';
        case 'inatividade': return 'Ninguém se mexeu no tempo limite. Lâmpada apagada.';
        case 'movimento_virtual': return 'Movimento enviado pelo site.';
        case 'zerado': return 'Contagem de pessoas zerada.';
        case 'lampada': {
          const motivos = { entrada: 'alguém entrou no escuro', movimento: 'voltou a ter movimento',
            sala_vazia: 'a sala ficou vazia', inatividade: 'ninguém se mexeu', manual: 'comando do site', zerar: 'contagem zerada' };
          return 'Lâmpada ' + (e.estado ? 'acesa' : 'apagada') + (motivos[e.motivo] ? ' (' + motivos[e.motivo] + ').' : '.');
        }
        case 'ar': {
          const motivos = { calor: 'sala acima do limite com gente se mexendo', sala_vazia: 'a sala ficou vazia',
            inatividade: 'ninguém se mexeu', manual: 'comando do site', zerar: 'contagem zerada' };
          return 'Ar-condicionado ' + (e.estado ? 'ligado' : 'desligado') + (motivos[e.motivo] ? ' (' + motivos[e.motivo] + ').' : '.');
        }
        case 'inicio': return 'Arduino ligado ou reiniciado.';
        default: return e.acao;
      }
    }
  };
})();
