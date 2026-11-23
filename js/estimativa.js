/* VAIDEBALSA — estimativa de referência da espera quando NÃO há relatos/medições.
   Faixas aproximadas por dia da semana, horário e sentido (ida de SS na sexta, volta de Ilhabela no domingo),
   com ajuste de feriados e alta temporada. São uma referência inicial: o site troca automaticamente
   pelo histórico real (esperas medidas) quando houver dados suficientes. Ajuste aqui se necessário. */
(function () {
  // Feriados nacionais (AAAA-MM-DD)
  var FERIADOS = [
    "2026-11-20", "2026-12-25",
    "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-26", "2027-04-21", "2027-05-01",
    "2027-05-27", "2027-09-07", "2027-10-12", "2027-11-02", "2027-11-15", "2027-11-20", "2027-12-25"
  ];
  // Alta temporada: festas de fim de ano, janeiro e semana do Carnaval
  function altaTemporada(d) {
    var m = d.getMonth() + 1, dia = d.getDate(), iso = fmt(d);
    return (m === 12 && dia >= 20) || m === 1 || (iso >= "2027-02-05" && iso <= "2027-02-10");
  }
  function fmt(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function folga(d) { var w = d.getDay(); return w === 0 || w === 6 || FERIADOS.indexOf(fmt(d)) > -1; }
  function somaDias(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }

  // tipo do dia: "util", "ida" (véspera de folga: movimento de ida p/ Ilhabela),
  // "sabado", "volta" (último dia de folga: retorno de Ilhabela), "folga-meio"
  function tipoDia(d) {
    var hoje = folga(d), amanha = folga(somaDias(d, 1)), ontem = folga(somaDias(d, -1));
    if (!hoje && amanha) return "ida";
    if (hoje && !amanha) return "volta";
    if (hoje && !ontem) return "sabado";       // primeiro dia de folga
    if (hoje) return "folga-meio";
    return "util";
  }
  function periodo(h) {
    if (h < 6) return "madrugada";
    if (h < 10) return "manha";
    if (h < 14) return "dia";
    if (h < 18) return "tarde";
    if (h < 22) return "noite";
    return "tarde-noite";
  }
  // [mín, máx] em minutos — calibrado em 23/11/2026 com a espera oficial publicada pela AcquaVias
  // (dia útil: São Sebastião ~30 min, Ilhabela ~60 min). O lado de Ilhabela costuma esperar mais.
  var UTIL_SS = { madrugada: [20, 50], manha: [20, 40], dia: [25, 40], tarde: [25, 45], noite: [20, 40], "tarde-noite": [15, 30] };
  var UTIL_IB = { madrugada: [20, 50], manha: [45, 70], dia: [45, 75], tarde: [45, 75], noite: [30, 60], "tarde-noite": [20, 40] };
  var TABELA = {
    util: { "sao-sebastiao": UTIL_SS, ilhabela: UTIL_IB },
    ida: {
      "sao-sebastiao": { madrugada: [20, 50], manha: [25, 45], dia: [40, 70], tarde: [60, 100], noite: [70, 120], "tarde-noite": [40, 70] },
      ilhabela: UTIL_IB
    },
    sabado: {
      "sao-sebastiao": { madrugada: [20, 50], manha: [60, 100], dia: [45, 75], tarde: [30, 50], noite: [25, 45], "tarde-noite": [15, 30] },
      ilhabela: { madrugada: [20, 50], manha: [30, 50], dia: [40, 60], tarde: [45, 75], noite: [40, 60], "tarde-noite": [20, 40] }
    },
    "folga-meio": {
      "sao-sebastiao": { madrugada: [20, 50], manha: [40, 70], dia: [40, 60], tarde: [30, 50], noite: [25, 45], "tarde-noite": [15, 30] },
      ilhabela: { madrugada: [20, 50], manha: [30, 50], dia: [45, 75], tarde: [50, 80], noite: [45, 75], "tarde-noite": [25, 45] }
    },
    volta: {
      "sao-sebastiao": { madrugada: [20, 50], manha: [30, 50], dia: [25, 45], tarde: [25, 40], noite: [20, 35], "tarde-noite": [15, 30] },
      ilhabela: { madrugada: [20, 50], manha: [45, 75], dia: [60, 100], tarde: [90, 150], noite: [60, 100], "tarde-noite": [30, 60] }
    }
  };
  var NOMES_TIPO = { util: "dia útil", ida: "véspera de folga", sabado: "início de folga", "folga-meio": "dia de folga", volta: "último dia de folga" };

  function arred(v) { return Math.round(v / 5) * 5; }
  function texto(m) {
    if (m < 60) return m + " min";
    var h = Math.floor(m / 60), r = m % 60;
    return h + "h" + (r ? String(r).padStart(2, "0") : "");
  }

  function faixaEm(lado, d, h) {
    var x = new Date(d); x.setHours(h, 30, 0, 0);
    var f = TABELA[tipoDia(x)][lado][periodo(h)].slice();
    if (altaTemporada(x)) f = [arred(f[0] * 1.5), arred(f[1] * 1.5)];
    return f;
  }
  // valor único (o mesmo em todo o site): ponto médio da faixa, suavizado com as horas vizinhas
  // para não dar "degraus" na troca de período (a madrugada não se mistura com o resto do dia)
  function valorEm(lado, d, h) {
    var lo = h < 6 ? 0 : 6, hi = h < 6 ? 5 : 23;
    function m(hh) { var f = faixaEm(lado, d, hh); return (f[0] + f[1]) / 2; }
    return Math.max(5, arred((m(Math.max(lo, h - 1)) + 2 * m(h) + m(Math.min(hi, h + 1))) / 4));
  }

  window.VDB_ESTIMATIVA = function (lado, quando) {
    var d = quando ? new Date(quando) : new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    var h = d.getHours(), tipo = tipoDia(d), per = periodo(h);
    var faixa = faixaEm(lado, d, h), valor = valorEm(lado, d, h);
    var alta = altaTemporada(d);
    return {
      min: faixa[0], max: faixa[1], valor: valor,
      texto: "≈ " + texto(valor),
      faixa: faixa[1] < 60 ? faixa[0] + "–" + faixa[1] + " min" : texto(faixa[0]) + "–" + texto(faixa[1]),
      madrugada: per === "madrugada",
      contexto: NOMES_TIPO[tipo] + (alta ? ", alta temporada" : ""),
      nivel: valor < 20 ? "verde" : valor > 60 ? "vermelho" : "amarelo"
    };
  };
})();
