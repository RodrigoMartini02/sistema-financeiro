import { pool } from '../db/client';
import { resolveVisibleCardOwnerIds } from '../utils/familyVisibility';

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

// Limite usado de um cartão = soma de todas as despesas em aberto (não pagas,
// status ativa) daquele cartão, de qualquer mês — passado, presente ou
// futuro. Isso é intencional: uma compra parcelada em N vezes já grava uma
// linha por parcela (cada uma com seu próprio mês/ano) e ocupa o limite
// inteiro desde a compra, liberando conforme cada parcela é paga — mesma
// lógica de uma fatura de cartão real. Despesas recorrentes não têm linhas
// futuras pré-criadas, então são cobertas pela mesma soma sem tratamento
// especial.
//
// Cartões tipo 'ambos' misturam despesas de débito e crédito no mesmo
// cartao_id (a despesa tem sua própria forma_pagamento, independente do tipo
// cadastrado do cartão) — por isso o filtro precisa considerar tanto o tipo
// do cartão quanto a forma de pagamento da despesa.
//
// O JOIN filtra d.usuario_id explicitamente: cartao_id sozinho já restringe as
// linhas, mas o filtro de usuário é a garantia de isolamento que o resto do
// projeto aplica em toda query de despesas.
//
// status usa COALESCE porque a coluna só é preenchida ao cancelar uma despesa
// (ver UPDATE em routes/expenses.ts); os INSERT não a informam, então linhas
// nunca canceladas podem ter status nulo e sumiriam de um `= 'ativa'` direto.
export async function getCardLimits(userId: number, accountId: number | null): Promise<CardLimit[]> {
  // Com a permissao de cartoes da familia, o card mostra tambem os cartoes dos
  // outros membros. O mesmo conjunto vale para o cartao (quem e o dono) e para
  // a despesa (quem lancou): ampliar so o cartao mostraria o cartao do outro
  // com limite zerado, porque as despesas dele nao entrariam na soma.
  const donosVisiveis = await resolveVisibleCardOwnerIds(userId, accountId);
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

  const result = await pool.query<CardLimitRow>(
    `SELECT c.id, c.nome, c.limite,
       COALESCE(SUM(
         CASE WHEN d.id IS NOT NULL THEN COALESCE(d.valor_final, d.valor_original) ELSE 0 END
       ), 0) AS usado
     FROM cartoes c
     LEFT JOIN despesas d ON d.cartao_id = c.id
       AND d.usuario_id = ANY($1)
       AND d.pago = false
       AND COALESCE(d.status, 'ativa') = 'ativa'
       -- Cartao sem tipo definido conta como credito, mesmo criterio do WHERE
       -- abaixo. Antes a soma exigia forma_pagamento = 'credito' na despesa, e
       -- lancamentos antigos sem esse campo ficavam de fora: o cartao aparecia
       -- na lista mas o valor usado nao subia.
       AND (c.tipo IS NULL OR c.tipo IN ('credito', 'ambos') OR d.forma_pagamento = 'credito')${expenseAccountClause}
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
