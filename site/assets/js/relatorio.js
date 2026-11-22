(function () {
  if (!ETI.ui.exigirSessao(true)) return;

  ETI.ui.montarTopo('relatorio.html');

  let eventos = [];
  let historico = [];
  let config = null;

  const el = function (id) { return document.getElementById(id); };

  /* ---------- Relatório de consumo ---------- */

  const indicadores = [
    { nome: 'Temperatura (°C)', campo: 'temp', casas: 1 },
    { nome: 'Umidade relativa (%)', campo: 'umid', casas: 0 },
    { nome: 'Luminosidade (LDR, 0 a 1023)', campo: 'luz', casas: 0 },
    { nome: 'Temperatura do projetor (°C)', campo: 'equip', casas: 1 }
  ];

  function resumo(campo) {
    const v = historico.map(function (p) { return p[campo]; }).filter(function (x) { return typeof x === 'number'; });
    if (!v.length) return null;
    return {
      min: Math.min.apply(null, v),
      med: v.reduce(function (a, b) { return a + b; }, 0) / v.length,
      max: Math.max.apply(null, v)
    };
  }

  function kwh(eq) { return (eq.potencia * eq.qtd * eq.horas * config.diasLetivos) / 1000; }

  function pares(lista) {
    return lista.map(function (p) {
      return '<tr><td>' + p[0] + '</td><td class="n">' + p[1] + '</td></tr>';
    }).join('');
  }

  function desenharConsumo() {
    if (!config) return;
    const sala = ETI.data.sala();
    const tarifa = config.tarifa;
    const solar = config.solar;
    const equipamentos = config.equipamentos || [];

    el('identificacao').textContent =
      sala.nome + ', ' + sala.bloco + '. Emitido em ' + ETI.ui.dataExtenso() + '.';

    el('ambiente').innerHTML = indicadores.map(function (ind) {
      const r = resumo(ind.campo);
      if (!r) return '<tr><td>' + ind.nome + '</td><td class="n" colspan="3">sem leituras</td></tr>';
      return '<tr><td>' + ind.nome + '</td>' +
        '<td class="n">' + ETI.ui.numero(r.min, ind.casas) + '</td>' +
        '<td class="n">' + ETI.ui.numero(r.med, ind.casas) + '</td>' +
        '<td class="n">' + ETI.ui.numero(r.max, ind.casas) + '</td></tr>';
    }).join('');

    let totalKwh = 0;
    el('consumo').innerHTML = equipamentos.map(function (eq) {
      const c = kwh(eq);
      totalKwh += c;
      return '<tr><td>' + ETI.ui.escapar(eq.nome) + '</td>' +
        '<td class="n">' + eq.qtd + '</td>' +
        '<td class="n">' + ETI.ui.numero(eq.potencia) + '</td>' +
        '<td class="n">' + ETI.ui.numero(eq.horas, 1) + '</td>' +
        '<td class="n">' + ETI.ui.numero(c, 1) + '</td>' +
        '<td class="n">' + ETI.ui.moeda(c * tarifa) + '</td></tr>';
    }).join('');

    el('total-kwh').textContent = ETI.ui.numero(totalKwh, 1);
    el('total-custo').textContent = ETI.ui.moeda(totalKwh * tarifa);

    el('parametros').innerHTML = pares([
      ['Temperatura para ligar o ar e a ventilação', ETI.ui.numero(config.limiteTemp, 1) + ' °C'],
      ['Temperatura do ar-condicionado', config.arSetpoint + ' °C'],
      ['Luminosidade para acender a iluminação', 'abaixo de ' + config.limiteLuz + ' (LDR, 0 a 1023)'],
      ['Desligar sem movimento após', config.tempoInatividade + ' s'],
      ['Horário do desligamento programado', config.horarioEconomia],
      ['Capacidade da sala', config.capacidade + ' pessoas'],
      ['Tarifa considerada', ETI.ui.moeda(tarifa) + ' por kWh'],
      ['Dias letivos no mês', config.diasLetivos]
    ]);

    const coberto = Math.min(totalKwh, solar.geracaoMensal);
    const economiaSolar = coberto * tarifa;
    const prazo = economiaSolar > 0 ? ETI.ui.prazo(solar.custoInstalacao / economiaSolar) : null;

    el('viabilidade').innerHTML = pares([
      ['Custo estimado da instalação', ETI.ui.moeda(solar.custoInstalacao)],
      ['Geração mensal esperada', ETI.ui.numero(solar.geracaoMensal) + ' kWh'],
      ['Consumo coberto pela geração', ETI.ui.numero(totalKwh > 0 ? (coberto / totalKwh) * 100 : 0) + '%'],
      ['Economia mensal estimada', ETI.ui.moeda(economiaSolar)],
      ['Tempo de retorno', prazo || 'não calculável'],
      ['Saldo em ' + solar.vidaUtil + ' anos',
        ETI.ui.moeda(economiaSolar * 12 * solar.vidaUtil - solar.custoInstalacao)]
    ]);
  }

  el('btn-pdf').addEventListener('click', function () { window.print(); });

  el('btn-csv').addEventListener('click', function () {
    if (!config) return;
    const sala = ETI.data.sala();
    const tarifa = config.tarifa;
    const linhas = [];
    linhas.push(['ETI - Relatorio de consumo']);
    linhas.push([sala.nome + ', ' + sala.bloco]);
    linhas.push(['Emitido em', ETI.ui.dataExtenso()]);
    linhas.push([]);

    linhas.push(['Condicoes ambientais']);
    linhas.push(['Indicador', 'Minima', 'Media', 'Maxima']);
    indicadores.forEach(function (ind) {
      const r = resumo(ind.campo);
      if (r) linhas.push([ind.nome, r.min.toFixed(ind.casas), r.med.toFixed(ind.casas), r.max.toFixed(ind.casas)]);
    });
    linhas.push([]);

    linhas.push(['Consumo por equipamento']);
    linhas.push(['Equipamento', 'Quantidade', 'Watts', 'Horas por dia', 'kWh por mes', 'Custo por mes']);
    let totalKwh = 0;
    (config.equipamentos || []).forEach(function (eq) {
      const c = kwh(eq);
      totalKwh += c;
      linhas.push([eq.nome, eq.qtd, eq.potencia, eq.horas, c.toFixed(2), (c * tarifa).toFixed(2)]);
    });
    linhas.push(['Total', '', '', '', totalKwh.toFixed(2), (totalKwh * tarifa).toFixed(2)]);
    linhas.push([]);

    linhas.push(['Leituras registradas']);
    linhas.push(['Data e hora', 'Temperatura', 'Umidade', 'Luminosidade', 'Projetor', 'Pessoas', 'Potencia']);
    historico.forEach(function (p) {
      linhas.push([ETI.ui.dataHora(p.ts), p.temp, p.umid, p.luz, p.equip, p.pessoas, p.potencia == null ? '' : p.potencia]);
    });

    ETI.ui.baixarCsv('eti-relatorio.csv', linhas);
  });

  /* ---------- Registro de eventos ---------- */

  function desenhar() {
    document.getElementById('eventos').innerHTML = eventos.length
      ? '<div class="table-responsive"><table class="table"><thead><tr>' +
        '<th>Quando</th><th>O que aconteceu</th><th class="n">Pessoas</th>' +
        '</tr></thead><tbody>' +
        eventos.map(function (e) {
          return '<tr><td style="white-space:nowrap">' + ETI.ui.dataHora(e.ts) + '</td>' +
            '<td>' + ETI.ui.escapar(ETI.data.descreverEvento(e)) + '</td>' +
            '<td class="n">' + (e.pessoas == null ? '' : e.pessoas) + '</td></tr>';
        }).join('') +
        '</tbody></table></div>'
      : '<p class="vazio" style="padding:0">Nenhum evento ainda. Conecte o Arduino no dashboard.</p>';
  }

  ETI.data.onEventos(function (e) { eventos = e; desenhar(); });
  ETI.data.onConfig(function (c) { config = c; desenhar(); desenharConsumo(); });
  ETI.data.onHistorico(function (h) { historico = h; desenharConsumo(); });

  document.getElementById('btn-csv-eventos').addEventListener('click', function () {
    const linhas = [['data_hora', 'acao', 'cartao', 'nome', 'pessoas', 'descricao']];
    eventos.slice().reverse().forEach(function (e) {
      linhas.push([ETI.ui.dataHora(e.ts), e.acao, e.cartao || '',
        e.cartao ? ETI.data.nomeCartao(e.cartao) : '', e.pessoas == null ? '' : e.pessoas,
        ETI.data.descreverEvento(e)]);
    });
    ETI.ui.baixarCsv('eventos-sala.csv', linhas);
  });

  document.getElementById('btn-csv-historico').addEventListener('click', function () {
    const linhas = [['data_hora', 'temperatura_c', 'umidade_pct', 'projetor_c', 'luz_0a1023', 'pessoas', 'potencia_w']];
    historico.forEach(function (p) {
      linhas.push([ETI.ui.dataHora(p.ts), p.temp, p.umid, p.equip, p.luz, p.pessoas, p.potencia == null ? '' : p.potencia]);
    });
    ETI.ui.baixarCsv('leituras-sala.csv', linhas);
  });

  document.getElementById('btn-limpar').addEventListener('click', function () {
    if (confirm('Apagar todos os eventos e leituras guardados? Não dá para desfazer.')) {
      ETI.data.limparEventos();
      ETI.data.limparHistorico();
    }
  });
})();
