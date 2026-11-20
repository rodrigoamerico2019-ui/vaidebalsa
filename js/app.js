(function () {
  var cfg = window.VAIDEBALSA || { cameras: [] };

  // Links para o site oficial
  document.querySelectorAll('[data-link="oficial"]').forEach(function (a) {
    if (cfg.linkOficial) { a.href = cfg.linkOficial; a.target = "_blank"; a.rel = "noopener"; }
    else { a.removeAttribute("href"); a.title = "Link oficial ainda não configurado"; }
  });

  // Ano no rodapé
  document.querySelectorAll("[data-ano]").forEach(function (el) { el.textContent = new Date().getFullYear(); });

  var grade = document.getElementById("grade");
  if (!grade) return;

  var NOMES_LADO = { "sao-sebastiao": "São Sebastião", "ilhabela": "Ilhabela", "canal": "Canal" };

  function telaDe(c) {
    if (!c.url) {
      return '<div class="vazio"><strong>Câmera em breve</strong>Estamos liberando esta imagem com o responsável.</div>';
    }
    if (c.tipo === "youtube") {
      return '<iframe loading="lazy" title="' + c.nome + ' ao vivo" src="https://www.youtube-nocookie.com/embed/' +
        encodeURIComponent(c.url) + '?autoplay=1&mute=1&playsinline=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
    }
    if (c.tipo === "iframe") {
      return '<iframe loading="lazy" title="' + c.nome + ' ao vivo" src="' + c.url + '" allowfullscreen></iframe>';
    }
    if (c.tipo === "imagem") {
      return '<img loading="lazy" alt="' + c.nome + ' — imagem ao vivo" data-snap="' + c.url + '" src="' + c.url + '">';
    }
    return "";
  }

  function render(filtro) {
    grade.innerHTML = cfg.cameras
      .filter(function (c) { return filtro === "todas" || c.lado === filtro; })
      .map(function (c) {
        var credito = c.credito
          ? '<small>Imagem: ' + (c.creditoUrl ? '<a href="' + c.creditoUrl + '" target="_blank" rel="noopener">' + c.credito + "</a>" : c.credito) + "</small>"
          : "";
        return '<article class="cam" id="' + c.id + '">' +
          '<div class="tela">' + telaDe(c) + "</div>" +
          '<div class="info"><div><h3>' + c.nome + "</h3>" + credito + "</div>" +
          '<span class="tag">' + (NOMES_LADO[c.lado] || "") + "</span></div></article>";
      }).join("");
  }

  // Filtro por lado
  var botoes = document.querySelectorAll(".lados button");
  botoes.forEach(function (b) {
    b.addEventListener("click", function () {
      botoes.forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", "true");
      render(b.dataset.lado);
    });
  });
  render("todas");

  // Relógio "atualizado às"
  var hora = document.getElementById("hora");
  function tick() {
    if (hora) hora.textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  tick(); setInterval(tick, 30000);

  // Recarrega câmeras do tipo imagem a cada 30s
  setInterval(function () {
    document.querySelectorAll("img[data-snap]").forEach(function (img) {
      var base = img.dataset.snap;
      img.src = base + (base.indexOf("?") > -1 ? "&" : "?") + "t=" + Date.now();
    });
  }, 30000);

  // Tempo e mar no canal (Open-Meteo, gratuito, sem chave)
  var lat = -23.81, lon = -45.40;
  var tempo = document.getElementById("tempo");
  if (tempo) {
    Promise.all([
      fetch("https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
        "&current=temperature_2m,wind_speed_10m,precipitation&timezone=America%2FSao_Paulo").then(function (r) { return r.json(); }),
      fetch("https://marine-api.open-meteo.com/v1/marine?latitude=-23.78&longitude=-45.36&current=wave_height")
        .then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (res) {
      var c = res[0].current || {};
      var m = res[1] && res[1].current ? res[1].current.wave_height : null;
      set("t-temp", Math.round(c.temperature_2m) + "°C");
      set("t-vento", Math.round(c.wind_speed_10m) + " km/h");
      set("t-chuva", (c.precipitation || 0) + " mm");
      set("t-onda", m != null ? m.toFixed(1) + " m" : "—");
    }).catch(function () { tempo.hidden = true; });
  }
  function set(id, v) { var el = document.getElementById(id); if (el) el.textContent = v; }
})();
