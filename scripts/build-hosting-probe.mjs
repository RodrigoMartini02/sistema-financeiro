import { mkdir, writeFile } from 'node:fs/promises';

const outputDirectory = new URL('../dist/probe/__tenders_probe/', import.meta.url);

const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <base href="/__tenders_probe/" />
    <title>Prova de hospedagem · Licitações 4A</title>
    <link rel="stylesheet" href="./probe.css" />
    <script type="module" src="./probe.js"></script>
  </head>
  <body>
    <main>
      <p class="label">tenders-hosting-probe-v1</p>
      <h1>Prova isolada de hospedagem</h1>
      <p id="script-status" role="status">HTML carregado. Aguardando JavaScript e CSS.</p>
      <dl>
        <dt>Origem da página</dt><dd id="page-origin">Aguardando JavaScript</dd>
        <dt>Caminho da página</dt><dd id="page-path">Aguardando JavaScript</dd>
        <dt>Query recebida</dt><dd id="page-query">Aguardando JavaScript</dd>
        <dt>Base dos links relativos</dt><dd id="page-base">Aguardando JavaScript</dd>
        <dt>URL do JavaScript</dt><dd id="script-url">Aguardando JavaScript</dd>
        <dt>Origem principal preservada</dt><dd id="main-origin">Aguardando JavaScript</dd>
        <dt>Asset SVG</dt><dd id="image-status">Aguardando imagem</dd>
      </dl>
      <img id="probe-image" src="./assets/marker.svg" alt="Marcador da prova 4A" width="180" height="64" />
      <nav aria-label="Rotas da prova">
        <a href="/__tenders_probe?case=exact&amp;value=a%20b">Caminho exato sem barra</a>
        <a href="./?case=slash&amp;value=a%20b">Raiz com barra</a>
        <a href="./deep/route?case=relative&amp;value=a%20b">Link relativo para rota profunda</a>
        <a href="/__tenders_probe/deep/route?case=absolute&amp;value=a%20b">Rota profunda absoluta</a>
      </nav>
      <p>A prova usa somente arquivos estáticos. Não acessa APIs, sessões ou banco.</p>
    </main>
  </body>
</html>
`;

const javascript = `const details = {
  'page-origin': window.location.origin,
  'page-path': window.location.pathname,
  'page-query': window.location.search || '(sem query)',
  'page-base': document.baseURI,
  'script-url': import.meta.url,
  'main-origin': window.location.origin === 'https://fin-gerence.com.br' ? 'Sim' : 'Não (prévia local ou site de prova direto)',
};

for (const [id, value] of Object.entries(details)) {
  document.getElementById(id).textContent = value;
}

const cssLoaded = getComputedStyle(document.documentElement).getPropertyValue('--hosting-probe').trim() === 'loaded';
document.getElementById('script-status').textContent = cssLoaded
  ? 'HTML, JavaScript e CSS da prova carregados.'
  : 'JavaScript carregado; o CSS da prova não foi encontrado.';

const image = document.getElementById('probe-image');
const imageStatus = document.getElementById('image-status');
image.addEventListener('load', () => { imageStatus.textContent = 'Carregado'; });
image.addEventListener('error', () => { imageStatus.textContent = 'Falha no carregamento'; });
if (image.complete) {
  imageStatus.textContent = image.naturalWidth > 0 ? 'Carregado' : 'Falha no carregamento';
}
`;

const css = `:root {
  --hosting-probe: loaded;
  color-scheme: light;
  font-family: system-ui, sans-serif;
  color: #102d37;
  background: #edf6f7;
}
body { margin: 0; padding: 24px; }
main { max-width: 780px; margin: 0 auto; padding: 28px; background: white; border: 1px solid #bad7dc; border-radius: 16px; }
h1 { font-size: 1.6rem; }
.label { color: #147486; font-weight: 700; }
dl { display: grid; grid-template-columns: minmax(130px, 1fr) minmax(0, 2fr); gap: 12px; }
dt { font-weight: 600; }
dd { margin: 0; overflow-wrap: anywhere; }
nav { display: grid; gap: 12px; margin: 24px 0; }
a { color: #075b83; }
@media (max-width: 540px) {
  body { padding: 12px; }
  main { padding: 20px; }
  dl { grid-template-columns: minmax(0, 1fr); gap: 6px; }
  dd { margin-bottom: 10px; }
}
`;

const marker = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="64" viewBox="0 0 180 64">
  <rect width="180" height="64" rx="12" fill="#0b667a" />
  <text x="90" y="39" text-anchor="middle" font-family="sans-serif" font-size="22" fill="white">PROVA 4A</text>
</svg>
`;

await mkdir(new URL('assets/', outputDirectory), { recursive: true });
await Promise.all([
  writeFile(new URL('index.html', outputDirectory), html, 'utf8'),
  writeFile(new URL('probe.js', outputDirectory), javascript, 'utf8'),
  writeFile(new URL('probe.css', outputDirectory), css, 'utf8'),
  writeFile(new URL('assets/marker.svg', outputDirectory), marker, 'utf8'),
]);

console.log('Hosting proof written to dist/probe/__tenders_probe/');
