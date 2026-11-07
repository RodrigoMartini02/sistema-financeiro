import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import { readAccountCatalogName } from './accountNameInput';

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.message === message);
}

test('nome da lista: apara os espaços', () => {
  assert.equal(readAccountCatalogName('  Financeiro ', { singular: 'setor' }), 'Financeiro');
});

test('nome obrigatório, com até 100 caracteres, nas palavras de cada lista', () => {
  assertRejects(() => readAccountCatalogName('   ', { singular: 'setor' }), 'Informe o nome do setor');
  assertRejects(() => readAccountCatalogName(undefined, { singular: 'cargo' }), 'Informe o nome do cargo');
  assertRejects(() => readAccountCatalogName(42, { singular: 'cargo' }), 'Informe o nome do cargo');
  assertRejects(() => readAccountCatalogName('x'.repeat(101), { singular: 'setor' }), 'Nome do setor: até 100 caracteres');
  assert.equal(readAccountCatalogName('x'.repeat(100), { singular: 'setor' }).length, 100);
});
