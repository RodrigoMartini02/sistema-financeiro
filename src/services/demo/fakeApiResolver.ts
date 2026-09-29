import {
  createDemoFakeDatabase, generateId, todayIso, currentMonthYear,
  type DemoFakeDatabase,
} from './demoFakeDatabase';
import type { Report, ReportExpense, ReportIncome } from '../../types/reports';

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
  if (matchEndpoint(endpoint, /^\/receitas$/) && method === 'GET') {
    return db.receitas;
  }
  if (matchEndpoint(endpoint, /^\/receitas$/) && method === 'POST') {
    const body = parseBody<Record<string, unknown>>(init);
    const { mes, ano } = currentMonthYear();
    const novaReceita = {
      id: generateId(),
      descricao: String(body.descricao ?? ''),
      valor: Number(body.valor ?? 0),
      data_recebimento: String(body.data_recebimento ?? todayIso()),
      mes: Number(body.mes ?? mes),
      ano: Number(body.ano ?? ano),
      status: 'ativa',
      contrato_id: null,
      observacoes: (body.observacoes as string | null) ?? null,
      cliente: (body.cliente as string | null) ?? null,
      classificacao_id: null,
      classificacao_nome: null,
      representante_id: null,
      representante_nome: null,
      valor_comissao: null,
      anexos: null,
    };
    db.receitas = [novaReceita, ...db.receitas];
    return novaReceita;
  }
  const receitaIdMatch = matchEndpoint(endpoint, /^\/receitas\/(\d+)$/);
  if (receitaIdMatch && method === 'DELETE') {
    const id = Number(receitaIdMatch[1]);
    db.receitas = db.receitas.filter((item) => item.id !== id);
    return undefined;
  }
  if (receitaIdMatch && method === 'PUT') {
    const id = Number(receitaIdMatch[1]);
    const body = parseBody<Record<string, unknown>>(init);
    db.receitas = db.receitas.map((item) =>
      item.id === id
        ? {
            ...item,
            descricao: String(body.descricao ?? item.descricao),
            valor: Number(body.valor ?? item.valor),
            data_recebimento: String(body.data_recebimento ?? item.data_recebimento),
          }
        : item,
    );
    return db.receitas.find((item) => item.id === id);
  }

  // Despesas
  if (matchEndpoint(endpoint, /^\/despesas$/) && method === 'GET') {
    return db.despesas;
  }
  if (matchEndpoint(endpoint, /^\/despesas$/) && method === 'POST') {
    const body = parseBody<Record<string, unknown>>(init);
    const { mes, ano } = currentMonthYear();
    const categoria = db.categorias.find((c) => c.id === Number(body.categoria_id));
    const valorFinal = Number(body.valor_original ?? 0);
    const novaDespesa = {
      id: generateId(),
      descricao: String(body.descricao ?? ''),
      categoria_nome: categoria?.nome ?? null,
      categoria_id: categoria?.id ?? null,
      forma_pagamento: String(body.forma_pagamento ?? 'dinheiro'),
      cartao_id: (body.cartao_id as number | null) ?? null,
      data_vencimento: String(body.data_vencimento ?? todayIso()),
      data_compra: (body.data_compra as string | null) ?? null,
      data_pagamento: body.pago ? String(body.data_vencimento ?? todayIso()) : null,
      mes: Number(body.mes ?? mes),
      ano: Number(body.ano ?? ano),
      status: 'ativa',
      pago: Boolean(body.pago),
      parcelado: Boolean(body.parcelado),
      recorrente: Boolean(body.recorrente),
      numero_parcelas: (body.total_parcelas as number | null) ?? null,
      parcela_atual: body.parcelado ? 1 : null,
      observacoes: (body.observacoes as string | null) ?? null,
      valor_original: Number(body.valor_original ?? valorFinal),
      numero_nf: null,
      data_emissao_nf: null,
      anexos: null,
    };
    db.despesas = [novaDespesa, ...db.despesas];
    return novaDespesa;
  }
  const despesaIdMatch = matchEndpoint(endpoint, /^\/despesas\/(\d+)$/);
  if (despesaIdMatch && method === 'DELETE') {
    const id = Number(despesaIdMatch[1]);
    db.despesas = db.despesas.filter((item) => item.id !== id);
    return undefined;
  }
  const despesaPayMatch = matchEndpoint(endpoint, /^\/despesas\/(\d+)\/pay$/);
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

  // Sugestões de autocomplete — sem sugestões na demo
  if (matchEndpoint(endpoint, /^\/expenses\/suggestions$/)) {
    return { matches: [], forma_pagamento_sugerida: null, cartao_sugerido: null };
  }
  if (matchEndpoint(endpoint, /^\/incomes\/suggestions$/)) {
    return { matches: [], forma_pagamento_sugerida: null, cliente_sugerido: null };
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

  // Ações sem efeito real na demo (faturamento) — apenas simula sucesso
  if (matchEndpoint(endpoint, /\/faturar$/)) return undefined;

  return undefined;
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
