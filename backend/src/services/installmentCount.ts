// Nº de parcelas na edição da compra parcelada e a despesa única que vira parcelada (plano
// .plans/financas-pendencias.md, E4). Regras sem acesso ao banco: o servidor as aplica depois de travar a compra,
// na mesma transação da edição, com as linhas lidas FOR UPDATE.
// - Só mexe em parcela aberta: a paga e a ligada a pagamento de fatura nunca são apagadas nem regravadas (o rótulo
//   "x/N" das que ficam passa a ser o novo N).
// - Aumentar cria as parcelas novas continuando o calendário da última, com o valor da editada e sem juros.
// - Reduzir apaga a cauda de parcelas abertas; se alguma da cauda está paga, na fatura ou é a editada, recusa e diz
//   até quantas dá para reduzir.
import { addMonthsClamped } from '../utils/date';
import type { InvoiceEditLock } from './cardInvoiceRules';
import { MAX_INSTALLMENTS, MIN_INSTALLMENTS, type ExpenseUpdateScope } from './expenseInput';

/** Parcela da compra como está gravada. */
export interface CountRow {
  id: number;
  /** Número da parcela (o "3" de "3/10"); nulo na linha antiga sem número. */
  number: number | null;
  dueDate: string;
  paid: boolean;
  /** Paga ou renegociada por um pagamento de fatura do cartão. */
  invoiceLinked: boolean;
}

export interface NewInstallment {
  number: number;
  dueDate: string;
}

export interface InstallmentCountPlan {
  /** O novo total, que vira o "N" de "x/N" em todas as parcelas que ficam. */
  nextCount: number;
  /** Parcelas abertas a apagar (a cauda). */
  deleteIds: number[];
  /** Parcelas novas, abertas. */
  create: NewInstallment[];
}

export type InstallmentCountResult = { plan: InstallmentCountPlan } | { refusal: string };

function countRangeRefusal(): string {
  return `Informe de ${MIN_INSTALLMENTS} a ${MAX_INSTALLMENTS} parcelas`;
}

interface PlanInput {
  /** Todas as parcelas da compra, a editada inclusive. */
  rows: readonly CountRow[];
  editedId: number;
  /** O total gravado na parcela editada. */
  currentCount: number;
  nextCount: number;
}

/**
 * O que a mudança do nº de parcelas faz na compra: as parcelas novas (número e vencimento) ou a cauda a apagar.
 * As novas continuam o calendário da última parcela, mês a mês; a numeração que já tinha falhas (parcelas
 * excluídas antes pela grade) não é preenchida: as novas vão de N + 1 até o novo total.
 */
export function planInstallmentCountChange({ rows, editedId, currentCount, nextCount }: PlanInput): InstallmentCountResult {
  if (!Number.isInteger(nextCount) || nextCount < MIN_INSTALLMENTS || nextCount > MAX_INSTALLMENTS) {
    return { refusal: countRangeRefusal() };
  }
  const numbered = rows.filter((row): row is CountRow & { number: number } => row.number !== null);
  if (numbered.length === 0) return { refusal: 'A compra não tem parcelas numeradas' };
  const total = Math.max(currentCount, ...numbered.map((row) => row.number));
  if (nextCount === total) return { plan: { nextCount, deleteIds: [], create: [] } };

  if (nextCount > total) {
    const last = numbered.reduce((best, row) => (
      row.number > best.number || (row.number === best.number && row.dueDate > best.dueDate) ? row : best
    ));
    const create = Array.from({ length: nextCount - total }, (_, index): NewInstallment => {
      const number = total + index + 1;
      return { number, dueDate: addMonthsClamped(last.dueDate, number - last.number) };
    });
    return { plan: { nextCount, deleteIds: [], create } };
  }

  const tail = numbered.filter((row) => row.number > nextCount);
  const blocked = tail.filter((row) => row.paid || row.invoiceLinked || row.id === editedId);
  if (blocked.length > 0) {
    const highest = blocked.reduce((best, row) => (row.number > best.number ? row : best));
    const reason = highest.id === editedId ? 'é a que você está editando' : highest.invoiceLinked ? 'está numa fatura do cartão' : 'já foi paga';
    return {
      refusal: `Não dá para reduzir para ${nextCount} parcelas: a parcela ${highest.number} ${reason}. O mínimo é ${highest.number} parcelas.`,
    };
  }
  return { plan: { nextCount, deleteIds: tail.map((row) => row.id), create: [] } };
}

/** A despesa em edição como está gravada, para as recusas de quem muda o nº de parcelas. */
export interface CountChangeSubject {
  isInstallment: boolean;
  recurring: boolean;
  groupId: number | null;
  invoiceEditLock: InvoiceEditLock | null;
  paid: boolean;
  /** Comissão gerada por uma receita. */
  hasSourceIncome: boolean;
  /** O total gravado ("N" de "x/N"); nulo fora do parcelado. */
  currentCount: number | null;
}

/**
 * Recusas do pedido (antes das contas da cauda). Numa compra parcelada vale para a compra inteira ("Todas"); na
 * despesa única, que vira a parcela 1, só se ela não está paga nem ligada à fatura. Devolve a mensagem, ou null.
 */
export function installmentCountRefusal(
  subject: CountChangeSubject,
  request: { installmentCount: number; applyTo: ExpenseUpdateScope; paid: boolean },
): string | null {
  if (subject.recurring) return 'A recorrente não tem nº de parcelas: ela segue a fatura do cartão, mês a mês';
  if (subject.isInstallment) {
    if (request.installmentCount === subject.currentCount) return null;
    if (request.applyTo !== 'all') return 'O nº de parcelas vale para a compra inteira: escolha "Todas as parcelas"';
    if (subject.invoiceEditLock === 'generated') return 'Parcela gerada pelo pagamento da fatura: o nº de parcelas não muda';
    if (subject.groupId === null) return 'Esta parcela não está ligada a uma compra: o nº de parcelas não muda';
    return null;
  }
  if (subject.groupId !== null) return 'Esta despesa faz parte de um grupo: ela não vira parcelada';
  if (subject.paid || request.paid) return 'A despesa paga não vira parcelada: lance a compra parcelada de novo';
  if (subject.invoiceEditLock !== null) return 'A despesa ligada à fatura do cartão não vira parcelada';
  if (subject.hasSourceIncome) return 'A despesa gerada por uma receita (comissão) não vira parcelada';
  return null;
}

/** Despesa única que vira a parcela 1 de `count`: as parcelas 2 a `count`, mês a mês a partir do vencimento. */
export function planSingleToInstallments(dueDate: string, count: number): InstallmentCountResult {
  if (!Number.isInteger(count) || count < MIN_INSTALLMENTS || count > MAX_INSTALLMENTS) {
    return { refusal: countRangeRefusal() };
  }
  const create = Array.from({ length: count - 1 }, (_, index): NewInstallment => ({
    number: index + 2,
    dueDate: addMonthsClamped(dueDate, index + 1),
  }));
  return { plan: { nextCount: count, deleteIds: [], create } };
}
