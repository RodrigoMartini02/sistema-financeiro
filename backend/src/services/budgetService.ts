import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { budgetTargets, categories, expenses, incomes, profiles } from '../db/schema';

export interface FinancialProfile {
  id: number;
  type: 'pessoal' | 'empresa';
  name: string;
}

export interface BudgetOverviewItem {
  categoryId: number;
  categoryName: string;
  mode: 'amount' | 'income_percent' | null;
  targetValue: number | null;
  targetAmount: number | null;
  paidAmount: number;
  projectedAmount: number;
  incomePercentage: number | null;
  status: 'without_target' | 'healthy' | 'attention' | 'over';
  suggestedAmount: number | null;
}

export interface BudgetOverview {
  profileType: 'pessoal' | 'empresa';
  month: number;
  year: number;
  incomeTotal: number;
  paidTotal: number;
  projectedTotal: number;
  items: BudgetOverviewItem[];
}

export class BudgetInputError extends Error {}

// Período aceito por getBudgetOverview: ou um mês único (uso do BudgetPanel, tela de
// cadastro de metas), ou um intervalo deChave/ateChave em formato ano*12+mes, com
// null representando "sem limite" nesse extremo (mesmo padrão de /financial/panorama).
interface SingleMonthPeriod {
  month: number;
  year: number;
}
interface RangePeriod {
  deMes?: number;
  deAno?: number;
  ateMes?: number;
  ateAno?: number;
}
type BudgetPeriodInput = SingleMonthPeriod | RangePeriod;

interface ResolvedPeriod {
  deChave: number | null;
  ateChave: number | null;
  referenceMonth: number;
  referenceYear: number;
}

function isSingleMonthPeriod(period: BudgetPeriodInput): period is SingleMonthPeriod {
  return 'month' in period && 'year' in period;
}

function asNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function validateSingleMonth(month: number, year: number): void {
  if (!Number.isInteger(month) || month < 0 || month > 11 || !Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new BudgetInputError('Período financeiro inválido.');
  }
}

function validateRangeEdge(mes: number | undefined, ano: number | undefined): void {
  if (ano === undefined) return;
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100 || (mes !== undefined && (!Number.isInteger(mes) || mes < 0 || mes > 11))) {
    throw new BudgetInputError('Período financeiro inválido.');
  }
}

// Resolve o período de entrada em (deChave, ateChave) comparáveis como ano*12+mes,
// e um mês/ano de referência (usado pela sugestão de meta e por income_percent).
function resolvePeriod(period: BudgetPeriodInput): ResolvedPeriod {
  if (isSingleMonthPeriod(period)) {
    validateSingleMonth(period.month, period.year);
    const chave = period.year * 12 + period.month;
    return { deChave: chave, ateChave: chave, referenceMonth: period.month, referenceYear: period.year };
  }

  validateRangeEdge(period.deMes, period.deAno);
  validateRangeEdge(period.ateMes, period.ateAno);
  const deChave = period.deAno !== undefined ? period.deAno * 12 + (period.deMes ?? 0) : null;
  const ateChave = period.ateAno !== undefined ? period.ateAno * 12 + (period.ateMes ?? 11) : null;
  if (deChave !== null && ateChave !== null && deChave > ateChave) {
    throw new BudgetInputError('Período inicial não pode ser depois do período final.');
  }

  const now = new Date();
  const referenceChave = ateChave ?? now.getFullYear() * 12 + now.getMonth();
  return {
    deChave,
    ateChave,
    referenceMonth: ((referenceChave % 12) + 12) % 12,
    referenceYear: Math.floor(referenceChave / 12),
  };
}

export async function resolveFinancialProfile(userId: number, requestedProfileId: number | null): Promise<FinancialProfile> {
  const where = requestedProfileId
    ? and(eq(profiles.id, requestedProfileId), eq(profiles.userId, userId), eq(profiles.active, true))
    : and(eq(profiles.userId, userId), eq(profiles.type, 'pessoal'), eq(profiles.active, true));
  const [profile] = await db
    .select({ id: profiles.id, type: profiles.type, name: profiles.name })
    .from(profiles)
    .where(where)
    .limit(1);

  if (!profile) throw new BudgetInputError('Perfil financeiro não encontrado.');
  return profile;
}

// deChave/ateChave nulos representam "sem limite" naquele extremo — mesma semântica de
// COALESCE($n, ±infinito) usada em /financial/panorama, aqui expressa via sql template
// porque o Drizzle não tem uma coluna computada ano*12+mes para comparar diretamente.
function expenseProfileCondition(userId: number, profile: FinancialProfile, deChave: number | null, ateChave: number | null) {
  const conditions = [
    eq(expenses.userId, userId),
    sql`(${expenses.year} * 12 + ${expenses.month}) BETWEEN ${deChave ?? -2147483648} AND ${ateChave ?? 2147483647}`,
  ];
  if (profile.type === 'pessoal') {
    conditions.push(or(eq(expenses.profileId, profile.id), isNull(expenses.profileId))!);
  } else {
    conditions.push(eq(expenses.profileId, profile.id));
  }
  return and(...conditions);
}

