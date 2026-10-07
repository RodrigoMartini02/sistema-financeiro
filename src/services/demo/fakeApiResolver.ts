import {
  createDemoFakeDatabase, generateId, todayIso,
  type DemoFakeDatabase, type RawExpenseDemo, type RawIncomeDemo,
} from './demoFakeDatabase';
import type {
  CardInvoice, ExpenseCreateInput, IncomeCreateInput, IncomeUpdateInput, InvoicePaymentEntry, InvoicePaymentInput,
} from '../../types/finance';
import { PERMISSION_FLAGS } from '../../types/permissions';
import type { Report, ReportExpense, ReportIncome } from '../../types/reports';
import {
  installmentAmountsOf, invoiceDueDate, invoiceMonthLabel, isCreditWithCard, summarizeInvoicePayment,
} from '../../utils/cardInvoice';
import { addMonthsClamped, splitAmountInCents } from '../../utils/expenseSchedule';

export interface FakeApiRequestInit {
  method?: string;
  body?: string;
}

function parseBody<T>(init?: FakeApiRequestInit): T {
  return init?.body ? (JSON.parse(init.body) as T) : ({} as T);
}

function matchEndpoint(endpoint: string, pattern: RegExp) {
  const path = endpoint.split('?')[0];
  return path.match(pattern);
}

/**
 * Resolve um endpoint da API contra o banco fake em memória, no mesmo formato bruto
 * que a API real devolveria — para que o parsing existente nos services reais
 * (incomeFromApi, expenseFromApi, etc.) funcione sem duplicação.
 */
