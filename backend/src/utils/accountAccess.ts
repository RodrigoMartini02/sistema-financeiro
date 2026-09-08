import { pool } from '../db/client';

/**
 * Confirma que o solicitante pode GRAVAR na conta informada.
 *
 * O `conta_id` chega no corpo da requisicao, vindo do localStorage do
 * navegador — ou seja, e entrada do usuario. Sem esta checagem, trocar o valor
 * no cliente bastaria para gravar um lancamento na conta de outra pessoa.
 *
 * As rotas de LEITURA ja estavam protegidas: elas filtram por `usuario_id`
 * antes de aplicar qualquer filtro de conta. O buraco era so na escrita.
 *
 * Duas formas de acesso sao aceitas:
 *
 *   1. o solicitante e dono da conta (`contas.usuario_id`)
 *   2. o solicitante e membro ativo dela (`conta_membros`)
 *
 * O segundo caso e essencial: sem ele a carteira compartilhada da familia
 * quebraria no dia em que um membro fosse criado, porque o membro nao possui
 * conta propria — ele lanca na conta do gestor.
 *
 * `conta_id` nulo continua valido e significa "conta pessoal do dono", como
 * trata utils/accountFilter.ts para registros anteriores ao conceito de conta.
 */
export async function canWriteToAccount(
  accountId: number | null,
  requesterId: number,
): Promise<boolean> {
  if (!accountId) return true;

  const conta = await pool.query(
    `SELECT usuario_id FROM contas WHERE id = $1`,
    [accountId],
  );
  const row = conta.rows[0] as { usuario_id: number } | undefined;
  if (!row) return false;
  if (row.usuario_id === requesterId) return true;

  const vinculo = await pool.query(
    `SELECT 1 FROM conta_membros
      WHERE conta_id = $1 AND usuario_id = $2 AND status = 'ativo' LIMIT 1`,
    [accountId, requesterId],
  );
  return vinculo.rows.length > 0;
}

/**
 * Mensagem unica para conta inexistente e conta alheia.
 *
 * Distinguir os dois casos diria a quem tentasse adivinhar ids quais contas
 * existem no sistema.
 */
export const ACCOUNT_ACCESS_DENIED = 'Account not available';
