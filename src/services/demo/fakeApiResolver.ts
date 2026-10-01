import {
  createDemoFakeDatabase, generateId, todayIso,
  type DemoFakeDatabase, type RawExpenseDemo, type RawIncomeDemo,
} from './demoFakeDatabase';
import type { ExpenseCreateInput, IncomeCreateInput, IncomeUpdateInput } from '../../types/finance';
import { PERMISSION_FLAGS } from '../../types/permissions';
import type { Report, ReportExpense, ReportIncome } from '../../types/reports';
import { addMonthsClamped } from '../../utils/expenseSchedule';

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
          mes: month! - 1, ano: year!, cliente: input.client, classificacao_id: input.categoryId,
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
    db.despesas = db.despesas.map((item) =>
      item.id === id
        ? { ...item, pago: true, data_pagamento: String(body.data_pagamento ?? todayIso()) }
        : item,
    );
    return undefined;
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
  if (matchEndpoint(endpoint, /^\/clientes$/)) return [];
  if (matchEndpoint(endpoint, /^\/contratos$/)) return [];
  if (matchEndpoint(endpoint, /^\/contratos\/faturamento$/)) return [];

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

/** As mesmas linhas que o backend grava: a receita e uma cópia por mês até "Repetir até". */
function buildDemoIncomeRows(input: IncomeCreateInput): RawIncomeDemo[] {
  const row = (receiptDate: string): RawIncomeDemo => {
    const [year, month] = receiptDate.split('-').map(Number);
    return {
      id: generateId(), descricao: input.description, valor: input.amount, data_recebimento: receiptDate,
      mes: month! - 1, ano: year!, status: 'ativa', contrato_id: input.billableHours?.contractId ?? null,
      observacoes: null, cliente: input.client, classificacao_id: input.categoryId, classificacao_nome: null,
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
        amount: row.valor_original ?? 0,
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
      client: row.cliente,
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