export function resolveFakeApiRequest(
  db: DemoFakeDatabase,
  endpoint: string,
  init?: FakeApiRequestInit,
): unknown {
  const method = (init?.method ?? 'GET').toUpperCase();

  // Receitas
  if (matchEndpoint(endpoint, /^\/incomes$/) && method === 'GET') {
    return db.receitas;
  }
  if (matchEndpoint(endpoint, /^\/incomes$/) && method === 'POST') {
    const created = buildDemoIncomeRows(parseBody<IncomeCreateInput>(init));
    db.receitas = [...created, ...db.receitas];
    return created[0];
  }
  // Sugestões e duplicata — sem histórico na demo
  if (matchEndpoint(endpoint, /^\/incomes\/suggestions$/)) {
    return { matches: [], lastAmount: null };
  }
  if (matchEndpoint(endpoint, /^\/incomes\/duplicate$/)) {
    return { duplicate: null };
  }
  const receitaIdMatch = matchEndpoint(endpoint, /^\/incomes\/(\d+)$/);
  if (receitaIdMatch && method === 'DELETE') {
    const id = Number(receitaIdMatch[1]);
    db.receitas = db.receitas.filter((item) => item.id !== id);
    return undefined;
  }
  if (receitaIdMatch && method === 'PUT') {
    const id = Number(receitaIdMatch[1]);
    const input = parseBody<IncomeUpdateInput>(init);
    const [year, month] = input.receiptDate.split('-').map(Number);
    db.receitas = db.receitas.map((item) => (item.id === id
      ? {
          ...item, descricao: input.description, valor: input.amount, data_recebimento: input.receiptDate,
          mes: month! - 1, ano: year!, cliente_id: input.clientId, classificacao_id: input.categoryId,
          representante_id: input.representativeId,
        }
      : item));
    return db.receitas.find((item) => item.id === id);
  }

  // Despesas
  if (matchEndpoint(endpoint, /^\/expenses$/) && method === 'GET') {
    return db.despesas;
  }
  if (matchEndpoint(endpoint, /^\/expenses$/) && method === 'POST') {
    const created = buildDemoExpenseRows(db, parseBody<ExpenseCreateInput>(init));
    db.despesas = [...created, ...db.despesas];
    return created[0];
  }
  // Sugestões e duplicata — sem histórico na demo
  if (matchEndpoint(endpoint, /^\/expenses\/suggestions$/)) {
    return { matches: [], lastAmount: null, suggestedPaymentMethod: null, preferredCardIds: { debito: null, credito: null } };
  }
  if (matchEndpoint(endpoint, /^\/expenses\/duplicate$/)) {
    return { duplicate: null };
  }
  const despesaIdMatch = matchEndpoint(endpoint, /^\/expenses\/(\d+)$/);
  if (despesaIdMatch && method === 'DELETE') {
    const id = Number(despesaIdMatch[1]);
    db.despesas = db.despesas.filter((item) => item.id !== id);
    return undefined;
  }
  const despesaPayMatch = matchEndpoint(endpoint, /^\/expenses\/(\d+)\/pay$/);
  if (despesaPayMatch && method === 'POST') {
    const id = Number(despesaPayMatch[1]);
    const body = parseBody<Record<string, unknown>>(init);
    const target = db.despesas.find((item) => item.id === id);
    if (target && isCreditWithCard({ formaPagamento: target.forma_pagamento, cartaoId: target.cartao_id })) {
      throw new Error('Despesa no crédito é paga pela fatura do cartão.');
    }
    db.despesas = db.despesas.map((item) =>
      item.id === id
        ? { ...item, pago: true, data_pagamento: String(body.data_pagamento ?? todayIso()) }
        : item,
    );
    return undefined;
  }

  // Pagamento da fatura do cartão: faturas do mês, pagar e desfazer
  if (matchEndpoint(endpoint, /^\/card-invoices$/) && method === 'GET') {
    const month = new URLSearchParams(endpoint.split('?')[1] ?? '').get('invoice_month') ?? '';
    return demoCardInvoices(db, month);
  }
  if (matchEndpoint(endpoint, /^\/card-invoices\/payments$/) && method === 'POST') {
    const input = parseBody<InvoicePaymentInput>(init);
    demoPayInvoice(db, input);
    return demoCardInvoices(db, input.invoiceMonth).find((invoice) => invoice.card.id === input.cardId) ?? null;
  }
  const invoicePaymentMatch = matchEndpoint(endpoint, /^\/card-invoices\/payments\/(\d+)$/);
  if (invoicePaymentMatch && method === 'DELETE') {
    const payment = demoUndoInvoicePayment(db, Number(invoicePaymentMatch[1]));
    return demoCardInvoices(db, payment.invoiceMonth).find((invoice) => invoice.card.id === payment.cardId) ?? null;
  }

  // Saldo do mês — calculado a partir do estado fake
  if (matchEndpoint(endpoint, /^\/meses\/\d+\/\d+\/saldo$/)) {
    const totalReceitas = db.receitas.reduce((sum, item) => sum + item.valor, 0);
    const totalDespesas = db.despesas.reduce((sum, item) => sum + (item.valor_original ?? 0), 0);
    return {
      saldo_anterior: 0,
      receitas: totalReceitas,
      despesas: totalDespesas,
      saldo_final: totalReceitas - totalDespesas,
    };
  }

  // Categorias
  if (matchEndpoint(endpoint, /^\/categorias$/) && method === 'GET') {
    return db.categorias;
  }
  if (matchEndpoint(endpoint, /^\/categorias$/) && method === 'POST') {
    const body = parseBody<Record<string, unknown>>(init);
    const novaCategoria = {
      id: generateId(),
      nome: String(body.nome ?? ''),
      cor: null,
      icone: null,
      forma_favorita: null,
      cartao_favorito_id: null,
      cartao_favorito_nome: null,
      parent_id: (body.parent_id as number | null) ?? null,
      tipo_despesa: null,
      ativo: true,
      data_criacao: todayIso(),
    };
    db.categorias = [...db.categorias, novaCategoria];
    return novaCategoria;
  }

  // Cartões
  if (matchEndpoint(endpoint, /^\/cartoes$/) && method === 'GET') {
    return db.cartoes;
  }

  // Compromissos/agenda — sem dado relevante na demo
  if (matchEndpoint(endpoint, /^\/appointments$/) && method === 'GET') {
    return [];
  }
  if (matchEndpoint(endpoint, /^\/appointments$/) && method === 'POST') {
    const body = parseBody<Record<string, unknown>>(init);
    return { id: generateId(), ...body };
  }
  const appointmentIdMatch = matchEndpoint(endpoint, /^\/appointments\/(\d+)$/);
  if (appointmentIdMatch) {
    return undefined;
  }

  // Quem usa a demo é titular: tudo liberado
  if (matchEndpoint(endpoint, /^\/account-members\/me\/permissions$/)) {
    return Object.fromEntries(PERMISSION_FLAGS.map((flag) => [flag, true]));
  }

  // Listas auxiliares sem dado relevante na demo — devolver vazio
  if (matchEndpoint(endpoint, /^\/representantes$/)) return { success: true, data: [] };
  if (matchEndpoint(endpoint, /^\/income-classifications$/)) return [];
  // Clientes, contratos e catálogo de serviços: a demo não tem cadastro de clientes.
  if (matchEndpoint(endpoint, /^\/clients$/)) return [];
  if (matchEndpoint(endpoint, /^\/clients\/summary$/)) {
    return { monthlyRecurring: 0, expiringContracts: 0, overdueCount: 0, overdueAmount: 0 };
  }
  if (matchEndpoint(endpoint, /^\/contracts$/)) return [];
  if (matchEndpoint(endpoint, /^\/contracts\/with-hours$/)) return [];
  if (matchEndpoint(endpoint, /^\/contracts\/portfolio$/)) return [];
  if (matchEndpoint(endpoint, /^\/service-catalog$/)) return [];

  // Relatório do período — só período e tipo; os demais filtros não se aplicam na demo
  if (matchEndpoint(endpoint, /^\/reports$/) && method === 'GET') {
    return buildDemoReport(db, new URLSearchParams(endpoint.split('?')[1] ?? ''));
  }

  return undefined;
}

