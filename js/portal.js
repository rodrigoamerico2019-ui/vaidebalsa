/* VAIDEBALSA — barra da fila (todas as páginas), parceiros e previsão de 7 dias */
(function () {
  var cfg = window.VAIDEBALSA || {};
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // ---------- Barra fixa da fila ----------
  var barra = document.getElementById("barra-fila");
  var NOMES = { "sao-sebastiao": "São Sebastião", "ilhabela": "Ilhabela" };
  var NIVEL = { verde: ["🟢", "Tranquilo"], amarelo: ["🟡", "Moderado"], vermelho: ["🔴", "Cheio"], "sem-dados": ["⚪", "sem relatos"] };
  function minAtras(d) { return Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000)); }
  function atualizarBarra() {
    if (!barra || !cfg.supabaseUrl) return;
    fetch(cfg.supabaseUrl + "/rest/v1/rpc/semaforo_atual", {
      method: "POST",
      headers: { apikey: cfg.supabaseAnonKey, "Content-Type": "application/json" },
      body: "{}"
    }).then(function (r) { return r.json(); }).then(function (dados) {
      if (!Array.isArray(dados)) throw 0;
      var porLado = {}; dados.forEach(function (d) { porLado[d.lado] = d; });
      var algum = dados.some(function (d) { return d.relatos > 0; });
      var ultimo = dados.map(function (d) { return d.ultimo; }).filter(Boolean).sort().pop();
      var itens = ["sao-sebastiao", "ilhabela"].map(function (l) {
        var d = porLado[l] || { nivel: "sem-dados" }, n = NIVEL[d.nivel] || NIVEL["sem-dados"];
        return '<span class="bf-item ' + esc(d.nivel) + '">' + n[0] + " <b>" + NOMES[l] + ":</b> " + n[1] + "</span>";
      }).join("");
      barra.querySelector(".bf-conteudo").innerHTML = '<span class="bf-vivo">AO VIVO</span>' + itens +
        (algum ? '<span class="bf-hora">há ' + minAtras(ultimo) + " min</span>" : '<span class="bf-hora">Está na fila? Avise</span>');
      barra.hidden = false;
    }).catch(function () {});
  }
  atualizarBarra();
  setInterval(function () { if (!document.hidden) atualizarBarra(); }, 60000);

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
