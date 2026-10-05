// Catálogo de serviços de uma conta PJ: os serviços aparecem nos contratos
// como lista informativa (com "implantado"), sem valor. Serviço não é
// excluído: desativado, sai das opções do contrato novo e continua nos antigos.
import { and, asc, count, eq, ne, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client';
import { catalogServices, contractServices, type CatalogService } from '../modules/contracts/db/schema';
import { resolveCompanyAccount } from '../utils/accountAccess';
import { RequestInputError } from '../utils/requestInput';
import { CLIENTS_PERSONAL_ACCOUNT_MESSAGE } from './clients';

const SERVICE_NOT_FOUND_MESSAGE = 'Serviço não encontrado';
const DUPLICATE_SERVICE_MESSAGE = 'Já existe um serviço com este nome';

export interface CatalogServiceView {
  id: number;
  name: string;
  active: boolean;
  /** Contratos que listam o serviço. */
  contractCount: number;
}

/** Serviços com a contagem de contratos, numa consulta. */
function selectServiceViews(condition: SQL): Promise<CatalogServiceView[]> {
  return db
    .select({
      id: catalogServices.id,
      name: catalogServices.name,
      active: catalogServices.active,
      contractCount: count(contractServices.contractId),
    })
    .from(catalogServices)
    .leftJoin(contractServices, eq(contractServices.serviceId, catalogServices.id))
    .where(condition)
    .groupBy(catalogServices.id)
    .orderBy(asc(catalogServices.name));
}

export function listCatalogServices(accountId: number, includeInactive: boolean): Promise<CatalogServiceView[]> {
  return selectServiceViews(and(
    eq(catalogServices.accountId, accountId),
    ...(includeInactive ? [] : [eq(catalogServices.active, true)]),
  )!);
}

/** Serviço pelo id, desde que a conta PJ dele seja do solicitante; senão, 404. */
export async function findCatalogServiceForRequester(requesterId: number, serviceId: number): Promise<CatalogService> {
  const [service] = await db.select().from(catalogServices).where(eq(catalogServices.id, serviceId)).limit(1);
  if (!service) {
    throw new RequestInputError(SERVICE_NOT_FOUND_MESSAGE, 404);
  }
  try {
    await resolveCompanyAccount(requesterId, service.accountId, CLIENTS_PERSONAL_ACCOUNT_MESSAGE);
  } catch (error) {
    if (error instanceof RequestInputError) {
      throw new RequestInputError(SERVICE_NOT_FOUND_MESSAGE, 404);
    }
    throw error;
  }
  return service;
}

async function assertNameAvailable(accountId: number, name: string, exceptServiceId: number | null): Promise<void> {
  const [existing] = await db
    .select({ id: catalogServices.id })
    .from(catalogServices)
    .where(and(
      eq(catalogServices.accountId, accountId),
      sql`lower(${catalogServices.name}) = lower(${name})`,
      ...(exceptServiceId === null ? [] : [ne(catalogServices.id, exceptServiceId)]),
    ))
    .limit(1);
  if (existing) {
    throw new RequestInputError(DUPLICATE_SERVICE_MESSAGE, 409);
  }
}

async function toView(serviceId: number): Promise<CatalogServiceView> {
  const [view] = await selectServiceViews(eq(catalogServices.id, serviceId));
  return view!;
}

export async function createCatalogService(account: { id: number; ownerId: number }, name: string): Promise<CatalogServiceView> {
  await assertNameAvailable(account.id, name, null);
  const [service] = await db
    .insert(catalogServices)
    .values({ accountId: account.id, ownerId: account.ownerId, name })
    .returning({ id: catalogServices.id });
  return toView(service!.id);
}

export async function renameCatalogService(service: CatalogService, name: string): Promise<CatalogServiceView> {
  await assertNameAvailable(service.accountId, name, service.id);
  await db.update(catalogServices).set({ name }).where(eq(catalogServices.id, service.id));
  return toView(service.id);
}

export async function setCatalogServiceActive(service: CatalogService, active: boolean): Promise<CatalogServiceView> {
  await db.update(catalogServices).set({ active }).where(eq(catalogServices.id, service.id));
  return toView(service.id);
}
