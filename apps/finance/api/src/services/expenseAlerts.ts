import { and, eq, lt, or } from 'drizzle-orm';
import { db } from '../db/client';
import { expenseAlerts, expenses } from '../db/schema';
import { sendPushToUser } from './webPush';

export interface ExpenseAlertsResult {
  createdDueToday: number;
  createdOverdue: number;
  pushSent: number;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatCurrency(value: string | null): string {
  const amount = Number(value ?? 0);
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Gera um evento de alerta por despesa em aberto que vence hoje ou ja
// venceu, e envia o push correspondente. O indice unico
// (despesa_id, tipo_alerta, data_vencimento) evita duplicar o mesmo alerta
// se o job rodar mais de uma vez no mesmo dia — por isso o insert usa
// onConflictDoNothing em vez de checar existencia antes. Push so e disparado
// para alertas efetivamente novos (inseridos agora), nunca reenviado para os
// ja existentes.
export async function processExpenseAlerts(): Promise<ExpenseAlertsResult> {
  const today = todayIso();

  const candidates = await db
    .select({
      id: expenses.id,
      userId: expenses.userId,
      accountId: expenses.accountId,
      dueDate: expenses.dueDate,
      description: expenses.description,
      amount: expenses.originalAmount,
    })
    .from(expenses)
    .where(and(
      eq(expenses.paid, false),
      eq(expenses.status, 'ativa'),
      or(eq(expenses.dueDate, today), lt(expenses.dueDate, today)),
    ));

  let createdDueToday = 0;
  let createdOverdue = 0;
  let pushSent = 0;

  for (const expense of candidates) {
    const alertType = expense.dueDate === today ? 'vencendo_hoje' : 'vencida';

    const inserted = await db
      .insert(expenseAlerts)
      .values({
        userId: expense.userId,
        expenseId: expense.id,
        accountId: expense.accountId,
        alertType,
        dueDate: expense.dueDate,
      })
      .onConflictDoNothing()
      .returning({ id: expenseAlerts.id });

    if (inserted.length === 0) continue;
    if (alertType === 'vencendo_hoje') createdDueToday += 1;
    else createdOverdue += 1;

    const title = alertType === 'vencendo_hoje' ? 'Conta vence hoje' : 'Conta vencida';
    const { sent } = await sendPushToUser(expense.userId, {
      title,
      body: `${expense.description} — ${formatCurrency(expense.amount)}`,
    });
    if (sent > 0) {
      pushSent += 1;
      await db
        .update(expenseAlerts)
        .set({ status: 'sent', updatedAt: new Date() })
        .where(eq(expenseAlerts.id, inserted[0]!.id));
    }
  }

  return { createdDueToday, createdOverdue, pushSent };
}
