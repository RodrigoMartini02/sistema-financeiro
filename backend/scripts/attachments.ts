// Manutenção dos anexos no R2 (plano .plans/unificar-anexos-no-r2.md).
//
//   check-r2   grava arquivos de teste na pasta do ambiente do R2, abre o link assinado, confere os
//              cabeçalhos, o prazo do link e a exclusão, e apaga tudo. Recusa a pasta `producao`.
//   sweep      apaga os envios pendentes com mais de 24 horas (linha e arquivo), em lotes. Em banco que
//              não é local, só com --confirmo, e só com a pasta `producao` do R2.
//   orphans    arquivos em anexos/ sem linha no banco e linhas sem arquivo (só leitura). Com --apagar remove os
//              arquivos sem linha, depois de conferir duas vezes, com uma pausa, para não apagar um envio em
//              andamento. Em banco que não é local, --apagar exige --confirmo.
//
// Só lê arquivo de ambiente quando DOTENV_CONFIG_PATH está definido: o script nunca cai no .env de
// produção por padrão. A partir de backend/ (as 5 variáveis do R2 estão no .env.dev):
//   PowerShell: $env:DOTENV_CONFIG_PATH='../.env.dev'; npx tsx scripts/attachments.ts check-r2
//   Bash:       DOTENV_CONFIG_PATH=../.env.dev npx tsx scripts/attachments.ts check-r2
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';
import type { AttachmentOrphanReport } from '../src/services/attachmentOrphans';
import { createAttachmentStorage, createAttachmentLink, putAttachmentObject, attachmentStorageKey, removeStoredObjects } from '../src/services/attachmentStorage';
import { PRODUCTION_STORAGE_PREFIX } from '../src/services/objectStorageSettings';

const USAGE =
  'Uso: check-r2 | sweep [--confirmo] | orphans [--apagar] [--confirmo], '
  + 'com DOTENV_CONFIG_PATH apontando para o arquivo de ambiente (ex.: ../.env.dev).';
