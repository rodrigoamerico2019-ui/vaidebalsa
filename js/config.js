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
  supabaseUrl: "https://ktuugoebvsvtvccynexc.supabase.co",
  supabaseAnonKey: "sb_publishable_1lfypxwF3OeZjd2BafYa9g_BIhrwHIC",

  // Embarques (mesmos valores da tabela "embarques" no Supabase) — usados para sugerir o lado
  embarques: {
    "sao-sebastiao": { lat: -23.8075, lon: -45.4005, raio: 2000 },
    "ilhabela":      { lat: -23.8202, lon: -45.3762, raio: 2000 }
  },

  // Parceiros (até 3, aparecem logo abaixo do semáforo). null = espaço livre.
  parceiros: [
    {
      nome: "Emirados Pousada de Charme",
      categoria: "Hospedagem em Ilhabela",
      texto: "Charme, hospitalidade e alma. Chegou na ilha? Fale direto com a recepção.",
      imagem: "img/parceiros/emirados.webp",
      link: "https://wa.me/5524988541645?text=" + encodeURIComponent("Olá! Vi a pousada no VAIDEBALSA e gostaria de informações."),
      botao: "Chamar no WhatsApp"
    },
    null,
    null
  ],
  // Mascote / apresentador (nome opcional; instagram sem @, vazio = "em breve")
  mascote: { nome: "", imagem: "img/mascote.webp", instagram: "vaidebalsa" },

  // Medição de audiência (Google Analytics 4): ex. "G-XXXXXXXXXX". Vazio = desligado.
  analytics: { ga4: "G-WJ56XKYKMT" },
  // Google AdSense: client "ca-pub-XXXXXXXXXXXXXXXX" e o ID de cada bloco. Vazio = desligado.
  anuncios: { client: "ca-pub-1329569080847479", slots: { meio: "", conteudo: "" } },

  // Contato para quem quer anunciar (WhatsApp com DDI, ex.: "5512999999999"). Vazio = sem botão.
  contatoAnuncie: "",

  // Hora Marcada: sistema oficial de agendamento (conferido em 20/11/2026)
  linkEsperaOficial: "https://acquavias.com.br/",   // espera oficial publicada pela operadora
  linkOficial: "https://horamarcada.dh.sp.gov.br/ViaDigital/",

  // player público oficial da AcquaVias (o mesmo do site deles); carrega só quando a pessoa toca
  cameras: [
    { id: "ss-1", lado: "sao-sebastiao", nome: "São Sebastião · Câmera 1", tipo: "iframe", url: "https://acquastream.i9ia.io/turismo/camera.html?f=saosebastiao5", credito: "AcquaVias", creditoUrl: "https://acquavias.com.br/sao-sebastiao-ilhabela/" },
    { id: "ss-2", lado: "sao-sebastiao", nome: "São Sebastião · Câmera 2", tipo: "iframe", url: "https://acquastream.i9ia.io/turismo/camera.html?f=saosebastiao2", credito: "AcquaVias", creditoUrl: "https://acquavias.com.br/sao-sebastiao-ilhabela/" },
    { id: "ss-3", lado: "sao-sebastiao", nome: "São Sebastião · Câmera 3", tipo: "iframe", url: "https://acquastream.i9ia.io/turismo/camera.html?f=saosebastiao", credito: "AcquaVias", creditoUrl: "https://acquavias.com.br/sao-sebastiao-ilhabela/" },
    { id: "ib-1", lado: "ilhabela", nome: "Ilhabela · Câmera 1", tipo: "iframe", url: "https://acquastream.i9ia.io/turismo/camera.html?f=ilhabela", credito: "AcquaVias", creditoUrl: "https://acquavias.com.br/sao-sebastiao-ilhabela/" },
    { id: "ib-2", lado: "ilhabela", nome: "Ilhabela · Câmera 2", tipo: "iframe", url: "https://acquastream.i9ia.io/turismo/camera.html?f=ilhabela2", credito: "AcquaVias", creditoUrl: "https://acquavias.com.br/sao-sebastiao-ilhabela/" },
    { id: "ib-3", lado: "ilhabela", nome: "Ilhabela · Câmera 3", tipo: "iframe", url: "https://acquastream.i9ia.io/turismo/camera.html?f=ilhabela3", credito: "AcquaVias", creditoUrl: "https://acquavias.com.br/sao-sebastiao-ilhabela/" },
    { id: "ib-4", lado: "ilhabela", nome: "Ilhabela · Câmera 4", tipo: "iframe", url: "https://acquastream.i9ia.io/turismo/camera.html?f=ilhabela4", credito: "AcquaVias", creditoUrl: "https://acquavias.com.br/sao-sebastiao-ilhabela/" }
  ]
};