function incomeProfileCondition(userId: number, profile: FinancialProfile, deChave: number | null, ateChave: number | null) {
  const conditions = [
    eq(incomes.userId, userId),
    sql`(${incomes.year} * 12 + ${incomes.month}) BETWEEN ${deChave ?? -2147483648} AND ${ateChave ?? 2147483647}`,
  ];
  if (profile.type === 'pessoal') {
    conditions.push(or(eq(incomes.profileId, profile.id), isNull(incomes.profileId))!);
  } else {
    conditions.push(eq(incomes.profileId, profile.id));
  }
  return and(...conditions);
}

function previousThreePeriods(month: number, year: number): Array<{ month: number; year: number }> {
  const periods: Array<{ month: number; year: number }> = [];
  for (let offset = 1; offset <= 3; offset += 1) {
    const date = new Date(year, month - offset, 1);
    periods.push({ month: date.getMonth(), year: date.getFullYear() });
  }
  return periods;
}

export async function getBudgetOverview(input: {
  userId: number;
  profileId: number | null;
} & BudgetPeriodInput): Promise<BudgetOverview> {
  const { userId, profileId, ...period } = input;
  const resolved = resolvePeriod(period);
  const profile = await resolveFinancialProfile(userId, profileId);
  const [categoryRows, expenseRows, incomeRows] = await Promise.all([
    db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.userId, userId)),
    db.select({
      categoryId: expenses.categoryId,
      amount: expenses.finalAmount,
      originalAmount: expenses.originalAmount,
      paid: expenses.paid,
    }).from(expenses).where(expenseProfileCondition(userId, profile, resolved.deChave, resolved.ateChave)),
    db.select({ amount: incomes.amount }).from(incomes).where(incomeProfileCondition(userId, profile, resolved.deChave, resolved.ateChave)),
  ]);

  if (profile.type === 'empresa') {
    return {
      profileType: profile.type,
      month: resolved.referenceMonth,
      year: resolved.referenceYear,
      incomeTotal: incomeRows.reduce((total, row) => total + asNumber(row.amount), 0),
      paidTotal: expenseRows.filter((row) => row.paid).reduce((total, row) => total + asNumber(row.amount ?? row.originalAmount), 0),
      projectedTotal: expenseRows.reduce((total, row) => total + asNumber(row.amount ?? row.originalAmount), 0),
      items: [],
    };
  }

  const [targetRows, historicalRows] = await Promise.all([
    db.select({
      categoryId: budgetTargets.categoryId,
      mode: budgetTargets.mode,
      targetValue: budgetTargets.targetValue,
    }).from(budgetTargets).where(and(eq(budgetTargets.userId, userId), eq(budgetTargets.profileId, profile.id))),
    db.select({
      categoryId: expenses.categoryId,
      amount: expenses.finalAmount,
      originalAmount: expenses.originalAmount,
      month: expenses.month,
      year: expenses.year,
    }).from(expenses).where(expenseProfileCondition(userId, profile, null, null)),
  ]);

  // Número de meses do período consultado — usado para escalar a meta mensal cadastrada
  // (que é um valor único e recorrente por categoria, sem coluna de mês/ano própria).
  // No modo "todo o período" (deChave e ateChave nulos), usa o histórico real de
  // lançamentos do usuário até hoje, replicando o cálculo de /financial/panorama.
  let mesesNoIntervalo: number;
  if (resolved.deChave !== null && resolved.ateChave !== null) {
    mesesNoIntervalo = resolved.ateChave - resolved.deChave + 1;
  } else {
    const chaves = historicalRows.map((row) => row.year * 12 + row.month);
    const primeiraChave = chaves.length > 0 ? Math.min(...chaves) : null;
    const hojeChave = new Date().getFullYear() * 12 + new Date().getMonth();
    mesesNoIntervalo = primeiraChave !== null ? Math.max(1, hojeChave - primeiraChave + 1) : 1;
  }

  const incomeTotal = incomeRows.reduce((total, row) => total + asNumber(row.amount), 0);
  const projectedByCategory = new Map<number, number>();
  const paidByCategory = new Map<number, number>();
  for (const row of expenseRows) {
    if (!row.categoryId) continue;
    const amount = asNumber(row.amount ?? row.originalAmount);
    projectedByCategory.set(row.categoryId, (projectedByCategory.get(row.categoryId) ?? 0) + amount);
    if (row.paid) paidByCategory.set(row.categoryId, (paidByCategory.get(row.categoryId) ?? 0) + amount);
  }

  const priorPeriods = previousThreePeriods(resolved.referenceMonth, resolved.referenceYear);
  const historicByCategory = new Map<number, number>();
  for (const row of historicalRows) {
    if (!row.categoryId || !priorPeriods.some((period) => period.month === row.month && period.year === row.year)) continue;
    historicByCategory.set(row.categoryId, (historicByCategory.get(row.categoryId) ?? 0) + asNumber(row.amount ?? row.originalAmount));
  }

  const targetsByCategory = new Map(targetRows.map((row) => [row.categoryId, row]));
  const items = categoryRows.map((category): BudgetOverviewItem => {
    const target = targetsByCategory.get(category.id);
    const targetValue = target ? asNumber(target.targetValue) : null;
    const targetAmount = target
      ? target.mode === 'income_percent'
        ? (incomeTotal * targetValue!) / 100
        : targetValue! * mesesNoIntervalo
      : null;
    const projectedAmount = projectedByCategory.get(category.id) ?? 0;
    const paidAmount = paidByCategory.get(category.id) ?? 0;
    const ratio = targetAmount && targetAmount > 0 ? projectedAmount / targetAmount : null;
    const status: BudgetOverviewItem['status'] = ratio === null
      ? 'without_target'
      : ratio >= 1 ? 'over'
        : ratio >= 0.8 ? 'attention'
          : 'healthy';
    return {
      categoryId: category.id,
      categoryName: category.name,
      mode: target?.mode ?? null,
      targetValue,
      targetAmount,
      paidAmount,
      projectedAmount,
      incomePercentage: incomeTotal > 0 ? (projectedAmount / incomeTotal) * 100 : null,
      status,
      suggestedAmount: historicByCategory.has(category.id) ? (historicByCategory.get(category.id)! / 3) : null,
    };
  }).sort((left, right) => right.projectedAmount - left.projectedAmount || left.categoryName.localeCompare(right.categoryName));

  return {
    profileType: profile.type,
    month: resolved.referenceMonth,
    year: resolved.referenceYear,
    incomeTotal,
    paidTotal: expenseRows.filter((row) => row.paid).reduce((total, row) => total + asNumber(row.amount ?? row.originalAmount), 0),
    projectedTotal: expenseRows.reduce((total, row) => total + asNumber(row.amount ?? row.originalAmount), 0),
    items,
  };
}

