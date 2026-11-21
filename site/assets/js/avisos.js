(function () {
  if (!ETI.ui.exigirSessao(true)) return;

  ETI.ui.montarTopo('avisos.html');

  ETI.data.onAvisos(function (avisos) {
    const ativos = avisos.filter(function (a) { return a.ativo; }).length;

    document.getElementById('contagem').textContent = ativos === 0
      ? 'Nada no ar'
      : ativos === 1 ? 'Um aviso no ar' : ativos + ' avisos no ar';

    document.getElementById('lista').innerHTML = avisos.length
      ? avisos.map(function (a) {
          return '<article class="aviso' + (a.ativo ? '' : ' fora') + '">' +
            '<h3>' + ETI.ui.escapar(a.titulo) + '</h3>' +
            '<p>' + ETI.ui.escapar(a.texto) + '</p>' +
            '<div class="meta">' +
            '<span>' + (a.ativo ? 'No ar' : 'Fora do ar') + ' · criado em ' + ETI.ui.dataHora(a.criadoEm) + '</span>' +
            '<button type="button" class="btn btn-link" data-alternar="' + ETI.ui.escapar(a.id) + '">' +
            '<i class="bi ' + (a.ativo ? 'bi-eye-slash' : 'bi-eye') + '" aria-hidden="true"></i>' +
            (a.ativo ? 'tirar do ar' : 'colocar no ar') + '</button>' +
            '<button type="button" class="btn btn-link" data-remover="' + ETI.ui.escapar(a.id) + '">' +
            '<i class="bi bi-trash" aria-hidden="true"></i>apagar</button>' +
            '</div></article>';
        }).join('')
      : '<p class="vazio">Nenhum aviso cadastrado. O painel vai mostrar só os indicadores da sala.</p>';

    document.querySelectorAll('[data-alternar]').forEach(function (b) {
      b.addEventListener('click', function () {
        const alvo = avisos.find(function (a) { return a.id === b.dataset.alternar; });
        ETI.data.setAvisoAtivo(b.dataset.alternar, !alvo.ativo);
      });
    });

    document.querySelectorAll('[data-remover]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (confirm('Apagar este aviso?')) ETI.data.removerAviso(b.dataset.remover);
      });
    });
  });

  document.getElementById('form-aviso').addEventListener('submit', function (e) {
    e.preventDefault();
    ETI.data.addAviso({
      titulo: document.getElementById('titulo').value.trim(),
      texto: document.getElementById('texto').value.trim()
    });
    this.reset();
    const ok = document.getElementById('publicado');
    ok.hidden = false;
    setTimeout(function () { ok.hidden = true; }, 2500);
  });
})();
