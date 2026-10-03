import { apiRequest, getActiveAccountId } from './apiClient';
import type {
  Attachment, Expense, ExpenseCreateInput, ExpenseUpdateInput, FinanceDashboardData,
  Income, IncomeCreateInput, IncomeUpdateInput, MonthBalance, OpenExpense, PainelData, PainelFiltro,
} from '../types/finance';

interface RawIncome {
  id: number; descricao: string; valor: string | number;
  data_recebimento: string; mes: number; ano: number;
  status?: string | null;
  contrato_id?: number | null;
  observacoes?: string | null; cliente?: string | null;
  classificacao_id?: number | null; classificacao_nome?: string | null; classificacao_pai_nome?: string | null;
  representante_id?: number | null; representante_nome?: string | null;
  valor_comissao?: string | number | null;
  anexos?: Attachment[] | null;
  autor_nome?: string | null;
}

interface RawExpense {
  id: number; descricao: string;
  categoria_nome?: string | null; categoria_pai_nome?: string | null; forma_pagamento?: string | null;
  categoria_id?: number | null; cartao_id?: number | null; cartao_nome?: string | null;
  usuario_id?: number; cartao_dono_id?: number | null; cartao_dono_nome?: string | null;
  data_vencimento: string; data_compra?: string | null; data_pagamento?: string | null;
  mes: number; ano: number; status?: string | null; pago?: boolean; parcelado?: boolean; recorrente?: boolean;
  numero_parcelas?: number | null; parcela_atual?: number | null; observacoes?: string | null;
  grupo_parcelamento_id?: number | null;
  valor_original?: string | null; valor_pago?: string | null;
  numero_nf?: string | null; data_emissao_nf?: string | null;
  data_criacao?: string | null;
  autor_nome?: string | null;
  anexos?: Attachment[] | null;
}

interface RawBalance {
  saldo_anterior?: string | number;
  receitas?: string | number;
  despesas?: string | number;
  despesas_pagas?: string | number;
  saldo_final?: string | number;
}

function asNumber(v: string | number | null | undefined) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function appendProfile(q: URLSearchParams) {
  const id = getActiveAccountId();
  if (id) q.set('conta_id', String(id));
}

function incomeFromApi(r: RawIncome): Income {
  return {
    id: r.id, descricao: r.descricao, valor: asNumber(r.valor),
    data: r.data_recebimento, mes: r.mes, ano: r.ano,
    status: (r.status as 'ativa' | 'cancelada' | 'prevista' | 'faturada') ?? 'ativa',
    contratoId: r.contrato_id ?? null,
    observacoes: r.observacoes, cliente: r.cliente,
    classificacaoId: r.classificacao_id ?? null,
    classificacaoNome: r.classificacao_nome ?? null,
    classificacaoPai: r.classificacao_pai_nome ?? null,
    representanteId: r.representante_id ?? null,
    representanteNome: r.representante_nome ?? null,
    autorNome: r.autor_nome ?? null,
    valorComissao: r.valor_comissao != null ? asNumber(r.valor_comissao) : null,
    anexos: Array.isArray(r.anexos) ? r.anexos : null,
  };
}

function expenseFromApi(r: RawExpense): Expense {
  const parcela = r.parcelado && r.parcela_atual && r.numero_parcelas
    ? `${r.parcela_atual}/${r.numero_parcelas}` : null;

  // O valor da linha é sempre o da parcela/período — em parcelada, cada linha
  // já nasce com o valor dividido.
  const valorFinal = asNumber(r.valor_original);

  return {
    id: r.id, descricao: r.descricao,
    valorFinal,
    categoria: r.categoria_nome ?? 'Sem categoria',
    categoriaId: r.categoria_id ?? null,
    categoriaPai: r.categoria_pai_nome ?? null,
    formaPagamento: r.forma_pagamento ?? 'dinheiro',
    cartaoId: r.cartao_id ?? null,
    cartaoNome: r.cartao_nome ?? null,
    autorId: r.usuario_id ?? null,
    // Compra no cartão de outra pessoa sai da renda do dono do cartão.
    pagadorId: r.cartao_dono_id ?? r.usuario_id ?? null,
    pagadorNome: r.cartao_dono_id != null ? r.cartao_dono_nome ?? null : r.autor_nome ?? null,
    dataVencimento: r.data_vencimento, dataCompra: r.data_compra,
    dataCriacao: r.data_criacao ?? null,
    autorNome: r.autor_nome ?? null,
    dataPagamento: r.data_pagamento, mes: r.mes, ano: r.ano,
    status: (r.status as 'ativa' | 'cancelada') ?? 'ativa',
    pago: r.pago === true, recorrente: r.recorrente === true, parcelado: r.parcelado === true,
    parcela, grupoParcelamentoId: r.grupo_parcelamento_id ?? null,
    observacoes: r.observacoes,
    valorOriginal: r.valor_original ? asNumber(r.valor_original) : null,
    valorPago: r.valor_pago != null ? asNumber(r.valor_pago) : null,
    numeroNf: r.numero_nf ?? null,
    dataEmissaoNf: r.data_emissao_nf ?? null,
    anexos: Array.isArray(r.anexos) ? r.anexos : null,
  };
}

