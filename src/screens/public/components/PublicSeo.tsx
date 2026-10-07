import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { canonicalUrlFor, publicPageFor, SHARE_IMAGE_URL } from '../../../utils/publicPages';

// Título, descrição e prévia do link de cada página, do mesmo arquivo que o
// gerador do build usa (src/screens/public/publicPages.json).

function upsertMeta(selector: string, createAttributes: Record<string, string>, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement('meta');
    for (const [key, value] of Object.entries(createAttributes)) {
      element.setAttribute(key, value);
    }
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
    const page = publicPageFor(location.pathname);
    const canonical = canonicalUrlFor(page);

    document.title = page.title;
    upsertCanonical(canonical);
    upsertMeta('meta[name="description"]', { name: 'description' }, page.description);
    upsertMeta('meta[name="robots"]', { name: 'robots' }, 'index, follow');
    upsertMeta('meta[property="og:title"]', { property: 'og:title' }, page.title);
    upsertMeta('meta[property="og:description"]', { property: 'og:description' }, page.description);
    upsertMeta('meta[property="og:type"]', { property: 'og:type' }, 'website');
    upsertMeta('meta[property="og:url"]', { property: 'og:url' }, canonical);
    upsertMeta('meta[property="og:image"]', { property: 'og:image' }, SHARE_IMAGE_URL);
    upsertMeta('meta[property="og:locale"]', { property: 'og:locale' }, 'pt_BR');
  }, [location.pathname]);

  return null;
}
