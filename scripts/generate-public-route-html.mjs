import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve('dist');
const siteUrl = 'https://fin-gerence.com.br';
const imageUrl = `${siteUrl}/icons/logo.png`;

const routes = [
  {
    path: '/',
    file: 'index.html',
    title: 'FINGERENCE | Controle financeiro pessoal e empresarial',
    description: 'Organize receitas, despesas, cartões, reservas e relatórios em perfis separados para sua vida pessoal e sua empresa.',
    label: 'Sistema financeiro',
    heading: 'Controle financeiro com clareza.',
    body: 'O FINGERENCE ajuda a organizar finanças pessoais e empresariais com perfis separados, lançamentos recorrentes, cartão de crédito, reservas e relatórios.',
  },
  {
    path: '/funcionalidades/',
    file: 'funcionalidades/index.html',
    title: 'Funcionalidades do FINGERENCE | Controle financeiro completo',
    description: 'Conheça os módulos do FINGERENCE para despesas, receitas, reservas, cartão de crédito, relatórios e múltiplos perfis financeiros.',
    label: 'Funcionalidades',
    heading: 'Uma plataforma completa para suas finanças.',
    body: 'Controle despesas, receitas, reservas, cartão de crédito, cadastro em lote, relatórios e perfis separados para uso pessoal e empresarial.',
  },
  {
    path: '/sobre/',
    file: 'sobre/index.html',
    title: 'Sobre o FINGERENCE | Sistema financeiro pessoal e empresarial',
    description: 'Entenda como o FINGERENCE organiza finanças pessoais e empresariais com privacidade, clareza, relatórios e controle por perfis.',
    label: 'Sobre',
    heading: 'Finanças organizadas com clareza e intenção.',
    body: 'O FINGERENCE é um sistema de controle financeiro desenvolvido para dar visibilidade sobre receitas, despesas, reservas, cartões e relatórios, sem acesso bancário.',
  },
  {
    path: '/planos/',
    file: 'planos/index.html',
    title: 'Planos do FINGERENCE | Plus e Premium',
    description: 'Compare os planos Plus e Premium do FINGERENCE para controle financeiro pessoal, empresarial, relatórios e múltiplos perfis.',
    label: 'Planos',
    heading: 'Escolha o plano certo para você.',
    body: 'O FINGERENCE possui planos para controle financeiro pessoal e empresarial, com recursos como múltiplos perfis, relatórios, reservas e exportação de dados.',
  },
  {
    path: '/contato/',
    file: 'contato/index.html',
    title: 'Contato FINGERENCE | Suporte e atendimento',
    description: 'Fale com o FINGERENCE por e-mail ou WhatsApp para dúvidas, suporte, sugestões e atendimento sobre o sistema financeiro.',
    label: 'Contato',
    heading: 'Fale com a gente.',
    body: 'Entre em contato com o FINGERENCE por e-mail ou WhatsApp para suporte, dúvidas sobre planos, sugestões e atendimento.',
  },
  {
    path: '/termos/',
    file: 'termos/index.html',
    title: 'Termos de Uso | FINGERENCE',
    description: 'Leia os Termos de Uso do FINGERENCE, sistema de controle financeiro pessoal e empresarial.',
    label: 'Termos de Uso',
    heading: 'Termos de Uso do FINGERENCE.',
    body: 'Consulte as condições de acesso, responsabilidades, uso aceitável, propriedade intelectual, suporte e regras gerais de utilização do FINGERENCE.',
  },
  {
    path: '/privacidade/',
    file: 'privacidade/index.html',
    title: 'Política de Privacidade | FINGERENCE',
    description: 'Leia a Política de Privacidade e Proteção de Dados do FINGERENCE, em conformidade com a LGPD.',
    label: 'Privacidade e LGPD',
    heading: 'Política de Privacidade e Proteção de Dados.',
    body: 'Consulte como o FINGERENCE trata dados pessoais, dados financeiros inseridos pelo usuário, segurança, retenção, cookies e direitos previstos na LGPD.',
  },
];

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

function withRouteData(template, route) {
  const canonical = `${siteUrl}${route.path === '/' ? '/' : route.path}`;
  const fallback = [
    '<!--PUBLIC_FALLBACK_START-->',
    '<main aria-label="Conteúdo público do FINGERENCE">',
    `  <p>${escapeHtml(route.label)}</p>`,
    `  <h1>${escapeHtml(route.heading)}</h1>`,
    `  <p>${escapeHtml(route.body)}</p>`,
    '  <nav aria-label="Páginas públicas">',
    '    <a href="/">Home</a>',
    '    <a href="/funcionalidades/">Funcionalidades</a>',
    '    <a href="/planos/">Planos</a>',
    '    <a href="/sobre/">Sobre</a>',
    '    <a href="/contato/">Contato</a>',
    '    <a href="/termos/">Termos</a>',
    '    <a href="/privacidade/">Privacidade</a>',
    '  </nav>',
    '</main>',
    '<!--PUBLIC_FALLBACK_END-->',
  ].join('\n');

  let html = template;
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(route.title)}</title>`);
  html = upsertMeta(html, 'name="description"', `<meta name="description" content="${escapeHtml(route.description)}" />`);
  html = upsertMeta(html, 'name="robots"', '<meta name="robots" content="index, follow" />');
  html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/>/i, `<link rel="canonical" href="${canonical}" />`);
  html = upsertMeta(html, 'property="og:title"', `<meta property="og:title" content="${escapeHtml(route.title)}" />`);
  html = upsertMeta(html, 'property="og:description"', `<meta property="og:description" content="${escapeHtml(route.description)}" />`);
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

for (const route of routes) {
  const outputPath = path.join(distDir, route.file);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, withRouteData(template, route), 'utf8');
}