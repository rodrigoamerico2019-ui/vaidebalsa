(function () {
  var cfg = window.VAIDEBALSA || { cameras: [] };
  var ICONES = "img/icones.svg";

  // Links para o agendamento oficial
  document.querySelectorAll('[data-link="oficial"]').forEach(function (a) {
    if (cfg.linkOficial) { a.href = cfg.linkOficial; a.target = "_blank"; a.rel = "noopener"; }
  });

  // Ano no rodapé
  document.querySelectorAll("[data-ano]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  // Revelar elementos ao rolar
  var revelar = document.querySelectorAll(".revela");
  function mostrarTodos() { revelar.forEach(function (el) { el.classList.add("visivel"); }); }
  // Garante que nada fica escondido: o que já está na tela aparece na hora
  revelar.forEach(function (el) { if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("visivel"); });
  // Plano B independente do IntersectionObserver: confere na rolagem
  var pendente = false;
  function conferir() {
    pendente = false;
    var h = window.innerHeight;
    revelar.forEach(function (el) { if (!el.classList.contains("visivel") && el.getBoundingClientRect().top < h - 30) el.classList.add("visivel"); });
  }
  window.addEventListener("scroll", function () { if (!pendente) { pendente = true; setTimeout(conferir, 80); } }, { passive: true });
  window.addEventListener("load", conferir);
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("visivel"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    revelar.forEach(function (el, i) { el.style.transitionDelay = (i % 3) * 90 + "ms"; io.observe(el); });
  } else {
    mostrarTodos();
  }

  // Relógio e frequência de saídas (grade oficial: ~30 min das 5h30 às 23h30; ~1 h na madrugada)
  var hora = document.getElementById("hora");
  var saidas = document.getElementById("t-saidas");
  function tick() {
    var d = new Date();
    if (hora) hora.textContent = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
    if (saidas) {
      var p = new Intl.DateTimeFormat("pt-BR", { hour: "numeric", minute: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).formatToParts(d);
      var h = +p.find(function (x) { return x.type === "hour"; }).value;
      var m = +p.find(function (x) { return x.type === "minute"; }).value;
      var t = h * 60 + m;
      saidas.textContent = (t >= 330 && t < 1410) ? "~30 min" : "~1 hora";
    }
  }
  tick(); setInterval(tick, 30000);

  // Tempo e mar no canal (Open-Meteo, gratuito, sem chave)
  if (document.getElementById("t-temp")) {
    Promise.all([
      fetch("https://api.open-meteo.com/v1/forecast?latitude=-23.81&longitude=-45.40&current=temperature_2m,wind_speed_10m&timezone=America%2FSao_Paulo").then(function (r) { return r.json(); }),
      fetch("https://marine-api.open-meteo.com/v1/marine?latitude=-23.78&longitude=-45.36&current=wave_height").then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (res) {
      var c = res[0].current || {};
      var onda = res[1] && res[1].current ? res[1].current.wave_height : null;
      set("t-temp", Math.round(c.temperature_2m) + "°C");
      set("t-vento", Math.round(c.wind_speed_10m) + " km/h");
      set("t-onda", onda != null ? onda.toFixed(1).replace(".", ",") + " m" : "—");
    }).catch(function () {});
  }
  function set(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }

  // Câmeras
  var grade = document.getElementById("grade");
  if (!grade) return;
  var NOMES_LADO = { "sao-sebastiao": "São Sebastião", "ilhabela": "Ilhabela", "canal": "Canal" };

  function esc(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function telaDe(c) {
    if (!c.url) {
      return '<span class="selo breve">Em breve</span>' +
        '<div class="vazio"><svg class="cam-ic" aria-hidden="true"><use href="' + ICONES + '#i-camera"/></svg>' +
        "<strong>Câmera chegando</strong><small>Estamos liberando esta imagem com o responsável.</small>" +
        '<svg class="ondinha" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 20 Q50 5 100 20 T200 20 T300 20 T400 20 V40 H0Z" fill="#00B8A9" opacity=".35"/><path d="M0 28 Q50 15 100 28 T200 28 T300 28 T400 28 V40 H0Z" fill="#0D6EFD" opacity=".5"/></svg></div>';
    }
    var selo = '<span class="selo"><span class="ponto"></span>Ao vivo</span>';
    if (c.tipo === "youtube") {
      return selo + '<iframe loading="lazy" title="' + esc(c.nome) + ' ao vivo" src="https://www.youtube-nocookie.com/embed/' +
        encodeURIComponent(c.url) + '?autoplay=1&mute=1&playsinline=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
    }
    if (c.tipo === "iframe") {
      return selo + '<iframe loading="lazy" title="' + esc(c.nome) + ' ao vivo" src="' + esc(c.url) + '" allowfullscreen></iframe>';
    }
    if (c.tipo === "imagem") {
      return selo + '<img loading="lazy" alt="' + esc(c.nome) + ' — imagem ao vivo" data-snap="' + esc(c.url) + '" src="' + esc(c.url) + '">';
    }
    return "";
  }

  function render(filtro) {
    grade.innerHTML = cfg.cameras
      .filter(function (c) { return filtro === "todas" || c.lado === filtro; })
      .map(function (c) {
        var credito = c.credito
          ? '<span class="credito">Imagem: ' + (c.creditoUrl ? '<a href="' + esc(c.creditoUrl) + '" target="_blank" rel="noopener">' + esc(c.credito) + "</a>" : esc(c.credito)) + "</span>"
          : "";
        return '<article class="cam" id="' + esc(c.id) + '">' +
          '<div class="tela">' + telaDe(c) + "</div>" +
          '<div class="info"><div><h3>' + esc(c.nome) + "</h3>" + credito + "</div>" +
          '<span class="tag ' + esc(c.lado) + '">' + (NOMES_LADO[c.lado] || "") + "</span></div></article>";
      }).join("");
  }

  var botoes = document.querySelectorAll(".chips button");
  botoes.forEach(function (b) {
    b.addEventListener("click", function () {
      botoes.forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", "true");
      render(b.dataset.lado);
    });
  });
  render("todas");

  // Recarrega câmeras do tipo imagem a cada 30s
  setInterval(function () {
    document.querySelectorAll("img[data-snap]").forEach(function (img) {
      var base = img.dataset.snap;
      img.src = base + (base.indexOf("?") > -1 ? "&" : "?") + "t=" + Date.now();
    });
  }, 30000);
})();
