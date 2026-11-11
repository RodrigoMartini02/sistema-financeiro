import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { brasiliaDate } from '../collector/dates';
import type { TendersDb } from '../collector/database';
import { tenderPeople, tenderSanctionChecks } from '../db/schema';
import { SANCTION_SUBJECT_BASES, type PersonRole, type SanctionBase, type SanctionRecord, type SanctionStatus, type TenderRole } from '../domains';
import { RequestInputError } from '../utils/requestInput';
import { readCompanyProfile } from './companyProfile';
import { toBrasiliaIso } from './dates';
import type { SanctionCheckInput } from './sanctionInput';
import {
  SANCTION_CHECK_DEADLINE_MS,
  SanctionSourceRateLimitedError,
  SanctionSourceUnavailableError,
  type SanctionSearchResult,
  type SanctionSource,
} from './sanctionSource';
import {
  SANCTION_REUSE_MINUTES,
  SANCTION_STALE_DAYS,
  isSanctionCheckReusable,
  isSanctionCheckStale,
  isSanctionRecordInForce,
  sanctionBaseStatusOn,
} from './sanctionStatus';

// Sanções (item 6, migration 0007): a consulta de CEIS, CNEP e CEPIM da empresa da conta (pelo CNPJ) e de CEIS e CNEP de cada
// pessoa do cofre (pelo CPF), com o resultado guardado por base. A empresa é de todos com acesso ao módulo; as pessoas, dado
// pessoal de terceiros, só do titular (a leitura e a consulta conferem o papel). Toda leitura e escrita filtra a conta da
// sessão. O documento nunca vem do pedido (o CNPJ é o da conta, o CPF é o da pessoa) nem é gravado aqui, e nada dele vai para
// o log. A situação (sem registro, em vigor, encerrada) sai dos registros guardados e do dia de hoje, nunca é gravada.

const UNAVAILABLE_MESSAGE = 'A consulta de sanções não está disponível agora. Tente de novo mais tarde.';
const RATE_LIMITED_MESSAGE = 'A consulta de sanções está limitada no momento. Tente de novo em instantes.';
const NO_DOCUMENT_MESSAGE = 'Esta conta não tem CNPJ cadastrado.';
const PERSON_NOT_FOUND_MESSAGE = 'Pessoa não encontrada';
const TITULAR_ONLY_MESSAGE = 'Só o titular da conta pode consultar as pessoas.';

/** Quem pede: a conta e o papel vêm da sessão (trava do módulo), nunca do pedido. */
export interface SanctionActor {
  accountId: number;
  userId: number;
  role: TenderRole;
}

/** O que a consulta usa: o Postgres, a fonte (nula sem a chave do portal) e o relógio. */
export interface SanctionsDeps {
  db: TendersDb;
  source: SanctionSource | null;
  now: () => Date;
}

/** Um registro como a tela o recebe: sem o identificador da fonte, e com a vigência no dia de hoje. */
export interface SanctionRecordView {
  category: string | null;
  organ: string | null;
  startDate: string | null;
  endDate: string | null;
  legalBasis: string | null;
  process: string | null;
  note: string | null;
  /** Ainda vale na data de referência (sem data final, vale; no CEPIM, sempre). */
  inForce: boolean;
}

export interface SanctionBaseView {
  base: SanctionBase;
  status: SanctionStatus;
  /** Quando a base foi consultada (ISO de Brasília); nulo: nunca. */
  checkedAt: string | null;
  /** A consulta tem mais de 7 dias: a tela pede nova consulta. */
  stale: boolean;
  /** A fonte tinha mais registros do que os guardados. */
  truncated: boolean;
  records: SanctionRecordView[];
}

export interface SanctionCompanyView {
  name: string | null;
  /** Os 14 dígitos; nulo: a conta não tem CNPJ e a empresa não pode ser consultada. */
  cnpj: string | null;
  /** A situação cadastral que o Perfil guarda (consulta da Receita), só leitura; nulo: nunca consultada. */
  registration: { code: string; since: string | null; lookedUpAt: string | null } | null;
  /** CEIS, CNEP e CEPIM, sempre as três. */
  bases: SanctionBaseView[];
}

export interface SanctionPersonView {
  id: number;
  name: string;
  roles: PersonRole[];
  /** CEIS e CNEP. O CPF nunca sai. */
  bases: SanctionBaseView[];
}

