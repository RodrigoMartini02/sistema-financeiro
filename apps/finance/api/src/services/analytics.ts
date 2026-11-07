import { pool } from '../db/client';

export type AnalyticsEventType = 'page_view' | 'login';

let warnedMissingTable = false;

function isMissingTableError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '42P01';
}

export async function recordAnalyticsEvent({
  eventType,
  path,
  userId,
}: {
  eventType: AnalyticsEventType;
  path?: string | null;
  userId?: number | null;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO analytics_events (event_type, path, usuario_id)
       VALUES ($1, $2, $3)`,
      [eventType, path ?? null, userId ?? null],
    );
  } catch (error) {
    if (isMissingTableError(error)) {
      if (!warnedMissingTable) {
        console.warn('[Analytics] analytics_events table not found. Apply backend/drizzle/0013_analytics_events.sql to enable tracking.');
        warnedMissingTable = true;
      }
      return;
    }

    console.error('[Analytics] Failed to record event:', error);
  }
}
