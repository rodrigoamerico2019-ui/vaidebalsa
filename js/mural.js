/* VAIDEBALSA — Mural ao vivo da fila + semáforo */
(function () {
  var cfg = window.VAIDEBALSA || {};
  var raiz = document.getElementById("fila");
  if (!raiz) return;

  var DEMO = /[?&]demo=1/.test(location.search);
  var ATIVO = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  var ICONES = "img/icones.svg";
  var LADOS = { "sao-sebastiao": "São Sebastião", "ilhabela": "Ilhabela" };
  var NIVEIS = {
    "verde":    { rotulo: "Tranquilo", faixa: "menos de 20 min", emoji: "🟢" },
    "amarelo":  { rotulo: "Moderado",  faixa: "20 a 60 min",     emoji: "🟡" },
    "vermelho": { rotulo: "Cheio",     faixa: "mais de 1 hora",  emoji: "🔴" },
    "sem-dados":{ rotulo: "Sem relatos", faixa: "nenhum relato nos últimos 30 min", emoji: "⚪" }
  };
  var ERROS = {
    fora_da_fila: "Você precisa estar na fila (até 2 km do embarque) para postar.",
    aguarde: "Você já postou há pouco. Aguarde 10 minutos para postar de novo.",
    sem_localizacao: "Não conseguimos sua localização. Ative o GPS e permita o acesso.",
    foto_invalida: "Não deu para enviar essa foto. Tente outra.",
    aparelho_invalido: "Erro no aparelho. Recarregue a página."
  };

  var db = null;
  var estado = { posts: [], semaforo: {}, filtro: "todos" };

  // ---------- utilidades ----------
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function aparelho() {
    var id = ls("vdb-aparelho");
    if (!id) { id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/[^0-9a-z-]/gi, ""); ls("vdb-aparelho", id); }
    return id;
  }
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, function (c) { return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16); });
  }
  function ha(data) {
    var min = Math.max(0, Math.round((Date.now() - new Date(data).getTime()) / 60000));
    if (min < 1) return "agora";
    if (min < 60) return "há " + min + " min";
    return "há " + Math.floor(min / 60) + " h";
  }
  function fotoUrl(p) { return p.foto_url || (p.foto_path ? cfg.supabaseUrl + "/storage/v1/object/public/fotos/" + p.foto_path : ""); }
  function distancia(a, b, c, d) {
    var R = 6371000, r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2);
    return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y));
  }
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg; t.classList.add("on");
    clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove("on"); }, 3800);
  }

  // ---------- dados ----------
  function carregarCliente() {
    return new Promise(function (ok, erro) {
      if (window.supabase) return ok();
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
      s.onload = ok; s.onerror = erro; document.head.appendChild(s);
    }).then(function () { db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false } }); });
  }

  function atualizar() {
    if (DEMO) { dadosDemo(); return render(); }
    if (!db) return render();
    return Promise.all([
      db.rpc("semaforo_atual"),
      db.from("posts").select("id,lado,espera,texto,foto_path,confere,mudou,criado_em").order("criado_em", { ascending: false }).limit(40)
    ]).then(function (r) {
      if (r[0].error || r[1].error) throw (r[0].error || r[1].error);
      estado.semaforo = {};
      r[0].data.forEach(function (s) { estado.semaforo[s.lado] = s; });
      estado.posts = r[1].data;
      render();
    }).catch(function () { render(true); });
  }

  // ---------- render ----------
  function render(falhou) {
    // semáforo
    ["sao-sebastiao", "ilhabela"].forEach(function (lado) {
      var el = raiz.querySelector('[data-semaforo="' + lado + '"]');
      var s = estado.semaforo[lado];
      var nivel = (!ATIVO && !DEMO) ? "breve" : (s ? s.nivel : "sem-dados");
      el.className = "sinal " + nivel;
      var n = NIVEIS[nivel];
      el.querySelector(".sinal-nivel").textContent = nivel === "breve" ? "Em breve" : n.rotulo;
      el.querySelector(".sinal-faixa").textContent = nivel === "breve" ? "o mural abre em breve"
        : (s && s.espera_mediana != null ? "≈ " + s.espera_mediana + " min de espera medida" : n.faixa);
      var partes = [];
      if (s && s.medidas) partes.push(s.medidas + (s.medidas === 1 ? " espera medida" : " esperas medidas"));
      if (s && s.relatos) partes.push(s.relatos + (s.relatos === 1 ? " relato" : " relatos"));
      if (s && s.medindo) partes.push(s.medindo + " medindo agora");
      el.querySelector(".sinal-base").textContent = partes.length
        ? partes.join(" · ") + (s.ultimo ? " · último " + ha(s.ultimo) : "")
        : (falhou ? "sem conexão no momento" : "seja o primeiro a avisar");
    });

    // mural
    var lista = raiz.querySelector("#mural");
    var posts = estado.posts.filter(function (p) { return estado.filtro === "todos" || p.lado === estado.filtro; });
    if (!ATIVO && !DEMO) {
      lista.innerHTML = '<div class="mural-vazio"><strong>O mural ao vivo está chegando</strong><span>Em breve você vai ver aqui as fotos da fila postadas por quem está nela.</span></div>';
      return;
    }
    if (!posts.length) {
      lista.innerHTML = '<div class="mural-vazio"><strong>Nenhuma foto nos últimos 45 minutos</strong><span>Está na fila? Seja o primeiro a mostrar como está.</span></div>';
      return;
    }
    var minhas = JSON.parse(ls("vdb-reacoes") || "{}");
    lista.innerHTML = posts.map(function (p) {
      var n = NIVEIS[p.espera], foto = fotoUrl(p), r = minhas[p.id] || {};
      return '<article class="post" data-id="' + esc(p.id) + '">' +
        '<header class="post-cab"><span class="avatar">' + (p.lado === "ilhabela" ? "IB" : "SS") + '</span>' +
          '<div><strong>Fila em ' + esc(LADOS[p.lado]) + '</strong><small>' + ha(p.criado_em) + '</small></div>' +
          '<span class="espera ' + esc(p.espera) + '">' + n.emoji + " " + esc(n.faixa) + '</span></header>' +
        (foto ? '<div class="post-foto"><img loading="lazy" src="' + esc(foto) + '" alt="Foto da fila em ' + esc(LADOS[p.lado]) + ' ' + ha(p.criado_em) + '"></div>' : "") +
        (p.texto ? '<p class="post-texto">' + esc(p.texto) + "</p>" : "") +
        '<footer class="post-acoes">' +
          '<button data-acao="confere"' + (r.confere ? ' aria-pressed="true"' : "") + '>👍 Confere <b>' + (p.confere || 0) + '</b></button>' +
          '<button data-acao="mudou"' + (r.mudou ? ' aria-pressed="true"' : "") + '>🔄 Já mudou <b>' + (p.mudou || 0) + '</b></button>' +
          '<button data-acao="compartilhar">↗ Compartilhar</button>' +
          '<button data-acao="denuncia" class="denunciar" title="Denunciar"' + (r.denuncia ? " disabled" : "") + '>⚑</button>' +
        "</footer></article>";
    }).join("");
  }

  // ---------- reações ----------
  raiz.addEventListener("click", function (ev) {
    var b = ev.target.closest("button[data-acao]");
    if (!b) return;
    var post = b.closest(".post"), id = post && post.dataset.id;
    var p = estado.posts.find(function (x) { return x.id === id; });
    var acao = b.dataset.acao;
    if (acao === "compartilhar") return compartilhar(p);
    if (acao === "denuncia" && !confirm("Denunciar esta foto como imprópria ou falsa?")) return;
    var minhas = JSON.parse(ls("vdb-reacoes") || "{}");
    minhas[id] = minhas[id] || {};
    if (minhas[id][acao]) return;
    minhas[id][acao] = 1; ls("vdb-reacoes", JSON.stringify(minhas));
    if (acao !== "denuncia") p[acao] = (p[acao] || 0) + 1;
    render();
    if (acao === "denuncia") toast("Obrigado! Vamos analisar esta foto.");
    if (db) db.rpc("reagir", { p_post: id, p_aparelho: aparelho(), p_tipo: acao }).then(function () { setTimeout(atualizar, 800); });
  });

  // ---------- compartilhar (card com foto + semáforo) ----------
  function compartilhar(p) {
    var n = NIVEIS[p.espera];
    var texto = n.emoji + " Fila da balsa em " + LADOS[p.lado] + ": " + n.faixa + " (" + ha(p.criado_em) + ").\nVeja ao vivo no VAIDEBALSA:";
    var url = location.origin + location.pathname + "#fila";
    gerarCard(p).then(function (arquivo) {
      if (arquivo && navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        return navigator.share({ files: [arquivo], text: texto + " " + url });
      }
      if (navigator.share) return navigator.share({ text: texto, url: url });
      window.open("https://wa.me/?text=" + encodeURIComponent(texto + " " + url), "_blank", "noopener");
    }).catch(function () {});
  }
  function gerarCard(p) {
    var foto = fotoUrl(p);
    return new Promise(function (ok) {
      var c = document.createElement("canvas"); c.width = 1080; c.height = 1350;
      var g = c.getContext("2d"), n = NIVEIS[p.espera];
      var cor = { verde: "#22C55E", amarelo: "#FFC107", vermelho: "#E53935" }[p.espera];
      function finalizar() {
        var grad = g.createLinearGradient(0, 700, 0, 1350);
        grad.addColorStop(0, "rgba(10,44,82,0)"); grad.addColorStop(.45, "rgba(10,44,82,.92)"); grad.addColorStop(1, "#0A2C52");
        g.fillStyle = grad; g.fillRect(0, 700, 1080, 650);
        g.fillStyle = cor; roundRect(g, 70, 960, 940, 120, 60); g.fill();
        g.fillStyle = p.espera === "amarelo" ? "#0A2C52" : "#fff";
        g.font = "900 italic 58px Montserrat, sans-serif"; g.textAlign = "center";
        g.fillText(n.rotulo.toUpperCase() + " · " + n.faixa, 540, 1040);
        g.fillStyle = "#fff"; g.font = "800 46px Montserrat, sans-serif";
        g.fillText("Fila em " + LADOS[p.lado] + " · " + ha(p.criado_em), 540, 900);
        g.font = "900 italic 64px Montserrat, sans-serif";
        g.fillStyle = "#fff"; g.textAlign = "right"; g.fillText("VAIDE", 540, 1240);
        g.fillStyle = "#FFC107"; g.textAlign = "left"; g.fillText("BALSA", 540, 1240);
        g.fillStyle = "#b9cde6"; g.textAlign = "center"; g.font = "600 34px Inter, sans-serif";
        g.fillText("A travessia em tempo real · ao vivo", 540, 1295);
        c.toBlob(function (b) { ok(b ? new File([b], "fila-balsa.jpg", { type: "image/jpeg" }) : null); }, "image/jpeg", .88);
      }
      g.fillStyle = "#0A2C52"; g.fillRect(0, 0, 1080, 1350);
      if (!foto) return finalizar();
      var img = new Image(); img.crossOrigin = "anonymous";
      img.onload = function () {
        var esc = Math.max(1080 / img.width, 1100 / img.height), w = img.width * esc, h = img.height * esc;
        g.drawImage(img, (1080 - w) / 2, (1100 - h) / 2, w, h);
        try { finalizar(); } catch (e) { ok(null); }
      };
      img.onerror = function () { finalizar(); };
      img.src = foto;
    }).catch(function () { return null; });
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // ---------- filtros ----------
  raiz.querySelectorAll(".mural-filtros button").forEach(function (b) {
    b.addEventListener("click", function () {
      raiz.querySelectorAll(".mural-filtros button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", "true"); estado.filtro = b.dataset.filtro; render();
    });
  });

  // ---------- postar ----------
  var modal = document.getElementById("postar");
  var form = document.getElementById("form-postar");
  var pos = null, arquivo = null;

  document.querySelectorAll("[data-abrir-postar]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!ATIVO) { toast(DEMO ? "Modo demonstração: o envio fica ativo quando o mural for ligado." : "O mural abre em breve!"); if (!DEMO) return; }
      form.reset(); arquivo = null; pos = null;
      form.querySelector(".previa").innerHTML = '<span>📷 Toque para tirar a foto da fila</span>';
      form.querySelector(".local").textContent = "Buscando sua localização…";
      form.querySelector(".local").className = "local";
      modal.showModal();
      localizar();
    });
  });
  modal.querySelectorAll("[data-fechar]").forEach(function (b) { b.addEventListener("click", function () { modal.close(); }); });

  function localizar() {
    var info = form.querySelector(".local");
    if (!navigator.geolocation) { info.textContent = ERROS.sem_localizacao; info.className = "local erro"; return; }
    navigator.geolocation.getCurrentPosition(function (g) {
      pos = { lat: g.coords.latitude, lon: g.coords.longitude };
      var melhor = null;
      Object.keys(cfg.embarques || {}).forEach(function (l) {
        var e = cfg.embarques[l], d = distancia(pos.lat, pos.lon, e.lat, e.lon);
        if (!melhor || d < melhor.d) melhor = { lado: l, d: d, raio: e.raio };
      });
      if (melhor && melhor.d <= melhor.raio) {
        form.querySelector('input[name="lado"][value="' + melhor.lado + '"]').checked = true;
        info.textContent = "📍 Você está na fila de " + LADOS[melhor.lado] + ".";
        info.className = "local ok";
      } else {
        info.textContent = "📍 " + ERROS.fora_da_fila;
        info.className = "local erro";
      }
    }, function () { info.textContent = ERROS.sem_localizacao; info.className = "local erro"; }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }

  form.querySelector('input[type="file"]').addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    // Só fotos tiradas agora: arquivo de mais de 30 min (ex.: da galeria) é recusado
    if (f.lastModified && Date.now() - f.lastModified > 30 * 60000) {
      e.target.value = "";
      return toast("Use uma foto tirada agora, na fila. Fotos antigas da galeria não valem.");
    }
    comprimir(f).then(function (b) {
      arquivo = b;
      form.querySelector(".previa").innerHTML = '<img alt="Prévia da foto" src="' + URL.createObjectURL(b) + '">';
    }).catch(function () { toast(ERROS.foto_invalida); });
  });

  // Redimensiona (máx. 1280 px) e regrava em JPEG — isso também remove os dados de GPS da foto
  function comprimir(f) {
    var ler = window.createImageBitmap ? createImageBitmap(f, { imageOrientation: "from-image" }) : new Promise(function (ok, erro) {
      var i = new Image(); i.onload = function () { ok(i); }; i.onerror = erro; i.src = URL.createObjectURL(f);
    });
    return ler.then(function (img) {
      var esc = Math.min(1, 1280 / Math.max(img.width, img.height));
      var c = document.createElement("canvas"); c.width = Math.round(img.width * esc); c.height = Math.round(img.height * esc);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return new Promise(function (ok, erro) { c.toBlob(function (b) { b ? ok(b) : erro(); }, "image/jpeg", .78); });
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var dados = new FormData(form);
    var lado = dados.get("lado"), espera = dados.get("espera");
    if (!dados.get("parado")) return toast("Confirme que você não está dirigindo.");
    if (!arquivo) return toast("Tire a foto da fila primeiro.");
    if (!lado || !espera) return toast("Escolha o lado e o tempo de espera.");
    if (!pos) return toast(ERROS.sem_localizacao);
    if (!ATIVO) { modal.close(); return toast("Modo demonstração: nada foi enviado."); }
    var botao = form.querySelector('button[type="submit"]');
    botao.disabled = true; botao.textContent = "Enviando…";
    var nome = uuid() + ".jpg";
    db.storage.from("fotos").upload(nome, arquivo, { contentType: "image/jpeg", upsert: false })
      .then(function (r) {
        if (r.error) throw { message: "foto_invalida" };
        return db.rpc("criar_post", { p_lado: lado, p_espera: espera, p_texto: dados.get("texto") || "", p_foto_path: nome, p_aparelho: aparelho(), p_lat: pos.lat, p_lon: pos.lon });
      })
      .then(function (r) {
        if (r.error) throw r.error;
        modal.close(); toast("Postado! Obrigado por ajudar quem vem atrás 🙌"); atualizar();
      })
      .catch(function (err) {
        var cod = Object.keys(ERROS).find(function (k) { return String(err && err.message || "").indexOf(k) > -1; });
        toast(cod ? ERROS[cod] : "Não deu para postar agora. Tente de novo.");
      })
      .then(function () { botao.disabled = false; botao.textContent = "Postar no mural"; });
  });

  // ---------- demonstração (só com ?demo=1) ----------
  function dadosDemo() {
    var agora = Date.now();
    estado.semaforo = {
      "sao-sebastiao": { lado: "sao-sebastiao", nivel: "vermelho", relatos: 7, ultimo: new Date(agora - 3 * 60000).toISOString() },
      "ilhabela": { lado: "ilhabela", nivel: "verde", relatos: 3, ultimo: new Date(agora - 9 * 60000).toISOString() }
    };
    estado.posts = estado.posts.length ? estado.posts : [
      { id: "d1", lado: "sao-sebastiao", espera: "vermelho", texto: "Fila chegando no posto, andando devagar.", foto_url: "img/travessia.webp", confere: 5, mudou: 0, criado_em: new Date(agora - 3 * 60000).toISOString() },
      { id: "d2", lado: "ilhabela", espera: "verde", texto: "Embarquei rapidinho, quase sem fila!", foto_url: "", confere: 2, mudou: 0, criado_em: new Date(agora - 9 * 60000).toISOString() },
      { id: "d3", lado: "sao-sebastiao", espera: "amarelo", texto: "", foto_url: "img/travessia.webp", confere: 1, mudou: 2, criado_em: new Date(agora - 26 * 60000).toISOString() }
    ];
  }

  // ---------- início ----------
  if (DEMO) raiz.classList.add("demo");
  (ATIVO ? carregarCliente() : Promise.resolve()).then(atualizar).catch(function () { render(true); });
  setInterval(function () { if (!document.hidden) atualizar(); }, 45000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) atualizar(); });
})();
