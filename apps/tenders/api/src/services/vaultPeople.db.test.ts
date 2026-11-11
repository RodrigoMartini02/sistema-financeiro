import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { closeLocalTestDatabase, createTestAccount, databaseTestsSkipReason, withRollback } from '../collector/dbTestSupport';
import { tenderDocuments, tenderNotifications, tenderPeople } from '../db/schema';
import { createMemoryStorage } from '../objectStorageTestSupport';
import { RequestInputError } from '../utils/requestInput';
import { requesterOf, testCpf } from './apiTestSupport';
import { readPersonInput } from './vaultInput';
import { MAX_PEOPLE_PER_ACCOUNT, createPerson, deletePerson, listPeople, updatePerson } from './vaultPeople';

// Pessoas do cofre (item 5, migration 0006): cadastro com CPF único na conta, papéis, limite de 50, edição, exclusão com a
// cascata dos documentos e dos avisos e, só depois, a dos arquivos no R2, e o isolamento entre contas. O banco é o local,
// cada teste numa transação desfeita.

function personBody(seed: number, overrides: Record<string, unknown> = {}) {
  return { name: `Pessoa ${seed}`, cpf: testCpf(seed), roles: ['SOCIO'], ...overrides };
}

async function rejectedWith(run: Promise<unknown>): Promise<RequestInputError> {
  try {
    await run;
  } catch (error) {
    assert.ok(error instanceof RequestInputError, `esperava RequestInputError, veio ${String(error)}`);
    return error;
  }
  throw new Error('devia recusar');
}

async function insertDocument(tx: TendersDb, accountId: number, personId: number | null, fileKey: string) {
  const [row] = await tx
    .insert(tenderDocuments)
    .values({
      accountId,
      type: personId === null ? 'CONTRATO_SOCIAL' : 'DOCUMENTO_IDENTIDADE',
      personId,
      fileKey,
      fileName: 'a.pdf',
      fileType: 'application/pdf',
      fileSize: 10,
    })
    .returning({ id: tenderDocuments.id });
  if (!row) {
    throw new Error('documento de teste não criado');
  }
  return row.id;
}