const COMMANDS = ['check-r2', 'sweep', 'orphans'] as const;
type Command = (typeof COMMANDS)[number];
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const SWEEP_MAX_BATCHES = 100;
const EXPIRED_LINK_SECONDS = 1;
const EXPIRED_LINK_WAIT_MS = 3000;
// Mais que o tempo máximo de um envio ao R2 (120 s): um arquivo sem linha que continua sem linha depois disso não é envio em andamento.
const ORPHAN_RECHECK_WAIT_MS = 150_000;
const ISSUES_SHOWN = 40;

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface StepResult {
  step: string;
  ok: boolean;
  detail: string;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Grava, abre pelo link assinado e apaga arquivos de teste, conferindo o que o navegador vai receber. */
async function checkR2(): Promise<boolean> {
  const prefix = process.env['TENDERS_STORAGE_PREFIX'] ?? '';
  if (prefix === PRODUCTION_STORAGE_PREFIX) {
    throw new Error(`Recusado: a verificação grava arquivos de teste e não roda na pasta ${PRODUCTION_STORAGE_PREFIX} do R2.`);
  }
  const storage = createAttachmentStorage(process.env);
  const results: StepResult[] = [];
  const check = (step: string, ok: boolean, detail: string) => results.push({ step, ok, detail });

  const runId = randomUUID();
  const pdfId = `check-${runId}-pdf`;
  const sheetId = `check-${runId}-sheet`;
  const pdfKey = attachmentStorageKey(pdfId);
  const sheetKey = attachmentStorageKey(sheetId);
  const pdf = Buffer.from('%PDF-1.7\n% verificação dos anexos\n');
  const sheet = Buffer.from('conteúdo da planilha de teste');

  try {
    await putAttachmentObject(storage, pdfId, { content: pdf, contentType: 'application/pdf', originalName: 'Relatório de teste (1).pdf', inline: true });
    await putAttachmentObject(storage, sheetId, { content: sheet, contentType: XLSX_CONTENT_TYPE, originalName: 'planilha.xlsx', inline: false });
    check('grava os dois arquivos com tipo e cabeçalhos', true, `pasta ${prefix}/anexos/`);

    const pdfResponse = await fetch((await createAttachmentLink(storage, pdfKey)).url);
    const pdfDisposition = pdfResponse.headers.get('content-disposition') ?? '';
    check('PDF: o link responde 200', pdfResponse.status === 200, `status ${pdfResponse.status}`);
    check('PDF: tipo application/pdf', pdfResponse.headers.get('content-type') === 'application/pdf', pdfResponse.headers.get('content-type') ?? 'sem tipo');
    check('PDF: abre no navegador (inline) com o nome codificado', pdfDisposition.startsWith('inline;') && pdfDisposition.includes("filename*=UTF-8''"), pdfDisposition);
    check('PDF: sem cache', pdfResponse.headers.get('cache-control') === 'private, no-store', pdfResponse.headers.get('cache-control') ?? 'sem cabeçalho');
    check('PDF: conteúdo igual ao enviado', Buffer.from(await pdfResponse.arrayBuffer()).equals(pdf), `${pdf.length} bytes`);

    const sheetResponse = await fetch((await createAttachmentLink(storage, sheetKey)).url);
    const sheetDisposition = sheetResponse.headers.get('content-disposition') ?? '';
    check('planilha: o link responde 200', sheetResponse.status === 200, `status ${sheetResponse.status}`);
    check('planilha: sempre baixa (attachment)', sheetDisposition.startsWith('attachment;'), sheetDisposition);
    check('planilha: conteúdo igual ao enviado', Buffer.from(await sheetResponse.arrayBuffer()).equals(sheet), `${sheet.length} bytes`);

    const shortLink = await storage.signedGetUrl?.(pdfKey, EXPIRED_LINK_SECONDS);
    await sleep(EXPIRED_LINK_WAIT_MS);
    const expired = shortLink ? await fetch(shortLink) : null;
    check('link vencido é recusado', expired?.status === 403, `status ${expired?.status ?? 'sem link'}`);
    await expired?.arrayBuffer();

    await storage.deleteObject(pdfKey);
    const afterDelete = await fetch((await createAttachmentLink(storage, pdfKey)).url);
    check('depois de apagar, o link não encontra o arquivo', afterDelete.status === 404, `status ${afterDelete.status}`);
    await afterDelete.arrayBuffer();
  } finally {
    const failed = await removeStoredObjects(storage, [pdfKey, sheetKey]);
    check('limpeza dos arquivos de teste', failed === 0, failed === 0 ? 'nada sobrou' : `${failed} arquivo(s) não apagados`);
    storage.close();
  }

  for (const { step, ok, detail } of results) {
    console.log(`${ok ? 'OK    ' : 'FALHOU'}  ${step}  (${detail})`);
  }
  return results.every((result) => result.ok);
}

interface Environment {
  host: string;
  isLocal: boolean;
}

/** O banco e a pasta do R2 têm que ser do mesmo ambiente: local com a pasta `local`, remoto com a `producao`. */
function readEnvironment(): Environment {
  const databaseUrl = process.env['DATABASE_URL'] ?? '';
  const host = new URL(databaseUrl).hostname;
  const isLocal = LOCAL_HOSTS.has(host);
  const prefix = process.env['TENDERS_STORAGE_PREFIX'] ?? '';
  console.log(`Banco: ${host} · pasta do R2: ${prefix}`);
  if (isLocal === (prefix === PRODUCTION_STORAGE_PREFIX)) {
    throw new Error(`Recusado: banco ${isLocal ? 'local' : 'remoto'} com a pasta ${prefix} do R2; o banco e a pasta têm que ser do mesmo ambiente.`);
  }
  return { host, isLocal };
}

/** Quem grava ou apaga em banco que não é local precisa ter pedido isso com --confirmo. */
function requireConfirmationOutsideLocal(environment: Environment, confirmed: boolean): void {
  if (!environment.isLocal && !confirmed) {
    throw new Error(`O banco é ${environment.host}, que não é local: rode com --confirmo.`);
  }
}

function assertKnownFlags(flags: readonly string[], allowed: readonly string[]): void {
  const unknown = flags.filter((flag) => !allowed.some((name) => flag === name || (name.endsWith('=') && flag.startsWith(name))));
  if (unknown.length > 0) {
    throw new Error(`Opção desconhecida: ${unknown.join(', ')}. ${USAGE}`);
  }
}

/** Apaga, em lotes, os envios pendentes vencidos. */
async function sweep(confirmed: boolean): Promise<boolean> {
  requireConfirmationOutsideLocal(readEnvironment(), confirmed);

  // Só agora: importar o serviço abre a conexão com o banco.
  const [{ sweepPendingAttachments }, { pool }] = await Promise.all([
    import('../src/services/attachmentService.js'),
    import('../src/db/client.js'),
  ]);
  const storage = createAttachmentStorage(process.env);
  let removed = 0;
  let failedObjects = 0;
  try {
    for (let batch = 0; batch < SWEEP_MAX_BATCHES; batch += 1) {
      const result = await sweepPendingAttachments(storage);
      removed += result.removed;
      failedObjects += result.failedObjects;
      if (result.removed === 0) {
        break;
      }
    }
  } finally {
    storage.close();
    await pool.end();
  }
  console.log(`Envios pendentes apagados: ${removed}${failedObjects > 0 ? ` · arquivos que o R2 não apagou: ${failedObjects}` : ''}`);
  return failedObjects === 0;
}

function printOrphans(report: AttachmentOrphanReport): void {
  console.log(`Arquivos no R2 sem linha no banco: ${report.objectsWithoutRow.length}`);
  for (const key of report.objectsWithoutRow.slice(0, ISSUES_SHOWN)) {
    console.log(`  ${key}`);
  }
  console.log(`Linhas no banco sem arquivo no R2: ${report.rowsWithoutObject.length}`);
  for (const row of report.rowsWithoutObject.slice(0, ISSUES_SHOWN)) {
    console.log(`  ${row.id} (${row.key})`);
  }
}

async function orphans(flags: readonly string[]): Promise<boolean> {
  assertKnownFlags(flags, ['--apagar', '--confirmo']);
  const remove = flags.includes('--apagar');
  const environment = readEnvironment();
  if (remove) {
    requireConfirmationOutsideLocal(environment, flags.includes('--confirmo'));
  }

  // Só agora: importar o serviço abre a conexão com o banco.
  const [{ findAttachmentOrphans }, { pool }] = await Promise.all([
    import('../src/services/attachmentOrphans.js'),
    import('../src/db/client.js'),
  ]);
  const storage = createAttachmentStorage(process.env);
  try {
    const first = await findAttachmentOrphans(storage);
    printOrphans(first);
    if (!remove || first.objectsWithoutRow.length === 0) {
      return first.objectsWithoutRow.length === 0 && first.rowsWithoutObject.length === 0;
    }
    // Um envio em andamento grava o arquivo antes da linha: só vale apagar o que continua sem linha depois da pausa.
    console.log(`Conferindo de novo em ${ORPHAN_RECHECK_WAIT_MS / 1000} s, para não apagar um envio em andamento...`);
    await sleep(ORPHAN_RECHECK_WAIT_MS);
    const second = await findAttachmentOrphans(storage);
    const firstKeys = new Set(first.objectsWithoutRow);
    const toRemove = second.objectsWithoutRow.filter((key) => firstKeys.has(key));
    const failed = await removeStoredObjects(storage, toRemove);
    console.log(`Arquivos sem linha apagados: ${toRemove.length - failed}${failed > 0 ? ` · não apagados: ${failed}` : ''}`);
    return failed === 0 && second.rowsWithoutObject.length === 0;
  } finally {
    storage.close();
    await pool.end();
  }
}

function isCommand(value: string | undefined): value is Command {
  return COMMANDS.some((command) => command === value);
}

async function main(): Promise<boolean> {
  const [command, ...flags] = process.argv.slice(2);
  if (!isCommand(command)) {
    throw new Error(USAGE);
  }
  const envFile = process.env['DOTENV_CONFIG_PATH'];
  if (!envFile) {
    throw new Error(`Defina DOTENV_CONFIG_PATH: o script nunca usa o .env de produção por padrão. ${USAGE}`);
  }
  dotenv.config({ path: envFile });
  switch (command) {
    case 'check-r2':
      assertKnownFlags(flags, []);
      return checkR2();
    case 'sweep':
      assertKnownFlags(flags, ['--confirmo']);
      return sweep(flags.includes('--confirmo'));
    case 'orphans':
      return orphans(flags);
  }
}

main()
  .then((succeeded) => {
    if (!succeeded) {
      process.exitCode = 1;
    }
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