/**
 * Que lançamentos buscar: quem só tem permissão de despesas (ou só de receitas)
 * não pede o outro lado, que o servidor recusaria e derrubaria a busca inteira.
 */
export type DashboardEntries = 'all' | 'incomes' | 'expenses';

// `escopo: 'familia'` traz também os lançamentos dos demais membros/
// colaboradores com permissão de carteira compartilhada. Sem ele (padrão),
// só os próprios lançamentos.
export async function fetchFinanceDashboard(
  month: number, year: number, escopo?: 'familia', entries: DashboardEntries = 'all',
): Promise<FinanceDashboardData> {
  const q = new URLSearchParams({ mes: String(month), ano: String(year) });
  if (escopo) q.set('escopo', escopo);
  appendProfile(q);
  const [incomes, expenses, balance] = await Promise.all([
    entries !== 'expenses' ? apiRequest<RawIncome[]>(`/incomes?${q}`) : Promise.resolve([]),
    entries !== 'incomes' ? apiRequest<RawExpense[]>(`/expenses?${q}`) : Promise.resolve([]),
    fetchMonthBalance(month, year),
  ]);
  return { incomes: incomes.map(incomeFromApi), expenses: expenses.map(expenseFromApi), balance };
}

async function fetchMonthBalance(month: number, year: number): Promise<MonthBalance> {
  const q = new URLSearchParams();
  appendProfile(q);
  const suffix = q.toString() ? `?${q}` : '';
  const b = await apiRequest<RawBalance>(`/meses/${year}/${month}/saldo${suffix}`);
  return {
    saldoAnterior: asNumber(b.saldo_anterior),
    receitas: asNumber(b.receitas),
    despesas: asNumber(b.despesas),
    despesasPagas: asNumber(b.despesas_pagas),
    saldoFinal: asNumber(b.saldo_final),
  };
}

/**
 * Checagem ao abrir o sistema: lança as receitas fixas do mês que a rotina
 * diária ainda não lançou (só as configuradas por quem está usando).
 */
export async function processarReceitasFixas(): Promise<{ launched: number; pushSent: number }> {
  return apiRequest<{ launched: number; pushSent: number }>('/incomes/fixas/processar', { method: 'POST' });
}

/** Receita prevista/faturada passa a recebida (mesma ação da lista de receitas). */
export async function receberReceita(id: number): Promise<void> {
  return apiRequest<void>(`/incomes/${id}/receber`, { method: 'PUT' });
}

export async function deleteIncome(id: number) {
  return apiRequest<void>(`/incomes/${id}`, { method: 'DELETE' });
}

