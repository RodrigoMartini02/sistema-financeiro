import { pool } from '../db/client';
import { accountWhere } from '../utils/accountFilter';

export interface BalanceBreakdown {
  previousBalance: number;
  totalIncomes: number;
  totalExpenses: number;
  finalBalance: number;
}

// Verifica se existe algum lançamento (receita ou despesa) anterior a um
// (ano, mes), comparando pela mesma chave (ano * 12 + mes) usada em
// calculateBalanceBreakdown e no endpoint /panorama.
async function isInicioRealDoHistorico(userId: number, year: number, month: number, accountId: number | null): Promise<boolean> {
  const { clause, params: extra } = accountWhere(accountId, 3);
  const chave = year * 12 + month;

  const result = await pool.query(
    `SELECT EXISTS (
      SELECT 1 FROM receitas WHERE usuario_id = $1 AND (ano * 12 + mes) < $2 AND status = 'ativa'${clause}
      UNION ALL
      SELECT 1 FROM despesas WHERE usuario_id = $1 AND (ano * 12 + mes) < $2 AND status = 'ativa'${clause}
    ) AS existe`,
    [userId, chave, ...extra],
  );

  return (result.rows[0] as { existe: boolean }).existe === false;
}

export async function fetchAporteInicial(userId: number, accountId: number | null): Promise<number> {
  if (!accountId) return 0;
  const result = await pool.query(
    `SELECT aporte_inicial FROM contas WHERE id = $1 AND usuario_id = $2`,
    [accountId, userId],
  );
  const raw = (result.rows[0] as { aporte_inicial: string | null } | undefined)?.aporte_inicial;
  return raw ? parseFloat(raw) : 0;
}

// Saldo acumulado de tudo que aconteceu ANTES de (year, month): soma direta de
// receitas menos despesas de todo o histórico anterior, numa única query —
// não há mais snapshot gravado (tabela `meses`, removida), então este valor é
// sempre recalculado a partir dos lançamentos reais. Mesma chave de
// comparação (ano * 12 + mes) usada por isInicioRealDoHistorico.
//
// Exportada para o resumo anual (financial.ts): ele já agrega receitas/despesas
// de todos os meses do ano numa única query própria — só precisa deste valor
// como ponto de partida (saldo antes de janeiro) para acumular mês a mês em
// memória, sem repetir esta consulta 12 vezes.
export async function calculatePreviousBalance(userId: number, year: number, month: number, accountId: number | null): Promise<number> {
  const { clause, params: extra } = accountWhere(accountId, 3);
  const chave = year * 12 + month;

  const [incomes, expenses_] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(valor), 0) AS total FROM receitas WHERE usuario_id = $1 AND (ano * 12 + mes) < $2 AND status = 'ativa'${clause}`,
      [userId, chave, ...extra],
    ),
    pool.query(
      `SELECT COALESCE(SUM(CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE valor_original END), 0) AS total FROM despesas WHERE usuario_id = $1 AND (ano * 12 + mes) < $2 AND status = 'ativa'${clause}`,
      [userId, chave, ...extra],
    ),
  ]);

  const totalIncomes = parseFloat((incomes.rows[0] as { total: string }).total);
  const totalExpenses = parseFloat((expenses_.rows[0] as { total: string }).total);
  const historico = totalIncomes - totalExpenses;

  // Aporte inicial só entra se (year, month) for de fato o início real do
  // histórico (nenhum lançamento antes dele) — evita somar o aporte de novo
  // em qualquer mês que já tenha lançamentos anteriores. Checado sempre,
  // independente do valor de `historico`: um mês no meio do histórico pode
  // coincidentemente ter receitas = despesas anteriores, sem ser o início.
  const isInicio = await isInicioRealDoHistorico(userId, year, month, accountId);
  if (isInicio) return await fetchAporteInicial(userId, accountId);

  return historico;
}

// Saldo detalhado de um mês específico: o que veio de antes (calculado em
// tempo real, sem snapshot) + o que aconteceu no próprio mês.
export async function calculateBalanceBreakdown(userId: number, year: number, month: number, accountId: number | null): Promise<BalanceBreakdown> {
  const { clause, params: extra } = accountWhere(accountId, 4);

  const [incomes, expenses_, previousBalance] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(valor), 0) AS total FROM receitas WHERE usuario_id = $1 AND ano = $2 AND mes = $3 AND status = 'ativa'${clause}`,
      [userId, year, month, ...extra],
    ),
    // Cada parcela ja grava o proprio valor individual (digitado direto ou
    // derivado do preco a vista dividido no formulario) — soma direta, sem
    // dividir de novo por numero_parcelas. Mesma formula usada no historico.
    pool.query(
      `SELECT COALESCE(SUM(CASE WHEN pago THEN COALESCE(valor_pago, valor_original) ELSE valor_original END), 0) AS total FROM despesas WHERE usuario_id = $1 AND ano = $2 AND mes = $3 AND status = 'ativa'${clause}`,
      [userId, year, month, ...extra],
    ),
    calculatePreviousBalance(userId, year, month, accountId),
  ]);

  const totalIncomes = parseFloat((incomes.rows[0] as { total: string }).total);
  const totalExpenses = parseFloat((expenses_.rows[0] as { total: string }).total);

  return { previousBalance, totalIncomes, totalExpenses, finalBalance: previousBalance + totalIncomes - totalExpenses };
}

export async function calculateFinalBalance(userId: number, year: number, month: number, accountId: number | null): Promise<number> {
  const breakdown = await calculateBalanceBreakdown(userId, year, month, accountId);
  return breakdown.finalBalance;
}
