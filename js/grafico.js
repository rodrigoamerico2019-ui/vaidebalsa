/* VAIDEBALSA — gráfico da espera nas últimas 12 horas (janela móvel; espera oficial da AcquaVias + esperas medidas e fotos) */
(function () {
  var cfg = window.VAIDEBALSA || {};
  var caixa = document.getElementById("grafico-dia");
  if (!caixa) return;
  var DEMO = /[?&]demo=1/.test(location.search);
  var SERIES = [
    { lado: "sao-sebastiao", nome: "São Sebastião", cor: "#0D6EFD" },
    { lado: "ilhabela", nome: "Ilhabela", cor: "#00B8A9", traco: "7 5" }
  ];
  var JANELA = 12;                    // horas
  var HORA = 3600000;
  var W = 720, H = 260, M = { t: 16, r: 120, b: 30, l: 44 };
  function medidas() {
    W = Math.max(300, Math.round(caixa.clientWidth || 720));
    H = W < 520 ? 220 : 260;
    M.r = W < 520 ? 132 : 132; M.l = W < 520 ? 34 : 44;
  }
  var dados = [], inicio = 0;         // inicio = começo da 1ª hora da janela (ms)

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function horaDoDia(ms) {
    return +new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date(ms));
  }
  function calcInicio() {
    var agora = Date.now();
    return Math.floor(agora / HORA) * HORA - (JANELA - 1) * HORA;   // 12 faixas: 11 horas cheias + a hora atual
  }

  function carregar() {
    inicio = calcInicio();
    if (DEMO) {
      dados = [];
      [[0, 15, 8], [2, 25, 18], [4, 48, 30], [6, 70, 35], [8, 82, 28], [10, 55, 20], [11, 40, 15]].forEach(function (r) {
        dados.push({ lado: "sao-sebastiao", k: r[0], minutos: r[1], medidas: 2, relatos: 3 });
        dados.push({ lado: "ilhabela", k: r[0], minutos: r[2], medidas: 1, relatos: 2 });
      });
      return Promise.resolve(desenhar());
    }
    if (!cfg.supabaseUrl) return Promise.resolve(desenhar());
    function rpc(nome) {
      return fetch(cfg.supabaseUrl + "/rest/v1/rpc/" + nome, {
        method: "POST", headers: { apikey: cfg.supabaseAnonKey, "Content-Type": "application/json" }, body: "{}"
      }).then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
    }
    function kDe(hora) { return Math.round((new Date(hora).getTime() - inicio) / HORA); }
    return Promise.all([rpc("espera_oficial_12h"), rpc("espera_12h")]).then(function (r) {
      var mapa = {};
      // 1) espera oficial publicada pela AcquaVias (lida a cada 10 min): base do gráfico
      (Array.isArray(r[0]) ? r[0] : []).forEach(function (d) {
        var k = kDe(d.hora);
        [["sao-sebastiao", d.ss], ["ilhabela", d.ib]].forEach(function (l) {
          if (l[1] != null) mapa[l[0] + "|" + k] = { lado: l[0], k: k, minutos: l[1], medidas: 0, relatos: 0, oficial: true };
        });
      });
      // 2) esperas medidas e fotos de quem está na fila: completam as horas sem dado oficial
      (Array.isArray(r[1]) ? r[1] : []).forEach(function (d) {
        var k = kDe(d.hora), ch = d.lado + "|" + k, o = mapa[ch];
        if (o) { o.medidas = d.medidas || 0; o.relatos = d.relatos || 0; }
        else if (d.minutos != null) mapa[ch] = { lado: d.lado, k: k, minutos: d.minutos, medidas: d.medidas || 0, relatos: d.relatos || 0, oficial: false };
      });
      dados = Object.keys(mapa).map(function (c) { return mapa[c]; }).filter(function (d) { return d.k >= 0 && d.k < JANELA; });
      desenhar();
    });
  }

  function desenhar() {
    medidas(); larguraAnterior = W;
    if (!inicio) inicio = calcInicio();
    var pontos = dados;
    var rotH = function (k) { return horaDoDia(inicio + k * HORA); };
    var maxV = Math.max(60, Math.ceil(Math.max.apply(null, pontos.map(function (d) { return d.minutos; }).concat([0])) / 30) * 30);
    var x = function (k) { return M.l + k / JANELA * (W - M.l - M.r); };
    var y = function (v) { return H - M.b - v / maxV * (H - M.t - M.b); };
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" class="g-svg" role="img" aria-label="Espera na fila da balsa nas últimas 12 horas, por lado">';

    // grade e eixos (recessivos)
    for (var v = 0; v <= maxV; v += 30) {
      svg += '<line x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="g-grade' + (v === 0 ? " base" : "") + '"/>';
      svg += '<text x="' + (M.l - 8) + '" y="' + (y(v) + 4) + '" class="g-eixo" text-anchor="end">' + v + "</text>";
    }
    var passo = W < 520 ? 3 : 2;
    for (var k = 0; k <= JANELA; k += passo) {
      svg += '<text x="' + x(k) + '" y="' + (H - 8) + '" class="g-eixo" text-anchor="middle">' + rotH(k) + "h</text>";
    }
    // agora (dentro da última faixa)
    var kAgora = (Date.now() - inicio) / HORA;
    svg += '<line x1="' + x(kAgora) + '" x2="' + x(kAgora) + '" y1="' + M.t + '" y2="' + (H - M.b) + '" class="g-agora"/>';
    svg += '<text x="' + (x(kAgora) - 4) + '" y="' + (M.t + 10) + '" class="g-eixo" text-anchor="end">agora</text>';

    // séries
    var rotulos = [];
    SERIES.forEach(function (s) {
      var ps = pontos.filter(function (d) { return d.lado === s.lado; }).sort(function (a, b) { return a.k - b.k; });
      if (!ps.length) return;
      if (ps.length > 1) {
        svg += '<polyline fill="none" stroke="' + s.cor + '"' + (s.traco ? ' stroke-dasharray="' + s.traco + '"' : "") + ' stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="' +
          ps.map(function (d) { return x(d.k + .5) + "," + y(d.minutos); }).join(" ") + '"/>';
      }
      ps.forEach(function (d) {
        svg += '<circle cx="' + x(d.k + .5) + '" cy="' + y(d.minutos) + '" r="4" fill="' + s.cor + '" stroke="#fff" stroke-width="2"/>';
      });
      var ult = ps[ps.length - 1];
      rotulos.push({ y: y(ult.minutos), x: x(ult.k + .5), txt: (W < 520 ? s.nome.replace("São Sebastião", "S. Sebastião") : s.nome) + " · " + ult.minutos + " min" });
    });
    rotulos.sort(function (a, b) { return a.y - b.y; });
    for (var i = 1; i < rotulos.length; i++) if (rotulos[i].y - rotulos[i - 1].y < 16) rotulos[i].y = rotulos[i - 1].y + 16;
    rotulos.forEach(function (r) {
      svg += '<text x="' + (r.x + 10) + '" y="' + (r.y + 4) + '" class="g-rotulo">' + esc(r.txt) + "</text>";
    });
    // camada de interação
    svg += '<line class="g-mira" x1="0" x2="0" y1="' + M.t + '" y2="' + (H - M.b) + '" visibility="hidden"/>';
    svg += '<rect class="g-alvo" x="' + M.l + '" y="' + M.t + '" width="' + (W - M.l - M.r) + '" height="' + (H - M.t - M.b) + '" fill="transparent"/>';
    svg += "</svg>";

    var oficiais = pontos.some(function (d) { return d.oficial; });
    var aviso = !pontos.length
      ? '<p class="g-vazio">Ainda sem dados nas últimas 12 horas. O gráfico usa a <b>espera oficial da AcquaVias</b> e as <b>esperas medidas</b> e <b>fotos da fila</b> enviadas por quem está lá.</p>'
      : '<p class="g-fonte">Fonte: ' + (oficiais ? 'espera oficial publicada pela <a href="https://acquavias.com.br/" target="_blank" rel="noopener">AcquaVias</a>, média por hora' : "esperas medidas e fotos de quem está na fila") + ".</p>";

    var linhas = pontos.slice().sort(function (a, b) { return a.k - b.k || a.lado.localeCompare(b.lado); }).map(function (d) {
      return "<tr><td>" + rotH(d.k) + "h</td><td>" + (d.lado === "ilhabela" ? "Ilhabela" : "São Sebastião") + "</td><td>" + d.minutos + " min</td><td>" + (d.oficial ? "AcquaVias" : "Medições e fotos") + "</td></tr>";
    }).join("");

    caixa.innerHTML =
      '<div class="g-legenda">' + SERIES.map(function (s) { return '<span><i style="background:' + s.cor + '"></i>' + s.nome + "</span>"; }).join("") + "</div>" +
      '<div class="g-area">' + svg + '<div class="g-dica" hidden></div></div>' + aviso +
      (linhas ? '<details class="g-tabela"><summary>Ver em tabela</summary><table class="tabela"><thead><tr><th>Hora</th><th>Lado</th><th>Espera</th><th>Fonte</th></tr></thead><tbody>' + linhas + "</tbody></table></details>" : "");

    // dica com mira (mouse e toque): pula para a hora com dado mais próxima
    var area = caixa.querySelector(".g-area"), alvo = caixa.querySelector(".g-alvo"), mira = caixa.querySelector(".g-mira"), dica = caixa.querySelector(".g-dica");
    function mover(ev) {
      var r = caixa.querySelector(".g-svg").getBoundingClientRect();
      var cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * W;
      var alvoK = (cx - M.l) / (W - M.l - M.r) * JANELA - .5;
      var ks = pontos.map(function (p) { return p.k; });
      if (!ks.length) return;
      var k = ks.reduce(function (m, h) { return Math.abs(h - alvoK) < Math.abs(m - alvoK) ? h : m; }, ks[0]);
      var px = x(k + .5);
      mira.setAttribute("x1", px); mira.setAttribute("x2", px); mira.setAttribute("visibility", "visible");
      var itens = SERIES.map(function (s) {
        var d = pontos.find(function (p) { return p.lado === s.lado && p.k === k; });
        return '<div><i style="background:' + s.cor + '"></i>' + s.nome + ": <b>" + (d ? d.minutos + " min" : "sem dados") + "</b>" +
          (d ? " <small>(" + (d.oficial ? "AcquaVias" : d.medidas + " med. · " + d.relatos + " rel.") + ")</small>" : "") + "</div>";
      }).join("");
      dica.innerHTML = "<strong>" + rotH(k) + "h às " + rotH(k + 1) + "h</strong>" + itens;
      dica.hidden = false;
      var esquerda = px / W * r.width;
      dica.style.left = Math.min(Math.max(0, esquerda - 90), r.width - 190) + "px";
    }
    function sair() { mira.setAttribute("visibility", "hidden"); dica.hidden = true; }
    alvo.addEventListener("mousemove", mover);
    alvo.addEventListener("touchstart", mover, { passive: true });
    alvo.addEventListener("touchmove", mover, { passive: true });
    alvo.addEventListener("mouseleave", sair);
    area.addEventListener("touchend", function () { setTimeout(sair, 2500); });
  }

  var tRes, larguraAnterior = 0;
  function aoRedimensionar() {
    var w = Math.round(caixa.clientWidth);
    if (Math.abs(w - larguraAnterior) < 8) return;
    larguraAnterior = w; clearTimeout(tRes); tRes = setTimeout(desenhar, 150);
  }
  if ("ResizeObserver" in window) new ResizeObserver(aoRedimensionar).observe(caixa);
  window.addEventListener("resize", aoRedimensionar);
  carregar();
  setInterval(function () { if (!document.hidden) carregar(); }, 120000);
})();
