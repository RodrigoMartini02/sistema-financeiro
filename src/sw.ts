import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare global {
  interface Window {
    __WB_MANIFEST: Array<string | { url: string; revision?: string | null }>;
  }
}

type AssistantWorkerScope = {
  clients: {
    get: (id: string) => Promise<{ url: string } | undefined>;
  };
  skipWaiting: () => Promise<void>;
};

const worker = self as unknown as AssistantWorkerScope;
const ASSISTANT_PATH = '/assistant.html';
const assistantShell = new NetworkFirst({ cacheName: 'fingerence-assistant-shell-v1' });
const assistantAssets = new StaleWhileRevalidate({ cacheName: 'fingerence-assistant-assets-v1' });

clientsClaim();
void worker.skipWaiting();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({ sameOrigin, request, url }) => sameOrigin && request.mode === 'navigate' && url.pathname === ASSISTANT_PATH,
  assistantShell,
);

registerRoute(
  ({ sameOrigin, request, url }) => (
    sameOrigin
    && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/'))
    && !url.pathname.startsWith('/api/')
    && ['font', 'image', 'script', 'style'].includes(request.destination)
  ),
  async ({ event, request }) => {
    const clientId = (event as { clientId?: string }).clientId;
    const client = clientId ? await worker.clients.get(clientId) : undefined;

    if (!client || new URL(client.url).pathname !== ASSISTANT_PATH) {
      return fetch(request);
    }

    return assistantAssets.handle({ event, request });
  },
);
