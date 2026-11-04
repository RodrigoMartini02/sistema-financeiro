import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { gunzipSync } from 'node:zlib';
import { inArray } from 'drizzle-orm';
import { accounts, categories, expenses, incomeClassifications, incomes, users } from '../db/schema';
import { createMemoryStorage, type MemoryStorage } from '../modules/tenders/objectStorageTestSupport';
import { legacyAttachmentId } from './attachmentLegacy';
import { LEGACY_BACKUP_PREFIX } from './attachmentLegacyMigration';
import { assertLocalDatabase, databaseTestsSkipReason } from './financeDbTestSupport';

async function loadServices() {
  const [client, migration, service] = await Promise.all([
    import('../db/client.js'), import('./attachmentLegacyMigration.js'), import('./attachmentService.js'),
  ]);
  return { client, migration, service };
}
let services: Awaited<ReturnType<typeof loadServices>>;

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('dados da imagem')]);
const HTML_NAMED_PDF = Buffer.from('<html>isto não é um PDF</html>');
const UPLOADED_AT = '2026-03-10T10:00:00.000Z';

// A trava da migration 0095, tal como está no arquivo: o teste prova que ela enxerga os mesmos ids que a cópia grava.
const GUARD = readFileSync(path.join(__dirname, '../../drizzle/0095_drop_entry_attachments_json.sql'), 'utf8').match(/DO \$\$[\s\S]*?\n\$\$;/)?.[0];

/** Como o sistema antigo gravava um anexo dentro da despesa ou da receita. */
function legacyItem(name: string, content: Buffer, withUploadDate = true) {
  return {
    id: `anexo_${randomUUID()}`, nome: name, tipo: 'application/pdf', tamanho: content.length, dados: content.toString('base64'),
    ...(withUploadDate ? { dataUpload: UPLOADED_AT } : {}),
  };
}

interface Scenario {
  userId: number;
  strangerExpenseId: number;
  /** PDF e PNG, na ordem. */
  twoItemsExpenseId: number;
  twoItems: unknown[];
  /** Um item sem conteúdo (não dá para copiar) e um PDF bom. */
  brokenExpenseId: number;
  brokenItems: unknown[];
  emptyExpenseId: number;
  incomeId: number;
  /** HTML com nome de PDF: não passa na conferência de hoje, mas é copiado para baixar. */
  disguisedIncomeId: number;
}

