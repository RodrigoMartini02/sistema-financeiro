import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, mock, test } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import {
  accounts, attachments, catalogoProdutos, categories, expenses, incomeClassifications, incomes, users,
} from '../db/schema';
import { createMemoryStorage, type MemoryStorage } from '../modules/tenders/objectStorageTestSupport';
import { RequestInputError } from '../utils/requestInput';
import type { AttachmentOwner } from './attachmentModel';
import { MAX_PENDING_ATTACHMENTS_PER_USER } from './attachmentRules';
import { removeStoredObjects } from './attachmentStorage';
import { assertLocalDatabase, databaseTestsSkipReason } from './financeDbTestSupport';

async function loadServices() {
  const [client, service, access, orphans] = await Promise.all([
    import('../db/client.js'), import('./attachmentService.js'), import('./attachmentAccess.js'), import('./attachmentOrphans.js'),
  ]);
  return { client, service, access, orphans };
}
let services: Awaited<ReturnType<typeof loadServices>>;

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
const HOUR_MS = 60 * 60 * 1000;

interface Person {
  userId: number;
  accountId: number;
  categoryId: number;
  classificationId: number;
}

interface Scenario {
  owner: Person;
  stranger: Person;
  expenseId: number;
  otherExpenseId: number;
  incomeId: number;
  productId: string;
  memory: MemoryStorage;
}

/** Duas pessoas sem relação, com lançamentos e um produto da primeira; apaga tudo o que criou no fim. */
async function withScenario(work: (scenario: Scenario) => Promise<void>): Promise<void> {
  const { db } = services.client;
  const userIds: number[] = [];
  async function createPerson(accountType: 'pessoal' | 'empresa'): Promise<Person> {
    const [user] = await db
      .insert(users)
      .values({ name: 'Teste anexos', email: `attachments-${randomUUID()}@example.test`, password: 'teste' })
      .returning({ id: users.id });
    const userId = user!.id;
    userIds.push(userId);
    const [account] = await db.insert(accounts).values({ userId, name: 'Conta', type: accountType, isDefault: true }).returning();
    const [category] = await db.insert(categories).values({ userId, name: 'Moradia', type: 'pessoal' }).returning();
    const [classification] = await db.insert(incomeClassifications).values({ userId, name: 'Salário', type: 'pessoal' }).returning();
    return { userId, accountId: account!.id, categoryId: category!.id, classificationId: classification!.id };
  }
  // SQL direto, só com as colunas que despesas e receitas sempre tiveram: o teste não depende de quais
  // migrations de despesas fixas o banco local já recebeu.
  async function createExpense(person: Person): Promise<number> {
    const { rows } = await services.client.pool.query<{ id: number }>(
      `INSERT INTO despesas (usuario_id, conta_id, categoria_id, descricao, data_vencimento, mes, ano)
       VALUES ($1, $2, $3, 'Aluguel', '2026-11-10', 10, 2026) RETURNING id`,
      [person.userId, person.accountId, person.categoryId],
    );
    return rows[0]!.id;
  }
  async function createIncome(person: Person): Promise<number> {
    const { rows } = await services.client.pool.query<{ id: number }>(
      `INSERT INTO receitas (usuario_id, conta_id, classificacao_id, descricao, valor_liquido, valor_bruto, data_recebimento, mes, ano)
       VALUES ($1, $2, $3, 'Venda', 100, 100, '2026-11-05', 10, 2026) RETURNING id`,
      [person.userId, person.accountId, person.classificationId],
    );
    return rows[0]!.id;
  }
  try {
    const owner = await createPerson('empresa');
    const stranger = await createPerson('pessoal');
    const [product] = await db
      .insert(catalogoProdutos)
      .values({ usuarioId: owner.userId, contaId: owner.accountId, nome: 'Camiseta', valor: '50.00' })
      .returning({ id: catalogoProdutos.id });
    await work({
      owner, stranger, expenseId: await createExpense(owner), otherExpenseId: await createExpense(owner), incomeId: await createIncome(owner),
      productId: product!.id, memory: createMemoryStorage(),
    });
  } finally {
    if (userIds.length) {
      await db.delete(attachments).where(inArray(attachments.uploadedBy, userIds));
      await db.delete(catalogoProdutos).where(inArray(catalogoProdutos.usuarioId, userIds));
      await db.delete(expenses).where(inArray(expenses.userId, userIds));
      await db.delete(incomes).where(inArray(incomes.userId, userIds));
      await db.delete(categories).where(inArray(categories.userId, userIds));
      await db.delete(incomeClassifications).where(inArray(incomeClassifications.userId, userIds));
      await db.delete(accounts).where(inArray(accounts.userId, userIds));
      await db.delete(users).where(inArray(users.id, userIds));
    }
  }
}

