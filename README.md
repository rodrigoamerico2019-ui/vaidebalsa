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