export interface SanctionOverview {
  /** Há chave do portal configurada: sem ela, a tela mostra "consulta indisponível". */
  available: boolean;
  /** O dia da situação (hoje em Brasília), AAAA-MM-DD. */
  referenceDate: string;
  /** Dentro deste prazo uma consulta vale e a fonte não é chamada de novo (a tela pula quem está em dia). */
  reuseMinutes: number;
  staleDays: number;
  company: SanctionCompanyView;
  /** As pessoas do cofre, só para o titular; nulo para o colaborador. */
  people: SanctionPersonView[] | null;
}

export interface SanctionCheckResult {
  /** O assunto consultado, atualizado: a empresa ou a pessoa (o outro vem nulo). */
  company: SanctionCompanyView | null;
  person: SanctionPersonView | null;
  /** As bases que não puderam ser consultadas agora (as outras foram guardadas). */
  failed: SanctionBase[];
}

// --- Leitura -------------------------------------------------------------------------------------------------------------

const checkColumns = {
  personId: tenderSanctionChecks.personId,
  base: tenderSanctionChecks.base,
  records: tenderSanctionChecks.records,
  truncated: tenderSanctionChecks.truncated,
  checkedAt: tenderSanctionChecks.checkedAt,
};

type CheckRow = {
  personId: number | null;
  base: SanctionBase;
  records: unknown;
  truncated: boolean;
  checkedAt: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const storedText = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
const storedDate = (value: unknown): string | null => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

/** Lê os registros guardados sem confiar no formato: campo que não é texto vira null, e data que não se lê, "sem data final". */
export function readStoredRecords(value: unknown): SanctionRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) =>
    isRecord(item)
      ? [
          {
            id: storedText(item['id']),
            category: storedText(item['category']),
            organ: storedText(item['organ']),
            startDate: storedDate(item['startDate']),
            endDate: storedDate(item['endDate']),
            legalBasis: storedText(item['legalBasis']),
            process: storedText(item['process']),
            note: storedText(item['note']),
          },
        ]
      : [],
  );
}

function baseView(base: SanctionBase, row: CheckRow | undefined, referenceDate: string, now: Date): SanctionBaseView {
  if (row === undefined) {
    return { base, status: 'NAO_CONSULTADO', checkedAt: null, stale: false, truncated: false, records: [] };
  }
  const records = readStoredRecords(row.records);
  const checkedAt = toBrasiliaIso(row.checkedAt);
  return {
    base,
    status: sanctionBaseStatusOn(base, records, referenceDate),
    checkedAt,
    stale: checkedAt === null || isSanctionCheckStale(checkedAt, now),
    truncated: row.truncated,
    records: records.map((record) => ({
      category: record.category,
      organ: record.organ,
      startDate: record.startDate,
      endDate: record.endDate,
      legalBasis: record.legalBasis,
      process: record.process,
      note: record.note,
      inForce: base === 'CEPIM' || isSanctionRecordInForce(record, referenceDate),
    })),
  };
}

/** As bases do assunto, na ordem da lista, cada uma com a consulta guardada (ou "não consultado"). */
function subjectBaseViews(bases: readonly SanctionBase[], rows: readonly CheckRow[], referenceDate: string, now: Date): SanctionBaseView[] {
  const byBase = new Map(rows.map((row) => [row.base, row]));
  return bases.map((base) => baseView(base, byBase.get(base), referenceDate, now));
}

async function readCompany(db: TendersDb, accountId: number) {
  const profile = await readCompanyProfile(db, accountId);
  return {
    name: profile.tradeName ?? profile.legalName,
    cnpj: profile.document !== null && /^\d{14}$/.test(profile.document) ? profile.document : null,
    registration:
      profile.registrationStatus === null
        ? null
        : { code: profile.registrationStatus.code, since: profile.registrationStatus.since, lookedUpAt: profile.lookedUpAt },
  };
}

/**
 * A tela de sanções: a empresa com as três bases e, só para o titular, cada pessoa do cofre com as duas dela. O colaborador
 * nem lê as linhas das pessoas. Nada aqui chama a fonte.
 */
