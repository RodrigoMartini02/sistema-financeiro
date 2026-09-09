import { and, asc, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { cards, categories, expenses, incomes } from '../db/schema';
import { getTodayIsoInTimezone } from '../utils/date';
import { getBudgetOverview, type FinancialAccount } from './budgetService';
import { assertValidRange, describeRange } from './assistantDateRange';

// Consultas do assistente. Cada funcao recebe periodo em datas absolutas (o
// modelo nunca manda "esse mes") e devolve dado bruto — a redacao da resposta
// fica com o modelo, ou com o fallback deterministico.
//
// Todas filtram por usuario E conta. As condicoes seguem o padrao ja usado em
// financialCopilot: conta pessoal enxerga tambem registros sem conta_id, conta
// empresa nao.

/** Teto de linhas aplicado no backend, nao no parametro vindo do modelo. */
const MAX_ROWS = 50;

export interface QueryScope {
  userId: number;
  account: FinancialAccount;
}

function asNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampLimit(limite: number | undefined, fallback: number): number {
  if (!Number.isFinite(limite) || !limite || limite < 1) return fallback;
  return Math.min(Math.floor(limite), MAX_ROWS);
}

/** Despesas do periodo, por data de vencimento. */
function expenseRange(scope: QueryScope, inicio: string, fim: string) {
  const conditions = [
    eq(expenses.userId, scope.userId),
    gte(expenses.dueDate, inicio),
    lte(expenses.dueDate, fim),
  ];
  if (scope.account.type === 'pessoal') {
    conditions.push(or(eq(expenses.accountId, scope.account.id), isNull(expenses.accountId))!);
  } else {
    conditions.push(eq(expenses.accountId, scope.account.id));
  }
  return and(...conditions);
}

/** Receitas do periodo, por data de recebimento. */
function incomeRange(scope: QueryScope, inicio: string, fim: string) {
  const conditions = [
    eq(incomes.userId, scope.userId),
    gte(incomes.receiptDate, inicio),
    lte(incomes.receiptDate, fim),
  ];
  if (scope.account.type === 'pessoal') {
    conditions.push(or(eq(incomes.accountId, scope.account.id), isNull(incomes.accountId))!);
  } else {
    conditions.push(eq(incomes.accountId, scope.account.id));
  }
  return and(...conditions);
}

/** Despesas sem recorte de data — base das consultas de parcelamento. */
function expenseAll(scope: QueryScope) {
  const conditions = [eq(expenses.userId, scope.userId)];
  if (scope.account.type === 'pessoal') {
    conditions.push(or(eq(expenses.accountId, scope.account.id), isNull(expenses.accountId))!);
  } else {
    conditions.push(eq(expenses.accountId, scope.account.id));
  }
  return and(...conditions);
}

// ── Bloco 1 — Saldo e visao geral ────────────────────────────────────

export async function resumoPeriodo(scope: QueryScope, inicio: string, fim: string) {
  assertValidRange(inicio, fim);
  const [expenseRows, incomeRows] = await Promise.all([
    db.select({ amount: expenses.originalAmount, paid: expenses.paid, amountPaid: expenses.amountPaid })
      .from(expenses).where(expenseRange(scope, inicio, fim)),
    db.select({ amount: incomes.amount }).from(incomes).where(incomeRange(scope, inicio, fim)),
  ]);

  const entradas = incomeRows.reduce((total, row) => total + asNumber(row.amount), 0);
  const saidas = expenseRows.reduce((total, row) => total + asNumber(row.amount), 0);
  const pago = expenseRows
    .filter((row) => row.paid)
    .reduce((total, row) => total + asNumber(row.amountPaid ?? row.amount), 0);

  return {
    periodo: describeRange(inicio, fim),
    entradas,
    saidas,
    saldo: entradas - saidas,
    pago,
    aPagar: saidas - pago,
    lancamentos: expenseRows.length + incomeRows.length,
  };
}

/**
 * Saldo consolidado ate hoje: so o que ja aconteceu conta. Despesa futura ainda
 * nao saiu do bolso, e receita futura ainda nao entrou.
 */
export async function saldoAtual(scope: QueryScope) {
  const hoje = getTodayIsoInTimezone();
  const inicioDoAno = `${hoje.slice(0, 4)}-01-01`;
  const [expenseRows, incomeRows] = await Promise.all([
    db.select({ amount: expenses.originalAmount, amountPaid: expenses.amountPaid })
      .from(expenses).where(and(expenseRange(scope, inicioDoAno, hoje), eq(expenses.paid, true))),
    db.select({ amount: incomes.amount }).from(incomes).where(incomeRange(scope, inicioDoAno, hoje)),
  ]);

  const entradas = incomeRows.reduce((total, row) => total + asNumber(row.amount), 0);
  const saidas = expenseRows.reduce((total, row) => total + asNumber(row.amountPaid ?? row.amount), 0);

  return { ate: hoje, entradas, saidas, saldo: entradas - saidas, desde: inicioDoAno };
}

export async function saudeFinanceira(scope: QueryScope, meses: number) {
  const janela = Math.min(Math.max(Math.floor(meses) || 3, 1), 24);
  const hoje = getTodayIsoInTimezone();
  const [ano, mes] = hoje.split('-').map(Number);
  const inicio = new Date(Date.UTC(ano!, mes! - 1 - (janela - 1), 1));
  const inicioIso = inicio.toISOString().slice(0, 10);

  const [incomeRows, expenseRows, futuras] = await Promise.all([
    db.select({ amount: incomes.amount }).from(incomes).where(incomeRange(scope, inicioIso, hoje)),
    db.select({ amount: expenses.originalAmount, recurring: expenses.recurring })
      .from(expenses).where(expenseRange(scope, inicioIso, hoje)),
    db.select({ amount: expenses.originalAmount, dueDate: expenses.dueDate })
      .from(expenses).where(and(expenseAll(scope), eq(expenses.installment, true), gte(expenses.dueDate, hoje))),
  ]);

  const receitaMedia = incomeRows.reduce((total, row) => total + asNumber(row.amount), 0) / janela;
  const despesaMedia = expenseRows.reduce((total, row) => total + asNumber(row.amount), 0) / janela;
  const fixasMedia = expenseRows
    .filter((row) => row.recurring)
    .reduce((total, row) => total + asNumber(row.amount), 0) / janela;

  // Comprometimento = parcelas ja contratadas sobre a receita media do periodo.
  const parcelasFuturas = futuras.reduce((total, row) => total + asNumber(row.amount), 0);
  const parcelaMensalMedia = parcelasFuturas / janela;

  return {
    meses: janela,
    receitaMedia,
    despesaMedia,
    fixasMedia,
    sobraMedia: receitaMedia - despesaMedia,
    parcelasFuturas,
    comprometimentoPercentual: receitaMedia > 0 ? (parcelaMensalMedia / receitaMedia) * 100 : null,
    fixasCabemNaReceita: receitaMedia > 0 ? fixasMedia <= receitaMedia : null,
  };
}

// ── Bloco 2 — Despesas ───────────────────────────────────────────────

export async function gastosPorCategoria(scope: QueryScope, inicio: string, fim: string, categoria?: string) {
  assertValidRange(inicio, fim);
  const rows = await db.select({
    categoryName: categories.name,
    amount: expenses.originalAmount,
  }).from(expenses).leftJoin(categories, eq(expenses.categoryId, categories.id))
    .where(expenseRange(scope, inicio, fim));

  const totais = new Map<string, { total: number; quantidade: number }>();
  for (const row of rows) {
    const nome = row.categoryName ?? 'Sem categoria';
    const atual = totais.get(nome) ?? { total: 0, quantidade: 0 };
    atual.total += asNumber(row.amount);
    atual.quantidade += 1;
    totais.set(nome, atual);
  }

  const itens = [...totais.entries()]
    .map(([nome, dados]) => ({ categoria: nome, total: dados.total, quantidade: dados.quantidade }))
    .filter((item) => !categoria || item.categoria.toLowerCase() === categoria.toLowerCase())
    .sort((left, right) => right.total - left.total);

  return { periodo: describeRange(inicio, fim), itens, total: itens.reduce((sum, item) => sum + item.total, 0) };
}

export async function maioresGastos(scope: QueryScope, inicio: string, fim: string, limite?: number) {
  assertValidRange(inicio, fim);
  const rows = await db.select({
    descricao: expenses.description,
    amount: expenses.originalAmount,
    dueDate: expenses.dueDate,
    categoryName: categories.name,
  }).from(expenses).leftJoin(categories, eq(expenses.categoryId, categories.id))
    .where(expenseRange(scope, inicio, fim))
    .orderBy(desc(expenses.originalAmount))
    .limit(clampLimit(limite, 5));

  return {
    periodo: describeRange(inicio, fim),
    itens: rows.map((row) => ({
      descricao: row.descricao,
      valor: asNumber(row.amount),
      data: String(row.dueDate),
      categoria: row.categoryName ?? 'Sem categoria',
    })),
  };
}

export async function buscarLancamentos(
  scope: QueryScope,
  texto: string,
  inicio: string,
  fim: string,
  tipo?: 'despesa' | 'receita',
) {
  assertValidRange(inicio, fim);
  const termo = `%${texto.trim().toLowerCase()}%`;
  const limite = clampLimit(undefined, 20);

  const [expenseRows, incomeRows] = await Promise.all([
    tipo === 'receita' ? [] : db.select({
      descricao: expenses.description,
      amount: expenses.originalAmount,
      data: expenses.dueDate,
      paid: expenses.paid,
    }).from(expenses)
      .where(and(expenseRange(scope, inicio, fim), sql`lower(${expenses.description}) like ${termo}`))
      .orderBy(desc(expenses.dueDate)).limit(limite),
    tipo === 'despesa' ? [] : db.select({
      descricao: incomes.description,
      amount: incomes.amount,
      data: incomes.receiptDate,
    }).from(incomes)
      .where(and(incomeRange(scope, inicio, fim), sql`lower(${incomes.description}) like ${termo}`))
      .orderBy(desc(incomes.receiptDate)).limit(limite),
  ]);

  const itens = [
    ...expenseRows.map((row) => ({
      tipo: 'despesa' as const,
      descricao: row.descricao,
      valor: asNumber(row.amount),
      data: String(row.data),
      pago: Boolean(row.paid),
    })),
    ...incomeRows.map((row) => ({
      tipo: 'receita' as const,
      descricao: row.descricao,
      valor: asNumber(row.amount),
      data: String(row.data),
      pago: true,
    })),
  ].sort((left, right) => right.data.localeCompare(left.data)).slice(0, limite);

  return { periodo: describeRange(inicio, fim), termo: texto, itens };
}

export async function gastosPorFormaPagamento(scope: QueryScope, inicio: string, fim: string) {
  assertValidRange(inicio, fim);
  const rows = await db.select({
    forma: expenses.paymentMethod,
    amount: expenses.originalAmount,
    cardName: cards.name,
  }).from(expenses).leftJoin(cards, eq(expenses.cardId, cards.id))
    .where(expenseRange(scope, inicio, fim));

  const totais = new Map<string, number>();
  for (const row of rows) {
    // Cartao aparece nomeado: "quanto foi no cartao X" e pergunta comum.
    const chave = row.cardName ? `${row.forma ?? 'outros'} · ${row.cardName}` : (row.forma ?? 'outros');
    totais.set(chave, (totais.get(chave) ?? 0) + asNumber(row.amount));
  }

  return {
    periodo: describeRange(inicio, fim),
    itens: [...totais.entries()]
      .map(([forma, total]) => ({ forma, total }))
      .sort((left, right) => right.total - left.total),
  };
}

export async function comparativoPeriodos(
  scope: QueryScope,
  inicioA: string, fimA: string,
  inicioB: string, fimB: string,
) {
  const [a, b] = await Promise.all([
    resumoPeriodo(scope, inicioA, fimA),
    resumoPeriodo(scope, inicioB, fimB),
  ]);
  const diferenca = a.saidas - b.saidas;
  return {
    periodoA: a,
    periodoB: b,
    diferencaSaidas: diferenca,
    variacaoPercentual: b.saidas > 0 ? (diferenca / b.saidas) * 100 : null,
  };
}

// ── Bloco 3 — Contas e vencimentos ───────────────────────────────────

export type StatusConta = 'aberto' | 'vencido' | 'todos';

export async function contasAPagar(scope: QueryScope, inicio: string, fim: string, status: StatusConta) {
  assertValidRange(inicio, fim);
  const hoje = getTodayIsoInTimezone();
  const rows = await db.select({
    descricao: expenses.description,
    amount: expenses.originalAmount,
    dueDate: expenses.dueDate,
    paid: expenses.paid,
  }).from(expenses).where(expenseRange(scope, inicio, fim)).orderBy(asc(expenses.dueDate)).limit(MAX_ROWS);

  const itens = rows
    .filter((row) => {
      if (status === 'todos') return true;
      if (row.paid) return false;
      const vencida = String(row.dueDate) < hoje;
      return status === 'vencido' ? vencida : !vencida;
    })
    .map((row) => ({
      descricao: row.descricao,
      valor: asNumber(row.amount),
      vencimento: String(row.dueDate),
      pago: Boolean(row.paid),
      vencida: !row.paid && String(row.dueDate) < hoje,
    }));

  return {
    periodo: describeRange(inicio, fim),
    status,
    itens,
    total: itens.reduce((sum, item) => sum + item.valor, 0),
  };
}

export async function contasAReceber(scope: QueryScope, inicio: string, fim: string, status: StatusConta) {
  assertValidRange(inicio, fim);
  const hoje = getTodayIsoInTimezone();
  const rows = await db.select({
    descricao: incomes.description,
    amount: incomes.amount,
    data: incomes.receiptDate,
  }).from(incomes).where(incomeRange(scope, inicio, fim)).orderBy(asc(incomes.receiptDate)).limit(MAX_ROWS);

  // Receita nao tem status de pagamento no modelo: o que separa e a data.
  const itens = rows
    .filter((row) => status === 'todos' || (status === 'aberto' ? String(row.data) >= hoje : String(row.data) < hoje))
    .map((row) => ({ descricao: row.descricao, valor: asNumber(row.amount), data: String(row.data) }));

  return {
    periodo: describeRange(inicio, fim),
    status,
    itens,
    total: itens.reduce((sum, item) => sum + item.valor, 0),
  };
}

/**
 * Recorrentes do periodo. Importante: "recorrente" e uma marca na linha, nao uma
 * regra que gera lancamento futuro — so aparece o que ja foi gravado. O campo
 * `apenasLancadas` existe para a resposta poder dizer isso.
 */
export async function recorrentesPrevistas(scope: QueryScope, inicio: string, fim: string) {
  assertValidRange(inicio, fim);
  const rows = await db.select({
    descricao: expenses.description,
    amount: expenses.originalAmount,
    dueDate: expenses.dueDate,
    paid: expenses.paid,
  }).from(expenses)
    .where(and(expenseRange(scope, inicio, fim), eq(expenses.recurring, true)))
    .orderBy(asc(expenses.dueDate)).limit(MAX_ROWS);

  const itens = rows.map((row) => ({
    descricao: row.descricao,
    valor: asNumber(row.amount),
    vencimento: String(row.dueDate),
    pago: Boolean(row.paid),
  }));

  return {
    periodo: describeRange(inicio, fim),
    itens,
    total: itens.reduce((sum, item) => sum + item.valor, 0),
    apenasLancadas: true,
  };
}

// ── Bloco 4 — Parcelamentos ──────────────────────────────────────────

/**
 * Parcelamentos com parcela futura em aberto. Parcelas sao linhas reais, com
 * grupo_parcelamento_id — nao ha projecao aqui, so leitura.
 */
export async function parcelamentosAbertos(scope: QueryScope) {
  const hoje = getTodayIsoInTimezone();
  const rows = await db.select({
    descricao: expenses.description,
    amount: expenses.originalAmount,
    dueDate: expenses.dueDate,
    paid: expenses.paid,
    grupo: expenses.installmentGroupId,
    parcela: expenses.currentInstallment,
    total: expenses.numberOfInstallments,
  }).from(expenses)
    .where(and(expenseAll(scope), eq(expenses.installment, true)))
    .orderBy(asc(expenses.dueDate));

  const grupos = new Map<string, {
    descricao: string; valorParcela: number; totalParcelas: number;
    pagas: number; restantes: number; proximoVencimento: string | null; ultimoVencimento: string;
  }>();

  for (const row of rows) {
    const chave = String(row.grupo ?? row.descricao);
    const atual = grupos.get(chave) ?? {
      descricao: row.descricao,
      valorParcela: asNumber(row.amount),
      totalParcelas: row.total ?? 0,
      pagas: 0,
      restantes: 0,
      proximoVencimento: null as string | null,
      ultimoVencimento: String(row.dueDate),
    };
    if (row.paid) atual.pagas += 1;
    else {
      atual.restantes += 1;
      if (!atual.proximoVencimento && String(row.dueDate) >= hoje) atual.proximoVencimento = String(row.dueDate);
    }
    if (String(row.dueDate) > atual.ultimoVencimento) atual.ultimoVencimento = String(row.dueDate);
    grupos.set(chave, atual);
  }

  const itens = [...grupos.values()]
    .filter((grupo) => grupo.restantes > 0)
    .map((grupo) => ({ ...grupo, saldoDevedor: grupo.valorParcela * grupo.restantes }));

  return { itens, total: itens.reduce((sum, item) => sum + item.saldoDevedor, 0) };
}

export async function posicaoParcelamento(scope: QueryScope, referencia: string) {
  const abertos = await parcelamentosAbertos(scope);
  const termo = referencia.trim().toLowerCase();
  const encontrado = abertos.itens.find((item) => item.descricao.toLowerCase().includes(termo));
  return encontrado ? { encontrado: true as const, ...encontrado } : { encontrado: false as const, referencia };
}

/** Quanto de parcela ja contratada cai em cada mes daqui pra frente. */
export async function comprometimentoFuturo(scope: QueryScope, meses: number) {
  const janela = Math.min(Math.max(Math.floor(meses) || 6, 1), 24);
  const hoje = getTodayIsoInTimezone();
  const rows = await db.select({ amount: expenses.originalAmount, dueDate: expenses.dueDate })
    .from(expenses)
    .where(and(expenseAll(scope), eq(expenses.installment, true), eq(expenses.paid, false), gte(expenses.dueDate, hoje)))
    .orderBy(asc(expenses.dueDate));

  const porMes = new Map<string, number>();
  for (const row of rows) {
    const chave = String(row.dueDate).slice(0, 7);
    porMes.set(chave, (porMes.get(chave) ?? 0) + asNumber(row.amount));
  }

  const itens = [...porMes.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .slice(0, janela)
    .map(([mes, total]) => ({ mes, total }));

  return { meses: janela, itens, total: itens.reduce((sum, item) => sum + item.total, 0) };
}

// ── Bloco 5 — Projecao, metas e alertas ──────────────────────────────

/**
 * Saldo projetado mes a mes. Separa fato de previsao: o que ja foi pago conta
 * como realizado, o que esta em aberto entra como previsto.
 */
export async function projecaoSaldo(scope: QueryScope, meses: number) {
  const janela = Math.min(Math.max(Math.floor(meses) || 3, 1), 24);
  const hoje = getTodayIsoInTimezone();
  const [ano, mes] = hoje.split('-').map(Number);
  const fim = new Date(Date.UTC(ano!, mes! - 1 + janela, 0)).toISOString().slice(0, 10);

  const [expenseRows, incomeRows] = await Promise.all([
    db.select({ amount: expenses.originalAmount, dueDate: expenses.dueDate, paid: expenses.paid })
      .from(expenses).where(expenseRange(scope, hoje, fim)),
    db.select({ amount: incomes.amount, data: incomes.receiptDate })
      .from(incomes).where(incomeRange(scope, hoje, fim)),
  ]);

  const porMes = new Map<string, { entradas: number; saidas: number; realizado: number }>();
  const bucket = (chave: string) => {
    const atual = porMes.get(chave) ?? { entradas: 0, saidas: 0, realizado: 0 };
    porMes.set(chave, atual);
    return atual;
  };

  for (const row of incomeRows) bucket(String(row.data).slice(0, 7)).entradas += asNumber(row.amount);
  for (const row of expenseRows) {
    const alvo = bucket(String(row.dueDate).slice(0, 7));
    alvo.saidas += asNumber(row.amount);
    if (row.paid) alvo.realizado += asNumber(row.amount);
  }

  let acumulado = 0;
  const itens = [...porMes.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .slice(0, janela)
    .map(([mesChave, dados]) => {
      acumulado += dados.entradas - dados.saidas;
      return {
        mes: mesChave,
        entradas: dados.entradas,
        saidas: dados.saidas,
        jaPago: dados.realizado,
        emAberto: dados.saidas - dados.realizado,
        saldoMes: dados.entradas - dados.saidas,
        saldoAcumulado: acumulado,
      };
    });

  return { meses: janela, desde: hoje, itens };
}

export async function simularNovaParcela(scope: QueryScope, valorParcela: number, numParcelas: number) {
  const valor = Number(valorParcela);
  const parcelas = Math.floor(Number(numParcelas));
  if (!Number.isFinite(valor) || valor <= 0 || !Number.isInteger(parcelas) || parcelas < 1 || parcelas > 360) {
    throw new AssistantQueryError('Valor de parcela ou número de parcelas inválido.');
  }

  const [atual, saude] = await Promise.all([
    comprometimentoFuturo(scope, Math.min(parcelas, 24)),
    saudeFinanceira(scope, 3),
  ]);

  const comprometimentoAtual = saude.comprometimentoPercentual;
  const receitaMedia = saude.receitaMedia;
  const novoMensal = valor;

  return {
    valorParcela: valor,
    numParcelas: parcelas,
    totalNovo: valor * parcelas,
    receitaMedia,
    comprometimentoAtualPercentual: comprometimentoAtual,
    comprometimentoComNovaPercentual: receitaMedia > 0
      ? ((atual.total / Math.min(parcelas, 24)) + novoMensal) / receitaMedia * 100
      : null,
    sobraMediaAtual: saude.sobraMedia,
    sobraMediaComNova: saude.sobraMedia - novoMensal,
  };
}

/** Progresso das metas de orcamento por categoria (teto de gasto). */
export async function progressoMeta(scope: QueryScope, meta?: string) {
  const hoje = getTodayIsoInTimezone();
  const [ano, mes] = hoje.split('-').map(Number);
  const overview = await getBudgetOverview({
    userId: scope.userId,
    accountId: scope.account.id,
    month: mes! - 1,
    year: ano!,
  });

  const itens = overview.items
    .filter((item) => item.targetAmount !== null)
    .filter((item) => !meta || item.categoryName.toLowerCase().includes(meta.trim().toLowerCase()))
    .map((item) => ({
      categoria: item.categoryName,
      meta: item.targetAmount,
      gasto: item.projectedAmount,
      restante: (item.targetAmount ?? 0) - item.projectedAmount,
      percentualUsado: item.targetAmount ? (item.projectedAmount / item.targetAmount) * 100 : null,
      situacao: item.status,
    }));

  return { mes: `${ano}-${String(mes).padStart(2, '0')}`, itens };
}

/**
 * Categorias fora do padrao: gasto do mes corrente acima de 1,5x a media dos
 * meses anteriores da janela. O limiar e desta consulta, nao existe em outro
 * lugar do sistema.
 */
export async function variacaoPorCategoria(scope: QueryScope, meses: number) {
  const janela = Math.min(Math.max(Math.floor(meses) || 3, 2), 24);
  const hoje = getTodayIsoInTimezone();
  const [ano, mes] = hoje.split('-').map(Number);
  const inicio = new Date(Date.UTC(ano!, mes! - 1 - (janela - 1), 1)).toISOString().slice(0, 10);
  const fimMesAnterior = new Date(Date.UTC(ano!, mes! - 1, 0)).toISOString().slice(0, 10);
  const inicioMesAtual = `${hoje.slice(0, 7)}-01`;

  const [anteriores, atuais] = await Promise.all([
    db.select({ categoryName: categories.name, amount: expenses.originalAmount })
      .from(expenses).leftJoin(categories, eq(expenses.categoryId, categories.id))
      .where(expenseRange(scope, inicio, fimMesAnterior)),
    db.select({ categoryName: categories.name, amount: expenses.originalAmount })
      .from(expenses).leftJoin(categories, eq(expenses.categoryId, categories.id))
      .where(expenseRange(scope, inicioMesAtual, hoje)),
  ]);

  const mesesAnteriores = Math.max(janela - 1, 1);
  const medias = new Map<string, number>();
  for (const row of anteriores) {
    const nome = row.categoryName ?? 'Sem categoria';
    medias.set(nome, (medias.get(nome) ?? 0) + asNumber(row.amount));
  }

  const atual = new Map<string, number>();
  for (const row of atuais) {
    const nome = row.categoryName ?? 'Sem categoria';
    atual.set(nome, (atual.get(nome) ?? 0) + asNumber(row.amount));
  }

  const itens = [...atual.entries()].map(([categoria, total]) => {
    const media = (medias.get(categoria) ?? 0) / mesesAnteriores;
    return {
      categoria,
      atual: total,
      media,
      variacaoPercentual: media > 0 ? ((total - media) / media) * 100 : null,
      foraDoPadrao: media > 0 && total > media * 1.5,
    };
  }).sort((left, right) => (right.variacaoPercentual ?? 0) - (left.variacaoPercentual ?? 0));

  return { meses: janela, itens, criterio: 'acima de 1,5x a média dos meses anteriores' };
}

export class AssistantQueryError extends Error {}
