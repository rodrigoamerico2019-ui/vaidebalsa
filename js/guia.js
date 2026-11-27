/* VAIDEBALSA — guia de apoiadores: listas (Onde ficar · Onde comer · Serviços) e página de cada apoiador.
   Dados: tabela "parceiros" (preenchida pelo painel). Enquanto o SQL 011 não roda, usa o exemplo abaixo. */
(function () {
  "use strict";
  var cfg = window.VAIDEBALSA || {};
  var GUIAS = {
    ficar: { nome: "Onde ficar", pagina: "onde-ficar.html", ic: "🛏️" },
    comer: { nome: "Onde comer", pagina: "onde-comer.html", ic: "🍽️" },
    servicos: { nome: "Serviços", pagina: "servicos.html", ic: "🧭" }
  };
  var CATS = { hospedagem: "Hospedagem", alimentacao: "Restaurante", passeios: "Passeios", comercio: "Comércio", servicos: "Serviços", utilidade: "Utilidade pública" };
  var LADOS = { "sao-sebastiao": "São Sebastião", ilhabela: "Ilhabela", ambos: "Ilhabela e São Sebastião" };

  // exemplo enquanto o banco não tem as páginas (some sozinho quando o SQL 011 for rodado)
  var EXEMPLO = [{
    id: null, slug: "emirados-pousada-de-charme", guia: "ficar", nome: "Emirados Pousada de Charme", categoria: "hospedagem", lado: "ilhabela", ordem: 1,
    descricao: "Charme, hospitalidade e alma. Chalés entre palmeiras, piscina ao sol e manhãs sem pressa.",
    chamada: "Um refúgio com alma, longe de tudo",
    sobre: "A Emirados é um refúgio intimista em Ilhabela onde cada detalhe é feito com carinho para que você se sinta em casa. Chalés entre palmeiras, piscina ao sol e manhãs sem pressa: acolhimento com alma e hospitalidade que se sente.",
    oferece: "Chalés com varanda e rede\nPiscina com deck entre palmeiras\nCafé da manhã incluso na diária\nBar no deck\nJardim tropical\nReserva direta com a pousada",
    horario: "Check-in a partir das 16h · Check-out até 12h",
    whatsapp: "5524988541645", endereco: null, link_mapa: null, site: null, instagram: null, selo_inclusao: false,
    fotos: ["capa", "piscina-1", "chales", "cafe-1", "suite-cama", "piscina-2", "bar-deck", "chale-porta", "cafe-2", "suite-varanda", "suite-banheiro", "fachada-larga"].map(function (n) { return "img/guia/emirados/" + n + ".webp"; })
  }];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function urlFoto(f) {
    if (!f) return "";
    if (/^(https?:)?\/\//.test(f) || f.indexOf("img/") === 0) return f;
    return cfg.supabaseUrl + "/storage/v1/object/public/parceiros/" + f;
  }
  function fotosDe(p) {
    var l = Array.isArray(p.fotos) ? p.fotos.slice() : [];
    if (!l.length) { if (p.foto_path) l.push(p.foto_path); else if (p.foto_url) l.push(p.foto_url); }
    return l.map(urlFoto).filter(Boolean);
  }
  function waLink(p) {
    return "https://wa.me/" + String(p.whatsapp).replace(/\D/g, "") + "?text=" + encodeURIComponent("Olá! Vi a " + p.nome + " no VAIDEBALSA e gostaria de informações.");
  }
  function contar(p, tipo) {
    if (!p.id || !cfg.supabaseUrl) return;
    try {
      fetch(cfg.supabaseUrl + "/rest/v1/rpc/registrar_clique", {
        method: "POST", keepalive: true, headers: { apikey: cfg.supabaseAnonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ p_parceiro: p.id, p_tipo: tipo })
      });
    } catch (e) {}
  }
  function buscar(filtro) {
    var campos = "id,slug,guia,nome,categoria,lado,ordem,descricao,chamada,sobre,oferece,horario,whatsapp,telefone,endereco,link_mapa,site,instagram,selo_inclusao,fotos,foto_path,foto_url";
    if (!cfg.supabaseUrl) return Promise.resolve(EXEMPLO);
    return fetch(cfg.supabaseUrl + "/rest/v1/parceiros?select=" + campos + "&ativo=eq.true&slug=not.is.null&" + filtro + "&order=ordem.asc,nome.asc", {
      headers: { apikey: cfg.supabaseAnonKey }
    }).then(function (r) { if (!r.ok) throw new Error("sem_colunas"); return r.json(); })
      .then(function (lista) {
        var slugs = lista.map(function (p) { return p.slug; });
        return lista.concat(EXEMPLO.filter(function (e) { return slugs.indexOf(e.slug) < 0 && !lista.some(function (p) { return p.nome === e.nome; }); }));
      })
      .catch(function () { return EXEMPLO; });
  }

  // ================= lista (onde-ficar / onde-comer / servicos) =================
  var lista = document.getElementById("guia-lista");
  if (lista) {
    var g = lista.dataset.guia;
    buscar("guia=eq." + g).then(function (itens) {
      itens = itens.filter(function (p) { return p.guia === g; });
      if (!itens.length) {
        lista.innerHTML = '<div class="gl-vazio"><b>' + GUIAS[g].ic + " Em breve por aqui</b><p>Os primeiros apoiadores deste guia estão chegando. Tem um negócio na ilha ou em São Sebastião?</p>" +
          '<a class="btn-agendar" href="apoie.html">💛 Quero aparecer aqui</a></div>';
        return;
      }
      lista.innerHTML = itens.map(function (p) {
        var f = fotosDe(p)[0], link = "local.html?n=" + encodeURIComponent(p.slug);
        return '<article class="gl-card">' +
          '<a class="gl-foto" href="' + link + '">' + (f ? '<img src="' + esc(f) + '" alt="' + esc(p.nome) + '" loading="lazy">' : "") +
          '<span class="gl-lado">' + esc(LADOS[p.lado] || "") + "</span></a>" +
          '<div class="gl-txt"><small>' + esc(CATS[p.categoria] || GUIAS[g].nome) + "</small>" +
          '<h2><a href="' + link + '">' + esc(p.nome) + "</a></h2>" +
          "<p>" + esc(p.chamada || p.descricao || "") + "</p>" +
          '<div class="gl-acoes"><a class="gl-ver" href="' + link + '">Ver fotos e detalhes →</a>' +
          (p.whatsapp ? '<a class="gl-wa" href="' + esc(waLink(p)) + '" target="_blank" rel="noopener sponsored" data-i="' + esc(p.slug) + '" aria-label="WhatsApp de ' + esc(p.nome) + '">WhatsApp</a>' : "") +
          "</div></div></article>";
      }).join("");
      lista.addEventListener("click", function (e) {
        var a = e.target.closest(".gl-wa"); if (!a) return;
        var p = itens.find(function (x) { return x.slug === a.dataset.i; }); if (p) contar(p, "whatsapp");
      });
    });
  }

  // ================= página do apoiador (local.html?n=slug) =================
  var raiz = document.getElementById("local");
  if (!raiz) return;
  var slug = (new URLSearchParams(location.search).get("n") || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!slug) { raiz.innerHTML = naoAchou(); return; }
  buscar("slug=eq." + slug).then(function (r) {
    var p = r.filter(function (x) { return x.slug === slug; })[0];
    if (!p) { raiz.innerHTML = naoAchou(); return; }
    montar(p); contar(p, "pagina");
  });
  function naoAchou() {
    return '<div class="wrap"><div class="gl-vazio" style="margin:40px auto"><b>Página não encontrada</b><p>Esse apoiador pode ter saído do ar.</p><a class="btn-agendar" href="onde-ficar.html">Ver Onde ficar</a></div></div>';
  }
  function montar(p) {
    var fotos = fotosDe(p), G = GUIAS[p.guia] || GUIAS.ficar, wa = p.whatsapp ? waLink(p) : null;
    document.title = p.nome + " | " + G.nome + " · VAIDEBALSA";
    var md = document.querySelector('meta[name="description"]'); if (md) md.setAttribute("content", (p.chamada ? p.chamada + ". " : "") + (p.descricao || ""));
    var itens = String(p.oferece || "").split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var mapa = p.link_mapa || (p.endereco ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(p.endereco + ", " + (LADOS[p.lado] || "") + " SP") : null);
    var insta = p.instagram ? "https://www.instagram.com/" + String(p.instagram).replace(/^@/, "") + "/" : null;
    var botaoWa = function (cls, txt) { return wa ? '<a class="' + cls + '" href="' + esc(wa) + '" target="_blank" rel="noopener sponsored" data-c="whatsapp"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm4.5 12.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>' + txt + "</a>" : ""; };

    raiz.innerHTML =
      '<section class="lc-hero">' +
        '<div class="lc-galeria" id="lc-galeria">' + fotos.map(function (f, i) {
          return '<button type="button" class="lc-slide" data-foto="' + i + '" aria-label="Ampliar foto ' + (i + 1) + '"><img src="' + esc(f) + '" alt="' + esc(p.nome) + " — foto " + (i + 1) + '"' + (i > 1 ? ' loading="lazy"' : "") + "></button>";
        }).join("") + "</div>" +
        (fotos.length > 1 ? '<span class="lc-cont" id="lc-cont">1 / ' + fotos.length + "</span>" +
          '<button type="button" class="lc-seta ant" data-mover="-1" aria-label="Foto anterior">‹</button><button type="button" class="lc-seta prox" data-mover="1" aria-label="Próxima foto">›</button>' : "") +
        '<div class="lc-titulo"><div class="wrap">' +
          '<a class="lc-voltar" href="' + G.pagina + '">← ' + G.nome + "</a>" +
          '<span class="lc-chips"><span>' + esc(CATS[p.categoria] || G.nome) + "</span><span>📍 " + esc(LADOS[p.lado] || "") + "</span></span>" +
          "<h1>" + esc(p.nome) + "</h1>" + (p.chamada ? '<p class="lc-chamada">' + esc(p.chamada) + "</p>" : "") +
        "</div></div>" +
      "</section>" +
      '<div class="wrap lc-corpo">' +
        '<div class="lc-principal">' +
          (p.sobre || p.descricao ? '<section class="lc-bloco"><h2>Sobre</h2><p class="lc-sobre">' + esc(p.sobre || p.descricao).replace(/\n/g, "<br>") + "</p></section>" : "") +
          (itens.length ? '<section class="lc-bloco"><h2>O que você encontra</h2><ul class="lc-oferece">' + itens.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ul></section>" : "") +
          (fotos.length > 1 ? '<section class="lc-bloco"><h2>Fotos</h2><div class="lc-grade">' + fotos.map(function (f, i) {
            return '<button type="button" data-foto="' + i + '" aria-label="Ampliar foto ' + (i + 1) + '"><img src="' + esc(f) + '" alt="" loading="lazy"></button>';
          }).join("") + "</div></section>" : "") +
        "</div>" +
        '<aside class="lc-lado">' +
          '<div class="lc-card">' +
            "<strong>" + esc(p.nome) + "</strong>" +
            (p.horario ? '<p class="lc-info"><span>🕒</span>' + esc(p.horario) + "</p>" : "") +
            (p.endereco ? '<p class="lc-info"><span>📍</span>' + esc(p.endereco) + "</p>" : '<p class="lc-info"><span>📍</span>' + esc(LADOS[p.lado] || "") + "</p>") +
            botaoWa("lc-wa", "Chamar no WhatsApp") +
            '<div class="lc-links">' +
              (mapa ? '<a href="' + esc(mapa) + '" target="_blank" rel="noopener" data-c="mapa">🗺️ Como chegar</a>' : "") +
              (insta ? '<a href="' + esc(insta) + '" target="_blank" rel="noopener" data-c="instagram">📸 Instagram</a>' : "") +
              (p.site ? '<a href="' + esc(p.site) + '" target="_blank" rel="noopener" data-c="site">🌐 Site</a>' : "") +
            "</div>" +
          "</div>" +
          '<div class="lc-selo">💛 <span><b>Apoia o Instituto Américo.</b> Ao falar com este parceiro pelo VAIDEBALSA, você ajuda o projeto a continuar gratuito.</span></div>' +
          (p.selo_inclusao ? '<div class="lc-selo verde">🧩 <span><b>Amigo da Inclusão.</b> Lugar que acolhe pessoas autistas, com deficiência e suas famílias.</span></div>' : "") +
        "</aside>" +
      "</div>" +
      (wa ? '<div class="lc-barra">' + botaoWa("lc-wa", "Chamar no WhatsApp") + "</div>" : "") +
      '<dialog class="lc-zoom" id="lc-zoom"><button type="button" class="lc-fechar" data-fechar aria-label="Fechar">✕</button>' +
        '<button type="button" class="lc-seta ant" data-z="-1" aria-label="Foto anterior">‹</button><img id="lc-zoom-img" alt=""><button type="button" class="lc-seta prox" data-z="1" aria-label="Próxima foto">›</button>' +
        '<span class="lc-cont" id="lc-zoom-cont"></span></dialog>';

    // galeria do topo (deslizar no celular, setas no computador)
    var gal = document.getElementById("lc-galeria"), cont = document.getElementById("lc-cont"), atual = 0;
    if (cont) gal.addEventListener("scroll", function () {
      atual = Math.round(gal.scrollLeft / gal.clientWidth); cont.textContent = (atual + 1) + " / " + fotos.length;
    }, { passive: true });
    raiz.querySelectorAll("[data-mover]").forEach(function (b) {
      b.addEventListener("click", function () {
        var n = (atual + +b.dataset.mover + fotos.length) % fotos.length;
        gal.scrollTo({ left: n * gal.clientWidth, behavior: "smooth" });
      });
    });
    // fotos ampliadas
    var zoom = document.getElementById("lc-zoom"), zi = document.getElementById("lc-zoom-img"), zc = document.getElementById("lc-zoom-cont"), zn = 0;
    function abrir(n) { zn = (n + fotos.length) % fotos.length; zi.src = fotos[zn]; zc.textContent = (zn + 1) + " / " + fotos.length; if (!zoom.open) zoom.showModal(); }
    raiz.addEventListener("click", function (e) {
      var f = e.target.closest("[data-foto]"); if (f) abrir(+f.dataset.foto);
      var z = e.target.closest("[data-z]"); if (z) abrir(zn + +z.dataset.z);
      if (e.target.closest("[data-fechar]") || e.target === zoom) zoom.close();
      var c = e.target.closest("[data-c]"); if (c) contar(p, c.dataset.c);
    });
    document.addEventListener("keydown", function (e) {
      if (!zoom.open) return;
      if (e.key === "ArrowRight") abrir(zn + 1);
      if (e.key === "ArrowLeft") abrir(zn - 1);
    });
  }
})();
