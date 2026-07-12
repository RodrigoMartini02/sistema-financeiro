import { apiRequest, getActiveProfileId } from './apiClient';
import type {
  Attachment, Expense, ExpenseFormValues, FinanceDashboardData,
  Income, IncomeFormValues, MonthBalance,
} from '../types/finance';

interface RawIncome {
  id: number; descricao: string; valor: string | number;
  data_recebimento: string; mes: number; ano: number;
  status?: string | null;
  contrato_id?: number | null;
  observacoes?: string | null; cliente?: string | null; tipo_receita?: string | null;
  representante_id?: number | null; representante_nome?: string | null;
  valor_comissao?: string | number | null;
  anexos?: Attachment[] | null;
}

interface RawExpense {
  id: number; descricao: string;
  categoria_nome?: string | null; forma_pagamento?: string | null;
  categoria_id?: number | null; cartao_id?: number | null;
  data_vencimento: string; data_compra?: string | null; data_pagamento?: string | null;
  mes: number; ano: number; status?: string | null; pago?: boolean; parcelado?: boolean; recorrente?: boolean;
  numero_parcelas?: number | null; parcela_atual?: number | null; observacoes?: string | null;
  valor_original?: string | null; valor_final?: string | null;
  numero_nf?: string | null; data_emissao_nf?: string | null; tipo_despesa?: string | null;
  anexos?: Attachment[] | null;
}

interface RawBalance {
  saldo_anterior?: string | number;
  receitas?: string | number;
  despesas?: string | number;
  saldo_final?: string | number;
}

function asNumber(v: string | number | null | undefined) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function appendProfile(q: URLSearchParams) {
  const id = getActiveProfileId();
  if (id) q.set('perfil_id', String(id));
}

function incomeFromApi(r: RawIncome): Income {
  return {
    id: r.id, descricao: r.descricao, valor: asNumber(r.valor),
    data: r.data_recebimento, mes: r.mes, ano: r.ano,
    status: (r.status as 'ativa' | 'cancelada' | 'prevista' | 'faturada') ?? 'ativa',
    contratoId: r.contrato_id ?? null,
    observacoes: r.observacoes, cliente: r.cliente, tipoReceita: r.tipo_receita,
    representanteId: r.representante_id ?? null,
    representanteNome: r.representante_nome ?? null,
    valorComissao: r.valor_comissao != null ? asNumber(r.valor_comissao) : null,
    anexos: Array.isArray(r.anexos) ? r.anexos : null,
  };
}

function expenseFromApi(r: RawExpense): Expense {
  const parcela = r.parcelado && r.parcela_atual && r.numero_parcelas
    ? `${r.parcela_atual}/${r.numero_parcelas}` : null;

  // rawFinalDb é o valor_final bruto do banco:
  //   - primeira parcela parcelado: total da compra
  //   - sub-parcelas e não-parcelado: valor por período
  const rawFinalDb = asNumber(r.valor_final ?? r.valor_original);
  const numeroParcelas = Number(r.numero_parcelas ?? 0);
  const parcelaAtual   = Number(r.parcela_atual ?? 0);

  // valorFinal = valor efetivo de exibição (por parcela para primeira linha parcelada)
  const valorFinal = (r.parcelado && numeroParcelas > 0 && parcelaAtual === 1)
    ? rawFinalDb / numeroParcelas
    : rawFinalDb;

  return {
    id: r.id, descricao: r.descricao,
    valorFinal,
    valorFinalTotal: rawFinalDb > 0 ? rawFinalDb : undefined,
    categoria: r.categoria_nome ?? 'Sem categoria',
    formaPagamento: r.forma_pagamento ?? 'dinheiro',
    dataVencimento: r.data_vencimento, dataCompra: r.data_compra,
    dataPagamento: r.data_pagamento, mes: r.mes, ano: r.ano,
    status: (r.status as 'ativa' | 'cancelada') ?? 'ativa',
    pago: r.pago === true, recorrente: r.recorrente === true, parcelado: r.parcelado === true,
    parcela, observacoes: r.observacoes,
    valorOriginal: r.valor_original ? asNumber(r.valor_original) : null,
    numeroNf: r.numero_nf ?? null,
    dataEmissaoNf: r.data_emissao_nf ?? null,
    tipoDespesa: (r.tipo_despesa as 'opex' | 'capex' | null) ?? null,
    anexos: Array.isArray(r.anexos) ? r.anexos : null,
  };
}

