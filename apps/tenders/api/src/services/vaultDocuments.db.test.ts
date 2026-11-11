import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { and, eq } from 'drizzle-orm';
import { addCalendarDays } from '../collector/dates';
import type { TendersDb } from '../collector/database';
import { closeLocalTestDatabase, createTestAccount, databaseTestsSkipReason, withRollback } from '../collector/dbTestSupport';
import { tenderDocuments, tenderNotifications } from '../db/schema';
import type { TenderRole } from '../domains';
import type { ObjectStorage } from '../objectStorage';
import { createMemoryStorage } from '../objectStorageTestSupport';
import { RequestInputError } from '../utils/requestInput';
import { addAccountMember, requesterOf, testCpf, type TestAccount } from './apiTestSupport';
import { DOCUMENT_LINK_TTL_SECONDS, type DocumentUpload } from './documentUpload';
import {
  MAX_DOCUMENTS_PER_ACCOUNT,
  createDocument,
  deleteDocument,
  documentLink,
  listDocuments,
  updateDocument,
  type VaultActor,
  type VaultDeps,
} from './vaultDocuments';
import { readNewDocumentInput, readPersonInput } from './vaultInput';
import { createPerson } from './vaultPeople';

// Documentos do cofre (item 5, migration 0006): guardar com o arquivo no R2 (simulado), a situação pelo dia, o documento
// vigente de cada tipo, as regras de acesso (documento de pessoa só do titular), o limite por conta, as falhas do R2 e do
// banco sem deixar objeto solto, trocar o arquivo, apagar e o link de abertura. O banco é o local, numa transação desfeita.

const TODAY = '2026-11-11';
const NOW = new Date(`${TODAY}T12:00:00-03:00`);
const inDays = (days: number) => addCalendarDays(TODAY, days);

const PDF: DocumentUpload = {
  bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]),
  contentType: 'application/pdf',
  extension: 'pdf',
  fileName: 'certidao.pdf',
};
const PNG: DocumentUpload = {
  bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9]),
  contentType: 'image/png',
  extension: 'png',
  fileName: 'foto da certidão.png',
};

function deps(tx: TendersDb, storage: ObjectStorage | null): VaultDeps {
  return { db: tx, storage, now: () => NOW };
}

function actorOf(account: TestAccount, role: TenderRole = 'TITULAR', userId = account.ownerId): VaultActor {
  return { ...requesterOf(account), userId, role };
}

