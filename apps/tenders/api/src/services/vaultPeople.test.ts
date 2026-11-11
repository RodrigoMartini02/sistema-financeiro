import assert from 'node:assert/strict';
import test from 'node:test';
import type { TendersDb } from '../collector/database';
import { RequestInputError } from '../utils/requestInput';
import { createPerson, updatePerson } from './vaultPeople';

// Pessoas do cofre, sem banco: o CPF de terceiros nunca vai para o log. O erro do Drizzle traz a consulta com os valores; uma
// falha inesperada do banco ao gravar uma pessoa vira uma mensagem genérica (500) e o log leva só o código e a restrição.

const CPF = '52998224725';
const NAME = 'Ana Souza Confidencial';

/** Um banco que falha em qualquer consulta com uma mensagem que traz os valores, como o Drizzle faz. */
function failingDatabase(): TendersDb {
  const failure = () => {
    const error = new Error(`Failed query: select "id" from "licitacoes"."pessoa" where "cpf" = $1\nparams: ${CPF},${NAME}`);
    (error as Error & { cause?: unknown }).cause = { code: '08006', message: `connection failure while reading ${CPF}` };
    throw error;
  };
  return { select: failure, insert: failure, update: failure, delete: failure } as unknown as TendersDb;
}

async function capturingErrorLog<T>(run: () => Promise<T>): Promise<{ result: PromiseSettledResult<T>; logged: string }> {
  const calls: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void calls.push(args);
  try {
    const [result] = await Promise.allSettled([run()]);
    return { result: result as PromiseSettledResult<T>, logged: JSON.stringify(calls) };
  } finally {
    console.error = original;
  }
}

test('cadastrar pessoa com o banco falhando: erro genérico (500) e o log sem o CPF nem o nome', async () => {
  const { result, logged } = await capturingErrorLog(() =>
    createPerson(failingDatabase(), { accountId: 1, userId: 2 }, { name: NAME, cpf: CPF, roles: ['SOCIO'], jobTitle: null, email: null, phone: null }),
  );
  assert.equal(result.status, 'rejected');
  const error = result.status === 'rejected' ? result.reason : null;
  assert.ok(error instanceof RequestInputError);
  assert.equal(error.status, 500);
  assert.equal(error.message, 'Não foi possível salvar a pessoa agora.');
  assert.ok(!error.message.includes(CPF) && !String(error.stack).includes(CPF), 'o erro devolvido não carrega o CPF');
  assert.ok(logged.includes('Vault person create failed:'), 'a falha é registrada');
  assert.ok(logged.includes('08006'), 'com o código do Postgres');
  assert.ok(!logged.includes(CPF) && !logged.includes('Confidencial'), 'sem o CPF nem o nome no log');
});

test('alterar pessoa com o banco falhando: o mesmo, sem o CPF no log', async () => {
  const { result, logged } = await capturingErrorLog(() => updatePerson(failingDatabase(), 1, 7, { cpf: CPF, name: NAME }));
  assert.equal(result.status, 'rejected');
  const error = result.status === 'rejected' ? result.reason : null;
  assert.ok(error instanceof RequestInputError && error.status === 500);
  assert.ok(logged.includes('Vault person update failed:'));
  assert.ok(!logged.includes(CPF) && !logged.includes('Confidencial'));
});