/** As mesmas linhas que o backend grava: a única, as 12 ocorrências da mensal ou uma por parcela. */
function buildDemoExpenseRows(db: DemoFakeDatabase, input: ExpenseCreateInput): RawExpenseDemo[] {
  const category = db.categorias.find((item) => item.id === input.categoryId);
  const card = db.cartoes.find((item) => item.id === input.cardId);
  const row = (
    dueDate: string, amount: number, paid: boolean, paymentDate: string | null, extra: Partial<RawExpenseDemo>,
  ): RawExpenseDemo => {
    const [year, month] = dueDate.split('-').map(Number);
    return {
      id: generateId(), descricao: input.description, categoria_id: input.categoryId, categoria_nome: category?.nome ?? null,
      forma_pagamento: input.paymentMethod, cartao_id: input.cardId, cartao_nome: card?.nome ?? null,
      data_vencimento: dueDate, data_compra: input.purchaseDate, data_pagamento: paid ? paymentDate ?? dueDate : null,
      mes: month! - 1, ano: year!, status: 'ativa', pago: paid, parcelado: false, recorrente: false,
      numero_parcelas: null, parcela_atual: null, observacoes: null, valor_original: amount,
      numero_nf: null, data_emissao_nf: null, anexos: null,
      ...extra,
    };
  };

  if (input.billingType === 'installments') {
    return input.installments.map((item, index) => row(item.dueDate, item.amount, item.paid, item.paymentDate, {
      parcelado: true, numero_parcelas: input.installments.length, parcela_atual: index + 1,
    }));
  }
  // Fora do crédito, vencida até hoje já nasce paga, como no backend.
  const paid = input.paid || (input.paymentMethod !== 'credito' && (input.paymentDate ?? input.dueDate) <= todayIso());
  const first = row(input.dueDate, input.amount, paid, input.paymentDate, { recorrente: input.billingType === 'monthly' });
  if (input.billingType === 'single') return [first];
  return [first, ...Array.from({ length: 11 }, (_, index) => (
    row(addMonthsClamped(input.dueDate, index + 1), input.amount, false, null, { recorrente: true })
  ))];
}

interface DemoInvoicePayment extends Omit<InvoicePaymentEntry, 'canUndo' | 'undoBlockedReason'> {
  cardId: number;
  invoiceMonth: string;
}

// Histórico dos pagamentos de fatura da demo, por banco fake (o tipo do banco não muda).
const demoInvoicePayments = new WeakMap<DemoFakeDatabase, DemoInvoicePayment[]>();

function paymentsOf(db: DemoFakeDatabase): DemoInvoicePayment[] {
  const list = demoInvoicePayments.get(db) ?? [];
  demoInvoicePayments.set(db, list);
  return list;
}

const DB_METHOD = { total: 'total', partial: 'parcial', installments: 'parcelado' } as const;

/** Compras em aberto da fatura: no crédito do cartão, ativas e vencendo no mês. */
function demoOpenItems(db: DemoFakeDatabase, cardId: number, invoiceMonth: string): RawExpenseDemo[] {
  return db.despesas
    .filter((row) => row.cartao_id === cardId && row.forma_pagamento === 'credito' && row.status === 'ativa'
      && !row.pago && row.data_vencimento.startsWith(invoiceMonth))
    .sort((left, right) => left.data_vencimento.localeCompare(right.data_vencimento) || left.id - right.id);
}