function newDocument(type: string, overrides: Record<string, unknown> = {}) {
  return readNewDocumentInput({ type, ...overrides });
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

async function storedKeyOf(tx: TendersDb, documentId: number): Promise<string> {
  const [row] = await tx.select({ fileKey: tenderDocuments.fileKey }).from(tenderDocuments).where(eq(tenderDocuments.id, documentId));
  assert.ok(row, 'documento não encontrado');
  return row.fileKey;
}

describe('documentos do cofre (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('guardar documento da empresa: o arquivo vai ao R2 com a chave da conta, a linha guarda a chave e a resposta não a mostra', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'doc-guardar');
      const { storage, objects, metadata } = createMemoryStorage();

      const view = await createDocument(deps(tx, storage), actorOf(account), newDocument('CERTIDAO_FGTS', { issuedOn: inDays(-20), validUntil: inDays(10) }), PDF);

      assert.equal(view.type, 'CERTIDAO_FGTS');
      assert.equal(view.personId, null);
      assert.equal(view.fileName, 'certidao.pdf');
      assert.equal(view.fileType, 'application/pdf');
      assert.equal(view.fileSize, PDF.bytes.byteLength);
      assert.deepEqual({ status: view.status, daysToExpire: view.daysToExpire, current: view.current }, { status: 'EXPIRING', daysToExpire: 10, current: true });
      assert.ok(!('fileKey' in view), 'a chave do R2 nunca sai');
      assert.match(view.createdAt ?? '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/);

      const key = await storedKeyOf(tx, view.id);
      assert.match(key, new RegExp(`^documentos/${account.accountId}/[0-9a-f-]{36}\\.pdf$`));
      assert.deepEqual([...objects.keys()], [key]);
      assert.equal(metadata.get(key)?.contentType, 'application/pdf');
      const [row] = await tx.select().from(tenderDocuments).where(eq(tenderDocuments.id, view.id));
      assert.equal(row?.createdBy, account.ownerId);
    });
  });

  test('situação pelo dia: sem validade e a 31 dias, válido; a 30 dias e no próprio dia, vencendo; ontem, vencido', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'doc-situacao');
      const { storage } = createMemoryStorage();
      const created = new Map<string, Awaited<ReturnType<typeof createDocument>>>();
      // Atestados convivem (todos vigentes): cada um com a sua validade.
      for (const [label, validUntil] of [['sem', undefined], ['mais31', inDays(31)], ['mais30', inDays(30)], ['hoje', inDays(0)], ['ontem', inDays(-1)]] as const) {
        created.set(label, await createDocument(deps(tx, storage), actorOf(account), newDocument('ATESTADO_CAPACIDADE', { description: label, validUntil }), PDF));
      }
      const standing = (label: string) => {
        const view = created.get(label);
        return [view?.status, view?.daysToExpire];
      };
      assert.deepEqual(standing('sem'), ['VALID', null]);
      assert.deepEqual(standing('mais31'), ['VALID', 31]);
      assert.deepEqual(standing('mais30'), ['EXPIRING', 30]);
      assert.deepEqual(standing('hoje'), ['EXPIRING', 0]);
      assert.deepEqual(standing('ontem'), ['EXPIRED', -1]);

      const listed = await listDocuments(deps(tx, storage), actorOf(account));
      assert.equal(listed.items.length, 5);
      assert.equal(listed.limit, MAX_DOCUMENTS_PER_ACCOUNT);
      assert.equal(listed.storageAvailable, true);
      assert.ok(listed.items.every((item) => item.current), 'tipos que convivem: todos vigentes');
    });
  });

  test('vigente: nos tipos em que o novo substitui o anterior, só o mais recente (emissão, depois o último enviado); sem emissão fica por último', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'doc-vigente');
      const { storage } = createMemoryStorage();
      const make = (type: string, overrides: Record<string, unknown>) => createDocument(deps(tx, storage), actorOf(account), newDocument(type, overrides), PDF);

      const oldFgts = await make('CERTIDAO_FGTS', { issuedOn: '2026-09-01', validUntil: '2026-10-01' });
      const newFgts = await make('CERTIDAO_FGTS', { issuedOn: '2026-10-20', validUntil: '2026-11-20' });
      const undatedFgts = await make('CERTIDAO_FGTS', { validUntil: '2026-12-31' });
      const firstFederal = await make('CERTIDAO_FEDERAL', { issuedOn: '2026-10-01', validUntil: '2027-03-30' });
      const secondFederal = await make('CERTIDAO_FEDERAL', { issuedOn: '2026-10-01', validUntil: '2027-03-30' });
      const labor = await make('CERTIDAO_TRABALHISTA', { issuedOn: '2026-08-01', validUntil: '2027-01-28' });
      const attestA = await make('ATESTADO_CAPACIDADE', { description: 'A' });
      const attestB = await make('ATESTADO_CAPACIDADE', { description: 'B' });

      const items = (await listDocuments(deps(tx, storage), actorOf(account))).items;
      const flags = new Map(items.map((item) => [item.id, item.current]));
      assert.equal(flags.get(newFgts.id), true, 'a emissão mais nova é a vigente');
      assert.equal(flags.get(oldFgts.id), false);
      assert.equal(flags.get(undatedFgts.id), false, 'sem emissão, vai para o fim do histórico');
      assert.equal(flags.get(secondFederal.id), true, 'no empate, o último enviado');
      assert.equal(flags.get(firstFederal.id), false);
      assert.equal(flags.get(labor.id), true, 'cada tipo tem o seu vigente');
      assert.equal(flags.get(attestA.id), true);
      assert.equal(flags.get(attestB.id), true, 'atestados convivem');

      const fgtsOrder = items.filter((item) => item.type === 'CERTIDAO_FGTS').map((item) => item.id);
      assert.deepEqual(fgtsOrder, [newFgts.id, oldFgts.id, undatedFgts.id], 'dentro do tipo, do mais recente ao mais antigo');
    });
  });

  test('documento de pessoa: o titular guarda e vê; o colaborador não vê, não abre, não altera, não apaga e não guarda', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'doc-pessoa');
      const collaboratorId = await addAccountMember(tx, account, 'doc-pessoa-colab', { access: true });
      const titular = actorOf(account);
      const collaborator = actorOf(account, 'COLABORADOR', collaboratorId);
      const { storage, objects } = createMemoryStorage();
      const person = await createPerson(tx, titular, readPersonInput({ name: 'Ana', cpf: testCpf(1100), roles: ['PROCURADOR'] }));

      const personal = await createDocument(deps(tx, storage), titular, newDocument('PROCURACAO', { personId: person.id, description: 'Pregão 4/2026' }), PDF);
      const company = await createDocument(deps(tx, storage), collaborator, newDocument('CONTRATO_SOCIAL'), PDF);
      assert.equal(personal.personId, person.id);

      assert.deepEqual((await listDocuments(deps(tx, storage), titular)).items.map((item) => item.id).sort(), [personal.id, company.id].sort());
      assert.deepEqual((await listDocuments(deps(tx, storage), collaborator)).items.map((item) => item.id), [company.id], 'o colaborador só vê o da empresa');

      for (const attempt of [
        documentLink(deps(tx, storage), collaborator, personal.id),
        updateDocument(deps(tx, storage), collaborator, personal.id, { description: 'invasão' }, null),
        deleteDocument(deps(tx, storage), collaborator, personal.id),
      ]) {
        const error = await rejectedWith(attempt);
        assert.equal(error.status, 404);
        assert.equal(error.message, 'Documento não encontrado');
      }
      const storing = await rejectedWith(createDocument(deps(tx, storage), collaborator, newDocument('PROCURACAO', { personId: person.id, description: 'x' }), PDF));
      assert.equal(storing.status, 403);
      assert.equal(objects.size, 2, 'o envio do colaborador nem chegou ao R2');

      const [row] = await tx.select().from(tenderDocuments).where(eq(tenderDocuments.id, personal.id));
      assert.equal(row?.description, 'Pregão 4/2026', 'nada mudou');
      assert.equal((await documentLink(deps(tx, storage), collaborator, company.id)).fileName, 'certidao.pdf', 'o da empresa o colaborador abre');
    });
  });

  test('pessoa de outra conta: 404 ao guardar o documento, e nada vai ao R2', async () => {
    await withRollback(async (tx) => {
      const mine = await createTestAccount(tx, 'doc-pessoa-minha');
      const theirs = await createTestAccount(tx, 'doc-pessoa-deles');
      const theirPerson = await createPerson(tx, actorOf(theirs), readPersonInput({ name: 'Eles', cpf: testCpf(1200), roles: ['SOCIO'] }));
      const { storage, objects } = createMemoryStorage();

      const error = await rejectedWith(createDocument(deps(tx, storage), actorOf(mine), newDocument('DOCUMENTO_IDENTIDADE', { personId: theirPerson.id }), PDF));
      assert.equal(error.status, 404);
      assert.equal(error.message, 'Pessoa não encontrada');
      assert.equal(objects.size, 0);
      assert.deepEqual((await listDocuments(deps(tx, storage), actorOf(theirs))).items, []);
    });
  });

  test('limite de 300 documentos por conta: o 301º dá erro 400 e cada conta tem o seu', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'doc-limite');
      const other = await createTestAccount(tx, 'doc-limite-outra');
      const { storage, objects } = createMemoryStorage();
      await tx.insert(tenderDocuments).values(
        Array.from({ length: MAX_DOCUMENTS_PER_ACCOUNT }, (_, index) => ({
          accountId: account.accountId,
          type: 'ATESTADO_CAPACIDADE' as const,
          description: `Atestado ${index}`,
          fileKey: `documentos/${account.accountId}/${index}.pdf`,
          fileName: 'a.pdf',
          fileType: 'application/pdf',
          fileSize: 10,
        })),
      );

      const error = await rejectedWith(createDocument(deps(tx, storage), actorOf(account), newDocument('CONTRATO_SOCIAL'), PDF));
      assert.equal(error.status, 400);
      assert.match(error.message, /300 documentos/);
      assert.equal(objects.size, 0);
      assert.ok(await createDocument(deps(tx, storage), actorOf(other), newDocument('CONTRATO_SOCIAL'), PDF));
    });
  });

  test('sem R2 configurado: guardar e abrir dão 503 sem gravar nada; a lista e as datas seguem funcionando', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'doc-sem-r2');
      const { storage } = createMemoryStorage();
      const kept = await createDocument(deps(tx, storage), actorOf(account), newDocument('CERTIDAO_FGTS', { validUntil: inDays(40) }), PDF);

      const noStorage = deps(tx, null);
      const store = await rejectedWith(createDocument(noStorage, actorOf(account), newDocument('CONTRATO_SOCIAL'), PDF));
      assert.equal(store.status, 503);
      const open = await rejectedWith(documentLink(noStorage, actorOf(account), kept.id));
      assert.equal(open.status, 503);
      const replace = await rejectedWith(updateDocument(noStorage, actorOf(account), kept.id, {}, PDF));
      assert.equal(replace.status, 503);

      const listed = await listDocuments(noStorage, actorOf(account));
      assert.equal(listed.storageAvailable, false);
      assert.deepEqual(listed.items.map((item) => item.id), [kept.id], 'nada novo foi gravado');
      const edited = await updateDocument(noStorage, actorOf(account), kept.id, { validUntil: inDays(60) }, null);
      assert.equal(edited.validUntil, inDays(60), 'alterar datas não depende do R2');

      const originalError = console.error;
      console.error = () => {};
      try {
        await deleteDocument(noStorage, actorOf(account), kept.id);
      } finally {
        console.error = originalError;
      }
      assert.deepEqual((await listDocuments(noStorage, actorOf(account))).items, [], 'apagar a linha também não depende do R2');
    });
  });

  test('R2 recusa o envio: o erro sobe e nenhuma linha é gravada', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'doc-r2-fora');
      const { storage } = createMemoryStorage(() => true);

      await assert.rejects(createDocument(deps(tx, storage), actorOf(account), newDocument('CONTRATO_SOCIAL'), PDF), /R2 fora do ar/);
      assert.deepEqual((await listDocuments(deps(tx, createMemoryStorage().storage), actorOf(account))).items, []);
    });
  });

  test('a linha falha depois do envio: o objeto novo é desfeito (nada solto no R2)', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'doc-linha-falha');
      const { storage, objects } = createMemoryStorage();
      // Passa por cima da leitura do pedido de propósito: a descrição longa demais só o banco recusa.
      const tooLong = { ...newDocument('ATESTADO_CAPACIDADE'), description: 'x'.repeat(121) };

      const originalError = console.error;
      console.error = () => {};
      try {
        await assert.rejects(createDocument(deps(tx, storage), actorOf(account), tooLong, PDF));
      } finally {
        console.error = originalError;
      }
      assert.equal(objects.size, 0, 'o objeto enviado foi apagado');
    });
  });

  test('alterar: datas e descrição; as regras do tipo valem sobre o que ficaria gravado; campo ausente mantém', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'doc-alterar');
      const { storage } = createMemoryStorage();
      const created = await createDocument(deps(tx, storage), actorOf(account), newDocument('CERTIDAO_FEDERAL', { issuedOn: '2026-10-01', validUntil: '2027-03-30', description: 'Matriz' }), PDF);

      const renewed = await updateDocument(deps(tx, storage), actorOf(account), created.id, { validUntil: '2027-04-30' }, null);
      assert.equal(renewed.validUntil, '2027-04-30');
      assert.equal(renewed.issuedOn, '2026-10-01', 'campo ausente mantém');
      assert.equal(renewed.description, 'Matriz');
      assert.equal(renewed.fileName, 'certidao.pdf', 'sem arquivo novo, o arquivo é o mesmo');

      const cleared = await updateDocument(deps(tx, storage), actorOf(account), created.id, { description: null }, null);
      assert.equal(cleared.description, null);

      assert.equal((await rejectedWith(updateDocument(deps(tx, storage), actorOf(account), created.id, { validUntil: null }, null))).message, 'Informe a validade do documento');
      assert.equal(
        (await rejectedWith(updateDocument(deps(tx, storage), actorOf(account), created.id, { issuedOn: '2027-06-01' }, null))).message,
        'A emissão não pode ser depois da validade',
      );
      const generic = await createDocument(deps(tx, storage), actorOf(account), newDocument('OUTRO_EMPRESA', { description: 'Alvará' }), PDF);
      assert.equal((await rejectedWith(updateDocument(deps(tx, storage), actorOf(account), generic.id, { description: null }, null))).message, 'Descreva o documento');
      const [row] = await tx.select().from(tenderDocuments).where(eq(tenderDocuments.id, created.id));
      assert.equal(row?.validUntil, '2027-04-30', 'as recusas não gravaram nada');
      assert.ok(row && row.updatedAt >= row.createdAt);
    });
  });

  test('trocar o arquivo: o novo é gravado e só então o antigo sai; falha do R2 mantém o antigo', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'doc-trocar');
      let failing = false;
      const { storage, objects } = createMemoryStorage(() => failing);
      const created = await createDocument(deps(tx, storage), actorOf(account), newDocument('CARTAO_CNPJ'), PDF);
      const oldKey = await storedKeyOf(tx, created.id);

      failing = true;
      await assert.rejects(updateDocument(deps(tx, storage), actorOf(account), created.id, {}, PNG), /R2 fora do ar/);
      failing = false;
      assert.equal(await storedKeyOf(tx, created.id), oldKey, 'a linha continua no arquivo antigo');
      assert.deepEqual([...objects.keys()], [oldKey]);

      const replaced = await updateDocument(deps(tx, storage), actorOf(account), created.id, {}, PNG);
      const newKey = await storedKeyOf(tx, created.id);
      assert.notEqual(newKey, oldKey);
      assert.match(newKey, /\.png$/);
      assert.deepEqual([...objects.keys()], [newKey], 'o antigo saiu depois de a linha apontar para o novo');
      assert.deepEqual({ name: replaced.fileName, type: replaced.fileType, size: replaced.fileSize }, { name: 'foto da certidão.png', type: 'image/png', size: PNG.bytes.byteLength });
    });
  });

  test('a linha falha na troca do arquivo: o objeto novo é desfeito e o antigo fica', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'doc-trocar-falha');
      const { storage, objects } = createMemoryStorage();
      const created = await createDocument(deps(tx, storage), actorOf(account), newDocument('ATESTADO_CAPACIDADE', { description: 'A' }), PDF);
      const oldKey = await storedKeyOf(tx, created.id);

      const originalError = console.error;
      console.error = () => {};
      try {
        await assert.rejects(updateDocument(deps(tx, storage), actorOf(account), created.id, { description: 'x'.repeat(121) }, PNG));
      } finally {
        console.error = originalError;
      }
      assert.deepEqual([...objects.keys()], [oldKey], 'só o antigo sobrou');
    });
  });

  test('apagar: a linha, os avisos e o arquivo saem; o documento de outra conta fica', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'doc-apagar');
      const stranger = await createTestAccount(tx, 'doc-apagar-estranha');
      const { storage, objects } = createMemoryStorage();
      const mine = await createDocument(deps(tx, storage), actorOf(account), newDocument('CERTIDAO_FGTS', { validUntil: inDays(5) }), PDF);
      const theirs = await createDocument(deps(tx, storage), actorOf(stranger), newDocument('CERTIDAO_FGTS', { validUntil: inDays(5) }), PDF);
      await tx.insert(tenderNotifications).values({
        accountId: account.accountId,
        userId: account.ownerId,
        type: 'DOCUMENTO_VENCE_7D',
        title: 'vence',
        link: '/documentacao',
        documentId: mine.id,
        reference: inDays(5),
      });

      const invader = await rejectedWith(deleteDocument(deps(tx, storage), actorOf(stranger), mine.id));
      assert.equal(invader.status, 404);
      assert.equal(objects.size, 2, 'a tentativa da outra conta não apagou nada');

      await deleteDocument(deps(tx, storage), actorOf(account), mine.id);
      assert.deepEqual((await listDocuments(deps(tx, storage), actorOf(account))).items, []);
      assert.equal(objects.size, 1, 'o arquivo saiu do R2');
      const notices = await tx.select({ id: tenderNotifications.id }).from(tenderNotifications).where(and(eq(tenderNotifications.accountId, account.accountId), eq(tenderNotifications.documentId, mine.id)));
      assert.deepEqual(notices, [], 'o aviso do documento saiu junto');
      assert.deepEqual((await listDocuments(deps(tx, storage), actorOf(stranger))).items.map((item) => item.id), [theirs.id]);
      assert.equal((await rejectedWith(deleteDocument(deps(tx, storage), actorOf(account), mine.id))).status, 404, 'apagar de novo: não encontrado');
    });
  });

  test('link de abertura: assinado, de vida curta, com o nome do arquivo; outra conta não abre', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'doc-link');
      const stranger = await createTestAccount(tx, 'doc-link-estranha');
      const { storage } = createMemoryStorage();
      const created = await createDocument(deps(tx, storage), actorOf(account), newDocument('CERTIDAO_TRABALHISTA', { validUntil: inDays(90) }), PDF);
      const key = await storedKeyOf(tx, created.id);

      const link = await documentLink(deps(tx, storage), actorOf(account), created.id);
      assert.deepEqual(link, { url: `memory://${key}?expires=${DOCUMENT_LINK_TTL_SECONDS}`, expiresInSeconds: DOCUMENT_LINK_TTL_SECONDS, fileName: 'certidao.pdf' });
      assert.equal((await rejectedWith(documentLink(deps(tx, storage), actorOf(stranger), created.id))).status, 404);
      assert.equal((await rejectedWith(documentLink(deps(tx, storage), actorOf(account), 999_999_999))).status, 404);
    });
  });

  test('isolamento: outra conta não vê nem altera os documentos da primeira', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'doc-iso-a');
      const stranger = await createTestAccount(tx, 'doc-iso-b');
      const { storage } = createMemoryStorage();
      const created = await createDocument(deps(tx, storage), actorOf(account), newDocument('CONTRATO_SOCIAL'), PDF);

      assert.deepEqual((await listDocuments(deps(tx, storage), actorOf(stranger))).items, []);
      assert.equal((await rejectedWith(updateDocument(deps(tx, storage), actorOf(stranger), created.id, { description: 'invasão' }, null))).status, 404);
      const [row] = await tx.select().from(tenderDocuments).where(eq(tenderDocuments.id, created.id));
      assert.equal(row?.description, null);
    });
  });
});
