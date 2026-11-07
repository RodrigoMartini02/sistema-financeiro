import assert from 'node:assert/strict';
import test from 'node:test';
import { extractPixInfo } from './pixReader';

/** Campo do código Pix: identificação, tamanho com 2 dígitos e valor. */
function field(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, '0')}${value}`;
}

interface PixPayloadOptions {
  key?: string;
  description?: string;
  url?: string;
  amount?: string;
  txid?: string;
}

/** Código Pix como o de um QR de verdade (o CRC no fim não é conferido pela leitura). */
function pixPayload(options: PixPayloadOptions): string {
  const account =
    field('00', 'br.gov.bcb.pix') +
    (options.key ? field('01', options.key) : '') +
    (options.description ? field('02', options.description) : '') +
    (options.url ? field('25', options.url) : '');
  return (
    field('00', '01') +
    field('26', account) +
    field('52', '0000') +
    field('53', '986') +
    (options.amount ? field('54', options.amount) : '') +
    field('58', 'BR') +
    field('59', 'Fulano de Tal') +
    field('60', 'Sao Paulo') +
    field('62', field('05', options.txid ?? '***')) +
    '6304ABCD'
  );
}

test('Pix estático com valor: chave, valor, descrição, recebedor, cidade e txid', () => {
  const payload = pixPayload({ key: 'fulano@exemplo.com', description: 'Aluguel outubro', amount: '1500.00', txid: 'ALUGUEL10' });
  assert.deepEqual(extractPixInfo(payload), {
    chave: 'fulano@exemplo.com',
    valor: 1500,
    descricao: 'Aluguel outubro',
    nome_destinatario: 'Fulano de Tal',
    cidade: 'Sao Paulo',
    txid: 'ALUGUEL10',
    raw_payload: payload,
  });
});

test('Pix estático sem valor: quem paga digita o valor', () => {
  const info = extractPixInfo(pixPayload({ key: '12345678901' }));
  assert.equal(info.chave, '12345678901');
  assert.equal(info.valor, null);
  assert.equal(info.descricao, null);
  assert.equal(info.nome_destinatario, 'Fulano de Tal');
  assert.equal(info.txid, '***');
});

test('Pix com valor zerado vale como sem valor', () => {
  assert.equal(extractPixInfo(pixPayload({ key: '12345678901', amount: '0.00' })).valor, null);
});

test('Pix dinâmico: URL no lugar da chave', () => {
  const info = extractPixInfo(pixPayload({ url: 'pix.exemplo.com/qr/v2/abc123', amount: '89.90' }));
  assert.equal(info.chave, null);
  assert.equal(info.valor, 89.9);
  assert.equal(info.nome_destinatario, 'Fulano de Tal');
  assert.equal(info.cidade, 'Sao Paulo');
});

test('código vazio ou malformado: campos nulos, sem erro', () => {
  const empty = extractPixInfo('');
  assert.equal(empty.chave, null);
  assert.equal(empty.valor, null);
  assert.equal(empty.raw_payload, '');

  const malformed = extractPixInfo('texto qualquer que não é Pix');
  assert.equal(malformed.chave, null);
  assert.equal(malformed.valor, null);
  assert.equal(malformed.nome_destinatario, null);
});
