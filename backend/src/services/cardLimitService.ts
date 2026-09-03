import { pool } from '../db/client';

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
export async function getCardLimits(userId: number, accountId: number | null): Promise<CardLimit[]> {
  const params: unknown[] = [userId];
  let accountClause = '';
  if (accountId) {
    params.push(accountId);
    accountClause = ` AND (c.conta_id = $${params.length} OR (c.conta_id IS NULL AND EXISTS (
      SELECT 1 FROM contas pf WHERE pf.id = $${params.length} AND pf.tipo = 'pessoal' AND pf.usuario_id = c.usuario_id
    )))`;
  }

  const result = await pool.query<CardLimitRow>(
    `SELECT c.id, c.nome, c.limite,
       COALESCE(SUM(
         CASE WHEN d.id IS NOT NULL THEN COALESCE(d.valor_final, d.valor_original) ELSE 0 END
       ), 0) AS usado
     FROM cartoes c
     LEFT JOIN despesas d ON d.cartao_id = c.id
       AND d.pago = false
       AND d.status = 'ativa'
       AND (c.tipo = 'credito' OR d.forma_pagamento = 'credito')
     WHERE c.usuario_id = $1 AND c.ativo = true
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
