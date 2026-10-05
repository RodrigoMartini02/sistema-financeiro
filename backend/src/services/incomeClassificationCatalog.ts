import { and, eq, isNull, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { accounts, incomeClassifications, type IncomeClassification } from '../db/schema';
import { canWriteToAccount } from '../utils/accountAccess';
import type { ChargeKind } from './contractTypes';
import {
  CONTRACT_INCOME_CLASSIFICATION,
  getDefaultIncomeClassifications,
  type IncomeClassificationAccountType,
} from './incomeClassificationDefaults';

type ClassificationExecutor = Pick<typeof db, 'execute'>;

/**
 * Catálogo que uma conta enxerga: as padrão do tipo dela (do dono) e as criadas
 * nela. Em conta compartilhada o catálogo é do dono, não de quem lança — mesma
 * regra das categorias.
 */
export interface IncomeClassificationCatalog {
  ownerId: number;
  accountType: IncomeClassificationAccountType;
  accountId: number;
}

/**
 * Grava as padrão do tipo de conta para o usuário (idempotente). SQL cru pelo
 * mesmo motivo de ensureDefaultCategories: o ON CONFLICT aponta para um índice
 * único parcial com LOWER(nome), que a API do Drizzle não expressa.
 */
export async function ensureDefaultIncomeClassifications(
  userId: number,
  accountType: IncomeClassificationAccountType = 'pessoal',
  executor: ClassificationExecutor = db,
): Promise<void> {
  for (const item of getDefaultIncomeClassifications(accountType)) {
    await executor.execute(sql`
      INSERT INTO classificacoes_receita (usuario_id, tipo, nome)
      VALUES (${userId}, ${accountType}, ${item.nome})
      ON CONFLICT (usuario_id, LOWER(nome), tipo) WHERE conta_id IS NULL DO NOTHING
    `);
    for (const sub of item.subcategorias) {
      await executor.execute(sql`
        INSERT INTO classificacoes_receita (usuario_id, tipo, nome, parent_id)
        SELECT ${userId}, ${accountType}, ${sub}, id
          FROM classificacoes_receita
         WHERE usuario_id = ${userId} AND tipo = ${accountType} AND conta_id IS NULL
           AND LOWER(nome) = LOWER(${item.nome})
        ON CONFLICT (usuario_id, LOWER(nome), tipo) WHERE conta_id IS NULL DO NOTHING
      `);
    }
  }
}

/**
 * Resolve o catálogo da conta informada, confirmando que o solicitante pode
 * usá-la (dono ou membro ativo). Sem conta, vale a conta padrão do solicitante.
 * Devolve null para conta inexistente ou alheia.
 */
export async function resolveIncomeClassificationCatalog(
  requesterId: number,
  accountId: number | null,
): Promise<IncomeClassificationCatalog | null> {
  const [account] = await db
    .select({ id: accounts.id, ownerId: accounts.userId, type: accounts.type })
    .from(accounts)
    .where(accountId
      ? eq(accounts.id, accountId)
      : and(eq(accounts.userId, requesterId), eq(accounts.isDefault, true)))
    .limit(1);
  if (!account) return null;
  if (!(await canWriteToAccount(account.id, requesterId))) return null;
  return { ownerId: account.ownerId, accountType: account.type, accountId: account.id };
}

export function belongsToCatalog(catalog: IncomeClassificationCatalog): SQL {
  return and(
    eq(incomeClassifications.userId, catalog.ownerId),
    or(
      and(isNull(incomeClassifications.accountId), eq(incomeClassifications.type, catalog.accountType)),
      eq(incomeClassifications.accountId, catalog.accountId),
    ),
  )!;
}

export async function findCatalogClassification(
  catalog: IncomeClassificationCatalog,
  classificationId: number,
): Promise<IncomeClassification | null> {
  const [found] = await db
    .select()
    .from(incomeClassifications)
    .where(and(eq(incomeClassifications.id, classificationId), belongsToCatalog(catalog)))
    .limit(1);
  return found ?? null;
}

/**
 * Valida o `classificacao_id` vindo do client contra o catálogo da conta do
 * lançamento. Nulo é válido (receita sem classificação).
 */
export async function isClassificationAllowed(
  requesterId: number,
  accountId: number | null,
  classificationId: number | null,
): Promise<boolean> {
  if (classificationId === null) return true;
  const catalog = await resolveIncomeClassificationCatalog(requesterId, accountId);
  if (!catalog) return false;
  return (await findCatalogClassification(catalog, classificationId)) !== null;
}

/** Id da classificação padrão de mesmo nome no catálogo, ou null. */
export async function findDefaultClassificationId(
  catalog: IncomeClassificationCatalog,
  name: string,
): Promise<number | null> {
  const [found] = await db
    .select({ id: incomeClassifications.id })
    .from(incomeClassifications)
    .where(and(
      eq(incomeClassifications.userId, catalog.ownerId),
      isNull(incomeClassifications.accountId),
      eq(incomeClassifications.type, catalog.accountType),
      sql`LOWER(${incomeClassifications.name}) = LOWER(${name})`,
    ))
    .limit(1);
  return found?.id ?? null;
}

/** `classificacao_id` do body/query: inteiro positivo ou null. */
export function parseClassificationId(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
}

/**
 * Categoria de receita da PJ do dono (sem conta específica), criada se faltar
 * — sem recriar as demais padrão. SQL cru pelo mesmo motivo de
 * ensureDefaultIncomeClassifications: o ON CONFLICT aponta para um índice
 * único parcial com LOWER(nome). A busca é feita no mesmo executor, que
 * enxerga a linha ainda não confirmada da transação.
 */
export async function ensureCompanyIncomeClassification(
  executor: Pick<typeof db, 'execute' | 'select'>,
  ownerId: number,
  name: string,
): Promise<number> {
  await executor.execute(sql`
    INSERT INTO classificacoes_receita (usuario_id, tipo, nome)
    VALUES (${ownerId}, 'empresa', ${name})
    ON CONFLICT (usuario_id, LOWER(nome), tipo) WHERE conta_id IS NULL DO NOTHING
  `);
  return findCompanyClassificationId(executor, ownerId, name);
}

/**
 * Subcategoria de "Contratos" da cobrança (Mensalidade, Implantação ou
 * Projeto) da PJ do dono, criada se faltar, com a raiz. Usada quando o
 * contrato não escolheu a categoria da cobrança.
 */
export async function ensureContractIncomeClassification(
  executor: Pick<typeof db, 'execute' | 'select'>,
  ownerId: number,
  chargeKind: ChargeKind,
): Promise<number> {
  const root = CONTRACT_INCOME_CLASSIFICATION.raiz;
  const name = CONTRACT_INCOME_CLASSIFICATION[chargeKind];
  await executor.execute(sql`
    INSERT INTO classificacoes_receita (usuario_id, tipo, nome)
    VALUES (${ownerId}, 'empresa', ${root})
    ON CONFLICT (usuario_id, LOWER(nome), tipo) WHERE conta_id IS NULL DO NOTHING
  `);
  await executor.execute(sql`
    INSERT INTO classificacoes_receita (usuario_id, tipo, nome, parent_id)
    SELECT ${ownerId}, 'empresa', ${name}, id
      FROM classificacoes_receita
     WHERE usuario_id = ${ownerId} AND tipo = 'empresa' AND conta_id IS NULL AND LOWER(nome) = LOWER(${root})
    ON CONFLICT (usuario_id, LOWER(nome), tipo) WHERE conta_id IS NULL DO NOTHING
  `);
  return findCompanyClassificationId(executor, ownerId, name);
}

/** A busca usa o mesmo executor, que enxerga a linha ainda não confirmada da transação. */
async function findCompanyClassificationId(
  executor: Pick<typeof db, 'select'>,
  ownerId: number,
  name: string,
): Promise<number> {
  const [classification] = await executor
    .select({ id: incomeClassifications.id })
    .from(incomeClassifications)
    .where(and(
      eq(incomeClassifications.userId, ownerId),
      eq(incomeClassifications.type, 'empresa'),
      isNull(incomeClassifications.accountId),
      sql`LOWER(${incomeClassifications.name}) = LOWER(${name})`,
    ))
    .limit(1);
  if (!classification) {
    throw new Error(`Income classification "${name}" missing after insert`);
  }
  return classification.id;
}
