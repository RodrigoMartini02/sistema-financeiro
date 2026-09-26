import { useEffect, useState } from 'react';
import { fetchVapidPublicKey, removeSubscription, saveSubscription } from '../services/pushService';

// PushManager.subscribe exige a chave VAPID como Uint8Array, mas o backend
// entrega em base64url — conversao padrao da Web Push API.
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const array = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) array[i] = rawData.charCodeAt(i);
  return array;
}

export type PushSupportStatus = 'unsupported' | 'default' | 'granted' | 'denied';

export function usePushNotifications() {
  const [status, setStatus] = useState<PushSupportStatus>('default');
  const [loading, setLoading] = useState(false);

  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  useEffect(() => {
    if (!supported) { setStatus('unsupported'); return; }
    setStatus(Notification.permission as PushSupportStatus);
  }, [supported]);

  // Chamado a partir de um clique explicito do usuario (ex: toggle "Ativar
  // notificacoes") — nunca automatico, navegadores bloqueiam/penalizam
  // pedidos de permissao sem gesto do usuario.
  const enable = async (): Promise<boolean> => {
    if (!supported) return false;
    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      setStatus(permission as PushSupportStatus);
      if (permission !== 'granted') return false;

      const registration = await navigator.serviceWorker.ready;
      const publicKey = await fetchVapidPublicKey();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await saveSubscription(subscription);
      return true;
    } finally {
      setLoading(false);
    }
  };

  const disable = async (): Promise<void> => {
    if (!supported) return;
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return;
      await removeSubscription(subscription.endpoint);
      await subscription.unsubscribe();
    } finally {
      setLoading(false);
    }
  };

  return { status, supported, loading, enable, disable };
}
