import { SITE_SOLUTIONS, type SiteSolution } from '../brand';
import pagesFile from '../screens/public/publicPages.json';

// Páginas do site público: título, descrição, solução e texto de reserva de
// cada uma. O mesmo arquivo serve o SEO das telas (PublicSeo) e o gerador do
// build (scripts/generate-public-route-html.mjs).

export interface PublicPage {
  /** Endereço canônico, com barra no fim (a home é "/"). */
  path: string;
  /** Arquivo gerado no build, dentro de dist/. */
  file: string;
  navLabel: string;
  /** Solução da página: só nela aparecem "Entrar" e "Começar grátis". */
  solution: SiteSolution | null;
  title: string;
  description: string;
  /** Conteúdo que fica no HTML para quem lê a página sem JavaScript. */
  fallback: { label: string; heading: string; body: string };
}

const HOME_PATH = '/';
const HOME_FILE_PATH = '/index.html';
export const PRODUCTS_PATH = '/produtos/';

function isSiteSolution(value: unknown): value is SiteSolution {
  return (SITE_SOLUTIONS as readonly unknown[]).includes(value);
}

export const SITE_URL = pagesFile.siteUrl;
export const SHARE_IMAGE_URL = `${pagesFile.siteUrl}${pagesFile.shareImagePath}`;

export const PUBLIC_PAGES: PublicPage[] = pagesFile.pages.map((page) => ({
  ...page,
  solution: isSiteSolution(page.solution) ? page.solution : null,
}));

function findHomePage(): PublicPage {
  const home = PUBLIC_PAGES.find((page) => page.path === HOME_PATH);
  if (!home) {
    throw new Error('publicPages.json precisa ter a home ("/")');
  }
  return home;
}

const HOME_PAGE = findHomePage();

/** "/sobre" e "/sobre/" são a mesma página; "/index.html" é a home. */
function pageKey(pathname: string): string {
  if (pathname === HOME_FILE_PATH) {
    return HOME_PATH;
  }
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

/** Página do endereço; endereço desconhecido mostra a home, como o roteador. */
export function publicPageFor(pathname: string): PublicPage {
  const key = pageKey(pathname);
  return PUBLIC_PAGES.find((page) => pageKey(page.path) === key) ?? HOME_PAGE;
}

export function canonicalUrlFor(page: PublicPage): string {
  return `${SITE_URL}${page.path}`;
}

/** Página da solução (ex.: Licitações → /produtos/licitacoes/). */
export function pageOfSolution(solution: SiteSolution): PublicPage {
  const page = PUBLIC_PAGES.find((candidate) => candidate.solution === solution);
  if (!page) {
    throw new Error(`publicPages.json sem a página da solução ${solution}`);
  }
  return page;
}

/** Produtos e as páginas das soluções ficam sob /produtos/: o menu marca "Produtos" em todas. */
export function isProductsArea(pathname: string): boolean {
  const key = pageKey(pathname);
  return key === pageKey(PRODUCTS_PATH) || key.startsWith(PRODUCTS_PATH);
}
