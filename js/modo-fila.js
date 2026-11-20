/* VAIDEBALSA — Modo fila: mede a espera automaticamente pelo GPS (só com o site aberto) */
(function () {
  var cfg = window.VAIDEBALSA || {};
  var botao = document.querySelector("[data-medir]");
  if (!botao || !cfg.supabaseUrl) return;

  var LADOS = { "sao-sebastiao": "São Sebastião", "ilhabela": "Ilhabela" };
  var CHAVE = "vdb-medicao";
  var ERROS = {
    fora_da_fila: "Você precisa estar na fila (até 2 km do embarque) para começar a medir.",
    aguarde: "Muitas medições seguidas. Tente de novo daqui a pouco.",
    sem_localizacao: "Não conseguimos sua localização. Ative o GPS e permita o acesso.",
    espera_invalida: "Essa medição expirou. Comece uma nova.",
    ainda_na_fila: "Ainda não detectamos a travessia. Quando a balsa sair, a medição termina sozinha."
  };
  var dlg = document.getElementById("medir");
  var pill = document.getElementById("medindo");
  var watchId = null, wakeLock = null, timer = null, concluindo = false;

  // ---------- utilidades ----------
  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) return localStorage.removeItem(k);
      localStorage.setItem(k, v);
    } catch (e) { return null; }
  }
  function aparelho() {
    var id = ls("vdb-aparelho");
    if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^0-9a-z-]/gi, ""); ls("vdb-aparelho", id); }
    return id;
  }
  function rpc(nome, corpo) {
    return fetch(cfg.supabaseUrl + "/rest/v1/rpc/" + nome, {
      method: "POST",
      headers: { apikey: cfg.supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify(corpo)
    }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw new Error(j && j.message || "erro"); return j; });
    });
  }
  function dist(a, b, c, d) {
    var R = 6371000, r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2);
    return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y));
  }
  function toast(msg) {
    var t = document.getElementById("toast");
    if (!t) return alert(msg);
    t.textContent = msg; t.classList.add("on");
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove("on"); }, 4500);
  }
  function erro(e) {
    var m = String(e && e.message || "");
    var k = Object.keys(ERROS).find(function (x) { return m.indexOf(x) > -1; });
    return k ? ERROS[k] : "Não deu certo agora. Tente de novo.";
  }
  function posicao() {
    return new Promise(function (ok, falha) {
      if (!navigator.geolocation) return falha(new Error("sem_localizacao"));
      navigator.geolocation.getCurrentPosition(function (g) { ok({ lat: g.coords.latitude, lon: g.coords.longitude }); },
        function () { falha(new Error("sem_localizacao")); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    });
  }
  function ladoMaisPerto(p) {
    var melhor = null;
    Object.keys(cfg.embarques).forEach(function (l) {
      var e = cfg.embarques[l], d = dist(p.lat, p.lon, e.lat, e.lon);
      if (!melhor || d < melhor.d) melhor = { lado: l, d: d, raio: e.raio };
    });
    return melhor && melhor.d <= melhor.raio ? melhor.lado : null;
  }
  // quanto o aparelho avançou em direção ao outro embarque (só acontece em cima da balsa)
  function avanco(lado, p) {
    var a = cfg.embarques[lado], outro = lado === "ilhabela" ? "sao-sebastiao" : "ilhabela", b = cfg.embarques[outro];
    return dist(a.lat, a.lon, b.lat, b.lon) - dist(p.lat, p.lon, b.lat, b.lon);
  }

  // ---------- tela ligada (para o iPhone não parar o GPS) ----------
  function manterTela() {
    if (!("wakeLock" in navigator)) return;
    navigator.wakeLock.request("screen").then(function (w) { wakeLock = w; }).catch(function () {});
  }
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && estado()) { manterTela(); seguir(); }
  });

  // ---------- estado ----------
  function estado() { try { return JSON.parse(ls(CHAVE) || "null"); } catch (e) { return null; } }
  function salvar(s) { ls(CHAVE, s ? JSON.stringify(s) : null); }

  function mostrarPill() {
    var s = estado();
    if (!s) { pill.hidden = true; return; }
    if (Date.now() - s.inicio > 5 * 3600000) { parar(); return toast("A medição passou de 5 horas e foi encerrada."); }
    var min = Math.floor((Date.now() - s.inicio) / 60000);
    pill.querySelector(".md-tempo").textContent = min + " min";
    pill.querySelector(".md-lado").textContent = "Fila em " + LADOS[s.lado];
    pill.hidden = false;
  }

  // ---------- começar ----------
  botao.addEventListener("click", function () {
    if (estado()) return toast("Você já está medindo sua espera.");
    dlg.showModal();
  });
  dlg.querySelectorAll("[data-fechar]").forEach(function (b) { b.addEventListener("click", function () { dlg.close(); }); });
  dlg.querySelector("[data-comecar]").addEventListener("click", function (ev) {
    var b = ev.currentTarget;
    b.disabled = true; b.textContent = "Localizando…";
    manterTela();   // precisa ser pedido no clique
    posicao().then(function (p) {
      var lado = ladoMaisPerto(p);
      if (!lado) throw new Error("fora_da_fila");
      return rpc("iniciar_espera", { p_lado: lado, p_aparelho: aparelho(), p_lat: p.lat, p_lon: p.lon })
        .then(function (id) { salvar({ id: id, lado: lado, inicio: Date.now() }); });
    }).then(function () {
      dlg.close(); mostrarPill(); seguir();
      toast("Medindo! Deixe o site aberto. Quando a balsa sair, a medição termina sozinha.");
    }).catch(function (e) { toast(erro(e)); })
      .then(function () { b.disabled = false; b.textContent = "Começar a medir"; });
  });

  // ---------- acompanhar ----------
  function seguir() {
    var s = estado();
    if (!s || watchId !== null || !navigator.geolocation) return;
    watchId = navigator.geolocation.watchPosition(function (g) {
      var p = { lat: g.coords.latitude, lon: g.coords.longitude };
      if (avanco(s.lado, p) >= 450) concluir(p);
    }, function () {}, { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 });
    clearInterval(timer); timer = setInterval(mostrarPill, 20000);
  }

  function concluir(p, manual) {
    var s = estado();
    if (!s || concluindo) return;
    concluindo = true;
    rpc("concluir_espera", { p_id: s.id, p_aparelho: aparelho(), p_lat: p.lat, p_lon: p.lon })
      .then(function (minutos) {
        parar();
        var res = document.getElementById("medido");
        res.querySelector(".mr-min").textContent = minutos;
        res.querySelector(".mr-lado").textContent = LADOS[s.lado];
        res.showModal();
      })
      .catch(function (e) {
        if (manual || String(e.message).indexOf("espera_invalida") > -1) toast(erro(e));
        if (String(e.message).indexOf("espera_invalida") > -1) parar();
      })
      .then(function () { concluindo = false; });
  }

  function parar() {
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    watchId = null; clearInterval(timer);
    if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
    salvar(null); mostrarPill();
  }

  pill.querySelector("[data-embarquei]").addEventListener("click", function () {
    posicao().then(function (p) { concluir(p, true); }).catch(function (e) { toast(erro(e)); });
  });
  pill.querySelector("[data-cancelar]").addEventListener("click", function () {
    if (confirm("Cancelar a medição da sua espera?")) { parar(); toast("Medição cancelada."); }
  });

  var medido = document.getElementById("medido");
  medido.querySelectorAll("[data-fechar]").forEach(function (b) { b.addEventListener("click", function () { medido.close(); }); });
  medido.querySelector("[data-compartilhar]").addEventListener("click", function () {
    var min = medido.querySelector(".mr-min").textContent, lado = medido.querySelector(".mr-lado").textContent;
    var texto = "⏱ Esperei " + min + " min na fila da balsa em " + lado + ". Veja a fila ao vivo no VAIDEBALSA:";
    var url = location.origin + location.pathname + "#fila";
    if (navigator.share) navigator.share({ text: texto, url: url }).catch(function () {});
    else window.open("https://wa.me/?text=" + encodeURIComponent(texto + " " + url), "_blank", "noopener");
  });

  // retoma uma medição em andamento (ex.: página recarregada)
  if (estado()) { mostrarPill(); seguir(); }
})();
