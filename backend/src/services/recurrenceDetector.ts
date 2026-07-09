import { pool } from '../db/client';

interface ExpenseRecord {
  id: number;
  descricao: string;
  valor: string | number;
  mes: number;
  ano: number;
  dia_vencimento: string | number;
  categoria_id: number | null;
  forma_pagamento: string;
  recorrente: boolean;
  grupo_parcelamento_id: number | null;
}

export interface RecurrenceSuggestion {
  descricao: string;
  valor_medio: number;
  valor_variacao: number;
  dia_vencimento: number | null;
  frequencia: string;
  meses_detectados: number;
  score: number;
  categoria_id: number | null;
  forma_pagamento: string;
  confianca: 'alta' | 'media' | 'baixa';
}

async function fetchExpenseHistory(userId: number, months = 4): Promise<ExpenseRecord[]> {
  const start = new Date();
  start.setMonth(start.getMonth() - months);

  try {
    const result = await pool.query(
      `SELECT id, descricao, valor, mes, ano,
         EXTRACT(DAY FROM data_vencimento) as dia_vencimento,
         categoria_id, forma_pagamento, recorrente, grupo_parcelamento_id
       FROM despesas
       WHERE usuario_id = $1
         AND (ano > $2 OR (ano = $2 AND mes >= $3))
         AND recorrente = false
         AND grupo_parcelamento_id IS NULL
       ORDER BY descricao, ano, mes`,
      [userId, start.getFullYear(), start.getMonth()],
    );
    return result.rows as ExpenseRecord[];
  } catch (err) {
    console.error('Fetch expense history error:', (err as Error).message);
    return [];
  }
}

function normalizeDescription(description: string): string {
  return String(description ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a: string, b: string): number {
  const wordsA = new Set(a.split(' '));
  const wordsB = new Set(b.split(' '));
  const intersection = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

export function groupByDescription(expenses: ExpenseRecord[]): Record<string, ExpenseRecord[]> {
  const groups: Record<string, ExpenseRecord[]> = {};
  for (const expense of expenses) {
    const desc = normalizeDescription(expense.descricao);
    let found = false;
    for (const key of Object.keys(groups)) {
      if (similarity(desc, key) >= 0.6) {
        groups[key]!.push(expense);
        found = true;
        break;
      }
    }
    if (!found) groups[desc] = [expense];
  }
  return groups;
}

export function analyzeGroup(description: string, expenses: ExpenseRecord[]): RecurrenceSuggestion | null {
  if (expenses.length < 2) return null;

  const byMonth: Record<string, ExpenseRecord[]> = {};
  for (const e of expenses) {
    const key = `${e.ano}-${String(e.mes).padStart(2, '0')}`;
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key]!.push(e);
  }

  const monthsWithExpenses = Object.keys(byMonth).sort();
  if (monthsWithExpenses.length < 2) return null;

  const values = expenses.map((e) => parseFloat(String(e.valor)));
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const stddev = Math.sqrt(values.map((v) => Math.pow(v - mean, 2)).reduce((s, v) => s + v, 0) / values.length);
  const cv = mean > 0 ? stddev / mean : 1;

  const dueDays = expenses.map((e) => parseInt(String(e.dia_vencimento))).filter((d) => d >= 1 && d <= 31);
  const dayFreq: Record<number, number> = {};
  for (const d of dueDays) dayFreq[d] = (dayFreq[d] ?? 0) + 1;
  const mostCommonDay = Object.entries(dayFreq).sort(([, a], [, b]) => b - a)[0]?.[0];

  let score = 0;
  score += Math.min(monthsWithExpenses.length / 4, 1) * 40;
  if (cv < 0.05) score += 30;
  else if (cv < 0.15) score += 20;
  else if (cv < 0.30) score += 10;

  const maxFreq = Math.max(...Object.values(dayFreq));
  if (dueDays.length > 0) {
    if (maxFreq / dueDays.length >= 0.8) score += 30;
    else if (maxFreq / dueDays.length >= 0.6) score += 15;
  }

  if (score < 50) return null;

  return {
    descricao: expenses[0]!.descricao,
    valor_medio: parseFloat(mean.toFixed(2)),
    valor_variacao: parseFloat(cv.toFixed(3)),
    dia_vencimento: mostCommonDay ? parseInt(mostCommonDay) : null,
    frequencia: 'mensal',
    meses_detectados: monthsWithExpenses.length,
    score,
    categoria_id: expenses[0]!.categoria_id,
    forma_pagamento: expenses[0]!.forma_pagamento,
    confianca: score >= 80 ? 'alta' : score >= 60 ? 'media' : 'baixa',
  };
}

export async function detectRecurrences(userId: number): Promise<RecurrenceSuggestion[]> {
  const expenses = await fetchExpenseHistory(userId, 5);
  if (expenses.length === 0) return [];

  const groups = groupByDescription(expenses);
  const suggestions: RecurrenceSuggestion[] = [];

  for (const [desc, group] of Object.entries(groups)) {
    const analysis = analyzeGroup(desc, group);
    if (analysis) suggestions.push(analysis);
  }

  return suggestions.sort((a, b) => b.score - a.score);
}

export async function saveRecurrence(userId: number, recurrence: RecurrenceSuggestion): Promise<boolean> {
  try {
    await pool.query(
      `INSERT INTO recorrencias_ia (usuario_id, descricao, valor, dia_vencimento, frequencia, categoria_id, forma_pagamento, ativa)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       ON CONFLICT (usuario_id, descricao) DO UPDATE SET
         valor = EXCLUDED.valor,
         dia_vencimento = EXCLUDED.dia_vencimento,
         ativa = true`,
      [userId, recurrence.descricao, recurrence.valor_medio, recurrence.dia_vencimento, recurrence.frequencia ?? 'mensal', recurrence.categoria_id, recurrence.forma_pagamento ?? 'dinheiro'],
    );
    return true;
  } catch (err) {
    console.error('Save recurrence error:', (err as Error).message);
    return false;
  }
}

export async function fetchRecurrences(userId: number): Promise<Array<Record<string, unknown>>> {
  try {
    const result = await pool.query(
      `SELECT r.*, c.nome as categoria_nome
       FROM recorrencias_ia r
       LEFT JOIN categorias c ON r.categoria_id = c.id
       WHERE r.usuario_id = $1 AND r.ativa = true
       ORDER BY r.dia_vencimento`,
      [userId],
    );
    return result.rows as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}
