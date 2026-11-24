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
  var T = null;
  function iniciarTerra() {
    S.fase = "terra"; S.itens = []; S.pontos = 0; S.flags = {}; S.popups = []; S.pausa = false;
    S.clima = sortearClima();
    var cobra = S.origem === "ss", fila = [], n = 4;
    for (var i = 0; i < n; i++) fila.push({ x: 470 - i * (CARRO + 26), v: 0, cor: CORES[Math.floor(Math.random() * CORES.length)], tipo: Math.random() < 0.18 ? "van" : "carro", pago: !cobra, espera: 0, vaga: i });
    T = {
      cobra: cobra, pago: !cobra, cancela: cobra ? 0 : 1, fila: fila,
      jog: { x: 470 - n * (CARRO + 26), v: 0 }, vaga: n, cam: 0,
      estacionado: false, motor: true, partindo: 0, tPagando: 0, encostou: -9, parado: 0,
      pedestres: [{ x: 120, v: 26 }, { x: 420, v: 22 }], ciclista: { x: -200, v: 60 }
    };
    mostrar("tela-menu", false); mostrar("tela-fim", false); mostrar("hud", true); mostrar("controles", true);
    $("btn-acao").hidden = true; $("seg-txt").textContent = "SEGURE PARA ANDAR";
    fase("🚗 Fila · " + nome(S.origem));
    if (cobra) dica("Segure o botão para andar na fila e solte para frear. Pare na faixa verde da cabine para pagar: a tarifa já vale a volta!", 5600);
    else dica("Em Ilhabela não se paga: a tarifa da ida, em São Sebastião, já incluiu a volta. Siga a fila até a balsa!", 5600);
    var c = S.clima;
    setTimeout(function () { aviso((c.real ? "Clima de agora: " : "") + "mar " + c.mar + ", vento " + c.vento + " km/h" + (c.chuva ? ", chuva" : "") + (c.noite ? ", noite" : ""), null, 3000); }, 700);
  }
  function deckX(i) { return DECK0 + 60 + (4 - i) * VAGA + VAGA; }   // frente do carro na vaga i (0 = mais à frente)
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
  //  FASE 3 — TRAVESSIA (balsa vista de lado, o mundo rola)
  // ======================================================================
  var D = 2400, VMAX = 62;
  var M = null;
  function iniciarMar() {
    S.fase = "mar"; $("btn-acao").hidden = true;
    var deck = [];
    for (var i = 0; i < 5; i++) {
      if (i < T.fila.length) deck.push({ cor: T.fila[i].cor, tipo: T.fila[i].tipo, jog: false, sai: 0 });
      else if (i === T.vaga) deck.push({ cor: "#FFC107", tipo: "carro", jog: true, sai: 0, v: 0 });
    }
    var obst = [], usados = [];
    function novo(tipo, de, ate) {
      var x, tent = 0; do { x = rnd(de, ate); tent++; } while (tent < 20 && usados.some(function (u) { return Math.abs(u - x) < 260; }));
      usados.push(x);
      var P = { lancha: [14, 3.2], veleiro: [12, 5.5], petroleiro: [120, 11] }[tipo];
      obst.push({ tipo: tipo, x: x, comp: P[0], dur: P[1], lado: Math.random() < 0.5 ? 1 : -1, p: -1, feito: false });
    }
    novo("lancha", 350, 900); novo("veleiro", 1000, 1500); novo("lancha", 1500, 2050);
    if (Math.random() < 0.75) novo("petroleiro", S.origem === "ss" ? 500 : 1300, S.origem === "ss" ? 1100 : 1900);
    M = { d: 0, v: 0, deck: deck, obst: obst, golf: { x: rnd(600, 1800), ativo: false, feito: false, foto: false, t: 0 },
          conforto: 100, rajada: 0, gaivotas: [{ x: 0.2, y: 0.18 }, { x: 0.6, y: 0.12 }, { x: 0.85, y: 0.22 }],
          atracou: false, chuvaNova: !S.clima.chuva && Math.random() < 0.3 ? rnd(700, 1700) : null, dicas: {}, bate: -9, tAtr: 0, rampa: 0, fim: false };
    fase("🌊 Travessia → " + nome(destino()));
    aviso("⛴️ Segure para acelerar a balsa. Solte para frear!", "bom", 2600);
    $("seg-txt").textContent = "SEGURE PARA ACELERAR";
  }
  var DICAS_MAR = [
    [200, "A travessia de verdade tem uns 2,4 km e leva cerca de 20 minutos. 🌊"],
    [700, "Vento forte pode parar a travessia de verdade: a segurança vem primeiro! 💨"],
    [1200, "No canal de São Sebastião passam navios petroleiros do terminal da Petrobras. 🚢"],
    [1700, "Pedestres e ciclistas atravessam sem pagar e embarcam pela lateral. 🚲"],
    [2050, "Chegando! Solte o botão para a balsa ir freando e encostar de leve. ⚓"]
  ];
  function limiteConforto() { return VMAX * (1 - 0.45 * S.clima.s); }
  function passoMar(dt) {
    var c = S.clima;
    if (!M.atracou) {
      if (S.segura) M.v = Math.min(VMAX, M.v + 16 * dt); else M.v = Math.max(0, M.v - 13 * dt);
      var falta = D - M.d;
      if (falta < 140 && M.v > 6 + falta * 0.18) M.v += ((6 + falta * 0.18) - M.v) * Math.min(1, dt * 1.6);   // encosta de leve
      if (falta < 50) M.v = Math.min(M.v, 3 + falta * 0.2);                                                     // nos últimos metros, sempre devagar
      if (c.vento >= 25 && M.rajada <= 0.05 && Math.random() < dt * 0.06 && !S.calmo) { M.rajada = 1; M.v *= 0.6; aviso("💨 Rajada de vento! A balsa perdeu velocidade.", "ruim"); }
      M.rajada = Math.max(0, M.rajada - dt * 0.4);
      M.d += M.v * dt;
      var exc = M.v - limiteConforto();
      if (exc > 0) M.conforto -= exc * c.s * 0.35 * dt; else M.conforto += 2 * dt;
      M.conforto = clamp(M.conforto, 0, 100);
      if (exc > 6 && !M.dicas.mar) { M.dicas.mar = 1; aviso("🌊 Mar " + c.mar + ": vá mais devagar para ninguém enjoar!", "ruim"); }
      if (M.conforto < 35 && !M.dicas.enjoo) { M.dicas.enjoo = 1; ponto("🤢 Passageiros enjoados", -10); aviso("🤢 Gente enjoando! Diminua.", "ruim"); }
      M.obst.forEach(function (o) {
        if (o.feito) return;
        if (o.p < 0 && o.x - M.d < 330) { o.p = 0; aviso(o.tipo === "petroleiro" ? "🚢 Petroleiro cruzando! Solte e espere ele passar." : o.tipo === "veleiro" ? "⛵ Veleiro cruzando à frente!" : "🚤 Lancha cruzando à frente!", "ruim", 2400); }
        if (o.p >= 0) {
          o.p += dt / o.dur;
          var naRota = o.p > 0.38 && o.p < 0.62;
          var sobrepoe = M.d > o.x - o.comp / 2 && M.d - 60 < o.x + o.comp / 2;
          if (naRota && sobrepoe && !o.bateu) {
            o.bateu = true; M.v = 0; M.d = Math.min(M.d, o.x - o.comp / 2 - 1);
            ponto(o.tipo === "petroleiro" ? "💥 Bateu no petroleiro" : o.tipo === "veleiro" ? "💥 Bateu no veleiro" : "💥 Bateu na lancha", o.tipo === "petroleiro" ? -40 : -20);
            aviso("💥 Batida! Espere o barco passar.", "ruim");
          }
          if (o.p >= 1) { o.feito = true; if (!o.bateu) ponto(o.tipo === "petroleiro" ? "🚢 Esperou o petroleiro" : o.tipo === "veleiro" ? "⛵ Deu passagem ao veleiro" : "🚤 Deu passagem à lancha", o.tipo === "petroleiro" ? 20 : 10); }
        }
      });
      var g = M.golf;
      if (!g.feito && !g.ativo && M.d > g.x - 200) { g.ativo = true; g.t = 7; aviso("🐬 Golfinhos! Toque neles para tirar foto.", "bom", 2600); }
      if (g.ativo) { g.t -= dt; if (g.t <= 0) { g.ativo = false; g.feito = true; } }
      if (M.chuvaNova && M.d > M.chuvaNova) { M.chuvaNova = null; c.chuva = true; aviso("🌧️ Começou a chover!", null); fase($("h-fase").textContent); }
      DICAS_MAR.forEach(function (dc) { if (M.d > dc[0] && !M.dicas[dc[0]]) { M.dicas[dc[0]] = 1; dica(dc[1], 4600); } });
      if (M.d >= D) {
        if (M.v > 14) {
          if (S.t - M.bate > 2) { M.bate = S.t; ponto("💥 Chegou rápido demais na margem", -20); aviso("💥 Rápido demais! A balsa bateu na margem.", "ruim"); }
          M.d = D - 4; M.v = 0;
        } else {
          var vChegada = M.v;
          M.d = D; M.atracou = true; M.v = 0; M.tAtr = 0;
          ponto("⚓ Atracou de leve", Math.round(25 - vChegada));
          ponto("😊 Conforto dos passageiros (" + Math.round(M.conforto) + "%)", Math.round(M.conforto / 5));
          aviso("⚓ Atracou em " + nome(destino()) + "! Baixando a rampa…", "bom");
          fase("⚓ Desembarque");
          $("seg-txt").textContent = "SEGURE PARA DESEMBARCAR";
        }
      }
    } else passoDesembarque(dt);
    M.gaivotas.forEach(function (gv, i) { gv.x -= dt * (0.03 + i * 0.01) + M.v * dt * 0.0006; if (gv.x < -0.1) gv.x = 1.1; });
    $("h-vel").textContent = "⛴️ " + Math.round(M.v * 0.3) + " nós";
    $("h-dist").textContent = "📍 " + nome(destino()) + ": " + Math.max(0, Math.round(D - M.d)) + " m";
  }

  // ======================================================================
  //  FASE 4 — DESEMBARQUE (a rampa da própria balsa baixa; os carros saem)
  // ======================================================================
  function passoDesembarque(dt) {
    M.tAtr += dt;
    M.rampa = clamp((M.tAtr - 0.4) / 1.3, 0, 1);
    var auto = M.deck.filter(function (x) { return !x.jog; });
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
    ponto("🚗 Chegou em " + nome(destino()), 20);
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
      texto(p.txt, p.sx != null ? p.sx : W * 0.5, (p.sy != null ? p.sy : H * 0.34 + i * 26 * K) - p.t * 50 * K, 24, p.cor);
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
    var bx = RAMPA * K - cam + 30 * K, L = 560 * K, yDeck = chao;
    var subir = T.partindo ? clamp(T.partindo * 1.3, 0, 1) : 0;
    balsa(bx, yDeck, L, {
      rampaPopa: 1 - subir, rampaProa: 0,
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

  // ---------- cena no mar ----------
  function desenharMar() {
    var d = M.d, ss = S.origem === "ss", hz = H * 0.42, nv = H * (W < H * 0.8 ? 0.66 : 0.7);
    ceu(hz);
    nuvens(d * 2 * K);
    montanhas(hz, d * 0.6 * K, ss ? "#2f9a5b" : "#3a8f63", 120, ss ? 1.1 : 3.3);
    if (!ss) predios(hz, d * 0.7 * K);
    var dSS = ss ? d : D - d;
    if (dSS < 900) navioFundeado(W * 0.3 + (ss ? -d : d - D) * 0.5 * K, hz + 8 * K, 0.6);
    marFaixa(hz, H, d * 3 * K);
    var retrato = W < H * 0.8;
    var escala = 2.6 * K, L = retrato ? W * 0.84 : Math.min(W * 0.64, 460 * K), popa = retrato ? W * 0.03 : Math.max(8 * K, W * 0.1);
    var chegada = clamp(1 - (D - d) / 260, 0, 1), sh = chegada * chegada * (3 - 2 * chegada) * (retrato ? W * 0.36 : W * 0.22);
    popa -= sh;                       // na chegada a câmera desliza para mostrar a margem e o terminal
    var proa = popa + L;
    var xOrigem = popa - d * escala - 30 * K;
    if (xOrigem > -60 * K) costa(xOrigem, nv, -1, S.origem);
    var xDestino = proa + 34 * K + (D - d) * escala;
    if (xDestino < W + 60 * K) costa(xDestino, nv, 1, destino());
    M.obst.forEach(function (o) { if (o.p >= 0 && o.p < 0.5 && !o.feito) barco(o, proa, escala, hz, nv); });
    var g = M.golf;
    if (g.ativo) {
      for (var i = 0; i < 3; i++) {
        var fs = (S.t * 1.4 + i * 0.5) % 2, gx = Math.min(W - 60 * K, proa - 20 * K) + i * 36 * K, gy = nv + 46 * K - Math.sin(Math.min(1, fs) * Math.PI) * 64 * K;
        if (i === 1) { g.sx = gx; g.sy = gy; }
        if (fs < 1) {
          cx.save(); cx.translate(gx, gy); cx.rotate(-0.7 + fs * 1.4);
          cx.fillStyle = "#5c8fb8"; cx.beginPath(); cx.ellipse(0, 0, 22 * K, 8 * K, 0, 0, 7); cx.fill(); tracar(2.5);
          cx.beginPath(); cx.moveTo(-2 * K, -7 * K); cx.lineTo(4 * K, -16 * K); cx.lineTo(8 * K, -6 * K); cx.closePath(); cx.fill(); tracar(2);
          cx.fillStyle = "#fff"; cx.beginPath(); cx.arc(14 * K, -2 * K, 2 * K, 0, 7); cx.fill();
          cx.restore();
        }
      }
    }
    var c = S.clima, bal = M.atracou ? 0 : Math.sin(S.t * 1.6) * (1.5 + c.s * 5) * K, inc = M.atracou ? 0 : Math.sin(S.t * 1.1) * (0.01 + c.s * 0.025) - M.rajada * 0.04;
    if (M.v > 4 && !M.atracou) {
      cx.fillStyle = "rgba(255,255,255,.85)";
      for (var e = 0; e < 10; e++) { var f = (S.t * (1 + M.v / 30) + e * 0.1) % 1; cx.beginPath(); cx.ellipse(popa - f * 120 * K, nv + 18 * K + (e % 3) * 5 * K, (10 + f * 18) * K, 5 * K, 0, 0, 7); cx.fill(); }
    }
    cx.save(); cx.translate(popa + L / 2, nv + bal); cx.rotate(inc); cx.translate(-(popa + L / 2), -nv);
    balsa(popa, nv, L, {
      rampaPopa: 0, rampaProa: M.atracou ? M.rampa : 0,
      carros: function () {
        var slot = (L - 60 * K) / 5, esc = Math.min(1, slot / ((CARRO + 12) * K));
        M.deck.forEach(function (car, i) {
          var x = popa + 30 * K + (5 - i) * slot + (car.sai || 0) * K;
          var a = car.sai > 380 ? clamp(1 - (car.sai - 380) / 60, 0, 1) : 1;
          if (a <= 0) return;
          cx.globalAlpha = a;
          carroLado(x, nv, car.cor, car.tipo, car.jog, esc);
          cx.globalAlpha = 1;
        });
      }
    });
    cx.restore();
    M.obst.forEach(function (o) { if (o.p >= 0.5 && !o.feito) barco(o, proa, escala, hz, nv); });
    M.obst.forEach(function (o) {
      if (o.p >= 0 && !o.feito && proa + (o.x - d) * escala > W - 10 * K) {
        cx.fillStyle = "#ef4444"; rr(W - 70 * K, nv - 120 * K, 62 * K, 28 * K, 8 * K); cx.fill(); tracar(2);
        texto("⚠ " + Math.round(o.x - d) + "m", W - 39 * K, nv - 100 * K, 12, "#fff");
      }
    });
    if (!M.atracou && D - d < 260) texto("SOLTE PARA ENCOSTAR", W / 2, nv - 130 * K, 15, "#4ade80");
    var perigo = M.obst.some(function (o) { return o.p >= 0 && !o.feito && o.p < 0.64 && o.x - o.comp / 2 - d < 110 && o.x + o.comp / 2 > d - 60; });
    if (perigo && M.v > 2 && Math.sin(S.t * 10) > -0.3) texto("SOLTE! ✋", W / 2, nv - 160 * K, 26, "#ef4444");
    cx.strokeStyle = CONTORNO; cx.lineWidth = 2.5 * K;
    M.gaivotas.forEach(function (gv) { var x = gv.x * W, y = gv.y * H + Math.sin(S.t * 3 + x) * 4 * K, a = Math.sin(S.t * 8 + x) * 4 * K; cx.beginPath(); cx.moveTo(x - 10 * K, y + a); cx.quadraticCurveTo(x - 5 * K, y - 5 * K, x, y); cx.quadraticCurveTo(x + 5 * K, y - 5 * K, x + 10 * K, y + a); cx.stroke(); });
    if (c.noite) { cx.fillStyle = "rgba(6,20,43,.22)"; cx.fillRect(0, 0, W, H); }
  }
  function costa(x, nv, lado, qual) {   // lado +1: terra à direita de x (destino); -1: à esquerda (origem)
    var ss = qual === "ss", larg = 900 * K, x0 = lado > 0 ? x : x - larg;
    cx.fillStyle = "#e8d8b0"; cx.fillRect(x0, nv - 30 * K, larg, H);
    cx.fillStyle = "#5f6b76"; cx.fillRect(x0, nv - 30 * K, larg, 30 * K);
    cx.fillStyle = "#8a8378"; rr(lado > 0 ? x - 6 * K : x - 10 * K, nv - 32 * K, 16 * K, H, 3 * K); cx.fill(); tracar(2);
    var tx = lado > 0 ? x + 60 * K : x - 220 * K;
    cx.fillStyle = "#ffffff"; rr(tx, nv - 112 * K, 150 * K, 82 * K, 6 * K); cx.fill(); tracar(3);
    cx.fillStyle = "#1d4fc4"; rr(tx - 6 * K, nv - 126 * K, 162 * K, 18 * K, 6 * K); cx.fill(); tracar(3);
    cx.font = "800 " + Math.round(10 * K) + "px Montserrat, sans-serif"; cx.textAlign = "center"; cx.fillStyle = "#fff";
    cx.fillText(ss ? "TERMINAL S. SEBASTIÃO" : "TERMINAL ILHABELA", tx + 75 * K, nv - 113 * K);
    cx.fillStyle = "#37474f"; rr(tx + 10 * K, nv - 72 * K, 50 * K, 42 * K, 3 * K); cx.fill();
    cx.fillStyle = "#bfe8ff"; for (var i = 0; i < 2; i++) { rr(tx + 74 * K + i * 34 * K, nv - 92 * K, 26 * K, 20 * K, 3 * K); cx.fill(); tracar(1.5); }
    for (var j = 0; j < 6; j++) {
      var ax = lado > 0 ? tx + 180 * K + j * 70 * K : tx - 60 * K - j * 70 * K;
      if (ss) { cx.fillStyle = ["#ffd8a8", "#e8f1ff", "#ffe082"][j % 3]; rr(ax, nv - (100 + j * 10) * K, 50 * K, (70 + j * 10) * K, 4 * K); cx.fill(); tracar(2); }
      else { cx.fillStyle = "#6d4c41"; cx.fillRect(ax + 18 * K, nv - 64 * K, 8 * K, 34 * K); cx.fillStyle = "#2e9e5b"; cx.beginPath(); cx.arc(ax + 22 * K, nv - 74 * K, 24 * K, 0, 7); cx.fill(); tracar(2.5); }
    }
    if (lado > 0) {
      var placa = ss ? "AV. A. J. DO NASCIMENTO" : "AV. PRINCESA ISABEL · PEREQUÊ";
      cx.fillStyle = "#0A2C52"; cx.fillRect(x + 30 * K, nv - 68 * K, 4 * K, 38 * K); rr(x + 10 * K, nv - 84 * K, 150 * K, 18 * K, 4 * K); cx.fill();
      cx.font = "800 " + Math.round(8 * K) + "px Montserrat, sans-serif"; cx.textAlign = "left"; cx.fillStyle = "#fff"; cx.fillText(placa, x + 15 * K, nv - 72 * K);
      funcionario(x + 46 * K, nv - 30 * K, 1, M && M.atracou && M.rampa >= 1);
    }
  }
  function barco(o, proa, escala, hz, nv) {
    var sx = proa + (o.x - M.d) * escala;
    if (sx < -320 * K || sx > W + 320 * K) return;
    var p = o.p, y = hz + 10 * K + (nv + 70 * K - hz) * p, s = (0.35 + p * 1.05) * K;
    cx.save(); cx.translate(sx, y); cx.scale(o.lado, 1);
    if (o.tipo === "lancha") {
      cx.fillStyle = "#ffffff"; cx.beginPath(); cx.moveTo(-30 * s, 0); cx.lineTo(30 * s, 0); cx.lineTo(22 * s, 10 * s); cx.lineTo(-28 * s, 10 * s); cx.closePath(); cx.fill(); tracar(2);
      cx.fillStyle = "#e53935"; cx.fillRect(-26 * s, 2 * s, 50 * s, 3 * s);
      cx.fillStyle = "#bfe8ff"; rr(-8 * s, -10 * s, 18 * s, 10 * s, 3 * s); cx.fill(); tracar(1.5);
    } else if (o.tipo === "veleiro") {
      cx.fillStyle = "#ffffff"; cx.beginPath(); cx.moveTo(-24 * s, 0); cx.lineTo(24 * s, 0); cx.lineTo(18 * s, 9 * s); cx.lineTo(-20 * s, 9 * s); cx.closePath(); cx.fill(); tracar(2);
      cx.fillStyle = "#fff8e1"; cx.beginPath(); cx.moveTo(0, -2 * s); cx.lineTo(0, -48 * s); cx.lineTo(20 * s, -4 * s); cx.closePath(); cx.fill(); tracar(2);
      cx.fillStyle = "#4fc3f7"; cx.beginPath(); cx.moveTo(-2 * s, -4 * s); cx.lineTo(-2 * s, -38 * s); cx.lineTo(-18 * s, -4 * s); cx.closePath(); cx.fill(); tracar(2);
    } else {
      cx.fillStyle = "#c62828"; cx.beginPath(); cx.moveTo(-120 * s, 0); cx.lineTo(120 * s, 0); cx.lineTo(108 * s, 20 * s); cx.lineTo(-112 * s, 20 * s); cx.closePath(); cx.fill(); tracar(2.5);
      cx.fillStyle = "#37474f"; cx.fillRect(-116 * s, -6 * s, 232 * s, 6 * s);
      cx.fillStyle = "#ffffff"; rr(-112 * s, -40 * s, 40 * s, 34 * s, 3 * s); cx.fill(); tracar(2);
      cx.fillStyle = "#263238"; cx.fillRect(-100 * s, -54 * s, 12 * s, 16 * s);
    }
    cx.restore();
    cx.fillStyle = "rgba(255,255,255,.7)"; cx.beginPath(); cx.ellipse(sx, y + 9 * s, 40 * s, 4 * s, 0, 0, 7); cx.fill();
    if (p > 0.38 && p < 0.62) texto("!", sx, y - 52 * s, 22, "#ef4444");
  }

  // ---------- menu (cena decorativa) ----------
  function desenharMenu() {
    if (!S.clima) S.clima = { s: 0.3, mar: "calmo", vento: 10 };
    var hz = H * 0.45, nv = H * 0.74;
    ceu(hz); nuvens(S.t * 30 * K); montanhas(hz, S.t * 8 * K, "#2f9a5b", 120, 1.1); marFaixa(hz, H, S.t * 40 * K);
    var L = Math.min(W * 0.8, 440 * K), x = W * 0.5 - L / 2 + Math.sin(S.t * 0.4) * 16 * K, y = nv + Math.sin(S.t * 1.6) * 3 * K;
    balsa(x, y, L, { carros: function () {
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
    if (e.code === "Space" || e.key === "ArrowRight" || e.key === "ArrowUp") { segurar(true); e.preventDefault(); }
    if (e.key === "Enter" || (e.key && e.key.toLowerCase() === "k")) desligarMotor();
  });
  document.addEventListener("keyup", function (e) { if (e.code === "Space" || e.key === "ArrowRight" || e.key === "ArrowUp") segurar(false); });
  $("btn-acao").addEventListener("click", desligarMotor);
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
    mostrar("tela-menu", true); mostrar("tela-fim", false); mostrar("hud", false); mostrar("controles", false); $("dica").hidden = true;
    var rec = +(ls("vdb-jogo-recorde") || 0); $("recorde").textContent = rec ? "🏆 Seu recorde: " + rec + " pontos" : "";
  }

  ajustar(); irMenu(); requestAnimationFrame(quadro);
  window.VDB_JOGO = { S: S, passo: passo, desenhar: desenhar, segurar: segurar, desligarMotor: desligarMotor, T: function () { return T; }, M: function () { return M; } };
})();
