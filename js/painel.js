/* VAIDEBALSA — painel de controle (parceiros, serviços úteis, avisos, mural, relatório) */
(function () {
  var cfg = window.VAIDEBALSA || {};
  var db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true } });
  var $ = function (s) { return document.querySelector(s); };
  var CATS = { hospedagem: "Hospedagem", alimentacao: "Onde comer", passeios: "Passeios", comercio: "Comércio", servicos: "Serviços", utilidade: "Utilidade pública" };
  var LADOS = { "sao-sebastiao": "São Sebastião", ilhabela: "Ilhabela", ambos: "Os dois lados" };
  var PLANOS = { apoiador: "Apoiador", embaixador: "Embaixador", utilidade: "Serviço útil" };
  var parceiros = [];

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function msg(el, texto, tipo) { el.textContent = texto || ""; el.className = "msg " + (tipo || ""); }
  function mostrar(id) { ["tela-login", "tela-sem", "tela-painel"].forEach(function (t) { document.getElementById(t).hidden = t !== id; }); $("#sair").hidden = id === "tela-login"; }
  function foto(p) { return p.foto_path ? cfg.supabaseUrl + "/storage/v1/object/public/parceiros/" + p.foto_path : (p.foto_url || ""); }

  // ---------- login ----------
  function iniciar() {
    db.auth.getSession().then(function (r) {
      if (!r.data.session) return mostrar("tela-login");
      db.rpc("eh_admin").then(function (a) {
        if (a.error || !a.data) return mostrar("tela-sem");
        mostrar("tela-painel"); carregarParceiros();
      });
    });
  }
  $("#form-login").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = new FormData(e.target), b = e.target.querySelector("button");
    b.disabled = true; msg($("#msg-login"), "Entrando…");
    db.auth.signInWithPassword({ email: f.get("email"), password: f.get("senha") }).then(function (r) {
      b.disabled = false;
      if (r.error) return msg($("#msg-login"), "E-mail ou senha incorretos.", "erro");
      msg($("#msg-login"), ""); iniciar();
    });
  });
  $("#sair").addEventListener("click", function () { db.auth.signOut().then(function () { mostrar("tela-login"); }); });

  // ---------- abas ----------
  document.querySelectorAll(".abas button").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".abas button").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      document.querySelectorAll("[data-painel]").forEach(function (p) { p.hidden = p.dataset.painel !== b.dataset.aba; });
      ({ parceiros: carregarParceiros, utilidade: carregarParceiros, avisos: carregarAvisos, mural: carregarMural, relatorio: carregarRelatorio })[b.dataset.aba]();
    });
  });
  document.querySelectorAll("dialog [data-fechar]").forEach(function (b) { b.addEventListener("click", function () { b.closest("dialog").close(); }); });

  // ---------- parceiros e serviços úteis ----------
  function carregarParceiros() {
    db.from("parceiros").select("*").order("ordem").order("criado_em").then(function (r) {
      if (r.error) { $("#lista-parceiros").innerHTML = '<div class="vazio-pn">Erro ao carregar: ' + esc(r.error.message) + "</div>"; return; }
      parceiros = r.data;
      desenharLista("#lista-parceiros", parceiros.filter(function (p) { return p.plano !== "utilidade"; }), "Nenhum parceiro ainda. Clique em “+ Novo parceiro”.");
      desenharLista("#lista-utilidade", parceiros.filter(function (p) { return p.plano === "utilidade"; }), "Nenhum serviço útil ainda. Clique em “+ Novo serviço”.");
    });
  }
  function desenharLista(sel, lista, vazio) {
    $(sel).innerHTML = lista.length ? lista.map(function (p) {
      var f = foto(p);
      return '<div class="item' + (p.ativo ? "" : " inativo") + '">' + (f ? '<img src="' + esc(f) + '" alt="">' : '<img alt="">') +
        '<div class="txt"><strong>' + esc(p.nome) + "</strong>" +
        '<span class="chip ' + esc(p.plano) + '">' + esc(PLANOS[p.plano]) + '</span><span class="chip">' + esc(CATS[p.categoria]) + '</span><span class="chip">' + esc(LADOS[p.lado]) + "</span>" +
        (p.selo_inclusao ? '<span class="chip">🧩 Inclusão</span>' : "") + (p.ativo ? "" : '<span class="chip oculto">Pausado</span>') +
        "<br><small>" + esc(p.descricao || "") + "</small></div>" +
        '<div class="acoes"><button class="btn sec" data-editar="' + p.id + '">Editar</button>' +
        '<button class="btn sec" data-pausar="' + p.id + '">' + (p.ativo ? "Pausar" : "Ativar") + "</button>" +
        '<button class="btn perigo" data-excluir="' + p.id + '">Excluir</button></div></div>';
    }).join("") : '<div class="vazio-pn">' + vazio + "</div>";
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.novo) abrirParceiro(null, b.dataset.novo);
    if (b.dataset.editar) abrirParceiro(parceiros.find(function (p) { return p.id === b.dataset.editar; }));
    if (b.dataset.pausar) {
      var p = parceiros.find(function (x) { return x.id === b.dataset.pausar; });
      db.from("parceiros").update({ ativo: !p.ativo }).eq("id", p.id).then(carregarParceiros);
    }
    if (b.dataset.excluir) {
      var q = parceiros.find(function (x) { return x.id === b.dataset.excluir; });
      if (!confirm("Excluir “" + q.nome + "” de vez? (Para tirar do site só por um tempo, use Pausar.)")) return;
      db.from("parceiros").delete().eq("id", q.id).then(function () {
        if (q.foto_path) db.storage.from("parceiros").remove([q.foto_path]);
        carregarParceiros();
      });
    }
  });

  var fotoNova = null;
  function abrirParceiro(p, planoNovo) {
    var f = $("#form-parceiro"); f.reset(); fotoNova = null;
    $("#previa-parceiro").style.display = "none";
    $("#tit-parceiro").textContent = p ? "Editar: " + p.nome : (planoNovo === "utilidade" ? "Novo serviço útil" : "Novo parceiro");
    var d = p || { plano: planoNovo || "apoiador", categoria: planoNovo === "utilidade" ? "utilidade" : "hospedagem", lado: "ilhabela", ordem: 0, ativo: true };
    ["id", "nome", "plano", "categoria", "lado", "ordem", "descricao", "oferta", "whatsapp", "telefone", "endereco", "link_mapa", "site"].forEach(function (k) {
      if (f.elements[k]) f.elements[k].value = d[k] == null ? "" : d[k];
    });
    f.elements.selo_inclusao.checked = !!d.selo_inclusao;
    f.elements.ativo.checked = d.ativo !== false;
    var atual = p ? foto(p) : "";
    if (atual) { $("#previa-parceiro").src = atual; $("#previa-parceiro").style.display = "block"; }
    msg($("#msg-parceiro"), "");
    $("#dlg-parceiro").showModal();
  }
  $("#form-parceiro").elements.foto.addEventListener("change", function (e) {
    var arq = e.target.files && e.target.files[0]; if (!arq) return;
    reduzir(arq).then(function (b) { fotoNova = b; $("#previa-parceiro").src = URL.createObjectURL(b); $("#previa-parceiro").style.display = "block"; })
      .catch(function () { msg($("#msg-parceiro"), "Não consegui ler essa imagem.", "erro"); });
  });
  function reduzir(arq) {
    return createImageBitmap(arq).then(function (img) {
      var e = Math.min(1, 1000 / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * e); c.height = Math.round(img.height * e);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return new Promise(function (ok, erro) { c.toBlob(function (b) { b ? ok(b) : erro(); }, "image/webp", 0.82); });
    });
  }
  function urlOk(v) { return !v || /^https:\/\//.test(v); }
  $("#form-parceiro").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = e.target, el = f.elements, b = f.querySelector('button[type="submit"]');
    var dados = {
      nome: el.nome.value.trim(), plano: el.plano.value, categoria: el.categoria.value, lado: el.lado.value,
      ordem: parseInt(el.ordem.value, 10) || 0, descricao: el.descricao.value.trim() || null, oferta: el.oferta.value.trim() || null,
      whatsapp: el.whatsapp.value.replace(/\D/g, "") || null, telefone: el.telefone.value.trim() || null, endereco: el.endereco.value.trim() || null,
      link_mapa: el.link_mapa.value.trim() || null, site: el.site.value.trim() || null,
      selo_inclusao: el.selo_inclusao.checked, ativo: el.ativo.checked
    };
    if (!dados.nome) return msg($("#msg-parceiro"), "Coloque o nome.", "erro");
    if (!urlOk(dados.link_mapa) || !urlOk(dados.site)) return msg($("#msg-parceiro"), "Links precisam começar com https://", "erro");
    if (dados.whatsapp && dados.whatsapp.length < 12) return msg($("#msg-parceiro"), "WhatsApp com DDI e DDD, ex.: 5512999999999", "erro");
    b.disabled = true; msg($("#msg-parceiro"), "Salvando…");
    var envio = Promise.resolve();
    if (fotoNova) {
      var nome = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + ".webp";
      envio = db.storage.from("parceiros").upload(nome, fotoNova, { contentType: "image/webp" }).then(function (r) {
        if (r.error) throw r.error;
        dados.foto_path = nome; dados.foto_url = null;
      });
    }
    envio.then(function () {
      return el.id.value ? db.from("parceiros").update(dados).eq("id", el.id.value) : db.from("parceiros").insert(dados);
    }).then(function (r) {
      if (r && r.error) throw r.error;
      $("#dlg-parceiro").close(); carregarParceiros();
    }).catch(function (err) {
      msg($("#msg-parceiro"), "Erro ao salvar: " + (err && err.message || "tente de novo"), "erro");
    }).then(function () { b.disabled = false; });
  });

  // ---------- avisos ----------
  function carregarAvisos() {
    db.from("avisos").select("*").order("criado_em", { ascending: false }).limit(50).then(function (r) {
      if (r.error) { $("#lista-avisos").innerHTML = '<div class="vazio-pn">Erro: ' + esc(r.error.message) + "</div>"; return; }
      var agora = Date.now();
      $("#lista-avisos").innerHTML = r.data.length ? r.data.map(function (a) {
        var fim = a.fim ? new Date(a.fim) : new Date(new Date(a.inicio).getTime() + 3 * 864e5);
        var vigente = a.ativo && fim.getTime() > agora;
        return '<div class="item' + (vigente ? "" : " inativo") + '"><div class="txt"><strong>' + esc((a.emoji || "📢") + " " + a.texto) + "</strong>" +
          "<small>Até " + fim.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) + (a.link ? " · " + esc(a.link) : "") + "</small>" +
          (vigente ? "" : ' <span class="chip oculto">Fora do ar</span>') + "</div>" +
          '<div class="acoes"><button class="btn sec" data-aviso-ativo="' + a.id + '" data-v="' + (!a.ativo) + '">' + (a.ativo ? "Tirar do ar" : "Reativar") + "</button>" +
          '<button class="btn perigo" data-aviso-excluir="' + a.id + '">Excluir</button></div></div>';
      }).join("") : '<div class="vazio-pn">Nenhum aviso. Clique em “+ Novo aviso”.</div>';
    });
  }
  $("#novo-aviso").addEventListener("click", function () { $("#form-aviso").reset(); msg($("#msg-aviso"), ""); $("#dlg-aviso").showModal(); });
  $("#form-aviso").addEventListener("submit", function (e) {
    e.preventDefault();
    var el = e.target.elements, link = el.link.value.trim();
    if (link && !/^https:\/\//.test(link)) return msg($("#msg-aviso"), "O link precisa começar com https://", "erro");
    db.from("avisos").insert({ texto: el.texto.value.trim(), emoji: el.emoji.value.trim() || null, link: link || null,
      fim: el.fim.value ? new Date(el.fim.value).toISOString() : null })
      .then(function (r) { if (r.error) return msg($("#msg-aviso"), "Erro: " + r.error.message, "erro"); $("#dlg-aviso").close(); carregarAvisos(); });
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    if (b.dataset.avisoAtivo) db.from("avisos").update({ ativo: b.dataset.v === "true" }).eq("id", b.dataset.avisoAtivo).then(carregarAvisos);
    if (b.dataset.avisoExcluir && confirm("Excluir este aviso?")) db.from("avisos").delete().eq("id", b.dataset.avisoExcluir).then(carregarAvisos);
  });

  // ---------- mural (moderação) ----------
  var ESPERA = { verde: "🟢 menos de 20 min", amarelo: "🟡 20–60 min", vermelho: "🔴 mais de 1 h" };
  function carregarMural() {
    var desde = new Date(Date.now() - 7 * 864e5).toISOString();
    db.from("posts").select("id,lado,espera,texto,foto_path,denuncias,oculto,criado_em").gte("criado_em", desde).order("criado_em", { ascending: false }).limit(100).then(function (r) {
      if (r.error) { $("#lista-mural").innerHTML = '<div class="vazio-pn">Erro: ' + esc(r.error.message) + "</div>"; return; }
      $("#lista-mural").innerHTML = r.data.length ? r.data.map(function (p) {
        var f = p.foto_path ? cfg.supabaseUrl + "/storage/v1/object/public/fotos/" + p.foto_path : "";
        return '<div class="item' + (p.oculto ? " inativo" : "") + '">' + (f ? '<a href="' + esc(f) + '" target="_blank" rel="noopener"><img src="' + esc(f) + '" alt=""></a>' : '<img alt="">') +
          '<div class="txt"><strong>' + esc(LADOS[p.lado]) + " · " + esc(ESPERA[p.espera]) + "</strong><small>" +
          new Date(p.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) + (p.texto ? " · “" + esc(p.texto) + "”" : "") + "</small>" +
          (p.denuncias ? ' <span class="chip oculto">⚑ ' + p.denuncias + " denúncia(s)</span>" : "") + (p.oculto ? ' <span class="chip oculto">Escondido</span>' : "") + "</div>" +
          '<div class="acoes"><button class="btn ' + (p.oculto ? "sec" : "perigo") + '" data-post="' + p.id + '" data-oculto="' + (!p.oculto) + '">' + (p.oculto ? "Mostrar" : "Esconder") + "</button></div></div>";
      }).join("") : '<div class="vazio-pn">Nenhum post nos últimos 7 dias.</div>';
    });
  }
  $("#recarregar-mural").addEventListener("click", carregarMural);
  document.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-post]"); if (!b) return;
    db.from("posts").update({ oculto: b.dataset.oculto === "true" }).eq("id", b.dataset.post).then(carregarMural);
  });

  // ---------- relatório de cliques ----------
  function carregarRelatorio() {
    db.rpc("relatorio_cliques", { p_dias: parseInt($("#rel-dias").value, 10) }).then(function (r) {
      if (r.error) { $("#relatorio").innerHTML = '<div class="vazio-pn">Erro: ' + esc(r.error.message) + "</div>"; return; }
      $("#relatorio").innerHTML = r.data.length ? '<div style="overflow-x:auto"><table class="rel"><thead><tr><th>Parceiro</th><th>WhatsApp</th><th>Telefone</th><th>Mapa</th><th>Site</th><th>Total</th></tr></thead><tbody>' +
        r.data.map(function (l) { return "<tr><td>" + esc(l.nome) + ' <span class="chip ' + esc(l.plano) + '">' + esc(PLANOS[l.plano]) + "</span></td><td>" + l.whatsapp + "</td><td>" + l.telefone + "</td><td>" + l.mapa + "</td><td>" + l.site + "</td><td>" + l.total + "</td></tr>"; }).join("") +
        "</tbody></table></div>" : '<div class="vazio-pn">Nenhum parceiro cadastrado.</div>';
    });
  }
  $("#rel-dias").addEventListener("change", carregarRelatorio);

  iniciar();
})();
