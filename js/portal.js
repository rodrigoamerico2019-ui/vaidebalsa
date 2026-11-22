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
        // fala do apresentador
        var fala = document.getElementById("fala-mascote");
        if (fala) {
          var ss = porLado["sao-sebastiao"] || {}, ib = porLado["ilhabela"] || {};
          var vivo = function (d) { return d.relatos > 0 || d.medidas > 0; };
          var tempoTxt = function (l) {
            var d = porLado[l] || {};
            if (d.espera_mediana != null) return "≈ " + d.espera_mediana + " min";
            if (FAIXA[d.nivel]) return FAIXA[d.nivel];
            var t = tipica(l); return t ? t.texto : "";
          };
          var frase;
          if (ss.nivel === "vermelho" || ib.nivel === "vermelho") {
            var l = ss.nivel === "vermelho" ? "sao-sebastiao" : "ilhabela";
            frase = "Eita! A fila em " + NOMES[l] + " está cheia (" + tempoTxt(l) + "). Se der, espere um pouco ou agende no Hora Marcada.";
          } else if (vivo(ss) || vivo(ib)) {
            if (ss.nivel === "verde" && ib.nivel !== "amarelo") frase = "Fila tranquila agora! Bora pra Ilhabela! 👍";
            else frase = "Movimento moderado: São Sebastião " + tempoTxt("sao-sebastiao") + " e Ilhabela " + tempoTxt("ilhabela") + ".";
          } else {
            frase = "Ninguém contou da fila agora. Pela experiência: São Sebastião " + tempoTxt("sao-sebastiao") + " e Ilhabela " + tempoTxt("ilhabela") + ". Tá na fila? Me ajuda! 📸";
          }
          var nome = cfg.mascote && cfg.mascote.nome;
          fala.textContent = (nome ? nome + ": " : "") + frase;
        }
        emb.querySelector(".emb-fonte").textContent = base2.length
          ? "Estimativa de quem está na fila agora (esperas medidas e fotos)."
          : "Sem relatos nos últimos 30 min — mostrando o tempo aproximado típico.";
      }
    });
  }
  atualizarAoVivo();
  setInterval(function () { if (!document.hidden) atualizarAoVivo(); }, 60000);

  // Instagram do apresentador
  var il = document.getElementById("insta-link");
  if (il && cfg.mascote) {
    if (cfg.mascote.instagram) {
      il.href = "https://www.instagram.com/" + encodeURIComponent(cfg.mascote.instagram) + "/";
      il.textContent = "Seguir @" + cfg.mascote.instagram;
    } else { il.removeAttribute("href"); il.classList.add("breve"); }
    if (cfg.mascote.nome) {
      var d = document.getElementById("insta-desc");
      d.textContent = d.textContent.replace("nosso apresentador", cfg.mascote.nome);
    }
  }

  // ---------- Parceiros (vindos do painel) e serviços úteis ----------
  var CATS = { hospedagem: "Hospedagem", alimentacao: "Onde comer", passeios: "Passeios", comercio: "Comércio", servicos: "Serviços", utilidade: "Utilidade pública" };
  var LADOS = { "sao-sebastiao": "São Sebastião", ilhabela: "Ilhabela", ambos: "Os dois lados" };
  function fotoParceiro(p) {
    if (p.foto_path) return cfg.supabaseUrl + "/storage/v1/object/public/parceiros/" + p.foto_path;
    return p.foto_url || "";
  }
  function linkParceiro(p) {
    if (p.whatsapp) return { tipo: "whatsapp", url: "https://wa.me/" + String(p.whatsapp).replace(/\D/g, "") + "?text=" + encodeURIComponent("Olá! Vi vocês no VAIDEBALSA e gostaria de informações."), rotulo: "Chamar no WhatsApp" };
    if (p.site) return { tipo: "site", url: p.site, rotulo: "Visitar site" };
    if (p.link_mapa) return { tipo: "mapa", url: p.link_mapa, rotulo: "Ver no mapa" };
    if (p.telefone) return { tipo: "telefone", url: "tel:" + String(p.telefone).replace(/[^\d+]/g, ""), rotulo: "Ligar" };
    return null;
  }
  function contarClique(id, tipo) {
    if (!cfg.supabaseUrl || !id) return;
    try {
      fetch(cfg.supabaseUrl + "/rest/v1/rpc/registrar_clique", {
        method: "POST", keepalive: true,
        headers: { apikey: cfg.supabaseAnonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ p_parceiro: id, p_tipo: tipo })
      });
    } catch (e) {}
  }
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest("a[data-parceiro]");
    if (a) contarClique(a.dataset.parceiro, a.dataset.tipo);
  });

  function cardParceiro(p) {
    var l = linkParceiro(p), foto = fotoParceiro(p);
    var tag = l ? 'a href="' + esc(l.url) + '" target="_blank" rel="noopener sponsored" data-parceiro="' + esc(p.id) + '" data-tipo="' + l.tipo + '"' : "div";
    return "<" + tag + ' class="parceiro' + (p.plano === "embaixador" ? " destaque" : "") + '">' +
      '<div class="p-foto">' + (foto ? '<img loading="lazy" src="' + esc(foto) + '" alt="' + esc(p.nome) + '">' : "") +
        '<span class="p-selo">' + (p.plano === "embaixador" ? "Parceiro embaixador" : "Parceiro") + "</span>" +
        (p.selo_inclusao ? '<span class="p-inclusao" title="Parceiro Amigo da Inclusão">🧩 Amigo da inclusão</span>' : "") + "</div>" +
      '<div class="p-info"><small>' + esc(CATS[p.categoria] || "") + " · " + esc(LADOS[p.lado] || "") + "</small><strong>" + esc(p.nome) + "</strong>" +
        (p.descricao ? "<p>" + esc(p.descricao) + "</p>" : "") +
        (p.oferta ? '<p class="p-oferta">🎁 ' + esc(p.oferta) + "</p>" : "") +
        '<em class="p-apoia">💛 Apoia o Instituto Américo</em>' +
        (l ? '<span class="p-botao">' + l.rotulo + " →</span>" : "") + "</div></" + tag.split(" ")[0] + ">";
  }
  function cardLivre() {
    var link = cfg.contatoAnuncie ? "https://wa.me/" + cfg.contatoAnuncie + "?text=" + encodeURIComponent("Olá! Quero ser parceiro do VAIDEBALSA.") : "anuncie.html";
    return '<a class="parceiro livre" href="' + esc(link) + '"><span class="pl-ic">＋</span><strong>Sua marca aqui</strong><span>Fale com quem está chegando em Ilhabela e apoie o Instituto Américo.</span><em>Quero ser parceiro →</em></a>';
  }

  var parc = document.getElementById("parceiros");
  var serv = document.getElementById("servicos");
  if ((parc || serv) && cfg.supabaseUrl) {
    fetch(cfg.supabaseUrl + "/rest/v1/parceiros?select=*&ativo=eq.true&order=ordem.asc,criado_em.asc", { headers: { apikey: cfg.supabaseAnonKey } })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (lista) {
        if (!Array.isArray(lista)) {
          // banco ainda sem a tabela de parceiros: usa os parceiros do config.js
          lista = (cfg.parceiros || []).filter(Boolean).map(function (c) {
            var w = /wa\.me\/(\d+)/.exec(c.link || "");
            return { id: null, nome: c.nome, categoria: "hospedagem", lado: "ilhabela", plano: "embaixador", ordem: 0,
                     descricao: c.texto, foto_url: c.imagem, whatsapp: w ? w[1] : "", site: w ? "" : c.link };
          });
        }
        if (parc) {
          var pagos = lista.filter(function (p) { return p.plano !== "utilidade"; })
            .sort(function (a, b) { return (b.plano === "embaixador") - (a.plano === "embaixador") || a.ordem - b.ordem; }).slice(0, 3);
          var html = pagos.map(cardParceiro);
          while (html.length < 3) html.push(cardLivre());
          parc.innerHTML = html.join("");
        }
        if (serv) {
          var uteis = lista.filter(function (p) { return p.plano === "utilidade"; });
          if (!uteis.length) return;
          var grupos = { "sao-sebastiao": [], ilhabela: [] };
          uteis.forEach(function (p) {
            if (p.lado === "ambos") { grupos["sao-sebastiao"].push(p); grupos.ilhabela.push(p); } else (grupos[p.lado] || []).push(p);
          });
          serv.querySelector(".servicos-lista").innerHTML = ["sao-sebastiao", "ilhabela"].filter(function (l) { return grupos[l].length; }).map(function (l) {
            return '<div class="serv-lado"><h3>' + LADOS[l] + "</h3><ul>" + grupos[l].map(function (p) {
              var acoes = [];
              if (p.telefone) acoes.push('<a href="tel:' + esc(String(p.telefone).replace(/[^\d+]/g, "")) + '" data-parceiro="' + esc(p.id) + '" data-tipo="telefone">📞 Ligar</a>');
              if (p.whatsapp) acoes.push('<a href="https://wa.me/' + esc(String(p.whatsapp).replace(/\D/g, "")) + '" target="_blank" rel="noopener" data-parceiro="' + esc(p.id) + '" data-tipo="whatsapp">💬 WhatsApp</a>');
              if (p.link_mapa) acoes.push('<a href="' + esc(p.link_mapa) + '" target="_blank" rel="noopener" data-parceiro="' + esc(p.id) + '" data-tipo="mapa">📍 Mapa</a>');
              return "<li><div><strong>" + esc(p.nome) + "</strong>" + (p.descricao ? "<span>" + esc(p.descricao) + "</span>" : "") +
                (p.endereco ? "<small>" + esc(p.endereco) + "</small>" : "") + '</div><div class="serv-acoes">' + acoes.join("") + "</div></li>";
            }).join("") + "</ul></div>";
          }).join("");
          serv.hidden = false;
        }
      });
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
