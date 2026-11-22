/* VAIDEBALSA — aviso de cookies (LGPD), medição de audiência (GA4) e anúncios (AdSense).
   Nada de terceiros é carregado antes do "Aceitar". Se nenhum código estiver configurado em
   js/config.js (analytics.ga4 / anuncios.client), o aviso nem aparece. */
(function () {
  var cfg = window.VAIDEBALSA || {};
  var ga4 = cfg.analytics && cfg.analytics.ga4;
  var ads = cfg.anuncios || {};
  var CHAVE = "vdb-consent";
  if (!ga4 && !ads.client) return;

  function ls(v) { try { if (v === undefined) return localStorage.getItem(CHAVE); localStorage.setItem(CHAVE, v); } catch (e) { return null; } }
  function script(src, extra) {
    var s = document.createElement("script"); s.async = true; s.src = src;
    if (extra) Object.keys(extra).forEach(function (k) { s.setAttribute(k, extra[k]); });
    document.head.appendChild(s);
  }

  function ligar() {
    if (ga4 && !window.gtag) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { dataLayer.push(arguments); };
      gtag("js", new Date());
      gtag("config", ga4, { anonymize_ip: true });
      script("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(ga4));
    }
    if (ads.client && !window.adsbygoogle) {
      script("https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(ads.client), { crossorigin: "anonymous" });
      preencherAnuncios();
    }
  }

  function preencherAnuncios() {
    document.querySelectorAll("[data-anuncio]").forEach(function (el) {
      var slot = ads.slots && ads.slots[el.dataset.anuncio];
      if (!slot || el.dataset.ok) return;
      el.dataset.ok = "1";
      el.innerHTML = '<span class="anuncio-rot">Publicidade</span><ins class="adsbygoogle" style="display:block" data-ad-client="' +
        ads.client + '" data-ad-slot="' + slot + '" data-ad-format="auto" data-full-width-responsive="true"></ins>';
      el.hidden = false;
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    });
  }

  function aviso() {
    if (document.getElementById("cookies")) return;
    var d = document.createElement("div");
    d.id = "cookies"; d.className = "cookies"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", "Aviso de cookies");
    d.innerHTML = '<p>🍪 Usamos cookies para medir a audiência e exibir anúncios que mantêm o VAIDEBALSA gratuito. ' +
      '<a href="politica-de-privacidade.html">Saiba mais</a>.</p>' +
      '<div><button type="button" data-c="nao">Só o essencial</button><button type="button" data-c="sim" class="sim">Aceitar</button></div>';
    d.addEventListener("click", function (e) {
      var b = e.target.closest("[data-c]"); if (!b) return;
      ls(b.dataset.c); d.remove();
      if (b.dataset.c === "sim") ligar();
    });
    document.body.appendChild(d);
  }

  // permite reabrir pelo link "Preferências de cookies"
  window.VDB_COOKIES = function () { try { localStorage.removeItem(CHAVE); } catch (e) {} location.reload(); };

  var escolha = ls();
  if (escolha === "sim") ligar();
  else if (escolha !== "nao") aviso();
})();