/** Uma pessoa com lançamentos de lista antiga em vários formatos, mais um lançamento de outra pessoa; apaga tudo no fim. */
async function withScenario(work: (scenario: Scenario) => Promise<void>): Promise<void> {
  const { db, pool } = services.client;
  const userIds: number[] = [];
  async function createPerson() {
    const [user] = await db
      .insert(users)
      .values({ name: 'Teste cópia de anexos', email: `legacy-attachments-${randomUUID()}@example.test`, password: 'teste' })
      .returning({ id: users.id });
    const userId = user!.id;
    userIds.push(userId);
    const [account] = await db.insert(accounts).values({ userId, name: 'Conta', type: 'pessoal', isDefault: true }).returning();
    const [category] = await db.insert(categories).values({ userId, name: 'Moradia', type: 'pessoal' }).returning();
    const [classification] = await db.insert(incomeClassifications).values({ userId, name: 'Salário', type: 'pessoal' }).returning();
    return { userId, accountId: account!.id, categoryId: category!.id, classificationId: classification!.id };
  }
  // SQL direto, só com as colunas que despesas e receitas sempre tiveram (e a lista antiga): o teste não depende de
  // quais migrations o banco local já recebeu.
  async function insertExpense(person: Awaited<ReturnType<typeof createPerson>>, items: unknown): Promise<number> {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO despesas (usuario_id, conta_id, categoria_id, descricao, data_vencimento, mes, ano, anexos)
       VALUES ($1, $2, $3, 'Aluguel', '2026-11-10', 10, 2026, $4::jsonb) RETURNING id`,
      [person.userId, person.accountId, person.categoryId, JSON.stringify(items)],
    );
    return rows[0]!.id;
  }
  async function insertIncome(person: Awaited<ReturnType<typeof createPerson>>, items: unknown): Promise<number> {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO receitas (usuario_id, conta_id, classificacao_id, descricao, valor_liquido, valor_bruto, data_recebimento, mes, ano, anexos)
       VALUES ($1, $2, $3, 'Venda', 100, 100, '2026-11-05', 10, 2026, $4::jsonb) RETURNING id`,
      [person.userId, person.accountId, person.classificationId, JSON.stringify(items)],
    );
    return rows[0]!.id;
  }
  try {
    const person = await createPerson();
    const stranger = await createPerson();
    const twoItems = [legacyItem('nota.pdf', PDF), legacyItem('foto.png', PNG)];
    const brokenItems = [{ id: 'anexo_sem_conteudo', nome: 'vazio.pdf', tipo: 'application/pdf' }, legacyItem('boleto.pdf', PDF)];
    await work({
      userId: person.userId,
      strangerExpenseId: await insertExpense(stranger, [legacyItem('dele.pdf', PDF)]),
      twoItemsExpenseId: await insertExpense(person, twoItems),
      twoItems,
      brokenExpenseId: await insertExpense(person, brokenItems),
      brokenItems,
      emptyExpenseId: await insertExpense(person, []),
      incomeId: await insertIncome(person, [legacyItem('recibo.pdf', PDF)]),
      disguisedIncomeId: await insertIncome(person, [legacyItem('contrato.pdf', HTML_NAMED_PDF)]),
    });
  } finally {
    if (userIds.length) {
      // As linhas copiadas para `anexos` saem junto, pela cascata.
      await db.delete(expenses).where(inArray(expenses.userId, userIds));
      await db.delete(incomes).where(inArray(incomes.userId, userIds));
      await db.delete(categories).where(inArray(categories.userId, userIds));
      await db.delete(incomeClassifications).where(inArray(incomeClassifications.userId, userIds));
      await db.delete(accounts).where(inArray(accounts.userId, userIds));
      await db.delete(users).where(inArray(users.id, userIds));
    }
  }
}

function migrate(scenario: Scenario, memory: MemoryStorage, apply: boolean, runStamp = 'teste') {
  return services.migration.migrateLegacyEntries({
    db: services.client.pool, storage: memory.storage, apply, userIds: [scenario.userId], runStamp,
  });
}

function verify(scenario: Scenario, memory: MemoryStorage) {
  return services.migration.verifyLegacyEntries({ db: services.client.pool, storage: memory.storage, userIds: [scenario.userId] });
}

interface CopiedRow {
  usuario_id: number | null;
  tipo_dono: string;
  despesa_id: number | null;
  receita_id: number | null;
  nome_original: string;
  tipo_conteudo: string;
  tamanho: number;
  chave: string;
  created_at: string;
}

async function copiedRow(id: string): Promise<CopiedRow | undefined> {
  const { rows } = await services.client.pool.query<CopiedRow>(
    'SELECT usuario_id, tipo_dono, despesa_id, receita_id, nome_original, tipo_conteudo, tamanho, chave, created_at FROM anexos WHERE id = $1',
    [id],
  );
  return rows[0];
}

async function countRowsOf(table: 'despesa_id' | 'receita_id', ownerId: number): Promise<number> {
  const { rows } = await services.client.pool.query<{ total: string }>(`SELECT count(*) AS total FROM anexos WHERE ${table} = $1`, [ownerId]);
  return Number(rows[0]?.total);
}

/** Quantos itens a trava da 0095 diz que faltam copiar (0 quando ela passa); sempre desfaz a transação. */
async function guardMissing(): Promise<number> {
  assert.ok(GUARD, 'a trava precisa existir na migration 0095');
  const client = await services.client.pool.connect();
  try {
    await client.query('BEGIN');
    try {
      await client.query(GUARD);
      return 0;
    } catch (error) {
      const match = /0095: (\d+) anexo/.exec(error instanceof Error ? error.message : '');
      if (!match) throw error;
      return Number(match[1]);
    } finally {
      await client.query('ROLLBACK');
    }
  } finally {
    client.release();
  }
}