function uploadPdf(name = 'nota.pdf') {
  return { originalName: name, content: PDF };
}

function expenseOwner(id: number): AttachmentOwner {
  return { type: 'expense', id };
}

/** Reivindica os envios pendentes numa transação própria, como o salvar do lançamento fará. */
function link(requesterId: number, owner: AttachmentOwner, attachmentIds: string[]): Promise<void> {
  return services.client.db.transaction((transaction) =>
    services.service.linkPendingAttachments(transaction, { requesterId, owner, attachmentIds }));
}

function replace(requesterId: number, owner: AttachmentOwner, attachmentIds: string[]): Promise<string[]> {
  return services.client.db.transaction((transaction) =>
    services.service.replaceOwnerAttachments(transaction, { requesterId, owner, attachmentIds }));
}

function sendPdf(memory: MemoryStorage, uploadedBy: number, ownerType: 'expense' | 'income', name?: string) {
  return services.service.saveAttachment(memory.storage, { uploadedBy, ownerType, file: uploadPdf(name) });
}

async function rowOf(attachmentId: string) {
  const [row] = await services.client.db.select().from(attachments).where(eq(attachments.id, attachmentId));
  return row;
}

async function refusalMessage(promise: Promise<unknown>, status: number): Promise<string> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof RequestInputError, 'a recusa é um erro do pedido');
    assert.equal(error.status, status);
    return error.message;
  }
  throw new assert.AssertionError({ message: 'devia ter sido recusado' });
}

