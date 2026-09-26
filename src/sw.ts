import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare global {
  interface Window {
    __WB_MANIFEST: Array<string | { url: string; revision?: string | null }>;
  }
}

interface PushWindowClient {
  url: string;
  focus: () => Promise<PushWindowClient>;
}

type AssistantWorkerScope = {
  clients: {
    get: (id: string) => Promise<{ url: string } | undefined>;
    matchAll: (options?: { type?: 'window' }) => Promise<PushWindowClient[]>;
    openWindow: (url: string) => Promise<PushWindowClient | null>;
  };
  registration: {
    showNotification: (title: string, options?: NotificationOptions) => Promise<void>;
  };
  skipWaiting: () => Promise<void>;
  addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
};

type PushWorkerScope = {
  addEventListener: (
    type: 'push' | 'notificationclick',
    listener: (event: {
      data?: { json: () => { title: string; body: string } };
      notification: { close: () => void };
      waitUntil: (promise: Promise<unknown>) => void;
    }) => void,
  ) => void;
};

const worker = self as unknown as AssistantWorkerScope;
const pushWorker = self as unknown as PushWorkerScope;
const ASSISTANT_PATH = '/assistant.html';
const assistantShell = new NetworkFirst({ cacheName: 'fingerence-assistant-shell-v1' });
const assistantAssets = new StaleWhileRevalidate({ cacheName: 'fingerence-assistant-assets-v1' });
const appShell = new NetworkFirst({ cacheName: 'fingerence-app-shell-v1' });

clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

worker.addEventListener('message', (event) => {
  if ((event.data as { type?: string } | undefined)?.type === 'SKIP_WAITING') {
    void worker.skipWaiting();
  }
});

pushWorker.addEventListener('push', (event) => {
  const payload = event.data?.json() ?? { title: 'FinGerence', body: 'Você tem uma nova notificação.' };
  event.waitUntil(
    worker.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/pwa-192.png',
      badge: '/icons/pwa-192.png',
    }),
  );
});

// Clique na notificação foca uma aba já aberta do app se existir, ou abre
// uma nova — mesma UX de apps nativos.
pushWorker.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    worker.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) return clients[0]!.focus();
      return worker.clients.openWindow('/app.html');
    }),
  );
});

registerRoute(
  ({ sameOrigin, request, url }) => sameOrigin && request.mode === 'navigate' && url.pathname === ASSISTANT_PATH,
  assistantShell,
);

registerRoute(
  ({ sameOrigin, request, url }) => sameOrigin && request.mode === 'navigate' && url.pathname !== ASSISTANT_PATH,
  appShell,
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
