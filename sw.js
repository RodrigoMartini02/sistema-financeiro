// ================================================================
// sw.js — Service Worker PWA
// Sistema de Controle Financeiro
// ================================================================

const CACHE_VERSION = 'v105';
const CACHE_STATIC  = `sf-static-${CACHE_VERSION}`;

// Assets estáticos que serão cacheados no install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/app.html',
    '/ia.html',
    '/offline.html',
    '/manifest.json',
    '/icons/financeiro.png',
    // CSS
    '/css/loading.css',
    '/css/index.css',
    '/css/pwa.css',
    '/css/avaliacao.css',
    '/css/layoutGeral.css',
    '/css/botoes.css',
    '/css/modais.css',
    '/css/dashboard.css',
    '/css/receita.css',
    '/css/despesa.css',
    '/css/notificacao.css',
    '/css/rel.css',
    '/css/config.css',
    '/css/planos.css',
    '/css/ia.css',
    // JS principais
    '/js/theme.js',
    '/js/utils.js',
    '/js/loading.js',
    '/js/login.js',
    '/js/pwa-handler.js',
    '/js/avaliacao.js',
    '/js/usuarioDados.js',
    '/js/main.js',
    '/js/dashboard.js',
    '/js/despesas.js',
    '/js/receita.js',
    '/js/notificacao.js',
    '/js/rel.js',
    '/js/config.js',
    '/js/configuracao.js',
    '/js/planos.js',
    '/js/ia.js'
];

// ── Install: resiliente — não aborta se um asset falhar ────────
// Usa cache:'reload' para buscar direto do servidor, ignorando caches anteriores
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_STATIC).then(async (cache) => {
            await Promise.allSettled(
                STATIC_ASSETS.map(async (url) => {
                    try {
                        const response = await fetch(url, { cache: 'reload' });
                        if (response.ok) await cache.put(url, response);
                    } catch (err) {
                        console.warn('[SW] Falha ao cachear:', url, err);
                    }
                })
            );
        }).then(() => self.skipWaiting())
    );
});

// ── Activate: limpa caches antigos ─────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key.startsWith('sf-') && key !== CACHE_STATIC)
                    .map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// ── Fetch: estratégia por tipo de requisição ───────────────────
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Ignora requisições não-GET
    if (event.request.method !== 'GET') return;

    // Ignora API (backend) — sempre network, nunca cache
    if (url.hostname.includes('onrender.com') && url.pathname.startsWith('/api')) return;

    // Ignora CDN externos (Font Awesome, Google Fonts, Mercado Pago SDK)
    const externalHosts = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'sdk.mercadopago.com'];
    if (externalHosts.some((h) => url.hostname.includes(h))) return;

    // Navegação (HTML): Network-first com fallback para cache e offline.html
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_STATIC).then((cache) => cache.put(event.request, clone));
                    return response;
                })
                .catch(() =>
                    caches.match(event.request).then(
                        (cached) => cached || caches.match('/offline.html') || caches.match('/index.html')
                    )
                )
        );
        return;
    }

    // Assets estáticos (CSS, JS, imagens): Cache-first com fallback network
    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) return cached;

            return fetch(event.request).then((response) => {
                if (!response || response.status !== 200 || response.type === 'opaque') {
                    return response;
                }
                const clone = response.clone();
                caches.open(CACHE_STATIC).then((cache) => cache.put(event.request, clone));
                return response;
            });
        })
    );
});
