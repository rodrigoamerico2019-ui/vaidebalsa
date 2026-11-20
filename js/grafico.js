/* VAIDEBALSA — gráfico da espera ao longo de hoje (dados próprios: esperas medidas + relatos) */
(function () {
  var cfg = window.VAIDEBALSA || {};
  var caixa = document.getElementById("grafico-dia");
  if (!caixa) return;
  var DEMO = /[?&]demo=1/.test(location.search);
  var SERIES = [
    { lado: "sao-sebastiao", nome: "São Sebastião", cor: "#0D6EFD" },
    { lado: "ilhabela", nome: "Ilhabela", cor: "#00B8A9" }
  ];
  var H0 = 5, H1 = 23;               // eixo das horas: 5h às 23h
  var W = 720, H = 260, M = { t: 16, r: 120, b: 30, l: 44 };
  function medidas() {
    W = Math.max(300, Math.round(caixa.clientWidth || 720));
    H = W < 520 ? 220 : 260;
    M.r = W < 520 ? 96 : 120; M.l = W < 520 ? 34 : 44;
  }
  var dados = [];

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function carregar() {
    if (DEMO) {
      dados = [];
      [[7, 15, 8], [9, 25, 18], [11, 48, 30], [13, 70, 35], [15, 82, 28], [17, 55, 20], [19, 30, 12]].forEach(function (r) {
        dados.push({ lado: "sao-sebastiao", hora: r[0], minutos: r[1], medidas: 2, relatos: 3 });
        dados.push({ lado: "ilhabela", hora: r[0], minutos: r[2], medidas: 1, relatos: 2 });
      });
      return Promise.resolve(desenhar());
    }
    if (!cfg.supabaseUrl) return Promise.resolve(desenhar());
    return fetch(cfg.supabaseUrl + "/rest/v1/rpc/espera_hoje", {
      method: "POST", headers: { apikey: cfg.supabaseAnonKey, "Content-Type": "application/json" }, body: "{}"
    }).then(function (r) { return r.ok ? r.json() : []; })
      .then(function (j) { dados = Array.isArray(j) ? j : []; desenhar(); })
      .catch(function () { desenhar(); });
  }

  function desenhar() {
    medidas(); larguraAnterior = W;
    var pontos = dados.filter(function (d) { return d.hora >= H0 && d.hora <= H1; });
    var maxV = Math.max(60, Math.ceil(Math.max.apply(null, pontos.map(function (d) { return d.minutos; }).concat([0])) / 30) * 30);
    var x = function (h) { return M.l + (h - H0) / (H1 - H0) * (W - M.l - M.r); };
    var y = function (v) { return H - M.b - v / maxV * (H - M.t - M.b); };
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" class="g-svg" role="img" aria-label="Espera na fila da balsa ao longo de hoje, por lado">';

    // grade e eixos (recessivos)
    for (var v = 0; v <= maxV; v += 30) {
      svg += '<line x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="g-grade' + (v === 0 ? " base" : "") + '"/>';
      svg += '<text x="' + (M.l - 8) + '" y="' + (y(v) + 4) + '" class="g-eixo" text-anchor="end">' + v + "</text>";
    }
    for (var h = 6; h <= H1; h += 3) {
      svg += '<text x="' + x(h) + '" y="' + (H - 8) + '" class="g-eixo" text-anchor="middle">' + h + "h</text>";
    }
    // hora atual
    var agora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    var hAgora = agora.getHours() + agora.getMinutes() / 60;
    if (hAgora >= H0 && hAgora <= H1) {
      svg += '<line x1="' + x(hAgora) + '" x2="' + x(hAgora) + '" y1="' + M.t + '" y2="' + (H - M.b) + '" class="g-agora"/>';
      svg += '<text x="' + (x(hAgora) + 4) + '" y="' + (M.t + 10) + '" class="g-eixo">agora</text>';
    }

    // séries
    var rotulos = [];
    SERIES.forEach(function (s) {
      var ps = pontos.filter(function (d) { return d.lado === s.lado; }).sort(function (a, b) { return a.hora - b.hora; });
      if (!ps.length) return;
      if (ps.length > 1) {
        svg += '<polyline fill="none" stroke="' + s.cor + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="' +
          ps.map(function (d) { return x(d.hora + .5) + "," + y(d.minutos); }).join(" ") + '"/>';
      }
      ps.forEach(function (d) {
        svg += '<circle cx="' + x(d.hora + .5) + '" cy="' + y(d.minutos) + '" r="4" fill="' + s.cor + '" stroke="#fff" stroke-width="2"/>';
      });
      var ult = ps[ps.length - 1];
      rotulos.push({ y: y(ult.minutos), x: x(ult.hora + .5), txt: (W < 520 ? s.nome.replace("São Sebastião", "S. Sebastião") : s.nome) + " · " + ult.minutos + " min", cor: s.cor });
    });
    // rótulos diretos no último ponto, sem sobrepor
    rotulos.sort(function (a, b) { return a.y - b.y; });
    for (var i = 1; i < rotulos.length; i++) if (rotulos[i].y - rotulos[i - 1].y < 16) rotulos[i].y = rotulos[i - 1].y + 16;
    rotulos.forEach(function (r) {
      svg += '<text x="' + (r.x + 10) + '" y="' + (r.y + 4) + '" class="g-rotulo">' + esc(r.txt) + "</text>";
    });
    // camada de interação
    svg += '<line class="g-mira" x1="0" x2="0" y1="' + M.t + '" y2="' + (H - M.b) + '" visibility="hidden"/>';
    svg += '<rect class="g-alvo" x="' + M.l + '" y="' + M.t + '" width="' + (W - M.l - M.r) + '" height="' + (H - M.t - M.b) + '" fill="transparent"/>';
    svg += "</svg>";

    var total = pontos.reduce(function (s, d) { return s + d.medidas + d.relatos; }, 0);
    var aviso = !pontos.length
      ? '<p class="g-vazio">Ainda sem dados hoje. O gráfico se forma com as <b>esperas medidas</b> e as <b>fotos da fila</b> enviadas por quem está lá.</p>'
      : (total < 4 ? '<p class="g-vazio">Poucos dados hoje (' + total + "). Quanto mais gente medir a espera, mais preciso fica.</p>" : "");

    var linhas = pontos.slice().sort(function (a, b) { return a.hora - b.hora || a.lado.localeCompare(b.lado); }).map(function (d) {
      return "<tr><td>" + d.hora + "h</td><td>" + (d.lado === "ilhabela" ? "Ilhabela" : "São Sebastião") + "</td><td>" + d.minutos + " min</td><td>" + d.medidas + "</td><td>" + d.relatos + "</td></tr>";
    }).join("");

    caixa.innerHTML =
      '<div class="g-legenda">' + SERIES.map(function (s) { return '<span><i style="background:' + s.cor + '"></i>' + s.nome + "</span>"; }).join("") + "</div>" +
      '<div class="g-area">' + svg + '<div class="g-dica" hidden></div></div>' + aviso +
      (linhas ? '<details class="g-tabela"><summary>Ver em tabela</summary><table class="tabela"><thead><tr><th>Hora</th><th>Lado</th><th>Espera</th><th>Medições</th><th>Relatos</th></tr></thead><tbody>' + linhas + "</tbody></table></details>" : "");

    // tooltip com mira (mouse e toque)
    var area = caixa.querySelector(".g-area"), alvo = caixa.querySelector(".g-alvo"), mira = caixa.querySelector(".g-mira"), dica = caixa.querySelector(".g-dica");
    function mover(ev) {
      var r = caixa.querySelector(".g-svg").getBoundingClientRect();
      var cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * W;
      var alvoH = H0 + (cx - M.l) / (W - M.l - M.r) * (H1 - H0) - .5;
      var horas = pontos.map(function (p) { return p.hora; });
      if (!horas.length) return;
      var hora = horas.reduce(function (m, h) { return Math.abs(h - alvoH) < Math.abs(m - alvoH) ? h : m; }, horas[0]);
      var px = x(hora + .5);
      mira.setAttribute("x1", px); mira.setAttribute("x2", px); mira.setAttribute("visibility", "visible");
      var itens = SERIES.map(function (s) {
        var d = pontos.find(function (p) { return p.lado === s.lado && p.hora === hora; });
        return '<div><i style="background:' + s.cor + '"></i>' + s.nome + ": <b>" + (d ? d.minutos + " min" : "sem dados") + "</b>" +
          (d ? ' <small>(' + d.medidas + " med. · " + d.relatos + " rel.)</small>" : "") + "</div>";
      }).join("");
      dica.innerHTML = "<strong>" + hora + "h às " + (hora + 1) + "h</strong>" + itens;
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