export async function readSanctions(deps: SanctionsDeps, actor: SanctionActor): Promise<SanctionOverview> {
  const now = deps.now();
  const referenceDate = brasiliaDate(now);
  const canSeePeople = actor.role === 'TITULAR';

  const [company, rows, people] = await Promise.all([
    readCompany(deps.db, actor.accountId),
    deps.db
      .select(checkColumns)
      .from(tenderSanctionChecks)
      .where(canSeePeople ? eq(tenderSanctionChecks.accountId, actor.accountId) : and(eq(tenderSanctionChecks.accountId, actor.accountId), isNull(tenderSanctionChecks.personId))),
    canSeePeople
      ? deps.db
          .select({ id: tenderPeople.id, name: tenderPeople.name, roles: tenderPeople.roles })
          .from(tenderPeople)
          .where(eq(tenderPeople.accountId, actor.accountId))
          .orderBy(asc(tenderPeople.name), asc(tenderPeople.id))
      : Promise.resolve(null),
  ]);

  const rowsByPerson = new Map<number, CheckRow[]>();
  for (const row of rows) {
    if (row.personId !== null) {
      rowsByPerson.set(row.personId, [...(rowsByPerson.get(row.personId) ?? []), row]);
    }
  }
  return {
    available: deps.source !== null,
    referenceDate,
    reuseMinutes: SANCTION_REUSE_MINUTES,
    staleDays: SANCTION_STALE_DAYS,
    company: {
      ...company,
      bases: subjectBaseViews(SANCTION_SUBJECT_BASES.COMPANY, rows.filter((row) => row.personId === null), referenceDate, now),
    },
    people:
      people === null
        ? null
        : people.map((person) => ({
            id: person.id,
            name: person.name,
            roles: person.roles,
            bases: subjectBaseViews(SANCTION_SUBJECT_BASES.PERSON, rowsByPerson.get(person.id) ?? [], referenceDate, now),
          })),
  };
}

// --- Consulta ------------------------------------------------------------------------------------------------------------

type CheckTarget =
  | {
      personId: null;
      /** Os 14 dígitos do CNPJ da conta. */
      document: string;
      company: Omit<SanctionCompanyView, 'bases'>;
    }
  | {
      personId: number;
      /** Os 11 dígitos do CPF gravado na pessoa: sai do banco, nunca do pedido. */
      document: string;
      person: { id: number; name: string; roles: PersonRole[] };
    };

/** Quem se consulta: a empresa da conta (o CNPJ gravado) ou uma pessoa da conta (só o titular; o CPF gravado). */
async function resolveTarget(db: TendersDb, actor: SanctionActor, input: SanctionCheckInput): Promise<CheckTarget> {
  if (input.personId === null) {
    const company = await readCompany(db, actor.accountId);
    if (company.cnpj === null) {
      throw new RequestInputError(NO_DOCUMENT_MESSAGE);
    }
    return { personId: null, document: company.cnpj, company };
  }

  if (actor.role !== 'TITULAR') {
    throw new RequestInputError(TITULAR_ONLY_MESSAGE, 403);
  }
  const [person] = await db
    .select({ id: tenderPeople.id, name: tenderPeople.name, roles: tenderPeople.roles, cpf: tenderPeople.cpf })
    .from(tenderPeople)
    .where(and(eq(tenderPeople.accountId, actor.accountId), eq(tenderPeople.id, input.personId)))
    .limit(1);
  if (!person) {
    throw new RequestInputError(PERSON_NOT_FOUND_MESSAGE, 404);
  }
  return { personId: person.id, document: person.cpf, person: { id: person.id, name: person.name, roles: person.roles } };
}

/** As consultas guardadas de um assunto: as da empresa (`personId` nulo) ou as da pessoa, sempre da conta. */
function readSubjectRows(db: TendersDb, accountId: number, personId: number | null): Promise<CheckRow[]> {
  return db
    .select(checkColumns)
    .from(tenderSanctionChecks)
    .where(
      and(
        eq(tenderSanctionChecks.accountId, accountId),
        personId === null ? isNull(tenderSanctionChecks.personId) : eq(tenderSanctionChecks.personId, personId),
      ),
    );
}

/**
 * Guarda o resultado de uma base (uma linha por conta, assunto e base; a consulta nova substitui a antiga). Para a pessoa, só
 * guarda se ela ainda existe com o mesmo CPF consultado: o bloqueio de leitura faz uma troca de CPF concorrente esperar este
 * commit (e então apagar o resultado) ou terminar antes (e então este resultado não é gravado). Devolve se gravou.
 */
