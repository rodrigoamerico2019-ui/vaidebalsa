/* VAIDEBALSA — "Planeje a travessia": próximas horas, 7 dias hora a hora (registrado x previsão),
   vento por hora e melhor janela. Dados: esperas medidas no próprio site (espera_12h / semaforo_atual),
   estimativa de referência (js/estimativa.js) e vento do Open-Meteo. Nada de dados de terceiros. */
(function () {
  var cfg = window.VAIDEBALSA || {};
  var raiz = document.getElementById("planeje");
  if (!raiz || !window.VDB_ESTIMATIVA) return;
  var NOMES = { "sao-sebastiao": "São Sebastião", ilhabela: "Ilhabela" };
  var SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  var ALERTA_VENTO = 40;               // km/h — rajadas a partir daqui merecem atenção
  var lado = "sao-sebastiao", diaSel = 0;
  var oficialAgora = false, vento = {}, clima = {}, registrado = {}, aoVivo = {}, GW = 720, GL = 30, GR = 6;
  try { lado = localStorage.getItem("vdb-planeje-lado") || lado; } catch (e) {}
  if (!NOMES[lado]) lado = "sao-sebastiao";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function agoraSP() { return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })); }
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function dia(n) { var d = agoraSP(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; }
  function hhmm(m) { if (m < 60) return m + " min"; var h = Math.floor(m / 60), r = m % 60; return h + "h" + (r ? String(r).padStart(2, "0") : ""); }
  function arred(v) { return Math.max(5, Math.round(v / 5) * 5); }

  // mesmo número usado no topo e na barra ao vivo (js/estimativa.js)
  function previsto(l, d, h) { var x = new Date(d); x.setHours(h, 30, 0, 0); return window.VDB_ESTIMATIVA(l, x).valor; }
  // série de 24 horas do dia n: registrado (hoje, horas que já passaram, com medição) ou previsão
  function serie(n) {
    var d = dia(n), agora = agoraSP(), hAgora = agora.getHours(), out = [];
    for (var h = 0; h < 24; h++) {
      var reg = n === 0 && h <= hAgora ? registrado[lado + "|" + h] : null;
      if (n === 0 && h === hAgora && aoVivo[lado] != null) reg = aoVivo[lado];
      out.push({ h: h, v: reg != null ? reg : previsto(lado, d, h), reg: reg != null, passado: n === 0 && h < hAgora });
    }
    return out;
  }
  // melhor janela de 3 horas entre 6h e 23h (hoje: só daqui para frente)
  function melhorJanela(s, n) {
    var ini = n === 0 ? Math.max(6, agoraSP().getHours() + 1) : 6, melhor = null;
    for (var h = ini; h + 3 <= 24; h++) {
      var soma = s[h].v + s[h + 1].v + s[h + 2].v;
      if (!melhor || soma < melhor.soma) melhor = { h: h, soma: soma };
    }
    return melhor;
  }
  function pico(s) { return s.slice(6).reduce(function (m, p) { return p.v > m.v ? p : m; }, s[6]); }
  function emoji(c) {
    if (c == null) return "";
    if (c === 0) return "☀️"; if (c <= 2) return "🌤️"; if (c === 3) return "☁️"; if (c <= 48) return "🌫️";
    if (c <= 67 || (c >= 80 && c <= 82)) return "🌧️"; if (c <= 77) return "🌨️"; return "⛈️";
  }
  function ventoEm(n, h) { return vento[iso(dia(n)) + "|" + h]; }

  // ---------- desenho ----------
  function desenhar() {
    var agora = agoraSP(), hAgora = agora.getHours(), hoje = serie(0);

    // 1) próximas horas
    var prox = [{ rot: "Agora", v: hoje[hAgora].v, reg: hoje[hAgora].reg }];
    for (var i = 1; i <= 4; i++) {
      var hh = hAgora + i, n = hh > 23 ? 1 : 0, s = n ? serie(1) : hoje;
      prox.push({ rot: (hh % 24) + "h", v: s[hh % 24].v, reg: false });
    }
    var maxP = Math.max.apply(null, prox.map(function (p) { return p.v; }).concat([30]));
    var menor = prox.slice(1).reduce(function (m, p) { return p.v < m.v ? p : m; }, prox[1]);
    var frase = prox[0].v <= 20 && menor.v <= 25 ? "Fila tranquila nas próximas horas"
      : menor.v < prox[0].v - 10 ? "Fila menor a partir das " + menor.rot
      : prox[4].v > prox[0].v + 10 ? "A fila tende a aumentar: melhor ir agora" : "Espera parecida nas próximas horas";
    var htmlProx = '<div class="pl-card"><div class="pl-cab"><h3>Próximas horas</h3><small>saindo de ' + NOMES[lado] + "</small></div>" +
      '<p class="pl-frase">' + esc(frase) + "</p>" +
      '<div class="pl-barras">' + prox.map(function (p, k) {
        return '<div class="pl-col' + (k === 0 ? " agora" : "") + '"><b>' + p.v + '</b><div class="pl-trilho"><span style="height:' + Math.max(8, p.v / maxP * 100) + '%"></span></div><small>' + p.rot + "</small></div>";
      }).join("") + "</div>" +
      '<p class="pl-nota">' + (prox[0].reg ? (oficialAgora ? "Agora: espera oficial da AcquaVias." : "Agora: média de quem mediu a espera na última hora.") : "Agora: estimativa (ainda sem dado nesta hora).") + " Próximas horas: estimativa de tendência, em minutos.</p></div>";

    // 2) 7 dias
    var dias = [];
    for (var n2 = 0; n2 < 7; n2++) {
      var sd = serie(n2), d = dia(n2), pk = n2 === 0 ? pico(sd.map(function (p, h) { return h < hAgora ? { h: h, v: 0 } : p; })) : pico(sd);
      dias.push({ n: n2, d: d, pico: pk.v, clima: clima[iso(d)] });
    }
    var sSel = serie(diaSel), jan = melhorJanela(sSel, diaSel);
    var pkSel = pico(sSel.map(function (p, h) { return diaSel === 0 && h < hAgora ? { h: h, v: 0 } : p; }));
    var htmlDias = '<div class="pl-dias" role="tablist" aria-label="Escolha o dia">' + dias.map(function (x) {
      var nivel = x.pico <= 30 ? "verde" : x.pico >= 60 ? "vermelho" : "amarelo";
      return '<button role="tab" data-dia="' + x.n + '" aria-selected="' + (x.n === diaSel) + '" class="pl-dia ' + nivel + '">' +
        "<small>" + (x.n === 0 ? "Hoje" : SEMANA[x.d.getDay()]) + "</small><b>" + x.d.getDate() + "</b><i>" + emoji(x.clima) + "</i><em>" + hhmm(x.pico) + "</em></button>";
    }).join("") + "</div>";

    // gráfico de barras por hora (SVG)
    var W = Math.max(300, Math.min(900, (raiz.clientWidth || 720) - 44)), estreito = W < 520;
    var H = estreito ? 190 : 210, M = { t: 18, r: 6, b: 44, l: 30 };
    GW = W; GL = M.l; GR = M.r;
    var maxV = Math.max(60, Math.ceil(Math.max.apply(null, sSel.map(function (p) { return p.v; })) / 30) * 30);
    var bw = (W - M.l - M.r) / 24;
    var y = function (v) { return H - M.b - v / maxV * (H - M.t - M.b); };
    var svg = '<svg viewBox="0 0 ' + W + " " + H + '" class="pl-svg" role="img" aria-label="Espera prevista por hora em ' + (diaSel === 0 ? "hoje" : SEMANA[dia(diaSel).getDay()]) + ', saindo de ' + NOMES[lado] + '">';
    for (var v = 0; v <= maxV; v += maxV > 120 ? 60 : 30) {
      svg += '<line x1="' + M.l + '" x2="' + (W - M.r) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="g-grade' + (v === 0 ? " base" : "") + '"/>' +
        '<text x="' + (M.l - 6) + '" y="' + (y(v) + 4) + '" class="g-eixo" text-anchor="end">' + v + "′</text>";
    }
    if (jan) svg += '<rect x="' + (M.l + jan.h * bw) + '" y="' + M.t + '" width="' + (3 * bw) + '" height="' + (H - M.t - M.b) + '" class="pl-janela" rx="6"/>';
    sSel.forEach(function (p) {
      var cls = p.reg ? "reg" : p.passado ? "passou" : "prev";
      if (diaSel === 0 && p.h === hAgora) cls += " atual";
      svg += '<rect data-h="' + p.h + '" x="' + (M.l + p.h * bw + 2) + '" y="' + y(p.v) + '" width="' + (bw - 4) + '" height="' + Math.max(2, H - M.b - y(p.v)) + '" rx="3" class="pl-b ' + cls + '"/>';
    });
    for (var h2 = 0; h2 < 24; h2 += estreito ? 6 : 3) {
      svg += '<text x="' + (M.l + h2 * bw + bw / 2) + '" y="' + (H - M.b + 15) + '" class="g-eixo" text-anchor="middle">' + String(h2).padStart(2, "0") + "h</text>";
    }
    // linha do vento (rajadas) embaixo
    svg += '<text x="' + (M.l - 6) + '" y="' + (H - 8) + '" class="g-eixo" text-anchor="end">💨</text>';
    for (var h3 = 0; h3 < 24; h3 += estreito ? 3 : 2) {
      var r = ventoEm(diaSel, h3);
      if (r != null) svg += '<text x="' + (M.l + h3 * bw + bw / 2) + '" y="' + (H - 8) + '" class="g-eixo pl-vento' + (r >= ALERTA_VENTO ? " forte" : "") + '" text-anchor="middle">' + r + "</text>";
    }
    svg += '<rect class="g-alvo" x="' + M.l + '" y="' + M.t + '" width="' + (W - M.l - M.r) + '" height="' + (H - M.t) + '" fill="transparent"/></svg>';

    var temReg = sSel.some(function (p) { return p.reg; });
    var htmlSete = '<div class="pl-card pl-largo"><div class="pl-cab"><h3>Planeje a travessia</h3><small>7 dias · saindo de ' + NOMES[lado] + "</small></div>" + htmlDias +
      '<p class="pl-pico"><b>' + hhmm(pkSel.v) + "</b> no pico · previsto às " + pkSel.h + "h" + (diaSel === 0 ? " · hoje" : "") + "</p>" +
      '<div class="pl-area">' + svg + "</div>" +
      '<p class="pl-dica" aria-live="polite">Toque numa hora para ver a espera e o vento</p>' +
      '<div class="pl-leg">' + (temReg ? '<span><i class="reg"></i>registrado (AcquaVias e medições)</span>' : "") + '<span><i class="prev"></i>previsão</span><span><i class="jan"></i>melhor janela</span><span>💨 rajadas km/h</span></div>' +
      (jan ? '<div class="pl-melhor"><img src="img/mascote.webp" alt="" width="44" height="44" loading="lazy"><div><small>Melhor janela ' + (diaSel === 0 ? "hoje" : "no dia") + "</small><b>" + jan.h + "h – " + ((jan.h + 3) % 24) + "h</b></div><span>👍 espera de ~" + hhmm(arred(jan.soma / 3)) + "</span></div>" : "") +
      "</div>";

    // 3) vento — próximas horas
    var vs = [];
    for (var k2 = 0; k2 <= 4; k2++) { var hv = hAgora + k2; vs.push({ rot: k2 ? (hv % 24) + "h" : "Agora", v: ventoEm(hv > 23 ? 1 : 0, hv % 24) }); }
    var htmlVento = "";
    if (vs.some(function (x) { return x.v != null; })) {
      var maxW = Math.max(ALERTA_VENTO + 10, Math.max.apply(null, vs.map(function (x) { return x.v || 0; })));
      var forte = vs.some(function (x) { return x.v >= ALERTA_VENTO; });
      htmlVento = '<div class="pl-card"><div class="pl-cab"><h3>Vento na travessia</h3><small>rajadas · km/h</small></div>' +
        '<p class="pl-frase' + (forte ? " alerta" : "") + '">' + (forte ? "⚠️ Rajadas fortes: a balsa pode atrasar ou parar" : "Vento abaixo do nível de atenção") + "</p>" +
        '<div class="pl-barras vento" style="--limite:' + Math.round(ALERTA_VENTO / maxW * 100) + 'px"><i class="pl-limite"><em>' + ALERTA_VENTO + " km/h</em></i>" + vs.map(function (x, k) {
          return '<div class="pl-col' + (k === 0 ? " agora" : "") + (x.v >= ALERTA_VENTO ? " forte" : "") + '"><b>' + (x.v == null ? "–" : x.v) + '</b><div class="pl-trilho"><span style="height:' + Math.max(6, (x.v || 0) / maxW * 100) + '%"></span></div><small>' + x.rot + "</small></div>";
        }).join("") + "</div>" +
        '<p class="pl-nota">Previsão do Open-Meteo para o canal. A decisão de parar a travessia é sempre da operadora e da Marinha.</p></div>';
    }

    raiz.innerHTML = '<div class="pl-grade">' + htmlProx + htmlVento + "</div>" + htmlSete;
    ligar(sSel);
  }

  function ligar(sSel) {
    raiz.querySelectorAll(".pl-dia").forEach(function (b) {
      b.addEventListener("click", function () { diaSel = +b.dataset.dia; desenhar(); });
    });
    var svg = raiz.querySelector(".pl-svg"), dica = raiz.querySelector(".pl-dica");
    if (!svg) return;
    function mostrar(ev) {
      var r = svg.getBoundingClientRect(), cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * GW;
      var h = Math.min(23, Math.max(0, Math.floor((cx - GL) / ((GW - GL - GR) / 24))));
      var p = sSel[h], w = ventoEm(diaSel, h);
      raiz.querySelectorAll(".pl-b.sel").forEach(function (e) { e.classList.remove("sel"); });
      var bar = svg.querySelector('[data-h="' + h + '"]'); if (bar) bar.classList.add("sel");
      dica.innerHTML = "<b>" + h + "h às " + (h + 1) + "h</b> · espera " + (p.reg ? "medida" : "prevista") + " de <b>~" + hhmm(p.v) + "</b>" + (w != null ? " · rajadas de " + w + " km/h" + (w >= ALERTA_VENTO ? " ⚠️" : "") : "");
    }
    var alvo = svg.querySelector(".g-alvo");
    alvo.addEventListener("mousemove", mostrar);
    alvo.addEventListener("click", mostrar);
    alvo.addEventListener("touchstart", mostrar, { passive: true });
    alvo.addEventListener("touchmove", mostrar, { passive: true });
  }

  // ---------- dados ----------
  function api(rpc) {
    return fetch(cfg.supabaseUrl + "/rest/v1/rpc/" + rpc, { method: "POST", headers: { apikey: cfg.supabaseAnonKey, "Content-Type": "application/json" }, body: "{}" })
      .then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
  }
  function horaSP(ms) { return +new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date(ms)); }
  function diaSP(ms) { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(ms)); }
  function carregarProprios() {
    if (!cfg.supabaseUrl) return Promise.resolve();
    return Promise.all([api("espera_12h"), api("semaforo_atual"), api("espera_oficial_12h"), api("espera_oficial_atual")]).then(function (r) {
      registrado = {}; aoVivo = {}; oficialAgora = false;
      var hoje = iso(agoraSP());
      (Array.isArray(r[0]) ? r[0] : []).forEach(function (d) {
        var t = new Date(d.hora).getTime();
        if (diaSP(t) === hoje && d.minutos != null) registrado[d.lado + "|" + horaSP(t)] = d.minutos;
      });
      (Array.isArray(r[1]) ? r[1] : []).forEach(function (d) { if (d.espera_mediana != null) aoVivo[d.lado] = d.espera_mediana; });
      // espera oficial (AcquaVias) tem prioridade: horas de hoje e "agora"
      (Array.isArray(r[2]) ? r[2] : []).forEach(function (d) {
        var tt = new Date(d.hora).getTime(); if (diaSP(tt) !== hoje) return;
        if (d.ss != null) registrado["sao-sebastiao|" + horaSP(tt)] = d.ss;
        if (d.ib != null) registrado["ilhabela|" + horaSP(tt)] = d.ib;
      });
      var o = Array.isArray(r[3]) && r[3][0] ? r[3][0] : null;
      if (o) { if (o.ss != null) aoVivo["sao-sebastiao"] = o.ss; if (o.ib != null) aoVivo.ilhabela = o.ib; oficialAgora = true; }
    });
  }
  function carregarVento() {
    return fetch("https://api.open-meteo.com/v1/forecast?latitude=-23.81&longitude=-45.40&hourly=wind_gusts_10m&daily=weather_code&timezone=America%2FSao_Paulo&forecast_days=7")
      .then(function (r) { return r.json(); })
      .then(function (j) {
        vento = {}; clima = {};
        (j.hourly && j.hourly.time || []).forEach(function (t, i) {
          var g = j.hourly.wind_gusts_10m[i]; if (g != null) vento[t.slice(0, 10) + "|" + +t.slice(11, 13)] = Math.round(g);
        });
        (j.daily && j.daily.time || []).forEach(function (t, i) { clima[t] = j.daily.weather_code[i]; });
      }).catch(function () {});
  }

  // seletor de lado (fora da área redesenhada)
  document.querySelectorAll("[data-pl-lado]").forEach(function (b) {
    b.setAttribute("aria-pressed", String(b.dataset.plLado === lado));
    b.addEventListener("click", function () {
      lado = b.dataset.plLado;
      try { localStorage.setItem("vdb-planeje-lado", lado); } catch (e) {}
      document.querySelectorAll("[data-pl-lado]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      desenhar();
    });
  });

  var larg = 0, tR;
  window.addEventListener("resize", function () { var w = raiz.clientWidth; if (Math.abs(w - larg) < 20) return; larg = w; clearTimeout(tR); tR = setTimeout(desenhar, 200); });
  desenhar();
  Promise.all([carregarProprios(), carregarVento()]).then(desenhar);
  setInterval(function () { if (!document.hidden) carregarProprios().then(desenhar); }, 300000);
})();
