// Renovação da receita fixa para o ano seguinte (plano
// .plans/receita-fixa-ano-previsto.md). A partir de 1º de dezembro do último
// ano gravado, o app pergunta, para cada fixa da pessoa, se ela continua.
// Renovar grava as previstas do ano seguinte; não renovar encerra a fixa em
// dezembro — a configuração sai, e as previstas do ano ficam. Fechar o modal
// deixa para depois: a fixa continua pendente até alguém decidir.
//
// Só as fixas da própria pessoa (classificacoes_receita_fixas.usuario_id), na
// conta pedida.
import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { incomeClassificationFixes } from '../db/schema';
import { getTodayIsoInTimezone } from '../utils/date';
import { toNumber } from './entryQueries';
import type { FixedIncomeRenewalDecision } from './fixedIncomeRenewalInput';
import { anoDaRenovacao, competenciasDaRenovacao, renovacaoPendente } from './fixedIncomeSchedule';
import { findFixedIncomeSource, findRegisteredFixedIncomes, writeFixedIncomeYear } from './fixedIncomes';

export interface PendingFixedIncomeRenewal {
  fixedId: number;
  /** "Raiz › Nome", como a receita aparece na lista. */
  description: string;
  amount: number;
  dayOfMonth: number;
  /** Ano que a renovação grava. */
  year: number;
}

export interface FixedIncomeRenewalResult {
  renewed: number;
  declined: number;
}

/** Fixas da pessoa na conta que aguardam a decisão de continuar. */
export async function listPendingFixedIncomeRenewals(
  userId: number,
  accountId: number | null,
  today: string = getTodayIsoInTimezone(),
): Promise<PendingFixedIncomeRenewal[]> {
  const sources = await findRegisteredFixedIncomes(userId, accountId);
  return sources
    .flatMap((source) => (
      source.registeredYear !== null && renovacaoPendente(source.registeredYear, today)
        ? [{
            fixedId: source.id,
            description: source.description,
            amount: toNumber(source.amount),
            dayOfMonth: source.dayOfMonth,
            year: anoDaRenovacao(source.registeredYear, today),
          }]
        : []
    ))
    .sort((left, right) => left.description.localeCompare(right.description, 'pt-BR'));
}

/**
 * Grava as decisões numa transação. Fixa que não é da pessoa, que não está
 * pendente ou que já foi decidida é ignorada.
 */
export async function decideFixedIncomeRenewals(
  userId: number,
  decisions: FixedIncomeRenewalDecision[],
  today: string = getTodayIsoInTimezone(),
): Promise<FixedIncomeRenewalResult> {
  return db.transaction(async (transaction) => {
    const result: FixedIncomeRenewalResult = { renewed: 0, declined: 0 };
    for (const decision of decisions) {
      // A fixa travada: duas decisões ao mesmo tempo correm uma depois da outra.
      const [fix] = await transaction
        .select({ id: incomeClassificationFixes.id, registeredYear: incomeClassificationFixes.registeredYear })
        .from(incomeClassificationFixes)
        .where(and(eq(incomeClassificationFixes.id, decision.fixedId), eq(incomeClassificationFixes.userId, userId)))
        .limit(1)
        .for('update');
      if (!fix || fix.registeredYear === null || !renovacaoPendente(fix.registeredYear, today)) continue;

      if (!decision.renew) {
        // A configuração sai; as previstas do ano ficam, sem o vínculo (ON DELETE SET NULL).
        await transaction.delete(incomeClassificationFixes).where(eq(incomeClassificationFixes.id, fix.id));
        result.declined += 1;
        continue;
      }

      // Categoria desativada ou conta arquivada não gravam previstas.
      const source = await findFixedIncomeSource(transaction, fix.id);
      if (!source) continue;
      const year = anoDaRenovacao(fix.registeredYear, today);
      await writeFixedIncomeYear(transaction, source, competenciasDaRenovacao(today, year, source.dayOfMonth), year);
      result.renewed += 1;
    }
    return result;
  });
}
