// Leitura do pedido de renovação das receitas fixas (POST
// /api/incomes/fixed-renewals), sem acesso ao banco.
import { RequestInputError, readOptionalId, readRecord } from '../utils/requestInput';

export interface FixedIncomeRenewalDecision {
  /** A configuração da receita fixa (classificacoes_receita_fixas.id). */
  fixedId: number;
  renew: boolean;
}

const MAX_DECISIONS = 100;

/** Corpo `{ decisions: [{ fixedId, renew }] }`, com 1 a 100 decisões; fixa repetida vale a última. */
export function readFixedIncomeRenewalDecisions(body: unknown): FixedIncomeRenewalDecision[] {
  const record = readRecord(body, 'Pedido inválido');
  const list = record['decisions'];
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_DECISIONS) {
    throw new RequestInputError(`Informe de 1 a ${MAX_DECISIONS} decisões`);
  }
  const byFixed = new Map<number, FixedIncomeRenewalDecision>();
  for (const item of list) {
    const entry = readRecord(item, 'Decisão inválida');
    const fixedId = readOptionalId(entry['fixedId'], 'Receita fixa inválida');
    if (fixedId === null) {
      throw new RequestInputError('Receita fixa inválida');
    }
    if (typeof entry['renew'] !== 'boolean') {
      throw new RequestInputError('Informe se a receita fixa continua');
    }
    byFixed.set(fixedId, { fixedId, renew: entry['renew'] });
  }
  return [...byFixed.values()];
}
