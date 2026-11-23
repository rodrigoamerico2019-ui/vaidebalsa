/* Capitão da Balsa — jogo do VAIDEBALSA (canvas 2D, sem imagens pesadas)
   Coordenadas do mundo em metros, no "eixo da travessia":
   u = ao longo da rota (0 = píer de São Sebastião, L = píer de Ilhabela), w = lateral (leste +).
   Rumo th: 0 = apontando para Ilhabela, PI = apontando para São Sebastião. */
(function () {
  "use strict";
  var cv = document.getElementById("tela"), cx = cv.getContext("2d");
  var palco = document.getElementById("palco");
  var W = 300, H = 300;
  var L = 900;                     // comprimento da travessia (m)
  var CONTATO = 32;                // distância do centro da balsa até o píer na atracação
  var VMAX = 12.7;                 // ~ velocidade máxima (m/s do jogo)
  var NOS = 1.05;                  // m/s do jogo -> "nós" mostrados
  var ALERTA_VENTO = 40;

  function $(id) { return document.getElementById(id); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function ang(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  // ---------- estado ----------
  var TIPOS = [
    { e: "🏍️", n: "moto", p: 1, pts: 5, c: 0.6 },
    { e: "🚗", n: "carro", p: 2, pts: 10, c: 1 },
    { e: "🚙", n: "SUV", p: 3, pts: 12, c: 1.15 },
    { e: "🚐", n: "van", p: 3, pts: 12, c: 1.2 },
    { e: "🚚", n: "caminhão", p: 5, pts: 20, c: 1.7 }
  ];
  var CORES = ["#e53935", "#1e88e5", "#fdd835", "#43a047", "#fb8c00", "#8e24aa", "#ffffff", "#546e7a", "#00acc1", "#d81b60"];
  var S = {
    fase: "menu", origem: "ss", vista: "cabine", t: 0,
    w: 0, u: CONTATO, th: 0, v: 0, acel: 0, leme: 0,
    clima: null, deck: { e: [], d: [] }, fila: [], tEmb: 35,
    conforto: 100, rajada: 0, rastro: [], eventos: [], tViagem: 0, percorrido: 0,
    navio: null, golf: null, gotas: [], raio: 0, total: 0, viagens: 0,
    calmo: false, real: false, flags: {}, ultimoHud: 0
  };
  var climaReal = null;

  function destino() { return S.origem === "ss" ? "ib" : "ss"; }
  function uDestino() { return destino() === "ib" ? L : 0; }
  function nomeLado(l) { return l === "ss" ? "São Sebastião" : "Ilhabela"; }
  function progresso() { return clamp(S.origem === "ss" ? S.u / L : 1 - S.u / L, 0, 1); }
  function restante() { return Math.max(0, Math.abs(uDestino() - S.u) - CONTATO); }
  function pesoFaixa(f) { return f.reduce(function (s, x) { return s + x.p; }, 0); }
  function desequilibrio() { return pesoFaixa(S.deck.e) - pesoFaixa(S.deck.d); }
  function limiteConforto() { return VMAX * (1 - 0.42 * S.clima.s); }

  // ---------- avisos ----------
  var avisoEl = $("aviso"), avisoT = 0;
  function aviso(txt, tipo, dur) {
    avisoEl.textContent = txt; avisoEl.className = "aviso ver" + (tipo ? " " + tipo : "");
    clearTimeout(avisoT); avisoT = setTimeout(function () { avisoEl.className = "aviso"; }, dur || 2600);
  }
  function evento(txt, pts) { S.eventos.push({ txt: txt, pts: pts }); }

  // ---------- clima ----------
  var MARES = [{ n: "Calmo", s: 0.2 }, { n: "Moderado", s: 0.6 }, { n: "Bravo", s: 1.1 }];
  function sortearClima() {
    if (S.real && climaReal) return Object.assign({}, climaReal);
    var nivel = Math.min(2, Math.floor(Math.random() * (1.3 + S.viagens * 0.3)));
    if (S.calmo) nivel = Math.min(nivel, 1);
    var m = MARES[nivel];
    return {
      mar: m.n, s: m.s,
      vento: Math.round(rnd(6, 16) + nivel * rnd(6, 15)),
      dirVento: Math.random() < 0.5 ? -1 : 1,
      mare: Math.random() < 0.5 ? "enchente" : "vazante",
      corr: rnd(0.45, 0.9) + nivel * 0.18,
      chuva: Math.random() < 0.15 + nivel * 0.25,
      noite: S.viagens % 4 === 3
    };
  }
  function carregarClimaReal() {
    return Promise.all([
      fetch("https://api.open-meteo.com/v1/forecast?latitude=-23.81&longitude=-45.40&current=wind_gusts_10m,precipitation,is_day&timezone=America%2FSao_Paulo").then(function (r) { return r.json(); }),
      fetch("https://marine-api.open-meteo.com/v1/marine?latitude=-23.78&longitude=-45.36&current=wave_height").then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (r) {
      var c = r[0].current || {}, onda = r[1] && r[1].current ? r[1].current.wave_height : 0.5;
      var nivel = onda < 0.4 ? 0 : onda < 0.9 ? 1 : 2;
      if (S.calmo) nivel = Math.min(nivel, 1);
      climaReal = {
        mar: MARES[nivel].n, s: MARES[nivel].s, vento: Math.round(c.wind_gusts_10m || 10),
        dirVento: Math.random() < 0.5 ? -1 : 1, mare: Math.random() < 0.5 ? "enchente" : "vazante",
        corr: 0.6 + nivel * 0.18, chuva: (c.precipitation || 0) > 0.1, noite: c.is_day === 0, real: true
      };
      return climaReal;
    }).catch(function () { climaReal = null; return null; });
  }

  // ---------- fases ----------
  function mostrar(id, sim) { $(id).hidden = !sim; }
  function irMenu() {
    S.fase = "menu";
    mostrar("tela-menu", true); mostrar("tela-embarque", false); mostrar("tela-fim", false);
    mostrar("hud", false); mostrar("vistas", false); mostrar("controles", false);
    var rec = +(ls("vdb-jogo-recorde") || 0);
    $("recorde").textContent = rec ? "🏆 Seu recorde: " + rec + " pontos" : "";
  }
  function gerarFila() {
    var f = [];
    for (var i = 0; i < 14; i++) {
      var r = Math.random(), t = r < 0.12 ? TIPOS[0] : r < 0.55 ? TIPOS[1] : r < 0.72 ? TIPOS[2] : r < 0.85 ? TIPOS[3] : TIPOS[4];
      f.push(Object.assign({ cor: CORES[Math.floor(Math.random() * CORES.length)] }, t));
    }
    return f;
  }
  function iniciarEmbarque() {
    S.fase = "embarque";
    S.clima = sortearClima();
    S.u = S.origem === "ss" ? CONTATO : L - CONTATO; S.w = 0; S.v = 0;
    S.th = S.origem === "ss" ? 0 : Math.PI;
    S.deck = { e: [], d: [] }; S.fila = gerarFila(); S.tEmb = 35;
    S.conforto = 100; S.eventos = []; S.flags = {}; S.rastro = []; S.tViagem = 0; S.percorrido = 0;
    S.navio = null; S.golf = null; S.rajada = 0; S.raio = 0;
    S.acel = 0; S.leme = 0; $("c-acel").value = 0; $("c-leme").value = 0;
    mostrar("tela-menu", false); mostrar("tela-fim", false); mostrar("tela-embarque", true);
    mostrar("hud", true); mostrar("vistas", false); mostrar("controles", false);
    S.vista = "fora";
    atualizarEmbarque();
    var c = S.clima;
    aviso((c.real ? "Clima real: " : "") + "mar " + c.mar.toLowerCase() + ", vento " + c.vento + " km/h" + (c.chuva ? ", chuva" : "") + (c.noite ? ", noite" : ""), null, 3500);
  }
  function atualizarEmbarque() {
    var prox = S.fila[0];
    $("emb-prox").textContent = prox ? prox.e : "—";
    $("emb-fila").textContent = prox ? prox.n + " · peso " + prox.p + " · +" + prox.pts + " pts · faltam " + S.fila.length : "fila vazia";
    ["e", "d"].forEach(function (lado) {
      var f = S.deck[lado], h = "";
      for (var i = 0; i < 5; i++) h += f[i] ? "<span>" + f[i].e + "</span>" : '<span class="vazio">▢</span>';
      $("faixa-" + lado).innerHTML = h;
    });
    var b = desequilibrio(), el = $("emb-peso"), pct = clamp(Math.abs(b) / 10, 0, 1) * 50;
    el.style.width = pct + "%"; el.style.left = b > 0 ? (50 - pct) + "%" : "50%";
    el.style.background = Math.abs(b) <= 2 ? "#4ade80" : Math.abs(b) <= 5 ? "#FFC107" : "#ef4444";
    var cheio = S.deck.e.length >= 5 && S.deck.d.length >= 5;
    $("btn-esq").disabled = !prox || S.deck.e.length >= 5;
    $("btn-dir").disabled = !prox || S.deck.d.length >= 5;
    $("btn-zarpar").textContent = cheio || !prox ? "⛴️ Zarpar agora" : "⛴️ Zarpar (" + (S.deck.e.length + S.deck.d.length) + " veículos)";
  }
  function embarcar(lado) {
    if (S.fase !== "embarque" || !S.fila.length || S.deck[lado].length >= 5) return;
    S.deck[lado].push(S.fila.shift());
    atualizarEmbarque();
  }
  function zarpar() {
    if (S.fase !== "embarque") return;
    var n = S.deck.e.length + S.deck.d.length;
    if (!n) { aviso("Embarque pelo menos um veículo!", "ruim"); return; }
    S.fase = "viagem";
    mostrar("tela-embarque", false); mostrar("vistas", true); mostrar("controles", true);
    trocarVista("cabine");
    var c = S.clima;
    // agenda eventos da viagem
    if (Math.random() < 0.75) S.navio = { p: rnd(0.3, 0.55), ativo: false, feito: false, u: 0, w: 0, dir: Math.random() < 0.5 ? -1 : 1, vel: rnd(8.5, 11) };
    if (Math.random() < 0.6) S.golf = { p: rnd(0.15, 0.75), ativo: false, feito: false, t: 0, u: 0, w: 0, foto: false };
    S.flags.chuvaNova = !c.chuva && Math.random() < 0.3 ? rnd(0.25, 0.7) : null;
    aviso("Bora! Destino: " + nomeLado(destino()) + ". Acelere com calma.", "bom");
  }
  function atracou(qualidade) {
    S.fase = "fim";
    S.v = 0; S.acel = 0; $("c-acel").value = 0;
    var itens = [], pts = 0;
    var veic = S.deck.e.concat(S.deck.d), pv = veic.reduce(function (s, x) { return s + x.pts; }, 0);
    itens.push(["🚗 " + veic.length + " veículos entregues", pv]);
    itens.push(["⚓ Atracação " + (qualidade >= 40 ? "perfeita" : qualidade >= 20 ? "boa" : "ok"), Math.round(qualidade)]);
    var pc = Math.round(S.conforto / 2); itens.push(["😊 Conforto dos passageiros (" + Math.round(S.conforto) + "%)", pc]);
    var tb = Math.max(0, Math.round((170 - S.tViagem) * 0.6)); itens.push(["⏱️ Tempo de travessia (" + Math.round(S.tViagem) + "s)", tb]);
    S.eventos.forEach(function (e) { itens.push([e.txt, e.pts]); });
    itens.forEach(function (i) { pts += i[1]; });
    pts = Math.max(0, pts);
    S.total += pts; S.viagens++;
    var rec = +(ls("vdb-jogo-recorde") || 0);
    if (S.total > rec) ls("vdb-jogo-recorde", String(S.total));
    $("fim-tit").textContent = "⚓ Atracou em " + nomeLado(destino()) + "!";
    $("fim-lista").innerHTML = itens.map(function (i) { return "<li" + (i[1] < 0 ? ' class="neg"' : "") + "><span>" + i[0] + "</span><b>" + (i[1] > 0 ? "+" : "") + i[1] + "</b></li>"; }).join("");
    $("fim-pts").textContent = pts; $("fim-total").textContent = S.total; $("fim-viagens").textContent = S.viagens;
    $("btn-proxima").textContent = "Próxima viagem: voltar para " + nomeLado(S.origem);
    mostrar("controles", false); mostrar("vistas", false);
    setTimeout(function () { mostrar("tela-fim", true); }, 900);
    aviso("⚓ Atracado! Desembarcando os carros…", "bom");
  }

  // ---------- física ----------
  function passo(dt) {
    S.t += dt;
    atualizarChuva(dt);
    if (S.fase === "embarque") {
      S.tEmb -= dt;
      $("emb-tempo").textContent = Math.max(0, Math.ceil(S.tEmb)) + "s";
      if (S.tEmb <= 0) { if (S.deck.e.length + S.deck.d.length === 0) embarcar("e"); zarpar(); }
      return;
    }
    if (S.fase !== "viagem") return;
    var c = S.clima;
    S.tViagem += dt;
    // motor e leme
    var a = S.acel * 1.4 - 0.11 * S.v;
    S.v = clamp(S.v + a * dt, -6, VMAX + 1);
    var giro = S.leme * 0.5 * clamp(Math.abs(S.v) / 6, 0.15, 1) * (S.v < 0 ? -1 : 1);
    S.th = ang(S.th + giro * dt);
    // maré (corrente lateral, mais forte no meio do canal) e vento
    var meio = Math.sin(Math.PI * clamp(S.u / L, 0, 1));
    var corr = (c.mare === "enchente" ? 1 : -1) * c.corr * (0.35 + 0.65 * meio);
    if (c.vento >= 25 && S.rajada <= 0.05 && Math.random() < dt * 0.08) { S.rajada = 1; aviso("💨 Rajada de vento! Segure o rumo.", "ruim"); }
    S.rajada = Math.max(0, S.rajada - dt * 0.35);
    var vento = c.dirVento * c.vento * 0.012 * (1 + 1.6 * S.rajada);
    // perto dos píeres a água é abrigada: menos corrente e vento
    var abrigo = clamp(Math.min(S.u, L - S.u) / 160, 0.2, 1);
    var dw = Math.sin(S.th) * S.v + (corr + vento) * abrigo, du = Math.cos(S.th) * S.v;
    S.w += dw * dt; S.u += du * dt;
    S.percorrido += Math.abs(S.v) * dt;
    // rastro para o mapa
    if (!S.rastro.length || Math.hypot(S.rastro[S.rastro.length - 1][0] - S.w, S.rastro[S.rastro.length - 1][1] - S.u) > 8) {
      S.rastro.push([S.w, S.u]); if (S.rastro.length > 160) S.rastro.shift();
    }
    // conforto: acima do limite seguro para o mar, os passageiros sofrem
    var lim = limiteConforto(), exc = Math.abs(S.v) - lim;
    if (exc > 0) S.conforto -= exc * c.s * 1.6 * dt; else S.conforto += 0.6 * dt;
    S.conforto = clamp(S.conforto, 0, 100);
    if (exc > 1.5 && !S.flags.avisoMar) { S.flags.avisoMar = 1; aviso("🌊 Mar " + c.mar.toLowerCase() + ": reduza para no máximo " + Math.round(lim * NOS) + " nós", "ruim"); }
    if (S.conforto < 30 && !S.flags.enjoo) { S.flags.enjoo = 1; evento("🤢 Passageiros enjoados", -10); aviso("🤢 Os passageiros estão enjoando! Vá mais devagar.", "ruim"); }
    if (c.s >= 0.6 && Math.abs(desequilibrio()) >= 5 && exc > 0 && !S.flags.carga) {
      S.flags.carga = 1; evento("📦 Carga deslizou (balsa desequilibrada)", -15); aviso("📦 A carga deslizou! Balsa torta no mar agitado.", "ruim");
    }
    // água rasa nas laterais
    if (Math.abs(S.w) > 420) {
      S.v *= Math.pow(0.6, dt); S.w -= Math.sign(S.w) * 6 * dt;
      if (!S.flags.raso) { S.flags.raso = 1; aviso("⚠️ Água rasa! Volte para o canal.", "ruim"); }
    } else if (Math.abs(S.w) < 380) S.flags.raso = 0;
    var p = progresso();
    // chuva que começa no meio do caminho
    if (S.flags.chuvaNova && p >= S.flags.chuvaNova) { S.flags.chuvaNova = null; c.chuva = true; aviso("🌧️ Começou a chover! A visibilidade caiu.", null); }
    eventosNavio(dt, p);
    eventosGolfinho(dt, p);
    if (c.chuva && c.s >= 1 && !S.calmo && Math.random() < dt * 0.06) S.raio = 1;
    S.raio = Math.max(0, S.raio - dt * 3);
    verificarChegada(dt);
  }
  function eventosNavio(dt, p) {
    var n = S.navio; if (!n || n.feito) return;
    var dir = S.origem === "ss" ? 1 : -1;
    if (!n.ativo && p >= n.p) {
      n.ativo = true; n.u = S.u + dir * 260; n.w = -n.dir * rnd(260, 380);
      aviso("🚢 Navio cargueiro cruzando à frente! Cuidado.", "ruim", 3500);
    }
    if (!n.ativo) return;
    n.w += n.dir * n.vel * dt;
    var du = Math.abs(n.u - S.u), dw = Math.abs(n.w - S.w);
    n.perto = du < 140 && dw < 220;
    if (!n.bateu && du < 30 + 13 && dw < 8 + 70) {
      n.bateu = true; S.v = -2.5; S.conforto = Math.max(0, S.conforto - 25);
      evento("💥 Batida no navio cargueiro", -60); aviso("💥 Batemos no navio! Espere ele passar.", "ruim", 3500);
    }
    if (Math.abs(n.w) > 820) { n.feito = true; n.ativo = false; if (!n.bateu) evento("🚢 Navio cruzou sem susto", 15); }
  }
  function eventosGolfinho(dt, p) {
    var g = S.golf; if (!g || g.feito) return;
    if (!g.ativo && p >= g.p) {
      g.ativo = true; g.t = 8; g.u = S.u + (S.origem === "ss" ? 1 : -1) * 60; g.w = S.w + (Math.random() < 0.5 ? -40 : 40);
      $("btn-foto").hidden = false; aviso("🐬 Golfinhos ao lado da balsa! Tire uma foto 📸", "bom", 3000);
    }
    if (!g.ativo) return;
    g.t -= dt; g.u += (S.origem === "ss" ? 1 : -1) * Math.max(2, S.v) * dt;
    if (g.t <= 0) { g.ativo = false; g.feito = true; $("btn-foto").hidden = true; }
  }
  function verificarChegada(dt) {
    var paraIb = destino() === "ib";
    var linha = paraIb ? L - CONTATO : CONTATO;
    var passou = paraIb ? S.u >= linha : S.u <= linha;
    // margem de origem (não deixa voltar para dentro da terra)
    var linhaOrig = paraIb ? CONTATO : L - CONTATO;
    if (paraIb ? S.u < linhaOrig : S.u > linhaOrig) { S.u = linhaOrig; S.v = 0; }
    // assistência de atracação (cabos): perto e devagar, a balsa é puxada para o píer
    var falta = Math.abs(linha - S.u);
    if (falta < 90 && Math.abs(S.w) < 40 && Math.abs(S.v) < 2.6) {
      S.w *= Math.pow(0.5, dt);
      var alvo = paraIb ? 0 : Math.PI;
      S.th = ang(S.th + ang(alvo - S.th) * Math.min(1, dt * 1.2));
      if (!S.flags.cabos) { S.flags.cabos = 1; aviso("🪢 Lançando os cabos… devagar até encostar!", "bom"); }
    }
    if (falta < 90 && Math.abs(S.v) > 4 && !S.flags.devagar) { S.flags.devagar = 1; aviso("⚠️ Píer perto! Reduza a velocidade.", "ruim"); }
    if (!passou) return;
    var alvoTh = paraIb ? 0 : Math.PI, erro = Math.abs(ang(S.th - alvoTh));
    var vel = Math.abs(S.v);
    if (Math.abs(S.w) < 16 && vel <= 3.2 && erro < 0.6) {
      S.u = linha; S.w = 0;
      atracou(clamp((3.2 - vel) / 3.2 * 30 + (0.6 - erro) / 0.6 * 20, 0, 50));
      return;
    }
    // bateu no píer ou na pedra
    S.u = linha + (paraIb ? -2 : 2);
    var novo = S.tViagem - (S.flags.ultBatida || -99) > 6;
    S.flags.ultBatida = S.tViagem;
    if (Math.abs(S.w) < 45) { if (novo) evento("💥 Batida no píer", -25); aviso("💥 Bateu no píer! Volte um pouco e venha mais devagar.", "ruim", 3200); }
    else { if (novo) evento("🪨 Encalhou na margem", -20); aviso("🪨 Encalhou fora do píer! Dê ré e alinhe com o píer.", "ruim", 3200); }
    S.v = -1.4; S.conforto = Math.max(0, S.conforto - 8);
    S.flags.devagar = 0;
  }

  // ---------- chuva (partículas) ----------
  function atualizarChuva(dt) {
    var c = S.clima, quer = c && c.chuva ? (c.s >= 1 ? 140 : 90) : 0;
    while (S.gotas.length < quer) S.gotas.push({ x: Math.random(), y: Math.random(), v: rnd(0.8, 1.3) });
    if (S.gotas.length > quer) S.gotas.length = quer;
    S.gotas.forEach(function (g) {
      g.y += dt * g.v * 1.4; g.x += dt * (c ? c.dirVento * c.vento * 0.006 : 0);
      if (g.y > 1) { g.y -= 1; g.x = Math.random(); }
      if (g.x > 1) g.x -= 1; if (g.x < 0) g.x += 1;
    });
  }

  // ---------- desenho: utilitários ----------
  function corCeu() {
    var c = S.clima || { noite: false, chuva: false };
    if (c.noite) return ["#06142b", "#1b3a63"];
    if (c.chuva) return ["#5b6b7c", "#a3b0bd"];
    return ["#4aa8ff", "#d6efff"];
  }
  function corMar() {
    var c = S.clima || { s: 0.2, noite: false };
    if (c.noite) return ["#0b2b4d", "#051a30"];
    if (c.s >= 1) return ["#2a6688", "#0d3550"];
    if (c.s >= 0.5) return ["#1f7bb8", "#0c4a78"];
    return ["#29a0e0", "#0d66a8"];
  }
  function amp() { return 2 + (S.clima ? S.clima.s : 0.2) * 12; }
  function ondaY(x, fase) {
    var A = amp();
    return Math.sin(x * 0.013 + S.t * 1.3 + fase) * A * 0.6 + Math.sin(x * 0.031 - S.t * 2.0 + fase * 2) * A * 0.4;
  }
  function rolagem() {
    var c = S.clima || { s: 0.2 }, b = desequilibrio();
    var base = Math.sin(S.t * 1.1) * c.s * 0.045 + Math.sin(S.t * 0.53) * c.s * 0.02;
    var tort = clamp(b, -10, 10) * 0.004 * (0.4 + c.s);
    return S.calmo ? base * 0.5 + tort : base + tort;
  }
  function arfagem() { var c = S.clima || { s: 0.2 }; return Math.sin(S.t * 1.4) * c.s * (S.calmo ? 3 : 6); }
  function ret(x, y, w, h, r) {
    cx.beginPath(); cx.moveTo(x + r, y); cx.lineTo(x + w - r, y); cx.quadraticCurveTo(x + w, y, x + w, y + r);
    cx.lineTo(x + w, y + h - r); cx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); cx.lineTo(x + r, y + h);
    cx.quadraticCurveTo(x, y + h, x, y + h - r); cx.lineTo(x, y + r); cx.quadraticCurveTo(x, y, x + r, y); cx.closePath();
  }
  function ceu(hz) {
    var c = corCeu(), g = cx.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, c[0]); g.addColorStop(1, c[1]);
    cx.fillStyle = g; cx.fillRect(-W, -H, W * 3, hz + H);
    var cl = S.clima || {};
    if (cl.noite) { // estrelas e lua
      cx.fillStyle = "rgba(255,255,255,.8)";
      for (var i = 0; i < 40; i++) { var sx = (i * 97) % W, sy = (i * 53) % Math.max(1, hz * 0.8); cx.fillRect(sx, sy, 1.5, 1.5); }
      cx.fillStyle = "#fff8d6"; cx.beginPath(); cx.arc(W * 0.8, hz * 0.25, 14, 0, 7); cx.fill();
    } else if (!cl.chuva) { // sol e nuvens
      cx.fillStyle = "rgba(255,236,150,.9)"; cx.beginPath(); cx.arc(W * 0.82, hz * 0.28, 18, 0, 7); cx.fill();
    }
    cx.fillStyle = cl.chuva ? "rgba(70,80,92,.55)" : "rgba(255,255,255,.75)";
    for (var k = 0; k < 4; k++) {
      var nx = ((k * 0.31 + S.t * 0.006 + S.percorrido * 0.0004) % 1.2 - 0.1) * W, ny = hz * (0.18 + k * 0.13);
      cx.beginPath(); cx.ellipse(nx, ny, 34, 10, 0, 0, 7); cx.ellipse(nx + 22, ny - 6, 22, 10, 0, 0, 7); cx.ellipse(nx - 20, ny + 2, 20, 8, 0, 0, 7); cx.fill();
    }
  }
  function ilha(x, base, larg, alt, tipo) {
    if (larg < 2) return;
    var verde = (S.clima && S.clima.noite) ? "#0f2a22" : tipo === "ib" ? "#2e7d4f" : "#5f8a62";
    cx.fillStyle = verde;
    cx.beginPath(); cx.moveTo(x - larg / 2, base);
    if (tipo === "ib") { // Ilhabela: montanhas altas
      cx.lineTo(x - larg * 0.35, base - alt * 0.55); cx.lineTo(x - larg * 0.18, base - alt * 0.8); cx.lineTo(x - larg * 0.05, base - alt);
      cx.lineTo(x + larg * 0.12, base - alt * 0.72); cx.lineTo(x + larg * 0.28, base - alt * 0.85); cx.lineTo(x + larg * 0.42, base - alt * 0.4);
    } else { // São Sebastião: morros mais baixos
      cx.lineTo(x - larg * 0.3, base - alt * 0.7); cx.lineTo(x - larg * 0.1, base - alt * 0.5); cx.lineTo(x + larg * 0.15, base - alt * 0.9); cx.lineTo(x + larg * 0.4, base - alt * 0.45);
    }
    cx.lineTo(x + larg / 2, base); cx.closePath(); cx.fill();
    if (tipo === "ss" && larg > 60) { // prédios da cidade
      cx.fillStyle = (S.clima && S.clima.noite) ? "#2b3a4f" : "#e9e2d2";
      for (var i = 0; i < 9; i++) { var bx = x - larg * 0.4 + i * larg * 0.09, bh = alt * (0.12 + ((i * 37) % 5) * 0.05); cx.fillRect(bx, base - bh, larg * 0.06, bh); }
      if (S.clima && S.clima.noite) { cx.fillStyle = "#ffd76a"; for (var j = 0; j < 9; j++) cx.fillRect(x - larg * 0.38 + j * larg * 0.09, base - alt * 0.08, 2, 2); }
    }
  }
  function marLateral(hz) {
    var c = corMar(), g = cx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, c[0]); g.addColorStop(1, c[1]);
    cx.fillStyle = g; cx.fillRect(-W, hz, W * 3, H * 2);
    var off = S.percorrido * 2.2 * (S.origem === "ss" ? 1 : -1);
    for (var k = 0; k < 6; k++) {
      var y = hz + (H - hz) * (0.08 + k * 0.17), esc = 0.3 + k * 0.25;
      cx.strokeStyle = "rgba(255,255,255," + (0.1 + k * 0.03) + ")"; cx.lineWidth = 1 + k * 0.4;
      cx.beginPath();
      for (var x = -20; x <= W + 20; x += 14) {
        var yy = y + ondaY(x * 1 + off * esc, k) * esc * 0.5;
        if (x === -20) cx.moveTo(x, yy); else cx.lineTo(x, yy);
      }
      cx.stroke();
    }
  }
  function carroLado(x, y, larg, v, escuro) {
    var h = larg * 0.42;
    cx.fillStyle = escuro ? sombra(v.cor) : v.cor;
    if (v.n === "caminhão") {
      ret(x, y - h * 1.25, larg * 0.68, h * 1.25, 2); cx.fill();
      cx.fillStyle = escuro ? "#7a8a99" : "#cfd8dc"; ret(x + larg * 0.7, y - h * 0.9, larg * 0.3, h * 0.9, 3); cx.fill();
    } else if (v.n === "moto") {
      cx.fillRect(x + larg * 0.2, y - h * 0.5, larg * 0.6, h * 0.25);
    } else {
      ret(x, y - h * 0.62, larg, h * 0.62, 3); cx.fill();
      ret(x + larg * 0.18, y - h, larg * 0.6, h * 0.45, 4); cx.fill();
      cx.fillStyle = "rgba(180,220,255,.85)"; cx.fillRect(x + larg * 0.24, y - h * 0.92, larg * 0.2, h * 0.28); cx.fillRect(x + larg * 0.5, y - h * 0.92, larg * 0.2, h * 0.28);
    }
    cx.fillStyle = "#222"; cx.beginPath(); cx.arc(x + larg * 0.22, y, h * 0.2, 0, 7); cx.arc(x + larg * 0.78, y, h * 0.2, 0, 7); cx.fill();
  }
  function sombra(hex) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) * 0.65, g = ((n >> 8) & 255) * 0.65, b = (n & 255) * 0.65;
    return "rgb(" + (r | 0) + "," + (g | 0) + "," + (b | 0) + ")";
  }
  function balsaLado(x, y, roll, Lp) {
    cx.save(); cx.translate(x, y); cx.rotate(roll);
    var dir = S.origem === "ss" ? 1 : -1;
    cx.scale(dir, 1);
    // casco
    cx.fillStyle = "#0A2C52";
    cx.beginPath(); cx.moveTo(-Lp / 2, -Lp * 0.02); cx.lineTo(Lp / 2, -Lp * 0.02); cx.lineTo(Lp / 2 - Lp * 0.05, Lp * 0.075); cx.lineTo(-Lp / 2 + Lp * 0.05, Lp * 0.075); cx.closePath(); cx.fill();
    cx.fillStyle = "#FFC107"; cx.fillRect(-Lp / 2, -Lp * 0.025, Lp, Lp * 0.018);
    cx.fillStyle = "#00B8A9"; cx.fillRect(-Lp / 2 + Lp * 0.05, Lp * 0.05, Lp - Lp * 0.1, Lp * 0.008);
    // rampas
    cx.fillStyle = "#37474f";
    cx.fillRect(Lp / 2 - Lp * 0.01, -Lp * 0.11, Lp * 0.012, Lp * 0.09); cx.fillRect(-Lp / 2, -Lp * 0.11, Lp * 0.012, Lp * 0.09);
    // carros: faixa de trás (mais escura) e da frente
    var deckY = -Lp * 0.03, cw = Lp * 0.15;
    [["d", true, -Lp * 0.012], ["e", false, 0]].forEach(function (f) {
      var lista = S.deck[f[0]];
      for (var i = 0; i < lista.length; i++) carroLado(-Lp * 0.44 + i * (cw + Lp * 0.026) + (f[1] ? Lp * 0.03 : 0), deckY + f[2], cw * Math.min(1, lista[i].c), lista[i], f[1]);
    });
    // grade lateral
    cx.strokeStyle = "rgba(255,255,255,.85)"; cx.lineWidth = 1.2;
    cx.beginPath(); cx.moveTo(-Lp / 2 + 4, -Lp * 0.045); cx.lineTo(Lp / 2 - 4, -Lp * 0.045); cx.stroke();
    // ponte de comando (cabine) sobre pilares
    cx.fillStyle = "#eef3f8"; cx.fillRect(-Lp * 0.07, -Lp * 0.17, Lp * 0.012, Lp * 0.13); cx.fillRect(Lp * 0.058, -Lp * 0.17, Lp * 0.012, Lp * 0.13);
    ret(-Lp * 0.1, -Lp * 0.24, Lp * 0.2, Lp * 0.075, 4); cx.fill();
    cx.fillStyle = "#0D6EFD"; for (var j = 0; j < 4; j++) cx.fillRect(-Lp * 0.088 + j * Lp * 0.045, -Lp * 0.225, Lp * 0.035, Lp * 0.03);
    cx.fillStyle = "#0A2C52"; cx.fillRect(-Lp * 0.1, -Lp * 0.25, Lp * 0.2, Lp * 0.012);
    // mastro e bandeira
    cx.strokeStyle = "#cfd8dc"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(0, -Lp * 0.25); cx.lineTo(0, -Lp * 0.33); cx.stroke();
    var tremor = Math.sin(S.t * 6) * 2 * (S.clima ? (S.clima.vento / 30) : 1);
    cx.fillStyle = "#FFC107"; cx.beginPath(); cx.moveTo(0, -Lp * 0.33); cx.lineTo(-Lp * 0.05 * (S.clima ? S.clima.dirVento * dir : 1), -Lp * 0.315 + tremor); cx.lineTo(0, -Lp * 0.3); cx.fill();
    // luzes de navegação à noite
    if (S.clima && S.clima.noite) {
      cx.fillStyle = "#ff5252"; cx.beginPath(); cx.arc(-Lp * 0.1, -Lp * 0.25, 2.5, 0, 7); cx.fill();
      cx.fillStyle = "#69f0ae"; cx.beginPath(); cx.arc(Lp * 0.1, -Lp * 0.25, 2.5, 0, 7); cx.fill();
      cx.fillStyle = "#fff"; cx.beginPath(); cx.arc(0, -Lp * 0.33, 2.5, 0, 7); cx.fill();
    }
    cx.restore();
  }
  function pierLado(x, base, lado) {
    var esc = Math.min(W, 520) / 520;
    cx.fillStyle = "#6d6457"; cx.fillRect(x - (lado > 0 ? 0 : 220 * esc), base - 6 * esc, 220 * esc, 18 * esc);
    cx.fillStyle = "#FFC107"; cx.fillRect(x - (lado > 0 ? 0 : 220 * esc), base - 8 * esc, 220 * esc, 3 * esc);
    cx.fillStyle = "#4e4a42"; for (var i = 0; i < 5; i++) cx.fillRect(x + (lado > 0 ? i * 44 : -i * 44 - 8) * esc, base + 10 * esc, 8 * esc, 26 * esc);
    cx.fillStyle = "#eceff1"; cx.fillRect(x + (lado > 0 ? 40 : -90) * esc, base - 40 * esc, 50 * esc, 34 * esc);
    cx.fillStyle = "#0A2C52"; cx.fillRect(x + (lado > 0 ? 40 : -90) * esc, base - 44 * esc, 50 * esc, 6 * esc);
  }
  function efeitosTempo(vidro) {
    var c = S.clima || {};
    if (c.chuva && S.gotas.length) {
      cx.strokeStyle = vidro ? "rgba(220,235,255,.55)" : "rgba(220,235,255,.45)"; cx.lineWidth = vidro ? 1.6 : 1;
      var inc = c.dirVento * c.vento * 0.25;
      cx.beginPath();
      S.gotas.forEach(function (g) { var x = g.x * W, y = g.y * H; cx.moveTo(x, y); cx.lineTo(x + inc * 0.3, y + 12 + c.s * 6); });
      cx.stroke();
    }
    if (c.vento >= 25 || S.rajada > 0.3) {
      cx.strokeStyle = "rgba(255,255,255," + (0.12 + S.rajada * 0.2) + ")"; cx.lineWidth = 1;
      for (var i = 0; i < 8; i++) {
        var y = ((i * 71) % 100) / 100 * H * 0.6, x = (((S.t * 200 * c.dirVento + i * 133) % (W + 200)) + W + 200) % (W + 200) - 100;
        cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + 40 * c.dirVento, y); cx.stroke();
      }
    }
    if (S.raio > 0 && !S.calmo) { cx.fillStyle = "rgba(255,255,255," + (S.raio * 0.55) + ")"; cx.fillRect(0, 0, W, H); }
  }

  // ---------- visão 1: de fora ----------
  function desenharFora() {
    var hz = H * 0.42, p = progresso(), orig = S.origem, dest = destino();
    cx.save();
    ceu(hz);
    var dirTela = 1; // destino sempre à direita da tela
    ilha(W * (0.86 - 0.12 * p), hz, W * (0.25 + 0.55 * p), H * (0.07 + 0.13 * p), dest);
    ilha(W * (0.1 - 0.15 * p), hz, W * (0.5 - 0.3 * p), H * (0.14 - 0.08 * p), orig);
    marLateral(hz);
    // navio cargueiro (quando perto)
    var n = S.navio;
    if (n && n.ativo) {
      var dist = Math.abs(n.u - S.u), esc = clamp(1.4 - dist / 300, 0.25, 1.3), nx = W * 0.5 + (n.w - S.w) * 0.9 * dirTela;
      var ny = hz + (H * 0.6 - hz) * clamp(1 - dist / 400, 0.05, 0.9) * 0.55;
      navioLado(nx, ny, esc);
    }
    // píers
    var k = Math.min(W, 520) / 300, xF = W * 0.5, base = H * 0.6;
    var andou = Math.abs(S.u - (orig === "ss" ? CONTATO : L - CONTATO)), falta = restante();
    var Lp = Math.min(W * 0.62, 420);
    if (falta < 260) pierLado(xF + Lp / 2 + falta * k, base, 1);
    if (andou < 260) pierLado(xF - Lp / 2 - andou * k, base, -1);
    // golfinhos
    var g = S.golf;
    if (g && g.ativo) {
      for (var i = 0; i < 3; i++) {
        var fase = (S.t * 1.6 + i * 0.7) % 2, gx = xF + Lp * 0.2 + i * 40 + Math.sin(S.t + i) * 10, gy = base + 30 - Math.sin(Math.min(1, fase) * Math.PI) * 40;
        if (fase < 1) { cx.fillStyle = "#5d7f99"; cx.beginPath(); cx.ellipse(gx, gy, 16, 6, -0.6 + fase * 1.2, 0, 7); cx.fill(); }
      }
    }
    var yB = base + ondaY(xF, 0) * 0.45, roll = rolagem();
    balsaLado(xF, yB, roll, Lp);
    // espuma na proa
    if (Math.abs(S.v) > 1) {
      cx.fillStyle = "rgba(255,255,255,.6)";
      for (var e = 0; e < 6; e++) { cx.beginPath(); cx.arc(xF + Lp / 2 + e * 8 - 10, yB + Lp * 0.06 + Math.sin(S.t * 8 + e) * 2, 3 + Math.abs(S.v) * 0.3, 0, 7); cx.fill(); }
    }
    cx.restore();
    efeitosTempo(false);
  }
  function navioLado(x, y, esc) {
    cx.save(); cx.translate(x, y); cx.scale(esc, esc);
    cx.fillStyle = "#37474f"; cx.beginPath(); cx.moveTo(-110, -6); cx.lineTo(110, -6); cx.lineTo(96, 16); cx.lineTo(-104, 16); cx.closePath(); cx.fill();
    var cores = ["#c62828", "#1565c0", "#2e7d32", "#f9a825", "#6a1b9a"];
    for (var i = 0; i < 9; i++) { cx.fillStyle = cores[i % 5]; cx.fillRect(-92 + i * 18, -22 - (i % 2) * 8, 16, 16 + (i % 2) * 8); }
    cx.fillStyle = "#eceff1"; cx.fillRect(70, -40, 24, 34);
    cx.fillStyle = "#263238"; cx.fillRect(74, -36, 16, 6);
    cx.restore();
  }

  // ---------- visão 2: cabine ----------
  function desenharCabine() {
    var base = H * 0.66, hz = base * 0.48, p = progresso();
    var roll = rolagem(), arf = arfagem();
    cx.save();
    cx.beginPath(); cx.rect(0, 0, W, base); cx.clip();
    cx.translate(W / 2, base * 0.5); cx.rotate(-roll * 0.8); cx.translate(-W / 2, -base * 0.5 + arf);
    ceu(hz);
    var c = corMar(), g = cx.createLinearGradient(0, hz, 0, base);
    g.addColorStop(0, c[0]); g.addColorStop(1, c[1]);
    cx.fillStyle = g; cx.fillRect(-W, hz, W * 3, base);
    // destino: posição na tela pelo erro de rumo
    var dw = 0 - S.w, du = uDestino() - S.u;
    var marc = Math.atan2(dw, du), erro = ang(marc - S.th), fov = 1.15;
    var xI = W / 2 + erro / fov * W;
    var tam = 0.12 + 1.2 * Math.pow(p, 1.6);
    var dest = destino();
    ilha(xI, hz, W * tam * 1.4, base * (0.06 + 0.22 * Math.pow(p, 1.3)), dest);
    // píer e rampa quando chegando
    if (p > 0.6) {
      var pw = W * (0.04 + 0.5 * Math.pow((p - 0.6) / 0.4, 2)), ph = pw * 0.18;
      cx.fillStyle = "#6d6457"; cx.fillRect(xI - pw / 2, hz - ph * 0.2, pw, ph);
      cx.fillStyle = "#FFC107"; cx.fillRect(xI - pw / 2, hz - ph * 0.2, pw, ph * 0.15);
      cx.fillStyle = "#eceff1"; cx.fillRect(xI + pw * 0.15, hz - ph * 1.6, pw * 0.25, ph * 1.4);
      // faixas de alinhamento
      cx.strokeStyle = "rgba(255,193,7,.8)"; cx.lineWidth = 2;
      cx.beginPath(); cx.moveTo(xI, hz + ph); cx.lineTo(W / 2 + (xI - W / 2) * 0.2, base); cx.stroke();
    }
    for (var k = 1; k < 7; k++) {
      var yy = hz + (base - hz) * Math.pow(k / 7, 1.6);
      cx.strokeStyle = "rgba(255,255,255," + (0.06 + k * 0.025) + ")"; cx.lineWidth = 1 + k * 0.3;
      cx.beginPath();
      for (var x = -20; x <= W + 20; x += 16) { var o = ondaY(x * (2 - k * 0.2) + S.percorrido * 3, k) * k * 0.08; if (x === -20) cx.moveTo(x, yy + o); else cx.lineTo(x, yy + o); }
      cx.stroke();
    }
    // navio cargueiro pelo rumo
    var n = S.navio;
    if (n && n.ativo) {
      var nm = Math.atan2(n.w - S.w, n.u - S.u), ne = ang(nm - S.th), d = Math.hypot(n.w - S.w, n.u - S.u);
      if (Math.abs(ne) < 1.2) navioLado(W / 2 + ne / fov * W, hz + 4, clamp(90 / d, 0.15, 1.3));
    }
    // golfinhos
    var gf = S.golf;
    if (gf && gf.ativo) {
      for (var i = 0; i < 3; i++) {
        var fs = (S.t * 1.5 + i * 0.6) % 2;
        if (fs < 1) { cx.fillStyle = "#5d7f99"; cx.beginPath(); cx.ellipse(W * (0.2 + i * 0.07), hz + (base - hz) * 0.45 - Math.sin(fs * Math.PI) * 26, 12, 5, -0.6 + fs * 1.2, 0, 7); cx.fill(); }
      }
    }
    // convés da balsa à frente (perspectiva) com os carros
    var topoD = base - (base - hz) * 0.42, D = Math.min(W, H * 1.1), m = W / 2;
    cx.fillStyle = "#4a5a66";
    cx.beginPath(); cx.moveTo(m - D * 0.46, base); cx.lineTo(m + D * 0.46, base); cx.lineTo(m + D * 0.16, topoD); cx.lineTo(m - D * 0.16, topoD); cx.closePath(); cx.fill();
    cx.fillStyle = "#FFC107";
    cx.beginPath(); cx.moveTo(m - D * 0.16, topoD); cx.lineTo(m + D * 0.16, topoD); cx.lineTo(m + D * 0.165, topoD + 4); cx.lineTo(m - D * 0.165, topoD + 4); cx.fill();
    ["e", "d"].forEach(function (lado, li) {
      var lista = S.deck[lado];
      for (var j = lista.length - 1; j >= 0; j--) {
        var t = (j + 0.5) / 5, y = topoD + (base - topoD) * (1 - t), esc = 0.45 + 0.55 * (1 - t);
        var xc = W / 2 + (li === 0 ? -1 : 1) * D * (0.07 + 0.16 * (1 - t));
        var cw = D * 0.12 * esc, ch = cw * 0.55;
        cx.fillStyle = lista[j].cor; ret(xc - cw / 2, y - ch, cw, ch, 4 * esc); cx.fill();
        cx.fillStyle = "rgba(20,30,40,.45)"; ret(xc - cw * 0.32, y - ch * 0.85, cw * 0.64, ch * 0.4, 3 * esc); cx.fill();
      }
    });
    cx.restore();
    // vidro: chuva + limpador
    cx.save(); cx.beginPath(); cx.rect(0, 0, W, base); cx.clip();
    efeitosTempo(true);
    if (S.clima && S.clima.chuva) {
      var a = Math.sin(S.t * 2.2) * 0.9;
      [W * 0.25, W * 0.75].forEach(function (px) {
        cx.save(); cx.translate(px, base - 6); cx.rotate(a); cx.strokeStyle = "#111"; cx.lineWidth = 4; cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(0, -base * 0.42); cx.stroke(); cx.restore();
      });
    }
    cx.restore();
    // moldura da janela
    cx.fillStyle = "#0A2C52";
    cx.fillRect(0, 0, W, 10); cx.fillRect(0, 0, 10, base); cx.fillRect(W - 10, 0, 10, base);
    cx.fillRect(W * 0.33 - 5, 0, 10, base); cx.fillRect(W * 0.67 - 5, 0, 10, base);
    // indicador quando o destino sai da tela
    if (Math.abs(xI - W / 2) > W * 0.5) {
      cx.fillStyle = "#FFC107"; cx.font = "800 14px Montserrat, sans-serif"; cx.textAlign = xI < 0 ? "left" : "right";
      cx.fillText(xI < 0 ? "◀ " + nomeLado(destino()) : nomeLado(destino()) + " ▶", xI < 0 ? 18 : W - 18, 30);
    }
    painel(base);
  }
  function painel(top) {
    var g = cx.createLinearGradient(0, top, 0, H);
    g.addColorStop(0, "#1f2f40"); g.addColorStop(1, "#0d1722");
    cx.fillStyle = g; cx.fillRect(0, top, W, H - top);
    cx.fillStyle = "#FFC107"; cx.fillRect(0, top, W, 3);
    var r = Math.min(W * 0.11, (H - top) * 0.36), yG = top + (H - top) * 0.5;
    // velocímetro
    var vx = W * 0.13 + 4;
    mostrador(vx, yG, r, Math.abs(S.v) * NOS, 14, "nós", limiteConforto() * NOS);
    // radar
    radar(W * 0.87 - 4, yG, r);
    // manetes com as mãos
    var bx1 = W * 0.4, bx2 = W * 0.6, by = H - 6, len = (H - top) * 0.62;
    // trilho do acelerador
    cx.fillStyle = "#0b121a"; ret(bx1 - 7, by - len - 4, 14, len + 4, 6); cx.fill();
    var ky = by - len * (0.34 + 0.6 * ((S.acel + 0.5) / 1.5) - 0.0);
    cx.strokeStyle = "#90a4ae"; cx.lineWidth = 6; cx.lineCap = "round";
    cx.beginPath(); cx.moveTo(bx1, by - 4); cx.lineTo(bx1, ky); cx.stroke();
    cx.fillStyle = "#e53935"; cx.beginPath(); cx.arc(bx1, ky, 10, 0, 7); cx.fill();
    // leme (alavanca inclinada)
    var ang2 = S.leme * 0.7, kx2 = bx2 + Math.sin(ang2) * len * 0.7, ky2 = by - Math.cos(ang2) * len * 0.7;
    cx.fillStyle = "#0b121a"; ret(bx2 - 26, by - 12, 52, 12, 6); cx.fill();
    cx.beginPath(); cx.moveTo(bx2, by - 6); cx.lineTo(kx2, ky2); cx.stroke();
    cx.fillStyle = "#1e88e5"; cx.beginPath(); cx.arc(kx2, ky2, 10, 0, 7); cx.fill();
    // braços e mãos
    mao(-10, H + 40, bx1, ky);
    mao(W + 10, H + 40, kx2, ky2);
    // rótulos
    cx.fillStyle = "#b9cde6"; cx.font = "700 9px Inter, sans-serif"; cx.textAlign = "center";
    cx.fillText("ACELERADOR", bx1, top + 14); cx.fillText("LEME", bx2, top + 14);
  }
  function mao(ox, oy, hx, hy) {
    cx.save();
    cx.lineCap = "round";
    cx.strokeStyle = "#0D6EFD"; cx.lineWidth = Math.max(16, W * 0.05);
    cx.beginPath(); cx.moveTo(ox, oy); cx.quadraticCurveTo((ox + hx) / 2, hy + 40, hx + (ox < hx ? -14 : 14), hy + 12); cx.stroke();
    cx.strokeStyle = "#ffffff"; cx.lineWidth = Math.max(16, W * 0.05) + 2;
    var ux = hx + (ox < hx ? -14 : 14), uy = hy + 12;
    cx.beginPath(); cx.moveTo(ux + (ox < hx ? -6 : 6), uy + 6); cx.lineTo(ux, uy); cx.stroke();
    cx.fillStyle = "#e7b089";
    cx.beginPath(); cx.ellipse(hx + (ox < hx ? -4 : 4), hy + 4, 13, 11, 0, 0, 7); cx.fill();
    cx.fillStyle = "#d89a72";
    for (var i = 0; i < 4; i++) { cx.beginPath(); cx.ellipse(hx - 9 + i * 6, hy - 6, 3.2, 5, 0, 0, 7); cx.fill(); }
    cx.restore();
  }
  function mostrador(x, y, r, val, max, un, lim) {
    cx.save();
    cx.fillStyle = "#0b121a"; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill();
    cx.lineWidth = r * 0.12;
    var a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    cx.strokeStyle = "#2e4256"; cx.beginPath(); cx.arc(x, y, r * 0.78, a0, a1); cx.stroke();
    var aL = a0 + (a1 - a0) * clamp(lim / max, 0, 1);
    cx.strokeStyle = "#f59e0b"; cx.beginPath(); cx.arc(x, y, r * 0.78, aL, a1); cx.stroke();
    var a = a0 + (a1 - a0) * clamp(val / max, 0, 1);
    cx.strokeStyle = "#FFC107"; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7); cx.stroke();
    cx.fillStyle = "#fff"; cx.font = "800 " + Math.round(r * 0.36) + "px Montserrat, sans-serif"; cx.textAlign = "center";
    cx.fillText(Math.round(val), x, y + r * 0.45);
    cx.fillStyle = "#b9cde6"; cx.font = "600 " + Math.round(r * 0.2) + "px Inter, sans-serif"; cx.fillText(un, x, y + r * 0.7);
    cx.restore();
  }
  function radar(x, y, r) {
    cx.save();
    cx.fillStyle = "#06221a"; cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.fill();
    cx.strokeStyle = "rgba(105,240,174,.35)"; cx.lineWidth = 1;
    cx.beginPath(); cx.arc(x, y, r * 0.5, 0, 7); cx.stroke();
    var esc = r / 500;
    cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.clip();
    // varredura
    var va = S.t * 2;
    cx.strokeStyle = "rgba(105,240,174,.5)"; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + Math.cos(va) * r, y + Math.sin(va) * r); cx.stroke();
    function ponto(pw, pu, cor, tam) {
      // gira para "proa para cima"
      var dw = pw - S.w, du = pu - S.u;
      var rx = dw * Math.cos(S.th) - du * Math.sin(S.th), ry = dw * Math.sin(S.th) + du * Math.cos(S.th);
      cx.fillStyle = cor; cx.beginPath(); cx.arc(x + rx * esc, y - ry * esc, tam, 0, 7); cx.fill();
    }
    ponto(0, uDestino(), "#FFC107", 4);
    if (S.navio && S.navio.ativo) ponto(S.navio.w, S.navio.u, "#ff5252", 4);
    cx.fillStyle = "#69f0ae"; cx.fillRect(x - 2, y - 5, 4, 10);
    cx.restore();
    cx.fillStyle = "#b9cde6"; cx.font = "700 9px Inter, sans-serif"; cx.textAlign = "center"; cx.fillText("RADAR", x, y + r + 11);
  }

  // ---------- visão 3: mapa de cima ----------
  function desenharMapa() {
    var marg = 40, esc = Math.min((W - 20) / 1000, (H - marg * 2) / (L + 160));
    var ox = W / 2, oy = H / 2 + (L / 2) * esc; // u=0 embaixo
    function px(w) { return ox + w * esc; }
    function py(u) { return oy - u * esc; }
    var c = corMar(); cx.fillStyle = c[1]; cx.fillRect(0, 0, W, H);
    cx.fillStyle = c[0]; cx.fillRect(px(-450), 0, 900 * esc, H);
    // terra: São Sebastião (embaixo) e Ilhabela (em cima)
    cx.fillStyle = (S.clima && S.clima.noite) ? "#1d2b22" : "#d9cfb8"; cx.fillRect(0, py(0) + 6, W, H);
    cx.fillStyle = (S.clima && S.clima.noite) ? "#123323" : "#3f8f5a"; cx.fillRect(0, 0, W, py(L) - 6);
    cx.fillStyle = "#b0a690"; for (var i = 0; i < 14; i++) cx.fillRect(px(-430 + i * 62), py(0) + 14 + (i % 3) * 8, 34 * esc + 6, 10);
    cx.fillStyle = "#fff"; cx.font = "800 12px Montserrat, sans-serif"; cx.textAlign = "left";
    cx.fillText("São Sebastião", 10, Math.min(H - 8, py(0) + 28)); cx.fillText("Ilhabela", 10, Math.max(16, py(L) - 14));
    // píers
    cx.fillStyle = "#6d6457"; cx.fillRect(px(-14), py(CONTATO - 10), 28 * esc + 2, 20 * esc + 8); cx.fillRect(px(-14), py(L - CONTATO + 10) - 8, 28 * esc + 2, 20 * esc + 8);
    // rota sugerida e boias
    cx.setLineDash([6, 6]); cx.strokeStyle = "rgba(255,255,255,.5)"; cx.lineWidth = 1.5;
    cx.beginPath(); cx.moveTo(px(0), py(CONTATO)); cx.lineTo(px(0), py(L - CONTATO)); cx.stroke(); cx.setLineDash([]);
    for (var b = 150; b < L; b += 150) { cx.fillStyle = "#ef4444"; cx.beginPath(); cx.arc(px(-70), py(b), 3, 0, 7); cx.fill(); cx.fillStyle = "#22c55e"; cx.beginPath(); cx.arc(px(70), py(b), 3, 0, 7); cx.fill(); }
    // setas da maré
    if (S.clima) {
      var dir = S.clima.mare === "enchente" ? 1 : -1;
      cx.strokeStyle = "rgba(255,255,255,.28)"; cx.lineWidth = 1.2;
      for (var gu = 120; gu < L; gu += 160) for (var gw = -360; gw <= 360; gw += 180) {
        var f = Math.sin(Math.PI * gu / L) * 0.65 + 0.35, x0 = px(gw), y0 = py(gu), comp = 10 + 14 * f;
        var desl = ((S.t * 12 * dir) % 30);
        cx.beginPath(); cx.moveTo(x0 + desl, y0); cx.lineTo(x0 + desl + dir * comp, y0); cx.lineTo(x0 + desl + dir * (comp - 4), y0 - 3); cx.stroke();
      }
    }
    // rastro
    cx.strokeStyle = "rgba(255,255,255,.55)"; cx.lineWidth = 2; cx.beginPath();
    S.rastro.forEach(function (r, i) { if (!i) cx.moveTo(px(r[0]), py(r[1])); else cx.lineTo(px(r[0]), py(r[1])); });
    cx.stroke();
    // navio
    var n = S.navio;
    if (n && n.ativo) { cx.fillStyle = "#ef4444"; ret(px(n.w - 70), py(n.u + 13), 140 * esc, 26 * esc, 3); cx.fill(); }
    // golfinhos
    if (S.golf && S.golf.ativo) { cx.fillStyle = "#cfe8ff"; for (var d = 0; d < 3; d++) { cx.beginPath(); cx.arc(px(S.golf.w + d * 8), py(S.golf.u + Math.sin(S.t * 3 + d) * 6), 2.5, 0, 7); cx.fill(); } }
    // balsa
    cx.save(); cx.translate(px(S.w), py(S.u)); cx.rotate(S.th);
    var bl = Math.max(22, 60 * esc), bw = Math.max(8, 16 * esc);
    cx.fillStyle = "#FFC107"; ret(-bw / 2, -bl / 2, bw, bl, 3); cx.fill();
    cx.fillStyle = "#0A2C52"; cx.fillRect(-bw / 2 + 1.5, -2, bw - 3, 4);
    cx.restore();
    // vento
    if (S.clima) {
      cx.fillStyle = "rgba(10,44,82,.8)"; ret(W - 118, H - 60, 108, 46, 10); cx.fill();
      cx.fillStyle = "#fff"; cx.font = "700 11px Inter, sans-serif"; cx.textAlign = "left";
      cx.fillText("💨 " + Math.round(S.clima.vento * (1 + S.rajada)) + " km/h " + (S.clima.dirVento > 0 ? "→" : "←"), W - 110, H - 42);
      cx.fillText("🌊 maré " + S.clima.mare + " " + (S.clima.mare === "enchente" ? "→" : "←"), W - 110, H - 24);
    }
  }

  // ---------- quadro ----------
  function desenhar() {
    cx.clearRect(0, 0, W, H);
    if (!S.clima) { S.clima = sortearClima(); }
    var v = S.fase === "viagem" ? S.vista : (S.fase === "menu" ? "fora" : S.vista === "mapa" && S.fase === "fim" ? "mapa" : "fora");
    if (v === "cabine") desenharCabine(); else if (v === "mapa") desenharMapa(); else desenharFora();
  }
  function hud() {
    if (!S.clima || S.fase === "menu") return;
    $("h-vel").textContent = "⛴️ " + Math.round(Math.abs(S.v) * NOS) + " nós" + (S.v < -0.2 ? " (ré)" : "");
    $("h-dist").textContent = "📍 " + nomeLado(destino()) + ": " + Math.round(restante()) + " m";
    $("h-mar").textContent = "🌊 " + S.clima.mar + (S.clima.chuva ? " · 🌧️" : "") + (S.clima.noite ? " · 🌙" : "");
    $("h-vento").textContent = "💨 " + Math.round(S.clima.vento * (1 + S.rajada)) + " km/h";
    var b = $("h-conf"); b.style.width = S.conforto + "%"; b.style.background = S.conforto > 60 ? "#4ade80" : S.conforto > 30 ? "#FFC107" : "#ef4444";
  }
  var antes = 0;
  function quadro(ts) {
    var dt = antes ? Math.min(0.05, (ts - antes) / 1000) : 0.016; antes = ts;
    if (!S.pausa) passo(dt);
    desenhar();
    if (ts - S.ultimoHud > 200) { S.ultimoHud = ts; hud(); }
    requestAnimationFrame(quadro);
  }

  // ---------- tamanho ----------
  function ajustar() {
    var dpr = Math.min(2, window.devicePixelRatio || 1), r = palco.getBoundingClientRect();
    W = Math.max(200, r.width); H = Math.max(200, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", ajustar);

  // ---------- controles ----------
  function trocarVista(v) {
    S.vista = v;
    document.querySelectorAll("[data-vista]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.vista === v)); });
  }
  document.querySelectorAll("[data-vista]").forEach(function (b) { b.addEventListener("click", function () { trocarVista(b.dataset.vista); }); });
  document.querySelectorAll("[data-origem]").forEach(function (b) {
    b.addEventListener("click", function () {
      S.origem = b.dataset.origem; S.total = 0; S.viagens = 0;
      S.calmo = $("op-calmo").checked; S.real = $("op-real").checked;
      if (S.real) { b.disabled = true; aviso("Buscando o clima de agora no canal…"); carregarClimaReal().then(function () { b.disabled = false; if (!climaReal) aviso("Não deu para pegar o clima real. Vai no sorteio!", "ruim"); iniciarEmbarque(); }); }
      else iniciarEmbarque();
    });
  });
  $("btn-esq").addEventListener("click", function () { embarcar("e"); });
  $("btn-dir").addEventListener("click", function () { embarcar("d"); });
  $("btn-zarpar").addEventListener("click", zarpar);
  $("btn-proxima").addEventListener("click", function () { S.origem = destino(); iniciarEmbarque(); });
  $("btn-voltar-menu").addEventListener("click", irMenu);
  $("btn-menu").addEventListener("click", function () {
    if (S.fase === "viagem" || S.fase === "embarque") {
      S.pausa = !S.pausa;
      aviso(S.pausa ? "⏸️ Pausado. Toque em ☰ para continuar." : "▶️ Continuando!", null, S.pausa ? 60000 : 1500);
      return;
    }
    irMenu();
  });
  $("c-acel").addEventListener("input", function (e) { S.acel = e.target.value / 100; });
  $("c-leme").addEventListener("input", function (e) { S.leme = e.target.value / 100; });
  $("leme-centro").addEventListener("click", function () { S.leme = 0; $("c-leme").value = 0; });
  $("btn-foto").addEventListener("click", function () {
    var g = S.golf; if (!g || !g.ativo || g.foto) return;
    g.foto = true; evento("📸 Foto dos golfinhos", 15); aviso("📸 Que foto! +15 pontos", "bom");
    cx.fillStyle = "#fff"; cx.fillRect(0, 0, W, H); $("btn-foto").hidden = true;
  });
  var audio = null;
  $("btn-buzina").addEventListener("click", function () {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var o = audio.createOscillator(), o2 = audio.createOscillator(), gn = audio.createGain();
      o.type = "sawtooth"; o2.type = "sawtooth"; o.frequency.value = 110; o2.frequency.value = 138;
      gn.gain.setValueAtTime(0.0001, audio.currentTime); gn.gain.exponentialRampToValueAtTime(0.12, audio.currentTime + 0.05);
      gn.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 1.1);
      o.connect(gn); o2.connect(gn); gn.connect(audio.destination); o.start(); o2.start(); o.stop(audio.currentTime + 1.15); o2.stop(audio.currentTime + 1.15);
    } catch (e) {}
    var n = S.navio;
    if (S.fase === "viagem" && n && n.ativo && n.perto && !n.buzinou) { n.buzinou = true; evento("📣 Buzina na hora certa", 10); aviso("📣 Boa! O navio ouviu a buzina. +10", "bom"); }
  });
  document.addEventListener("keydown", function (e) {
    if (S.fase === "embarque") { if (e.key === "ArrowLeft") embarcar("e"); if (e.key === "ArrowRight") embarcar("d"); if (e.key === "Enter") zarpar(); return; }
    if (S.fase !== "viagem") return;
    var k = e.key.toLowerCase();
    if (k === "w" || k === "arrowup") S.acel = clamp(S.acel + 0.1, -0.5, 1);
    if (k === "s" || k === "arrowdown") S.acel = clamp(S.acel - 0.1, -0.5, 1);
    if (k === "a" || k === "arrowleft") S.leme = clamp(S.leme - 0.15, -1, 1);
    if (k === "d" || k === "arrowright") S.leme = clamp(S.leme + 0.15, -1, 1);
    if (k === " ") { S.leme = 0; e.preventDefault(); }
    if (k === "1") trocarVista("cabine"); if (k === "2") trocarVista("fora"); if (k === "3") trocarVista("mapa");
    $("c-acel").value = Math.round(S.acel * 100); $("c-leme").value = Math.round(S.leme * 100);
  });

  ajustar();
  irMenu();
  requestAnimationFrame(quadro);
  // para testes
  window.VDB_JOGO = { S: S, passo: passo, desenhar: desenhar, zarpar: zarpar, embarcar: embarcar, vista: trocarVista };
})();
