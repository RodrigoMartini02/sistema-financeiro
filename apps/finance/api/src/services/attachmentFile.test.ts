import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import sharp from 'sharp';
import {
  buildContentDisposition, cleanOriginalName, detectAttachmentFormat, prepareAttachment,
} from './attachmentFile';
import { ATTACHMENT_RULES } from './attachmentRules';
import { RequestInputError } from '../utils/requestInput';

const MEGABYTE = 1024 * 1024;

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(32)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(32)]);
const OLE = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]);
const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64)]);
const TEXT = Buffer.from('Comprovante do pagamento\r\nValor: 120,00\r\n', 'latin1');

function upload(originalName: string, content: Uint8Array) {
  return { originalName, content };
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof RequestInputError, 'recusa do arquivo é um erro do pedido');
    assert.equal(error.status, 400);
    return error.message;
  }
  throw new assert.AssertionError({ message: 'o arquivo devia ser recusado' });
}

test('detecta o formato pelo conteúdo; Office e texto dependem da extensão', () => {
  assert.equal(detectAttachmentFormat(PDF, '.pdf'), 'pdf');
  assert.equal(detectAttachmentFormat(PNG, '.png'), 'png');
  assert.equal(detectAttachmentFormat(JPEG, '.jpg'), 'jpg');
  assert.equal(detectAttachmentFormat(GIF, '.gif'), 'gif');
  assert.equal(detectAttachmentFormat(WEBP, '.webp'), 'webp');
  assert.equal(detectAttachmentFormat(OLE, '.doc'), 'doc');
  assert.equal(detectAttachmentFormat(OLE, '.xls'), 'xls');
  assert.equal(detectAttachmentFormat(OLE, '.ppt'), null, 'família OLE com extensão que não é doc nem xls');
  assert.equal(detectAttachmentFormat(ZIP, '.docx'), 'docx');
  assert.equal(detectAttachmentFormat(ZIP, '.xlsx'), 'xlsx');
  assert.equal(detectAttachmentFormat(ZIP, '.zip'), null, 'um ZIP qualquer não vale como anexo');
  assert.equal(detectAttachmentFormat(TEXT, '.txt'), 'txt');
  assert.equal(detectAttachmentFormat(TEXT, '.pdf'), null, 'texto sem assinatura de PDF');
  assert.equal(detectAttachmentFormat(Buffer.from('<html><script>alert(1)</script></html>'), '.pdf'), null);
  assert.equal(detectAttachmentFormat(Buffer.from([0x68, 0x00, 0x69]), '.txt'), null, 'byte NUL: não é texto');
  assert.equal(detectAttachmentFormat(Buffer.alloc(0), '.txt'), 'txt', 'o arquivo vazio é recusado antes, pelo tamanho');
  assert.equal(detectAttachmentFormat(Buffer.from('RIFF'), '.webp'), null, 'cabeçalho curto demais');
  assert.equal(detectAttachmentFormat(PDF, '.txt'), 'pdf', 'o conteúdo manda: PDF renomeado continua PDF');
});

