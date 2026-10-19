import { pool } from '../db/client';
import { getTodayIsoInTimezone } from '../utils/date';
import { resolveVisibleCardOwnerIds } from '../utils/familyVisibility';
import { cardLimitPaymentMethodSql, countedExpenseSql, openCardDebtSql } from './expenseCounting';

export interface CardLimit {
  id: number;
  nome: string;
  limite: number;
  usado: number;
  disponivel: number;
}

interface CardLimitRow {
  id: number;
  nome: string;
  limite: string;
  usado: string;
}

// Limite usado de um cartão = soma de todas as despesas em aberto (openCardDebtSql:
// não pagas, com pago em branco incluso, e ativas) daquele cartão, de qualquer
// mês — passado, presente ou futuro. Isso é intencional: uma compra parcelada em N vezes já grava uma
// linha por parcela (cada uma com seu próprio mês/ano) e ocupa o limite
// inteiro desde a compra, liberando conforme cada parcela é paga — mesma
// lógica de uma fatura de cartão real. A despesa mensal já tem as ocorrências
// do ano gravadas, mas a em aberto só ocupa o limite depois da cobrança (a data
// de compra; expenseCounting), como no banco.
//
// Cartões tipo 'ambos' misturam despesas de débito e crédito no mesmo
// cartao_id (a despesa tem sua própria forma_pagamento, independente do tipo
// cadastrado do cartão) — por isso o filtro precisa considerar tanto o tipo
// do cartão quanto a forma de pagamento da despesa.
//
// O limite é do cartão, não de quem comprou: ocupa o limite toda compra em aberto
// feita nele, de qualquer pessoa (a fatura é do dono do cartão e inclui as compras
// dos outros, cardInvoiceService). O isolamento vem do filtro dos cartões
// (c.usuario_id = ANY($1): só os que o solicitante pode ver), e cartao_id ata cada
// despesa a um deles. Antes a soma também exigia d.usuario_id = ANY($1), e a compra
// de outra pessoa no cartão do titular ficava de fora da visão "só eu".
//
// A soma usa valor_original, a unica coluna de valor da despesa: valor_final e
// valor eram copias dela e foram removidas. Em parcelada cada linha ja guarda o
// valor da parcela, entao a soma nao precisa dividir nada.
//
// status usa COALESCE porque a coluna só é preenchida ao cancelar uma despesa
// (ver UPDATE em routes/expenses.ts); os INSERT não a informam, então linhas
// nunca canceladas podem ter status nulo e sumiriam de um `= 'ativa'` direto.
export async function getCardLimits(userId: number, accountId: number | null, expandir: boolean): Promise<CardLimit[]> {
  // `expandir` e a intencao explicita de quem chama (ex.: o modal de despesa sempre
  // pede familia, para poder usar um cartao de outro membro; a tela de
  // Movimentacoes repassa o filtro de Membros escolhido). Ele decide so quais
  // cartoes aparecem; o usado de cada um soma as compras de qualquer pessoa.
  const donosVisiveis = await resolveVisibleCardOwnerIds(userId, accountId, expandir);
  return getCardLimitsForOwners(donosVisiveis, accountId);
}

/**
 * Mesmo cálculo de getCardLimits, para uma lista de donos já resolvida por quem
 * chama. O Painel usa esta variante porque lá o limite segue a visibilidade de
 * LANÇAMENTOS (quem vê os lançamentos de outros vê também o limite dos cartões
 * deles), e não a permissão de usar cartões de outros ao lançar.
 */
export async function getCardLimitsForOwners(donosVisiveis: number[], accountId: number | null): Promise<CardLimit[]> {
  const params: unknown[] = [donosVisiveis];
  let accountClause = '';
  let expenseAccountClause = '';
  if (accountId) {
    params.push(accountId);
    accountClause = ` AND (c.conta_id = $${params.length} OR (c.conta_id IS NULL AND EXISTS (
      SELECT 1 FROM contas pf WHERE pf.id = $${params.length} AND pf.tipo = 'pessoal' AND pf.usuario_id = c.usuario_id
    )))`;
    // O cartao ja era filtrado por conta, mas a despesa nao: lancamento de
    // outra conta somava no limite. Mesmo criterio de utils/accountFilter.ts.
    expenseAccountClause = ` AND (d.conta_id = $${params.length} OR (d.conta_id IS NULL AND EXISTS (
      SELECT 1 FROM contas pd WHERE pd.id = $${params.length} AND pd.tipo = 'pessoal' AND pd.usuario_id = d.usuario_id
    )))`;
  }
  params.push(getTodayIsoInTimezone());
  const countedClause = ` AND ${countedExpenseSql('d', `$${params.length}`)}`;

  const result = await pool.query<CardLimitRow>(
    `SELECT c.id, c.nome, c.limite,
       COALESCE(SUM(
         CASE WHEN d.id IS NOT NULL THEN d.valor_original ELSE 0 END
       ), 0) AS usado
     FROM cartoes c
     LEFT JOIN despesas d ON d.cartao_id = c.id
       AND ${openCardDebtSql('d')}
       -- Cartao sem tipo conta tudo (lancamentos antigos); 'credito' conta credito
       -- e lancamento sem forma de pagamento; 'ambos' so o credito, senao o debito
       -- do mesmo cartao_id ocuparia o limite.
       AND ${cardLimitPaymentMethodSql('d', 'c')}${expenseAccountClause}${countedClause}
     WHERE c.usuario_id = ANY($1) AND c.ativo = true
       AND (c.tipo IS NULL OR c.tipo IN ('credito', 'ambos'))${accountClause}
     GROUP BY c.id, c.nome, c.limite
     ORDER BY c.id ASC`,
    params,
  );

  return result.rows.map((row) => {
    const limite = parseFloat(row.limite);
    const usado = parseFloat(row.usado);
    return { id: row.id, nome: row.nome, limite, usado, disponivel: limite - usado };
  });
}
