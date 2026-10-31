import type { PainelData } from '../../types/finance';
import { isCountedExpense } from '../../utils/expenseCounting';
import { todayIso, type DemoFakeDatabase, type RawExpenseDemo } from './demoFakeDatabase';

export function demoExpenseDate(row: RawExpenseDemo): string {
  return row.pago && row.data_pagamento ? row.data_pagamento : row.data_vencimento;
}

export function countedDemoExpense(row: RawExpenseDemo): boolean {
  return row.status === 'ativa' && isCountedExpense({
    recorrente: row.recorrente, pago: row.pago, formaPagamento: row.forma_pagamento,
    cartaoId: row.cartao_id, dataCompra: row.data_compra, dataVencimento: row.data_vencimento, status: 'ativa',
  }, todayIso());
}

const amountOf = (row: RawExpenseDemo) => row.pago && row.valor_pago != null ? row.valor_pago : row.valor_original ?? 0;
const sum = (rows: RawExpenseDemo[]) => Math.round(rows.reduce((total, row) => total + amountOf(row), 0) * 100) / 100;

/** Lançadas e previsões dos mesmos registros alimentam os gráficos, sem backend real. */
export function buildDemoPanel(db: DemoFakeDatabase, params: URLSearchParams): PainelData {
  const today = todayIso();
  const de = params.get('de') ?? `${today.slice(0, 4)}-01-01`;
  const ate = params.get('ate') ?? `${today.slice(0, 4)}-12-31`;
  const categories = params.getAll('category_id').map(Number);
  const cards = params.getAll('card_id').map(Number);
  const methods = params.getAll('payment_method');
  const inPeriod = (date: string) => date >= de && date <= ate;
  const all = db.despesas.filter((row) => row.status !== 'cancelada' && inPeriod(demoExpenseDate(row)));
  const matchesFilters = (row: RawExpenseDemo) => (categories.length === 0 || categories.includes(row.categoria_id ?? -1)
    || categories.includes(db.categorias.find((category) => category.id === row.categoria_id)?.parent_id ?? -1))
    && (cards.length === 0 || cards.includes(row.cartao_id ?? -1))
    && (methods.length === 0 || methods.includes(row.forma_pagamento));
  const filtered = all.filter(matchesFilters);
  const confirmed = filtered.filter(countedDemoExpense);
  const planned = filtered.filter((row) => row.status === 'prevista');
  const incomes = db.receitas.filter((row) => row.status === 'ativa' && inPeriod(row.data_recebimento));
  const receivable = db.receitas.filter((row) => ['prevista', 'faturada'].includes(row.status) && inPeriod(row.data_recebimento));
  const entrou = incomes.reduce((total, row) => total + row.valor_liquido, 0);
  const saiu = sum(confirmed);
  const pago = sum(confirmed.filter((row) => row.pago));
  const first = new Date(`${de}T00:00:00Z`);
  const last = new Date(`${ate}T00:00:00Z`);
  const duration = last.getTime() - first.getTime();
  const previousEnd = new Date(first.getTime() - 86400000);
  const previousStart = new Date(previousEnd.getTime() - duration);
  const buckets = new Map<string, RawExpenseDemo[]>();
  for (const row of [...confirmed, ...planned]) {
    const key = String(row.categoria_id);
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }
  const categorias = [...buckets.values()].map((rows) => {
    const category = db.categorias.find((item) => item.id === rows[0]!.categoria_id);
    return { categoriaId: category?.id ?? null, categoria: category?.nome ?? 'Sem categoria', parentId: category?.parent_id ?? null,
      parentNome: db.categorias.find((item) => item.id === category?.parent_id)?.nome ?? null,
      usuarioId: 0, autorNome: 'Você', total: sum(rows.filter((row) => row.status === 'ativa')),
      forecast: sum(rows.filter((row) => row.status === 'prevista')) };
  });
  const points: PainelData['serie']['pontos'] = [];
  for (let cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1)); cursor <= last; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    const start = cursor.toISOString().slice(0, 10);
    const end = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const rows = confirmed.filter((row) => demoExpenseDate(row) >= start && demoExpenseDate(row) <= end);
    const forecastRows = planned.filter((row) => row.data_vencimento >= start && row.data_vencimento <= end);
    points.push({ inicio: start < de ? de : start, fim: end > ate ? ate : end,
      receitas: incomes.filter((row) => row.data_recebimento >= start && row.data_recebimento <= end).reduce((total, row) => total + row.valor_liquido, 0),
      despesas: sum(rows), formas: Object.fromEntries([...new Set(rows.map((row) => row.forma_pagamento))].map((method) => [method, sum(rows.filter((row) => row.forma_pagamento === method))])),
      pago: sum(rows.filter((row) => row.pago)), juros: 0, descontos: 0,
      forecast: sum(forecastRows), forecastMethods: Object.fromEntries([...new Set(forecastRows.map((row) => row.forma_pagamento))]
        .map((method) => [method, sum(forecastRows.filter((row) => row.forma_pagamento === method))])) });
  }
  const tipoGasto = { fixo: 0, parcela: 0, livre: 0 };
  for (const row of confirmed) tipoGasto[row.parcelado ? 'parcela' : row.recorrente || row.despesa_fixa_id ? 'fixo' : 'livre'] += amountOf(row);
  const tipoGastoForecast = { fixo: 0, parcela: 0, livre: 0 };
  for (const row of planned) tipoGastoForecast[row.parcelado ? 'parcela' : row.recorrente || row.despesa_fixa_id ? 'fixo' : 'livre'] += amountOf(row);
  const outstanding = db.despesas.filter((row) => row.status !== 'cancelada' && !row.pago && matchesFilters(row));
  const committed = Array.from({ length: 6 }, (_, offset) => {
    const date = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + offset, 1));
    const prefix = date.toISOString().slice(0, 7);
    const rows = outstanding.filter((row) => row.data_vencimento >= today && row.data_vencimento.startsWith(prefix));
    return { ano: date.getUTCFullYear(), mes: date.getUTCMonth(),
      parcelas: sum(rows.filter((row) => countedDemoExpense(row) && row.parcelado)),
      outras: sum(rows.filter((row) => countedDemoExpense(row) && !row.parcelado)),
      forecast: sum(rows.filter((row) => row.status === 'prevista')) };
  });
  return {
    periodo: { de, ate }, periodoAnterior: { de: previousStart.toISOString().slice(0, 10), ate: previousEnd.toISOString().slice(0, 10) },
    tipoConta: 'pessoal', totalLancamentos: confirmed.length + incomes.length, forecastCount: planned.length,
    resumo: { entrou, saiu, pago, aPagar: saiu - pago, entrouAnterior: 0, saiuAnterior: 0, saldoAnterior: 0, saldoFinal: entrou - saiu },
    serie: { granularidade: 'mes', pontos: points },
    formasPagamento: [...new Set([...confirmed, ...planned].map((row) => row.forma_pagamento))].map((forma) => {
      const rows = confirmed.filter((row) => row.forma_pagamento === forma);
      return { forma, valor: sum(rows), quantidade: rows.length, juros: 0, forecast: sum(planned.filter((row) => row.forma_pagamento === forma)) };
    }),
    cartoes: [], aVistaParcelado: { aVista: sum(confirmed.filter((row) => !row.parcelado)), parcelado: sum(confirmed.filter((row) => row.parcelado)) },
    aVistaParceladoForecast: { aVista: sum(planned.filter((row) => !row.parcelado)), parcelado: sum(planned.filter((row) => row.parcelado)) },
    tipoGasto, tipoGastoForecast,
    emDia: { cadastrado: sum(confirmed), pagoEmDia: sum(confirmed.filter((row) => row.pago && (row.data_pagamento ?? row.data_vencimento) <= row.data_vencimento)),
      pagoComAtraso: sum(confirmed.filter((row) => row.pago && (row.data_pagamento ?? '') > row.data_vencimento)), emAberto: sum(confirmed.filter((row) => !row.pago)), quitadoDeAnteriores: 0 },
    contasEmAberto: { atraso: { valor: sum(confirmed.filter((row) => !row.pago && row.data_vencimento < today)), quantidade: confirmed.filter((row) => !row.pago && row.data_vencimento < today).length },
      proximos30Dias: { valor: 0, quantidade: 0 }, comprometido: committed },
    planejado: null, porPessoa: [{ usuarioId: 0, nome: 'Você', receitas: entrou, despesas: saiu }],
    jurosDescontos: { periodo: { juros: 0, descontos: 0 }, ano: { juros: 0, descontos: 0 }, upcomingInterest: 0, upcomingInterestOutside: 0 },
    categorias, receitas: { porClassificacao: [], aReceber: { total: receivable.reduce((total, row) => total + row.valor_liquido, 0), porClassificacao: [] },
      rendaPrevista: entrou + receivable.reduce((total, row) => total + row.valor_liquido, 0), comprometimentoPrevisto: entrou > 0 ? (saiu / entrou) * 100 : null,
      fixa: 0, variavel: entrou, temFixa: false, periodoEncerrado: ate < today },
    despesasPorCategoria: categorias.map((category) => ({ id: category.categoriaId, nome: category.categoria, valor: category.total, forecast: category.forecast, subcategorias: [] })),
    categoriasPorOutros: [], empresa: null,
    filterOptions: { paymentMethods: [...new Set(all.map((row) => row.forma_pagamento))], cards: db.cartoes.filter((card) => all.some((row) => row.cartao_id === card.id)).map((card) => ({ id: card.id, name: card.nome })) },
  };
}
