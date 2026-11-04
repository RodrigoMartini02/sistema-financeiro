import assert from 'node:assert/strict';
import test from 'node:test';
import type { AssistantFile } from '../../types/financialCopilot';
import { uploadDraftFiles, type UploadReceipt } from './draftFiles';

function assistantFile(id: string, name: string, type: string): AssistantFile {
  const file = new File(['conteúdo'], name, { type });
  return { id, nome: name, tipo: type, tamanho: file.size, dados: 'Y29udGXDumRv', file };
}

const NOTA = assistantFile('f1', 'nota.pdf', 'application/pdf');
const FOTO = assistantFile('f2', 'foto.jpg', 'image/jpeg');

/** Envio simulado: guarda o que recebeu e devolve ids em sequência (r1, r2...). */
function fakeUpload(failing: readonly string[] = []) {
  const sent: Array<{ ownerType: string; name: string }> = [];
  const upload: UploadReceipt = async (ownerType, file) => {
    if (failing.includes(file.name)) throw new Error('sem rede');
    sent.push({ ownerType, name: file.name });
    return { id: `r${sent.length}` };
  };
  return { upload, sent };
}

test('sobe cada arquivo como comprovante do tipo do lançamento e devolve os ids na ordem', async () => {
  const { upload, sent } = fakeUpload();
  const result = await uploadDraftFiles('income', [NOTA, FOTO], new Map(), upload);
  assert.deepEqual(result, { ids: ['r1', 'r2'], failed: [] });
  assert.deepEqual(sent, [{ ownerType: 'income', name: 'nota.pdf' }, { ownerType: 'income', name: 'foto.jpg' }]);
});

test('sem arquivos, nada sobe', async () => {
  const { upload, sent } = fakeUpload();
  assert.deepEqual(await uploadDraftFiles('expense', [], new Map(), upload), { ids: [], failed: [] });
  assert.equal(sent.length, 0);
});

test('salvar de novo não envia outra vez o arquivo que já subiu', async () => {
  const { upload, sent } = fakeUpload();
  const uploaded = new Map<string, string>();
  await uploadDraftFiles('expense', [NOTA], uploaded, upload);
  const again = await uploadDraftFiles('expense', [NOTA, FOTO], uploaded, upload);
  assert.deepEqual(again, { ids: ['r1', 'r2'], failed: [] }, 'o primeiro reaproveita o id, só o novo sobe');
  assert.equal(sent.length, 2);
});

test('um arquivo que falha vai para a lista de avisos, os outros seguem, e na próxima tentativa só ele sobe', async () => {
  const errors = console.error;
  console.error = () => undefined;
  try {
    const uploaded = new Map<string, string>();
    const flaky = fakeUpload(['foto.jpg']);
    const first = await uploadDraftFiles('expense', [FOTO, NOTA], uploaded, flaky.upload);
    assert.deepEqual(first, { ids: ['r1'], failed: ['foto.jpg'] });
    assert.deepEqual([...uploaded.keys()], ['f1'], 'o que falhou não fica como enviado');

    const working = fakeUpload();
    const second = await uploadDraftFiles('expense', [FOTO, NOTA], uploaded, working.upload);
    assert.deepEqual(second, { ids: ['r1', 'r1'], failed: [] });
    assert.deepEqual(working.sent.map((item) => item.name), ['foto.jpg'], 'só o que faltava sobe');
  } finally {
    console.error = errors;
  }
});

test('o que o lançamento não aceita (WebP) nem sobe, e o aviso traz o nome', async () => {
  const { upload, sent } = fakeUpload();
  const webp = assistantFile('f3', 'print.webp', 'image/webp');
  const result = await uploadDraftFiles('expense', [webp, NOTA], new Map(), upload);
  assert.deepEqual(result, { ids: ['r1'], failed: ['print.webp'] });
  assert.deepEqual(sent.map((item) => item.name), ['nota.pdf']);
});
