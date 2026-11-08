/* ══════════════════════════════════════════════════════════════
   HealthPlus Web — comportamento da página

   Quatro coisas:
     1. a abertura animada
     2. a revelação dos blocos ao rolar
     3. os contadores que sobem
     4. a calculadora de escore-z, que é o coração da página

   A calculadora NÃO é maquete: ela usa as mesmas curvas da OMS que
   o aplicativo usa (assets/oms-imc.js, gerado dos JSON oficiais) e
   repete a mesma matemática de app/utilitarios/oms/calculoLms.js.
   Nada do que o visitante digita sai do navegador dele.
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var $ = function (s, e) { return (e || document).querySelector(s); };
  var $$ = function (s, e) { return Array.prototype.slice.call((e || document).querySelectorAll(s)); };
  var menosMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

    var observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (ent) {
        if (!ent.isIntersecting) return;
        ent.target.classList.add('visivel');
        observador.unobserve(ent.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    alvos.forEach(function (e) { observador.observe(e); });
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
    var obs = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) {
        if (!e.isIntersecting) return;
        anima(e.target);
        obs.unobserve(e.target);
      });
    }, { threshold: 0.5 });
    nums.forEach(function (e) { obs.observe(e); });
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

  //   Z = ((X/M)^L - 1) / (L*S)     quando L != 0
  //   Z = ln(X/M) / S               quando L == 0
  function zScore(x, lms) {
    if (Math.abs(lms.L) < 1e-9) return Math.log(x / lms.M) / lms.S;
    return (Math.pow(x / lms.M, lms.L) - 1) / (lms.L * lms.S);
  }

  // A fórmula invertida: a medida que corresponde a um escore-z.
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
  function classificar(z, meses) {
    var faixas = meses <= 60
      ? [[-3, 'Magreza acentuada', 'risco'], [-2, 'Magreza', 'atencao'], [1, 'Eutrofia', 'adequado'],
         [2, 'Risco de sobrepeso', 'atencao'], [3, 'Sobrepeso', 'atencao'], [Infinity, 'Obesidade', 'risco']]
      : [[-3, 'Magreza acentuada', 'risco'], [-2, 'Magreza', 'atencao'], [1, 'Eutrofia', 'adequado'],
         [2, 'Sobrepeso', 'atencao'], [3, 'Obesidade', 'risco'], [Infinity, 'Obesidade grave', 'risco']];
    for (var i = 0; i < faixas.length; i++) if (z < faixas[i][0]) return { nome: faixas[i][1], tom: faixas[i][2] };
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
    var vImc = $('#v-imc'), vZ = $('#v-z'), vP = $('#v-p'), selo = $('#v-classe');
    var svg = $('#curvas-svg');

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

    // ── geometria do gráfico ──
    var L = 34, R = 20, T = 12, B = 26, W = 330, H = 196;
    var X0 = 0, X1 = 228;                 // meses no eixo horizontal
    var px = function (m) { return L + (m - X0) / (X1 - X0) * (W - L - R); };
    var yMin = 11, yMax = 32;             // IMC no eixo vertical
    var py = function (v) { return T + (yMax - v) / (yMax - yMin) * (H - T - B); };

    function caminhoDoZ(z) {
      var pts = window.OMS_IMC[sexo], d = '';
      for (var m = X0; m <= X1; m += 3) {
        var lms = lmsNaIdade(pts, m);
        if (!lms) continue;
        var v = medidaNoZ(z, lms);
        d += (d ? ' L' : 'M') + px(m).toFixed(1) + ' ' + py(v).toFixed(1);
      }
      return d;
    }

    function desenharCurvas() {
      if (!svg) return;
      var partes = [], v, a, x;

      // grade e eixos
      for (v = 12; v <= 32; v += 4) {
        partes.push('<line class="eixo" x1="' + L + '" y1="' + py(v) + '" x2="' + (W - R) + '" y2="' + py(v) + '"/>');
        partes.push('<text class="eixo-txt" x="' + (L - 6) + '" y="' + (py(v) + 3) + '" text-anchor="end">' + v + '</text>');
      }
      for (a = 0; a <= 18; a += 3) {
        x = px(a * 12);
        partes.push('<text class="eixo-txt" x="' + x + '" y="' + (H - B + 15) + '" text-anchor="middle">' + a + '</text>');
      }
      partes.push('<text class="eixo-txt" x="' + (W - R) + '" y="' + (H - 3) + '" text-anchor="end">idade (anos)</text>');
      partes.push('<text class="eixo-txt" x="' + (L - 6) + '" y="' + (T - 2) + '" text-anchor="end">IMC</text>');

      // as curvas de referência da OMS
      var ultima = lmsNaIdade(window.OMS_IMC[sexo], X1);
      [[-2, '-2'], [-1, '-1'], [0, 'M'], [1, '+1'], [2, '+2'], [3, '+3']].forEach(function (par) {
        var z = par[0];
        partes.push('<path class="linha' + (z === 0 ? ' mediana' : '') + '" d="' + caminhoDoZ(z) + '"/>');
        partes.push('<text class="rotulo-curva" x="' + (W - R + 3) + '" y="' +
          (py(medidaNoZ(z, ultima)) + 2.5) + '">' + par[1] + '</text>');
      });

      svg.innerHTML = partes.join('');
    }

    function marcarPonto(mesesTot, imc) {
      if (!svg) return;
      var x = px(Math.max(X0, Math.min(X1, mesesTot)));
      var y = py(Math.max(yMin, Math.min(yMax, imc)));
      svg.insertAdjacentHTML('beforeend',
        '<circle class="halo" cx="' + x + '" cy="' + y + '" r="9"/>' +
        '<circle class="marca-ponto" cx="' + x + '" cy="' + y + '" r="4.5"/>');
    }

    function vazio(motivo) {
      vImc.textContent = '—'; vZ.textContent = '—'; vP.textContent = '—';
      selo.className = 'selo-classe vazio';
      selo.textContent = motivo;
    }

    function recalcular() {
      desenharCurvas();

      var a = parseFloat(anos.value), mm = parseFloat(meses.value || '0');
      var p = parseFloat(peso.value), h = parseFloat(altura.value);

      if (!isFinite(a) || !isFinite(p) || !isFinite(h) || p <= 0 || h <= 0) {
        return vazio('Preencha os campos');
      }

      var total = a * 12 + (isFinite(mm) ? mm : 0);
      if (total < 0 || total > 228) {
        return vazio('A OMS vai de 0 a 19 anos');
      }

      var imc = p / Math.pow(h / 100, 2);
      if (!isFinite(imc) || imc <= 0) return vazio('Medidas improváveis');

      var lms = lmsNaIdade(window.OMS_IMC[sexo], total);
      if (!lms) return vazio('Sem curva para esta idade');

      var z = Math.round(zAjustado(imc, lms) * 100) / 100;   // a OMS publica com 2 casas
      var pc = percentil(z);
      var cls = classificar(z, total);

      vImc.textContent = imc.toFixed(1).replace('.', ',');
      vZ.textContent = (z > 0 ? '+' : '') + z.toFixed(2).replace('.', ',');
      vP.textContent = (pc < 0.1 ? '<0,1' : pc > 99.9 ? '>99,9' : pc.toFixed(1).replace('.', ',')) + '%';
      selo.className = 'selo-classe ' + cls.tom;
      selo.textContent = cls.nome;

      marcarPonto(total, imc);
    }

    recalcular();
  })();
})();
