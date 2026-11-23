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
    var v = S.fila.shift(), ultimo = -0.4;
    S.deck.e.concat(S.deck.d).forEach(function (x) { if (x.t < ultimo) ultimo = x.t; });
    v.t = Math.min(-0.85, ultimo - 0.42); v.saida = null;   // espera o carro da frente subir
    S.deck[lado].push(v);
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
  function slotT(j) { return 0.86 - j * 0.16; }
  function atracou(qualidade) {
    S.qual = qualidade; S.fase = "desembarque"; S.tDes = 0;
    S.v = 0; S.acel = 0; S.leme = 0; $("c-acel").value = 0; $("c-leme").value = 0;
    mostrar("controles", false); mostrar("vistas", false); $("btn-foto").hidden = true;
    trocarVista("fora");
    var ordem = [];
    for (var j = 0; j < 5; j++) { if (S.deck.e[j]) ordem.push(S.deck.e[j]); if (S.deck.d[j]) ordem.push(S.deck.d[j]); }
    ordem.forEach(function (v, k) { v.saida = 1.8 + k * 0.85; v.vel = 0.12; });
    S.desTotal = ordem.length; S.desFim = 1.8 + ordem.length * 0.85 + 2.4; S.flags.desN = -1;
    mostrar("btn-pular", true);
    aviso("⚓ Atracado em " + nomeLado(destino()) + "! Baixando a rampa…", "bom", 2000);
  }
  function animarCarros(dt) {
    ["e", "d"].forEach(function (lado) {
      S.deck[lado].forEach(function (v, j) {
        var saindo = v.saida != null && S.tDes >= v.saida;
        var alvo = saindo ? (S.tFimPier || 2.3) + 0.1 : slotT(j);
        if (v.t == null) v.t = alvo;
        var vel = saindo ? (v.vel = Math.min(1.15, (v.vel || 0.12) + dt * 0.8)) : 1.1;
        v.t += clamp(alvo - v.t, -vel * dt, vel * dt);
      });
    });
  }
  function finalizarViagem() {
    var qualidade = S.qual || 0;
    S.fase = "fim";
    mostrar("btn-pular", false);
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
    mostrar("tela-fim", true);
  }

  // ---------- física ----------
  function passo(dt) {
    S.t += dt;
    atualizarChuva(dt);
    if (S.fase === "embarque" || S.fase === "desembarque") animarCarros(dt);
    if (S.fase === "desembarque") {
      S.tDes += dt;
      var fora = 0;
      S.deck.e.concat(S.deck.d).forEach(function (v) { if (v.t > 1.05) fora++; });
      if (fora !== S.flags.desN && S.tDes > 1.8) { S.flags.desN = fora; if (fora > 0 && fora <= S.desTotal) aviso("🚗 Desembarcando: " + fora + " de " + S.desTotal, "bom", 1500); }
      if (S.tDes >= S.desFim) finalizarViagem();
      return;
    }
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
  function desenharCabineDesenho() {   // reserva, enquanto a foto não carrega
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

  // ---------- imagens reais (leves) ----------
  var IMG = {};
  function carregarImg(nome, src) { var i = new Image(); i.onload = function () { IMG[nome] = i; }; i.src = src; }
  carregarImg("cabine", "img/jogo-cabine.webp?v=1");
  carregarImg("horizonte", "img/jogo-horizonte.webp?v=1");
  function erroRumo() { return ang(Math.atan2(0 - S.w, uDestino() - S.u) - S.th); }
  // faixa de foto do horizonte (montanhas e cidade); base = linha d'água
  function horizonte(xc, base, larg, tipoFallback) {
    var im = IMG.horizonte;
    if (!im) { ilha(xc, base, larg * 0.5, larg * 0.08, tipoFallback); return; }
    var alt = larg * im.height / im.width;
    for (var k = -1; k <= 1; k++) cx.drawImage(im, xc - larg / 2 + k * larg, base - alt, larg, alt);
    var c = S.clima || {};
    if (c.noite) { cx.fillStyle = "rgba(6,20,43,.72)"; cx.fillRect(-W, base - alt, W * 3, alt); }
    else if (c.chuva) { cx.fillStyle = "rgba(120,132,145,.5)"; cx.fillRect(-W, base - alt, W * 3, alt); }
    if (c.noite) { // luzes da cidade
      cx.fillStyle = "#ffd76a";
      for (var j = 0; j < 30; j++) cx.fillRect(xc - larg / 2 + ((j * 137) % 1000) / 1000 * larg, base - 3 - (j % 4) * 2, 2, 2);
    }
  }
  function marPerspectiva(hz, fim, escala) {
    var c = corMar(), g = cx.createLinearGradient(0, hz, 0, fim);
    g.addColorStop(0, c[0]); g.addColorStop(1, c[1]);
    cx.fillStyle = g; cx.fillRect(-W, hz, W * 3, fim - hz + H);
    for (var k = 1; k < 9; k++) {
      var yy = hz + (fim - hz) * Math.pow(k / 9, 1.7);
      // cristas curtas (em vez de listras contínuas) + brilhos
      cx.strokeStyle = "rgba(255,255,255," + (0.04 + k * 0.012) + ")"; cx.lineWidth = 0.6 + k * 0.18;
      var passo = 26 + k * 6, desl = (S.percorrido * 3 * escala * (0.4 + k * 0.1) + k * 37) % passo;
      cx.beginPath();
      for (var x = -passo + desl; x <= W + passo; x += passo) {
        var o = ondaY(x * (2.2 - k * 0.2), k) * k * 0.06, comp = passo * (0.35 + ((Math.floor(x / passo) * 7 + k) % 4) * 0.08);
        cx.moveTo(x, yy + o); cx.quadraticCurveTo(x + comp / 2, yy + o - 1.5 - k * 0.3, x + comp, yy + o);
      }
      cx.stroke();
    }
  }
  function pierHorizonte(x, hz, p) {
    if (p < 0.6) return;
    var pw = W * (0.05 + 0.6 * Math.pow((p - 0.6) / 0.4, 2)), ph = pw * 0.16;
    cx.fillStyle = "#7a7166"; cx.fillRect(x - pw / 2, hz - ph * 0.3, pw, ph);
    cx.fillStyle = "#FFC107"; cx.fillRect(x - pw / 2, hz - ph * 0.3, pw, ph * 0.16);
    cx.fillStyle = "#eceff1"; cx.fillRect(x + pw * 0.12, hz - ph * 1.7, pw * 0.26, ph * 1.4);
    cx.fillStyle = "#0A2C52"; cx.fillRect(x + pw * 0.12, hz - ph * 1.8, pw * 0.26, ph * 0.22);
  }

  // ---------- visão 1: de fora (câmera atrás da balsa, como nas fotos) ----------
  function desenharFora() {
    var hz = H * 0.34, p = progresso(), erro = erroRumo();
    cx.save();
    ceu(hz);
    var xh = W / 2 + erro * W * 0.55, larg = Math.max(W, H) * 1.7 * (1 + 1.1 * p * p);
    horizonte(xh, hz, larg, destino());
    marPerspectiva(hz, H, 1);
    pierHorizonte(xh, hz, p);
    var n = S.navio;
    if (n && n.ativo) {
      var nm = ang(Math.atan2(n.w - S.w, n.u - S.u) - S.th), d = Math.hypot(n.w - S.w, n.u - S.u);
      if (Math.abs(nm) < 1.3) navioLado(W / 2 + nm * W * 0.6, hz + 8 + clamp(160 / d, 0, 1) * 30, clamp(80 / d, 0.15, 1.1));
    }
    var g = S.golf;
    if (g && g.ativo) {
      for (var i = 0; i < 3; i++) {
        var fs = (S.t * 1.5 + i * 0.6) % 2;
        if (fs < 1) { cx.fillStyle = "#4f7391"; cx.beginPath(); cx.ellipse(W * (0.12 + i * 0.07), H * 0.62 - Math.sin(fs * Math.PI) * 30, 15, 6, -0.6 + fs * 1.2, 0, 7); cx.fill(); }
      }
    }
    // cais atrás da balsa durante o embarque
    if (S.fase === "embarque") {
      cx.fillStyle = "#8a8378"; cx.fillRect(0, H * 0.9, W, H * 0.1);
      cx.fillStyle = "#FFC107"; cx.fillRect(0, H * 0.9, W, 4);
    }
    balsaTraseira();
    cx.restore();
    efeitosTempo(false);
  }
  function balsaTraseira() {
    var Wb = Math.min(W * 0.7, H * 0.62), Hf = Wb * 1.05, Wf = Wb * 0.6;
    var noCais = S.fase === "embarque", chegou = S.fase === "desembarque" || S.fase === "fim";
    var roll = rolagem() * (noCais || chegou ? 0.25 : 1), bob = ondaY(W / 2, 0) * (noCais || chegou ? 0.1 : 0.3);
    cx.save();
    cx.translate(W / 2, H * (noCais ? 0.84 : 0.8) + bob);
    cx.rotate(roll * 0.8);
    function hw(t, a, b) { return Math.max(0, (a + (b - a) * t) / 2); }   // meia largura no trecho t (0 = popa, 1 = proa)
    function Y(t) { return -Hf * t; }
    var ob = Wb * 1.06, of = Wf * 1.06, db = Wb * 0.8, df = Wf * 0.78;
    S.tFimPier = 2.05;   // fim do pátio do píer (terminal)
    // píer de chegada à frente da proa (mais longe: desenha primeiro)
    var tPier = chegou ? 1 : (S.fase === "viagem" && restante() < 90 ? 1 + restante() / 45 : null);
    if (tPier !== null) pierFrente(tPier);
    // esteira de espuma
    if (!noCais && !chegou && Math.abs(S.v) > 0.8) {
      cx.fillStyle = "rgba(255,255,255,.55)";
      for (var e = 0; e < 26; e++) {
        var ex = ((e * 53) % 100 / 100 - 0.5) * Wb * (0.9 + (e % 5) * 0.12), ey = Wb * 0.2 + (e % 7) * Wb * 0.035 + Math.sin(S.t * 4 + e) * 3;
        cx.beginPath(); cx.ellipse(ex, ey, 6 + (e % 4) * 4, 3 + (e % 3) * 2, 0, 0, 7); cx.fill();
      }
      for (var s = -1; s <= 1; s += 2) { cx.beginPath(); cx.ellipse(s * Wb * 0.56, -Hf * 0.2, 6, Hf * 0.32, s * 0.1, 0, 7); cx.fill(); }
    }
    // casco, costados e convés
    quad(ob, of, Wb * 0.05, "#1d4fc4");
    quad(ob * 0.97, of * 0.97, 0, "#eef2f6");
    quad(db, df, 0, "#6b7179");
    cx.strokeStyle = "#FFC107";
    [-0.98, -0.02, 0.98].forEach(function (f) {
      cx.lineWidth = Math.max(2, Wb * 0.012);
      cx.beginPath(); cx.moveTo(f * hw(0, db, df), 0); cx.lineTo(f * hw(1, db, df), Y(1)); cx.stroke();
    });
    // carros com a posição animada
    var carros = [];
    ["e", "d"].forEach(function (lado, li) {
      S.deck[lado].forEach(function (v, j) { carros.push({ v: v, t: v.t != null ? v.t : slotT(j), f0: li === 0 ? -0.5 : 0.5 }); });
    });
    carros.sort(function (x, y) { return y.t - x.t; });
    carros.filter(function (c) { return c.t >= 0.97; }).forEach(carro);   // já na rampa/píer
    // torres laterais
    [-1, 1].forEach(function (s) {
      var tt = 0.5, x = s * hw(tt, ob, of) * 0.9, y = Y(tt), tw = Wb * 0.1, th = Wb * 0.26;
      cx.fillStyle = "#f5f7fa"; cx.fillRect(x - tw / 2, y - th, tw, th);
      cx.fillStyle = "#1d4fc4"; cx.fillRect(x - tw / 2, y - th * 0.3, tw, th * 0.3);
      cx.fillStyle = "#263238"; cx.fillRect(x - tw * 0.35, y - th * 0.95, tw * 0.7, th * 0.4);
      cx.fillStyle = "#0A2C52"; cx.font = "800 " + Math.round(tw * 0.32) + "px Montserrat, sans-serif"; cx.textAlign = "center";
      cx.fillText("VB-01", x, y - th * 0.38);
      cx.fillStyle = "#ff7a1a"; for (var bb = 0; bb < 3; bb++) cx.fillRect(x - s * tw * 0.9, y - th * 0.2 - bb * th * 0.12 + Hf * 0.06, tw * 0.45, th * 0.08);
    });
    // ponte de comando (elevada, os carros passam por baixo)
    var bw = Wf * 0.42, bh = Wb * 0.2, by = Y(0.97) - Wb * 0.06;
    cx.fillStyle = "#cfd8dc"; cx.fillRect(-bw * 0.45, by, bw * 0.06, Wb * 0.06); cx.fillRect(bw * 0.39, by, bw * 0.06, Wb * 0.06);
    cx.fillStyle = "#f5f7fa"; cx.fillRect(-bw / 2, by - bh, bw, bh);
    cx.fillStyle = "#1d4fc4"; cx.fillRect(-bw / 2, by - bh * 0.62, bw, bh * 0.28);
    cx.fillStyle = "#bfe3ff"; for (var w = 0; w < 4; w++) cx.fillRect(-bw / 2 + bw * 0.08 + w * bw * 0.23, by - bh * 0.58, bw * 0.17, bh * 0.2);
    cx.strokeStyle = "#cfd8dc"; cx.lineWidth = 2; cx.beginPath(); cx.moveTo(0, by - bh); cx.lineTo(0, by - bh * 1.9); cx.stroke();
    cx.strokeStyle = "#e53935"; cx.lineWidth = 3; cx.beginPath(); cx.moveTo(bw * 0.3, by - bh); cx.lineTo(bw * 0.3, by - bh * 2.2); cx.stroke();
    var bandeira = Math.sin(S.t * 6) * 2;
    cx.fillStyle = "#FFC107"; cx.beginPath(); cx.moveTo(0, by - bh * 1.9); cx.lineTo((S.clima ? S.clima.dirVento : 1) * bw * 0.22, by - bh * 1.8 + bandeira); cx.lineTo(0, by - bh * 1.7); cx.fill();
    carros.filter(function (c) { return c.t >= 0 && c.t < 0.97; }).forEach(carro);  // no convés
    // guarda-corpo amarelo
    cx.strokeStyle = "#FFC107"; cx.lineWidth = Math.max(1.5, Wb * 0.008);
    [-1, 1].forEach(function (s) { cx.beginPath(); cx.moveTo(s * hw(0, ob, of) * 0.97, -Wb * 0.04); cx.lineTo(s * hw(1, ob, of) * 0.97, Y(1) - Wb * 0.04); cx.stroke(); });
    // rampa da popa: baixada no cais de embarque, levantada (com a marca) na viagem
    var rw = Wb * 0.84, rh = Wb * 0.17;
    if (noCais) {
      cx.fillStyle = "#4b5058";
      cx.beginPath(); cx.moveTo(-rw / 2, 0); cx.lineTo(rw / 2, 0); cx.lineTo(rw * 0.56, rh * 1.5); cx.lineTo(-rw * 0.56, rh * 1.5); cx.closePath(); cx.fill();
      for (var z = 0; z < 16; z++) { cx.fillStyle = z % 2 ? "#111" : "#FFC107"; cx.fillRect(-rw * 0.56 + z * rw * 1.12 / 16, rh * 1.4, rw * 1.12 / 16, rh * 0.12); }
      cx.strokeStyle = "rgba(255,255,255,.25)"; cx.lineWidth = 1;
      for (var g = 1; g < 6; g++) { cx.beginPath(); cx.moveTo(-rw * (0.5 + g * 0.01), rh * 0.25 * g); cx.lineTo(rw * (0.5 + g * 0.01), rh * 0.25 * g); cx.stroke(); }
    } else {
      cx.fillStyle = "#1d4fc4"; ret(-rw / 2, 0, rw, rh, 4); cx.fill();
      cx.fillStyle = "#fff"; cx.font = "900 italic " + Math.round(rh * 0.36) + "px Montserrat, sans-serif"; cx.textAlign = "right";
      cx.fillText("VAIDE", 0, rh * 0.55); cx.fillStyle = "#FFC107"; cx.textAlign = "left"; cx.fillText("BALSA", 0, rh * 0.55);
      for (var zz = 0; zz < 14; zz++) { cx.fillStyle = zz % 2 ? "#111" : "#FFC107"; cx.fillRect(-rw / 2 + zz * rw / 14, rh * 0.74, rw / 14, rh * 0.16); }
    }
    carros.filter(function (c) { return c.t < 0; }).forEach(carro);   // ainda no cais, entrando
    if (S.clima && S.clima.noite) {
      cx.fillStyle = "#ff5252"; cx.beginPath(); cx.arc(-hw(1, ob, of), Y(1), 3, 0, 7); cx.fill();
      cx.fillStyle = "#69f0ae"; cx.beginPath(); cx.arc(hw(1, ob, of), Y(1), 3, 0, 7); cx.fill();
      cx.fillStyle = "#fff"; cx.beginPath(); cx.arc(0, by - bh * 1.9, 3, 0, 7); cx.fill();
    }
    cx.restore();

    function quad(a, b, base, cor) {
      cx.fillStyle = cor;
      cx.beginPath(); cx.moveTo(-hw(0, a, b), base); cx.lineTo(hw(0, a, b), base); cx.lineTo(hw(1, a, b), Y(1)); cx.lineTo(-hw(1, a, b), Y(1)); cx.closePath(); cx.fill();
    }
    function carro(c) {
      var t = c.t, f = c.f0;
      if (t > 0.97) f = c.f0 * clamp(1 - (t - 0.97) / 0.45, 0, 1);      // no píer, entra numa faixa só
      if (t < 0) f = c.f0 * clamp(1 + t / 0.5, 0, 1);                   // no cais, vem de uma faixa só
      var meia = hw(t, db, df); if (meia < 2) return;
      var lim = S.tFimPier || 2.3, alfa = t > lim - 0.35 ? clamp((lim - t) / 0.35, 0, 1) : 1;
      if (alfa <= 0) return;
      var n = c.v.n, cw = meia * 0.72 * (n === "moto" ? 0.4 : n === "caminhão" ? 1.05 : 0.92);
      var cl = cw * (n === "caminhão" ? 2.1 : n === "moto" ? 1.3 : 1.55) * 0.62, x = f * meia * (t > 0.97 ? 1 : 1), y = Y(t);
      cx.save(); cx.globalAlpha = alfa;
      cx.fillStyle = "rgba(0,0,0,.25)"; ret(x - cw / 2 + 2, y - cl / 2 + 3, cw, cl, cw * 0.18); cx.fill();
      cx.fillStyle = c.v.cor; ret(x - cw / 2, y - cl / 2, cw, cl, cw * 0.18); cx.fill();
      if (n !== "moto") {
        cx.fillStyle = "rgba(25,35,48,.75)";
        ret(x - cw * 0.36, y - cl * 0.32, cw * 0.72, cl * 0.22, cw * 0.06); cx.fill();
        ret(x - cw * 0.34, y + cl * 0.18, cw * 0.68, cl * 0.16, cw * 0.06); cx.fill();
      } else {
        cx.fillStyle = "#222"; cx.beginPath(); cx.arc(x, y - cl * 0.25, cw * 0.28, 0, 7); cx.fill();   // capacete
      }
      var andando = Math.abs((c.v.t || 0) - c.t) > 0 || S.fase === "desembarque" || S.fase === "embarque";
      cx.fillStyle = andando ? "#ff6b6b" : "#c62828";
      cx.fillRect(x - cw * 0.46, y + cl * 0.42, cw * 0.16, cl * 0.05); cx.fillRect(x + cw * 0.3, y + cl * 0.42, cw * 0.16, cl * 0.05);
      cx.restore();
    }
    function pierFrente(t0) {
      var tFim = S.tFimPier, a = db * 1.3, b = df * 1.3;
      // rampa da proa baixada sobre o píer
      if (chegou) {
        cx.fillStyle = "#4b5058";
        cx.beginPath(); cx.moveTo(-hw(0.98, db, df), Y(0.98)); cx.lineTo(hw(0.98, db, df), Y(0.98)); cx.lineTo(hw(1.1, db, df), Y(1.1)); cx.lineTo(-hw(1.1, db, df), Y(1.1)); cx.closePath(); cx.fill();
      }
      // pátio de concreto até o terminal
      cx.fillStyle = (S.clima && S.clima.noite) ? "#4a4842" : "#9a958c";
      cx.beginPath(); cx.moveTo(-hw(t0, a, b), Y(t0)); cx.lineTo(hw(t0, a, b), Y(t0)); cx.lineTo(hw(tFim, a, b), Y(tFim)); cx.lineTo(-hw(tFim, a, b), Y(tFim)); cx.closePath(); cx.fill();
      cx.fillStyle = "#FFC107"; cx.fillRect(-hw(t0, a, b), Y(t0) - 3, hw(t0, a, b) * 2, 4);
      cx.strokeStyle = "rgba(255,255,255,.7)"; cx.lineWidth = 2; cx.setLineDash([8, 10]);
      cx.beginPath(); cx.moveTo(0, Y(t0)); cx.lineTo(0, Y(tFim)); cx.stroke(); cx.setLineDash([]);
      // defensas pretas na borda
      cx.fillStyle = "#1b1b1b"; for (var k = -2; k <= 2; k++) cx.fillRect(k * hw(t0, a, b) * 0.42 - 5, Y(t0) - 2, 10, 8);
      // terminal com o nome da cidade
      var tt = tFim - 0.06, larg = Math.max(hw(tt, ob, of) * 4.2, Wb * 0.5), alt = Wb * 0.2, yb = Y(tt);
      cx.fillStyle = "#f4f6f8"; cx.fillRect(-larg / 2, yb - alt, larg, alt);
      cx.fillStyle = "#0A2C52"; cx.fillRect(-larg / 2 - 4, yb - alt - 6, larg + 8, 8);
      cx.fillStyle = "#1d4fc4"; cx.fillRect(-larg * 0.3, yb - alt * 0.86, larg * 0.6, alt * 0.26);
      cx.fillStyle = "#fff"; cx.font = "800 " + Math.max(8, Math.round(alt * 0.17)) + "px Montserrat, sans-serif"; cx.textAlign = "center";
      cx.fillText("TERMINAL " + nomeLado(destino()).toUpperCase(), 0, yb - alt * 0.67);
      cx.fillStyle = "#2b3a4a"; for (var j = 0; j < 4; j++) cx.fillRect(-larg * 0.42 + j * larg * 0.24, yb - alt * 0.45, larg * 0.12, alt * 0.45);
      // semáforo do píer (verde no desembarque)
      var sx = hw(1.45, a, b) * 0.85, sy = Y(1.45), sh = Wb * 0.2;
      cx.fillStyle = "#333"; cx.fillRect(sx - 2, sy - sh, 4, sh); ret(sx - 7, sy - sh - 18, 14, 22, 3); cx.fill();
      var verde = S.fase === "desembarque" && S.tDes > 1.6;
      cx.fillStyle = verde ? "#333" : "#ff3b3b"; cx.beginPath(); cx.arc(sx, sy - sh - 12, 4, 0, 7); cx.fill();
      cx.fillStyle = verde ? "#4ade80" : "#333"; cx.beginPath(); cx.arc(sx, sy - sh - 3, 4, 0, 7); cx.fill();
      // funcionário de colete laranja acenando
      var fx = -hw(1.2, a, b) * 0.8, fy = Y(1.2), fe = Wb * 0.05;
      cx.fillStyle = "#263238"; cx.fillRect(fx - fe * 0.25, fy - fe * 1.2, fe * 0.18, fe * 1.2); cx.fillRect(fx + fe * 0.07, fy - fe * 1.2, fe * 0.18, fe * 1.2);
      cx.fillStyle = "#ff7a1a"; ret(fx - fe * 0.4, fy - fe * 2.3, fe * 0.8, fe * 1.2, 3); cx.fill();
      cx.fillStyle = "#e3a57e"; cx.beginPath(); cx.arc(fx, fy - fe * 2.6, fe * 0.3, 0, 7); cx.fill();
      var aceno = chegou ? Math.sin(S.t * 6) * 0.6 : 0.2;
      cx.strokeStyle = "#ff7a1a"; cx.lineWidth = fe * 0.22; cx.lineCap = "round";
      cx.beginPath(); cx.moveTo(fx + fe * 0.35, fy - fe * 2.1); cx.lineTo(fx + fe * 0.35 + Math.cos(-1.2 + aceno) * fe, fy - fe * 2.1 + Math.sin(-1.2 + aceno) * fe); cx.stroke();
    }
  }

  // ---------- visão 2: cabine (foto real com as janelas vazadas) ----------
  function desenharCabine() {
    var im = IMG.cabine;
    if (!im) { desenharCabineDesenho(); return; }
    var s = Math.max(W / 1280, H / 720);
    var iw = 1280 * s, ih = 720 * s, x0 = clamp(W / 2 - 0.56 * iw, W - iw, 0), y0 = H - ih;
    function PX(x) { return x0 + x * s; }
    function PY(y) { return y0 + y * s; }
    var p = progresso(), roll = rolagem(), arf = arfagem(), hz = PY(250), erro = erroRumo();
    // cena lá fora (atrás da foto)
    cx.save();
    cx.translate(W / 2, hz); cx.rotate(-roll * 0.8); cx.translate(-W / 2, -hz + arf * 1.2);
    ceu(hz);
    var xh = PX(640) + erro / 1.6 * iw, larg = iw * 1.3 * (1 + 1.8 * p * p);
    horizonte(xh, hz, larg, destino());
    marPerspectiva(hz, PY(400), 1);
    pierHorizonte(xh, hz, p);
    var n = S.navio;
    if (n && n.ativo) {
      var nm = ang(Math.atan2(n.w - S.w, n.u - S.u) - S.th), d = Math.hypot(n.w - S.w, n.u - S.u);
      if (Math.abs(nm) < 1.3) navioLado(PX(640) + nm / 1.6 * iw, hz + 4, clamp(90 / d, 0.15, 1.2) * s * 1.4);
    }
    var gf = S.golf;
    if (gf && gf.ativo) {
      for (var i = 0; i < 3; i++) {
        var fs = (S.t * 1.5 + i * 0.6) % 2;
        if (fs < 1) { cx.fillStyle = "#4f7391"; cx.beginPath(); cx.ellipse(PX(300 + i * 60), PY(330) - Math.sin(fs * Math.PI) * 26 * s, 13 * s, 5 * s, -0.6 + fs * 1.2, 0, 7); cx.fill(); }
      }
    }
    // proa e guarda-corpo amarelo vistos pela janela
    cx.fillStyle = "#59616b"; cx.fillRect(-W, PY(360), W * 3, PY(420) - PY(360));
    cx.strokeStyle = "#FFC107"; cx.lineWidth = Math.max(2, 5 * s);
    cx.beginPath(); cx.moveTo(-W, PY(352)); cx.lineTo(W * 2, PY(352)); cx.stroke();
    for (var r = 0; r < 12; r++) { cx.beginPath(); cx.moveTo(PX(r * 120), PY(352)); cx.lineTo(PX(r * 120), PY(372)); cx.stroke(); }
    cx.restore();
    // chuva no vidro e limpadores (só aparecem nas janelas)
    efeitosTempo(true);
    if (S.clima && S.clima.chuva) {
      var a = Math.sin(S.t * 2.2) * 0.9;
      [[418, 378], [830, 378]].forEach(function (pv) {
        cx.save(); cx.translate(PX(pv[0]), PY(pv[1])); cx.rotate(a);
        cx.strokeStyle = "#111"; cx.lineWidth = Math.max(3, 6 * s); cx.lineCap = "round";
        cx.beginPath(); cx.moveTo(0, 0); cx.lineTo(0, -250 * s); cx.stroke(); cx.restore();
      });
    }
    // teto acima da foto (telas altas)
    if (y0 > 0) { var gt = cx.createLinearGradient(0, 0, 0, y0 + 2); gt.addColorStop(0, "#9aa1a8"); gt.addColorStop(1, "#cfd3d7"); cx.fillStyle = gt; cx.fillRect(0, 0, W, y0 + 2); }
    cx.drawImage(im, x0, y0, iw, ih);
    // instrumentos vivos sobre as telas da foto
    telaMapa(PX(523), PY(406), 154 * s, 84 * s);
    radarTela(PX(790), PY(452), 44 * s);
    agulha(PX(394), PY(436), 16 * s, Math.abs(S.v) * NOS / 14);
    agulha(PX(437), PY(436), 16 * s, clamp(S.clima ? S.clima.vento / 60 : 0, 0, 1));
    // velocidade digital no canto da tela de navegação
    cx.fillStyle = "rgba(5,12,20,.85)"; ret(PX(527), PY(409), 46 * s, 30 * s, 4 * s); cx.fill();
    cx.fillStyle = Math.abs(S.v) > limiteConforto() ? "#ffb74d" : "#69f0ae"; cx.font = "800 " + Math.round(15 * s) + "px Montserrat, sans-serif"; cx.textAlign = "center";
    cx.fillText(Math.round(Math.abs(S.v) * NOS), PX(550), PY(427));
    cx.font = "700 " + Math.round(6 * s) + "px Inter, sans-serif"; cx.fillText("NÓS", PX(550), PY(436));
    // mãos: esquerda no timão (gira com o leme) e direita no manete (anda com o acelerador)
    var ang0 = Math.PI * 1.4 + S.leme * 0.55, rx = PX(619) + Math.cos(ang0) * 205 * s, ry = PY(681) + Math.sin(ang0) * 205 * s;
    var ang1 = Math.PI * 1.92 + S.leme * 0.55, rx2 = PX(619) + Math.cos(ang1) * 205 * s, ry2 = PY(681) + Math.sin(ang1) * 205 * s;
    var mx = PX(832), my = PY(548) - S.acel * 30 * s;
    // manete (joystick do painel) acompanhando o acelerador
    cx.strokeStyle = "#222"; cx.lineWidth = Math.max(3, 9 * s); cx.lineCap = "round";
    cx.beginPath(); cx.moveTo(PX(832), PY(560)); cx.lineTo(mx, my); cx.stroke();
    cx.fillStyle = "#c62828"; cx.beginPath(); cx.arc(mx, my, 11 * s, 0, 7); cx.fill();
    maoReal(PX(440), H + 30, rx, ry, s);
    maoReal(PX(960), H + 30, mx, my, s);
    // indicador do leme
    var lw = 120 * s, lx = PX(619) - lw / 2, ly = PY(392);
    cx.fillStyle = "rgba(5,12,20,.8)"; ret(lx, ly - 7 * s, lw, 14 * s, 7 * s); cx.fill();
    cx.fillStyle = "#29b6f6"; cx.beginPath(); cx.arc(PX(619) + S.leme * lw * 0.45, ly, 5 * s, 0, 7); cx.fill();
    cx.fillStyle = "#b9cde6"; cx.font = "700 " + Math.round(7 * s) + "px Inter, sans-serif"; cx.textAlign = "center"; cx.fillText("LEME", PX(619), ly - 9 * s);
    if (Math.abs(PX(640) + erro / 1.6 * iw - W / 2) > W * 0.55) {
      cx.fillStyle = "#FFC107"; cx.font = "800 14px Montserrat, sans-serif"; cx.textAlign = erro < 0 ? "left" : "right";
      cx.fillText(erro < 0 ? "◀ " + nomeLado(destino()) : nomeLado(destino()) + " ▶", erro < 0 ? 14 : W - 14, PY(140));
    }
  }
  function agulha(x, y, r, f) {
    var a = Math.PI * 0.75 + Math.PI * 1.5 * clamp(f, 0, 1);
    cx.strokeStyle = "#e53935"; cx.lineWidth = Math.max(1.5, r * 0.12); cx.lineCap = "round";
    cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85); cx.stroke();
  }
  function maoReal(ox, oy, hx, hy, s) {
    var esq = ox < hx, lw = Math.max(14, 48 * s);
    cx.save(); cx.lineCap = "round";
    cx.strokeStyle = "#0D6EFD"; cx.lineWidth = lw;
    cx.beginPath(); cx.moveTo(ox, oy); cx.quadraticCurveTo((ox + hx) / 2, hy + lw * 2, hx + (esq ? -lw * 0.5 : lw * 0.5), hy + lw * 0.5); cx.stroke();
    cx.strokeStyle = "#fff"; cx.lineWidth = lw * 1.05;
    var ux = hx + (esq ? -lw * 0.5 : lw * 0.5), uy = hy + lw * 0.5;
    cx.beginPath(); cx.moveTo(ux + (esq ? -lw * 0.2 : lw * 0.2), uy + lw * 0.2); cx.lineTo(ux, uy); cx.stroke();
    cx.fillStyle = "#e3a57e"; cx.beginPath(); cx.ellipse(hx, hy + lw * 0.1, lw * 0.55, lw * 0.45, 0, 0, 7); cx.fill();
    cx.fillStyle = "#d18d66";
    for (var i = 0; i < 4; i++) { cx.beginPath(); cx.ellipse(hx - lw * 0.33 + i * lw * 0.22, hy - lw * 0.28, lw * 0.11, lw * 0.18, 0, 0, 7); cx.fill(); }
    cx.restore();
  }
  function telaMapa(x, y, w, h) {
    cx.save(); cx.beginPath(); cx.rect(x, y, w, h); cx.clip();
    cx.fillStyle = "#0b3d73"; cx.fillRect(x, y, w, h);
    var esc = h / (L + 120), ox = x + w / 2, oy = y + h - 60 * esc;
    cx.fillStyle = "#e2c95a"; cx.fillRect(x, oy + 10 * esc, w, h); cx.fillRect(x, y, w, oy - L * esc - 10 * esc - y);
    cx.strokeStyle = "rgba(255,255,255,.5)"; cx.setLineDash([3, 3]); cx.beginPath(); cx.moveTo(ox, oy); cx.lineTo(ox, oy - L * esc); cx.stroke(); cx.setLineDash([]);
    if (S.navio && S.navio.ativo) { cx.fillStyle = "#ff5252"; cx.fillRect(ox + (S.navio.w - 70) * esc, oy - S.navio.u * esc - 3, 140 * esc, 5); }
    cx.translate(ox + S.w * esc, oy - S.u * esc); cx.rotate(S.th);
    cx.fillStyle = "#fff"; cx.beginPath(); cx.moveTo(0, -6); cx.lineTo(4, 5); cx.lineTo(-4, 5); cx.closePath(); cx.fill();
    cx.restore();
  }
  function radarTela(x, y, r) {
    cx.save();
    cx.beginPath(); cx.arc(x, y, r, 0, 7); cx.clip();
    cx.fillStyle = "rgba(4,24,14,.92)"; cx.fillRect(x - r, y - r, r * 2, r * 2);
    cx.strokeStyle = "rgba(105,240,174,.35)"; cx.lineWidth = 1;
    cx.beginPath(); cx.arc(x, y, r * 0.5, 0, 7); cx.stroke();
    var va = S.t * 2; cx.strokeStyle = "rgba(105,240,174,.7)"; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + Math.cos(va) * r, y + Math.sin(va) * r); cx.stroke();
    var esc = r / 500;
    function ponto(pw, pu, cor) {
      var dw = pw - S.w, du = pu - S.u;
      var rx = dw * Math.cos(S.th) - du * Math.sin(S.th), ry = dw * Math.sin(S.th) + du * Math.cos(S.th);
      cx.fillStyle = cor; cx.beginPath(); cx.arc(x + rx * esc, y - ry * esc, Math.max(2, r * 0.07), 0, 7); cx.fill();
    }
    ponto(0, uDestino(), "#FFC107");
    if (S.navio && S.navio.ativo) ponto(S.navio.w, S.navio.u, "#ff5252");
    cx.fillStyle = "#69f0ae"; cx.fillRect(x - 1.5, y - 4, 3, 8);
    cx.restore();
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
  $("btn-pular").addEventListener("click", function () { if (S.fase === "desembarque") finalizarViagem(); });
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
