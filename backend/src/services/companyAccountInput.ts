// Leitura do bloco da empresa de uma conta PJ — o mesmo no cadastro pelo site,
// na Nova conta e no Editar conta — e do bloco "Acesso" da PJ que é o login.
// Sem acesso ao banco: a unicidade do CNPJ e do e-mail é conferida na rota.
import type { NewAccount } from '../db/schema';
import { isValidCnpj } from '../middleware/validation';
import { RequestInputError, readOptionalIsoDate, readOptionalText, readRecord, roundCents } from '../utils/requestInput';

export const ENQUADRAMENTOS = ['MEI', 'ME', 'EPP', 'SLU', 'EIRELI', 'LTDA', 'SA'] as const;
export type Enquadramento = (typeof ENQUADRAMENTOS)[number];

export const MIN_PASSWORD_LENGTH = 8;

/** razao_social e nome_fantasia: varchar(150). */
const MAX_COMPANY_NAME_LENGTH = 150;
/** contas.nome: varchar(100). */
const MAX_ACCOUNT_NAME_LENGTH = 100;
/** Maior valor que cabe em decimal(12,2). */
const MAX_INITIAL_BALANCE = 9_999_999_999.99;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CompanyAccountInput {
  legalName: string;
  tradeName: string | null;
  /** CNPJ só com os dígitos. */
  document: string;
  enquadramento: Enquadramento | null;
  openingDate: string | null;
  initialBalance: number | null;
  /** O pedido trouxe `aporte_inicial` (null limpa). Sem ele, a edição mantém o valor salvo. */
  initialBalanceSent: boolean;
  /** Nome da conta: nome fantasia ou, sem ele, razão social. */
  displayName: string;
}

export interface LoginAccessInput {
  /** undefined quando o pedido não trouxe o e-mail: mantém o atual. */
  email: string | undefined;
  newPassword: string | null;
}

type CompanyAccountColumns = Pick<
  NewAccount,
  'name' | 'document' | 'legalName' | 'tradeName' | 'enquadramento' | 'openingDate' | 'initialContribution'
>;

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function readLegalName(value: unknown): string {
  const legalName = typeof value === 'string' ? value.trim() : '';
  if (!legalName) {
    throw new RequestInputError('Informe a razão social');
  }
  if (legalName.length > MAX_COMPANY_NAME_LENGTH) {
    throw new RequestInputError(`Razão social: até ${MAX_COMPANY_NAME_LENGTH} caracteres`);
  }
  return legalName;
}

function readCnpj(value: unknown): string {
  if (isBlank(value)) {
    throw new RequestInputError('Informe o CNPJ');
  }
  if (typeof value !== 'string' || !isValidCnpj(value)) {
    throw new RequestInputError('CNPJ inválido');
  }
  return value.replace(/\D/g, '');
}

function readEnquadramento(value: unknown): Enquadramento | null {
  if (isBlank(value)) {
    return null;
  }
  if (!ENQUADRAMENTOS.includes(value as Enquadramento)) {
    throw new RequestInputError('Enquadramento inválido');
  }
  return value as Enquadramento;
}

function readInitialBalance(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_INITIAL_BALANCE) {
    throw new RequestInputError('Saldo inicial inválido');
  }
  return roundCents(value);
}

/** Corpo do cadastro PJ (POST /auth/register), do POST /contas e do PUT /contas/:id de conta PJ. */
export function readCompanyAccountInput(body: unknown): CompanyAccountInput {
  const record = readRecord(body, 'Pedido inválido');
  const legalName = readLegalName(record['razao_social']);
  const tradeName = readOptionalText(record['nome_fantasia'], 'Nome fantasia', MAX_COMPANY_NAME_LENGTH);
  const openingDate = record['data_abertura'];
  return {
    legalName,
    tradeName,
    document: readCnpj(record['documento']),
    enquadramento: readEnquadramento(record['enquadramento']),
    openingDate: readOptionalIsoDate(openingDate === '' ? null : openingDate, 'Data de abertura inválida'),
    initialBalance: readInitialBalance(record['aporte_inicial']),
    initialBalanceSent: record['aporte_inicial'] !== undefined,
    // contas.nome guarda até 100 caracteres; os nomes completos ficam em
    // razao_social e nome_fantasia.
    displayName: (tradeName ?? legalName).slice(0, MAX_ACCOUNT_NAME_LENGTH),
  };
}

/** Colunas de `contas` com o bloco da empresa; o saldo inicial só entra quando veio no pedido. */
export function companyAccountColumns(input: CompanyAccountInput): CompanyAccountColumns {
  return {
    name: input.displayName,
    document: input.document,
    legalName: input.legalName,
    tradeName: input.tradeName,
    enquadramento: input.enquadramento,
    openingDate: input.openingDate,
    ...(input.initialBalanceSent
      ? { initialContribution: input.initialBalance === null ? null : input.initialBalance.toFixed(2) }
      : {}),
  };
}

/** E-mail e nova senha do bloco "Acesso" da PJ que é o login (PUT /contas/:id). */
export function readLoginAccessInput(body: unknown): LoginAccessInput {
  const record = readRecord(body, 'Pedido inválido');
  const email = record['email'];
  const newPassword = record['nova_senha'];

  let normalizedEmail: string | undefined;
  if (email !== undefined) {
    normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!normalizedEmail) {
      throw new RequestInputError('Informe o e-mail');
    }
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      throw new RequestInputError('E-mail inválido');
    }
  }

  if (isBlank(newPassword)) {
    return { email: normalizedEmail, newPassword: null };
  }
  if (typeof newPassword !== 'string') {
    throw new RequestInputError('Nova senha inválida');
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new RequestInputError(`A nova senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  return { email: normalizedEmail, newPassword };
}