describe('pessoas do cofre (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('cadastrar: campos normalizados, sem documentos; a lista vem em ordem alfabética', async () => {
    await withRollback(async (tx) => {
      const requester = requesterOf(await createTestAccount(tx, 'pessoa-cadastrar'));
      const zeca = await createPerson(tx, requester, readPersonInput({ ...personBody(100), name: ' Zeca  Silva ', roles: ['PROCURADOR', 'SOCIO'], email: 'ZECA@exemplo.com', jobTitle: 'Gerente', phone: '(98) 99999-0000' }));
      assert.deepEqual(
        { name: zeca.name, cpf: zeca.cpf, roles: zeca.roles, jobTitle: zeca.jobTitle, email: zeca.email, phone: zeca.phone, documentCount: zeca.documentCount },
        { name: 'Zeca Silva', cpf: testCpf(100), roles: ['PROCURADOR', 'SOCIO'], jobTitle: 'Gerente', email: 'zeca@exemplo.com', phone: '(98) 99999-0000', documentCount: 0 },
      );
      assert.match(zeca.createdAt ?? '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/);
      await createPerson(tx, requester, readPersonInput({ ...personBody(101), name: 'Ana' }));
      await createPerson(tx, requester, readPersonInput({ ...personBody(102), name: 'Bia' }));

      const list = await listPeople(tx, requester.accountId);
      assert.equal(list.limit, MAX_PEOPLE_PER_ACCOUNT);
      assert.deepEqual(list.items.map((person) => person.name), ['Ana', 'Bia', 'Zeca Silva']);
      const [row] = await tx.select().from(tenderPeople).where(eq(tenderPeople.id, zeca.id));
      assert.equal(row?.createdBy, requester.userId, 'quem cadastrou fica registrado');
    });
  });

  test('CPF único na conta (400 com mensagem), mas o mesmo CPF pode estar em outra conta', async () => {
    await withRollback(async (tx) => {
      const first = requesterOf(await createTestAccount(tx, 'pessoa-cpf-a'));
      const second = requesterOf(await createTestAccount(tx, 'pessoa-cpf-b'));
      await createPerson(tx, first, readPersonInput(personBody(200)));

      const error = await rejectedWith(createPerson(tx, first, readPersonInput({ ...personBody(200), name: 'Outra pessoa' })));
      assert.equal(error.status, 400);
      assert.equal(error.message, 'Já existe uma pessoa com este CPF nesta conta');

      const sameCpfElsewhere = await createPerson(tx, second, readPersonInput(personBody(200)));
      assert.equal(sameCpfElsewhere.cpf, testCpf(200));
      assert.equal((await listPeople(tx, first.accountId)).items.length, 1);
      assert.equal((await listPeople(tx, second.accountId)).items.length, 1);
    });
  });

  test('limite de 50 por conta: a 51ª dá erro 400, e cada conta tem o seu limite', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'pessoa-limite');
      const requester = requesterOf(account);
      const other = requesterOf(await createTestAccount(tx, 'pessoa-limite-outra'));
      await tx.insert(tenderPeople).values(
        Array.from({ length: MAX_PEOPLE_PER_ACCOUNT }, (_, index) => ({ accountId: account.accountId, name: `P ${index}`, cpf: testCpf(300 + index), roles: ['SOCIO' as const] })),
      );

      const error = await rejectedWith(createPerson(tx, requester, readPersonInput(personBody(999))));
      assert.equal(error.status, 400);
      assert.match(error.message, /50 pessoas/);
      assert.equal((await createPerson(tx, other, readPersonInput(personBody(999)))).cpf, testCpf(999));
    });
  });

  test('alterar: só o que veio; vazio limpa; o CPF novo não pode ser de outra pessoa da conta; o próprio CPF pode ficar', async () => {
    await withRollback(async (tx) => {
      const requester = requesterOf(await createTestAccount(tx, 'pessoa-alterar'));
      const ana = await createPerson(tx, requester, readPersonInput({ ...personBody(400), jobTitle: 'Diretora', phone: '98' }));
      const bia = await createPerson(tx, requester, readPersonInput(personBody(401)));

      const renamed = await updatePerson(tx, requester.accountId, ana.id, { name: 'Ana Maria', roles: ['REPRESENTANTE_LEGAL', 'SOCIO'] });
      assert.equal(renamed.name, 'Ana Maria');
      assert.deepEqual(renamed.roles, ['REPRESENTANTE_LEGAL', 'SOCIO']);
      assert.equal(renamed.jobTitle, 'Diretora', 'campo ausente mantém');
      assert.equal(renamed.cpf, testCpf(400));

      const cleared = await updatePerson(tx, requester.accountId, ana.id, { jobTitle: null, phone: null });
      assert.equal(cleared.jobTitle, null);
      assert.equal(cleared.phone, null);

      assert.equal((await updatePerson(tx, requester.accountId, ana.id, { cpf: testCpf(400) })).cpf, testCpf(400), 'o próprio CPF não conflita');
      const conflict = await rejectedWith(updatePerson(tx, requester.accountId, bia.id, { cpf: testCpf(400) }));
      assert.equal(conflict.message, 'Já existe uma pessoa com este CPF nesta conta');
      assert.equal((await updatePerson(tx, requester.accountId, bia.id, { cpf: testCpf(402) })).cpf, testCpf(402));

      const [row] = await tx.select().from(tenderPeople).where(eq(tenderPeople.id, ana.id));
      assert.ok(row && row.updatedAt >= row.createdAt, 'a data de alteração acompanha');
    });
  });

  test('outra conta não vê, não altera e não apaga: 404 igual ao de uma pessoa que não existe', async () => {
    await withRollback(async (tx) => {
      const owner = requesterOf(await createTestAccount(tx, 'pessoa-dona'));
      const stranger = requesterOf(await createTestAccount(tx, 'pessoa-estranha'));
      const person = await createPerson(tx, owner, readPersonInput(personBody(500)));
      const { storage } = createMemoryStorage();

      assert.deepEqual((await listPeople(tx, stranger.accountId)).items, []);
      const update = await rejectedWith(updatePerson(tx, stranger.accountId, person.id, { name: 'Invasor' }));
      const missing = await rejectedWith(updatePerson(tx, stranger.accountId, 999_999_999, { name: 'Invasor' }));
      assert.equal(update.status, 404);
      assert.equal(update.message, missing.message);
      assert.equal((await rejectedWith(deletePerson({ db: tx, storage }, stranger.accountId, person.id))).status, 404);

      const [row] = await tx.select().from(tenderPeople).where(eq(tenderPeople.id, person.id));
      assert.equal(row?.name, 'Pessoa 500', 'nada mudou');
    });
  });

  test('contagem de documentos na lista, por pessoa', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'pessoa-contagem');
      const requester = requesterOf(account);
      const ana = await createPerson(tx, requester, readPersonInput({ ...personBody(600), name: 'Ana' }));
      const bia = await createPerson(tx, requester, readPersonInput({ ...personBody(601), name: 'Bia' }));
      await insertDocument(tx, account.accountId, ana.id, 'documentos/x/1.pdf');
      await insertDocument(tx, account.accountId, ana.id, 'documentos/x/2.pdf');
      await insertDocument(tx, account.accountId, null, 'documentos/x/3.pdf');

      const list = await listPeople(tx, account.accountId);
      assert.deepEqual(list.items.map((person) => [person.name, person.documentCount]), [['Ana', 2], ['Bia', 0]]);
      assert.equal(bia.documentCount, 0);
    });
  });

  test('apagar: a pessoa, os documentos dela e os avisos deles saem; os arquivos saem do R2 depois; os da empresa ficam', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'pessoa-apagar');
      const requester = requesterOf(account);
      const { storage, objects } = createMemoryStorage();
      const ana = await createPerson(tx, requester, readPersonInput(personBody(700)));
      const bia = await createPerson(tx, requester, readPersonInput(personBody(701)));
      for (const key of ['documentos/1/ana-1.pdf', 'documentos/1/ana-2.pdf', 'documentos/1/bia-1.pdf', 'documentos/1/empresa.pdf']) {
        await storage.putObject(key, new Uint8Array([1]), 'application/pdf');
      }
      const anaDocument = await insertDocument(tx, account.accountId, ana.id, 'documentos/1/ana-1.pdf');
      await insertDocument(tx, account.accountId, ana.id, 'documentos/1/ana-2.pdf');
      await insertDocument(tx, account.accountId, bia.id, 'documentos/1/bia-1.pdf');
      await insertDocument(tx, account.accountId, null, 'documentos/1/empresa.pdf');
      await tx.insert(tenderNotifications).values({
        accountId: account.accountId,
        userId: account.ownerId,
        type: 'DOCUMENTO_VENCE_30D',
        title: 'vence',
        link: '/documentacao?aba=pessoas',
        documentId: anaDocument,
        reference: '2026-12-01',
      });

      const result = await deletePerson({ db: tx, storage }, account.accountId, ana.id);
      assert.deepEqual(result, { removedDocuments: 2 });
      assert.deepEqual((await listPeople(tx, account.accountId)).items.map((person) => person.id), [bia.id]);
      const remaining = await tx.select({ fileKey: tenderDocuments.fileKey }).from(tenderDocuments).where(eq(tenderDocuments.accountId, account.accountId));
      assert.deepEqual(remaining.map((row) => row.fileKey).sort(), ['documentos/1/bia-1.pdf', 'documentos/1/empresa.pdf']);
      assert.deepEqual([...objects.keys()].sort(), ['documentos/1/bia-1.pdf', 'documentos/1/empresa.pdf'], 'só os arquivos da Ana saíram do R2');
      const notices = await tx.select({ id: tenderNotifications.id }).from(tenderNotifications).where(and(eq(tenderNotifications.accountId, account.accountId), eq(tenderNotifications.documentId, anaDocument)));
      assert.deepEqual(notices, [], 'o aviso do documento sai junto');
    });
  });

  test('apagar sem R2 configurado: as linhas saem do mesmo jeito (os objetos ficam registrados como lixo)', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'pessoa-apagar-sem-r2');
      const requester = requesterOf(account);
      const person = await createPerson(tx, requester, readPersonInput(personBody(800)));
      await insertDocument(tx, account.accountId, person.id, 'documentos/1/a.pdf');

      const originalError = console.error;
      console.error = () => {};
      try {
        assert.deepEqual(await deletePerson({ db: tx, storage: null }, account.accountId, person.id), { removedDocuments: 1 });
      } finally {
        console.error = originalError;
      }
      assert.deepEqual((await listPeople(tx, account.accountId)).items, []);
    });
  });

  test('a chave composta recusa documento de uma pessoa de outra conta (nem por erro do código)', async () => {
    await withRollback(async (tx) => {
      const mine = await createTestAccount(tx, 'pessoa-fk-minha');
      const theirs = await createTestAccount(tx, 'pessoa-fk-deles');
      const theirPerson = await createPerson(tx, requesterOf(theirs), readPersonInput(personBody(900)));

      await assert.rejects(
        insertDocument(tx, mine.accountId, theirPerson.id, 'documentos/1/a.pdf'),
        (error: unknown) => {
          const cause = (error as { cause?: { code?: string; constraint?: string } }).cause;
          return cause?.code === '23503' && cause.constraint === 'documento_pessoa_fkey';
        },
      );
    });
  });

  test('o banco recusa CPF fora de 11 dígitos, pessoa sem papel e documento com arquivo vazio ou datas trocadas', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'pessoa-checks');
      await assert.rejects(
        tx.insert(tenderPeople).values({ accountId: account.accountId, name: 'X', cpf: '123', roles: ['SOCIO'] }),
        (error: unknown) => (error as { cause?: { constraint?: string } }).cause?.constraint === 'pessoa_cpf_check',
      );
    });
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'pessoa-checks-papeis');
      await assert.rejects(
        tx.insert(tenderPeople).values({ accountId: account.accountId, name: 'X', cpf: testCpf(1000), roles: [] }),
        (error: unknown) => (error as { cause?: { constraint?: string } }).cause?.constraint === 'pessoa_papeis_check',
      );
    });
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'pessoa-checks-datas');
      await assert.rejects(
        tx.insert(tenderDocuments).values({
          accountId: account.accountId,
          type: 'CERTIDAO_FGTS',
          issuedOn: '2026-12-02',
          validUntil: '2026-12-01',
          fileKey: 'documentos/1/a.pdf',
          fileName: 'a.pdf',
          fileType: 'application/pdf',
          fileSize: 10,
        }),
        (error: unknown) => (error as { cause?: { constraint?: string } }).cause?.constraint === 'documento_datas_check',
      );
    });
  });
});
