/* Capitão da Balsa — jogo 2D do VAIDEBALSA (visual cartoon próprio, desenhado em canvas)
   Fases: fila e cobrança → embarque → travessia → atracação e desembarque.
   Controle único: segurar = andar/acelerar, soltar = frear. */
(function () {
  "use strict";
  var cv = document.getElementById("tela"), cx = cv.getContext("2d"), palco = document.getElementById("palco");
  var W = 360, H = 560, K = 1;     // K: escala do desenho (base: 560 px de altura)
  function $(id) { return document.getElementById(id); }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  var CONTORNO = "#17283b";
  var CORES = ["#e53935", "#1e88e5", "#43a047", "#8e24aa", "#fb8c00", "#00acc1", "#ffffff", "#546e7a", "#d81b60", "#6d4c41"];

  // ---------- estado ----------
  var S = {
    fase: "menu", origem: "ss", t: 0, segura: false, pausa: false,
    clima: null, calmo: false, real: false,
    pontos: 0, total: 0, viagens: 0, itens: [], flags: {}, popups: []
  };
  var climaReal = null;
  function destino() { return S.origem === "ss" ? "ib" : "ss"; }
  function nome(l) { return l === "ss" ? "São Sebastião" : "Ilhabela"; }
  function ponto(txt, pts) {
    S.pontos += pts; S.itens.push([txt, pts]);
    S.popups.push({ txt: (pts > 0 ? "+" : "") + pts, cor: pts >= 0 ? "#FFC107" : "#ff5a5a", t: 0 });
  }

  // ---------- avisos e dicas ----------
  var avisoEl = $("aviso"), avisoT = 0, dicaT = 0;
  function aviso(txt, tipo, dur) {
    avisoEl.textContent = txt; avisoEl.className = "aviso ver" + (tipo ? " " + tipo : "");
    clearTimeout(avisoT); avisoT = setTimeout(function () { avisoEl.className = "aviso"; }, dur || 2400);
  }
  function dica(txt, dur) {
    $("dica-txt").textContent = txt; $("dica").hidden = false;
    clearTimeout(dicaT); dicaT = setTimeout(function () { $("dica").hidden = true; }, dur || 4200);
  }

  // ---------- clima ----------
  var MARES = [{ n: "calmo", s: 0.2 }, { n: "moderado", s: 0.6 }, { n: "agitado", s: 1 }];
  function sortearClima() {
    if (S.real && climaReal) return Object.assign({}, climaReal);
    var nivel = Math.min(2, Math.floor(Math.random() * (1.3 + S.viagens * 0.35)));
    if (S.calmo) nivel = Math.min(nivel, 1);
    return { mar: MARES[nivel].n, s: MARES[nivel].s, vento: Math.round(rnd(6, 16) + nivel * rnd(6, 14)),
             chuva: Math.random() < 0.12 + nivel * 0.22, noite: S.viagens % 4 === 3 };
  }
  function carregarClimaReal() {
    return Promise.all([
      fetch("https://api.open-meteo.com/v1/forecast?latitude=-23.81&longitude=-45.40&current=wind_gusts_10m,precipitation,is_day&timezone=America%2FSao_Paulo").then(function (r) { return r.json(); }),
      fetch("https://marine-api.open-meteo.com/v1/marine?latitude=-23.78&longitude=-45.36&current=wave_height").then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (r) {
      var c = r[0].current || {}, onda = r[1] && r[1].current ? r[1].current.wave_height : 0.5;
      var nivel = onda < 0.4 ? 0 : onda < 0.9 ? 1 : 2; if (S.calmo) nivel = Math.min(nivel, 1);
      climaReal = { mar: MARES[nivel].n, s: MARES[nivel].s, vento: Math.round(c.wind_gusts_10m || 10), chuva: (c.precipitation || 0) > 0.1, noite: c.is_day === 0, real: true };
    }).catch(function () { climaReal = null; });
  }

  // ======================================================================
  //  FASES 1 e 2 — EM TERRA: fila, cobrança (só em São Sebastião) e embarque
  // ======================================================================
  var LINHA_COBRANCA = 660, RAMPA = 840, DECK0 = 880, VAGA = 84, CARRO = 66;
  // frota: FB-25 e FB-30 são maiores (mais vagas); VALDA II e FB-17 menores
  var FROTA = [
    { nome: "FB-25", vagas: 7, L: 1.18, vel: 0.95, acel: 0.85 },
    { nome: "FB-30", vagas: 7, L: 1.18, vel: 0.95, acel: 0.85 },
    { nome: "VALDA II", vagas: 5, L: 1, vel: 1, acel: 1 },
    { nome: "FB-17", vagas: 5, L: 0.96, vel: 1.03, acel: 1.08 }
  ];
  var T = null;
  function iniciarTerra() {
    S.fase = "terra"; S.itens = []; S.pontos = 0; S.flags = {}; S.popups = []; S.pausa = false;
    S.clima = sortearClima();
    S.balsa = FROTA[Math.floor(Math.random() * FROTA.length)];
    var cobra = S.origem === "ss", fila = [], n = S.balsa.vagas - 1, frente0 = Math.min(600, 470 + Math.max(0, n - 4) * 70);
    for (var i = 0; i < n; i++) fila.push({ x: frente0 - i * (CARRO + 26), v: 0, cor: CORES[Math.floor(Math.random() * CORES.length)], tipo: Math.random() < 0.18 ? "van" : "carro", pago: !cobra, espera: 0, vaga: i });
    T = {
      cobra: cobra, pago: !cobra, cancela: cobra ? 0 : 1, fila: fila,
      jog: { x: frente0 - n * (CARRO + 26), v: 0 }, vaga: n, cam: 0,
      estacionado: false, motor: true, partindo: 0, tPagando: 0, encostou: -9, parado: 0,
      pedestres: [{ x: 120, v: 26 }, { x: 420, v: 22 }], ciclista: { x: -200, v: 60 }
    };
    mostrar("tela-menu", false); mostrar("tela-fim", false); mostrar("hud", true); mostrar("controles", true);
    $("btn-acao").hidden = true; $("seg-txt").textContent = "SEGURE PARA ANDAR";
    fase("🚗 Fila · " + nome(S.origem));
    $("desvio").hidden = true;
    setTimeout(function () { if (S.fase === "terra") aviso("⛴️ Hoje você embarca na " + S.balsa.nome + (S.balsa.vagas > 5 ? " (balsa grande: " + S.balsa.vagas + " vagas)" : ""), "bom", 2600); }, 3900);
    if (cobra) dica("Segure o botão para andar na fila e solte para frear. Pare na faixa verde da cabine para pagar: a tarifa já vale a volta!", 5600);
    else dica("Em Ilhabela não se paga: a tarifa da ida, em São Sebastião, já incluiu a volta. Siga a fila até a balsa!", 5600);
    var c = S.clima;
    setTimeout(function () { aviso((c.real ? "Clima de agora: " : "") + "mar " + c.mar + ", vento " + c.vento + " km/h" + (c.chuva ? ", chuva" : "") + (c.noite ? ", noite" : ""), null, 3000); }, 700);
  }
  function deckX(i) { return DECK0 + 60 + (S.balsa.vagas - 1 - i) * VAGA + VAGA; }   // frente do carro na vaga i (0 = mais à frente)
  function passoTerra(dt) {
    var P = T.jog;
    // carros automáticos: vão até a cobrança, pagam e seguem para a vaga
    T.fila.forEach(function (c, i) {
      var frente = i === 0 ? null : T.fila[i - 1];
      var alvo = deckX(c.vaga);
      if (T.cobra && !c.pago) alvo = Math.min(alvo, LINHA_COBRANCA);
      if (frente) alvo = Math.min(alvo, frente.x - CARRO - 18);
      if (T.cobra && !c.pago && Math.abs(c.x - LINHA_COBRANCA) < 2 && (!frente || frente.pago)) { c.espera += dt; if (c.espera > 1.3) c.pago = true; }
      var quer = alvo - c.x;
      c.v = quer > 2 ? Math.min(120, c.v + 160 * dt, quer * 3) : 0;
      c.x += c.v * dt;
    });
    // jogador: segurar anda, soltar freia
    var aFrente = T.fila[T.fila.length - 1];
    var limite = aFrente ? aFrente.x - CARRO - 4 : 99999;
    if (T.cobra && !T.pago) limite = Math.min(limite, LINHA_COBRANCA + 6);
    if (!T.estacionado) {
      if (S.segura) P.v = Math.min(150, P.v + 220 * dt); else P.v = Math.max(0, P.v - 340 * dt);
      // jogabilidade fácil: perto do carro da frente (ou da cancela) o carro freia sozinho
      if (limite - P.x < 60) P.v = Math.min(P.v, Math.max(8, (limite - P.x) * 2.2));
      P.x += P.v * dt;
      if (P.x > limite) {
        if (P.v > 60 && S.t - T.encostou > 1.5) {
          T.encostou = S.t;
          if (T.cobra && !T.pago && limite >= LINHA_COBRANCA) { aviso("🚧 Cancela fechada! Pare na faixa verde.", "ruim"); ponto("🚧 Bateu na cancela", -10); }
          else { aviso("💥 Encostou no carro da frente! Solte antes.", "ruim"); ponto("💥 Encostou no carro da frente", -10); }
        }
        P.x = limite; P.v = 0;
      }
    }
    // cobrança: parado na faixa → paga
    if (T.cobra && !T.pago && Math.abs(P.x - LINHA_COBRANCA) < 24 && P.v < 6 && (!aFrente || aFrente.pago)) {
      T.tPagando += dt;
      if (T.tPagando > 0.8) {
        T.pago = true; ponto("💳 Tarifa paga na cabine", 15);
        var dia = new Date().getDay(), tarifa = (dia === 0 || dia === 6) ? "R$ 28,50" : "R$ 19,00";
        aviso("💳 Tarifa paga: " + tarifa + " (já vale a volta!)", "bom", 2600);
      }
    } else T.tPagando = 0;
    T.cancela = clamp(T.cancela + (T.pago ? 2 : -3) * dt, 0, 1);
    // estacionar na vaga marcada
    var vaga = deckX(T.vaga);
    if (!T.estacionado && P.x > RAMPA && P.v < 5 && Math.abs(P.x - vaga) < 26) {
      T.parado += dt;
      if (T.parado > 0.5) {
        T.estacionado = true; var erro = Math.abs(P.x - vaga);
        ponto("🅿️ Estacionou na vaga" + (erro < 6 ? " (perfeito!)" : ""), Math.round(20 - erro * 0.6));
        aviso(erro < 6 ? "🅿️ Perfeito! Bem na marca." : "🅿️ Estacionado!", "bom");
        dica("Regra da travessia: desligue o motor e solte o cinto. Toque no botão verde 🔑.", 7000);
        $("btn-acao").textContent = "🔑"; $("btn-acao").hidden = false;
        fase("🔑 Desligue o motor");
      }
    } else T.parado = 0;
    var alvoCam = P.x - (W / K) * 0.42;
    T.cam += (alvoCam - T.cam) * Math.min(1, dt * 3); T.cam = Math.max(0, T.cam);
    T.pedestres.forEach(function (p) { p.x += p.v * dt; if (p.x > 1500) p.x = -60; });
    T.ciclista.x += T.ciclista.v * dt; if (T.ciclista.x > 1600) T.ciclista.x = -300;
    if (T.partindo) { T.partindo += dt; if (T.partindo > 2.2) iniciarMar(); }
    $("h-vel").textContent = "🚗 " + Math.round(P.v * 0.25) + " km/h";
    $("h-dist").textContent = T.cobra && !T.pago ? "💳 cobrança: " + Math.max(0, Math.round((LINHA_COBRANCA - P.x) / 10)) + " m" : "🅿️ vaga: " + Math.max(0, Math.round((vaga - P.x) / 10)) + " m";
  }
  function desligarMotor() {
    if (S.fase !== "terra" || !T.estacionado || !T.motor) return;
    T.motor = false; $("btn-acao").hidden = true;
    ponto("🔑 Motor desligado e cinto solto", 10);
    aviso("⛴️ Tudo pronto! A balsa vai sair.", "bom");
    T.partindo = 0.01; fase("⛴️ Zarpando…");
  }

  // ======================================================================
  //  FASE 3 — TRAVESSIA (câmera atrás da balsa, 3 faixas no canal: ⬅ ➡ para desviar)
  // ======================================================================
  var D = 2400, VMAX = 62;
  var M = null;
  var NOMES_OBST = { lancha: "lancha", veleiro: "veleiro", caiaque: "caiaque", boia: "boia", tronco: "tronco", cargueiro: "cargueiro" };
  function iniciarMar() {
    S.fase = "mar"; $("btn-acao").hidden = true; $("desvio").hidden = false;
    var B = S.balsa, deck = [];
    for (var i = 0; i < B.vagas; i++) {
      if (i < T.fila.length) deck.push({ cor: T.fila[i].cor, tipo: T.fila[i].tipo, jog: false, sai: 0 });
      else if (i === T.vaga) deck.push({ cor: "#FFC107", tipo: "carro", jog: true, sai: 0, v: 0 });
    }
    var obst = [], x = 300, dens = 1 + Math.min(3, S.viagens) * 0.18;
    function add(tipo, px, faixa, extra) { obst.push(Object.assign({ tipo: tipo, x: px, f: faixa, feito: false, bateu: false, vel: 0, comp: 8 }, extra || {})); }
    while (x < 2080) {
      var r = Math.random(), faixa = Math.floor(Math.random() * 3);
      if (r < 0.26) add("lancha", x + 260, faixa, { vel: -rnd(12, 20), comp: 16 });   // vem de frente
      else if (r < 0.44) add("veleiro", x, faixa, { vel: -rnd(1, 3), comp: 16 });
      else if (r < 0.62) add("caiaque", x, faixa, { comp: 7 });
      else if (r < 0.8) add("boia", x, faixa, { comp: 6 });
      else add("tronco", x, faixa, { comp: 10 });
      x += rnd(150, 240) / dens;
    }
    if (Math.random() < 0.85) add("cargueiro", rnd(850, 1600), 2.6, { comp: 140, cruza: true, p: -1, dur: 13 });
    M = { d: 0, v: 0, faixa: 1, fy: 1, deck: deck, obst: obst, golf: { x: rnd(600, 1800), ativo: false, feito: false, foto: false, t: 0 },
          conforto: 100, rajada: 0, gaivotas: [{ x: 0.2, y: 0.18 }, { x: 0.6, y: 0.12 }, { x: 0.85, y: 0.22 }],
          atracou: false, chuvaNova: !S.clima.chuva && Math.random() < 0.3 ? rnd(700, 1700) : null, dicas: {}, bate: -9, tAtr: 0, rampa: 0, fim: false, sacode: 0 };
    fase("🌊 " + B.nome + " → " + nome(destino()));
    aviso("⛴️ Segure para acelerar. Use ⬅ ➡ para desviar!", "bom", 2800);
    $("seg-txt").textContent = "SEGURE PARA ACELERAR";
    setTimeout(function () { if (S.fase === "mar") dica("Lanchas, caiaques, boias e troncos no caminho! Toque em ⬅ ou ➡ para mudar de faixa e desviar. A seta vermelha mostra o perigo na sua faixa.", 5200); }, 2600);
  }
  function mudarFaixa(dir) {
    if (S.fase !== "mar" || !M || M.atracou) return;
    M.faixa = clamp(M.faixa + dir, 0, 2);
  }
  var DICAS_MAR = [
    [500, "A travessia de verdade tem uns 2,4 km e leva cerca de 20 minutos. 🌊"],
    [900, "Vento forte pode parar a travessia de verdade: a segurança vem primeiro! 💨"],
    [1300, "No canal de São Sebastião passam navios cargueiros e petroleiros. 🚢"],
    [1750, "Pedestres e ciclistas atravessam sem pagar e embarcam pela lateral. 🚲"],
    [2080, "Chegando! Vá para a faixa do meio. A régua à direita mostra onde a balsa vai parar: SOLTE quando a marca ficar verde. Bateu forte, os carros caem na água! ⚓"]
  ];
  function limiteConforto() { return VMAX * (1 - 0.45 * S.clima.s); }
  function passoMar(dt) {
    var c = S.clima;
    // faixa: a balsa desliza para a faixa escolhida
    M.fy += clamp(M.faixa - M.fy, -1.4 * dt, 1.4 * dt);
    M.sacode = Math.max(0, M.sacode - dt * 2);
    if (!M.atracou) {
      var falta = D - M.d;
      if (S.segura) M.v = Math.min(VMAX * S.balsa.vel, M.v + 16 * S.balsa.acel * dt); else M.v = Math.max(0, M.v - 11 * dt);
      if (c.vento >= 25 && M.rajada <= 0.05 && Math.random() < dt * 0.06 && !S.calmo) { M.rajada = 1; M.v *= 0.6; aviso("💨 Rajada de vento! A balsa perdeu velocidade.", "ruim"); }
      M.rajada = Math.max(0, M.rajada - dt * 0.4);
      // parou pertinho da rampa: os cabos puxam devagar até encostar
      if (falta < 12 && falta > 0 && M.v < 0.8 && Math.abs(M.fy - 1) < 0.2) { M.d += 3 * dt; if (!M.dicas.cabos) { M.dicas.cabos = 1; aviso("🪢 Cabos lançados… encostando de leve.", "bom"); } }
      M.d += M.v * dt;
      var exc = M.v - limiteConforto();
      if (exc > 0) M.conforto -= exc * c.s * 0.35 * dt; else M.conforto += 2 * dt;
      M.conforto = clamp(M.conforto, 0, 100);
      if (exc > 6 && !M.dicas.mar) { M.dicas.mar = 1; aviso("🌊 Mar " + c.mar + ": vá mais devagar para ninguém enjoar!", "ruim"); }
      if (M.conforto < 35 && !M.dicas.enjoo) { M.dicas.enjoo = 1; ponto("🤢 Passageiros enjoados", -10); aviso("🤢 Gente enjoando! Diminua.", "ruim"); }
      // obstáculos
      M.obst.forEach(function (o) {
        if (o.feito) return;
        if (o.vel && o.x - M.d < 650) o.x += o.vel * dt;
        if (o.cruza) {
          if (o.p < 0 && o.x - M.d < 420) { o.p = 0; aviso("🚢 Cargueiro cruzando o canal! Espere ele passar ou passe antes.", "ruim", 2800); }
          if (o.p >= 0) { o.p += dt / o.dur; o.f = 2.6 - 3.2 * o.p; if (o.p >= 1) { o.feito = true; if (!o.bateu) ponto("🚢 Deu passagem ao cargueiro", 20); } }
        }
        var sobre = M.d > o.x - o.comp / 2 && M.d - 60 < o.x + o.comp / 2;
        var mesma = Math.abs(M.fy - o.f) < (o.cruza ? 0.75 : 0.55);
        if (sobre && mesma && !o.bateu && (!o.cruza || o.p >= 0)) {
          o.bateu = true; M.sacode = 1;
          var pen = { lancha: -20, veleiro: -15, caiaque: -15, boia: -8, tronco: -10, cargueiro: -40 }[o.tipo];
          ponto("💥 Bateu no " + (o.tipo === "lancha" || o.tipo === "boia" ? (o.tipo === "boia" ? "na boia" : "na lancha") : NOMES_OBST[o.tipo]).replace("no na", "na"), pen);
          aviso(o.tipo === "caiaque" ? "😱 Cuidado com o caiaque! Desvie com ⬅ ➡." : "💥 Batida! Use ⬅ ➡ para desviar.", "ruim");
          if (o.tipo === "cargueiro" || o.tipo === "lancha") { M.v = 0; M.d = Math.min(M.d, o.x - o.comp / 2 - 2); } else M.v *= 0.35;
        }
        if (!o.cruza && M.d - 60 > o.x + o.comp / 2) { o.feito = true; if (!o.bateu) { ponto("↕️ Desviou d" + (o.tipo === "lancha" || o.tipo === "boia" ? "a " : "o ") + NOMES_OBST[o.tipo], 5); } }
      });
      var g = M.golf;
      if (!g.feito && !g.ativo && M.d > g.x - 200) { g.ativo = true; g.t = 7; aviso("🐬 Golfinhos! Toque neles para tirar foto.", "bom", 2600); }
      if (g.ativo) { g.t -= dt; if (g.t <= 0) { g.ativo = false; g.feito = true; } }
      if (M.chuvaNova && M.d > M.chuvaNova) { M.chuvaNova = null; c.chuva = true; aviso("🌧️ Começou a chover!", null); fase($("h-fase").textContent); }
      DICAS_MAR.forEach(function (dc) { if (M.d > dc[0] && !M.dicas[dc[0]]) { M.dicas[dc[0]] = 1; dica(dc[1], dc[0] === 2080 ? 6500 : 4600); } });
      // chegada: tem que estar na faixa do meio (alinhada com a rampa) e devagar
      if (M.d >= D) chegar();
    } else passoDesembarque(dt);
    // carros caindo na água
    M.deck.forEach(function (car) { if (car.cai != null && car.cai < 1.4) car.cai += dt * 0.9; });
    M.gaivotas.forEach(function (gv, i) { gv.x -= dt * (0.03 + i * 0.01) + M.v * dt * 0.0006; if (gv.x < -0.1) gv.x = 1.1; });
    $("h-vel").textContent = "⛴️ " + Math.round(M.v * 0.3) + " nós";
    $("h-dist").textContent = "📍 " + nome(destino()) + ": " + Math.max(0, Math.round(D - M.d)) + " m";
  }
  function chegar() {
    var v = M.v;
    if (Math.abs(M.fy - 1) > 0.25) {   // fora da faixa do meio: bate no muro do cais
      if (S.t - M.bate > 2) { M.bate = S.t; ponto("🧱 Chegou fora da rampa", -10); aviso("🧱 Fora da rampa! Volte para a faixa do meio.", "ruim"); M.sacode = 1; }
      M.d = D - 10; M.v = 0; return;
    }
    M.d = D; M.v = 0; M.atracou = true; M.tAtr = 0; $("desvio").hidden = true;
    if (v > 14) {
      // batida forte: os carros da frente escorregam e caem na água
      var auto = M.deck.filter(function (x) { return !x.jog; });
      var n = Math.min(auto.length, 1 + Math.floor((v - 14) / 6));
      for (var i = 0; i < n; i++) auto[i].cai = 0;
      M.sacode = 1.5;
      ponto("💥 Batida forte na margem", -20);
      ponto("🌊 " + n + (n === 1 ? " carro caiu" : " carros caíram") + " na água", -25 * n);
      aviso("💥 Batida forte! " + n + (n === 1 ? " carro caiu" : " carros caíram") + " na água! 🌊", "ruim", 3500);
    } else if (v > 6) {
      M.sacode = 1; ponto("😬 Encostou com tranco", -10); aviso("😬 Tranco na chegada! Solte um pouco antes.", "ruim");
    } else {
      ponto(v < 2.5 ? "⚓ Parou certinho na rampa" : "⚓ Atracou de leve", v < 2.5 ? 30 : 20);
      aviso("⚓ Atracou em " + nome(destino()) + "! Baixando a rampa…", "bom");
    }
    ponto("😊 Conforto dos passageiros (" + Math.round(M.conforto) + "%)", Math.round(M.conforto / 5));
    fase("⚓ Desembarque");
    $("seg-txt").textContent = "SEGURE PARA DESEMBARCAR";
  }

  // ======================================================================
  //  FASE 4 — DESEMBARQUE (a rampa da própria balsa baixa; os carros saem)
  // ======================================================================
  function passoDesembarque(dt) {
    M.tAtr += dt;
    M.rampa = clamp((M.tAtr - 0.4) / 1.3, 0, 1);
    var auto = M.deck.filter(function (x) { return !x.jog && x.cai == null; });
    auto.forEach(function (c, i) { if (M.tAtr > 2 + i * 0.7) c.sai += dt * (70 + c.sai * 1.4); });
    var jog = M.deck.filter(function (x) { return x.jog; })[0];
    if (jog && M.rampa >= 1) {
      if (S.segura) jog.v = Math.min(200, jog.v + 220 * dt); else jog.v = Math.max(0, jog.v - 320 * dt);
      var frente = auto.filter(function (c) { return c.sai < 420; });
      var limite = frente.length ? Math.min.apply(null, frente.map(function (c) { return c.sai; })) - 4 : 99999;
      jog.sai = Math.min(limite, jog.sai + jog.v * dt);
      if (jog.sai > 460 && !M.fim) { M.fim = true; setTimeout(finalizar, 600); }
      if (!M.dicas.saia) { M.dicas.saia = 1; dica("Rampa baixada! Segure o botão para sair da balsa e seguir para a cidade.", 4500); }
    }
  }
  function finalizar() {
    S.fase = "fim";
    var entregues = M.deck.filter(function (x) { return x.cai == null; }).length;
    ponto("🚗 " + entregues + " carros entregues em " + nome(destino()), entregues * 4);
    var pts = Math.max(0, S.pontos);
    S.total += pts; S.viagens++;
    var rec = +(ls("vdb-jogo-recorde") || 0); if (S.total > rec) ls("vdb-jogo-recorde", String(S.total));
    $("fim-tit").textContent = "🎉 Chegou em " + nome(destino()) + "!";
    $("fim-lista").innerHTML = S.itens.map(function (i) { return "<li" + (i[1] < 0 ? ' class="neg"' : "") + "><span>" + i[0] + "</span><b>" + (i[1] > 0 ? "+" : "") + i[1] + "</b></li>"; }).join("");
    $("fim-pts").textContent = pts; $("fim-total").textContent = S.total; $("fim-viagens").textContent = S.viagens;
    $("btn-proxima").textContent = "Voltar para " + nome(S.origem) + " ⛴️";
    mostrar("controles", false); mostrar("tela-fim", true); $("dica").hidden = true;
  }

  // ======================================================================
  //  DESENHO — estilo cartoon próprio (cores fortes e contorno grosso)
  // ======================================================================
  function tracar(lw) { cx.lineWidth = (lw || 3) * K; cx.strokeStyle = CONTORNO; cx.lineJoin = "round"; cx.lineCap = "round"; cx.stroke(); }
  function rr(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath();
  }
  function texto(t, x, y, tam, cor, alinhar) {
    cx.font = "900 " + Math.round(tam * K) + "px Montserrat, sans-serif"; cx.textAlign = alinhar || "center";
    cx.lineWidth = 4 * K; cx.strokeStyle = CONTORNO; cx.lineJoin = "round"; cx.strokeText(t, x, y); cx.fillStyle = cor || "#fff"; cx.fillText(t, x, y);
  }
  function ceu(yFim) {
    var c = S.clima || {}, g = cx.createLinearGradient(0, 0, 0, yFim);
    if (c.noite) { g.addColorStop(0, "#0b1d3d"); g.addColorStop(1, "#27466f"); }
    else if (c.chuva) { g.addColorStop(0, "#6f8396"); g.addColorStop(1, "#aebccb"); }
    else { g.addColorStop(0, "#3aa0ff"); g.addColorStop(1, "#bfe6ff"); }
    cx.fillStyle = g; cx.fillRect(0, 0, W, yFim + 2);
    if (c.noite) {
      cx.fillStyle = "#fff"; for (var i = 0; i < 30; i++) cx.fillRect((i * 97) % W, (i * 53) % Math.max(10, yFim * 0.7), 2, 2);
      cx.fillStyle = "#fff6c8"; cx.beginPath(); cx.arc(W * 0.82, yFim * 0.25, 16 * K, 0, 7); cx.fill(); tracar(2);
    } else if (!c.chuva) {
      cx.fillStyle = "#ffd54a"; cx.beginPath(); cx.arc(W * 0.84, yFim * 0.24, 22 * K, 0, 7); cx.fill(); tracar(3);
    }
  }
  function nuvem(x, y, s) {
    cx.fillStyle = (S.clima && S.clima.chuva) ? "#d6dde4" : "#ffffff";
    cx.beginPath();
    cx.arc(x, y, 16 * s, Math.PI * 0.5, Math.PI * 1.5);
    cx.arc(x + 18 * s, y - 12 * s, 18 * s, Math.PI, Math.PI * 1.85);
    cx.arc(x + 42 * s, y - 6 * s, 16 * s, Math.PI * 1.2, Math.PI * 1.95);
    cx.arc(x + 56 * s, y + 2 * s, 14 * s, Math.PI * 1.5, Math.PI * 0.5);
    cx.closePath(); cx.fill(); tracar(2.5);
  }
  function nuvens(desl) {
    for (var i = 0; i < 4; i++) {
      var x = (((i * 260 * K - desl * 0.15 - S.t * 6 * K) % (W + 300 * K)) + W + 300 * K) % (W + 300 * K) - 150 * K;
      nuvem(x, (50 + (i % 2) * 40) * K, K * (0.8 + (i % 3) * 0.2));
    }
  }
  function montanhas(y, desl, cor, alt, seed) {
    cx.fillStyle = cor; cx.beginPath(); cx.moveTo(-20, y + 2);
    for (var x = -20; x <= W + 40; x += 24 * K) {
      var wx = (x + desl) / K, h = alt * (0.6 + 0.4 * Math.sin(wx * 0.006 + seed)) * (0.7 + 0.3 * Math.sin(wx * 0.0023 + seed * 2));
      cx.lineTo(x, y - Math.max(10, h) * K);
    }
    cx.lineTo(W + 40, y + 2); cx.closePath(); cx.fill(); tracar(3);
  }
  function predios(y, desl) {
    var passo = 46 * K, total = 14 * passo;
    for (var i = 0; i < 14; i++) {
      var x = (((i * passo - desl) % total) + total) % total - 40 * K;
      var h = (24 + (i * 37) % 40) * K, w = 34 * K;
      cx.fillStyle = ["#f5e6c8", "#ffd8a8", "#e8f1ff", "#ffe082"][i % 4]; rr(x, y - h, w, h, 3 * K); cx.fill(); tracar(2);
      cx.fillStyle = (S.clima && S.clima.noite) ? "#ffe17a" : "#5b8fd6";
      for (var j = 0; j < 2; j++) cx.fillRect(x + 7 * K + j * 12 * K, y - h + 8 * K, 7 * K, 7 * K);
    }
  }
  function marFaixa(y0, y1, desl) {
    var c = S.clima || { s: 0.2 }, g = cx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, c.noite ? "#123a66" : "#22a0ef"); g.addColorStop(1, c.noite ? "#081f3c" : "#0b5fae");
    cx.fillStyle = g; cx.fillRect(0, y0, W, y1 - y0);
    var amp = (2 + c.s * 6) * K;
    for (var r = 0; r < 5; r++) {
      var yy = y0 + (y1 - y0) * (0.12 + r * 0.2), passo = (28 + r * 6) * K;
      var of = ((desl * (0.4 + r * 0.25) + S.t * 20 * K * (r % 2 ? 1 : -1)) % passo + passo) % passo;
      cx.strokeStyle = "rgba(255,255,255," + (0.3 + r * 0.08) + ")"; cx.lineWidth = (2 + r * 0.4) * K;
      cx.beginPath();
      for (var x = -passo - of; x < W + passo; x += passo) {
        var oy = Math.sin(S.t * 2 + x * 0.02 + r) * amp * 0.5;
        cx.moveTo(x, yy + oy); cx.quadraticCurveTo(x + passo * 0.25, yy + oy - amp, x + passo * 0.5, yy + oy);
      }
      cx.stroke();
    }
  }
  function carroLado(x, y, cor, tipo, jog, s) {   // x = frente (direita), y = chão
    s = (s || 1) * K; var L = (tipo === "van" ? 74 : CARRO) * s, h = 22 * s, x0 = x - L;
    cx.fillStyle = cor; rr(x0, y - h - 6 * s, L, h, 7 * s); cx.fill(); tracar(2.5);
    cx.beginPath();
    if (tipo === "van") rr(x0 + 4 * s, y - h - 22 * s, L - 14 * s, 20 * s, 6 * s);
    else { cx.moveTo(x0 + 12 * s, y - h - 5 * s); cx.lineTo(x0 + 20 * s, y - h - 20 * s); cx.lineTo(x0 + L - 22 * s, y - h - 20 * s); cx.lineTo(x0 + L - 10 * s, y - h - 5 * s); cx.closePath(); }
    cx.fillStyle = cor; cx.fill(); tracar(2.5);
    cx.fillStyle = "#bfe8ff";
    if (tipo === "van") { rr(x0 + 10 * s, y - h - 17 * s, L - 30 * s, 10 * s, 3 * s); cx.fill(); tracar(1.5); }
    else {
      cx.beginPath(); cx.moveTo(x0 + 21 * s, y - h - 7 * s); cx.lineTo(x0 + 25 * s, y - h - 16 * s); cx.lineTo(x0 + L / 2 - 2 * s, y - h - 16 * s); cx.lineTo(x0 + L / 2 - 2 * s, y - h - 7 * s); cx.closePath(); cx.fill(); tracar(1.5);
      cx.beginPath(); cx.moveTo(x0 + L / 2 + 3 * s, y - h - 7 * s); cx.lineTo(x0 + L / 2 + 3 * s, y - h - 16 * s); cx.lineTo(x0 + L - 24 * s, y - h - 16 * s); cx.lineTo(x0 + L - 16 * s, y - h - 7 * s); cx.closePath(); cx.fill(); tracar(1.5);
    }
    cx.fillStyle = "#fff59d"; cx.fillRect(x - 6 * s, y - h, 5 * s, 5 * s);
    cx.fillStyle = "#ff5252"; cx.fillRect(x0 + 1 * s, y - h, 4 * s, 5 * s);
    [x0 + 14 * s, x - 14 * s].forEach(function (rx) {
      cx.fillStyle = "#263238"; cx.beginPath(); cx.arc(rx, y - 6 * s, 8 * s, 0, 7); cx.fill(); tracar(2);
      cx.fillStyle = "#cfd8dc"; cx.beginPath(); cx.arc(rx, y - 6 * s, 3.5 * s, 0, 7); cx.fill();
    });
    if (jog) {
      var ay = y - h - 38 * s + Math.sin(S.t * 5) * 3 * K, mx = x - L / 2;
      cx.fillStyle = "#FFC107"; cx.beginPath(); cx.moveTo(mx, ay + 10 * K); cx.lineTo(mx - 8 * K, ay); cx.lineTo(mx + 8 * K, ay); cx.closePath(); cx.fill(); tracar(2);
      texto("VOCÊ", mx, ay - 4 * K, 11, "#fff");
    }
  }
  // balsa vista de lado; x0 = popa (esquerda), y = linha do convés
  function balsa(x0, y, L, opts) {
    opts = opts || {};
    var hC = 26 * K, n = S.clima && S.clima.noite;
    cx.fillStyle = "#1d4fc4";
    cx.beginPath(); cx.moveTo(x0, y); cx.lineTo(x0 + L, y); cx.lineTo(x0 + L - 14 * K, y + hC); cx.lineTo(x0 + 14 * K, y + hC); cx.closePath(); cx.fill(); tracar(3);
    cx.fillStyle = "#ffffff"; cx.fillRect(x0 + 6 * K, y + 3 * K, L - 12 * K, 6 * K);
    cx.fillStyle = "#FFC107"; cx.fillRect(x0 + 10 * K, y + 11 * K, L - 20 * K, 4 * K);
    if (L > 200 * K) texto("VAIDEBALSA", x0 + L / 2, y + 24 * K, 12, "#fff");
    if (opts.nome && L > 160 * K) { cx.fillStyle = "#fff"; rr(x0 + L - 74 * K, y - 42 * K, 58 * K, 20 * K, 4 * K); cx.fill(); tracar(2); texto(opts.nome, x0 + L - 45 * K, y - 27 * K, 10, "#1d4fc4"); }
    cx.strokeStyle = "#FFC107"; cx.lineWidth = 3 * K;
    cx.beginPath(); cx.moveTo(x0 + 6 * K, y - 16 * K); cx.lineTo(x0 + L - 6 * K, y - 16 * K); cx.stroke();
    for (var i = 0; i <= 12; i++) { var px = x0 + 6 * K + i * (L - 12 * K) / 12; cx.beginPath(); cx.moveTo(px, y - 16 * K); cx.lineTo(px, y); cx.stroke(); }
    if (opts.carros) opts.carros();
    var bx = x0 + L * 0.5 - 34 * K, by = y - 92 * K;
    cx.fillStyle = "#e7edf3"; cx.fillRect(bx + 8 * K, by + 40 * K, 8 * K, 52 * K); cx.fillRect(bx + 52 * K, by + 40 * K, 8 * K, 52 * K);
    cx.fillStyle = "#ffffff"; rr(bx, by, 68 * K, 42 * K, 6 * K); cx.fill(); tracar(3);
    cx.fillStyle = n ? "#ffe17a" : "#5bc0ff"; for (var j = 0; j < 3; j++) { rr(bx + 7 * K + j * 20 * K, by + 8 * K, 15 * K, 12 * K, 3 * K); cx.fill(); tracar(1.5); }
    cx.fillStyle = "#1d4fc4"; cx.fillRect(bx, by + 26 * K, 68 * K, 6 * K);
    cx.strokeStyle = CONTORNO; cx.lineWidth = 3 * K; cx.beginPath(); cx.moveTo(bx + 34 * K, by); cx.lineTo(bx + 34 * K, by - 28 * K); cx.stroke();
    var tremor = Math.sin(S.t * 8) * 3 * K;
    cx.fillStyle = "#FFC107"; cx.beginPath(); cx.moveTo(bx + 34 * K, by - 28 * K); cx.lineTo(bx + 54 * K, by - 22 * K + tremor); cx.lineTo(bx + 34 * K, by - 16 * K); cx.closePath(); cx.fill(); tracar(2);
    if (n) { cx.fillStyle = "#ff5252"; cx.beginPath(); cx.arc(x0 + 6 * K, y - 18 * K, 4 * K, 0, 7); cx.fill(); cx.fillStyle = "#69f0ae"; cx.beginPath(); cx.arc(x0 + L - 6 * K, y - 18 * K, 4 * K, 0, 7); cx.fill(); }
    rampa(x0, y, -1, opts.rampaPopa || 0);
    rampa(x0 + L, y, 1, opts.rampaProa || 0);
  }
  function rampa(x, y, dir, r) {   // r = 0 em pé, r = 1 deitada
    var e = r * r * (3 - 2 * r), comp = 34 * K, ang = (1 - e) * Math.PI / 2;
    var px = x + dir * Math.cos(ang) * comp, py = y - Math.sin(ang) * comp;
    cx.lineCap = "round";
    cx.strokeStyle = CONTORNO; cx.lineWidth = 10 * K; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(px, py); cx.stroke();
    cx.strokeStyle = "#5d6670"; cx.lineWidth = 6 * K; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(px, py); cx.stroke();
    cx.strokeStyle = "#FFC107"; cx.lineWidth = 3 * K; cx.beginPath();
    cx.moveTo(x + dir * Math.cos(ang) * comp * 0.75, y - Math.sin(ang) * comp * 0.75); cx.lineTo(px, py); cx.stroke();
  }
  function funcionario(x, y, s, acena) {
    s = (s || 1) * K;
    cx.fillStyle = "#263238"; cx.fillRect(x - 5 * s, y - 16 * s, 4 * s, 16 * s); cx.fillRect(x + 1 * s, y - 16 * s, 4 * s, 16 * s);
    cx.fillStyle = "#ff7a1a"; rr(x - 8 * s, y - 36 * s, 16 * s, 22 * s, 4 * s); cx.fill(); tracar(2);
    cx.fillStyle = "#fff"; cx.fillRect(x - 8 * s, y - 27 * s, 16 * s, 3 * s);
    cx.fillStyle = "#e3a57e"; cx.beginPath(); cx.arc(x, y - 43 * s, 7 * s, 0, 7); cx.fill(); tracar(2);
    cx.fillStyle = "#FFC107"; cx.beginPath(); cx.arc(x, y - 46 * s, 7 * s, Math.PI, 0); cx.closePath(); cx.fill(); tracar(2);
    var a = acena ? Math.sin(S.t * 7) * 0.6 : 0.3;
    var hx = x + 7 * s + Math.cos(-1.1 + a) * 16 * s, hy = y - 32 * s + Math.sin(-1.1 + a) * 16 * s;
    cx.strokeStyle = "#ff7a1a"; cx.lineWidth = 4 * s; cx.beginPath(); cx.moveTo(x + 7 * s, y - 32 * s); cx.lineTo(hx, hy); cx.stroke();
    cx.fillStyle = acena ? "#4ade80" : "#ef4444"; rr(hx, hy - 10 * s, 12 * s, 8 * s, 2 * s); cx.fill(); tracar(1.5);
  }
  function pessoa(x, y, cor, s) {
    s = (s || 1) * K; var p = Math.sin(S.t * 8 + x) * 3 * s;
    cx.strokeStyle = CONTORNO; cx.lineWidth = 3 * s; cx.beginPath(); cx.moveTo(x, y - 12 * s); cx.lineTo(x - 4 * s + p, y); cx.moveTo(x, y - 12 * s); cx.lineTo(x + 4 * s - p, y); cx.stroke();
    cx.fillStyle = cor; rr(x - 5 * s, y - 26 * s, 10 * s, 15 * s, 3 * s); cx.fill(); tracar(2);
    cx.fillStyle = "#e3a57e"; cx.beginPath(); cx.arc(x, y - 31 * s, 5 * s, 0, 7); cx.fill(); tracar(2);
  }
  function chuva() {
    var c = S.clima; if (!c || !c.chuva || S.fase === "menu") return;
    cx.strokeStyle = "rgba(220,235,255,.7)"; cx.lineWidth = 1.5 * K; cx.beginPath();
    for (var i = 0; i < 90; i++) {
      var x = ((i * 137 + S.t * 90) % (W + 40)) - 20, y = ((i * 71 + S.t * 520) % (H + 40)) - 20;
      cx.moveTo(x, y); cx.lineTo(x - 4 * K, y + 12 * K);
    }
    cx.stroke();
  }
  function popups(dt) {
    S.popups = S.popups.filter(function (p) { return p.t < 1.3; });
    S.popups.forEach(function (p, i) {
      p.t += dt;
      cx.globalAlpha = clamp(1.3 - p.t, 0, 1);
      var y0 = S.fase === "mar" ? H * 0.8 - i * 26 * K : H * 0.34 + i * 26 * K;   // no mar: embaixo, para não tapar o que vem pela frente
      texto(p.txt, p.sx != null ? p.sx : W * 0.5, (p.sy != null ? p.sy : y0) - p.t * 50 * K, 24, p.cor);
      cx.globalAlpha = 1;
    });
  }

  // ---------- cena em terra ----------
  function desenharTerra() {
    var cam = T.cam * K, chao = H * 0.8, ss = S.origem === "ss", yMar = H * 0.5;
    ceu(yMar);
    nuvens(cam);
    if (ss) { montanhas(yMar, cam * 0.1, "#2e9e5b", 150, 1.2); montanhas(yMar, cam * 0.16 + 300, "#43b56e", 90, 2.7); }
    else { montanhas(yMar, cam * 0.1, "#3a8f63", 95, 0.4); predios(yMar, cam * 0.15); }
    marFaixa(yMar, chao - 46 * K, cam);
    if (ss) navioFundeado(W * 0.6 - cam * 0.2, yMar + 14 * K, 0.55);
    // calçada com pedestres e ciclista
    cx.fillStyle = "#e8d8b0"; cx.fillRect(0, chao - 46 * K, W, 18 * K);
    T.pedestres.forEach(function (p, i) { pessoa(p.x * K - cam, chao - 30 * K, i ? "#e53935" : "#1e88e5", 0.9); });
    var cxx = T.ciclista.x * K - cam;
    if (cxx > -40 && cxx < W + 40) { cx.strokeStyle = CONTORNO; cx.lineWidth = 3 * K; cx.beginPath(); cx.arc(cxx - 10 * K, chao - 34 * K, 7 * K, 0, 7); cx.moveTo(cxx + 19 * K, chao - 34 * K); cx.arc(cxx + 12 * K, chao - 34 * K, 7 * K, 0, 7); cx.stroke(); pessoa(cxx, chao - 40 * K, "#43a047", 0.8); }
    // rua até o cais; depois, água (onde está a balsa)
    var xCais = RAMPA * K - cam;
    marFaixa(chao - 28 * K, H, cam);
    cx.fillStyle = "#5f6b76"; cx.fillRect(0, chao - 28 * K, Math.max(0, xCais), H);
    cx.fillStyle = "#3b4650"; cx.fillRect(0, chao - 2 * K, Math.max(0, xCais), 3 * K);
    cx.fillStyle = "#ffffff";
    for (var d = 0; d < 40; d++) { var dx = d * 60 * K - cam % (60 * K) - 30 * K; if (dx < xCais - 30 * K) cx.fillRect(dx, chao + 14 * K, 30 * K, 4 * K); }
    cx.fillStyle = "#8a8378"; rr(xCais - 12 * K, chao - 30 * K, 16 * K, H, 3 * K); cx.fill(); tracar(2);
    // placa do terminal
    var xp = 300 * K - cam;
    if (xp > -150 * K && xp < W + 150 * K) {
      cx.fillStyle = "#0A2C52"; cx.fillRect(xp, chao - 110 * K, 5 * K, 64 * K);
      rr(xp - 58 * K, chao - 142 * K, 124 * K, 36 * K, 6 * K); cx.fill(); tracar(2);
      cx.font = "800 " + Math.round(10 * K) + "px Montserrat, sans-serif"; cx.textAlign = "center"; cx.fillStyle = "#fff";
      cx.fillText(ss ? "TERMINAL S. SEBASTIÃO" : "TERMINAL ILHABELA", xp + 4 * K, chao - 128 * K);
      cx.fillStyle = "#FFC107"; cx.fillText("BALSA →", xp + 4 * K, chao - 114 * K);
    }
    if (T.cobra) cabine(LINHA_COBRANCA * K - cam, chao);
    // balsa atracada: popa encostada no cais, rampa da popa baixada
    var bx = RAMPA * K - cam + 30 * K, L = (S.balsa.vagas * VAGA + 140) * K, yDeck = chao;
    var subir = T.partindo ? clamp(T.partindo * 1.3, 0, 1) : 0;
    balsa(bx, yDeck, L, {
      nome: S.balsa.nome, rampaPopa: 1 - subir, rampaProa: 0,
      carros: function () {
        if (!T.estacionado) {
          var vx = deckX(T.vaga) * K - cam;
          cx.strokeStyle = "#4ade80"; cx.lineWidth = 3 * K; cx.setLineDash([6 * K, 5 * K]);
          cx.strokeRect(vx - CARRO * K - 6 * K, yDeck - 44 * K, CARRO * K + 12 * K, 42 * K); cx.setLineDash([]);
          texto("SUA VAGA", vx - CARRO * K / 2, yDeck - 50 * K, 12, "#4ade80");
        }
        T.fila.forEach(function (c) { if (c.x > RAMPA) carroLado(c.x * K - cam, yDeck, c.cor, c.tipo, false); });
        if (T.jog.x > RAMPA) carroLado(T.jog.x * K - cam, yDeck, "#FFC107", "carro", true);
      }
    });
    T.fila.forEach(function (c) { if (c.x <= RAMPA) carroLado(c.x * K - cam, chao, c.cor, c.tipo, false); });
    if (T.jog.x <= RAMPA) carroLado(T.jog.x * K - cam, chao, "#FFC107", "carro", true);
    funcionario((RAMPA - 46) * K - cam, chao - 28 * K, 1, true);
    if (T.cobra && !T.pago) {
      var xl = LINHA_COBRANCA * K - cam;
      cx.globalAlpha = 0.3 + 0.2 * Math.sin(S.t * 6); cx.fillStyle = "#4ade80"; cx.fillRect(xl - 44 * K, chao - 26 * K, 50 * K, 26 * K); cx.globalAlpha = 1;
      cx.fillStyle = "#fff"; cx.fillRect(xl + 4 * K, chao - 26 * K, 5 * K, 26 * K);
      texto("PARE AQUI", xl - 18 * K, chao + 26 * K, 11, "#4ade80");
    }
    if (T.partindo) { cx.fillStyle = "rgba(10,44,82," + clamp(T.partindo - 1.2, 0, 1) + ")"; cx.fillRect(0, 0, W, H); }
  }
  function cabine(x, chao) {
    cx.fillStyle = "#37474f"; cx.fillRect(x + 4 * K, chao - 36 * K, 8 * K, 36 * K);
    cx.fillStyle = "#ffffff"; rr(x + 10 * K, chao - 100 * K, 50 * K, 72 * K, 5 * K); cx.fill(); tracar(3);
    cx.fillStyle = "#1d4fc4"; rr(x + 2 * K, chao - 114 * K, 66 * K, 18 * K, 5 * K); cx.fill(); tracar(3);
    cx.font = "800 " + Math.round(9 * K) + "px Montserrat, sans-serif"; cx.textAlign = "center"; cx.fillStyle = "#fff"; cx.fillText("COBRANÇA", x + 35 * K, chao - 102 * K);
    cx.fillStyle = "#bfe8ff"; rr(x + 16 * K, chao - 90 * K, 38 * K, 24 * K, 3 * K); cx.fill(); tracar(2);
    pessoa(x + 35 * K, chao - 66 * K, "#1d4fc4", 0.7);
    cx.save(); cx.translate(x + 8 * K, chao - 32 * K); cx.rotate(-T.cancela * Math.PI / 2.2);
    cx.fillStyle = "#fff"; rr(0, -4 * K, 74 * K, 8 * K, 4 * K); cx.fill(); tracar(2);
    cx.fillStyle = "#e53935"; for (var i = 0; i < 4; i++) cx.fillRect((8 + i * 17) * K, -4 * K, 8 * K, 8 * K);
    cx.restore();
  }
  function navioFundeado(x, y, s) {
    s = s * K;
    cx.fillStyle = "#c62828"; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + 200 * s, y); cx.lineTo(x + 186 * s, y + 18 * s); cx.lineTo(x + 10 * s, y + 18 * s); cx.closePath(); cx.fill(); tracar(2);
    cx.fillStyle = "#37474f"; cx.fillRect(x + 4 * s, y - 6 * s, 192 * s, 6 * s);
    cx.fillStyle = "#ffffff"; rr(x + 150 * s, y - 34 * s, 36 * s, 28 * s, 3 * s); cx.fill(); tracar(1.5);
    cx.fillStyle = "#263238"; cx.fillRect(x + 160 * s, y - 46 * s, 10 * s, 12 * s);
  }

  // ---------- cena no mar: câmera atrás da balsa (perspectiva de corrida clássica, arte própria) ----------
  var LANE = 24, CAM_ATRAS = 48, CAM_ALT = 24, MEIA = 10, FREIO = 11;
  var V3 = { F: 500, hz: 200, cx0: 180, camX: 0, camZ: 0 };
  function pj(x, y, z) { var zz = Math.max(0.6, z - V3.camZ), u = V3.F / zz; return { x: V3.cx0 + (x - V3.camX) * u, y: V3.hz + (CAM_ALT - y) * u, u: u }; }
  function contorno(u, lw) { lw = lw || 2.5; cx.lineWidth = Math.min(lw * K, Math.max(0.6, u * 0.09 * lw)); cx.strokeStyle = CONTORNO; cx.lineJoin = "round"; cx.lineCap = "round"; cx.stroke(); }
  function poli(pts, cor, lw) {
    cx.beginPath(); cx.moveTo(pts[0].x, pts[0].y); for (var i = 1; i < pts.length; i++) cx.lineTo(pts[i].x, pts[i].y); cx.closePath();
    cx.fillStyle = cor; cx.fill(); if (lw) contorno(pts[0].u, lw);
  }
  function caixa(x0, x1, y0, y1, z, cor, lw) {   // retângulo de frente para a câmera
    var a = pj(x0, y1, z), b = pj(x1, y0, z);
    cx.beginPath(); cx.rect(a.x, a.y, b.x - a.x, b.y - a.y); cx.fillStyle = cor; cx.fill(); if (lw) contorno(a.u, lw);
    return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y, u: a.u };
  }
  function piso(x0, x1, z0, z1, y, cor, lw) { poli([pj(x0, y, z0), pj(x1, y, z0), pj(x1, y, z1), pj(x0, y, z1)], cor, lw); }
  function rotulo(t, x, y, px, cor) {
    if (px < 5) return;
    cx.font = "900 " + Math.round(px) + "px Montserrat, sans-serif"; cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillStyle = cor || "#fff"; cx.fillText(t, x, y); cx.textBaseline = "alphabetic";
  }

  function desenharMar() {
    var d = M.d, c = S.clima, ss = destino() === "ss", bx = (M.fy - 1) * LANE;
    V3.hz = Math.round(H * 0.32); V3.F = Math.min(W * 1.35, H * 0.95); V3.cx0 = W / 2;
    V3.camX = bx * 0.65; V3.camZ = d - 60 - CAM_ATRAS;
    var hz = V3.hz, perto = clamp(d / D, 0, 1);
    ceu(hz);
    nuvens(V3.camX * 5 * K + d * 0.4 * K);
    montanhas(hz, V3.camX * 2 * K + 200 * K, ss ? "#2f9a5b" : "#3a8f63", 55 + perto * 75, ss ? 1.1 : 3.3);
    marPerspectiva(c);
    terra3D(ss);
    // tudo o que está na água, desenhado de longe para perto
    var itens = [], s = d - 60;
    if (ss) { itens.push({ z: D - 520, f: function () { navio3D(-150, D - 520); } }); itens.push({ z: D - 940, f: function () { navio3D(190, D - 940); } }); }
    for (var zb = Math.floor((V3.camZ + 4) / 60) * 60 + 60; zb < V3.camZ + 1000 && zb < D - 30; zb += 60) (function (z) {
      itens.push({ z: z, f: function () { boia3D(-42, z, "#ef4444"); boia3D(42, z, "#22c55e"); } });
    })(zb);
    var alvo = M.atracou ? null : alertaMar();
    M.obst.forEach(function (o) {
      if (o.cruza && o.p >= 1) return;
      itens.push({ z: o.x, f: function () { obst3D(o, alvo && alvo.o === o); } });
    });
    if (M.golf.ativo) itens.push({ z: d + 30, f: function () { golfinhos3D(bx); } });
    if (!M.atracou && D - d < 420 && M.v > 0.3) { var zP = Math.min(D, d + M.v * M.v / (2 * FREIO)); itens.push({ z: zP, f: function () { linhaParada(bx, zP); } }); }
    itens.push({ z: d - 25, balsa: true, f: function () { esteira(bx, s); balsa3D(bx, c); } });
    itens.sort(function (a, b) { return b.z - a.z; });
    itens.forEach(function (it) { var zz = it.z - V3.camZ; if (it.balsa || (zz > 3 && zz < 2600)) it.f(); });
    hudMar(alvo);
    cx.strokeStyle = CONTORNO; cx.lineWidth = 2.5 * K;
    M.gaivotas.forEach(function (gv) { var x = gv.x * W, y = gv.y * hz + 20 * K + Math.sin(S.t * 3 + x) * 4 * K, a = Math.sin(S.t * 8 + x) * 4 * K; cx.beginPath(); cx.moveTo(x - 10 * K, y + a); cx.quadraticCurveTo(x - 5 * K, y - 5 * K, x, y); cx.quadraticCurveTo(x + 5 * K, y - 5 * K, x + 10 * K, y + a); cx.stroke(); });
    if (c.noite) { cx.fillStyle = "rgba(6,20,43,.22)"; cx.fillRect(0, 0, W, H); }
  }
  function marPerspectiva(c) {
    var hz = V3.hz, g = cx.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, c.noite ? "#1c4a7a" : "#6fcaf6"); g.addColorStop(0.3, c.noite ? "#123a66" : "#1e93e6"); g.addColorStop(1, c.noite ? "#081f3c" : "#0a5bb0");
    cx.fillStyle = g; cx.fillRect(0, hz, W, H - hz);
    // faixas de água passando por baixo (sensação de velocidade)
    var passo = 14, i0 = Math.floor((V3.camZ + 2) / passo);
    cx.fillStyle = c.noite ? "rgba(255,255,255,.035)" : "rgba(255,255,255,.08)";
    for (var i = i0; i < i0 + 50; i++) {
      if (i % 2) continue;
      var y0 = pj(0, 0, Math.max(V3.camZ + 1, i * passo)).y, y1 = pj(0, 0, i * passo + passo).y;
      if (y1 > H) continue;
      cx.fillRect(0, y1, W, Math.max(0.5, Math.min(H, y0) - y1));
    }
    // cristas de onda (mais com mar agitado)
    var amp = 0.4 + c.s * 1.4, dens = 0.22 + c.s * 0.3;
    cx.strokeStyle = "rgba(255,255,255,.75)";
    for (var j = i0; j < i0 + 42; j++) for (var k = -7; k <= 7; k++) {
      var h = Math.abs(Math.sin(j * 12.9898 + k * 78.233) * 43758.5453) % 1;
      if (h > dens) continue;
      var p = pj(k * 13 + h * 9 - 4, 0, j * passo + h * passo);
      if (p.y < hz + 2 || p.y > H + 10 || j * passo > D) continue;
      var w = (1.6 + h * 2) * p.u, a = Math.sin(S.t * 2 + j + k) * amp * p.u * 0.25;
      cx.lineWidth = Math.max(0.8, p.u * 0.3); cx.beginPath(); cx.moveTo(p.x - w, p.y + a); cx.quadraticCurveTo(p.x, p.y - amp * p.u * 0.6 + a, p.x + w, p.y + a); cx.stroke();
    }
    // divisão das 3 faixas do canal (espuma tracejada)
    if (!M.atracou) [-LANE / 2, LANE / 2].forEach(function (x) {
      for (var z = Math.floor(V3.camZ / 24) * 24; z < V3.camZ + 700 && z < D - 20; z += 24) {
        if (z < V3.camZ + 2) continue;
        poli([pj(x - 0.5, 0, z), pj(x + 0.5, 0, z), pj(x + 0.5, 0, z + 10), pj(x - 0.5, 0, z + 10)], "rgba(255,255,255,.4)");
      }
    });
  }
  function terra3D(ss) {   // margem de destino: cais, rampa de concreto, rua, terminal e cidade
    if (D - V3.camZ < 1) return;
    var q = pj(0, 2, D), qa = pj(0, -0.4, D), hz = V3.hz;
    var g = cx.createLinearGradient(0, hz, 0, Math.max(hz + 1, q.y));
    g.addColorStop(0, ss ? "#a7c79a" : "#6fb46e"); g.addColorStop(1, "#e8d8b0");
    cx.fillStyle = g; cx.fillRect(0, hz - 1, W, q.y - hz + 1);
    cx.fillStyle = "#8a8378"; cx.fillRect(0, q.y, W, Math.max(1, qa.y - q.y));
    piso(-7, 7, D, D + 700, 2.01, "#5f6b76", 0);
    for (var z = D + 3; z < D + 300; z += 14) piso(-0.25, 0.25, z, z + 7, 2.02, "#FFC107", 0);
    piso(-11, 11, D, D + 7, 2.03, "#b9b2a6", 2);
    piso(-11, 11, D, D + 0.8, 2.04, "#FFC107", 0);
    for (var k = 8; k >= 0; k--) {
      var zk = D + 30 + k * 34;
      [-1, 1].forEach(function (l) {
        var x = l * (22 + ((k * 7 + (l > 0 ? 3 : 0)) % 4) * 6), cidade = ss ? (k + (l > 0 ? 1 : 0)) % 3 !== 0 : (k + (l > 0 ? 1 : 0)) % 3 === 0;
        if (cidade) {
          var h = (ss ? 8 : 5) + ((k * 13 + (l > 0 ? 5 : 0)) % 5) * (ss ? 3 : 1.4);
          var b = caixa(x - 5, x + 5, 2, 2 + h, zk, ["#f5e6c8", "#ffd8a8", "#e8f1ff", "#ffe082"][(k + (l > 0 ? 2 : 0)) % 4], 2);
          if (b.w > 6) { caixa(x - 3.5, x - 1, 2 + h * 0.55, 2 + h * 0.75, zk, S.clima.noite ? "#ffe17a" : "#5b8fd6", 0); caixa(x + 1, x + 3.5, 2 + h * 0.55, 2 + h * 0.75, zk, S.clima.noite ? "#ffe17a" : "#5b8fd6", 0); }
        } else {
          caixa(x - 0.5, x + 0.5, 2, 5.5, zk, "#6d4c41", 1.5);
          var p = pj(x, 7.5, zk); cx.beginPath(); cx.arc(p.x, p.y, 3.4 * p.u, 0, 7); cx.fillStyle = "#2e9e5b"; cx.fill(); contorno(p.u, 2.5);
        }
      });
    }
    // terminal
    var t = caixa(-36, -14, 2, 11, D + 14, "#ffffff", 2.5);
    caixa(-33, -28, 2, 6.5, D + 14, "#37474f", 0);
    caixa(-25, -21, 7, 9.5, D + 14, "#bfe8ff", 1.2); caixa(-19.5, -15.5, 7, 9.5, D + 14, "#bfe8ff", 1.2);
    var tt = caixa(-37, -13, 11, 13.6, D + 14, "#1d4fc4", 2.5);
    rotulo(ss ? "TERMINAL S. SEBASTIÃO" : "TERMINAL ILHABELA", tt.x + tt.w / 2, tt.y + tt.h / 2, Math.min(tt.h * 0.55, tt.w / 12), "#fff");
    // placa da avenida
    caixa(15, 15.5, 2, 8, D + 9, "#0A2C52", 0);
    var pl = caixa(10, 34, 8, 10.4, D + 9, "#0A2C52", 2);
    rotulo(ss ? "AV. A. J. DO NASCIMENTO" : "AV. PRINCESA ISABEL · PEREQUÊ", pl.x + pl.w / 2, pl.y + pl.h / 2, Math.min(pl.h * 0.5, pl.w / 17), "#fff");
    var fp = pj(12.5, 2, D + 2); if (fp.u > 1.2) funcionario(fp.x, fp.y, 1.8 * fp.u / (50 * K), M.atracou && M.rampa >= 1);
    // zona de parada (na água, em frente à rampa)
    if (!M.atracou && D - M.d < 700) {
      cx.globalAlpha = 0.35 + 0.2 * Math.sin(S.t * 6);
      piso(-10, 10, D - 12, D, 0.05, "#4ade80", 0);
      cx.globalAlpha = 1;
      var pz = pj(0, 0, D - 6); rotulo("PARE AQUI", pz.x, pz.y, pz.u * 2.2, "#ffffff");
    }
    // defensas do cais
    [-13, 13].forEach(function (x) { caixa(x - 0.9, x + 0.9, -0.4, 4, D - 1, "#6b655c", 2); caixa(x - 1.1, x + 1.1, 0.4, 1.4, D - 1.2, "#263238", 0); });
  }
  function navio3D(x, z) { var p = pj(x, 0, z), s = p.u * 0.35 / K; if (p.u < 0.08) return; navioFundeado(p.x - 100 * s * K, p.y - 14 * s * K, s); }
  function boia3D(x, z, cor) {
    var p = pj(x, 0, z), u = p.u, bob = Math.sin(S.t * 2 + z) * 0.25 * u;
    if (p.x < -30 || p.x > W + 30) return;
    cx.beginPath(); cx.moveTo(p.x - 0.9 * u, p.y + bob); cx.lineTo(p.x + 0.9 * u, p.y + bob); cx.lineTo(p.x + 0.4 * u, p.y - 3 * u + bob); cx.lineTo(p.x - 0.4 * u, p.y - 3 * u + bob); cx.closePath();
    cx.fillStyle = cor; cx.fill(); contorno(u, 2);
    cx.fillStyle = "#fff"; cx.fillRect(p.x - 0.7 * u, p.y - 1.6 * u + bob, 1.4 * u, 0.4 * u);
    if (S.clima.noite || Math.sin(S.t * 4 + z) > 0.6) { cx.fillStyle = cor === "#22c55e" ? "#c8ffd9" : "#ffd6d6"; cx.beginPath(); cx.arc(p.x, p.y - 3.4 * u + bob, 0.5 * u, 0, 7); cx.fill(); }
  }
  function obst3D(o, alerta) {
    var x = (o.f - 1) * LANE, p = pj(x, 0, o.x), u = p.u * (o.cruza ? 1 : 1 + 0.8 * clamp((o.x - V3.camZ - 70) / 150, 0, 1)), topo = 4;   // exagerado (cartoon) para ver de longe
    if (p.x < -45 * u || p.x > W + 45 * u) return;
    var bob = Math.sin(S.t * 2 + o.x) * 0.3 * u;
    cx.save(); cx.translate(p.x, p.y + bob);
    if (o.tipo === "lancha" || o.tipo === "veleiro" || o.tipo === "caiaque") { cx.fillStyle = "rgba(255,255,255,.7)"; cx.beginPath(); cx.ellipse(0, 0.2 * u, (o.tipo === "caiaque" ? 2 : 4.5) * u, 0.5 * u, 0, 0, 7); cx.fill(); }
    if (o.tipo === "lancha") {   // vem de frente, levantando espuma
      var sp = Math.sin(S.t * 12) * 0.3 * u;
      cx.fillStyle = "rgba(255,255,255,.9)"; [-1, 1].forEach(function (l) { cx.beginPath(); cx.ellipse(l * 4 * u, -0.3 * u + sp, 1.6 * u, 0.9 * u, 0, 0, 7); cx.fill(); });
      cx.beginPath(); cx.moveTo(-3.5 * u, -2 * u); cx.lineTo(3.5 * u, -2 * u); cx.lineTo(2.2 * u, 0); cx.lineTo(0, 0.6 * u); cx.lineTo(-2.2 * u, 0); cx.closePath(); cx.fillStyle = "#fff"; cx.fill(); contorno(u, 2.5);
      cx.fillStyle = "#e53935"; cx.fillRect(-3.1 * u, -1.5 * u, 6.2 * u, 0.45 * u);
      cx.beginPath(); cx.moveTo(-2.4 * u, -2 * u); cx.lineTo(2.4 * u, -2 * u); cx.lineTo(1.6 * u, -3.4 * u); cx.lineTo(-1.6 * u, -3.4 * u); cx.closePath(); cx.fillStyle = "#bfe8ff"; cx.fill(); contorno(u, 2);
      cx.fillStyle = "#fff59d"; [-2.4, 2.4].forEach(function (l) { cx.beginPath(); cx.arc(l * u, -1 * u, 0.35 * u, 0, 7); cx.fill(); });
    } else if (o.tipo === "veleiro") {
      topo = 12.5;
      cx.beginPath(); cx.moveTo(-2.6 * u, -1.4 * u); cx.lineTo(2.6 * u, -1.4 * u); cx.lineTo(1.6 * u, 0.2 * u); cx.lineTo(-1.6 * u, 0.2 * u); cx.closePath(); cx.fillStyle = "#fff"; cx.fill(); contorno(u, 2);
      cx.strokeStyle = CONTORNO; cx.lineWidth = Math.max(1, 0.25 * u); cx.beginPath(); cx.moveTo(0, -1.4 * u); cx.lineTo(0, -12 * u); cx.stroke();
      cx.beginPath(); cx.moveTo(0.3 * u, -11.5 * u); cx.lineTo(0.3 * u, -2 * u); cx.lineTo(5 * u, -2 * u); cx.closePath(); cx.fillStyle = "#fff8e1"; cx.fill(); contorno(u, 2);
      cx.beginPath(); cx.moveTo(-0.3 * u, -9 * u); cx.lineTo(-0.3 * u, -2 * u); cx.lineTo(-3.6 * u, -2 * u); cx.closePath(); cx.fillStyle = "#4fc3f7"; cx.fill(); contorno(u, 2);
    } else if (o.tipo === "caiaque") {
      topo = 3;
      cx.fillStyle = "#FFC107"; cx.beginPath(); cx.ellipse(0, -0.2 * u, 1.3 * u, 0.5 * u, 0, 0, 7); cx.fill(); contorno(u, 2);
      cx.fillStyle = "#e53935"; rr(-0.5 * u, -1.7 * u, 1 * u, 1.3 * u, 0.25 * u); cx.fill(); contorno(u, 1.5);
      cx.fillStyle = "#e3a57e"; cx.beginPath(); cx.arc(0, -2.1 * u, 0.45 * u, 0, 7); cx.fill(); contorno(u, 1.5);
      cx.save(); cx.translate(0, -1.2 * u); cx.rotate(Math.sin(S.t * 4) * 0.6);
      cx.strokeStyle = CONTORNO; cx.lineWidth = Math.max(1, 0.3 * u); cx.beginPath(); cx.moveTo(-2.2 * u, 0); cx.lineTo(2.2 * u, 0); cx.stroke();
      cx.fillStyle = "#FFC107"; cx.fillRect(-2.5 * u, -0.3 * u, 0.6 * u, 0.6 * u); cx.fillRect(1.9 * u, -0.3 * u, 0.6 * u, 0.6 * u); cx.restore();
    } else if (o.tipo === "boia") {
      cx.beginPath(); cx.moveTo(-1.3 * u, 0.3 * u); cx.lineTo(1.3 * u, 0.3 * u); cx.lineTo(0.6 * u, -3.4 * u); cx.lineTo(-0.6 * u, -3.4 * u); cx.closePath(); cx.fillStyle = "#ef4444"; cx.fill(); contorno(u, 2);
      cx.fillStyle = "#fff"; cx.fillRect(-1 * u, -1.6 * u, 2 * u, 0.6 * u);
      cx.fillStyle = "#FFC107"; cx.beginPath(); cx.arc(0, -3.8 * u, 0.5 * u, 0, 7); cx.fill(); contorno(u, 1.5);
    } else if (o.tipo === "tronco") {
      topo = 2;
      cx.fillStyle = "#8d5a3b"; rr(-4.5 * u, -1.2 * u, 9 * u, 1.4 * u, 0.7 * u); cx.fill(); contorno(u, 2);
      cx.fillStyle = "#c48a5a"; cx.beginPath(); cx.ellipse(4.3 * u, -0.5 * u, 0.5 * u, 0.7 * u, 0, 0, 7); cx.fill(); contorno(u, 1.5);
    } else {   // cargueiro de lado, cruzando o canal
      topo = 18;
      var s = 0.3 * u; cx.scale(-1, 1); cx.translate(0, -16 * s);
      cx.fillStyle = "#c62828"; cx.beginPath(); cx.moveTo(-130 * s, 0); cx.lineTo(130 * s, 0); cx.lineTo(116 * s, 22 * s); cx.lineTo(-120 * s, 22 * s); cx.closePath(); cx.fill(); contorno(u, 2.5);
      cx.fillStyle = "#37474f"; cx.fillRect(-126 * s, -6 * s, 252 * s, 6 * s);
      var cores = ["#1e88e5", "#43a047", "#fb8c00", "#8e24aa", "#e53935", "#00acc1"];
      for (var i = 0; i < 9; i++) { cx.fillStyle = cores[i % 6]; rr(-90 * s + i * 22 * s, -26 * s - (i % 2) * 18 * s, 20 * s, 20 * s + (i % 2) * 18 * s, 2 * s); cx.fill(); contorno(u, 1.5); }
      cx.fillStyle = "#ffffff"; rr(-124 * s, -44 * s, 30 * s, 38 * s, 3 * s); cx.fill(); contorno(u, 2);
      cx.fillStyle = "#263238"; cx.fillRect(-114 * s, -58 * s, 10 * s, 14 * s);
      cx.fillStyle = "rgba(255,255,255,.7)"; cx.beginPath(); cx.ellipse(-135 * s, 18 * s, 22 * s, 5 * s, 0, 0, 7); cx.fill();
    }
    cx.restore();
    if (alerta && Math.sin(S.t * 10) > -0.3) {   // seta vermelha em cima do que está na sua faixa
      var ay = p.y - (topo + 1) * u - 10 * K;
      cx.fillStyle = "#ef4444"; cx.beginPath(); cx.moveTo(p.x, ay + 10 * K); cx.lineTo(p.x - 10 * K, ay - 6 * K); cx.lineTo(p.x + 10 * K, ay - 6 * K); cx.closePath(); cx.fill(); tracar(2);
    }
  }
  function golfinhos3D(bx) {
    var g = M.golf, lado = bx > 0 ? -1 : 1;
    for (var i = 2; i >= 0; i--) {
      var fs = (S.t * 1.4 + i * 0.5) % 2, z = M.d + 22 + i * 7, x = bx + lado * (24 + i * 3);
      var p = pj(x, Math.sin(Math.min(1, fs) * Math.PI) * 4, z), u = p.u;
      if (i === 1) { g.sx = p.x; g.sy = p.y; }
      if (fs >= 1) continue;
      cx.save(); cx.translate(p.x, p.y); cx.scale(lado, 1); cx.rotate(-0.7 + fs * 1.4);
      cx.fillStyle = "#5c8fb8"; cx.beginPath(); cx.ellipse(0, 0, 2.6 * u, 0.9 * u, 0, 0, 7); cx.fill(); contorno(u, 2.5);
      cx.beginPath(); cx.moveTo(-0.2 * u, -0.8 * u); cx.lineTo(0.5 * u, -1.8 * u); cx.lineTo(0.9 * u, -0.7 * u); cx.closePath(); cx.fill(); contorno(u, 2);
      cx.fillStyle = "#fff"; cx.beginPath(); cx.arc(1.7 * u, -0.2 * u, 0.22 * u, 0, 7); cx.fill();
      cx.restore();
    }
  }
  function linhaParada(bx, z) {   // onde a proa vai parar se você soltar agora
    var sobra = D - z, cor = sobra < 1 ? "#ef4444" : sobra <= 12 ? "#4ade80" : "#FFC107";
    cx.globalAlpha = 0.6 + 0.3 * Math.sin(S.t * 8);
    piso(bx - MEIA - 1.5, bx + MEIA + 1.5, z - 0.8, z + 0.8, 0.06, cor, 0);
    cx.globalAlpha = 1;
  }
  function esteira(bx, s) {
    if (M.atracou) return;
    var forca = clamp(M.v / 40, 0.15, 1), z0 = Math.floor((s - 2) / 4) * 4;
    for (var k = 0; k < 12; k++) {
      var z = z0 - k * 4; if (z - V3.camZ < 2) break;
      var a = (1 - k / 12) * 0.75 * forca;
      [-1, 1].forEach(function (l) {
        var p = pj(bx + l * (5 + (s - z) * 0.22), 0, z);
        cx.fillStyle = "rgba(255,255,255," + a + ")"; cx.beginPath(); cx.ellipse(p.x, p.y, (1.6 + (s - z) * 0.05) * p.u, 0.45 * p.u, 0, 0, 7); cx.fill();
      });
    }
    var p = pj(bx, 0, s - 1.5); cx.fillStyle = "rgba(255,255,255," + 0.75 * forca + ")"; cx.beginPath(); cx.ellipse(p.x, p.y, 8 * p.u, 1 * p.u, 0, 0, 7); cx.fill();
  }
  function carro3D(x, z, y, cor, tipo, jog) {   // carro visto de trás
    var van = tipo === "van", hw = van ? 1.7 : 1.6, alto = van ? 2.7 : 1.4, teto = van ? 2.7 : 2.4;
    if (!van) piso(x - hw, x + hw, z + 3.4, z + 4.4, y + 1.4, cor, 2);
    piso(x - (van ? hw : 1.25), x + (van ? hw : 1.25), z + (van ? 0.05 : 0.9), z + (van ? 4.4 : 3.4), y + teto, cor, 2);
    cx.fillStyle = "rgba(255,255,255,.28)"; cx.fill();
    if (!van) {
      piso(x - hw, x + hw, z, z + 0.9, y + 1.4, cor, 2);
      caixa(x - 1.25, x + 1.25, y + 1.4, y + 2.4, z + 0.9, cor, 2);
      caixa(x - 1.0, x + 1.0, y + 1.55, y + 2.25, z + 0.9, "#bfe8ff", 1.2);
    }
    caixa(x - hw + 0.1, x - hw + 0.75, y, y + 0.5, z + 0.3, "#263238", 0); caixa(x + hw - 0.75, x + hw - 0.1, y, y + 0.5, z + 0.3, "#263238", 0);
    caixa(x - hw, x + hw, y + 0.35, y + alto, z, cor, 2.5);
    if (van) caixa(x - 1.2, x + 1.2, y + 1.7, y + 2.4, z, "#bfe8ff", 1.2);
    var luz = S.clima.noite ? "#ff2d2d" : "#ff5252";
    caixa(x - hw + 0.15, x - hw + 0.65, y + 0.85, y + 1.2, z, luz, 0); caixa(x + hw - 0.65, x + hw - 0.15, y + 0.85, y + 1.2, z, luz, 0);
    caixa(x - 0.5, x + 0.5, y + 0.5, y + 0.8, z, "#ffffff", 0);
    if (jog) {
      var a = pj(x, y + teto + 1.2, z + 1), by = Math.sin(S.t * 5) * 3 * K;
      cx.fillStyle = "#FFC107"; cx.beginPath(); cx.moveTo(a.x, a.y + by); cx.lineTo(a.x - 8 * K, a.y - 10 * K + by); cx.lineTo(a.x + 8 * K, a.y - 10 * K + by); cx.closePath(); cx.fill(); tracar(2);
      texto("VOCÊ", a.x, a.y - 14 * K + by, 11, "#fff");
    }
  }
  function ponte3D(bx, z, xl, xr, n) {   // casaria e passadiço numa lateral (o meio fica livre para ver à frente)
    var x0 = xl + 0.3, x1 = xl + 5.2;
    caixa(x0, x1, 2.3, 8.6, z, "#ffffff", 2.5);
    caixa(x0 + 0.8, x0 + 2.2, 5.5, 7, z, n ? "#ffe17a" : "#5bc0ff", 1.2); caixa(x0 + 2.8, x0 + 4.2, 5.5, 7, z, n ? "#ffe17a" : "#5bc0ff", 1.2);
    caixa(x0, x1, 3.2, 4, z, "#1d4fc4", 0);
    var m0 = pj(x0 + 2.4, 11.6, z), m1 = pj(x0 + 2.4, 15.5, z), tr = Math.sin(S.t * 8) * 0.4 * m0.u;
    cx.strokeStyle = CONTORNO; cx.lineWidth = Math.max(1.5, m0.u * 0.3); cx.beginPath(); cx.moveTo(m0.x, m0.y); cx.lineTo(m1.x, m1.y); cx.stroke();
    cx.beginPath(); cx.moveTo(m1.x, m1.y); cx.lineTo(m1.x + 3 * m0.u, m1.y + 0.8 * m0.u + tr); cx.lineTo(m1.x, m1.y + 1.6 * m0.u); cx.closePath(); cx.fillStyle = "#FFC107"; cx.fill(); contorno(m0.u, 2);
    caixa(x0 - 0.3, x1 + 0.6, 8.6, 11.6, z - 1, "#ffffff", 2.5);
    caixa(x0 + 0.3, x1, 9.8, 11, z - 1, n ? "#ffe17a" : "#5bc0ff", 1.5);
    var pl = caixa(x0, x1 + 0.3, 7.2, 8.4, z + 0.1, "#1d4fc4", 1.5);
    rotulo(S.balsa.nome, pl.x + pl.w / 2, pl.y + pl.h / 2, pl.h * 0.8, "#fff");
  }
  function balsa3D(bx, c) {
    var b = M.d, s = b - 60, filas = Math.ceil(S.balsa.vagas / 2), zs = filas > 3 ? [9, 20, 41, 52] : [11, 24, 47], mid = b - 31, xl = bx - MEIA, xr = bx + MEIA, n = c.noite;
    var piv = pj(bx, 0, s);
    var roll = M.atracou ? 0 : -(M.faixa - M.fy) * 0.06 + Math.sin(S.t * 1.1) * (0.008 + c.s * 0.03) - M.rajada * 0.04;
    var bob = M.atracou ? 0 : Math.sin(S.t * 1.6) * (1 + c.s * 4) * K, tremor = M.sacode > 0 ? Math.sin(S.t * 60) * M.sacode * 4 * K : 0;
    cx.save(); cx.translate(piv.x + tremor, piv.y + bob); cx.rotate(roll); cx.translate(-piv.x, -piv.y);
    // rampa da proa: em pé na travessia, deita sobre a rampa de concreto ao atracar
    var r = M.atracou ? M.rampa : 0, e = r * r * (3 - 2 * r), ang = (1 - e) * Math.PI / 2;
    var ry = 2.3 + Math.sin(ang) * 6.5 - e * 0.3, rz = b + Math.cos(ang) * 7;
    poli([pj(xl + 1.2, 2.3, b), pj(xr - 1.2, 2.3, b), pj(xr - 1.2, ry, rz), pj(xl + 1.2, ry, rz)], "#5d6670", 2);
    // casco e convés
    if (V3.camX < xl) poli([pj(xl, 2.3, s), pj(xl, 2.3, b), pj(xl, -0.4, b), pj(xl, -0.4, s)], "#1846ad", 2.5);
    if (V3.camX > xr) poli([pj(xr, 2.3, s), pj(xr, 2.3, b), pj(xr, -0.4, b), pj(xr, -0.4, s)], "#1846ad", 2.5);
    piso(xl, xr, s, b, 2.3, "#8d99a6", 2);
    for (var zf = s + 3; zf < b - 3; zf += 6) piso(bx - 0.15, bx + 0.15, zf, zf + 3, 2.31, "#FFC107", 0);
    [xl + 0.2, xr - 0.2].forEach(function (x) { var a = pj(x, 3.4, s), f = pj(x, 3.4, b); cx.strokeStyle = "#FFC107"; cx.lineWidth = Math.max(1.5, a.u * 0.25); cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(f.x, f.y); cx.stroke(); });
    // carros e passadiço, de longe para perto
    var vagas = S.balsa.vagas, itens = [{ z: mid, f: function () { ponte3D(bx, mid, xl, xr, n); } }];
    M.deck.forEach(function (car, i) {
      var row = Math.floor(i / 2), col = (vagas % 2 === 1 && i === vagas - 1) ? 0 : (i % 2 ? 1 : -1);
      var x = bx + col * 3.8, z = b - zs[row], y = 2.3, rot = 0, a = 1, onda = null;
      if (car.cai != null) {   // tranco forte: escorrega pela lateral e cai na água
        var q = car.cai, lado = col >= 0 ? 1 : -1;
        x += lado * q * 13; y = 2.3 + Math.sin(Math.min(q, 0.5) * Math.PI) * 1.2 - Math.pow(Math.max(0, q - 0.45), 2) * 30;
        rot = lado * Math.max(0, q - 0.3) * 1.6; a = clamp(1.4 - q, 0, 1);
        if (q > 0.85 && q < 1.35) onda = { x: bx + lado * (MEIA + 5), q: q, z: z };
      } else if (car.sai) {   // desembarque: sai pela proa e segue pela rua
        z += car.sai * 0.14;
        var k2 = clamp((z - (b - 3)) / 10, 0, 1); x += ((col < 0 ? -2.8 : 2.8) - x) * k2;
        y = 2.3 - 0.3 * clamp((z - b) / 7, 0, 1);
        if (car.sai > 380) a = clamp(1 - (car.sai - 380) / 60, 0, 1);
      }
      itens.push({ z: z, f: function () {
        if (onda) { var po = pj(onda.x, 0, onda.z); cx.strokeStyle = "rgba(255,255,255," + (1.35 - onda.q) * 2 + ")"; cx.lineWidth = 3 * K; cx.beginPath(); cx.ellipse(po.x, po.y, (onda.q - 0.8) * 9 * po.u, (onda.q - 0.8) * 2 * po.u, 0, 0, 7); cx.stroke(); }
        if (a <= 0) return;
        var pc = pj(x, y + 1, z + 2);
        cx.save(); cx.globalAlpha = a; cx.translate(pc.x, pc.y); cx.rotate(rot); cx.translate(-pc.x, -pc.y);
        carro3D(x, z, y, car.jog ? "#FFC107" : car.cor, car.tipo, car.jog);
        cx.restore();
      } });
    });
    itens.sort(function (p, q) { return q.z - p.z; }).forEach(function (it) { it.f(); });
    // popa com o nome do projeto e a rampa da popa levantada
    var pp = caixa(xl, xr, -0.4, 2.3, s, "#1d4fc4", 2.5);
    caixa(xl + 0.4, xr - 0.4, 1.55, 1.95, s, "#ffffff", 0);
    caixa(xl + 0.4, xr - 0.4, 1.05, 1.35, s, "#FFC107", 0);
    var pt = pj(bx, 0.35, s); rotulo("VAIDEBALSA", pt.x, pt.y, Math.min(pp.u * 0.95, pp.w / 7), "#fff");
    poli([pj(xl + 1.2, 2.3, s), pj(xr - 1.2, 2.3, s), pj(xr - 1.2, 6.2, s - 2.2), pj(xl + 1.2, 6.2, s - 2.2)], "#5d6670", 2.5);
    for (var k = 0; k < 4; k++) {
      var t0 = 0.12 + k * 0.22, t1 = t0 + 0.1;
      poli([pj(xl + 1.6, 2.3 + 3.9 * t0, s - 2.2 * t0), pj(xr - 1.6, 2.3 + 3.9 * t0, s - 2.2 * t0), pj(xr - 1.6, 2.3 + 3.9 * t1, s - 2.2 * t1), pj(xl + 1.6, 2.3 + 3.9 * t1, s - 2.2 * t1)], "#FFC107");
    }
    if (n) { [[xl, "#ff5252"], [xr, "#69f0ae"]].forEach(function (l) { var p = pj(l[0], 3.6, s); cx.fillStyle = l[1]; cx.beginPath(); cx.arc(p.x, p.y, Math.max(3, 0.5 * p.u), 0, 7); cx.fill(); }); }
    cx.restore();
  }
  function alertaMar() {   // o obstáculo mais próximo na faixa para onde você vai
    var prox = null, d = M.d;
    M.obst.forEach(function (o) {
      if (o.feito || o.bateu) return;
      var dist = o.x - o.comp / 2 - d, mesma = Math.abs(o.f - M.faixa) < (o.cruza ? 0.8 : 0.6);
      if (mesma && dist > -10 && dist < (o.cruza ? 330 : 260) && (!prox || dist < prox.dist)) prox = { o: o, dist: dist };
    });
    return prox;
  }
  function faixaLivre(f) {
    return !M.obst.some(function (o) { return !o.feito && !o.bateu && !o.cruza && Math.abs(o.f - f) < 0.6 && o.x + o.comp / 2 > M.d - 60 && o.x - o.comp / 2 - M.d < 180; });
  }
  function hudMar(prox) {
    if (M.atracou) return;
    var d = M.d, hz = V3.hz, piscar = Math.sin(S.t * 10) > -0.3;
    if (prox) {
      var nomeO = { lancha: "LANCHA", veleiro: "VELEIRO", caiaque: "CAIAQUE", boia: "BOIA", tronco: "TRONCO", cargueiro: "CARGUEIRO" }[prox.o.tipo];
      cx.fillStyle = "#ef4444"; rr(W / 2 - 82 * K, hz - 44 * K, 164 * K, 26 * K, 13 * K); cx.fill(); tracar(2);
      texto("⚠ " + nomeO + " · " + Math.max(0, Math.round(prox.dist)) + " m", W / 2, hz - 26 * K, 12, "#fff");
      if (prox.dist < (prox.o.cruza ? 220 : 140) && piscar) {
        if (prox.o.cruza) texto("SOLTE E ESPERE! ✋", W / 2, H * 0.7, 22, "#ef4444");
        else { var sug = M.faixa === 0 ? 1 : M.faixa === 2 ? -1 : (faixaLivre(0) ? -1 : 1); texto(sug < 0 ? "⬅ DESVIE" : "DESVIE ➡", W / 2, H * 0.7, 28, "#ef4444"); }
      }
    }
    var falta = D - d;
    if (falta < 420) {
      var zP = d + M.v * M.v / (2 * FREIO), sobra = D - zP, fora = Math.abs(M.fy - 1) > 0.25;
      var corP = sobra < -1 ? "#ef4444" : sobra <= 12 ? "#4ade80" : "#FFC107", yM = H * 0.7 + (prox ? 34 * K : 0);
      if (fora) texto("VÁ PARA A FAIXA DO MEIO " + (M.fy < 1 ? "➡" : "⬅"), W / 2, yM, 15, "#FFC107");
      else if (S.segura && sobra <= 8) { if (piscar) texto("SOLTE AGORA! ✋", W / 2, yM, 22, "#ef4444"); }
      else if (!S.segura && M.v < 2 && falta > 12) texto("FALTA UM POUCO: SEGURE ▶", W / 2, yM, 14, "#FFC107");
      else if (!S.segura && sobra >= -1 && sobra <= 12) texto("ISSO! VAI PARAR CERTO ✓", W / 2, yM, 14, "#4ade80");
      // régua: distância até a rampa e onde a balsa vai parar
      var gx = W - 26 * K, g0 = hz + 14 * K, gh = Math.min(150 * K, H * 0.3), esc = 300;
      var gy = function (f) { return g0 + gh * (1 - clamp(f, 0, esc) / esc); };
      cx.fillStyle = "rgba(10,44,82,.88)"; rr(gx - 18 * K, g0 - 30 * K, 36 * K, gh + 48 * K, 10 * K); cx.fill(); tracar(2);
      texto(Math.max(0, Math.round(falta)) + "m", gx, g0 - 12 * K, 11, "#fff");
      cx.fillStyle = "rgba(255,255,255,.22)"; cx.fillRect(gx - 4 * K, g0, 8 * K, gh);
      cx.fillStyle = "#4ade80"; cx.fillRect(gx - 8 * K, gy(12), 16 * K, gy(0) - gy(12));
      cx.fillStyle = corP; cx.fillRect(gx - 13 * K, gy(Math.max(0, sobra)) - 2 * K, 26 * K, 4 * K);
      var ya = gy(falta); cx.fillStyle = "#FFC107"; cx.beginPath(); cx.moveTo(gx - 15 * K, ya - 6 * K); cx.lineTo(gx - 4 * K, ya); cx.lineTo(gx - 15 * K, ya + 6 * K); cx.closePath(); cx.fill(); tracar(1.5);
      texto("PARE", gx, gy(0) + 13 * K, 9, "#4ade80");
      var vv = M.v, cor = vv <= 6 ? "#4ade80" : vv <= 14 ? "#FFC107" : "#ef4444";
      var yv = g0 + gh + 24 * K;
      cx.fillStyle = "rgba(10,44,82,.88)"; rr(W - 112 * K, yv, 104 * K, 26 * K, 10 * K); cx.fill(); tracar(2);
      texto(vv <= 6 ? "DEVAGAR ✓" : vv <= 14 ? "RÁPIDO" : "MUITO RÁPIDO!", W - 60 * K, yv + 18 * K, 11, cor);
    }
  }
  // ---------- menu (cena decorativa) ----------
  function desenharMenu() {
    if (!S.clima) S.clima = { s: 0.3, mar: "calmo", vento: 10 };
    var hz = H * 0.45, nv = H * 0.74;
    ceu(hz); nuvens(S.t * 30 * K); montanhas(hz, S.t * 8 * K, "#2f9a5b", 120, 1.1); marFaixa(hz, H, S.t * 40 * K);
    var L = Math.min(W * 0.8, 440 * K), x = W * 0.5 - L / 2 + Math.sin(S.t * 0.4) * 16 * K, y = nv + Math.sin(S.t * 1.6) * 3 * K;
    balsa(x, y, L, { nome: "FB-25", carros: function () {
      var slot = (L - 60 * K) / 4;
      for (var i = 0; i < 4; i++) carroLado(x + 30 * K + (i + 1) * slot, y, i === 2 ? "#FFC107" : CORES[i * 2], "carro", false, Math.min(1, slot / ((CARRO + 12) * K)));
    } });
  }

  // ---------- quadro ----------
  var antes = 0;
  function quadro(ts) {
    var dt = antes ? Math.min(0.05, (ts - antes) / 1000) : 0.016; antes = ts;
    if (!S.pausa) passo(dt);
    desenhar(dt);
    requestAnimationFrame(quadro);
  }
  function passo(dt) {
    S.t += dt;
    if (S.fase === "terra") passoTerra(dt);
    else if (S.fase === "mar") passoMar(dt);
  }
  function desenhar(dt) {
    cx.clearRect(0, 0, W, H);
    if (S.fase === "terra") desenharTerra();
    else if ((S.fase === "mar" || S.fase === "fim") && M) desenharMar();
    else desenharMenu();
    chuva();
    popups(dt || 0.016);
    if (S.fase !== "menu") $("h-pts").textContent = "⭐ " + S.pontos;
  }
  function fase(txt) {
    $("h-fase").textContent = txt; var c = S.clima;
    $("h-clima").textContent = "🌊 " + c.mar + " · 💨 " + c.vento + " km/h" + (c.chuva ? " · 🌧️" : "") + (c.noite ? " · 🌙" : "");
  }
  function mostrar(id, sim) { $(id).hidden = !sim; }

  function ajustar() {
    var dpr = Math.min(2, window.devicePixelRatio || 1), r = palco.getBoundingClientRect();
    W = Math.max(200, r.width); H = Math.max(200, r.height); K = Math.min(H / 560, W / 300);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", ajustar);

  // ---------- controles ----------
  var botao = $("btn-segurar");
  function segurar(v) { S.segura = v; botao.classList.toggle("ativo", v); }
  botao.addEventListener("pointerdown", function (e) { e.preventDefault(); segurar(true); try { botao.setPointerCapture(e.pointerId); } catch (x) {} });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (ev) { botao.addEventListener(ev, function () { segurar(false); }); });
  botao.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  document.addEventListener("keydown", function (e) {
    var mar = S.fase === "mar";
    if (e.code === "Space" || e.key === "ArrowUp" || e.key === "w" || (e.key === "ArrowRight" && !mar)) { segurar(true); e.preventDefault(); }
    if (mar && !e.repeat && (e.key === "ArrowLeft" || e.key === "a")) { mudarFaixa(-1); e.preventDefault(); }
    if (mar && !e.repeat && (e.key === "ArrowRight" || e.key === "d")) { mudarFaixa(1); e.preventDefault(); }
    if (e.key === "Enter" || (e.key && e.key.toLowerCase() === "k")) desligarMotor();
  });
  document.addEventListener("keyup", function (e) { if (e.code === "Space" || e.key === "ArrowUp" || e.key === "w" || (e.key === "ArrowRight" && S.fase !== "mar")) segurar(false); });
  $("btn-acao").addEventListener("click", desligarMotor);
  $("btn-esq").addEventListener("click", function () { mudarFaixa(-1); });
  $("btn-dir").addEventListener("click", function () { mudarFaixa(1); });
  cv.addEventListener("pointerdown", function (e) {   // toque nos golfinhos = foto
    if (S.fase !== "mar" || !M || !M.golf.ativo || M.golf.foto) return;
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (Math.hypot(x - (M.golf.sx || 0), y - (M.golf.sy || 0)) < 100 * K) {
      M.golf.foto = true; ponto("📸 Foto dos golfinhos", 15); aviso("📸 Que foto!", "bom");
    }
  });
  var audio = null;
  $("btn-buzina").addEventListener("click", function () {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var o = audio.createOscillator(), g = audio.createGain(), dur = S.fase === "terra" ? 0.35 : 1;
      o.type = "square"; o.frequency.value = S.fase === "terra" ? 420 : 120;
      g.gain.setValueAtTime(0.0001, audio.currentTime); g.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
      o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + dur + 0.05);
    } catch (e) {}
  });
  document.querySelectorAll("[data-origem]").forEach(function (b) {
    b.addEventListener("click", function () {
      S.origem = b.dataset.origem; S.total = 0; S.viagens = 0;
      S.calmo = $("op-calmo").checked; S.real = $("op-real").checked;
      if (S.real) { b.disabled = true; aviso("Buscando o clima de agora no canal…"); carregarClimaReal().then(function () { b.disabled = false; iniciarTerra(); }); }
      else iniciarTerra();
    });
  });
  $("btn-proxima").addEventListener("click", function () { S.origem = destino(); iniciarTerra(); });
  $("btn-voltar-menu").addEventListener("click", irMenu);
  $("btn-menu").addEventListener("click", function () {
    if (S.fase === "terra" || S.fase === "mar") { S.pausa = !S.pausa; aviso(S.pausa ? "⏸️ Pausado. Toque em ☰ para continuar." : "▶️ Continuando!", null, S.pausa ? 60000 : 1200); return; }
    irMenu();
  });
  function irMenu() {
    S.fase = "menu"; S.pausa = false;
    mostrar("tela-menu", true); mostrar("tela-fim", false); mostrar("hud", false); mostrar("controles", false); $("dica").hidden = true; $("desvio").hidden = true;
    var rec = +(ls("vdb-jogo-recorde") || 0); $("recorde").textContent = rec ? "🏆 Seu recorde: " + rec + " pontos" : "";
  }

  ajustar(); irMenu(); requestAnimationFrame(quadro);
  window.VDB_JOGO = { S: S, passo: passo, desenhar: desenhar, segurar: segurar, desligarMotor: desligarMotor, T: function () { return T; }, M: function () { return M; } };
})();