/** As mesmas faturas que a API devolve, a partir do estado fake. */
function demoCardInvoices(db: DemoFakeDatabase, invoiceMonth: string): CardInvoice[] {
  return db.cartoes
    .filter((card) => card.tipo === null || card.tipo === 'credito' || card.tipo === 'ambos')
    .map((card): CardInvoice => {
      const dueDay = card.dia_vencimento ?? 10;
      const items = demoOpenItems(db, card.id, invoiceMonth);
      const payments = paymentsOf(db)
        .filter((payment) => payment.cardId === card.id && payment.invoiceMonth === invoiceMonth)
        .map((payment): InvoicePaymentEntry => {
          const generated = db.despesas.filter((row) => row.origem_pagamento_fatura_id === payment.id);
          const blocked = generated.some((row) => row.pago && row.pagamento_fatura_id !== payment.id);
          const reason = payment.reversedAt === null && blocked
            ? 'Uma parte desta renegociação já foi paga numa fatura seguinte. Desfaça aquele pagamento antes.'
            : null;
          return { ...payment, canUndo: payment.reversedAt === null && !blocked, undoBlockedReason: reason };
        });
      return {
        card: { id: card.id, name: card.nome, dueDay, ownerName: null },
        dueDate: invoiceDueDate(invoiceMonth, dueDay, 0),
        openTotal: items.reduce((sum, row) => sum + Math.round((row.valor_original ?? 0) * 100), 0) / 100,
        openItems: items.map((row) => ({
          expenseId: row.id,
          description: row.descricao,
          amount: row.valor_original ?? 0,
          dueDate: row.data_vencimento,
          authorName: null,
          installment: row.parcela_atual && row.numero_parcelas ? `${row.parcela_atual}/${row.numero_parcelas}` : null,
        })),
        payments,
      };
    });
}

/** Parte de cada compra num pagamento parcial, com os centavos que sobram na última. */
function demoShares(items: RawExpenseDemo[], paidCents: number): number[] {
  const totalCents = items.reduce((sum, row) => sum + Math.round((row.valor_original ?? 0) * 100), 0);
  const shares = items.map((row) => Math.floor((paidCents * Math.round((row.valor_original ?? 0) * 100)) / totalCents));
  shares[shares.length - 1]! += paidCents - shares.reduce((sum, cents) => sum + cents, 0);
  return shares;
}

