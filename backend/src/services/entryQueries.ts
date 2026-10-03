import { and, eq, exists, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db } from '../db/client';
import { accounts, cards, expenses, incomes, users } from '../db/schema';

// Regras de consulta de lançamentos compartilhadas pelo Painel e pelos
// Relatórios: quem paga a despesa, filtro de conta e condições base.

/** Lançamento vigente (o cancelado continua no banco com outro status). */
export const ACTIVE_STATUS = 'ativa';
/** Lançamento cancelado: continua no banco, fora de todos os totais. */
export const CANCELLED_STATUS = 'cancelada';
/** Receita lançada e ainda não recebida (contratos passam por faturada). */
export const RECEIVABLE_STATUSES = ['prevista', 'faturada'];

export function toNumber(value: string | number | null | undefined): number {
  const converted = Number(value ?? 0);
  return Number.isFinite(converted) ? converted : 0;
}

/**
 * Filtro de conta, mesma regra de utils/accountFilter.ts: o registro é da
 * conta informada, ou não tem conta e o autor é dono dela (conta pessoal) —
 * registros anteriores ao conceito de conta.
 */
export function accountFilter(accountColumn: AnyPgColumn, userColumn: AnyPgColumn, accountId: number | null): SQL | undefined {
  if (!accountId) {
    return undefined;
  }
  return or(
    eq(accountColumn, accountId),
    and(
      isNull(accountColumn),
      exists(
        db.select({ id: accounts.id }).from(accounts).where(and(
          eq(accounts.id, accountId),
          eq(accounts.type, 'pessoal'),
          eq(accounts.userId, userColumn),
        )),
      ),
    ),
  );
}

/**
 * Quem paga a despesa: o dono do cartão quando há cartão (crédito ou débito);
 * sem cartão, quem cadastrou. É por ele que a despesa entra no filtro de
 * pessoas e nas somas por pessoa — a compra no cartão de outra pessoa sai da
 * renda do dono do cartão. Calculado na consulta, nada é gravado.
 */
export const expensePayer = sql<number>`COALESCE((SELECT ${cards.userId} FROM ${cards} WHERE ${cards.id} = ${expenses.cardId}), ${expenses.userId})`;

/** Despesas vigentes pagas por alguém do escopo, na conta informada. */
export function expenseBaseConditions(scope: number[], accountId: number | null): Array<SQL | undefined> {
  return [
    inArray(expensePayer, scope),
    eq(expenses.status, ACTIVE_STATUS),
    accountFilter(expenses.accountId, expenses.userId, accountId),
  ];
}

/** Receitas das pessoas do escopo, na conta informada, com os status pedidos. */
export function incomeBaseConditions(scope: number[], accountId: number | null, statuses: string[] = [ACTIVE_STATUS]): Array<SQL | undefined> {
  return [
    inArray(incomes.userId, scope),
    inArray(incomes.status, statuses),
    accountFilter(incomes.accountId, incomes.userId, accountId),
  ];
}

/** Nome completo (nome + sobrenome) de cada usuário, por id. */
export async function findPeopleNames(ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) {
    return new Map();
  }
  const rows = await db.select({ id: users.id, name: users.name, lastName: users.lastName })
    .from(users).where(inArray(users.id, ids));
  return new Map(rows.map((row) => [row.id, `${row.name} ${row.lastName ?? ''}`.trim()]));
}
