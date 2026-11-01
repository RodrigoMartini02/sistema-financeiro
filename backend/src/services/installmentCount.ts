// Nº de parcelas na edição da compra parcelada e a despesa única que vira parcelada (plano
// .plans/financas-pendencias.md, E4). Regras sem acesso ao banco: o servidor as aplica depois de travar a compra,
// na mesma transação da edição, com as linhas lidas FOR UPDATE.
// - Só mexe em parcela aberta: a paga e a ligada a pagamento de fatura nunca são apagadas nem regravadas (o rótulo
//   "x/N" das que ficam passa a ser o novo N).
// - Aumentar cria as parcelas novas continuando o calendário da última, com o valor da editada e sem juros.
// - Reduzir apaga a cauda de parcelas abertas; se alguma da cauda está paga, na fatura ou é a editada, recusa e diz
//   até quantas dá para reduzir.
// - A despesa única vira a parcela 1 e mantém o ID. Em aberto, o valor informado é o de cada parcela (a compra passa
//   a valer N vezes); paga, o valor informado é o total, e ele e o pagamento são divididos entre as parcelas, todas
//   pagas na data do pagamento original: o caixa do mês não muda.
import { addMonthsClamped } from '../utils/date';
import type { InvoiceEditLock } from './cardInvoiceRules';
import { MAX_INSTALLMENTS, MIN_INSTALLMENTS, type ExpenseUpdateScope, type InstallmentAmountMode } from './expenseInput';
import { splitCents, splitInterestWithinInstallments } from './installmentSplit';

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
  /** Estava paga ANTES desta edição. */
  paid: boolean;
  /** Crédito com cartão: o pagamento é pela fatura. */
  creditWithCard: boolean;
  /** Comissão gerada por uma receita. */
  hasSourceIncome: boolean;
  /** O total gravado ("N" de "x/N"); nulo fora do parcelado. */
  currentCount: number | null;
}

/**
 * Recusas do pedido (antes das contas da cauda). Numa compra parcelada vale para a compra inteira ("Todas"); na
 * despesa única, que vira a parcela 1: não pode estar em grupo, ligada à fatura nem vir de comissão, a edição não pode
 * mudar o pagamento (paga ou não) junto da conversão, e a paga só vira parcelada dividindo o valor total.
 * Devolve a mensagem, ou null.
 */
export function installmentCountRefusal(
  subject: CountChangeSubject,
  request: { installmentCount: number; applyTo: ExpenseUpdateScope; paid: boolean; amountMode?: InstallmentAmountMode },
): string | null {
  if (subject.recurring) return 'A recorrente não tem nº de parcelas: ela segue a fatura do cartão, mês a mês';
  if (subject.isInstallment) {
    if (request.amountMode === 'total') return 'O valor total só vale para a despesa única que vira parcelada';
    if (request.installmentCount === subject.currentCount) return null;
    if (request.applyTo !== 'all') return 'O nº de parcelas vale para a compra inteira: escolha "Todas as parcelas"';
    if (subject.invoiceEditLock === 'generated') return 'Parcela gerada pelo pagamento da fatura: o nº de parcelas não muda';
    if (subject.groupId === null) return 'Esta parcela não está ligada a uma compra: o nº de parcelas não muda';
    return null;
  }
  if (subject.groupId !== null) return 'Esta despesa faz parte de um grupo: ela não vira parcelada';
  if (subject.invoiceEditLock !== null) return 'A despesa ligada à fatura do cartão não vira parcelada';
  if (subject.hasSourceIncome) return 'A despesa gerada por uma receita (comissão) não vira parcelada';
  if (subject.paid !== request.paid) return 'Salve a mudança do pagamento antes de parcelar a despesa';
  if (subject.paid) {
    if (subject.creditWithCard) return 'A despesa paga no crédito com cartão é paga pela fatura: ela não vira parcelada';
    if (request.amountMode !== 'total') return 'A despesa paga vira parcelada dividindo o valor total: informe o total da compra';
  }
  return null;
}

