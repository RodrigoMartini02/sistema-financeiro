import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { pushSubscriptions } from '../db/schema';

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;

  const publicKey = process.env['VAPID_PUBLIC_KEY'];
  const privateKey = process.env['VAPID_PRIVATE_KEY'];
  const subject = process.env['VAPID_SUBJECT'];

  if (!publicKey || !privateKey || !subject) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export function getVapidPublicKey(): string | null {
  if (!ensureConfigured()) return null;
  return process.env['VAPID_PUBLIC_KEY'] ?? null;
}

export interface PushPayload {
  title: string;
  body: string;
}

// Envia para todas as subscriptions do usuario (varios dispositivos). Uma
// subscription expirada/revogada (410/404) e removida — o navegador nao
// avisa quando isso acontece, so falha na proxima tentativa de envio.
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  if (!ensureConfigured()) return { sent: 0, removed: 0 };

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

  let sent = 0;
  let removed = 0;

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(payload),
      );
      sent += 1;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
        removed += 1;
      } else {
        console.error(`[web push] Failed to send to subscription ${subscription.id}:`, (error as Error).message);
      }
    }
  }

  return { sent, removed };
}
