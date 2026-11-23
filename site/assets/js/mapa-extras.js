// Ferramentas do Arduino que não existem nas telas do ETI e ficam aqui no mapa:
// teste e manutenção, quem está na sala, nomes dos cartões, ajustes da placa,
// registro de eventos (com CSV) e as mensagens trocadas com a placa.
(function () {
  const el = function (id) { return document.getElementById(id); };

  let eventos = [];
  let historico = [];
  let config = null;
  let online = false;

  /* ---------- Teste e manutenção ---------- */

  function avisar(txt) {
    const p = el('extras-msg');
    p.textContent = txt;
    p.hidden = false;
    clearTimeout(avisar.timer);
    avisar.timer = setTimeout(function () { p.hidden = true; }, 3000);
  }

  el('btn-mov').addEventListener('click', function () {
    ETI.data.enviarComando('MOV');
    avisar('Movimento enviado para o Arduino.');
  });

  el('btn-zerar').addEventListener('click', function () {
    if (!confirm('Zerar a contagem de pessoas no Arduino?')) return;
    ETI.data.enviarComando('ZERAR');
    avisar('Contagem zerada.');
  });

  /* ---------- Quem está na sala ---------- */

  function desenharPresentes() {
    const lista = ETI.data.presentes();
    el('presentes').innerHTML = lista.length
      ? '<table class="table"><tbody>' + lista.map(function (p) {
          return '<tr><td>' + ETI.ui.escapar(ETI.data.nomeCartao(p.cartao)) + '</td>' +
            '<td class="n">desde ' + ETI.ui.hora(p.desde) + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<p class="legenda mt-0">Ninguém registrado pelo cartão.</p>';
  }

  /* ---------- Nomes dos cartões ---------- */

  function cartoesVistos() {
    const uids = new Set(Object.keys((config && config.nomes) || {}));
    eventos.forEach(function (e) { if (e.cartao) uids.add(String(e.cartao)); });
    return Array.from(uids).sort();
  }

  function desenharCartoes() {
    // Não redesenha enquanto alguém digita um nome (perderia o que foi escrito).
    if (el('cartoes').contains(document.activeElement)) return;
    const uids = cartoesVistos();
    el('cartoes').innerHTML = uids.length
      ? uids.map(function (uid) {
          const nome = (config && config.nomes && config.nomes[uid]) || '';
          return '<div class="d-flex gap-2 mb-2 align-items-center">' +
            '<code style="min-width: 7em">' + ETI.ui.escapar(uid) + '</code>' +
            '<input class="form-control form-control-sm" type="text" maxlength="30" placeholder="Nome da pessoa" ' +
            'data-uid="' + ETI.ui.escapar(uid) + '" value="' + ETI.ui.escapar(nome) + '"></div>';
        }).join('')
      : '<p class="legenda mt-0">Nenhum cartão lido ainda.</p>';
  }

  el('cartoes').addEventListener('change', function (e) {
    const uid = e.target.dataset.uid;
    if (uid) ETI.data.setNomeCartao(uid, e.target.value.trim());
  });

  /* ---------- Ajustes da placa ---------- */

  const campos = ['tempoInatividade', 'capacidade', 'umidMin', 'umidMax', 'equipMax'];

  function preencherAjustes() {
    if (!config || el('form-ajustes').contains(document.activeElement)) return;
    campos.forEach(function (c) { el('aj-' + c).value = config[c]; });
  }

  el('form-ajustes').addEventListener('submit', function (e) {
    e.preventDefault();
    const v = {};
    campos.forEach(function (c) { v[c] = Number(el('aj-' + c).value); });
    ETI.data.setConfig({
      tempoInatividade: Math.max(5, Math.round(v.tempoInatividade || 30)),
      capacidade: Math.max(1, Math.round(v.capacidade || 40)),
      umidMin: v.umidMin,
      umidMax: v.umidMax,
      equipMax: v.equipMax
    });
    el('ajustes-ok').hidden = false;
    setTimeout(function () { el('ajustes-ok').hidden = true; }, 2500);
  });

  /* ---------- Registro da sala ---------- */

  function desenharEventos() {
    el('registro').innerHTML = eventos.length
      ? '<div class="table-responsive registro-sala"><table class="table"><thead><tr>' +
        '<th>Quando</th><th>O que aconteceu</th><th class="n">Pessoas</th>' +
        '</tr></thead><tbody>' +
        eventos.map(function (e) {
          return '<tr><td style="white-space:nowrap">' + ETI.ui.dataHora(e.ts) + '</td>' +
            '<td>' + ETI.ui.escapar(ETI.data.descreverEvento(e)) + '</td>' +
            '<td class="n">' + (e.pessoas == null ? '' : e.pessoas) + '</td></tr>';
        }).join('') +
        '</tbody></table></div>'
      : '<p class="legenda mt-0">Nenhum evento ainda. Conecte o Arduino aqui no mapa.</p>';
  }

  el('btn-csv-eventos').addEventListener('click', function () {
    const linhas = [['data_hora', 'acao', 'cartao', 'nome', 'pessoas', 'descricao']];
    eventos.slice().reverse().forEach(function (e) {
      linhas.push([ETI.ui.dataHora(e.ts), e.acao, e.cartao || '',
        e.cartao ? ETI.data.nomeCartao(e.cartao) : '', e.pessoas == null ? '' : e.pessoas,
        ETI.data.descreverEvento(e)]);
    });
    ETI.ui.baixarCsv('eventos-sala.csv', linhas);
  });

  el('btn-csv-historico').addEventListener('click', function () {
    const linhas = [['data_hora', 'temperatura_c', 'umidade_pct', 'projetor_c', 'luz_0a1023', 'luz_lux', 'pessoas', 'potencia_w']];
    historico.forEach(function (p) {
      linhas.push([ETI.ui.dataHora(p.ts), p.temp, p.umid, p.equip, p.luz, ETI.data.lux(p.luz), p.pessoas,
        p.potencia == null ? '' : p.potencia]);
    });
    ETI.ui.baixarCsv('leituras-sala.csv', linhas);
  });

  el('btn-limpar-registro').addEventListener('click', function () {
    if (confirm('Apagar todos os eventos e leituras guardados? Não dá para desfazer.')) {
      ETI.data.limparEventos();
      ETI.data.limparHistorico();
    }
  });

  /* ---------- Mensagens com a placa ---------- */

  if (ETI.gateway && ETI.gateway.suportado) {
    ETI.gateway.onEstado(function (s) {
      el('bloco-mensagens').hidden = !s.conectado;
      el('mensagens').textContent = s.linhas.map(function (l) {
        return (l.dir === 'out' ? '→ ' : '← ') + l.txt;
      }).join('\n');
    });
  }

  function atualizarBotoes() {
    el('btn-mov').disabled = !online;
    el('btn-zerar').disabled = !online;
  }

  ETI.auth.onUsuario(function (u) {
    if (!u) return;
    ETI.data.onEventos(function (lista) {
      eventos = lista;
      desenharPresentes();
      desenharCartoes();
      desenharEventos();
    });
    ETI.data.onHistoricoArduino(function (h) { historico = h; });
    ETI.data.onConfig(function (c) {
      config = c;
      desenharCartoes();
      desenharPresentes();
      preencherAjustes();
    });
    setInterval(function () { online = ETI.data.online(); atualizarBotoes(); }, 1000);
  });
  atualizarBotoes();
})();