export async function saveBudgetTarget(input: {
  userId: number;
  profileId: number | null;
  categoryId: unknown;
  mode: unknown;
  targetValue: unknown;
}): Promise<void> {
  const profile = await resolveFinancialProfile(input.userId, input.profileId);
  if (profile.type !== 'pessoal') throw new BudgetInputError('Metas de orçamento estão disponíveis apenas no perfil pessoal.');
  const categoryId = Number(input.categoryId);
  const mode: 'amount' | 'income_percent' | null = input.mode === 'amount' || input.mode === 'income_percent'
    ? input.mode
    : null;
  const targetValue = Number(input.targetValue);
  if (!Number.isInteger(categoryId) || !mode || !Number.isFinite(targetValue) || targetValue <= 0) {
    throw new BudgetInputError('Informe uma categoria, tipo e valor de meta válidos.');
  }
  if ((mode === 'income_percent' && targetValue > 100) || (mode === 'amount' && targetValue > 9_999_999)) {
    throw new BudgetInputError('O valor da meta está fora do limite permitido.');
  }

  const [category] = await db.select({ id: categories.id }).from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, input.userId))).limit(1);
  if (!category) throw new BudgetInputError('Categoria não encontrada.');

  const [existing] = await db.select({ id: budgetTargets.id }).from(budgetTargets)
    .where(and(eq(budgetTargets.userId, input.userId), eq(budgetTargets.profileId, profile.id), eq(budgetTargets.categoryId, categoryId))).limit(1);
  const values = { mode, targetValue: targetValue.toFixed(2), updatedAt: new Date() };
  if (existing) {
    await db.update(budgetTargets).set(values).where(eq(budgetTargets.id, existing.id));
    return;
  }
  await db.insert(budgetTargets).values({
    userId: input.userId,
    profileId: profile.id,
    categoryId,
    mode,
    targetValue: targetValue.toFixed(2),
  });
}

export async function deleteBudgetTarget(input: { userId: number; profileId: number | null; categoryId: number }): Promise<void> {
  const profile = await resolveFinancialProfile(input.userId, input.profileId);
  await db.delete(budgetTargets).where(and(
    eq(budgetTargets.userId, input.userId),
    eq(budgetTargets.profileId, profile.id),
    eq(budgetTargets.categoryId, input.categoryId),
  ));
}