async function saveCheck(
  db: TendersDb,
  actor: SanctionActor,
  target: CheckTarget,
  base: SanctionBase,
  result: SanctionSearchResult,
  now: Date,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    if (target.personId !== null) {
      const [current] = await tx
        .select({ cpf: tenderPeople.cpf })
        .from(tenderPeople)
        .where(and(eq(tenderPeople.accountId, actor.accountId), eq(tenderPeople.id, target.personId)))
        .for('share');
      if (!current || current.cpf !== target.document) {
        return false;
      }
    }
    const checkedAt = now.toISOString();
    // O destino do conflito é o índice único parcial do assunto (a empresa e as pessoas têm um cada); o predicado dele
    // (`targetWhere`) só o Drizzle aceita como SQL.
    await tx
      .insert(tenderSanctionChecks)
      .values({
        accountId: actor.accountId,
        personId: target.personId,
        base,
        records: result.records,
        truncated: result.truncated,
        checkedAt,
        checkedBy: actor.userId,
      })
      .onConflictDoUpdate(
        target.personId === null
          ? {
              target: [tenderSanctionChecks.accountId, tenderSanctionChecks.base],
              targetWhere: sql`pessoa_id IS NULL`,
              set: { records: result.records, truncated: result.truncated, checkedAt, checkedBy: actor.userId },
            }
          : {
              target: [tenderSanctionChecks.accountId, tenderSanctionChecks.personId, tenderSanctionChecks.base],
              targetWhere: sql`pessoa_id IS NOT NULL`,
              set: { records: result.records, truncated: result.truncated, checkedAt, checkedBy: actor.userId },
            },
      );
    return true;
  });
}

/**
 * Consulta as bases do assunto (a empresa, ou a pessoa do `personId`) e guarda o resultado de cada uma. A base consultada há
 * menos de 15 minutos é reaproveitada sem chamar a fonte. A falha é por base: o que deu certo fica guardado e `failed` lista o
 * resto; só quando nada pôde ser consultado nem reaproveitado a consulta responde erro (429 se a fonte limitou, senão 503).
 * Excesso de pedidos (429 da fonte) interrompe as bases seguintes. Sem a chave do portal, 503 "indisponível".
 */
export async function checkSanctions(deps: SanctionsDeps, actor: SanctionActor, input: SanctionCheckInput): Promise<SanctionCheckResult> {
  const source = deps.source;
  if (source === null) {
    throw new RequestInputError(UNAVAILABLE_MESSAGE, 503);
  }

  const target = await resolveTarget(deps.db, actor, input);
  const bases = target.personId === null ? SANCTION_SUBJECT_BASES.COMPANY : SANCTION_SUBJECT_BASES.PERSON;
  const now = deps.now();
  const referenceDate = brasiliaDate(now);

  const storedByBase = new Map((await readSubjectRows(deps.db, actor.accountId, target.personId)).map((row) => [row.base, row]));
  const toCheck = bases.filter((base) => {
    const row = storedByBase.get(base);
    const checkedAt = row === undefined ? null : toBrasiliaIso(row.checkedAt);
    return checkedAt === null || !isSanctionCheckReusable(checkedAt, now);
  });
  const reused = bases.length - toCheck.length;

  const failed: SanctionBase[] = [];
  let saved = 0;
  let rateLimited = false;
  const deadline = AbortSignal.timeout(SANCTION_CHECK_DEADLINE_MS);
  for (const base of toCheck) {
    if (rateLimited || deadline.aborted) {
      failed.push(base);
      continue;
    }
    try {
      const result = await source.search(base, target.document, { signal: deadline });
      if (result.discarded > 0) {
        console.warn('Sanction source returned records for another document:', { accountId: actor.accountId, base, discarded: result.discarded });
      }
      if (await saveCheck(deps.db, actor, target, base, result, now)) {
        saved += 1;
      } else {
        failed.push(base);
      }
    } catch (error) {
      if (error instanceof SanctionSourceRateLimitedError) {
        rateLimited = true;
        failed.push(base);
        console.warn('Sanction source rate limited:', { accountId: actor.accountId, base });
      } else if (error instanceof SanctionSourceUnavailableError) {
        failed.push(base);
        // O motivo vem do cliente da fonte e nunca leva URL, chave nem documento.
        console.error('Sanction source unavailable:', { accountId: actor.accountId, base, reason: error.message });
      } else {
        throw error;
      }
    }
  }

  if (reused + saved === 0) {
    throw rateLimited ? new RequestInputError(RATE_LIMITED_MESSAGE, 429) : new RequestInputError(UNAVAILABLE_MESSAGE, 503);
  }

  const rows = await readSubjectRows(deps.db, actor.accountId, target.personId);
  const views = subjectBaseViews(bases, rows, referenceDate, now);
  if (target.personId === null) {
    return { company: { ...target.company, bases: views }, person: null, failed };
  }
  return { company: null, person: { ...target.person, bases: views }, failed };
}
