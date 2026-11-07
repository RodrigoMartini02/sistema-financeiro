import { pool } from '../db/client';
import { getTodayIsoInTimezone } from '../utils/date';
import { resolveVisibleCardOwnerIds } from '../utils/familyVisibility';
import { cardLimitPaymentMethodSql, countedExpenseSql, invoiceDueDateSql, openCardDebtSql } from './expenseCounting';

export interface CardLimit {
  id: number;
  nome: string;
  limite: number;
  usado: number;
  disponivel: number;
  /** Parte do usado que está em fatura já vencida (o vencimento da fatura passou e ela não foi paga no sistema). */
  vencido: number;
}

interface CardLimitRow {
  id: number;
  nome: string;
  limite: string;
  usado: string;
  vencido: string;
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
interface UsageClauses {
  params: unknown[];
  /** Junção das despesas em aberto que ocupam o limite do cartão `c` (despesa `d`). */
  openDebtJoin: string;
  /** Cartões de crédito visíveis (`c`). */
  cardWhere: string;
  /** O parâmetro "hoje" dentro de `params` (ex.: `$2`) e o valor dele. */
  todayParam: string;
  today: string;
}

/** As cláusulas do "Usado", iguais para o total do cartão e para a composição dele. */
function usageClauses(donosVisiveis: number[], accountId: number | null): UsageClauses {
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
  const today = getTodayIsoInTimezone();
  params.push(today);
  const todayParam = `$${params.length}`;
  const countedClause = ` AND ${countedExpenseSql('d', todayParam)}`;
  return {
    params,
    todayParam,
    today,
    openDebtJoin: `d.cartao_id = c.id
       AND ${openCardDebtSql('d')}
       -- Cartao sem tipo conta tudo (lancamentos antigos); 'credito' conta credito
       -- e lancamento sem forma de pagamento; 'ambos' so o credito, senao o debito
       -- do mesmo cartao_id ocuparia o limite.
       AND ${cardLimitPaymentMethodSql('d', 'c')}${expenseAccountClause}${countedClause}`,
    cardWhere: `c.usuario_id = ANY($1) AND c.ativo = true
       AND (c.tipo IS NULL OR c.tipo IN ('credito', 'ambos'))${accountClause}`,
  };
}

export async function getCardLimitsForOwners(donosVisiveis: number[], accountId: number | null): Promise<CardLimit[]> {
  const { params, todayParam, openDebtJoin, cardWhere } = usageClauses(donosVisiveis, accountId);

  const result = await pool.query<CardLimitRow>(
    `SELECT c.id, c.nome, c.limite,
       COALESCE(SUM(
         CASE WHEN d.id IS NOT NULL THEN d.valor_original ELSE 0 END
       ), 0) AS usado,
       COALESCE(SUM(
         CASE WHEN d.id IS NOT NULL AND ${invoiceDueDateSql('d', 'c')} < ${todayParam}::date THEN d.valor_original ELSE 0 END
       ), 0) AS vencido
     FROM cartoes c
     LEFT JOIN despesas d ON ${openDebtJoin}
     WHERE ${cardWhere}
     GROUP BY c.id, c.nome, c.limite
     ORDER BY c.id ASC`,
    params,
  );

  return result.rows.map((row) => {
    const limite = parseFloat(row.limite);
    const usado = parseFloat(row.usado);
    return { id: row.id, nome: row.nome, limite, usado, disponivel: limite - usado, vencido: parseFloat(row.vencido) };
  });
}

export type CardUsageType = 'unicas' | 'parcelas' | 'recorrentes' | 'renegociacao';
export type CardUsageByType = Record<CardUsageType, number>;

export interface CardUsageInvoice {
  /** Mês do vencimento das compras, 'AAAA-MM'. */
  mes: string;
  /** Vencimento da fatura: o dia do cartão no mês. */
  vencimento: string;
  total: number;
  /** O vencimento da fatura já passou e ela continua em aberto no sistema. */
  vencida: boolean;
  porTipo: CardUsageByType;
}

/** De que é feito o "Usado" de um cartão (o mesmo conjunto de despesas de getCardLimitsForOwners). */
export interface CardUsage extends CardLimit {
  hoje: string;
  /** Parte do vencido que "Pagar fatura" consegue quitar (compras no crédito); o resto são lançamentos antigos sem forma de pagamento. */
  vencidoQuitavel: number;
  porTipo: CardUsageByType;
  faturas: CardUsageInvoice[];
}

interface CardUsageRow {
  mes: string;
  vencimento: string;
  tipo: CardUsageType;
  total: string;
  quitavel: string;
}

const centavos = (valor: number) => Math.round(valor * 100) / 100;
const emptyByType = (): CardUsageByType => ({ unicas: 0, parcelas: 0, recorrentes: 0, renegociacao: 0 });

/**
 * A composição do "Usado" de um cartão: por fatura (mês do vencimento) e por tipo (compra única, parcela,
 * recorrente, linha gerada por pagamento de fatura). Soma exatamente o `usado` do cartão. Null quando o
 * cartão não está entre os visíveis.
 */
export async function getCardUsageForOwners(donosVisiveis: number[], accountId: number | null, cardId: number): Promise<CardUsage | null> {
  const limits = await getCardLimitsForOwners(donosVisiveis, accountId);
  const card = limits.find((limit) => limit.id === cardId);
  if (!card) return null;

  const { params, today: hoje, openDebtJoin, cardWhere } = usageClauses(donosVisiveis, accountId);
  params.push(cardId);
  const result = await pool.query<CardUsageRow>(
    `SELECT to_char(date_trunc('month', d.data_vencimento), 'YYYY-MM') AS mes,
       to_char(${invoiceDueDateSql('d', 'c')}, 'YYYY-MM-DD') AS vencimento,
       CASE WHEN d.origem_pagamento_fatura_id IS NOT NULL THEN 'renegociacao'
            WHEN COALESCE(d.recorrente, false) THEN 'recorrentes'
            WHEN COALESCE(d.parcelado, false) THEN 'parcelas'
            ELSE 'unicas' END AS tipo,
       SUM(d.valor_original) AS total,
       SUM(CASE WHEN d.forma_pagamento = 'credito' THEN d.valor_original ELSE 0 END) AS quitavel
     FROM cartoes c
     JOIN despesas d ON ${openDebtJoin}
     WHERE ${cardWhere} AND c.id = $${params.length}
     GROUP BY 1, 2, 3
     ORDER BY 1, 3`,
    params,
  );

  const porTipo = emptyByType();
  const faturas = new Map<string, CardUsageInvoice>();
  let vencidoQuitavel = 0;
  for (const row of result.rows) {
    const total = parseFloat(row.total);
    const fatura = faturas.get(row.mes) ?? {
      mes: row.mes, vencimento: row.vencimento, total: 0, vencida: row.vencimento < hoje, porTipo: emptyByType(),
    };
    fatura.total = centavos(fatura.total + total);
    fatura.porTipo[row.tipo] = centavos(fatura.porTipo[row.tipo] + total);
    faturas.set(row.mes, fatura);
    porTipo[row.tipo] = centavos(porTipo[row.tipo] + total);
    if (fatura.vencida) vencidoQuitavel = centavos(vencidoQuitavel + parseFloat(row.quitavel));
  }
  return { ...card, hoje, vencidoQuitavel, porTipo, faturas: [...faturas.values()] };
}

/** Como getCardLimits, a composição para quem pede (o escopo "familia" decide quais cartões aparecem). */
export async function getCardUsage(userId: number, accountId: number | null, expandir: boolean, cardId: number): Promise<CardUsage | null> {
  const donosVisiveis = await resolveVisibleCardOwnerIds(userId, accountId, expandir);
  return getCardUsageForOwners(donosVisiveis, accountId, cardId);
}
