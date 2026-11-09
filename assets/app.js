/* ══════════════════════════════════════════════════════════════
   HealthPlus Web — comportamento da página

     1. a abertura animada
     2. a revelação dos blocos ao rolar
     3. os contadores que sobem
     4. a calculadora de z-score, que é o coração da página
     5. os cartões da equipe

   A calculadora NÃO é maquete: usa as mesmas curvas da OMS que o
   aplicativo usa (assets/oms-imc.js, gerado dos JSON oficiais) e
   repete a matemática de app/utilitarios/oms/calculoLms.js.
   Acima de 19 anos não existe curva da OMS, e aí ela cai na
   classificação de IMC para adultos — exatamente como o app faz.
   Nada do que o visitante digita sai do navegador dele.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var $ = function (s, e) { return (e || document).querySelector(s); };
  var $$ = function (s, e) { return Array.prototype.slice.call((e || document).querySelectorAll(s)); };
  var menosMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Numa tela alta, a faixa de indicadores já está visível quando a
     página carrega. Sem esta espera os contadores correm ATRÁS da
     tela de abertura, e quando ela sai os números já estão no fim —
     parece que a animação nem existe. Mesma coisa para os blocos
     que entram ao rolar. */
  var aberturaPronta = new Promise(function (pronto) {
    if (!document.getElementById('abertura')) return pronto();
    document.addEventListener('abertura-saiu', function () { pronto(); }, { once: true });
    setTimeout(pronto, 3800);                 // rede de segurança
  });

  /* ═══════════════════════════════════════════════════════════
     1. ABERTURA
     Sai sozinha quando a animação acaba, ou no máximo em 3,2 s —
     para nunca prender ninguém na tela.
     ═══════════════════════════════════════════════════════════ */

  (function abertura() {
    var tela = $('#abertura');
    if (!tela) return;

    document.body.classList.add('travado');
    var jaSaiu = false;

    function sair() {
      if (jaSaiu) return;
      jaSaiu = true;
      tela.classList.add('saiu');
      document.body.classList.remove('travado');
      document.dispatchEvent(new CustomEvent('abertura-saiu'));
      setTimeout(function () { if (tela.parentNode) tela.parentNode.removeChild(tela); }, 900);
    }

    setTimeout(sair, menosMovimento ? 150 : 2300);
    setTimeout(sair, 3200);                       // rede de segurança
    tela.addEventListener('click', sair);         // dá para pular
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') sair();
    });
  })();

  /* ═══════════════════════════════════════════════════════════
     2. REVELAÇÃO AO ROLAR
     ═══════════════════════════════════════════════════════════ */

  (function revelar() {
    var alvos = $$('.reveal');
    if (!alvos.length) return;

    if (menosMovimento || !('IntersectionObserver' in window)) {
      alvos.forEach(function (e) { e.classList.add('visivel'); });
      return;
    }

    aberturaPronta.then(function () {
      var observador = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (ent) {
          if (!ent.isIntersecting) return;
          ent.target.classList.add('visivel');
          observador.unobserve(ent.target);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

      alvos.forEach(function (e) { observador.observe(e); });
    });
  })();

  /* ═══════════════════════════════════════════════════════════
     3. TOPO E CONTADORES
     ═══════════════════════════════════════════════════════════ */

  (function topo() {
    var barra = $('.topo');
    if (!barra) return;
    var aoRolar = function () { barra.classList.toggle('rolou', window.scrollY > 8); };
    aoRolar();
    window.addEventListener('scroll', aoRolar, { passive: true });
  })();

  (function contadores() {
    var nums = $$('[data-ate]');
    if (!nums.length) return;

    function formata(v, casas) {
      return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
    }

    function anima(el) {
      var ate = parseFloat(el.dataset.ate);
      var casas = parseInt(el.dataset.casas || '0', 10);
      var sufixo = el.dataset.sufixo || '';
      var prefixo = el.dataset.prefixo || '';

      if (menosMovimento) { el.textContent = prefixo + formata(ate, casas) + sufixo; return; }

      var dur = 1100, t0 = null;
      function passo(t) {
        if (t0 === null) t0 = t;
        var p = Math.min((t - t0) / dur, 1);
        var suave = 1 - Math.pow(1 - p, 3);
        el.textContent = prefixo + formata(ate * suave, casas) + sufixo;
        if (p < 1) requestAnimationFrame(passo);
      }
      requestAnimationFrame(passo);
    }

    if (!('IntersectionObserver' in window)) { nums.forEach(anima); return; }

    aberturaPronta.then(function () {
      var obs = new IntersectionObserver(function (ents) {
        ents.forEach(function (e) {
          if (!e.isIntersecting) return;
          anima(e.target);
          obs.unobserve(e.target);
        });
      }, { threshold: 0.5 });
      nums.forEach(function (e) { obs.observe(e); });
    });
  })();

  /* ═══════════════════════════════════════════════════════════
     4. A MATEMÁTICA DA OMS
     Espelha app/utilitarios/oms/calculoLms.js. Se mudar lá,
     mude aqui — ou a página passa a discordar do aplicativo.
     ═══════════════════════════════════════════════════════════ */

  function paraObjeto(p) { return { L: p[1], M: p[2], S: p[3] }; }

  // L, M e S na idade pedida, interpolados linearmente entre os dois
  // pontos vizinhos da tabela — é assim que a OMS monta as mensais.
  function lmsNaIdade(pontos, meses) {
    if (meses <= pontos[0][0]) return paraObjeto(pontos[0]);
    var ultimo = pontos[pontos.length - 1];
    if (meses >= ultimo[0]) return paraObjeto(ultimo);

    for (var i = 0; i < pontos.length - 1; i++) {
      var a = pontos[i], b = pontos[i + 1];
      if (meses >= a[0] && meses <= b[0]) {
        var f = (b[0] === a[0]) ? 0 : (meses - a[0]) / (b[0] - a[0]);
        return {
          L: a[1] + f * (b[1] - a[1]),
          M: a[2] + f * (b[2] - a[2]),
          S: a[3] + f * (b[3] - a[3])
        };
      }
    }
    return null;
  }

  //   z = ((X/M)^L - 1) / (L*S)     quando L != 0
  //   z = ln(X/M) / S               quando L == 0
  function zScore(x, lms) {
    if (Math.abs(lms.L) < 1e-9) return Math.log(x / lms.M) / lms.S;
    return (Math.pow(x / lms.M, lms.L) - 1) / (lms.L * lms.S);
  }

  // A fórmula invertida: a medida que corresponde a um z-score.
  function medidaNoZ(z, lms) {
    if (Math.abs(lms.L) < 1e-9) return lms.M * Math.exp(lms.S * z);
    return lms.M * Math.pow(1 + lms.L * lms.S * z, 1 / lms.L);
  }

  // Fora de ±3 a distribuição LMS para de descrever bem a cauda. A OMS
  // mede, dali para fora, em "larguras do último desvio". O IMC por
  // idade é um dos indicadores em que esse ajuste se aplica.
  function zAjustado(x, lms) {
    var z = zScore(x, lms);
    if (z > 3) {
      var sd3p = medidaNoZ(3, lms);
      return 3 + (x - sd3p) / (sd3p - medidaNoZ(2, lms));
    }
    if (z < -3) {
      var sd3n = medidaNoZ(-3, lms);
      return -3 + (x - sd3n) / (medidaNoZ(-2, lms) - sd3n);
    }
    return z;
  }

  // Normal acumulada, aproximação de Abramowitz & Stegun — a mesma do app.
  function percentil(z) {
    var t = 1 / (1 + 0.2316419 * Math.abs(z));
    var d = 0.3989423 * Math.exp((-z * z) / 2);
    var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return (z > 0 ? 1 - p : p) * 100;
  }

  // Pontos de corte da OMS para IMC por idade. Até 5 anos existe
  // "risco de sobrepeso" entre +1 e +2; de 5 a 19 não existe.
  function classificarCrianca(z, meses) {
    var faixas = meses <= 60
      ? [[-3, 'Magreza acentuada', 'risco'], [-2, 'Magreza', 'atencao'], [1, 'Eutrofia', 'adequado'],
         [2, 'Risco de sobrepeso', 'atencao'], [3, 'Sobrepeso', 'atencao'], [Infinity, 'Obesidade', 'risco']]
      : [[-3, 'Magreza acentuada', 'risco'], [-2, 'Magreza', 'atencao'], [1, 'Eutrofia', 'adequado'],
         [2, 'Sobrepeso', 'atencao'], [3, 'Obesidade', 'risco'], [Infinity, 'Obesidade grave', 'risco']];
    for (var i = 0; i < faixas.length; i++) if (z < faixas[i][0]) return { nome: faixas[i][1], tom: faixas[i][2] };
    return { nome: '—', tom: 'vazio' };
  }

  // Acima de 19 anos a OMS não publica curva de crescimento: entra a
  // tabela de IMC para adultos. É a mesma de faixasOms.js, que cita
  // WHO, Obesity: preventing and managing the global epidemic (2000).
  function classificarAdulto(imc) {
    var faixas = [
      [16, 'Magreza grave', 'risco'], [17, 'Magreza moderada', 'atencao'],
      [18.5, 'Magreza leve', 'atencao'], [25, 'Eutrofia', 'adequado'],
      [30, 'Sobrepeso', 'atencao'], [35, 'Obesidade grau I', 'risco'],
      [40, 'Obesidade grau II', 'risco'], [Infinity, 'Obesidade grau III', 'risco']
    ];
    for (var i = 0; i < faixas.length; i++) if (imc < faixas[i][0]) return { nome: faixas[i][1], tom: faixas[i][2] };
    return { nome: '—', tom: 'vazio' };
  }

  /* ═══════════════════════════════════════════════════════════
     5. A CALCULADORA
     ═══════════════════════════════════════════════════════════ */

  (function calculadora() {
    var raiz = $('#demo');
    if (!raiz || !window.OMS_IMC) return;

    var sexo = 'meninos';
    var anos = $('#anos'), meses = $('#meses'), peso = $('#peso'), altura = $('#altura');
    var vImc = $('#v-imc'), vZ = $('#v-z'), vP = $('#v-p');
    var selo = $('#v-classe'), nota = $('#v-nota');
    var prog = $('#progresso'), progBarra = $('#prog-barra'), progTexto = $('#prog-texto');

    $$('.alternador button', raiz).forEach(function (b) {
      b.addEventListener('click', function () {
        sexo = b.dataset.sexo;
        $$('.alternador button', raiz).forEach(function (o) {
          o.setAttribute('aria-pressed', String(o === b));
        });
        recalcular();
      });
    });
    [anos, meses, peso, altura].forEach(function (c) {
      if (c) c.addEventListener('input', recalcular);
    });

    // [ZEIGARNIK] + [GRADIENTE DE META]
    // Quatro medidas: sexo (já escolhido), idade, peso e altura.
    // Enquanto falta uma, a barra fica curta e o contador mostra o
    // buraco. Quando fecha, vira coral, a cor do resultado.
    function atualizarProgresso() {
      if (!prog) return;
      var feitas = 1;
      if (isFinite(parseFloat(anos.value))) feitas++;
      if (parseFloat(peso.value) > 0) feitas++;
      if (parseFloat(altura.value) > 0) feitas++;

      progBarra.style.transform = 'scaleX(' + (feitas / 4) + ')';
      progTexto.textContent = feitas + '/4 medidas';
      prog.classList.toggle('completo', feitas === 4);
    }

    function vazio(motivo, explicacao) {
      vImc.textContent = '—'; vZ.textContent = '—'; vP.textContent = '—';
      selo.className = 'selo-classe vazio';
      selo.textContent = motivo;
      if (nota) nota.textContent = explicacao || 'A referência usada aparece aqui depois do cálculo.';
    }

    function recalcular() {
      atualizarProgresso();

      var a = parseFloat(anos.value), mm = parseFloat(meses.value || '0');
      var p = parseFloat(peso.value), h = parseFloat(altura.value);

      if (!isFinite(a) || !isFinite(p) || !isFinite(h) || p <= 0 || h <= 0) {
        return vazio('Preencha os campos');
      }
      if (a < 0 || a > 120) return vazio('Idade fora do possível');

      var imc = p / Math.pow(h / 100, 2);
      if (!isFinite(imc) || imc <= 0) return vazio('Medidas improváveis');

      vImc.textContent = imc.toFixed(1).replace('.', ',');

      var total = a * 12 + (isFinite(mm) ? mm : 0);

      // ── 20 anos ou mais: não há curva de crescimento ──
      if (total > 228) {
        var adulto = classificarAdulto(imc);
        vZ.textContent = '—';
        vP.textContent = '—';
        selo.className = 'selo-classe ' + adulto.tom;
        selo.textContent = adulto.nome;
        if (nota) nota.textContent =
          'A OMS só publica curva de crescimento até 19 anos, então aqui não ' +
          'existe z-score nem percentil: a classificação vem da tabela de IMC ' +
          'para adultos (WHO, 2000). É o mesmo caminho que o aplicativo segue.';
        return;
      }

      // ── de 0 a 19 anos: curva da OMS ──
      var lms = lmsNaIdade(window.OMS_IMC[sexo], total);
      if (!lms) return vazio('Sem curva para esta idade');

      var z = Math.round(zAjustado(imc, lms) * 100) / 100;   // a OMS publica com 2 casas
      var pc = percentil(z);
      var cls = classificarCrianca(z, total);

      vZ.textContent = (z > 0 ? '+' : '') + z.toFixed(2).replace('.', ',');
      vP.textContent = (pc < 0.1 ? '<0,1' : pc > 99.9 ? '>99,9' : pc.toFixed(1).replace('.', ',')) + '%';
      selo.className = 'selo-classe ' + cls.tom;
      selo.textContent = cls.nome;

      if (nota) nota.textContent =
        'Referência: ' +
        (total <= 60 ? 'WHO Child Growth Standards 2006 (0 a 5 anos)'
                     : 'WHO Growth Reference 2007 (5 a 19 anos)') +
        ' · IMC por idade · ' + (sexo === 'meninos' ? 'masculino' : 'feminino') + '.';
    }

    recalcular();
  })();

  /* ═══════════════════════════════════════════════════════════
     6. CARDS DA EQUIPE
     No computador o painel abre no :hover do botão, só com CSS. No
     celular não existe hover: sem isto, o cartão nunca abriria. O
     botão também responde a teclado, porque é um <button>.
     ═══════════════════════════════════════════════════════════ */

  (function cardsEquipe() {
    var cards = $$('.pessoa');
    if (!cards.length) return;

    function fecharTodos() {
      cards.forEach(function (o) {
        o.classList.remove('aberta', 'aberta-contrib');
        $$('.pessoa__clip, .pessoa__contrib', o).forEach(function (b) {
          b.setAttribute('aria-expanded', 'false');
        });
      });
    }

    // O painel das contribuições cresce a partir do botão que o abre.
    // A altura do cartão muda conforme o nome quebra em uma ou duas
    // linhas, então o centro do botão é medido, não chutado.
    function marcarOrigem() {
      cards.forEach(function (card) {
        var b = $('.pessoa__contrib', card);
        if (!b) return;
        var rc = card.getBoundingClientRect(), rb = b.getBoundingClientRect();
        card.style.setProperty('--cx', Math.round(rb.left - rc.left + rb.width / 2) + 'px');
        card.style.setProperty('--cy', Math.round(rb.top - rc.top + rb.height / 2) + 'px');
      });
    }
    marcarOrigem();
    window.addEventListener('resize', marcarOrigem, { passive: true });

    cards.forEach(function (card) {
      [['.pessoa__clip', 'aberta'], ['.pessoa__contrib', 'aberta-contrib']].forEach(function (par) {
        var botao = $(par[0], card), classe = par[1];
        if (!botao) return;

        botao.addEventListener('click', function (e) {
          e.preventDefault();
          var abrindo = !card.classList.contains(classe);
          fecharTodos();                     // um painel aberto por vez
          card.classList.toggle(classe, abrindo);
          botao.setAttribute('aria-expanded', String(abrindo));
        });
      });
    });

    // Clicar em QUALQUER lugar fora do cartão que está aberto fecha —
    // inclusive em cima de outro cartão. Antes eu checava `.pessoa`, e
    // isso fazia o toque num cartão vizinho não fechar o primeiro.
    // Só o conteúdo do cartão aberto é poupado, para o dedo poder
    // chegar nos links das redes.
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.pessoa.aberta, .pessoa.aberta-contrib')) return;
      fecharTodos();
    });

    // Esc também fecha, para quem está no teclado
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') fecharTodos();
    });

    /* ── modal com a lista completa ──
       O cartão mostra as três primeiras contribuições; o resto já
       está no HTML, escondido por CSS. O modal clona a lista
       inteira, então a fonte da verdade continua sendo uma só. */
    var modal = $('#modal-contrib');
    if (!modal || !modal.showModal) return;

    $$('.info__mais').forEach(function (botao) {
      botao.addEventListener('click', function (e) {
        e.preventDefault();
        var card = botao.closest('.pessoa');
        if (!card) return;

        $('#modal-nome').textContent = card.dataset.nome || '';
        $('#modal-papel').textContent = card.dataset.papel || '';

        var destino = $('#modal-lista');
        destino.textContent = '';
        $$('.info--contrib .lista-contrib li', card).forEach(function (li) {
          destino.appendChild(li.cloneNode(true));
        });

        document.body.classList.add('modal-aberto');
        modal.showModal();
      });
    });

    var fechar = $('#modal-fechar');
    if (fechar) fechar.addEventListener('click', function () { modal.close(); });

    // clicar no fundo escuro fecha (o Esc o <dialog> já trata sozinho)
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.close();
    });

    // Fechar o modal fecha também o painel do cartão. Sem isto ele
    // ficava aberto por baixo, e aí passar o mouse em outro cartão
    // deixava dois abertos ao mesmo tempo.
    modal.addEventListener('close', function () {
      document.body.classList.remove('modal-aberto');
      fecharTodos();
    });
  })();

  /* ═══════════════════════════════════════════════════════════
     7. VOLTAR AO TOPO
     ═══════════════════════════════════════════════════════════ */

  (function aoTopo() {
    var botao = $('#ao-topo');
    if (!botao) return;

    var mostrar = function () {
      botao.classList.toggle('aparece', window.scrollY > 600);
    };
    mostrar();
    window.addEventListener('scroll', mostrar, { passive: true });

    botao.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: menosMovimento ? 'auto' : 'smooth' });
    });
  })();
})();
