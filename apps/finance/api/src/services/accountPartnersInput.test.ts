import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import { MAX_PARTNERS_PER_ACCOUNT, readAccountPartnersInput } from './accountPartnersInput';

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.message === message);
}

function partner(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { nome: '  Ana ', percentual: 100, ...overrides };
}

test('sem o campo, os sócios não mudam; lista vazia é aceita (conta sem sócios)', () => {
  assert.equal(readAccountPartnersInput(undefined), undefined);
  assert.deepEqual(readAccountPartnersInput([]), []);
});

test('lê nome, participação, capital e o checkbox de lançar como receita', () => {
  const [ana, bia] = readAccountPartnersInput([
    partner({ id: 7, percentual: 60, capital_inicial: 6000.555, lancar_como_receita: true }),
    partner({ nome: 'Bia', percentual: 40 }),
  ])!;
  assert.deepEqual(ana, { id: 7, name: 'Ana', percentage: 60, initialCapital: 6000.56, launchAsIncome: true });
  assert.deepEqual(bia, { id: null, name: 'Bia', percentage: 40, initialCapital: 0, launchAsIncome: false });
});

test('com algum sócio, a soma precisa dar exatamente 100%', () => {
  assert.equal(readAccountPartnersInput([
    partner({ nome: 'A', percentual: 33.33 }),
    partner({ nome: 'B', percentual: 33.33 }),
    partner({ nome: 'C', percentual: 33.34 }),
  ])!.length, 3);
  assertRejects(() => readAccountPartnersInput([partner({ percentual: 99.99 })]), 'A soma das participações precisa dar 100%');
  assertRejects(
    () => readAccountPartnersInput([partner({ percentual: 60 }), partner({ nome: 'Bia', percentual: 40.01 })]),
    'A soma das participações precisa dar 100%',
  );
});

test('nome obrigatório, com até 100 caracteres', () => {
  assertRejects(() => readAccountPartnersInput([partner({ nome: '   ' })]), 'Informe o nome do sócio');
  assertRejects(() => readAccountPartnersInput([partner({ nome: 'x'.repeat(101) })]), 'Nome do sócio: até 100 caracteres');
});

test('participação de 0,01% a 100%', () => {
  assertRejects(() => readAccountPartnersInput([partner({ percentual: 0 })]), 'Participação de Ana: de 0,01% a 100%');
  assertRejects(() => readAccountPartnersInput([partner({ percentual: 100.01 })]), 'Participação de Ana: de 0,01% a 100%');
  assertRejects(() => readAccountPartnersInput([partner({ percentual: '100' })]), 'Participação de Ana: de 0,01% a 100%');
});

test('capital: zero ou mais, até o limite de uma receita', () => {
  assertRejects(() => readAccountPartnersInput([partner({ capital_inicial: -1 })]), 'Capital de Ana inválido');
  assertRejects(() => readAccountPartnersInput([partner({ capital_inicial: 100_000_000 })]), 'Capital de Ana inválido');
  assertRejects(() => readAccountPartnersInput([partner({ capital_inicial: '500' })]), 'Capital de Ana inválido');
  assert.equal(readAccountPartnersInput([partner({ capital_inicial: null })])![0]!.initialCapital, 0);
});

test('lançar como receita exige capital', () => {
  assertRejects(
    () => readAccountPartnersInput([partner({ lancar_como_receita: true })]),
    'Informe o capital de Ana para lançar como receita',
  );
});

test('formato: lista, sócio como objeto, id inteiro positivo e sem repetir', () => {
  assertRejects(() => readAccountPartnersInput({}), 'Sócios inválidos');
  assertRejects(() => readAccountPartnersInput(['Ana']), 'Sócio inválido');
  assertRejects(() => readAccountPartnersInput([partner({ id: 0 })]), 'Sócio inválido');
  assertRejects(() => readAccountPartnersInput([partner({ id: '7' })]), 'Sócio inválido');
  assertRejects(() => readAccountPartnersInput([partner({ lancar_como_receita: 'sim' })]), 'Sócio inválido');
  assertRejects(
    () => readAccountPartnersInput([partner({ id: 3, percentual: 50 }), partner({ id: 3, nome: 'Bia', percentual: 50 })]),
    'Sócio repetido na lista',
  );
  const tooMany = Array.from({ length: MAX_PARTNERS_PER_ACCOUNT + 1 }, (_, index) => partner({ nome: `S${index}`, percentual: 1 }));
  assertRejects(() => readAccountPartnersInput(tooMany), `Até ${MAX_PARTNERS_PER_ACCOUNT} sócios por conta`);
});
