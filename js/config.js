/*
 * CONFIGURAÇÃO DO SITE — edite só este arquivo para trocar câmeras e links.
 *
 * Cada câmera:
 *   tipo: "youtube"  -> url = ID do vídeo/live do YouTube (ex.: "dQw4w9WgXcQ")
 *         "iframe"   -> url = link de player oficial que permite incorporação
 *         "imagem"   -> url = link de uma imagem que se atualiza (snapshot); recarrega a cada 30s
 *   url vazia ("")  -> aparece "Câmera em breve"
 *
 * IMPORTANTE: só use feeds com autorização do dono ou players oficiais de incorporação.
 */
window.VAIDEBALSA = {
  // Link do site/agendamento oficial da travessia (preencher com o endereço oficial atual)
  // Mural ao vivo (Supabase). Preencha com Project URL e anon key do projeto.
  // Enquanto vazio, o mural aparece como "em breve". Teste visual: abra o site com ?demo=1
  supabaseUrl: "",
  supabaseAnonKey: "",

  // Embarques (mesmos valores da tabela "embarques" no Supabase) — usados para sugerir o lado
  embarques: {
    "sao-sebastiao": { lat: -23.8075, lon: -45.4005, raio: 2000 },
    "ilhabela":      { lat: -23.8202, lon: -45.3762, raio: 2000 }
  },

  // Hora Marcada: sistema oficial de agendamento (conferido em 20/11/2026)
  linkOficial: "https://horamarcada.dh.sp.gov.br/ViaDigital/",

  cameras: [
    { id: "ss-fila",     lado: "sao-sebastiao", nome: "Fila de embarque — São Sebastião", tipo: "youtube", url: "", credito: "", creditoUrl: "" },
    { id: "ss-atracadouro", lado: "sao-sebastiao", nome: "Atracadouro — São Sebastião",   tipo: "youtube", url: "", credito: "", creditoUrl: "" },
    { id: "ib-fila",     lado: "ilhabela",      nome: "Fila de embarque — Ilhabela",      tipo: "youtube", url: "", credito: "", creditoUrl: "" },
    { id: "ib-atracadouro", lado: "ilhabela",   nome: "Atracadouro — Ilhabela",           tipo: "youtube", url: "", credito: "", creditoUrl: "" },
    { id: "canal",       lado: "canal",         nome: "Canal de São Sebastião",           tipo: "youtube", url: "", credito: "", creditoUrl: "" }
  ]
};
