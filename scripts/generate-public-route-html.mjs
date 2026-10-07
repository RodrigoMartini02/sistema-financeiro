import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Depois do vite build: uma cópia do index.html por página pública, com título,
// descrição, endereço canônico, prévia do link e um conteúdo de reserva para
// quem lê sem JavaScript. As páginas vêm de src/screens/public/publicPages.json,
// o mesmo arquivo do SEO das telas (PublicSeo).

const distDir = path.resolve('dist');
const pagesFile = path.resolve('src/screens/public/publicPages.json');

const { siteUrl, shareImagePath, pages } = JSON.parse(await readFile(pagesFile, 'utf8'));
const imageUrl = `${siteUrl}${shareImagePath}`;

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function upsertMeta(html, selector, tag) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<meta ${escapedSelector}[^>]*>`, 'i');

  if (pattern.test(html)) {
    return html.replace(pattern, tag);
  }

  return html.replace('</head>', `    ${tag}\n  </head>`);
}

const navLinks = pages.map((page) => `    <a href="${page.path}">${escapeHtml(page.navLabel)}</a>`);

function withPageData(template, page) {
  const canonical = `${siteUrl}${page.path}`;
  const fallback = [
    '<!--PUBLIC_FALLBACK_START-->',
    '<main aria-label="Conteúdo público do FINGERENCE">',
    `  <p>${escapeHtml(page.fallback.label)}</p>`,
    `  <h1>${escapeHtml(page.fallback.heading)}</h1>`,
    `  <p>${escapeHtml(page.fallback.body)}</p>`,
    '  <nav aria-label="Páginas públicas">',
    ...navLinks,
    '  </nav>',
    '</main>',
    '<!--PUBLIC_FALLBACK_END-->',
  ].join('\n');

  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(page.title)}</title>`);
  html = upsertMeta(html, 'name="description"', `<meta name="description" content="${escapeHtml(page.description)}" />`);
  html = upsertMeta(html, 'name="robots"', '<meta name="robots" content="index, follow" />');
  html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/>/i, `<link rel="canonical" href="${canonical}" />`);
  html = upsertMeta(html, 'property="og:title"', `<meta property="og:title" content="${escapeHtml(page.title)}" />`);
  html = upsertMeta(html, 'property="og:description"', `<meta property="og:description" content="${escapeHtml(page.description)}" />`);
  html = upsertMeta(html, 'property="og:type"', '<meta property="og:type" content="website" />');
  html = upsertMeta(html, 'property="og:url"', `<meta property="og:url" content="${canonical}" />`);
  html = upsertMeta(html, 'property="og:image"', `<meta property="og:image" content="${imageUrl}" />`);

  if (html.includes('<!--PUBLIC_FALLBACK_START-->')) {
    html = html.replace(/<!--PUBLIC_FALLBACK_START-->[\s\S]*?<!--PUBLIC_FALLBACK_END-->/, fallback);
  } else {
    html = html.replace('<div id="root"></div>', `<div id="root">${fallback}</div>`);
  }

  return html;
}

const template = await readFile(path.join(distDir, 'index.html'), 'utf8');

for (const page of pages) {
  const outputPath = path.join(distDir, page.file);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, withPageData(template, page), 'utf8');
}