/** O que cada parcela guarda quando a despesa única vira parcelada; a parcela 1 é a própria despesa (mantém o ID). */
export interface ConvertedInstallment {
  number: number;
  dueDate: string;
  amountCents: number;
  /** Valor pago da parcela; nulo na parcela em aberto. */
  paidCents: number | null;
  interestCents: number;
}

export interface SingleConversionPlan {
  nextCount: number;
  /** Da parcela 1 à N, em ordem. */
  installments: ConvertedInstallment[];
}

/**
 * Divide o valor pago na proporção das parcelas, em centavos: cada uma leva `pago × parcela ÷ total` (para baixo) e a
 * última fica com o que sobrar, então a soma é exatamente o valor pago. Juros e desconto andam junto.
 */
function splitPaidCents(paidCents: number, amountsInCents: number[], totalCents: number): number[] {
  let remaining = paidCents;
  return amountsInCents.map((amountCents, index) => {
    const share = index === amountsInCents.length - 1
      ? remaining
      : Number((BigInt(paidCents) * BigInt(amountCents)) / BigInt(totalCents));
    remaining -= share;
    return share;
  });
}

/**
 * Despesa única que vira a parcela 1 de `count`, com as demais vencendo mês a mês a partir do vencimento dela.
 * - `perInstallment` (em aberto): o valor informado é o de cada parcela; a compra passa a valer `count` vezes. Quem já
 *   está paga não entra aqui: multiplicaria o que foi pago.
 * - `total`: o valor informado é o total da compra e é dividido em centavos, com a diferença na última. O valor pago
 *   (se houver) e o juros guardado se dividem na mesma proporção, e a soma de cada um não muda.
 */
export function planSingleConversion(input: {
  dueDate: string;
  count: number;
  mode: InstallmentAmountMode;
  /** O valor da despesa como ficou na edição: o da parcela (`perInstallment`) ou o total (`total`). */
  amountCents: number;
  /** Valor pago da despesa paga; nulo se está em aberto. */
  paidCents: number | null;
  /** Juros que a despesa já guarda (a linha de juros embutido); zero na despesa comum. */
  interestCents: number;
}): { plan: SingleConversionPlan } | { refusal: string } {
  const { dueDate, count, mode, amountCents, paidCents, interestCents } = input;
  if (!Number.isInteger(count) || count < MIN_INSTALLMENTS || count > MAX_INSTALLMENTS) {
    return { refusal: countRangeRefusal() };
  }
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return { refusal: 'Informe o valor da despesa' };
  const dueDateOf = (number: number) => (number === 1 ? dueDate : addMonthsClamped(dueDate, number - 1));

  if (mode === 'perInstallment') {
    if (paidCents !== null) return { refusal: 'A despesa paga vira parcelada dividindo o valor total: informe o total da compra' };
    return {
      plan: {
        nextCount: count,
        installments: Array.from({ length: count }, (_, index): ConvertedInstallment => ({
          number: index + 1,
          dueDate: dueDateOf(index + 1),
          amountCents,
          paidCents: null,
          interestCents: index === 0 ? interestCents : 0,
        })),
      },
    };
  }

  if (amountCents < count) return { refusal: 'O total precisa permitir pelo menos R$ 0,01 por parcela' };
  const amounts = splitCents(amountCents, count);
  const paid = paidCents === null ? null : splitPaidCents(paidCents, amounts, amountCents);
  const interests = splitInterestWithinInstallments(Math.min(interestCents, amountCents), amounts);
  return {
    plan: {
      nextCount: count,
      installments: amounts.map((amount, index): ConvertedInstallment => ({
        number: index + 1,
        dueDate: dueDateOf(index + 1),
        amountCents: amount,
        paidCents: paid === null ? null : paid[index]!,
        interestCents: interests[index]!,
      })),
    },
  };
}
