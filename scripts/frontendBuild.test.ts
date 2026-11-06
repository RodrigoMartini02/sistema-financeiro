import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(__dirname, '..');
const file = (...parts: string[]) => path.join(root, 'dist', ...parts);
const publicPages = JSON.parse(readFileSync(path.join(root, 'apps/site/src/screens/public/publicPages.json'), 'utf8')) as { pages: { file: string }[] };

async function withPreview(config: string, run: (origin: string) => Promise<void>): Promise<void> {
  const { preview } = await import('vite');
  const server = await preview({
    configFile: path.join(root, config),
    preview: { host: '127.0.0.1', port: 0, strictPort: true, open: false },
    logLevel: 'silent',
  });
  const address = server.httpServer.address();
  assert.ok(address && typeof address === 'object');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    if ('closeAllConnections' in server.httpServer) server.httpServer.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
  }
}

async function readPage(origin: string, pathname: string): Promise<string> {
  const response = await fetch(origin + pathname);
  assert.equal(response.status, 200, pathname);
  assert.equal(response.redirected, false, pathname);
  assert.equal(new URL(response.url).search, new URL(origin + pathname).search);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  return response.text();
}

async function checkHtmlAssets(origin: string, html: string, prefix = '/'): Promise<void> {
  const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map(match => match[1]!)
    .filter(url => url.startsWith('/'));
  assert.ok(urls.some(url => /\.js$/.test(url)), 'HTML deve referenciar um bundle JavaScript');
  assert.ok(urls.some(url => /\.css$/.test(url)), 'HTML deve referenciar CSS');
  for (const url of urls) {
    assert.ok(url.startsWith(prefix), url);
    const response = await fetch(origin + url);
    assert.equal(response.status, 200, url);
    assert.equal(response.redirected, false, url);
    const mime = response.headers.get('content-type') ?? '';
    if (url.endsWith('.js')) assert.match(mime, /javascript/);
    if (url.endsWith('.css')) assert.match(mime, /text\/css/);
    if (url.endsWith('.svg')) assert.match(mime, /image\/svg\+xml/);
    if (url.endsWith('.png')) assert.match(mime, /image\/png/);
    await response.arrayBuffer();
  }
}

test('build atual preserva entradas, páginas públicas, PWA e rotas de Licitações', async () => {
  for (const entry of ['index.html', 'app.html', 'assistant.html', 'demo.html', 'tenders.html', 'sw.js', 'manifest.json']) {
    assert.ok(existsSync(file(entry)), `Execute npm run build: ${entry}`);
  }
  for (const page of publicPages.pages) assert.ok(existsSync(file(page.file)), page.file);
  await withPreview('vite.config.ts', async origin => {
    const html = await readPage(origin, '/licitacoes/app/configuracoes?case=legacy');
    await checkHtmlAssets(origin, html);
    assert.equal(await readPage(origin, '/licitacoes/app?case=exact'), html);
  });
});

test('build principal preserva site e Finanças sem a entrada do app de Licitações', async () => {
  for (const entry of ['index.html', 'app.html', 'assistant.html', 'demo.html', 'sw.js', 'manifest.json']) {
    assert.ok(existsSync(file('main', entry)), `Execute npm run build:main: ${entry}`);
  }
  assert.equal(existsSync(file('main', 'tenders.html')), false);
  for (const page of publicPages.pages) assert.ok(existsSync(file('main', page.file)), page.file);
  await withPreview('vite.main.config.ts', async origin => {
    await checkHtmlAssets(origin, await readPage(origin, '/app.html'));
    await readPage(origin, '/financas/');
    await readPage(origin, '/licitacoes/');
  });
});

test('build de Licitações serve HTML, bundles e ícones no prefixo publicado, sem páginas ou SW de Finanças', async () => {
  const directory = ['tenders', 'licitacoes', 'app'];
  assert.ok(existsSync(file(...directory, 'tenders.html')), 'Execute npm run build:tenders');
  for (const forbidden of ['index.html', 'app.html', 'sw.js', 'manifest.json', 'robots.txt', 'sitemap.xml', 'media']) {
    assert.equal(existsSync(file(...directory, forbidden)), false, forbidden);
  }
  for (const icon of ['favicon.svg', 'apple-touch-icon.png', 'fingerence-logo.webp']) {
    assert.deepEqual(readFileSync(file(...directory, 'icons', icon)), readFileSync(path.join(root, 'public/icons', icon)));
  }
  await withPreview('vite.tenders.config.ts', async origin => {
    const html = await readPage(origin, '/licitacoes/app/configuracoes?case=isolated');
    await checkHtmlAssets(origin, html, '/licitacoes/app/');
    assert.equal(await readPage(origin, '/licitacoes/app?case=exact'), html);
    const logo = await fetch(origin + '/licitacoes/app/icons/fingerence-logo.webp');
    assert.equal(logo.status, 200);
    assert.match(logo.headers.get('content-type') ?? '', /image\/webp/);
    await logo.arrayBuffer();
    const missing = await fetch(origin + '/licitacoes/app/assets/missing.js');
    assert.equal(missing.status, 404);
    await missing.arrayBuffer();
  });
});

test('prova local preserva caminho e query, com assets e fallback isolados', async () => {
  assert.ok(existsSync(file('probe', '__tenders_probe', 'index.html')), 'Execute npm run build:probe');
  await withPreview('vite.probe.config.ts', async origin => {
    for (const route of ['/__tenders_probe', '/__tenders_probe/', '/__tenders_probe/deep/route']) {
      const html = await readPage(origin, `${route}?case=local&value=a%20b`);
      assert.match(html, /tenders-hosting-probe-v1/);
      assert.match(html, /<base href="\/__tenders_probe\/"/);
    }
    for (const [asset, mime] of [['probe.js', /javascript/], ['probe.css', /text\/css/], ['assets/marker.svg', /image\/svg\+xml/]] as const) {
      const response = await fetch(`${origin}/__tenders_probe/${asset}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type') ?? '', mime);
      await response.arrayBuffer();
    }
  });
});
