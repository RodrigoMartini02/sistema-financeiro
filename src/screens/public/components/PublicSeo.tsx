import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_URL = 'https://fin-gerence.com.br';
const DEFAULT_IMAGE = `${SITE_URL}/icons/logo.png`;

type SeoConfig = {
  title: string;
  description: string;
  canonicalPath: string;
};

const SEO_BY_PATH: Record<string, SeoConfig> = {
  '/': {
    title: 'FINGERENCE | Controle financeiro pessoal e empresarial',
    description: 'Organize receitas, despesas, cartões, reservas e relatórios em perfis separados para sua vida pessoal e sua empresa.',
    canonicalPath: '/',
  },
  '/index.html': {
    title: 'FINGERENCE | Controle financeiro pessoal e empresarial',
    description: 'Organize receitas, despesas, cartões, reservas e relatórios em perfis separados para sua vida pessoal e sua empresa.',
    canonicalPath: '/',
  },
  '/funcionalidades': {
    title: 'Funcionalidades do FINGERENCE | Controle financeiro completo',
    description: 'Conheça os módulos do FINGERENCE para despesas, receitas, reservas, cartão de crédito, relatórios e múltiplos perfis financeiros.',
    canonicalPath: '/funcionalidades/',
  },
  '/sobre': {
    title: 'Sobre o FINGERENCE | Sistema financeiro pessoal e empresarial',
    description: 'Entenda como o FINGERENCE organiza finanças pessoais e empresariais com privacidade, clareza, relatórios e controle por perfis.',
    canonicalPath: '/sobre/',
  },
  '/planos': {
    title: 'Planos do FINGERENCE | Plus e Premium',
    description: 'Compare os planos Plus e Premium do FINGERENCE para controle financeiro pessoal, empresarial, relatórios e múltiplos perfis.',
    canonicalPath: '/planos/',
  },
  '/contato': {
    title: 'Contato FINGERENCE | Suporte e atendimento',
    description: 'Fale com o FINGERENCE por e-mail ou WhatsApp para dúvidas, suporte, sugestões e atendimento sobre o sistema financeiro.',
    canonicalPath: '/contato/',
  },
  '/termos': {
    title: 'Termos de Uso | FINGERENCE',
    description: 'Leia os Termos de Uso do FINGERENCE, sistema de controle financeiro pessoal e empresarial.',
    canonicalPath: '/termos/',
  },
  '/privacidade': {
    title: 'Política de Privacidade | FINGERENCE',
    description: 'Leia a Política de Privacidade e Proteção de Dados do FINGERENCE, em conformidade com a LGPD.',
    canonicalPath: '/privacidade/',
  },
};

function normalizePath(pathname: string) {
  if (pathname !== '/' && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function upsertMeta(selector: string, createAttributes: Record<string, string>, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement('meta');
    Object.entries(createAttributes).forEach(([key, value]) => element?.setAttribute(key, value));
    document.head.appendChild(element);
  }

  element.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', 'canonical');
    document.head.appendChild(element);
  }

  element.setAttribute('href', href);
}

export function PublicSeo() {
  const location = useLocation();

  useEffect(() => {
    const pathname = normalizePath(location.pathname);
    const config = SEO_BY_PATH[pathname] ?? SEO_BY_PATH['/'];
    const canonical = `${SITE_URL}${config.canonicalPath}`;

    document.title = config.title;
    upsertCanonical(canonical);
    upsertMeta('meta[name="description"]', { name: 'description' }, config.description);
    upsertMeta('meta[name="robots"]', { name: 'robots' }, 'index, follow');
    upsertMeta('meta[property="og:title"]', { property: 'og:title' }, config.title);
    upsertMeta('meta[property="og:description"]', { property: 'og:description' }, config.description);
    upsertMeta('meta[property="og:type"]', { property: 'og:type' }, 'website');
    upsertMeta('meta[property="og:url"]', { property: 'og:url' }, canonical);
    upsertMeta('meta[property="og:image"]', { property: 'og:image' }, DEFAULT_IMAGE);
    upsertMeta('meta[property="og:locale"]', { property: 'og:locale' }, 'pt_BR');
  }, [location.pathname]);

  return null;
}