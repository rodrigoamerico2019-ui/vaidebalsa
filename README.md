# Vai de Balsa — vaidebalsa.com.br

Site estático com as câmeras ao vivo da balsa São Sebastião–Ilhabela.

## Onde mexer
- **Câmeras e link oficial:** `js/config.js` (só esse arquivo).
- **Horários e tarifas:** `horarios-e-tarifas.html` (trechos marcados com `PREENCHER`).
- Se criar página nova, adicione em `sitemap.xml`.

## Deploy (Render)
1. Suba esta pasta para um repositório no GitHub.
2. No Render: New > Blueprint (usa o `render.yaml`) ou New > Static Site, publish dir `.`.
3. Em Settings > Custom Domains, adicione `vaidebalsa.com.br` e `www.vaidebalsa.com.br` e aponte o DNS no registro.br.
4. No Google Search Console, verifique o domínio e envie `https://vaidebalsa.com.br/sitemap.xml`.

## Regra das câmeras
Use só feeds com autorização do dono ou players oficiais de incorporação, sempre com crédito.

## Mural ao vivo + semáforo (Supabase)
1. Crie um projeto em supabase.com (região São Paulo, `sa-east-1`).
2. SQL Editor > New query > cole `supabase/schema.sql` > Run.
3. Project Settings > API: copie **Project URL** e **anon public key** para `supabaseUrl` e `supabaseAnonKey` em `js/config.js`.
4. Suba a versão nova (`git push`). Sem esses dados o mural aparece como "em breve".
5. Teste visual sem banco: abra o site com `?demo=1`.

Ajustes:
- Coordenadas e raio dos embarques: tabela `embarques` (e o mesmo em `js/config.js`). O ponto de São Sebastião é aproximado — conferir no Google Maps.
- Posts somem do mural em 45 min; o semáforo usa os últimos 30 min; 3 denúncias escondem o post.
- Limpeza: rode `select limpar_antigos();` 1x por dia (Database > Cron, ou manualmente). Apague fotos antigas do bucket `fotos` no painel Storage.

## Modo fila (medição automática da espera)
- Rodar `supabase/002_modo_fila.sql` no SQL Editor (depois do schema.sql).
- O site mede do momento em que a pessoa toca em "Medir minha espera" (dentro da área da fila) até o celular avançar 400 m+ em direção ao outro embarque (= balsa saiu).
- Guarda só lado + horários; ao concluir, a medição é desvinculada do aparelho.

## Gráfico do dia + mapas do Waze
- Rodar `supabase/004_grafico_dia.sql` (função `espera_hoje`). Sem ela o gráfico mostra "Ainda sem dados hoje".
- Teste visual com dados fictícios: `?demo=1`.
- Mapas: embed oficial e gratuito do Waze (embed.waze.com/iframe), um por lado.

## Faixa AO VIVO + Embarque agora
- Rodar `supabase/005_avisos.sql`. Avisos: Supabase > Table Editor > `avisos` > Insert row (texto, emoji, link, fim, ativo).
- A faixa junta: seus avisos + situação de cada lado + frequência de saídas + alertas de vento/mar dos próximos 3 dias.
- "Embarque agora" usa só dados do site (esperas medidas e fotos). Sem dados = "Sem dados" + link do Waze; nunca inventa número.

## Tempo aproximado quando não há relatos
- Ordem: dado ao vivo (esperas medidas/fotos) > histórico próprio (`supabase/006_espera_tipica.sql`, 5+ medições no mesmo dia/horário nas últimas 8 semanas) > estimativa de referência (`js/estimativa.js`).
- A estimativa de referência são faixas aproximadas por dia da semana, horário, sentido, feriados e alta temporada. Ajuste os números em `js/estimativa.js` e mantenha a lista de feriados atualizada.

## Monetização e audiência (ligar quando tiver as contas)
- **Google Analytics 4**: criar propriedade em analytics.google.com → copiar o ID `G-XXXXXXXXXX` → `analytics.ga4` em `js/config.js`.
- **Google AdSense**: solicitar em adsense.google.com com o domínio vaidebalsa.com.br. Após aprovação: `anuncios.client` (`ca-pub-...`) e os IDs dos blocos `meio` e `conteudo` em `js/config.js`; criar `ads.txt` na raiz com a linha que o AdSense fornecer.
- Nada de terceiros carrega antes do "Aceitar" no aviso de cookies (`js/consentimento.js`). Sem IDs configurados, o aviso nem aparece.
- Espaços de anúncio: `data-anuncio="meio"` (início, entre mural e previsão) e `data-anuncio="conteudo"` (fim das páginas de guia).
- Widget para parceiros: `widget.html` (código em anuncie.html#widget) — gera links de volta para o site.
