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
