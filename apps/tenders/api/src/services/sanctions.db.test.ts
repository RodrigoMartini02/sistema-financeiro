import assert from 'node:assert/strict';
import { after, describe, mock, test } from 'node:test';
import { eq, sql } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { closeLocalTestDatabase, createTestAccount, databaseTestsSkipReason, localTestPool, withRollback } from '../collector/dbTestSupport';
import { accounts } from '../db/identity';
import { tenderSanctionChecks } from '../db/schema';
import type { SanctionBase } from '../domains';
import { RequestInputError } from '../utils/requestInput';
import { addAccountMember, requesterOf, testCnpj, testCpf, type TestAccount } from './apiTestSupport';
import {
  SanctionSourceRateLimitedError,
  SanctionSourceUnavailableError,
  type SanctionSearchResult,
  type SanctionSource,
} from './sanctionSource';
import { checkSanctions, readSanctions, type SanctionActor, type SanctionsDeps } from './sanctions';
import { readPersonInput } from './vaultInput';
import { createPerson, deletePerson, updatePerson } from './vaultPeople';

// Sanções (item 6, migration 0007): a consulta de CEIS, CNEP e CEPIM da empresa e das pessoas do cofre com a fonte simulada (nada
// chama o portal), o resultado guardado por base, o reaproveitamento de 15 minutos, a falha por base, a situação pelo dia, o acesso
// por papel, o isolamento entre contas, a limpeza ao mudar o CPF e as restrições do banco. O banco é o local, cada teste numa
// transação desfeita.

const START = new Date('2026-11-11T15:00:00-03:00');
const minutesAfter = (minutes: number) => new Date(START.getTime() + minutes * 60_000);

const none: SanctionSearchResult = { records: [], truncated: false, discarded: 0 };

function found(overrides: Record<string, unknown> = {}, extra: Partial<SanctionSearchResult> = {}): SanctionSearchResult {
  return {
    records: [
      {
        id: '501',
        category: 'Impedimento de licitar',
        organ: 'Ministério Exemplo',
        startDate: '2025-01-01',
        endDate: '2026-12-31',
        legalBasis: 'Lei 14.133/2021, art. 156',
        process: '12345.000001/2025-00',
        note: null,
        ...overrides,
      },
    ],
    truncated: false,
    discarded: 0,
    ...extra,
  };
}

type Script = (base: SanctionBase, document: string, call: number) => SanctionSearchResult | Error | Promise<SanctionSearchResult | Error>;

/** A fonte simulada: o roteiro diz o que cada chamada devolve (ou lança), e as chamadas ficam anotadas. */
function scriptedSource(script: Script) {
  const calls: Array<{ base: SanctionBase; document: string }> = [];
  const source: SanctionSource = {
    async search(base, document) {
      calls.push({ base, document });
      const outcome = await script(base, document, calls.length);
      if (outcome instanceof Error) {
        throw outcome;
      }
      return outcome;
    },
  };
  return { source, calls };
}

/** O relógio do teste: a data de cada chamada é a de `clock.now`. */
function depsOf(db: TendersDb, source: SanctionSource | null, clock: { now: Date } = { now: START }): SanctionsDeps {
  return { db, source, now: () => clock.now };
}

const titularOf = (account: TestAccount): SanctionActor => ({ accountId: account.accountId, userId: account.ownerId, role: 'TITULAR' });

/** Conta com o CNPJ gravado (como a de uma empresa de verdade) e a situação cadastral da Receita já consultada. */
async function companyAccount(tx: TendersDb, label: string, cnpjSeed: number): Promise<{ account: TestAccount; cnpj: string }> {
  const account = await createTestAccount(tx, label);
  const cnpj = testCnpj(cnpjSeed);
  await tx
    .update(accounts)
    .set({ document: cnpj, registrationStatus: 'ATIVA', registrationStatusDate: '2005-11-03', lookedUpAt: '2026-11-10T12:00:00-03:00' })
    .where(eq(accounts.id, account.accountId));
  return { account, cnpj };
}

async function addPerson(tx: TendersDb, account: TestAccount, cpfSeed: number, name: string) {
  return createPerson(tx, requesterOf(account), readPersonInput({ name, cpf: testCpf(cpfSeed), roles: ['SOCIO'] }));
}

