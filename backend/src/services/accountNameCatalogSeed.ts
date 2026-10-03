import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { DEFAULT_JOB_TITLES, DEFAULT_SECTORS } from './accountNameCatalogDefaults';

type SeedExecutor = Pick<typeof db, 'execute'>;

/** `($1::text), ($2::text), ...` — os nomes como linhas de um VALUES. */
function namesAsValues(names: readonly string[]): SQL {
  return sql.join(names.map((name) => sql`(${name}::text)`), sql`, `);
}

/**
 * Grava os setores e cargos padrão numa conta PJ, na criação dela (cadastro
 * com CNPJ e Nova conta), com o executor da transação que cria a conta.
 * Idempotente: pula o nome que a conta já tiver, ativo ou desativado — não
 * duplica nem traz de volta um padrão desativado de propósito.
 *
 * SQL cru pelo mesmo motivo de ensureDefaultIncomeClassifications: o insert a
 * partir de uma lista com NOT EXISTS não tem boa expressão na API do Drizzle.
 */
export async function ensureDefaultAccountNames(
  executor: SeedExecutor,
  params: { ownerId: number; accountId: number },
): Promise<void> {
  const { ownerId, accountId } = params;

  await executor.execute(sql`
    INSERT INTO setores (usuario_id, conta_id, nome)
    SELECT ${ownerId}::int, ${accountId}::int, padrao.nome
      FROM (VALUES ${namesAsValues(DEFAULT_SECTORS)}) AS padrao(nome)
     WHERE NOT EXISTS (
       SELECT 1 FROM setores existente
        WHERE existente.conta_id = ${accountId}::int AND LOWER(existente.nome) = LOWER(padrao.nome)
     )
  `);

  await executor.execute(sql`
    INSERT INTO cargos (usuario_id, conta_id, nome)
    SELECT ${ownerId}::int, ${accountId}::int, padrao.nome
      FROM (VALUES ${namesAsValues(DEFAULT_JOB_TITLES)}) AS padrao(nome)
     WHERE NOT EXISTS (
       SELECT 1 FROM cargos existente
        WHERE existente.conta_id = ${accountId}::int AND LOWER(existente.nome) = LOWER(padrao.nome)
     )
  `);
}
