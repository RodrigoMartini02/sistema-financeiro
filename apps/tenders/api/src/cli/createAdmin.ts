import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { loadEnvironment } from '../config/environment';
import { drizzle } from 'drizzle-orm/node-postgres';
import { databaseHost } from '../collector/config';
import { createTendersPool, tendersDatabaseUrl } from '../db/pool';
import * as tendersTables from '../db/schema';
import { readCompanyAccountInput, type CompanyAccountInput } from '../services/companyAccountInput';
import { createAdminAccount } from '../services/registration';
import { RequestInputError } from '../utils/requestInput';
import { logAuthFailure } from '../utils/authLogging';

// Cria o admin da plataforma de Licitações (o primeiro acesso, que o cadastro do site não cria):
//   npm --prefix apps/tenders/api run tenders:create-admin -- --email admin@empresa.com.br --cnpj 11222333000181 --razao-social "Empresa Ltda" [--nome-fantasia "Empresa"]
//   npm --prefix apps/tenders/api run tenders:create-admin:dev -- ...      (banco local: carrega ../../../.env.dev)
// O usuário vira admin, com a conta da empresa como padrão e o módulo em cortesia. A senha é digitada no terminal
// (sem eco), nunca vai como argumento nem aparece na saída. O banco vem de TENDERS_DATABASE_URL e é mostrado
// antes de gravar, para conferir. Só carrega arquivo de ambiente quando DOTENV_CONFIG_PATH está definido: nunca
// cai no .env de produção por padrão.

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONFIRMATION_WORD = 'sim';
const CTRL_C = '\u0003';

export class CreateAdminUsageError extends Error {}

export interface CreateAdminInput {
  email: string;
  company: CompanyAccountInput;
}

/** Lê e valida os argumentos; o CNPJ e os nomes passam pelas mesmas regras do cadastro da empresa. */
export function parseCreateAdminArgs(argv: readonly string[]): CreateAdminInput {
  let values: { email?: string; cnpj?: string; 'razao-social'?: string; 'nome-fantasia'?: string };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: {
        email: { type: 'string' },
        cnpj: { type: 'string' },
        'razao-social': { type: 'string' },
        'nome-fantasia': { type: 'string' },
      },
      strict: true,
    }));
  } catch (error) {
    throw new CreateAdminUsageError(error instanceof Error ? error.message : 'Argumentos inválidos');
  }

  const email = values.email?.trim().toLowerCase() ?? '';
  if (!EMAIL_SHAPE.test(email)) {
    throw new CreateAdminUsageError('Informe um e-mail válido em --email');
  }
  if (!values.cnpj || !values['razao-social']) {
    throw new CreateAdminUsageError('Informe --cnpj e --razao-social');
  }

  try {
    const company = readCompanyAccountInput({
      documento: values.cnpj,
      razao_social: values['razao-social'],
      nome_fantasia: values['nome-fantasia'],
    });
    return { email, company };
  } catch (error) {
    if (error instanceof RequestInputError) {
      throw new CreateAdminUsageError(error.message);
    }
    throw error;
  }
}

async function askVisible(question: string): Promise<string> {
  const lines = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await lines.question(question)).trim();
  } finally {
    lines.close();
  }
}

/** Lê uma linha do terminal sem mostrar o que se digita (cola também vale). Fora de terminal, recusa. */
export function readHiddenInput(
  question: string,
  input: NodeJS.ReadStream = process.stdin,
  output: { write(text: string): unknown } = process.stdout,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!input.isTTY) {
      reject(new CreateAdminUsageError('Rode em um terminal interativo: a senha é digitada, nunca passada como argumento.'));
      return;
    }

    output.write(question);
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');

    let typed = '';
    const stop = (): void => {
      input.setRawMode(false);
      input.pause();
      input.off('data', onData);
      input.off('end', onEnd);
      input.off('error', onError);
      output.write('\n');
    };
    const onEnd = (): void => {
      stop();
      reject(new CreateAdminUsageError('Entrada encerrada. Nada foi gravado.'));
    };
    const onError = (error: Error): void => {
      stop();
      reject(error);
    };
    const onData = (chunk: string): void => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          stop();
          resolve(typed);
          return;
        }
        if (char === CTRL_C || char === '\u0004') {
          stop();
          reject(new CreateAdminUsageError('Cancelado.'));
          return;
        }
        if (char === '\u007f' || char === '\b') {
          typed = typed.slice(0, -1);
        } else {
          typed += char;
        }
      }
    };
    input.on('data', onData);
    input.on('end', onEnd);
    input.on('error', onError);
  });
}

async function askPassword(): Promise<string> {
  const password = await readHiddenInput(`Senha (mínimo ${MIN_PASSWORD_LENGTH} caracteres): `);
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new CreateAdminUsageError(`A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if ((await readHiddenInput('Repita a senha: ')) !== password) {
    throw new CreateAdminUsageError('As senhas não conferem.');
  }
  return password;
}

async function main(): Promise<void> {
  loadEnvironment();

  const input = parseCreateAdminArgs(process.argv.slice(2));
  const databaseUrl = tendersDatabaseUrl(process.env);
  console.log(`Banco: ${databaseHost(databaseUrl)}`);
  console.log(`Admin: ${input.email} | empresa: ${input.company.legalName} (CNPJ ${input.company.document})`);
  if ((await askVisible(`Criar este admin neste banco? Digite "${CONFIRMATION_WORD}" para continuar: `)).toLowerCase() !== CONFIRMATION_WORD) {
    throw new CreateAdminUsageError('Nada foi gravado.');
  }

  const password = await askPassword();
  const pool = createTendersPool(process.env);
  try {
    const created = await createAdminAccount(drizzle(pool, { schema: tendersTables }), { ...input, password }, new Date());
    console.log(`Admin criado: usuário ${created.user.id}, conta ${created.accountId} (${created.user.email}).`);
  } finally {
    await pool.end();
  }
}

export function reportCreateAdminFailure(error: unknown): void {
  if (error instanceof CreateAdminUsageError || error instanceof RequestInputError) {
    console.error(error.message);
    return;
  }
  logAuthFailure('create-admin');
  console.error('Não foi possível criar o admin. Confira a configuração e a disponibilidade do banco.');
}

if (require.main === module) {
  main().catch((error: unknown) => {
    reportCreateAdminFailure(error);
    process.exitCode = 1;
  });
}