describe('anexos no banco local e no R2 simulado', { skip: databaseTestsSkipReason }, () => {
  before(async () => {
    assertLocalDatabase();
    services = await loadServices();
  });
  after(async () => {
    await services.client.pool.end();
  });

  test('a tabela não aceita dois donos, dono de outro tipo, tipo de dono desconhecido, arquivo vazio nem chave repetida', async () => {
    await withScenario(async ({ owner, expenseId, incomeId }) => {
      const { pool } = services.client;
      async function insertRaw(ownerType: string, expense: number | null, income: number | null, size: number, key: string) {
        await pool.query(
          `INSERT INTO anexos (usuario_id, tipo_dono, despesa_id, receita_id, nome_original, tipo_conteudo, tamanho, chave)
           VALUES ($1, $2, $3, $4, 'a.pdf', 'application/pdf', $5, $6)`,
          [owner.userId, ownerType, expense, income, size, key],
        );
      }
      const key = `anexos/${randomUUID()}`;
      await insertRaw('expense', expenseId, null, 10, key);
      await assert.rejects(insertRaw('expense', expenseId, null, 10, key), /anexos_chave_key/, 'a chave do R2 é única');
      await assert.rejects(insertRaw('expense', expenseId, incomeId, 10, `anexos/${randomUUID()}`), /anexos_um_dono_check/);
      await assert.rejects(insertRaw('income', expenseId, null, 10, `anexos/${randomUUID()}`), /anexos_um_dono_check/);
      await assert.rejects(insertRaw('whatever', null, null, 10, `anexos/${randomUUID()}`), /anexos_tipo_dono_check/);
      await assert.rejects(insertRaw('expense', null, null, 0, `anexos/${randomUUID()}`), /anexos_tamanho_check/);
      await insertRaw('income', null, null, 10, `anexos/${randomUUID()}`);
    });
  });

  test('o arquivo vai para o R2 antes da linha e fica pendente até o lançamento reivindicá-lo', async () => {
    await withScenario(async ({ owner, stranger, expenseId, incomeId, memory }) => {
      const view = await sendPdf(memory, owner.userId, 'expense');
      assert.equal(view.name, 'nota.pdf');
      assert.equal(view.contentType, 'application/pdf');
      assert.equal(view.size, PDF.length);

      const pending = await rowOf(view.id);
      assert.equal(pending?.expenseId, null);
      assert.equal(pending?.ownerType, 'expense');
      assert.equal(pending?.uploadedBy, owner.userId);
      assert.equal(pending?.storageKey, `anexos/${view.id}`);
      assert.deepEqual([...memory.objects.keys()], [`anexos/${view.id}`]);
      assert.equal(Buffer.from(memory.objects.get(`anexos/${view.id}`) ?? []).toString(), PDF.toString());

      // Outra pessoa não reivindica o envio de quem enviou.
      assert.equal(
        await refusalMessage(link(stranger.userId, expenseOwner(expenseId), [view.id]), 400),
        services.service.ATTACHMENT_NOT_AVAILABLE_MESSAGE,
      );
      // O tipo de lançamento do envio tem que ser o do dono: anexo de despesa não vira anexo de receita.
      await refusalMessage(link(owner.userId, { type: 'income', id: incomeId }, [view.id]), 400);
      await refusalMessage(link(owner.userId, expenseOwner(expenseId), [randomUUID()]), 400);
      assert.equal((await rowOf(view.id))?.expenseId, null, 'nenhuma tentativa recusada mudou o anexo');

      await link(owner.userId, expenseOwner(expenseId), [view.id]);
      assert.equal((await rowOf(view.id))?.expenseId, expenseId);
      await refusalMessage(link(owner.userId, expenseOwner(expenseId), [view.id]), 400);
    });
  });

  test('a lista final do lançamento vale: sai quem não está nela, entra o pendente, e a chave dos apagados volta', async () => {
    await withScenario(async ({ owner, expenseId, otherExpenseId, memory }) => {
      const first = await sendPdf(memory, owner.userId, 'expense', 'a.pdf');
      const second = await sendPdf(memory, owner.userId, 'expense', 'b.pdf');
      const third = await sendPdf(memory, owner.userId, 'expense', 'c.pdf');
      await link(owner.userId, expenseOwner(expenseId), [first.id, second.id]);

      const removedKeys = await replace(owner.userId, expenseOwner(expenseId), [second.id, third.id]);
      assert.deepEqual(removedKeys, [`anexos/${first.id}`]);
      assert.equal(await rowOf(first.id), undefined, 'a linha do anexo removido saiu');
      assert.equal((await rowOf(third.id))?.expenseId, expenseId);
      assert.ok(memory.objects.has(`anexos/${first.id}`), 'o arquivo só sai do R2 quando o chamador remove, depois do commit');

      const listed = await services.service.listAttachmentsByOwners({ type: 'expense', ids: [expenseId, otherExpenseId] });
      assert.deepEqual(listed.get(expenseId)?.map((item) => item.name), ['b.pdf', 'c.pdf']);
      assert.equal(listed.has(otherExpenseId), false, 'lançamento sem anexo não aparece no mapa');
      assert.equal((await services.service.listAttachmentsByOwners({ type: 'expense', ids: [] })).size, 0);

      // Reivindicar o anexo de outro lançamento desfaz a transação inteira, inclusive a saída do anexo b.
      const taken = await sendPdf(memory, owner.userId, 'expense', 'd.pdf');
      await link(owner.userId, expenseOwner(otherExpenseId), [taken.id]);
      await refusalMessage(replace(owner.userId, expenseOwner(expenseId), [third.id, taken.id]), 400);
      const afterFailure = await services.service.listAttachmentsByOwners({ type: 'expense', ids: [expenseId] });
      assert.deepEqual(afterFailure.get(expenseId)?.map((item) => item.name), ['b.pdf', 'c.pdf']);

      assert.equal((await replace(owner.userId, expenseOwner(expenseId), [])).length, 2);
    });
  });

  test('excluir o lançamento leva as linhas na cascata e as chaves coletadas antes apagam os arquivos do R2', async () => {
    await withScenario(async ({ owner, expenseId, incomeId, memory }) => {
      const { db } = services.client;
      const onExpense = await sendPdf(memory, owner.userId, 'expense');
      const onIncome = await sendPdf(memory, owner.userId, 'income');
      await link(owner.userId, expenseOwner(expenseId), [onExpense.id]);
      await link(owner.userId, { type: 'income', id: incomeId }, [onIncome.id]);

      const keys = await services.service.collectAttachmentKeys({ type: 'expense', ids: [expenseId] });
      assert.deepEqual(keys, [`anexos/${onExpense.id}`], 'só as chaves dos lançamentos que vão ser excluídos');
      assert.deepEqual(await services.service.collectAttachmentKeys({ type: 'expense', ids: [] }), []);

      await db.delete(expenses).where(eq(expenses.id, expenseId));
      assert.equal(await rowOf(onExpense.id), undefined, 'a linha saiu junto com o lançamento');
      assert.ok(await rowOf(onIncome.id), 'o anexo da receita continua');
      assert.equal(await removeStoredObjects(memory.storage, keys), 0);
      assert.deepEqual([...memory.objects.keys()], [`anexos/${onIncome.id}`]);
    });
  });

  test('a varredura apaga só o envio pendente com mais de 24 horas, linha e arquivo', async () => {
    await withScenario(async ({ owner, expenseId, memory }) => {
      const { db } = services.client;
      const fresh = await sendPdf(memory, owner.userId, 'expense');
      const abandoned = await sendPdf(memory, owner.userId, 'expense');
      const linked = await sendPdf(memory, owner.userId, 'expense');
      await link(owner.userId, expenseOwner(expenseId), [linked.id]);
      const longAgo = new Date(Date.now() - 25 * HOUR_MS);
      await db.update(attachments).set({ createdAt: longAgo }).where(inArray(attachments.id, [abandoned.id, linked.id]));

      assert.deepEqual(await services.service.sweepPendingAttachments(memory.storage), { removed: 1, failedObjects: 0 });
      assert.equal(await rowOf(abandoned.id), undefined);
      assert.ok(await rowOf(fresh.id), 'o envio recente espera o lançamento ser salvo');
      assert.ok(await rowOf(linked.id), 'o anexo vinculado nunca é varrido, por mais antigo que seja');
      assert.deepEqual([...memory.objects.keys()].sort(), [`anexos/${fresh.id}`, `anexos/${linked.id}`].sort());
      assert.deepEqual(await services.service.sweepPendingAttachments(memory.storage), { removed: 0, failedObjects: 0 });

      const stuck = await sendPdf(memory, owner.userId, 'expense');
      await db.update(attachments).set({ createdAt: longAgo }).where(eq(attachments.id, stuck.id));
      const failing = {
        ...memory.storage,
        deleteObject: async () => {
          throw new Error('R2 fora do ar');
        },
      };
      const logged = mock.method(console, 'error', () => {});
      try {
        assert.deepEqual(await services.service.sweepPendingAttachments(failing), { removed: 1, failedObjects: 1 });
      } finally {
        logged.mock.restore();
      }
      assert.equal(await rowOf(stuck.id), undefined, 'a linha sai mesmo se o R2 falhar: nunca sobra linha sem arquivo');
    });
  });

  test('a conferência de órfãos acha o arquivo sem linha e a linha sem arquivo, e deixa em paz o que está em ordem', async () => {
    await withScenario(async ({ owner, expenseId, memory }) => {
      const kept = await sendPdf(memory, owner.userId, 'expense', 'em-ordem.pdf');
      await link(owner.userId, expenseOwner(expenseId), [kept.id]);
      const lost = await sendPdf(memory, owner.userId, 'expense', 'perdido.pdf');
      memory.objects.delete(`anexos/${lost.id}`);
      const stray = `anexos/${randomUUID()}`;
      memory.objects.set(stray, PDF);

      // O banco de teste é compartilhado com outras suítes: só se confere o que esta criou.
      const report = await services.orphans.findAttachmentOrphans(memory.storage);
      assert.ok(report.objectsWithoutRow.includes(stray), 'o arquivo sem linha aparece');
      assert.ok(report.rowsWithoutObject.some((row) => row.id === lost.id && row.key === `anexos/${lost.id}`), 'a linha sem arquivo aparece');
      assert.ok(!report.objectsWithoutRow.includes(`anexos/${kept.id}`), 'o arquivo que tem linha não é órfão');
      assert.ok(!report.rowsWithoutObject.some((row) => row.id === kept.id), 'a linha que tem arquivo não é órfã');
    });
  });

  test('cada pessoa tem um teto de envios pendentes, e os de outra pessoa não contam', async () => {
    await withScenario(async ({ owner, stranger, memory }) => {
      await services.client.pool.query(
        `INSERT INTO anexos (usuario_id, tipo_dono, nome_original, tipo_conteudo, tamanho, chave)
         SELECT $1, 'expense', 'a.pdf', 'application/pdf', 10, 'anexos/' || gen_random_uuid()::text
           FROM generate_series(1, $2::int)`,
        [owner.userId, MAX_PENDING_ATTACHMENTS_PER_USER],
      );
      assert.equal(
        await refusalMessage(sendPdf(memory, owner.userId, 'expense'), 429),
        services.service.TOO_MANY_PENDING_ATTACHMENTS_MESSAGE,
      );
      assert.equal(memory.objects.size, 0, 'recusado antes de enviar ao R2');
      await sendPdf(memory, stranger.userId, 'expense');
      assert.equal(memory.objects.size, 1);
    });
  });

  test('se o banco recusar a linha depois do envio ao R2, o arquivo é apagado', async () => {
    await withScenario(async ({ memory }) => {
      // Quem enviou não existe: a chave estrangeira da linha recusa a gravação.
      await assert.rejects(
        services.service.saveAttachment(memory.storage, { uploadedBy: 2_000_000_000, ownerType: 'expense', file: uploadPdf() }),
      );
      assert.equal(memory.objects.size, 0);
    });
  });

  test('foto do produto nasce vinculada ao produto, convertida para WebP e na ordem de envio', async () => {
    await withScenario(async ({ owner, productId, memory }) => {
      const png = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: '#112233' } }).png().toBuffer();
      const send = (name: string) =>
        services.service.saveAttachment(memory.storage, {
          uploadedBy: owner.userId, ownerType: 'product', owner: { type: 'product', id: productId }, file: { originalName: name, content: png },
        });
      const first = await send('frente.png');
      const second = await send('costas.png');
      assert.equal(first.contentType, 'image/webp');
      assert.equal(first.name, 'frente.webp');
      assert.equal((await sharp(memory.objects.get(`anexos/${first.id}`)).metadata()).width, 1600);
      assert.equal(memory.metadata.get(`anexos/${first.id}`)?.contentType, 'image/webp');
      assert.equal((await rowOf(first.id))?.productId, productId);
      assert.deepEqual([(await rowOf(first.id))?.position, (await rowOf(second.id))?.position], [0, 1]);

      const listed = await services.service.listAttachmentsByOwners({ type: 'product', ids: [productId] });
      assert.deepEqual(listed.get(productId)?.map((item) => item.name), ['frente.webp', 'costas.webp']);

      await assert.rejects(
        services.service.saveAttachment(memory.storage, {
          uploadedBy: owner.userId, ownerType: 'expense', owner: { type: 'product', id: productId }, file: uploadPdf(),
        }),
        /does not match/,
        'o tipo de dono declarado tem que ser o do dono informado',
      );
    });
  });

  test('quem pode abrir: o lançamento é de quem o vê; o envio pendente é só de quem enviou', async () => {
    await withScenario(async ({ owner, stranger, expenseId, productId, memory }) => {
      const { access } = services;
      const pendingView = await sendPdf(memory, owner.userId, 'expense');
      const pendingRow = (await rowOf(pendingView.id))!;
      await access.assertCanViewAttachment(pendingRow, owner.userId);
      assert.equal(await refusalMessage(access.assertCanViewAttachment(pendingRow, stranger.userId), 404), access.ATTACHMENT_NOT_FOUND_MESSAGE);

      await link(owner.userId, expenseOwner(expenseId), [pendingView.id]);
      const linkedRow = (await rowOf(pendingView.id))!;
      await access.assertCanViewAttachment(linkedRow, owner.userId);
      assert.equal(await refusalMessage(access.assertCanViewAttachment(linkedRow, stranger.userId), 404), access.ATTACHMENT_NOT_FOUND_MESSAGE);

      const photo = await services.service.saveAttachment(memory.storage, {
        uploadedBy: owner.userId, ownerType: 'product', owner: { type: 'product', id: productId },
        file: { originalName: 'foto.png', content: await sharp({ create: { width: 20, height: 20, channels: 3, background: '#ffffff' } }).png().toBuffer() },
      });
      const photoRow = (await rowOf(photo.id))!;
      await access.assertCanViewAttachment(photoRow, owner.userId);
      assert.equal(await refusalMessage(access.assertCanViewAttachment(photoRow, stranger.userId), 404), access.ATTACHMENT_NOT_FOUND_MESSAGE);
    });
  });

  test('quem pode enviar e apagar: produto só de quem mexe nele; lançamento só sai ao salvar a edição', async () => {
    await withScenario(async ({ owner, stranger, expenseId, productId, memory }) => {
      const { db } = services.client;
      const { access, service } = services;
      await access.assertCanAttachTo({ type: 'product', id: productId }, owner.userId);
      assert.equal(await refusalMessage(access.assertCanAttachTo({ type: 'product', id: productId }, stranger.userId), 404), 'Produto não encontrado');
      await refusalMessage(access.assertCanAttachTo({ type: 'expense', id: expenseId }, owner.userId), 400);
      await refusalMessage(access.assertCanAttachTo({ type: 'product', id: 'não é uuid' }, owner.userId), 404);

      const pending = await sendPdf(memory, owner.userId, 'expense');
      const pendingRow = (await rowOf(pending.id))!;
      await access.assertCanRemoveAttachment(pendingRow, owner.userId);
      assert.equal(await refusalMessage(access.assertCanRemoveAttachment(pendingRow, stranger.userId), 404), access.ATTACHMENT_NOT_FOUND_MESSAGE);

      await link(owner.userId, expenseOwner(expenseId), [pending.id]);
      const linkedRow = (await rowOf(pending.id))!;
      assert.match(await refusalMessage(access.assertCanRemoveAttachment(linkedRow, owner.userId), 400), /edite o lançamento/);

      assert.equal(await service.deleteAttachmentRow(db, pending.id), `anexos/${pending.id}`);
      assert.equal(await service.deleteAttachmentRow(db, pending.id), null, 'apagar de novo não encontra a linha');
      assert.equal(await service.findAttachment('não é uuid'), null);
      assert.equal(await service.findAttachment(randomUUID()), null);
    });
  });
});
