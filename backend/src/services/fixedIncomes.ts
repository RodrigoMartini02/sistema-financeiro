import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db/client';
import { accounts, incomeClassificationFixes, incomeClassifications, incomes } from '../db/schema';
import { getMonthYearFromIsoDate, getTodayIsoInTimezone } from '../utils/date';
import { competenciaParaLancar, dataDoLancamento } from './fixedIncomeSchedule';
import { sendPushToUser } from './webPush';

export interface FixedIncomesResult {
  launched: number;
  pushSent: number;
}

function formatCurrency(value: string): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Lança como prevista a receita do mês de cada classificação fixa com o
 * automático ligado, no dia do recebimento, e manda um push para quem
 * configurou. Roda na rotina diária (todas as configurações) e na checagem ao
 * abrir o sistema (`userId`: só as de quem abriu).
 *
 * Não verifica antes se o mês já foi lançado: o índice único
 * (classificacao_fixa_id, fixa_competencia) faz o INSERT não fazer nada, e o
 * push só sai para o que foi de fato criado agora — rotina e checagem podem
 * rodar juntas sem duplicar.
 */
export async function processFixedIncomes(options: { userId?: number } = {}): Promise<FixedIncomesResult> {
  const hoje = getTodayIsoInTimezone();
  const raiz = alias(incomeClassifications, 'raiz');

  const configuracoes = await db
    .select({
      id: incomeClassificationFixes.id,
      classificationId: incomeClassificationFixes.classificationId,
      accountId: incomeClassificationFixes.accountId,
      userId: incomeClassificationFixes.userId,
      amount: incomeClassificationFixes.amount,
      dayOfMonth: incomeClassificationFixes.dayOfMonth,
      autoSince: incomeClassificationFixes.autoSince,
      nome: incomeClassifications.name,
      nomeRaiz: raiz.name,
    })
    .from(incomeClassificationFixes)
    .innerJoin(incomeClassifications, eq(incomeClassifications.id, incomeClassificationFixes.classificationId))
    .leftJoin(raiz, eq(raiz.id, incomeClassifications.parentId))
    .innerJoin(accounts, eq(accounts.id, incomeClassificationFixes.accountId))
    .where(and(
      eq(incomeClassificationFixes.autoLaunch, true),
      isNotNull(incomeClassificationFixes.autoSince),
      // Classificação desativada ou conta arquivada param de lançar.
      eq(incomeClassifications.active, true),
      sql`COALESCE(${accounts.active}, true)`,
      options.userId ? eq(incomeClassificationFixes.userId, options.userId) : undefined,
    ));

  let launched = 0;
  let pushSent = 0;

  for (const configuracao of configuracoes) {
    const competencia = competenciaParaLancar(hoje, {
      diaRecebimento: configuracao.dayOfMonth,
      lancarAutomatico: true,
      automaticoDesde: configuracao.autoSince,
    }, false);
    if (!competencia) continue;

    const dataRecebimento = dataDoLancamento(competencia, configuracao.dayOfMonth);
    const { mes, ano } = getMonthYearFromIsoDate(dataRecebimento);
    const descricao = configuracao.nomeRaiz ? `${configuracao.nomeRaiz} › ${configuracao.nome}` : configuracao.nome;

    const inserted = await db
      .insert(incomes)
      .values({
        userId: configuracao.userId,
        accountId: configuracao.accountId,
        description: descricao,
        amount: configuracao.amount,
        receiptDate: dataRecebimento,
        month: mes,
        year: ano,
        status: 'prevista',
        classificationId: configuracao.classificationId,
        fixedClassificationId: configuracao.id,
        fixedCompetence: competencia,
      })
      .onConflictDoNothing()
      .returning({ id: incomes.id });
    if (inserted.length === 0) continue;
    launched += 1;

    // Na checagem ao abrir, o lançamento pode sair dias depois do dia do
    // recebimento: o título só diz "hoje" quando é de fato hoje.
    const { sent } = await sendPushToUser(configuracao.userId, {
      title: dataRecebimento === hoje ? 'Receita prevista para hoje' : 'Receita prevista',
      body: `${descricao} — ${formatCurrency(configuracao.amount)} · confirme o recebimento`,
    });
    if (sent > 0) pushSent += 1;
  }

  return { launched, pushSent };
}
