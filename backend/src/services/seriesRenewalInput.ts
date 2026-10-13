// Leitura do pedido de renovação das séries mensais (POST
// /api/expenses/series-renewals), sem acesso ao banco.
import { RequestInputError, readOptionalId, readRecord } from '../utils/requestInput';

export interface SeriesRenewalDecision {
  /** A série: a 1ª ocorrência (grupo_parcelamento_id). */
  seriesId: number;
  renew: boolean;
}

const MAX_DECISIONS = 100;

/** Corpo `{ decisions: [{ seriesId, renew }] }`, com 1 a 100 decisões; série repetida vale a última. */
export function readSeriesRenewalDecisions(body: unknown): SeriesRenewalDecision[] {
  const record = readRecord(body, 'Pedido inválido');
  const list = record['decisions'];
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_DECISIONS) {
    throw new RequestInputError(`Informe de 1 a ${MAX_DECISIONS} decisões`);
  }
  const bySeries = new Map<number, SeriesRenewalDecision>();
  for (const item of list) {
    const entry = readRecord(item, 'Decisão inválida');
    const seriesId = readOptionalId(entry['seriesId'], 'Série inválida');
    if (seriesId === null) {
      throw new RequestInputError('Série inválida');
    }
    if (typeof entry['renew'] !== 'boolean') {
      throw new RequestInputError('Informe se a série renova');
    }
    bySeries.set(seriesId, { seriesId, renew: entry['renew'] });
  }
  return [...bySeries.values()];
}
