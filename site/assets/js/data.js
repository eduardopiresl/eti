window.ETI = window.ETI || {};

(function () {
  firebase.initializeApp(window.FIREBASE_CONFIG);
  const db = firebase.database();
  const raiz = db.ref('sala');

  const DURACAO_OVERRIDE = 3 * 3600000; // "marcar ocupada/vazia" vale por 3 horas

  const CONFIG_PADRAO = {
    salaNome: 'Sala 12',
    salaBloco: 'Bloco B',
    capacidade: 40,
    limiteTemp: 28,
    limiteLuz: 700,           // LDR (0 a 1023): abaixo disso está escuro e a luz pode ligar
    horarioEconomia: '23:00', // desligamento programado
    tarifa: 0.92,
    diasLetivos: 22,
    grade: [
      { dia: 1, inicio: '19:00', fim: '22:30' },
      { dia: 2, inicio: '19:00', fim: '22:30' },
      { dia: 3, inicio: '19:00', fim: '22:30' },
      { dia: 4, inicio: '19:00', fim: '22:30' },
      { dia: 5, inicio: '19:00', fim: '22:30' }
    ],
    // Escolhas do usuário
    modoManual: false,        // equipamentos mexidos à mão: automações suspensas
    economiaForcada: false,   // botão "Ativar modo economia"
    ocupacaoManual: null,     // null = segue a grade e o cartão; true/false = marcada à mão
    ocupacaoManualAte: null,  // quando a marcação manual expira
    equipamentos: [
      { id: 'iluminacao', nome: 'Iluminação', detalhe: '8 lâmpadas LED (LED na maquete)', potencia: 18, qtd: 8, horas: 5 },
      { id: 'ventilacao', nome: 'Ventilação', detalhe: '2 ventiladores de teto', potencia: 120, qtd: 2, horas: 4 },
      { id: 'projetor', nome: 'Projetor', detalhe: 'Projetor multimídia', potencia: 280, qtd: 1, horas: 3 },
      { id: 'ar', nome: 'Ar-condicionado', detalhe: 'Split 12.000 BTU (ventoinha na maquete)', potencia: 1100, qtd: 1, horas: 4 },
      { id: 'computadores', nome: 'Computadores', detalhe: 'Estações de aluno', potencia: 150, qtd: 10, horas: 4 }
    ],
    solar: { custoInstalacao: 28000, geracaoMensal: 420, vidaUtil: 25 },
    umidMin: 40,
    umidMax: 75,
    equipMax: 40,
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
    db.ref('perfis/' + usuario.uid).once('value')
      .then(function (s) { emitir('perfil', s.val() === 'professor' ? 'professor' : 'gestor'); })
      .catch(function () { emitir('perfil', 'gestor'); });
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
      const c = Object.assign(JSON.parse(JSON.stringify(CONFIG_PADRAO)), s.val() || {});
      c.nomes = c.nomes || {};
      c.solar = Object.assign({}, CONFIG_PADRAO.solar, c.solar || {});
      c.grade = Array.isArray(c.grade) ? c.grade.filter(Boolean) : CONFIG_PADRAO.grade;
      c.equipamentos = Array.isArray(c.equipamentos) ? c.equipamentos.filter(Boolean) : [];
      if (c.ocupacaoManual === undefined) c.ocupacaoManual = null;
      emitir('config', c);
      recalcular();
    });

    raiz.child('gateway').on('value', function (s) { emitir('gateway', s.val()); });

    raiz.child('estado').on('value', function (s) { emitir('estado', s.val() || {}); recalcular(); });

    raiz.child('alertasRegistro').orderByChild('ts').limitToLast(30).on('value', function (s) {
      emitir('registroAlertas', lista(s).reverse());
    });

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
    onUsuario: function (fn) { return inscrever('usuario', fn); },
    onPerfil: function (fn) { return inscrever('perfil', fn); }
  };

  function tempSala(st) {
    if (!st) return null;
    return st.sim != null ? st.sim : st.temp;
  }

  function comandosConfig(c) {
    return [
      'LUZMIN ' + c.limiteLuz,
      'TEMPO ' + c.tempoInatividade,
      'LIMITE ' + c.limiteTemp,
      'SETAR ' + c.arSetpoint,
      c.tempSimAtiva ? 'SIM ' + c.tempSimValor : 'SIM OFF'
    ];
  }

  /* ---------- Ocupação, modo economia e potência ---------- */

  function cfg() { return valores.config || CONFIG_PADRAO; }

  function minutos(hhmm) {
    const p = String(hhmm || '00:00').split(':');
    return (+p[0] || 0) * 60 + (+p[1] || 0);
  }

  function minutoAgora() {
    const d = new Date(agora());
    return d.getHours() * 60 + d.getMinutes();
  }

  function overrideAtivo() {
    const c = cfg();
    if (c.ocupacaoManual === null || c.ocupacaoManual === undefined) return false;
    return !c.ocupacaoManualAte || agora() < c.ocupacaoManualAte;
  }

  function ocupadaPelaGrade() {
    const dia = new Date(agora()).getDay();
    const min = minutoAgora();
    return (cfg().grade || []).some(function (f) {
      return f.dia === dia && min >= minutos(f.inicio) && min < minutos(f.fim);
    });
  }

  // Com o Arduino: tem gente que entrou pelo cartão = ocupada. Sem ninguém, vale o horário de aulas.
  function temGenteNoCartao() {
    const st = valores.status;
    return !!(st && ETI.data.online() && st.pessoas > 0);
  }

  function ocupada() {
    if (overrideAtivo()) return !!cfg().ocupacaoManual;
    return temGenteNoCartao() || ocupadaPelaGrade();
  }

  function motivoEconomia() {
    const c = cfg();
    if (c.economiaForcada) return 'forcada';
    // Alguém marcou a sala como ocupada: vale mais que o horário programado.
    if (overrideAtivo() && c.ocupacaoManual === true) return null;
    if (!ocupada()) return 'vazia';
    if (minutoAgora() >= minutos(c.horarioEconomia)) return 'horario';
    return null;
  }

  // Lâmpada e ar são de verdade (vêm do Arduino); os outros ficam guardados no Firebase.
  function ligado(id) {
    const st = valores.status || {};
    if (id === 'iluminacao') return !!st.lampada;
    if (id === 'ar') return !!st.ar;
    return !!(valores.estado || {})[id];
  }

  function potenciaAtual() {
    return (cfg().equipamentos || []).reduce(function (s, eq) {
      return ligado(eq.id) ? s + eq.potencia * eq.qtd : s;
    }, 0);
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

  // Cada regra com histerese tem uma condição para disparar e outra (mais folgada) para continuar
  // ativa. Isso evita o alerta piscar quando o valor fica oscilando em cima do limite.
  let alertasAntes = {};

  function calcularAlertas() {
    const st = valores.status;
    const c = cfg();
    const ativos = [];
    function add(id, titulo, texto, desde) {
      ativos.push({ id: id, titulo: titulo, texto: texto,
        desde: desde || (alertasAntes[id] && alertasAntes[id].desde) || agora() });
    }
    function regra(id, disparar, manter, titulo, texto) {
      if (alertasAntes[id] ? manter : disparar) add(id, titulo, texto);
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
    const temGente = ocupada();
    const cap = c.capacidade || 0;
    const pessoas = st.pessoas || 0;
    if (st.temp == null) add('dht', 'Falha no DHT22', 'O sensor de temperatura e umidade não respondeu.');
    if (temp != null) {
      regra('calor', temGente && temp > c.limiteTemp, temGente && temp > c.limiteTemp - 0.5, 'Sala muito quente',
        'Temperatura ' + (st.sim != null ? 'simulada ' : '') + 'de ' + ETI.ui.numero(temp, 1) + ' °C, acima do limite de ' +
        ETI.ui.numero(c.limiteTemp, 1) + ' °C. ' +
        (st.ar ? 'O ar-condicionado já está ligado.' : (ligado('ventilacao') ? 'A ventilação já está ligada; se não baixar, ligue a climatização.' : 'Ligue a climatização.')));
      regra('frio', temGente && temp < 18, temGente && temp < 19, 'Sala fria',
        ETI.ui.numero(temp, 1) + ' °C. Desligue a ventilação e feche as janelas.');
    }
    if (st.umid != null) {
      regra('umidade-alta', temGente && st.umid > c.umidMax, temGente && st.umid > c.umidMax - 5, 'Umidade alta',
        'Umidade em ' + ETI.ui.numero(st.umid) + '%. Ventile a sala.');
      regra('umidade-baixa', temGente && st.umid < c.umidMin, temGente && st.umid < c.umidMin + 5, 'Ar seco',
        'Umidade em ' + ETI.ui.numero(st.umid) + '%. Recomenda-se umidificar o ambiente e beber água.');
    }
    if (st.luz != null) {
      regra('pouca-luz', temGente && st.luz < c.limiteLuz && !st.lampada, temGente && st.luz < c.limiteLuz + 50 && !st.lampada,
        'Pouca luz', 'Luminosidade em ' + st.luz + ' (de 0 a 1023), abaixo do mínimo de ' + c.limiteLuz + '. Ligue a iluminação.');
    }
    regra('lotacao', cap > 0 && pessoas > cap, cap > 0 && pessoas > cap, 'Sala acima da capacidade',
      pessoas + ' pessoas para ' + cap + ' lugares. Remaneje alunos para outra sala.');
    regra('quase-lotada', cap > 0 && pessoas >= Math.ceil(cap * 0.9) && pessoas <= cap,
      cap > 0 && pessoas >= Math.ceil(cap * 0.85) && pessoas <= cap, 'Sala quase lotada',
      pessoas + ' de ' + cap + ' lugares ocupados.');

    if (st.equip == null) add('ds18b20', 'Sem leitura do projetor', 'O sensor DS18B20 do projetor não respondeu.');
    else if (st.equip > c.equipMax) add('equip', 'Projetor superaquecendo',
      'Projetor a ' + ETI.ui.numero(st.equip, 1) + ' °C, acima do limite de ' + c.equipMax + ' °C. Verifique a ventilação ou desligue o aparelho.');

    return ativos;
  }

  let ultimoAlertas = null;
  let primeiroCalculo = true;
  function recalcular() {
    const ativos = calcularAlertas();
    const novos = {};
    ativos.forEach(function (a) { novos[a.id] = a; });

    // Só o computador que está com o Arduino grava o histórico de alertas (para não repetir).
    const ponte = ETI.gateway && ETI.gateway.estado && ETI.gateway.estado().conectado;
    if (ponte && !primeiroCalculo) {
      ativos.forEach(function (a) {
        if (alertasAntes[a.id] || a.id === 'offline') return;
        raiz.child('alertasRegistro').push({ tipo: a.id, titulo: a.titulo, texto: a.texto, ts: firebase.database.ServerValue.TIMESTAMP });
      });
    }
    if (valores.status !== undefined && valores.config !== undefined) primeiroCalculo = false;
    alertasAntes = novos;

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
    sala: function () {
      const c = cfg();
      return { nome: c.salaNome, bloco: c.salaBloco, capacidade: c.capacidade };
    },
    ocupada: ocupada,
    // { ocupada, manual, ate, pelaGrade, pelaPresenca } — de onde vem a ocupação atual
    ocupacao: function () {
      const manual = overrideAtivo();
      return { ocupada: ocupada(), manual: manual, ate: manual ? cfg().ocupacaoManualAte : null,
        pelaGrade: ocupadaPelaGrade(), pelaPresenca: temGenteNoCartao() };
    },
    // { ativo, motivo } — motivo: 'forcada' | 'horario' | 'vazia' | null
    economia: function () {
      const m = motivoEconomia();
      return { ativo: m !== null, motivo: m };
    },
    ligado: ligado,
    potencia: potenciaAtual,
    controlaveis: ['iluminacao', 'ar', 'ventilacao', 'projetor'],
    onEstado: function (fn) { return inscrever('estado', fn); },
    onRegistroAlertas: function (fn) { return inscrever('registroAlertas', fn); },

    // Ligar ou desligar à mão suspende as automações até "Retomar automações".
    setEstado: function (id, ligar) {
      ETI.data.setConfig({ modoManual: true });
      if (id === 'iluminacao') return ETI.data.enviarComando('LUZ ' + (ligar ? 1 : 0));
      if (id === 'ar') return ETI.data.enviarComando('AR ' + (ligar ? 1 : 0));
      return raiz.child('estado/' + id).set(!!ligar);
    },
    // true = ocupada, false = vazia, null = volta a seguir a grade e o cartão
    setOcupacao: function (valor) {
      if (valor === null) return ETI.data.setConfig({ ocupacaoManual: null, ocupacaoManualAte: null });
      return ETI.data.setConfig({ ocupacaoManual: !!valor, ocupacaoManualAte: agora() + DURACAO_OVERRIDE });
    },
    forcarEconomia: function () { return ETI.data.setConfig({ economiaForcada: true }); },
    desativarEconomia: function () { return ETI.data.setConfig({ economiaForcada: false }); },
    // Desfaz tudo que foi feito à mão: economia forçada, equipamentos e ocupação.
    retomarAutomatico: function () {
      return ETI.data.setConfig({ modoManual: false, economiaForcada: false, ocupacaoManual: null, ocupacaoManualAte: null });
    },
    equipamentos: function () { return JSON.parse(JSON.stringify(cfg().equipamentos || [])); },
    setEquipamentos: function (lista) { return ETI.data.setConfig({ equipamentos: lista }); },
    solar: function () { return Object.assign({}, cfg().solar); },
    setSolar: function (s) { return ETI.data.setConfig({ solar: s }); },
    limparRegistroAlertas: function () { return raiz.child('alertasRegistro').remove(); },

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
        estado: null,
        alertasRegistro: null,
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
            sala_vazia: 'a sala ficou vazia', inatividade: 'ninguém se mexeu', manual: 'comando do site', zerar: 'contagem zerada',
            fixa: 'luz fixa ligada no site' };
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
