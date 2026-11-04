import { apiRequest } from './apiClient';

export async function fetchVapidPublicKey(): Promise<string> {
  const { publicKey } = await apiRequest<{ publicKey: string }>('/push/vapid-public-key');
  return publicKey;
}

export async function saveSubscription(subscription: PushSubscription): Promise<void> {
  await apiRequest('/push/subscribe', {
    method: 'POST',
    body: JSON.stringify(subscription.toJSON()),
  });
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await apiRequest('/push/subscribe', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  });
}
