/* VAIDEBALSA — barra da fila (todas as páginas), parceiros e previsão de 7 dias */
(function () {
  var cfg = window.VAIDEBALSA || {};
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // ---------- Faixa AO VIVO (todas as páginas) + tempo de embarque (início) ----------
  var barra = document.getElementById("barra-fila");
  var NOMES = { "sao-sebastiao": "São Sebastião", "ilhabela": "Ilhabela" };
  var NIVEL = { verde: ["🟢", "Tranquilo"], amarelo: ["🟡", "Moderado"], vermelho: ["🔴", "Cheio"], "sem-dados": ["⚪", "sem relatos"] };
  var FAIXA = { verde: "menos de 20 min", amarelo: "20 a 60 min", vermelho: "mais de 1 hora" };
  var WAZE = {
    "sao-sebastiao": "https://www.waze.com/live-map/directions?to=ll.-23.8075%2C-45.4005",
    "ilhabela": "https://www.waze.com/live-map/directions?to=ll.-23.8202%2C-45.3762"
  };
  var naInicial = !!document.getElementById("fila");
  var base = naInicial ? "" : "./";
  var DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  var alertasTempo = null;   // carregado uma vez

  function minAtras(d) { return Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000)); }
  function api(caminho, opcoes) {
    return fetch(cfg.supabaseUrl + caminho, Object.assign({ headers: { apikey: cfg.supabaseAnonKey, "Content-Type": "application/json" } }, opcoes || {}))
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function frequencia() {
    var p = new Intl.DateTimeFormat("pt-BR", { hour: "numeric", minute: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).formatToParts(new Date());
    var t = +p.find(function (x) { return x.type === "hour"; }).value * 60 + +p.find(function (x) { return x.type === "minute"; }).value;
    return (t >= 330 && t < 1410) ? "a cada ~30 min" : "a cada ~1 hora";
  }
  function carregarAlertasTempo() {
    if (alertasTempo) return Promise.resolve(alertasTempo);
    return Promise.all([
      fetch("https://api.open-meteo.com/v1/forecast?latitude=-23.81&longitude=-45.40&daily=wind_gusts_10m_max&timezone=America%2FSao_Paulo&forecast_days=3").then(function (r) { return r.json(); }),
      fetch("https://marine-api.open-meteo.com/v1/marine?latitude=-23.78&longitude=-45.36&daily=wave_height_max&timezone=America%2FSao_Paulo&forecast_days=3").then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (r) {
      var d = r[0].daily, ondas = r[1] && r[1].daily ? r[1].daily.wave_height_max : [];
      alertasTempo = d.time.map(function (dia, i) {
        var raj = Math.round(d.wind_gusts_10m_max[i]), onda = ondas[i];
        var motivos = [];
        if (raj >= 50) motivos.push("rajadas de " + raj + " km/h");
        if (onda != null && onda >= 1.5) motivos.push("ondas de " + onda.toFixed(1).replace(".", ",") + " m");
        if (!motivos.length) return null;
        var dt = new Date(dia + "T12:00:00");
        var nome = i === 0 ? "Hoje" : i === 1 ? "Amanhã" : DIAS[dt.getDay()] + " " + dt.getDate();
        return "⚠️ " + nome + ": " + motivos.join(" e ") + ". A travessia pode atrasar";
      }).filter(Boolean);
      return alertasTempo;
    }).catch(function () { alertasTempo = []; return alertasTempo; });
  }

  function item(txt, href, externo) {
    return href
      ? '<a class="bf-item" href="' + esc(href) + '"' + (externo ? ' target="_blank" rel="noopener"' : "") + ">" + txt + "</a>"
      : '<span class="bf-item">' + txt + "</span>";
  }

  function atualizarAoVivo() {
    if (!cfg.supabaseUrl) return;
    Promise.all([
      api("/rest/v1/rpc/semaforo_atual", { method: "POST", body: "{}" }),
      api("/rest/v1/avisos?select=texto,emoji,link&order=ordem.asc,inicio.desc&limit=6"),
      carregarAlertasTempo(),
      api("/rest/v1/rpc/espera_tipica", { method: "POST", body: "{}" })
    ]).then(function (r) {
      var sem = Array.isArray(r[0]) ? r[0] : [], avisos = Array.isArray(r[1]) ? r[1] : [], tempo = r[2] || [];
      var tipicaDB = {}; (Array.isArray(r[3]) ? r[3] : []).forEach(function (t) { tipicaDB[t.lado] = t; });
      // sem dados ao vivo: histórico próprio (5+ medições no mesmo dia/horário) ou estimativa de referência
      function tipica(l) {
        var h = tipicaDB[l];
        if (h && h.medicoes >= 5 && h.mediana != null) {
          return { texto: "≈ " + h.mediana + " min", nota: "típico neste horário · " + h.medicoes + " medições nas últimas semanas",
                   nivel: h.mediana < 20 ? "verde" : h.mediana <= 60 ? "amarelo" : "vermelho" };
        }
        var e = window.VDB_ESTIMATIVA ? window.VDB_ESTIMATIVA(l) : null;
        return e ? { texto: e.texto, nota: "estimativa de referência (" + e.contexto + ")", nivel: e.nivel } : null;
      }
      var porLado = {}; sem.forEach(function (d) { porLado[d.lado] = d; });
      var algum = sem.some(function (d) { return d.relatos > 0 || d.medidas > 0; });

      // itens da faixa
      var itens = [];
      avisos.forEach(function (a) { itens.push(item(esc((a.emoji ? a.emoji + " " : "📢 ") + a.texto), a.link, true)); });
      ["sao-sebastiao", "ilhabela"].forEach(function (l) {
        var d = porLado[l] || { nivel: "sem-dados" }, n = NIVEL[d.nivel] || NIVEL["sem-dados"];
        var extra = d.espera_mediana != null ? " · ≈" + d.espera_mediana + " min" : (FAIXA[d.nivel] ? " · " + FAIXA[d.nivel] : "");
        var quando = d.ultimo ? " (há " + minAtras(d.ultimo) + " min)" : "";
        var t = d.nivel === "sem-dados" ? tipica(l) : null;
        if (t) itens.push(item("⏱ <b>" + NOMES[l] + ":</b> embarque aprox. " + esc(t.texto) + " <i>(sem relatos agora)</i>", base + "#fila"));
        else itens.push(item(n[0] + " <b>" + NOMES[l] + ":</b> " + n[1] + extra + quando, base + "#fila"));
      });
      itens.push(item("⛴️ Saídas agora " + frequencia()));
      tempo.forEach(function (t) { itens.push(item(esc(t), base + "#tempo-7-dias")); });
      if (!algum) itens.push(item("📸 Está na fila? Poste uma foto ou meça sua espera", base + "#fila"));

      if (barra) {
        var fita = itens.join('<span class="bf-sep" aria-hidden="true">•</span>');
        var dur = Math.max(25, itens.length * 7);
        barra.innerHTML = '<div class="wrap bf-conteudo"><span class="bf-vivo">AO VIVO</span>' +
          '<div class="bf-trilho"><div class="bf-fita" style="animation-duration:' + dur + 's">' +
          '<span class="bf-grupo">' + fita + '<span class="bf-sep" aria-hidden="true">•</span></span>' +
          '<span class="bf-grupo" aria-hidden="true">' + fita + '<span class="bf-sep">•</span></span>' +
          "</div></div></div>";
        barra.hidden = false;
      }

      // tempo de embarque (só na página inicial)
      var emb = document.getElementById("embarque");
      if (emb) {
        var base2 = [];
        ["sao-sebastiao", "ilhabela"].forEach(function (l) {
          var d = porLado[l] || { nivel: "sem-dados", relatos: 0, medidas: 0 };
          var el = emb.querySelector('[data-lado="' + l + '"]');
          var valor, sub, nivel = d.nivel;
          if (d.espera_mediana != null) { valor = "≈ " + d.espera_mediana + " min"; }
          else if (FAIXA[d.nivel]) { valor = FAIXA[d.nivel]; }
          else { var t = tipica(l); valor = t ? t.texto : "Sem dados"; nivel = t ? "tipico " + t.nivel : "sem-dados"; }
          var partes = [];
          if (d.medidas) partes.push(d.medidas + (d.medidas === 1 ? " medição" : " medições"));
          if (d.relatos) partes.push(d.relatos + (d.relatos === 1 ? " foto" : " fotos"));
          var tt = partes.length ? null : tipica(l);
          sub = partes.length ? partes.join(" · ") + (d.ultimo ? " · há " + minAtras(d.ultimo) + " min" : "")
            : (tt ? esc(tt.nota) + " · " : "") + '<a href="' + WAZE[l] + '" target="_blank" rel="noopener">ver trânsito no Waze →</a>';
          el.className = "emb-lado " + nivel;
          el.querySelector("strong").textContent = valor;
          el.querySelector("span").innerHTML = sub;
          if (partes.length) base2.push(1);
        });
        emb.querySelector(".emb-fonte").textContent = base2.length
          ? "Estimativa de quem está na fila agora (esperas medidas e fotos)."
          : "Sem relatos nos últimos 30 min — mostrando o tempo aproximado típico.";
      }
    });
  }
  atualizarAoVivo();
  setInterval(function () { if (!document.hidden) atualizarAoVivo(); }, 60000);

  // ---------- Parceiros ----------
  var parc = document.getElementById("parceiros");
  if (parc && cfg.parceiros) {
    parc.innerHTML = cfg.parceiros.slice(0, 3).map(function (p) {
      if (!p) {
        var link = cfg.contatoAnuncie ? "https://wa.me/" + cfg.contatoAnuncie + "?text=" + encodeURIComponent("Olá! Quero anunciar no VAIDEBALSA.") : "";
        return '<div class="parceiro livre"><span class="pl-ic">＋</span><strong>Sua marca aqui</strong><span>Fale com quem está chegando em Ilhabela.</span>' +
          (link ? '<a href="' + esc(link) + '" target="_blank" rel="noopener">Quero anunciar</a>' : '<em>Espaço reservado para parceiro</em>') + "</div>";
      }
      return '<a class="parceiro" href="' + esc(p.link) + '" target="_blank" rel="noopener sponsored">' +
        '<div class="p-foto"><img loading="lazy" src="' + esc(p.imagem) + '" alt="' + esc(p.nome) + '"><span class="p-selo">Parceiro</span></div>' +
        '<div class="p-info"><small>' + esc(p.categoria) + "</small><strong>" + esc(p.nome) + "</strong><p>" + esc(p.texto) + "</p>" +
        '<span class="p-botao">' + esc(p.botao || "Saiba mais") + " →</span></div></a>";
    }).join("");
  }

  // ---------- Previsão de 7 dias ----------
  var prev = document.getElementById("previsao");
  if (!prev) return;
  function icone(c) {
    if (c === 0) return ["☀️", "Sol"];
    if (c <= 2) return ["🌤️", "Sol entre nuvens"];
    if (c === 3) return ["☁️", "Nublado"];
    if (c === 45 || c === 48) return ["🌫️", "Neblina"];
    if (c >= 95) return ["⛈️", "Tempestade"];
    if (c >= 80) return ["🌦️", "Pancadas de chuva"];
    if (c >= 51) return ["🌧️", "Chuva"];
    return ["⛅", "Variável"];
  }
  var DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  Promise.all([
    fetch("https://api.open-meteo.com/v1/forecast?latitude=-23.81&longitude=-45.40&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max&timezone=America%2FSao_Paulo&forecast_days=7").then(function (r) { return r.json(); }),
    fetch("https://marine-api.open-meteo.com/v1/marine?latitude=-23.78&longitude=-45.36&daily=wave_height_max&timezone=America%2FSao_Paulo&forecast_days=7").then(function (r) { return r.json(); }).catch(function () { return null; })
  ]).then(function (r) {
    var d = r[0].daily, ondas = r[1] && r[1].daily ? r[1].daily.wave_height_max : [];
    var alertas = [];
    var cards = d.time.map(function (dia, i) {
      var dt = new Date(dia + "T12:00:00");
      var nome = i === 0 ? "Hoje" : i === 1 ? "Amanhã" : DIAS[dt.getDay()] + " " + dt.getDate();
      var ic = icone(d.weather_code[i]);
      var rajada = Math.round(d.wind_gusts_10m_max[i]), onda = ondas[i];
      var atencao = rajada >= 50 || (onda != null && onda >= 1.5);
      if (atencao) alertas.push(nome.toLowerCase());
      return '<div class="dia' + (atencao ? " atencao" : "") + '">' +
        "<b>" + nome + "</b>" +
        '<span class="d-ic" role="img" aria-label="' + ic[1] + '">' + ic[0] + "</span>" +
        '<span class="d-temp"><strong>' + Math.round(d.temperature_2m_max[i]) + "°</strong> " + Math.round(d.temperature_2m_min[i]) + "°</span>" +
        '<span class="d-linha">💧 ' + (d.precipitation_probability_max[i] || 0) + "%</span>" +
        '<span class="d-linha">💨 ' + Math.round(d.wind_speed_10m_max[i]) + " km/h</span>" +
        (onda != null ? '<span class="d-linha">🌊 ' + onda.toFixed(1).replace(".", ",") + " m</span>" : "") +
        (atencao ? '<span class="d-alerta">⚠️ atenção</span>' : "") +
        "</div>";
    }).join("");
    prev.innerHTML = '<div class="dias">' + cards + "</div>" +
      (alertas.length
        ? '<p class="prev-aviso">⚠️ Vento forte ou mar agitado previstos para <b>' + alertas.join(", ") + "</b>. A travessia pode ter atrasos ou interrupções: confira o mural e os avisos oficiais antes de sair.</p>"
        : '<p class="prev-ok">✅ Sem previsão de vento forte ou mar agitado nos próximos 7 dias. Em dias de chuva com trovoada, confira o mural antes de sair.</p>') +
      '<p class="prev-fonte">Previsão automática (Open-Meteo) para o canal de São Sebastião. Pode mudar.</p>';
  }).catch(function () {
    prev.innerHTML = '<p class="prev-fonte">Não foi possível carregar a previsão agora.</p>';
  });
})();