/** Grava a receita e, com "Repetir até", as réplicas mensais, de uma vez (o servidor usa uma transação). */
export async function createIncome(input: IncomeCreateInput): Promise<void> {
  await apiRequest<unknown>('/incomes', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateIncome(id: number, input: IncomeUpdateInput): Promise<void> {
  await apiRequest<unknown>(`/incomes/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

/** Grava a despesa inteira de uma vez: a única, as 12 ocorrências da mensal ou todas as parcelas. */
export async function createExpense(input: ExpenseCreateInput): Promise<void> {
  await apiRequest<unknown>('/expenses', { method: 'POST', body: JSON.stringify(input) });
}

export async function updateExpense(id: number, input: ExpenseUpdateInput): Promise<void> {
  await apiRequest<unknown>(`/expenses/${id}`, { method: 'PUT', body: JSON.stringify(input) });
}

// `id` e sempre a parcela ancora (usada pelo backend pra resolver dono/grupo).
// `ids`, quando informado, exclui exatamente essas parcelas do grupo — usado
// pela grade de multi-selecao. `deleteGroup` continua excluindo o grupo
// inteiro, como antes.
export async function deleteExpense(id: number, options?: { deleteGroup?: boolean; ids?: number[] }) {
  const params = new URLSearchParams();
  if (options?.ids?.length) params.set('ids', options.ids.join(','));
  else if (options?.deleteGroup) params.set('delete_group', 'true');
  const suffix = params.toString() ? `?${params}` : '';
  return apiRequest<void>(`/expenses/${id}${suffix}`, { method: 'DELETE' });
}

// Todas as parcelas de um parcelamento, para a grade de exclusao/cancelamento.
export async function fetchExpenseGroup(grupoId: number): Promise<Expense[]> {
  const rows = await apiRequest<RawExpense[]>(`/expenses/group/${grupoId}`);
  return rows.map(expenseFromApi);
}

// `id` e sempre a parcela ancora. `ids`, quando informado, cancela
// exatamente essas parcelas do grupo — usado pela grade de multi-selecao.
export async function cancelarDespesa(id: number, options?: { ids?: number[] }) {
  const params = new URLSearchParams();
  if (options?.ids?.length) params.set('ids', options.ids.join(','));
  const suffix = params.toString() ? `?${params}` : '';
  return apiRequest<void>(`/expenses/${id}/cancelar${suffix}`, { method: 'PUT' });
}

export async function pagarDespesa(id: number, dataPagamento: string, valorPago: number) {
  return apiRequest<void>(`/expenses/${id}/pay`, {
    method: 'POST',
    body: JSON.stringify({ data_pagamento: dataPagamento, valor_pago: valorPago }),
  });
}

/** Despesas a pagar pelo chip "Pagar despesa" do assistente: vencidas e as do mês, a próxima de cada parcelamento. */
export async function fetchDespesasEmAberto(contaId: number | null): Promise<OpenExpense[]> {
  const q = new URLSearchParams();
  if (contaId) q.set('conta_id', String(contaId));
  const suffix = q.toString() ? `?${q}` : '';
  return apiRequest<OpenExpense[]>(`/expenses/em-aberto${suffix}`);
}

export async function moverDespesa(id: number) {
  return apiRequest<void>(`/expenses/${id}/mover`, { method: 'POST' });
}

export interface ContratoFaturamento {
  contratoId: number;
  clienteNome: string;
  contratoDescricao: string | null;
  valorMensal: number;
  receitaId: number | null;
  receitaStatus: 'ativa' | 'prevista' | 'faturada' | 'cancelada' | null;
}

export async function getContratosFaturamento(mes: number, ano: number): Promise<ContratoFaturamento[]> {
  const q = new URLSearchParams({ mes: String(mes), ano: String(ano) });
  const rows = await apiRequest<Array<{
    contrato_id: number;
    cliente_nome: string;
    contrato_descricao: string | null;
    valor_mensal: string | number;
    receita_id: number | null;
    receita_status: string | null;
  }>>(`/contratos/faturamento?${q}`);

  return rows.map((r) => ({
    contratoId: r.contrato_id,
    clienteNome: r.cliente_nome,
    contratoDescricao: r.contrato_descricao,
    valorMensal: asNumber(r.valor_mensal),
    receitaId: r.receita_id ?? null,
    receitaStatus: (r.receita_status as ContratoFaturamento['receitaStatus']) ?? null,
  }));
}


/**
 * Painel financeiro de um período (datas ISO inclusivas). `membroId`:
 * ausente = só o próprio usuário; null = todas as pessoas visíveis; lista =
 * exatamente essas pessoas (membro_id repetido na query string).
 */
export async function fetchPainel(filtro: PainelFiltro): Promise<PainelData> {
  const q = new URLSearchParams({ de: filtro.de, ate: filtro.ate });
  if (filtro.membroId === null) q.set('membro_id', 'familia');
  else if (filtro.membroId) {
    for (const id of filtro.membroId) q.append('membro_id', String(id));
  }
  appendProfile(q);
  return apiRequest<PainelData>(`/financial/painel?${q}`);
}