test('despesa e receita aceitam os dez tipos da tela de lançamento, pelo conteúdo e com a extensão certa', async () => {
  const accepted: Array<[string, Buffer, string, boolean]> = [
    ['nota.pdf', PDF, 'application/pdf', true],
    ['foto.jpg', JPEG, 'image/jpeg', true],
    ['foto.JPEG', JPEG, 'image/jpeg', true],
    ['print.png', PNG, 'image/png', true],
    ['animacao.gif', GIF, 'image/gif', true],
    ['planilha.xls', OLE, 'application/vnd.ms-excel', false],
    ['planilha.xlsx', ZIP, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', false],
    ['contrato.doc', OLE, 'application/msword', false],
    ['contrato.docx', ZIP, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', false],
    ['recibo.txt', TEXT, 'text/plain', false],
  ];
  for (const ownerType of ['expense', 'income'] as const) {
    for (const [name, content, contentType, inline] of accepted) {
      const prepared = await prepareAttachment(ownerType, upload(name, content));
      assert.equal(prepared.contentType, contentType, `${ownerType} ${name}`);
      assert.equal(prepared.inline, inline, `${ownerType} ${name}: só PDF e imagem abrem no navegador`);
      assert.equal(prepared.originalName, name);
      assert.equal(prepared.content, content, 'o conteúdo enviado é guardado como veio');
    }
  }
});

test('recusa o que não é do tipo declarado pelo nome, o que não é aceito e o arquivo vazio', async () => {
  const entryMessage = ATTACHMENT_RULES.expense.typeMessage;
  assert.equal(await refusal(prepareAttachment('expense', upload('nota.pdf', Buffer.from('<html>oi</html>')))), entryMessage);
  assert.equal(await refusal(prepareAttachment('expense', upload('nota.txt', PDF))), entryMessage, 'PDF com nome de texto');
  assert.equal(await refusal(prepareAttachment('expense', upload('foto.png', JPEG))), entryMessage, 'JPEG com nome de PNG');
  assert.equal(await refusal(prepareAttachment('expense', upload('arquivo.zip', ZIP))), entryMessage);
  assert.equal(await refusal(prepareAttachment('expense', upload('foto.webp', WEBP))), entryMessage, 'WebP não está entre os tipos de lançamento');
  assert.equal(await refusal(prepareAttachment('expense', upload('semextensao', PDF))), entryMessage);
  assert.equal(await refusal(prepareAttachment('expense', upload('vazio.pdf', Buffer.alloc(0)))), entryMessage);
  assert.equal(await refusal(prepareAttachment('expense', upload('binario.txt', Buffer.from([0x41, 0x00, 0x42])))), entryMessage);
});

test('contrato aceita só PDF, JPG e PNG, até 20 MB', async () => {
  const message = ATTACHMENT_RULES.contract.typeMessage;
  for (const [name, content] of [['contrato.pdf', PDF], ['foto.jpg', JPEG], ['foto.png', PNG]] as const) {
    assert.equal((await prepareAttachment('contract', upload(name, content))).originalName, name);
  }
  for (const [name, content] of [['animacao.gif', GIF], ['planilha.xlsx', ZIP], ['texto.txt', TEXT], ['doc.docx', ZIP]] as const) {
    assert.equal(await refusal(prepareAttachment('contract', upload(name, content))), message, name);
  }

  const atLimit = Buffer.concat([PDF, Buffer.alloc(20 * MEGABYTE - PDF.length)]);
  assert.equal((await prepareAttachment('contract', upload('limite.pdf', atLimit))).content.length, 20 * MEGABYTE);
  const overLimit = Buffer.concat([PDF, Buffer.alloc(20 * MEGABYTE + 1 - PDF.length)]);
  assert.equal(await refusal(prepareAttachment('contract', upload('grande.pdf', overLimit))), 'O arquivo passa de 20 MB');
});

test('lançamento aceita até 10 MB', async () => {
  const atLimit = Buffer.concat([PDF, Buffer.alloc(10 * MEGABYTE - PDF.length)]);
  assert.equal((await prepareAttachment('expense', upload('limite.pdf', atLimit))).content.length, 10 * MEGABYTE);
  const overLimit = Buffer.concat([PDF, Buffer.alloc(10 * MEGABYTE + 1 - PDF.length)]);
  assert.equal(await refusal(prepareAttachment('income', upload('grande.pdf', overLimit))), 'O arquivo passa de 10 MB');
});

test('foto do catálogo: reduzida a 1600 px e convertida para WebP, sem ampliar as pequenas', async () => {
  const large = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#336699' } }).png().toBuffer();
  const prepared = await prepareAttachment('product', upload('Foto da loja.png', large));
  assert.equal(prepared.originalName, 'Foto da loja.webp');
  assert.equal(prepared.contentType, 'image/webp');
  assert.equal(prepared.format, 'webp');
  assert.equal(prepared.inline, true);
  const metadata = await sharp(prepared.content).metadata();
  assert.deepEqual([metadata.format, metadata.width, metadata.height], ['webp', 1600, 800]);

  const small = await sharp({ create: { width: 300, height: 200, channels: 3, background: '#aa3333' } }).jpeg().toBuffer();
  const smallPrepared = await prepareAttachment('product', upload('pequena.jpg', small));
  const smallMetadata = await sharp(smallPrepared.content).metadata();
  assert.deepEqual([smallMetadata.width, smallMetadata.height], [300, 200]);
});

test('foto do catálogo: a extensão não importa (o arquivo guardado é outro), o conteúdo sim', async () => {
  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#000000' } }).png().toBuffer();
  assert.equal((await prepareAttachment('product', upload('foto.jpg', png))).originalName, 'foto.webp');
  assert.equal((await prepareAttachment('product', upload('.png', png))).originalName, '.png.webp');

  const message = ATTACHMENT_RULES.product.typeMessage;
  assert.equal(await refusal(prepareAttachment('product', upload('foto.png', PDF))), message);
  assert.equal(await refusal(prepareAttachment('product', upload('animada.gif', GIF))), message, 'GIF não é aceito no catálogo');
  assert.equal(await refusal(prepareAttachment('product', upload('vazia.png', Buffer.alloc(0)))), message);
});

test('foto do catálogo: imagem corrompida é recusada e a falha fica no log', async () => {
  const warn = mock.method(console, 'warn', () => {});
  try {
    assert.equal(await refusal(prepareAttachment('product', upload('quebrada.png', PNG))), ATTACHMENT_RULES.product.typeMessage);
    assert.equal(warn.mock.callCount(), 1);
    assert.equal(warn.mock.calls[0]?.arguments[0], 'Attachment image conversion failed:');
  } finally {
    warn.mock.restore();
  }
  const oversized = Buffer.concat([PNG, Buffer.alloc(8 * MEGABYTE)]);
  assert.equal(await refusal(prepareAttachment('product', upload('grande.png', oversized))), 'A imagem passa de 8 MB');
});

test('limpa o nome do arquivo: sem pasta, sem caracteres de controle, até 255 caracteres', () => {
  assert.equal(cleanOriginalName('nota fiscal.pdf'), 'nota fiscal.pdf');
  assert.equal(cleanOriginalName('C:\\fakepath\\nota.pdf'), 'nota.pdf');
  assert.equal(cleanOriginalName('../../etc/passwd.txt'), 'passwd.txt');
  assert.equal(cleanOriginalName('..\\..\\evil.pdf'), 'evil.pdf');
  assert.equal(cleanOriginalName('  recibo\u0000\u0007.pdf \n'), 'recibo.pdf');
  assert.equal(cleanOriginalName('Relatório março.pdf'), 'Relatório março.pdf');
  const long = `${'a'.repeat(300)}.pdf`;
  const cleaned = cleanOriginalName(long);
  assert.equal(cleaned.length, 255);
  assert.ok(cleaned.endsWith('.pdf'), 'o corte mantém o fim, onde está a extensão');
});

test('o nome com caminho não muda a extensão conferida', async () => {
  const prepared = await prepareAttachment('expense', upload('C:\\Users\\ana\\nota.pdf', PDF));
  assert.equal(prepared.originalName, 'nota.pdf');
});

test('Content-Disposition: inline para PDF e imagem, attachment para o resto, com o nome codificado', () => {
  assert.equal(
    buildContentDisposition('Relatório março.pdf', true),
    `inline; filename="Relatorio marco.pdf"; filename*=UTF-8''Relat%C3%B3rio%20mar%C3%A7o.pdf`,
  );
  assert.equal(
    buildContentDisposition('planilha.xlsx', false),
    `attachment; filename="planilha.xlsx"; filename*=UTF-8''planilha.xlsx`,
  );
  assert.equal(
    buildContentDisposition('a"b (1)*.pdf', false),
    `attachment; filename="ab (1)*.pdf"; filename*=UTF-8''a%22b%20%281%29%2A.pdf`,
  );
  assert.equal(buildContentDisposition('日本語.pdf', true), `inline; filename="anexo.pdf"; filename*=UTF-8''%E6%97%A5%E6%9C%AC%E8%AA%9E.pdf`);
  assert.match(buildContentDisposition('', false), /^attachment; filename="anexo"/);
});