export async function fetchFinanceDashboard(month: number, year: number): Promise<FinanceDashboardData> {
  const q = new URLSearchParams({ mes: String(month), ano: String(year) });
  appendProfile(q);
  const [incomes, expenses, balance] = await Promise.all([
    apiRequest<RawIncome[]>(`/receitas?${q}`),
    apiRequest<RawExpense[]>(`/despesas?${q}`),
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
    saldoFinal: asNumber(b.saldo_final),
  };
}

export async function saveIncome(month: number, year: number, values: IncomeFormValues, id?: number) {
  const profileId = getActiveProfileId();
  const body = {
    descricao: values.descricao, valor: values.valor,
    data_recebimento: values.data, mes: month, ano: year,
    observacoes: values.observacoes || null, cliente: values.cliente || null,
    tipo_receita: values.tipoReceita || null, perfil_id: profileId,
    representante_id: values.representanteId ?? null,
    valor_comissao: values.valorComissao ?? null,
    anexos: values.anexos && values.anexos.length > 0 ? values.anexos : null,
    contrato_id: values.contratoId ?? null,
    tipo_hora: values.tipoHora ?? null,
    quantidade_horas: values.quantidadeHoras ?? null,
  };
  const saved = await apiRequest<RawIncome>(id ? `/receitas/${id}` : '/receitas', {
    method: id ? 'PUT' : 'POST', body: JSON.stringify(body),
  });

  if (!id && values.replicarAte) {
    const { mes: mesFim, ano: anoFim } = values.replicarAte;
    let m = month + 1;
    let a = year;
    while (a < anoFim || (a === anoFim && m <= mesFim)) {
      const dataRep = `${a}-${String(m + 1).padStart(2, '0')}-${values.data.slice(8, 10)}`;
      await apiRequest<RawIncome>('/receitas', {
        method: 'POST',
        body: JSON.stringify({ ...body, mes: m, ano: a, data_recebimento: dataRep }),
      });
      m++;
      if (m > 11) { m = 0; a++; }
    }
  }

  return saved;
}

export async function deleteIncome(id: number) {
  return apiRequest<void>(`/receitas/${id}`, { method: 'DELETE' });
}

export async function saveExpense(month: number, year: number, values: ExpenseFormValues, id?: number) {
  const profileId = getActiveProfileId();
  const valorOriginal = values.valor_original ?? 0;
  const valorFinal = values.valor_final ?? valorOriginal;
  const body: Record<string, unknown> = {
    descricao: values.descricao,
    valor_original: valorOriginal,
    valor_final: valorFinal,
    data_vencimento: values.dataVencimento, data_compra: values.dataCompra || null,
    data_pagamento: values.pago ? values.dataVencimento : null,
    mes: month, ano: year, forma_pagamento: values.formaPagamento,
    observacoes: values.observacoes || null, pago: values.pago,
    numero_nf: values.numero_nf ?? null,
    data_emissao_nf: values.data_emissao_nf ?? null,
    tipo_despesa: values.tipo_despesa ?? null,
    valor_pago: values.pago ? valorFinal : null,
    recorrente: values.recorrente ?? false,
    parcelado: values.parcelado ?? false,
    total_parcelas: values.parcelado ? (values.total_parcelas ?? null) : null,
    perfil_id: profileId,
  };
  if (values.categoria_id) body.categoria_id = Number(values.categoria_id);
  if (values.cartao_id) body.cartao_id = Number(values.cartao_id);
  body.anexos = values.anexos && values.anexos.length > 0 ? values.anexos : null;
  return apiRequest<RawExpense>(id ? `/despesas/${id}` : '/despesas', {
    method: id ? 'PUT' : 'POST', body: JSON.stringify(body),
  });
}

export async function deleteExpense(id: number) {
  return apiRequest<void>(`/despesas/${id}`, { method: 'DELETE' });
}

export async function pagarDespesa(id: number, dataPagamento: string, valorPago: number) {
  return apiRequest<void>(`/despesas/${id}/pay`, {
    method: 'POST',
    body: JSON.stringify({ data_pagamento: dataPagamento, valor_pago: valorPago }),
  });
}

export async function moverDespesa(id: number) {
  return apiRequest<void>(`/despesas/${id}/mover`, { method: 'POST' });
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

export async function faturarContrato(contratoId: number, mes: number, ano: number): Promise<void> {
  await apiRequest<unknown>(`/contratos/${contratoId}/faturar`, {
    method: 'POST',
    body: JSON.stringify({ mes, ano }),
  });
}

export interface DashboardAnualMes {
  mes: number;
  receitas: number;
  despesas: number;
  saldo_final: number;
  receitas_previstas: number;
}

export interface ParcelaFutura {
  mes: number;
  ano: number;
  total: number;
}

export async function fetchParcelasFuturas(mes: number, ano: number, meses = 3): Promise<ParcelaFutura[]> {
  const q = new URLSearchParams({ mes: String(mes), ano: String(ano), meses: String(meses) });
  appendProfile(q);
  const rows = await apiRequest<Array<{ mes: string | number; ano: string | number; total: string | number }>>(
    `/despesas/parcelas-futuras?${q}`,
  );
  return rows.map((r) => ({
    mes: Number(r.mes),
    ano: Number(r.ano),
    total: asNumber(r.total),
  }));
}

export async function fetchDashboardAnual(ano: number): Promise<DashboardAnualMes[]> {
  const q = new URLSearchParams({ ano: String(ano) });
  appendProfile(q);
  const rows = await apiRequest<Array<{
    mes: string | number;
    receitas: string | number;
    despesas: string | number;
    saldo_final: string | number;
    receitas_previstas: string | number;
  }>>(`/financial/anual?${q}`);
  return rows.map((r) => ({
    mes: Number(r.mes),
    receitas: asNumber(r.receitas),
    despesas: asNumber(r.despesas),
    saldo_final: asNumber(r.saldo_final),
    receitas_previstas: asNumber(r.receitas_previstas),
  }));
}
