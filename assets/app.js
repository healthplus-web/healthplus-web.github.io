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
      // libera o hover de novo (ver o comentário no CSS)
      document.body.classList.remove('trava-clique');
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
          // enquanto um painel está travado por clique, o hover não abre
          document.body.classList.toggle('trava-clique', abrindo);
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
      // O <dialog> devolve o foco ao botão que o abriu, que está
      // dentro do painel. Tirar o foco dali é o que faz o cartão
      // voltar mesmo ao estado inicial, com a foto à mostra.
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }
      fecharTodos();
    });
  })();

  /* ═══════════════════════════════════════════════════════════
     7. VOLTAR AO TOPO
     ═══════════════════════════════════════════════════════════ */

  (function menuFlutuante() {
    var menu = $('#menu');
    if (!menu) return;

    var itens = $$('a[data-secao]', menu);
    var secoes = itens
      .map(function (a) { return document.getElementById(a.dataset.secao); })
      .filter(Boolean);

    function acende(qual) {
      itens.forEach(function (a) {
        var ativo = a.dataset.secao === qual;
        a.classList.toggle('ativo', ativo);
        if (ativo) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }

    // o primeiro item é o topo: ele faz o que o botão antigo fazia
    var aoTopo = $('a[data-secao="topo"]', menu);
    if (aoTopo) {
      aoTopo.addEventListener('click', function (e) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: menosMovimento ? 'auto' : 'smooth' });
        acende('topo');
      });
    }

    if ('IntersectionObserver' in window && secoes.length) {
      var obs = new IntersectionObserver(function (ents) {
        ents.forEach(function (ent) {
          if (ent.isIntersecting) acende(ent.target.id);
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      secoes.forEach(function (s) { obs.observe(s); });
    }

    window.addEventListener('scroll', function () {
      if (window.scrollY < 200) acende('topo');
    }, { passive: true });
  })();

  /* ═══════════════════════════════════════════════════════════
     7.1 CARDS DA PRECISÃO QUE VIRAM
     A frente dá o título, o verso dá o detalhe. Clique, Enter ou
     Espaço giram — é um role="button", então teclado funciona.
     ═══════════════════════════════════════════════════════════ */

  (function cartoesViram() {
    var cartoes = $$('.cartao');
    if (!cartoes.length) return;

    cartoes.forEach(function (c) {
      function virar() {
        var aberto = !c.classList.contains('virado');
        cartoes.forEach(function (o) {
          if (o !== c) { o.classList.remove('virado'); o.setAttribute('aria-expanded', 'false'); }
        });
        c.classList.toggle('virado', aberto);
        c.setAttribute('aria-expanded', String(aberto));
      }
      c.addEventListener('click', virar);
      c.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); virar(); }
      });
    });
  })();

  /* ═══════════════════════════════════════════════════════════
     7.2 PRIVACIDADE QUE ABRE
     Cada item mostra só a afirmação; o detalhe abre no clique.
     Vários podem ficar abertos: é conteúdo para ler, não um menu.
     ═══════════════════════════════════════════════════════════ */

  (function privacidade() {
    $$('.priv__botao').forEach(function (b) {
      b.addEventListener('click', function () {
        var item = b.closest('.priv');
        if (!item) return;
        var abrindo = !item.classList.contains('aberto');
        item.classList.toggle('aberto', abrindo);
        b.setAttribute('aria-expanded', String(abrindo));
      });
    });
  })();

  /* ═══════════════════════════════════════════════════════════
     8. TÍTULOS SENDO DIGITADOS
     O texto inteiro fica no aria-label, então leitor de tela lê o
     título de uma vez só — a digitação é só para o olho. A altura
     é travada antes de esvaziar, para a página não pular.
     ═══════════════════════════════════════════════════════════ */

  (function digitando() {
    var alvos = $$('[data-digita]');
    if (!alvos.length) return;

    alvos.forEach(function (el) {
      var texto = el.textContent.trim();
      el.setAttribute('aria-label', texto);
      el.dataset.texto = texto;
      var altura = el.getBoundingClientRect().height;
      if (altura) el.style.minHeight = altura + 'px';
      if (menosMovimento) return;
      el.innerHTML = '<span class="digitado" aria-hidden="true"></span>' +
                     '<span class="cursor" aria-hidden="true"></span>';
    });

    if (menosMovimento) return;

    function digita(el) {
      var alvo = el.dataset.texto || '';
      var saida = $('.digitado', el);
      var cursor = $('.cursor', el);
      if (!saida) return;
      var i = 0;
      (function tic() {
        saida.textContent = alvo.slice(0, i);
        if (i++ <= alvo.length) setTimeout(tic, 22);
        else if (cursor) setTimeout(function () { cursor.remove(); }, 1000);
      })();
    }

    aberturaPronta.then(function () {
      if (!('IntersectionObserver' in window)) { alvos.forEach(digita); return; }
      var obs = new IntersectionObserver(function (ents) {
        ents.forEach(function (ent) {
          if (!ent.isIntersecting) return;
          digita(ent.target);
          obs.unobserve(ent.target);
        });
      }, { threshold: 0.35 });
      alvos.forEach(function (e) { obs.observe(e); });
    });
  })();

  /* ═══════════════════════════════════════════════════════════
     9. CURTIDAS
     A conta é global, guardada num banco só para isto. O navegador
     guarda apenas um identificador aleatório que ele mesmo sorteia
     — não é dado pessoal, não é IP, e serve só para a mesma pessoa
     não contar duas vezes. A chave abaixo é a publicável: ela é
     feita para ficar no navegador e não abre a tabela, que só
     responde pelas duas funções.
     ═══════════════════════════════════════════════════════════ */

  (function curtidas() {
    var API = 'https://mfcumktqaglnkbtrxynt.supabase.co/rest/v1/rpc/';
    var CHAVE = 'sb_publishable_fhk3WiDfq941ftyUaeOgeg_F8I5qFyO';
    var META = 100;

    var botoes = $$('.curtir');
    var numeros = $$('[data-curtidas]');
    var enchimento = $('#meta-enchimento');
    var recado = $('#meta-recado');
    if (!botoes.length && !numeros.length) return;

    function guardado(chave) {
      try { return localStorage.getItem(chave); } catch (e) { return null; }
    }
    function guardar(chave, valor) {
      try { localStorage.setItem(chave, valor); } catch (e) { /* modo privado */ }
    }

    function aparelho() {
      var v = guardado('healthplus:aparelho');
      if (!v) {
        var bytes = new Uint8Array(24);
        (window.crypto || {}).getRandomValues
          ? crypto.getRandomValues(bytes)
          : bytes.forEach(function (_, i) { bytes[i] = Math.floor(Math.random() * 256); });
        v = Array.prototype.map.call(bytes, function (b) {
          return 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36];
        }).join('');
        guardar('healthplus:aparelho', v);
      }
      return v;
    }

    var jaCurtiu = guardado('healthplus:curtiu') === '1';

    function chamar(fn, corpo) {
      return fetch(API + fn, {
        method: 'POST',
        headers: { apikey: CHAVE, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo || {})
      }).then(function (r) {
        if (!r.ok) throw new Error('curtidas: HTTP ' + r.status);
        return r.json();
      });
    }

    // número e coração são pintados separados: na comemoração o
    // número sobe na hora e o coração só volta ao proporcional
    // depois da chuva.
    function pintaNumero(total) {
      var n = Number(total) || 0;
      numeros.forEach(function (el) { el.textContent = n.toLocaleString('pt-BR'); });
      if (recado) {
        recado.textContent = n >= META
          ? 'Meta batida. Obrigado a cada uma das ' + n.toLocaleString('pt-BR') + ' pessoas.'
          : 'Faltam ' + (META - n) + ' para encher o coração.';
      }
    }

    function pintaCoracao(total) {
      if (!enchimento) return;
      var fracao = Math.min((Number(total) || 0) / META, 1);
      // o coração enche de baixo para cima; 110 é a altura do viewBox
      enchimento.style.transform = 'translate(0,' + (110 * (1 - fracao)) + 'px)';
    }

    function pinta(total) { pintaNumero(total); pintaCoracao(total); }

    function marcarEstado() {
      botoes.forEach(function (b) {
        b.classList.toggle('curtido', jaCurtiu);
        b.setAttribute('aria-pressed', String(jaCurtiu));
        b.title = jaCurtiu ? 'Você já curtiu. Obrigado!' : 'Curtir o HealthPlus';
        var txt = $('.curtir-texto', b);
        if (txt) txt.textContent = jaCurtiu ? 'Você curtiu' : 'Curtir';
      });
    }

    function explode(botao) {
      if (menosMovimento) return;
      botao.classList.remove('batendo');
      void botao.offsetWidth;            // reinicia a animação
      botao.classList.add('batendo');
      var faisca = document.createElement('span');
      faisca.className = 'faisca';
      faisca.setAttribute('aria-hidden', 'true');
      botao.appendChild(faisca);
      setTimeout(function () { faisca.remove(); }, 800);
    }

    /* ── a chuva de corações ──
       O coração grande enche até em cima, estoura numa chuva de
       uns dois segundos e então volta ao tamanho proporcional às
       curtidas de verdade. */
    var chuva = $('#chuva');
    var CORACAO = '<svg viewBox="0 0 24 24"><path d="M12 20.6S3.4 15 3.4 9.2C3.4 6.3 5.7 4 8.5 4c1.9 0 ' +
                  '3.1 1 3.5 1.9C12.4 5 13.6 4 15.5 4c2.8 0 5.1 2.3 5.1 5.2 0 5.8-8.6 11.4-8.6 11.4z"/></svg>';

    // Chuva simples: caem de cima da seção, com desvio e giro
    // sorteados. A versão que os lançava em todas as direções ficou
    // confusa de olhar.
    function chover() {
      if (!chuva || menosMovimento) return;
      var altura = chuva.getBoundingClientRect().height || 420;
      // 60 corações soltos ao longo de 1,6 s, cada um levando de 2,2
      // a 3,2 s para cair: a chuva inteira dura perto de 4 segundos.
      for (var i = 0; i < 60; i++) {
        setTimeout(function () {
          var c = document.createElement('i');
          var tam = 12 + Math.random() * 26;
          c.innerHTML = CORACAO;
          c.style.left = (Math.random() * 96) + '%';
          c.style.width = tam + 'px';
          c.style.height = tam + 'px';
          c.style.setProperty('--queda', Math.round(altura + 90) + 'px');
          c.style.setProperty('--desvio', Math.round((Math.random() - 0.5) * 150) + 'px');
          c.style.setProperty('--giro', Math.round((Math.random() - 0.5) * 360) + 'deg');
          c.style.setProperty('--dur', (2.2 + Math.random()).toFixed(2) + 's');
          chuva.appendChild(c);
          setTimeout(function () { c.remove(); }, 3400);
        }, i * 27);
      }
    }

    function comemorar(total) {
      pintaNumero(total);
      if (menosMovimento || !enchimento) { pintaCoracao(total); return; }
      enchimento.style.transform = 'translate(0,0px)';     // enche por inteiro
      setTimeout(chover, 260);
      setTimeout(function () { pintaCoracao(total); }, 2300);
    }

    marcarEstado();
    chamar('total_curtidas').then(pinta).catch(function (e) {
      console.warn(e);
      numeros.forEach(function (el) { el.textContent = '—'; });
    });

    botoes.forEach(function (b) {
      b.addEventListener('click', function () {
        explode(b);
        jaCurtiu = true;
        guardar('healthplus:curtiu', '1');
        marcarEstado();
        esconderConvite();

        // Chama SEMPRE. A função no banco é idempotente: curtir de
        // novo do mesmo aparelho não soma. Antes eu decidia aqui, pelo
        // que estava guardado no navegador — e bastava o banco ser
        // zerado para o contador travar em quem já tinha curtido.
        // Quem manda é o total que o banco devolve.
        chamar('curtir', { p_dispositivo: aparelho() })
          .then(comemorar)
          .catch(function (e) { console.warn(e); });
      });
    });

    /* ── o convite ──
       Aparece uma vez, quando a pessoa já leu boa parte da página.
       Quem já curtiu ou já fechou não vê mais. */
    var caixa = $('#convite');

    function esconderConvite() {
      if (!caixa) return;
      caixa.classList.remove('aparece');
      setTimeout(function () { caixa.hidden = true; }, 500);
    }

    if (caixa && !jaCurtiu && guardado('healthplus:convite') !== 'fechado') {
      var fechar = $('.convite-fechar', caixa);
      if (fechar) {
        fechar.addEventListener('click', function () {
          guardar('healthplus:convite', 'fechado');
          esconderConvite();
        });
      }
      var irCurtir = $('.convite-ir', caixa);
      if (irCurtir) irCurtir.addEventListener('click', esconderConvite);

      var mostrou = false;
      var talvezMostrar = function () {
        if (mostrou || jaCurtiu) return;
        var rolado = window.scrollY + window.innerHeight;
        var total = document.body.scrollHeight;
        // só depois de metade da página, para não atrapalhar quem chegou agora
        if (rolado < total * 0.5) return;
        mostrou = true;
        caixa.hidden = false;
        requestAnimationFrame(function () { caixa.classList.add('aparece'); });
      };
      window.addEventListener('scroll', talvezMostrar, { passive: true });
    }
  })();

  /* ═══════════════════════════════════════════════════════════
     10. BALÕES EXPLICATIVOS
     Dois tipos, um só comportamento: os pinos sobre as telas do
     app e as letras L, M e S no verso do cartão 02.

     No computador o hover já abre (é CSS puro, funciona até sem
     JavaScript). Aqui entra o resto: clique e teclado para quem
     está no celular ou navegando por tab, um aberto de cada vez,
     e fechar clicando em qualquer lugar ou com Esc.

     O stopPropagation nas letras é obrigatório: elas vivem DENTRO
     do cartão que gira ao clique, e sem isso abrir a explicação
     viraria o cartão de volta na mesma hora.
     ═══════════════════════════════════════════════════════════ */

  (function baloes() {
    var grupos = [
      { caixa: '.dica', gatilho: '.dica__pin' },
      { caixa: '.sigla', gatilho: '.sigla__b' }
    ];
    var todas = [];

    function fechaTudo() {
      todas.forEach(function (c) {
        c.classList.remove('aberta');
        var b = $('.dica__pin', c) || $('.sigla__b', c);
        if (b) b.setAttribute('aria-expanded', 'false');
      });
    }

    grupos.forEach(function (g) {
      $$(g.caixa).forEach(function (caixa) {
        var botao = $(g.gatilho, caixa);
        if (!botao) return;
        todas.push(caixa);

        botao.addEventListener('click', function (e) {
          // sem isto o clique sobe para o cartão e ele gira
          e.stopPropagation();
          var abrir = !caixa.classList.contains('aberta');
          fechaTudo();
          caixa.classList.toggle('aberta', abrir);
          botao.setAttribute('aria-expanded', String(abrir));
          // o anel pulsante já chamou a atenção; depois do primeiro
          // toque ele só distrai
          var telas = $('.telas');
          if (telas) telas.classList.add('tocada');
        });

        botao.addEventListener('keydown', function (e) {
          // Enter e Espaço no botão já geram um click; o que não pode
          // é a tecla chegar ao cartão e girá-lo
          if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
        });
      });
    });

    if (!todas.length) return;

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.dica, .sigla')) fechaTudo();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') fechaTudo();
    });
    // virar o cartão fecha a explicação que estava aberta nele
    $$('.cartao').forEach(function (c) {
      c.addEventListener('click', function () { fechaTudo(); });
    });
  })();

  /* ═══════════════════════════════════════════════════════════
     11. RECARREGAR VOLTA AO TOPO
     O navegador, por conta dele, devolve a página na altura em
     que você estava. Numa página comum isso ajuda; aqui não: a
     abertura animada roda a cada carregamento, então recarregar
     no meio da página mostrava a animação de entrada atrás de uma
     seção do meio — o visitante via o fim antes do começo.

     Um endereço com #secao continua valendo: ali a altura foi
     pedida de propósito, por um link ou pelo menu.
     ═══════════════════════════════════════════════════════════ */

  (function recarregaNoTopo() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    var temAncora = function () {
      var h = location.hash;
      return h.length > 1 && !!document.getElementById(h.slice(1));
    };
    if (temAncora()) return;
    window.scrollTo(0, 0);
    window.addEventListener('load', function () {
      if (!temAncora()) window.scrollTo(0, 0);
    });
  })();

})();
