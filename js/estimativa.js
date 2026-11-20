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
  // [mín, máx] em minutos
  var UTIL = { madrugada: [10, 60], manha: [15, 30], dia: [20, 40], tarde: [20, 45], noite: [20, 40], "tarde-noite": [10, 30] };
  var TABELA = {
    util: { "sao-sebastiao": UTIL, ilhabela: UTIL },
    ida: {
      "sao-sebastiao": { madrugada: [10, 60], manha: [20, 40], dia: [30, 60], tarde: [45, 90], noite: [60, 120], "tarde-noite": [30, 60] },
      ilhabela: UTIL
    },
    sabado: {
      "sao-sebastiao": { madrugada: [10, 60], manha: [45, 90], dia: [30, 60], tarde: [20, 45], noite: [20, 40], "tarde-noite": [10, 30] },
      ilhabela: { madrugada: [10, 60], manha: [15, 30], dia: [20, 40], tarde: [30, 60], noite: [20, 45], "tarde-noite": [10, 30] }
    },
    "folga-meio": {
      "sao-sebastiao": { madrugada: [10, 60], manha: [30, 60], dia: [30, 60], tarde: [20, 45], noite: [20, 40], "tarde-noite": [10, 30] },
      ilhabela: { madrugada: [10, 60], manha: [15, 30], dia: [20, 45], tarde: [30, 60], noite: [30, 60], "tarde-noite": [15, 30] }
    },
    volta: {
      "sao-sebastiao": { madrugada: [10, 60], manha: [30, 60], dia: [20, 45], tarde: [20, 40], noite: [15, 30], "tarde-noite": [10, 30] },
      ilhabela: { madrugada: [10, 60], manha: [20, 45], dia: [45, 90], tarde: [60, 150], noite: [45, 90], "tarde-noite": [20, 45] }
    }
  };
  var NOMES_TIPO = { util: "dia útil", ida: "véspera de folga", sabado: "início de folga", "folga-meio": "dia de folga", volta: "último dia de folga" };

  function arred(v) { return Math.round(v / 5) * 5; }
  function texto(m) {
    if (m < 60) return m + " min";
    var h = Math.floor(m / 60), r = m % 60;
    return h + "h" + (r ? String(r).padStart(2, "0") : "");
  }

  window.VDB_ESTIMATIVA = function (lado, quando) {
    var d = quando ? new Date(quando) : new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    var tipo = tipoDia(d), per = periodo(d.getHours());
    var faixa = TABELA[tipo][lado][per].slice();
    var alta = altaTemporada(d);
    if (alta) faixa = [arred(faixa[0] * 1.5), arred(faixa[1] * 1.5)];
    var rotulo = per === "madrugada"
      ? "saídas de hora em hora"
      : (faixa[1] < 60 ? faixa[0] + "–" + faixa[1] + " min" : texto(faixa[0]) + "–" + texto(faixa[1]));
    return {
      min: faixa[0], max: faixa[1], texto: rotulo,
      contexto: NOMES_TIPO[tipo] + (alta ? ", alta temporada" : ""),
      nivel: faixa[1] <= 30 ? "verde" : faixa[0] >= 45 ? "vermelho" : "amarelo"
    };
  };
})();
