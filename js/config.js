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
  linkOficial: "",

  cameras: [
    { id: "ss-fila",     lado: "sao-sebastiao", nome: "Fila de embarque — São Sebastião", tipo: "youtube", url: "", credito: "", creditoUrl: "" },
    { id: "ss-atracadouro", lado: "sao-sebastiao", nome: "Atracadouro — São Sebastião",   tipo: "youtube", url: "", credito: "", creditoUrl: "" },
    { id: "ib-fila",     lado: "ilhabela",      nome: "Fila de embarque — Ilhabela",      tipo: "youtube", url: "", credito: "", creditoUrl: "" },
    { id: "ib-atracadouro", lado: "ilhabela",   nome: "Atracadouro — Ilhabela",           tipo: "youtube", url: "", credito: "", creditoUrl: "" },
    { id: "canal",       lado: "canal",         nome: "Canal de São Sebastião",           tipo: "youtube", url: "", credito: "", creditoUrl: "" }
  ]
};
