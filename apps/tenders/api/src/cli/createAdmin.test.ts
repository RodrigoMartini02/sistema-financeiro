import assert from 'node:assert/strict';
import test from 'node:test';
import { PassThrough } from 'node:stream';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { CreateAdminUsageError, parseCreateAdminArgs, readHiddenInput, reportCreateAdminFailure } from './createAdmin';

const VALID = ['--email', 'Admin@Empresa.com', '--cnpj', '11.222.333/0001-81', '--razao-social', 'Empresa ABC Ltda'];

function assertUsageError(argv: string[], message: RegExp): void {
  assert.throws(() => parseCreateAdminArgs(argv), (error: unknown) => error instanceof CreateAdminUsageError && message.test(error.message));
}

test('admin pelo terminal: lê e-mail, CNPJ e nomes; o e-mail vai em minúsculas e o CNPJ só com dígitos', () => {
  const input = parseCreateAdminArgs([...VALID, '--nome-fantasia', 'ABC']);
  assert.equal(input.email, 'admin@empresa.com');
  assert.equal(input.company.document, '11222333000181');
  assert.equal(input.company.legalName, 'Empresa ABC Ltda');
  assert.equal(input.company.tradeName, 'ABC');
  assert.equal(input.company.displayName, 'ABC');
});

test('admin pelo terminal: nome fantasia é opcional', () => {
  const input = parseCreateAdminArgs(VALID);
  assert.equal(input.company.tradeName, null);
  assert.equal(input.company.displayName, 'Empresa ABC Ltda');
});

test('admin pelo terminal: falta de argumento, e-mail ruim e CNPJ ruim são recusados com o motivo', () => {
  assertUsageError(['--cnpj', '11222333000181', '--razao-social', 'X'], /e-mail válido/);
  assertUsageError(['--email', 'sem-arroba', '--cnpj', '11222333000181', '--razao-social', 'X'], /e-mail válido/);
  assertUsageError(['--email', 'a@b.com', '--razao-social', 'X'], /--cnpj e --razao-social/);
  assertUsageError(['--email', 'a@b.com', '--cnpj', '11222333000181'], /--cnpj e --razao-social/);
  assertUsageError(['--email', 'a@b.com', '--cnpj', '11222333000182', '--razao-social', 'X'], /CNPJ inválido/);
  assertUsageError(['--email', 'a@b.com', '--cnpj', '529.982.247-25', '--razao-social', 'X'], /CNPJ inválido/);
});

test('admin pelo terminal: a senha não é argumento, e opção desconhecida é recusada', () => {
  assertUsageError([...VALID, '--senha', 'segredo123'], /senha/);
  assertUsageError([...VALID, '--outra', 'x'], /outra/);
});

class TestTerminal extends PassThrough {
  isTTY = true;
  rawModes: boolean[] = [];

  setRawMode(enabled: boolean): this {
    this.rawModes.push(enabled);
    return this;
  }
}

test('senha pelo terminal: aceita edição sem eco e restaura o terminal depois da leitura', async () => {
  const terminal = new TestTerminal();
  let displayed = '';
  const output = { write: (chunk: string) => { displayed += chunk; return true; } };
  const password = readHiddenInput('Senha: ', terminal as unknown as NodeJS.ReadStream, output);
  terminal.write('senha-x\b123\r');
  assert.equal(await password, 'senha-123');
  assert.equal(displayed, 'Senha: \n');
  assert.deepEqual(terminal.rawModes, [true, false]);
  assert.equal(terminal.listenerCount('data'), 0);
});

test('senha pelo terminal: cancelamento e fim da entrada restauram o terminal', async () => {
  for (const ending of ['\u0003', '\u0004', 'end']) {
    const terminal = new TestTerminal();
    const password = readHiddenInput('Senha: ', terminal as unknown as NodeJS.ReadStream, { write: () => true });
    if (ending === 'end') {
      terminal.end();
    } else {
      terminal.write(ending);
    }
    await assert.rejects(password, CreateAdminUsageError);
    assert.deepEqual(terminal.rawModes, [true, false]);
  }
});

test('senha pelo terminal: recusa entrada redirecionada antes de ler ou mostrar a senha', async () => {
  const terminal = new TestTerminal();
  terminal.isTTY = false;
  await assert.rejects(readHiddenInput('Senha: ', terminal as unknown as NodeJS.ReadStream, { write: () => true }), /terminal interativo/);
  assert.deepEqual(terminal.rawModes, []);
});

test('admin pelo terminal: falha inesperada não imprime hash, dados pessoais ou parâmetros do banco', (context) => {
  const logged = context.mock.method(console, 'error', () => undefined);
  reportCreateAdminFailure(new DrizzleQueryError('insert into usuarios ...', ['private@example.test', '$2a$private-password-hash'], new Error('provider-secret')));
  assert.deepEqual(logged.mock.calls.map((call) => call.arguments), [
    ['[Tenders auth] Unexpected failure:', { operation: 'create-admin' }],
    ['Não foi possível criar o admin. Confira a configuração e a disponibilidade do banco.'],
  ]);
});

test('admin pelo terminal: erro de uso preserva a orientação esperada', (context) => {
  const logged = context.mock.method(console, 'error', () => undefined);
  reportCreateAdminFailure(new CreateAdminUsageError('Informe --cnpj e --razao-social'));
  assert.deepEqual(logged.mock.calls.map((call) => call.arguments), [['Informe --cnpj e --razao-social']]);
});