const rowsOf = (tx: TendersDb, accountId: number) => tx.select().from(tenderSanctionChecks).where(eq(tenderSanctionChecks.accountId, accountId));

async function rejectedWith(run: Promise<unknown>): Promise<RequestInputError> {
  try {
    await run;
  } catch (error) {
    assert.ok(error instanceof RequestInputError, `esperava RequestInputError, veio ${String(error)}`);
    return error;
  }
  throw new Error('devia recusar');
}

/** A causa do erro do Postgres: o Drizzle 0.45 embrulha o erro do pg, e a mensagem sai em português (testa o código e a restrição). */
const causeOf = (error: unknown) => (error as { cause?: { code?: string; constraint?: string } }).cause;

describe('sanções (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('a empresa: consulta as três bases com o CNPJ da conta, guarda cada uma e a leitura mostra a situação; nada do documento fica gravado', async () => {
    await withRollback(async (tx) => {
      const { account, cnpj } = await companyAccount(tx, 'sancao-empresa', 7001);
      const { source, calls } = scriptedSource((base) => (base === 'CEIS' ? found() : none));
      const deps = depsOf(tx, source);

      const result = await checkSanctions(deps, titularOf(account), { personId: null });
      assert.deepEqual(calls, [
        { base: 'CEIS', document: cnpj },
        { base: 'CNEP', document: cnpj },
        { base: 'CEPIM', document: cnpj },
      ]);
      assert.deepEqual(result.failed, []);
      assert.equal(result.person, null);
      assert.deepEqual(result.company?.bases.map((base) => [base.base, base.status, base.checkedAt]), [
        ['CEIS', 'EM_VIGOR', '2026-11-11T15:00:00-03:00'],
        ['CNEP', 'SEM_REGISTRO', '2026-11-11T15:00:00-03:00'],
        ['CEPIM', 'SEM_REGISTRO', '2026-11-11T15:00:00-03:00'],
      ]);

      const overview = await readSanctions(deps, titularOf(account));
      assert.equal(overview.available, true);
      assert.equal(overview.referenceDate, '2026-11-11');
      assert.deepEqual([overview.reuseMinutes, overview.staleDays], [15, 7]);
      assert.equal(overview.company.cnpj, cnpj);
      assert.deepEqual(overview.company.registration, { code: 'ATIVA', since: '2005-11-03', lookedUpAt: '2026-11-10T12:00:00-03:00' });
      assert.deepEqual(overview.company.bases[0]?.records, [
        {
          category: 'Impedimento de licitar',
          organ: 'Ministério Exemplo',
          startDate: '2025-01-01',
          endDate: '2026-12-31',
          legalBasis: 'Lei 14.133/2021, art. 156',
          process: '12345.000001/2025-00',
          note: null,
          inForce: true,
        },
      ]);
      assert.deepEqual(overview.people, [], 'o titular sem pessoas cadastradas');

      const rows = await rowsOf(tx, account.accountId);
      assert.equal(rows.length, 3);
      assert.ok(rows.every((row) => row.personId === null && row.checkedBy === account.ownerId), 'da empresa, e quem consultou fica registrado');
      assert.ok(!JSON.stringify(rows).includes(cnpj), 'o CNPJ não fica gravado');
    });
  });

  test('a consulta de menos de 15 minutos é reaproveitada sem chamar a fonte; depois disso, consulta de novo e substitui a linha', async () => {
    await withRollback(async (tx) => {
      const { account } = await companyAccount(tx, 'sancao-reuso', 7002);
      const { source, calls } = scriptedSource(() => none);
      const clock = { now: START };
      const deps = depsOf(tx, source, clock);

      await checkSanctions(deps, titularOf(account), { personId: null });
      assert.equal(calls.length, 3);

      clock.now = minutesAfter(14);
      const reused = await checkSanctions(deps, titularOf(account), { personId: null });
      assert.equal(calls.length, 3, 'aos 14 minutos, nada de chamar a fonte');
      assert.deepEqual(reused.failed, []);
      assert.ok(reused.company?.bases.every((base) => base.checkedAt === '2026-11-11T15:00:00-03:00'), 'a data é a da consulta guardada');

      clock.now = minutesAfter(16);
      const again = await checkSanctions(deps, titularOf(account), { personId: null });
      assert.equal(calls.length, 6, 'aos 16 minutos, as três bases de novo');
      assert.ok(again.company?.bases.every((base) => base.checkedAt === '2026-11-11T15:16:00-03:00'));
      assert.equal((await rowsOf(tx, account.accountId)).length, 3, 'a consulta nova substitui a linha');
    });
  });

  test('falha por base: o que deu certo fica guardado, a linha da base que falhou não muda e o log não leva o documento', async () => {
    await withRollback(async (tx) => {
      const { account, cnpj } = await companyAccount(tx, 'sancao-falha-base', 7003);
      let cnepFails = false;
      const { source, calls } = scriptedSource((base) => {
        if (base === 'CNEP' && cnepFails) return new SanctionSourceUnavailableError('HTTP 503');
        return base === 'CNEP' ? found({ id: 'antigo', category: 'Multa' }) : none;
      });
      const clock = { now: START };
      const deps = depsOf(tx, source, clock);
      await checkSanctions(deps, titularOf(account), { personId: null });

      const warn = mock.method(console, 'warn', () => undefined);
      const error = mock.method(console, 'error', () => undefined);
      try {
        clock.now = minutesAfter(20);
        cnepFails = true;
        const result = await checkSanctions(deps, titularOf(account), { personId: null });

        assert.deepEqual(result.failed, ['CNEP']);
        assert.deepEqual(result.company?.bases.map((base) => [base.base, base.checkedAt]), [
          ['CEIS', '2026-11-11T15:20:00-03:00'],
          ['CNEP', '2026-11-11T15:00:00-03:00'],
          ['CEPIM', '2026-11-11T15:20:00-03:00'],
        ]);
        assert.equal(result.company?.bases[1]?.status, 'EM_VIGOR', 'a consulta antiga do CNEP continua à vista, com a data dela');
        assert.equal(calls.length, 6);

        const logged = JSON.stringify([...warn.mock.calls, ...error.mock.calls].map((call) => call.arguments));
        assert.ok(logged.includes('Sanction source unavailable:') && logged.includes('HTTP 503') && logged.includes('CNEP'));
        assert.ok(!logged.includes(cnpj), 'o log não leva o documento');
      } finally {
        warn.mock.restore();
        error.mock.restore();
      }
    });
  });

  test('429 da fonte interrompe as bases seguintes; sem nada consultado nem reaproveitado, a consulta responde 429 (limitada) ou 503 (indisponível) e nada é gravado', async () => {
    await withRollback(async (tx) => {
      const { account } = await companyAccount(tx, 'sancao-429', 7004);
      const warn = mock.method(console, 'warn', () => undefined);
      const error = mock.method(console, 'error', () => undefined);
      try {
        const partial = scriptedSource((base) => (base === 'CEIS' ? none : new SanctionSourceRateLimitedError()));
        const result = await checkSanctions(depsOf(tx, partial.source), titularOf(account), { personId: null });
        assert.deepEqual(result.failed, ['CNEP', 'CEPIM']);
        assert.deepEqual(partial.calls.map((call) => call.base), ['CEIS', 'CNEP'], 'o CEPIM nem chega a ser pedido');
        assert.equal((await rowsOf(tx, account.accountId)).length, 1, 'só o CEIS ficou guardado');
      } finally {
        warn.mock.restore();
        error.mock.restore();
      }

      const limited = await companyAccount(tx, 'sancao-429-b', 7005);
      const warn2 = mock.method(console, 'warn', () => undefined);
      const error2 = mock.method(console, 'error', () => undefined);
      try {
        const limitedFirst = scriptedSource(() => new SanctionSourceRateLimitedError());
        const limitedError = await rejectedWith(checkSanctions(depsOf(tx, limitedFirst.source), titularOf(limited.account), { personId: null }));
        assert.equal(limitedError.status, 429);
        assert.match(limitedError.message, /limitada/);
        assert.equal(limitedFirst.calls.length, 1);

        const down = await companyAccount(tx, 'sancao-503', 7006);
        const unavailable = scriptedSource(() => new SanctionSourceUnavailableError('Request failed (TimeoutError)'));
        const unavailableError = await rejectedWith(checkSanctions(depsOf(tx, unavailable.source), titularOf(down.account), { personId: null }));
        assert.equal(unavailableError.status, 503);
        assert.equal(unavailable.calls.length, 3, 'tenta as três bases, e todas falham');
        assert.equal((await rowsOf(tx, limited.account.accountId)).length + (await rowsOf(tx, down.account.accountId)).length, 0);
      } finally {
        warn2.mock.restore();
        error2.mock.restore();
      }
    });
  });

  test('sem a chave do portal: a leitura diz `available: false` (e mostra o que já foi consultado) e a consulta responde 503; conta sem CNPJ: 400', async () => {
    await withRollback(async (tx) => {
      const { account } = await companyAccount(tx, 'sancao-sem-chave', 7007);
      const { source } = scriptedSource(() => found());
      await checkSanctions(depsOf(tx, source), titularOf(account), { personId: null });

      const withoutKey = depsOf(tx, null);
      const overview = await readSanctions(withoutKey, titularOf(account));
      assert.equal(overview.available, false);
      assert.equal(overview.company.bases[0]?.status, 'EM_VIGOR', 'o resultado guardado continua à vista');
      const error = await rejectedWith(checkSanctions(withoutKey, titularOf(account), { personId: null }));
      assert.equal(error.status, 503);
      assert.match(error.message, /não está disponível/);

      const noDocument = await createTestAccount(tx, 'sancao-sem-cnpj');
      const unusedSource = scriptedSource(() => none);
      const missing = await rejectedWith(checkSanctions(depsOf(tx, unusedSource.source), titularOf(noDocument), { personId: null }));
      assert.deepEqual([missing.status, missing.message], [400, 'Esta conta não tem CNPJ cadastrado.']);
      assert.equal(unusedSource.calls.length, 0);
      const noDocumentOverview = await readSanctions(depsOf(tx, unusedSource.source), titularOf(noDocument));
      assert.equal(noDocumentOverview.company.cnpj, null);
      assert.equal(noDocumentOverview.company.registration, null);
    });
  });

  test('a pessoa: só CEIS e CNEP, pelo CPF gravado; a leitura traz o nome e os papéis, nunca o CPF; o titular vê as pessoas em ordem alfabética', async () => {
    await withRollback(async (tx) => {
      const { account } = await companyAccount(tx, 'sancao-pessoa', 7101);
      const beto = await addPerson(tx, account, 7102, 'Beto Lima');
      const ana = await createPerson(tx, requesterOf(account), readPersonInput({ name: 'Ana Souza', cpf: testCpf(7103), roles: ['SOCIO', 'PROCURADOR'] }));
      const { source, calls } = scriptedSource((_base, _document, call) => (call === 1 ? found({ endDate: '2020-01-01' }) : none));
      const deps = depsOf(tx, source);

      const result = await checkSanctions(deps, titularOf(account), { personId: ana.id });
      assert.deepEqual(calls, [
        { base: 'CEIS', document: testCpf(7103) },
        { base: 'CNEP', document: testCpf(7103) },
      ]);
      assert.equal(result.company, null);
      assert.deepEqual(
        { id: result.person?.id, name: result.person?.name, roles: result.person?.roles, bases: result.person?.bases.map((base) => [base.base, base.status]) },
        { id: ana.id, name: 'Ana Souza', roles: ['SOCIO', 'PROCURADOR'], bases: [['CEIS', 'ENCERRADA'], ['CNEP', 'SEM_REGISTRO']] },
      );

      const overview = await readSanctions(deps, titularOf(account));
      assert.deepEqual(overview.people?.map((person) => person.name), ['Ana Souza', 'Beto Lima']);
      assert.deepEqual(overview.people?.[1]?.bases.map((base) => base.status), ['NAO_CONSULTADO', 'NAO_CONSULTADO']);
      assert.deepEqual(overview.company.bases.map((base) => base.status), ['NAO_CONSULTADO', 'NAO_CONSULTADO', 'NAO_CONSULTADO']);
      assert.equal(overview.people?.find((person) => person.id === beto.id)?.name, 'Beto Lima');

      const everything = JSON.stringify([result, overview, await rowsOf(tx, account.accountId)]);
      assert.ok(!everything.includes(testCpf(7103)) && !everything.includes(testCpf(7102)), 'o CPF não aparece na resposta nem no que fica gravado');
      const rows = await rowsOf(tx, account.accountId);
      assert.deepEqual(rows.map((row) => [row.personId, row.base]).sort(), [[ana.id, 'CEIS'], [ana.id, 'CNEP']]);
    });
  });

  test('o colaborador vê só a empresa: `people` vem nulo, consultar pessoa dá 403 e consultar a empresa vale', async () => {
    await withRollback(async (tx) => {
      const { account } = await companyAccount(tx, 'sancao-colaborador', 7201);
      const colleagueId = await addAccountMember(tx, account, 'sancao-colega', { access: true });
      const ana = await addPerson(tx, account, 7202, 'Ana Souza');
      const { source, calls } = scriptedSource(() => none);
      const deps = depsOf(tx, source);
      const collaborator: SanctionActor = { accountId: account.accountId, userId: colleagueId, role: 'COLABORADOR' };

      await checkSanctions(deps, titularOf(account), { personId: ana.id });
      const callsAfterOwner = calls.length;

      const overview = await readSanctions(deps, collaborator);
      assert.equal(overview.people, null);
      assert.equal(overview.company.bases.length, 3);

      const denied = await rejectedWith(checkSanctions(deps, collaborator, { personId: ana.id }));
      assert.equal(denied.status, 403);
      assert.equal(calls.length, callsAfterOwner, 'a fonte nem foi chamada');

      const company = await checkSanctions(deps, collaborator, { personId: null });
      assert.equal(company.company?.bases.length, 3);
      assert.equal((await rowsOf(tx, account.accountId)).find((row) => row.personId === null)?.checkedBy, colleagueId);
    });
  });

  test('isolamento: cada conta vê só as suas consultas, e a pessoa de outra conta é "não encontrada" sem chamar a fonte', async () => {
    await withRollback(async (tx) => {
      const first = await companyAccount(tx, 'sancao-iso-a', 7301);
      const second = await companyAccount(tx, 'sancao-iso-b', 7302);
      const personOfFirst = await addPerson(tx, first.account, 7303, 'Ana Souza');
      const { source, calls } = scriptedSource(() => found());
      const deps = depsOf(tx, source);
      await checkSanctions(deps, titularOf(first.account), { personId: null });
      await checkSanctions(deps, titularOf(first.account), { personId: personOfFirst.id });
      const callsBefore = calls.length;

      const overviewOfSecond = await readSanctions(deps, titularOf(second.account));
      assert.deepEqual(overviewOfSecond.company.bases.map((base) => base.status), ['NAO_CONSULTADO', 'NAO_CONSULTADO', 'NAO_CONSULTADO']);
      assert.deepEqual(overviewOfSecond.people, []);

      const error = await rejectedWith(checkSanctions(deps, titularOf(second.account), { personId: personOfFirst.id }));
      assert.equal(error.status, 404);
      assert.equal(error.message, 'Pessoa não encontrada');
      assert.equal(calls.length, callsBefore);
      assert.equal((await rowsOf(tx, second.account.accountId)).length, 0);
    });
  });

  test('mudar o CPF da pessoa apaga as consultas dela (e só dela); nome ou o mesmo CPF não apagam; apagar a pessoa leva as consultas', async () => {
    await withRollback(async (tx) => {
      const { account } = await companyAccount(tx, 'sancao-troca-cpf', 7401);
      const ana = await addPerson(tx, account, 7402, 'Ana Souza');
      const beto = await addPerson(tx, account, 7403, 'Beto Lima');
      const { source } = scriptedSource(() => found());
      const deps = depsOf(tx, source);
      await checkSanctions(deps, titularOf(account), { personId: null });
      await checkSanctions(deps, titularOf(account), { personId: ana.id });
      await checkSanctions(deps, titularOf(account), { personId: beto.id });
      assert.equal((await rowsOf(tx, account.accountId)).length, 7);

      await updatePerson(tx, account.accountId, ana.id, { name: 'Ana S. Souza' });
      await updatePerson(tx, account.accountId, ana.id, { cpf: testCpf(7402) });
      assert.equal((await rowsOf(tx, account.accountId)).length, 7, 'só o nome mudou, ou o CPF é o mesmo: as consultas ficam');

      await updatePerson(tx, account.accountId, ana.id, { cpf: testCpf(7499) });
      const afterChange = await rowsOf(tx, account.accountId);
      assert.equal(afterChange.length, 5);
      assert.ok(afterChange.every((row) => row.personId !== ana.id), 'as da Ana foram apagadas');
      assert.equal(afterChange.filter((row) => row.personId === beto.id).length, 2, 'as do Beto ficam');
      assert.equal(afterChange.filter((row) => row.personId === null).length, 3, 'as da empresa ficam');
      const overview = await readSanctions(deps, titularOf(account));
      assert.deepEqual(overview.people?.find((person) => person.id === ana.id)?.bases.map((base) => base.status), ['NAO_CONSULTADO', 'NAO_CONSULTADO']);

      await deletePerson({ db: tx, storage: null }, account.accountId, beto.id);
      const afterDelete = await rowsOf(tx, account.accountId);
      assert.equal(afterDelete.length, 3, 'apagar a pessoa leva as consultas dela (cascata)');
      assert.ok(afterDelete.every((row) => row.personId === null));
    });
  });

  test('o CPF muda durante a consulta: o resultado do CPF antigo não é gravado', async () => {
    await withRollback(async (tx) => {
      const { account } = await companyAccount(tx, 'sancao-corrida', 7501);
      const ana = await addPerson(tx, account, 7502, 'Ana Souza');
      const warn = mock.method(console, 'warn', () => undefined);
      const error = mock.method(console, 'error', () => undefined);
      try {
        const { source } = scriptedSource(async (base) => {
          if (base === 'CEIS') {
            await updatePerson(tx, account.accountId, ana.id, { cpf: testCpf(7599) });
          }
          return found();
        });
        const failure = await rejectedWith(checkSanctions(depsOf(tx, source), titularOf(account), { personId: ana.id }));
        assert.equal(failure.status, 503, 'nada pôde ser guardado nem reaproveitado');
        assert.equal((await rowsOf(tx, account.accountId)).length, 0, 'nenhuma consulta do CPF antigo ficou gravada');
      } finally {
        warn.mock.restore();
        error.mock.restore();
      }
    });
  });

  test('a situação segue o dia: a data final de hoje ainda vale, no dia seguinte encerra sem consultar de novo, e a consulta com mais de 7 dias fica "antiga"', async () => {
    await withRollback(async (tx) => {
      const { account } = await companyAccount(tx, 'sancao-dia', 7601);
      const { source, calls } = scriptedSource((base) => {
        if (base === 'CEIS') return found({ endDate: '2026-11-11' });
        if (base === 'CNEP') return found({ id: '2', endDate: null });
        return found({ id: '3', category: 'Omissão no dever de prestar contas', startDate: null, endDate: null });
      });
      const clock = { now: START };
      const deps = depsOf(tx, source, clock);
      await checkSanctions(deps, titularOf(account), { personId: null });

      const today = await readSanctions(deps, titularOf(account));
      assert.deepEqual(today.company.bases.map((base) => [base.status, base.records[0]?.inForce, base.stale]), [
        ['EM_VIGOR', true, false],
        ['EM_VIGOR', true, false],
        ['EM_VIGOR', true, false],
      ]);

      clock.now = new Date('2026-11-12T10:00:00-03:00');
      const tomorrow = await readSanctions(deps, titularOf(account));
      assert.deepEqual(tomorrow.referenceDate, '2026-11-12');
      assert.deepEqual(tomorrow.company.bases.map((base) => [base.status, base.records[0]?.inForce]), [
        ['ENCERRADA', false],
        ['EM_VIGOR', true],
        ['EM_VIGOR', true],
      ]);
      assert.equal(calls.length, 3, 'ler não consulta de novo');

      clock.now = minutesAfter(8 * 24 * 60);
      const old = await readSanctions(deps, titularOf(account));
      assert.ok(old.company.bases.every((base) => base.stale), 'com mais de 7 dias, antiga');
    });
  });

  test('o aviso de "há mais registros" é guardado, e a quantidade descartada vai para o log sem o documento', async () => {
    await withRollback(async (tx) => {
      const { account, cnpj } = await companyAccount(tx, 'sancao-descarte', 7701);
      const { source } = scriptedSource((base) => (base === 'CEIS' ? found({}, { truncated: true, discarded: 2 }) : none));
      const warn = mock.method(console, 'warn', () => undefined);
      try {
        const result = await checkSanctions(depsOf(tx, source), titularOf(account), { personId: null });
        assert.deepEqual(result.company?.bases.map((base) => base.truncated), [true, false, false]);
        const logged = JSON.stringify(warn.mock.calls.map((call) => call.arguments));
        assert.ok(logged.includes('Sanction source returned records for another document') && logged.includes('"discarded":2'));
        assert.ok(!logged.includes(cnpj));
      } finally {
        warn.mock.restore();
      }
    });
  });

  test('registro guardado com formato fora do esperado é lido sem erro: campo que não é texto vira nulo e data que não se lê vale como em vigor', async () => {
    await withRollback(async (tx) => {
      const { account } = await companyAccount(tx, 'sancao-formato', 7801);
      const stored = JSON.stringify([{ category: 5, organ: 'Órgão', endDate: '31/12/2020' }, 'texto', null]);
      await tx.execute(sql`insert into licitacoes.consulta_sancao (conta_id, base, registros, consultado_em) values (${account.accountId}, 'CEIS', ${stored}::jsonb, now())`);

      const overview = await readSanctions(depsOf(tx, null, { now: new Date() }), titularOf(account));
      const ceis = overview.company.bases[0];
      assert.equal(ceis?.status, 'EM_VIGOR');
      assert.deepEqual(ceis?.records.map((record) => [record.category, record.organ, record.endDate, record.inForce]), [[null, 'Órgão', null, true]]);
    });
  });

  test('restrições do banco: CEPIM só da empresa, base conhecida, registros em lista, uma consulta por conta, assunto e base, e a pessoa é da mesma conta', async () => {
    await withRollback(async (tx) => {
      const first = await createTestAccount(tx, 'sancao-restricoes-a');
      const second = await createTestAccount(tx, 'sancao-restricoes-b');
      const ana = await addPerson(tx, first, 7901, 'Ana Souza');
      const insert = (values: Record<string, unknown>) =>
        tx.transaction(async (inner) => inner.insert(tenderSanctionChecks).values({ accountId: first.accountId, base: 'CEIS', records: [], ...values } as never));

      await assert.rejects(insert({ personId: ana.id, base: 'CEPIM' }), (error) => causeOf(error)?.constraint === 'consulta_sancao_cepim_check');
      await assert.rejects(insert({ base: 'XXXX' }), (error) => causeOf(error)?.constraint === 'consulta_sancao_base_check');
      await assert.rejects(
        tx.transaction(async (inner) => inner.execute(sql`insert into licitacoes.consulta_sancao (conta_id, base, registros) values (${first.accountId}, 'CEIS', '{}'::jsonb)`)),
        (error) => causeOf(error)?.constraint === 'consulta_sancao_registros_check',
      );

      await insert({ base: 'CEIS' });
      await assert.rejects(insert({ base: 'CEIS' }), (error) => causeOf(error)?.constraint === 'ux_consulta_sancao_empresa');
      await insert({ base: 'CEPIM' });
      await insert({ personId: ana.id, base: 'CEIS' });
      await assert.rejects(insert({ personId: ana.id, base: 'CEIS' }), (error) => causeOf(error)?.constraint === 'ux_consulta_sancao_pessoa');

      // A pessoa de outra conta: a chave estrangeira composta recusa (23503).
      await assert.rejects(
        tx.transaction(async (inner) =>
          inner.insert(tenderSanctionChecks).values({ accountId: second.accountId, personId: ana.id, base: 'CEIS', records: [] }),
        ),
        (error) => causeOf(error)?.code === '23503' && causeOf(error)?.constraint === 'consulta_sancao_pessoa_fkey',
      );
    });
  });

  test('com o usuário restrito do coletor (se existir neste banco): a tabela de sanções não é dele, porque a rotina diária não a lê', async (t) => {
    const roleExists = await localTestPool().query("select 1 from pg_roles where rolname = 'licitacoes_coletor'");
    if (roleExists.rowCount === 0) {
      t.skip('o papel licitacoes_coletor não existe neste banco (no banco local, o coletor usa o usuário do app)');
      return;
    }
    await withRollback(async (tx) => {
      const privilege = await tx.execute(sql`select has_table_privilege('licitacoes_coletor', 'licitacoes.consulta_sancao', 'SELECT') as allowed`);
      assert.equal(privilege.rows[0]?.['allowed'], false);
    });
  });
});