/** As mesmas regras do backend (cardInvoiceService), simplificadas, sem banco. */
function demoPayInvoice(db: DemoFakeDatabase, input: InvoicePaymentInput): void {
  const card = db.cartoes.find((item) => item.id === input.cardId);
  if (!card) throw new Error('Cartão não encontrado');
  const items = demoOpenItems(db, card.id, input.invoiceMonth);
  if (items.length === 0) throw new Error('Esta fatura não tem valor em aberto.');
  const purchasesAmount = items.reduce((sum, row) => sum + Math.round((row.valor_original ?? 0) * 100), 0) / 100;
  const summary = summarizeInvoicePayment({
    purchasesAmount,
    method: input.method,
    amountPaid: input.amountPaid ?? 0,
    interestAmount: input.interestAmount ?? 0,
    installmentCount: input.installmentCount ?? 0,
  });
  if (summary.error) throw new Error(summary.error);

  const [year, month] = input.invoiceMonth.split('-').map(Number) as [number, number];
  const paymentId = generateId();
  const dueDay = card.dia_vencimento ?? 10;
  const interest = input.interestAmount ?? 0;
  const paid = input.method === 'installments' ? 0 : input.amountPaid ?? 0;
  paymentsOf(db).unshift({
    id: paymentId,
    cardId: card.id,
    invoiceMonth: input.invoiceMonth,
    method: input.method,
    paymentDate: input.paymentDate,
    purchasesAmount,
    paidAmount: paid,
    chargesAmount: summary.chargesAmount,
    interestAmount: input.method === 'total' ? 0 : interest,
    carriedInterest: 0,
    carriedForward: summary.carriedForward,
    installmentCount: input.method === 'installments' ? input.installmentCount ?? null : null,
    installmentAmount: summary.installmentAmounts[0] ?? null,
    firstDueDate: input.method === 'total' ? null : invoiceDueDate(input.invoiceMonth, dueDay, 1),
    createdAt: `${todayIso()} 00:00:00`,
    registeredByName: 'Você',
    reversedAt: null,
    reversedByName: null,
  });

  const shares = input.method === 'partial' ? demoShares(items, Math.round(paid * 100)) : [];
  const link = {
    pagamento_fatura_id: paymentId,
    pagamento_fatura_forma: DB_METHOD[input.method],
    pagamento_fatura_parcelas: input.method === 'installments' ? input.installmentCount ?? null : null,
    pagamento_fatura_mes: month - 1,
    pagamento_fatura_ano: year,
  };
  const itemIds = new Set(items.map((row) => row.id));
  db.despesas = db.despesas.map((row) => {
    if (!itemIds.has(row.id)) return row;
    const index = items.findIndex((item) => item.id === row.id);
    const valorPago = input.method === 'total' ? row.valor_original : input.method === 'partial' ? (shares[index] ?? 0) / 100 : 0;
    return { ...row, ...link, pago: true, data_pagamento: input.paymentDate, valor_pago: valorPago };
  });

  const label = invoiceMonthLabel(input.invoiceMonth);
  const generatedRow = (
    description: string, dueDate: string, amount: number, interestShare: number, extra: Partial<RawExpenseDemo>,
  ): RawExpenseDemo => {
    const [rowYear, rowMonth] = dueDate.split('-').map(Number) as [number, number];
    return {
      id: generateId(), descricao: `${description} de ${label} — ${card.nome}`, categoria_id: null,
      categoria_nome: 'Renegociação de fatura', forma_pagamento: 'credito', cartao_id: card.id, cartao_nome: card.nome,
      data_vencimento: dueDate, data_compra: input.paymentDate, data_pagamento: null, mes: rowMonth - 1, ano: rowYear,
      status: 'ativa', pago: false, parcelado: false, recorrente: false, numero_parcelas: null, parcela_atual: null,
      observacoes: null, valor_original: amount, numero_nf: null, data_emissao_nf: null, anexos: null,
      origem_pagamento_fatura_id: paymentId, valor_juros_fatura: interestShare,
      ...extra,
    };
  };

  if (input.method === 'total' && summary.chargesAmount > 0) {
    db.despesas = [generatedRow('Encargos da fatura', invoiceDueDate(input.invoiceMonth, dueDay, 0), summary.chargesAmount, summary.chargesAmount, {
      categoria_nome: 'Encargos de cartão', pago: true, data_pagamento: input.paymentDate, valor_pago: summary.chargesAmount, ...link,
    }), ...db.despesas];
  }
  if (input.method === 'partial') {
    db.despesas = [generatedRow('Restante da fatura', invoiceDueDate(input.invoiceMonth, dueDay, 1), summary.carriedForward, interest, {}), ...db.despesas];
  }
  if (input.method === 'installments') {
    const amounts = installmentAmountsOf(summary.carriedForward, input.installmentCount ?? 0);
    const interests = splitAmountInCents(Math.round(interest * 100), amounts.length).map((cents) => cents / 100);
    const groupId = generateId();
    const rows = amounts.map((amount, index) => generatedRow(
      'Parcelamento da fatura', invoiceDueDate(input.invoiceMonth, dueDay, index + 1), amount, Math.min(interests[index] ?? 0, amount),
      { ...(index === 0 ? { id: groupId } : {}), parcelado: true, numero_parcelas: amounts.length, parcela_atual: index + 1, grupo_parcelamento_id: groupId },
    ));
    db.despesas = [...rows, ...db.despesas];
  }
}

function demoUndoInvoicePayment(db: DemoFakeDatabase, paymentId: number): DemoInvoicePayment {
  const payment = paymentsOf(db).find((item) => item.id === paymentId && item.reversedAt === null);
  if (!payment) throw new Error('Pagamento não encontrado');
  const generated = db.despesas.filter((row) => row.origem_pagamento_fatura_id === paymentId);
  if (generated.some((row) => row.pago && row.pagamento_fatura_id !== paymentId)) {
    throw new Error('Uma parte desta renegociação já foi paga numa fatura seguinte. Desfaça aquele pagamento antes.');
  }
  db.despesas = db.despesas
    .filter((row) => row.origem_pagamento_fatura_id !== paymentId)
    .map((row) => (row.pagamento_fatura_id === paymentId
      ? {
          ...row, pago: false, data_pagamento: null, valor_pago: null, pagamento_fatura_id: null, pagamento_fatura_forma: null,
          pagamento_fatura_parcelas: null, pagamento_fatura_mes: null, pagamento_fatura_ano: null,
        }
      : row));
  payment.reversedAt = `${todayIso()} 00:00:00`;
  payment.reversedByName = 'Você';
  return payment;
}