function backupLines(memory: MemoryStorage): Array<{ tipo: string; id: number; usuarioId: number; anexos: unknown[] }> {
  return [...memory.objects.entries()]
    .filter(([key]) => key.startsWith(LEGACY_BACKUP_PREFIX))
    .flatMap(([, body]) => gunzipSync(Buffer.from(body)).toString('utf8').split('\n').filter(Boolean))
    .map((line) => JSON.parse(line) as { tipo: string; id: number; usuarioId: number; anexos: unknown[] });
}

describe('cópia dos anexos antigos de despesas e receitas para a tabela anexos e o R2 simulado', { skip: databaseTestsSkipReason }, () => {
  before(async () => {
    assertLocalDatabase();
    services = await loadServices();
  });
  after(async () => {
    await services.client.pool.end();
  });

  test('a simulação mede e lista o que não dá para copiar, sem gravar nada, e só olha as pessoas pedidas', async () => {
    await withScenario(async (scenario) => {
      const memory = createMemoryStorage();
      const report = await migrate(scenario, memory, false);
      assert.equal(report.entries, 4, 'a lista vazia e o lançamento da outra pessoa ficam de fora');
      assert.equal(report.items, 6);
      assert.equal(report.copied, 5, 'o que seria copiado');
      assert.equal(report.alreadyCopied, 0);
      assert.deepEqual(report.invalid.map((issue) => [issue.type, issue.entryId, issue.position, issue.reason]), [
        ['expense', scenario.brokenExpenseId, 1, 'item sem conteúdo'],
      ]);
      assert.deepEqual(report.unchecked.map((issue) => [issue.type, issue.entryId, issue.position]), [['income', scenario.disguisedIncomeId, 1]]);
      assert.equal(report.contentTypes['application/pdf'], 3);
      assert.equal(report.contentTypes['image/png'], 1);
      assert.equal(report.contentTypes['application/octet-stream'], 1);
      assert.equal(report.bytes, PDF.length * 3 + PNG.length + HTML_NAMED_PDF.length);
      assert.equal(report.notAList, 0);
      assert.deepEqual(report.backupParts, []);
      assert.equal(memory.objects.size, 0, 'nada vai para o R2');
      assert.equal(await countRowsOf('despesa_id', scenario.twoItemsExpenseId), 0, 'nada vai para o banco');
    });
  });

  test('a cópia grava o arquivo no R2, a linha em anexos e o backup do JSON original; a conferência bate', async () => {
    await withScenario(async (scenario) => {
      const memory = createMemoryStorage();
      const report = await migrate(scenario, memory, true);
      assert.equal(report.copied, 5);
      assert.equal(report.entriesGone, 0);
      assert.deepEqual(report.backupParts.sort(), [
        `${LEGACY_BACKUP_PREFIX}teste/expense-${scenario.twoItemsExpenseId}.jsonl.gz`,
        `${LEGACY_BACKUP_PREFIX}teste/income-${scenario.incomeId}.jsonl.gz`,
      ].sort());

      const pdfId = legacyAttachmentId('expense', scenario.twoItemsExpenseId, 1);
      const pdf = await copiedRow(pdfId);
      assert.ok(pdf);
      assert.equal(pdf.usuario_id, scenario.userId, 'quem enviou é o dono do lançamento');
      assert.equal(pdf.tipo_dono, 'expense');
      assert.equal(pdf.despesa_id, scenario.twoItemsExpenseId);
      assert.equal(pdf.receita_id, null);
      assert.equal(pdf.nome_original, 'nota.pdf');
      assert.equal(pdf.tipo_conteudo, 'application/pdf');
      assert.equal(pdf.tamanho, PDF.length);
      assert.equal(pdf.chave, `anexos/${pdfId}`);
      assert.equal(new Date(pdf.created_at).toISOString(), UPLOADED_AT);
      assert.deepEqual(Buffer.from(memory.objects.get(pdf.chave)!), PDF);
      assert.ok(memory.metadata.get(pdf.chave)?.contentDisposition?.startsWith('inline;'), 'PDF abre no navegador');

      const png = await copiedRow(legacyAttachmentId('expense', scenario.twoItemsExpenseId, 2));
      assert.equal(png?.tipo_conteudo, 'image/png');
      assert.equal(new Date(png!.created_at).getTime(), new Date(UPLOADED_AT).getTime() + 1, 'a segunda posição ganha 1 ms');

      const income = await copiedRow(legacyAttachmentId('income', scenario.incomeId, 1));
      assert.equal(income?.tipo_dono, 'income');
      assert.equal(income?.receita_id, scenario.incomeId);
      assert.equal(income?.despesa_id, null);

      const disguised = await copiedRow(legacyAttachmentId('income', scenario.disguisedIncomeId, 1));
      assert.equal(disguised?.tipo_conteudo, 'application/octet-stream');
      assert.ok(memory.metadata.get(disguised!.chave)?.contentDisposition?.startsWith('attachment;'), 'só baixa, nunca abre no navegador');
      assert.deepEqual(Buffer.from(memory.objects.get(disguised!.chave)!), HTML_NAMED_PDF);

      assert.equal(await copiedRow(legacyAttachmentId('expense', scenario.brokenExpenseId, 1)), undefined, 'o item sem conteúdo não vira linha');
      assert.ok(await copiedRow(legacyAttachmentId('expense', scenario.brokenExpenseId, 2)));
      assert.equal(await countRowsOf('despesa_id', scenario.emptyExpenseId), 0);
      assert.equal(await countRowsOf('despesa_id', scenario.strangerExpenseId), 0, 'a outra pessoa não é tocada');

      // O backup é o JSON original, inclusive o item que não deu para copiar.
      const backedUp = backupLines(memory);
      assert.deepEqual(backedUp.map((line) => line.id).sort(), [scenario.twoItemsExpenseId, scenario.brokenExpenseId, scenario.incomeId, scenario.disguisedIncomeId].sort());
      assert.deepEqual(backedUp.find((line) => line.id === scenario.brokenExpenseId)?.anexos, scenario.brokenItems);
      assert.equal(backedUp.find((line) => line.id === scenario.brokenExpenseId)?.usuarioId, scenario.userId);

      const verified = await verify(scenario, memory);
      assert.deepEqual(verified.problems, []);
      assert.equal(verified.verified, 5);
      assert.equal(verified.notCopyable.length, 1);
      assert.equal(verified.backupParts, 2);
    });
  });

  test('os anexos copiados aparecem na ordem original da lista antiga', async () => {
    await withScenario(async (scenario) => {
      await migrate(scenario, createMemoryStorage(), true);
      const byEntry = await services.service.listAttachmentsByOwners({ type: 'expense', ids: [scenario.twoItemsExpenseId] });
      assert.deepEqual(byEntry.get(scenario.twoItemsExpenseId)?.map((attachment) => attachment.name), ['nota.pdf', 'foto.png']);
    });
  });

  test('rodar de novo não duplica nada: só o que falta é copiado', async () => {
    await withScenario(async (scenario) => {
      const memory = createMemoryStorage();
      await migrate(scenario, memory, true);
      const objectsAfterFirst = memory.objects.size;

      const second = await migrate(scenario, memory, true, 'segunda');
      assert.equal(second.copied, 0);
      assert.equal(second.alreadyCopied, 5);
      assert.equal(memory.objects.size - objectsAfterFirst, second.backupParts.length, 'só o backup novo, nenhum arquivo repetido');
      assert.deepEqual(second.backupParts, [`${LEGACY_BACKUP_PREFIX}segunda/expense-${scenario.brokenExpenseId}.jsonl.gz`],
        'só o lançamento com item que não dá para copiar é guardado de novo');
      assert.equal(await countRowsOf('despesa_id', scenario.twoItemsExpenseId), 2);

      // Uma linha que sumiu é copiada de novo; o que já estava fica como está.
      await services.client.pool.query('DELETE FROM anexos WHERE id = $1', [legacyAttachmentId('expense', scenario.twoItemsExpenseId, 2)]);
      const third = await migrate(scenario, memory, true, 'terceira');
      assert.equal(third.copied, 1);
      assert.equal(third.alreadyCopied, 4);
      assert.deepEqual((await verify(scenario, memory)).problems, []);
    });
  });

  test('a conferência aponta linha ausente, linha diferente, arquivo ausente e conteúdo diferente', async () => {
    await withScenario(async (scenario) => {
      const memory = createMemoryStorage();
      await migrate(scenario, memory, true);
      const pngId = legacyAttachmentId('expense', scenario.twoItemsExpenseId, 2);
      const incomeId = legacyAttachmentId('income', scenario.incomeId, 1);
      const disguisedId = legacyAttachmentId('income', scenario.disguisedIncomeId, 1);
      const pdfId = legacyAttachmentId('expense', scenario.twoItemsExpenseId, 1);

      memory.objects.delete(`anexos/${pngId}`);
      memory.objects.set(`anexos/${incomeId}`, Buffer.from('outro conteúdo'));
      await services.client.pool.query('DELETE FROM anexos WHERE id = $1', [disguisedId]);
      await services.client.pool.query('UPDATE anexos SET tamanho = tamanho + 1 WHERE id = $1', [pdfId]);

      const verified = await verify(scenario, memory);
      assert.equal(verified.verified, 1, 'só o PDF do boleto continua certo');
      assert.deepEqual(
        verified.problems.map((issue) => [issue.type, issue.entryId, issue.position, issue.reason]).sort(),
        [
          ['expense', scenario.twoItemsExpenseId, 1, 'a linha em anexos não bate com o original (dono, tipo, tamanho ou chave)'],
          ['expense', scenario.twoItemsExpenseId, 2, 'arquivo ausente no R2'],
          ['income', scenario.disguisedIncomeId, 1, 'sem linha na tabela anexos'],
          ['income', scenario.incomeId, 1, 'o conteúdo no R2 é diferente do original'],
        ].sort(),
      );
    });
  });

  test('a conferência de órfãos acha arquivo sem linha e linha sem arquivo', async () => {
    await withScenario(async (scenario) => {
      const memory = createMemoryStorage();
      await migrate(scenario, memory, true);
      const strayKey = `anexos/${randomUUID()}`;
      memory.objects.set(strayKey, PDF);
      const lostId = legacyAttachmentId('expense', scenario.brokenExpenseId, 2);
      memory.objects.delete(`anexos/${lostId}`);

      const orphans = await services.migration.findAttachmentOrphans(services.client.pool, memory.storage);
      assert.ok(orphans.objectsWithoutRow.includes(strayKey));
      assert.ok(orphans.rowsWithoutObject.some((row) => row.id === lostId && row.key === `anexos/${lostId}`));
      assert.ok(!orphans.objectsWithoutRow.includes(`anexos/${legacyAttachmentId('expense', scenario.twoItemsExpenseId, 1)}`), 'arquivo com linha não é órfão');
    });
  });

  test('a trava da migration 0095 enxerga os mesmos ids que a cópia grava, e só libera depois da cópia', async () => {
    // A trava olha o banco inteiro, não só a pessoa da rodada: o item da outra pessoa do cenário (1) também conta.
    const strangerItems = 1;
    const before = await guardMissing();
    await withScenario(async (scenario) => {
      assert.equal(await guardMissing(), before + 5 + strangerItems, 'os 5 itens copiáveis faltam; o sem conteúdo não trava');
      const memory = createMemoryStorage();
      await migrate(scenario, memory, true);
      assert.equal(await guardMissing(), before + strangerItems, 'depois da cópia, os mesmos 5 itens têm a linha que a trava procura');

      await services.client.pool.query('DELETE FROM anexos WHERE id = $1', [legacyAttachmentId('income', scenario.incomeId, 1)]);
      assert.equal(await guardMissing(), before + strangerItems + 1, 'uma linha que sumiu volta a travar');
    });
    assert.equal(await guardMissing(), before, 'sem os lançamentos de teste, a trava volta ao que era');
  });
});