/** As mesmas linhas que o backend grava: a receita e uma cópia por mês até "Repetir até". */
function buildDemoIncomeRows(input: IncomeCreateInput): RawIncomeDemo[] {
  const row = (receiptDate: string): RawIncomeDemo => {
    const [year, month] = receiptDate.split('-').map(Number);
    return {
      id: generateId(), descricao: input.description, valor: input.amount, data_recebimento: receiptDate,
      mes: month! - 1, ano: year!, status: 'ativa', contrato_id: null,
      observacoes: null, cliente_id: input.clientId, cliente_nome: null, classificacao_id: input.categoryId, classificacao_nome: null,
      representante_id: input.representativeId, representante_nome: null, valor_comissao: null, anexos: null,
    };
  };
  const [year, month] = input.receiptDate.split('-').map(Number);
  const replicas = input.repeatUntil
    ? Math.max(0, (input.repeatUntil.year - year!) * 12 + input.repeatUntil.month - (month! - 1))
    : 0;
  return [
    row(input.receiptDate),
    ...Array.from({ length: replicas }, (_, index) => row(addMonthsClamped(input.receiptDate, index + 1))),
  ];
}

const DEMO_PERSON = { id: 0, name: 'Você' };

function buildDemoReport(db: DemoFakeDatabase, params: URLSearchParams): Report {
  const start = params.get('start_date') ?? '';
  const end = params.get('end_date') ?? '';
  const types = params.getAll('type');
  const wants = (type: string) => types.length === 0 || types.includes(type);
  const today = todayIso();
  const categoryName = (id: number | null) => db.categorias.find((category) => category.id === id);

  const expenses: ReportExpense[] = wants('expense') ? db.despesas
    .filter((row) => row.status !== 'cancelada' && row.data_vencimento >= start && row.data_vencimento <= end)
    .map((row) => {
      const category = categoryName(row.categoria_id);
      const group = category?.parent_id ? categoryName(category.parent_id) : undefined;
      return {
        id: row.id,
        description: row.descricao,
        categoryId: row.categoria_id,
        categoryName: row.categoria_nome,
        categoryGroup: group?.nome ?? null,
        paymentMethod: row.forma_pagamento,
        cardId: row.cartao_id,
        cardName: row.cartao_nome ?? null,
        payerId: DEMO_PERSON.id,
        payerName: DEMO_PERSON.name,
        authorId: DEMO_PERSON.id,
        authorName: DEMO_PERSON.name,
        dueDate: row.data_vencimento,
        paymentDate: row.data_pagamento,
        status: row.pago ? 'paid' : row.data_vencimento < today ? 'overdue' : 'on_time',
        installment: row.numero_parcelas ? `${row.parcela_atual ?? 1}/${row.numero_parcelas}` : null,
        recurring: row.recorrente,
        amount: row.pago && row.valor_pago != null ? row.valor_pago : row.valor_original ?? 0,
      };
    }) : [];

  const incomes: ReportIncome[] = wants('income') ? db.receitas
    .filter((row) => row.status !== 'cancelada' && row.data_recebimento >= start && row.data_recebimento <= end)
    .map((row) => ({
      id: row.id,
      description: row.descricao,
      categoryName: row.classificacao_nome,
      categoryGroup: null,
      receiptDate: row.data_recebimento,
      status: row.status === 'ativa' ? 'received' : row.data_recebimento < today ? 'overdue' : 'expected',
      authorId: DEMO_PERSON.id,
      authorName: DEMO_PERSON.name,
      client: row.cliente_nome,
      representative: row.representante_nome,
      commission: row.valor_comissao,
      amount: row.valor,
    })) : [];

  const received = incomes.filter((row) => row.status === 'received');
  return {
    period: { start, end },
    expenses,
    incomes,
    totals: {
      income: received.reduce((sum, row) => sum + row.amount, 0),
      incomeCount: received.length,
      expense: expenses.reduce((sum, row) => sum + row.amount, 0),
      expenseCount: expenses.length,
    },
    filterOptions: {
      paymentMethods: [...new Set(expenses.map((row) => row.paymentMethod))].sort(),
      cards: db.cartoes.map((card) => ({ id: card.id, name: card.nome })),
    },
  };
}

export const resolveDemoRequest = resolveFakeApiRequest;

export function createDemoDatabaseInstance(): DemoFakeDatabase {
  return createDemoFakeDatabase();
}
