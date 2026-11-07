// Leitura do cadastro e da edição de membro/colaborador (POST e PUT
// /api/account-members), com as mensagens em português. Sem acesso ao banco:
// a validade do documento pelo tipo da conta e a unicidade do e-mail e do
// documento são conferidas na rota.
import { RequestInputError, readOptionalIsoDate, readRecord } from '../utils/requestInput';

export const MIN_MEMBER_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface NewMemberInput {
  name: string;
  lastName: string | null;
  /** Em minúsculas. */
  email: string;
  password: string;
  /** Só os dígitos; null quando não veio (o documento é opcional). */
  document: string | null;
  telefone: string | null;
  dataNascimento: string | null;
  /** Dados de trabalho (só conta PJ): conferidos contra a conta na rota. */
  sectorId: number | null;
  jobTitleId: number | null;
  admissionDate: string | null;
}

/** Na edição, campo ausente (undefined) mantém o valor gravado. */
export interface MemberUpdateInput {
  name: string;
  lastName?: string | null;
  photo?: string | null;
  telefone?: string | null;
  dataNascimento?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  /** Em minúsculas. */
  email?: string;
  /** Só os dígitos. */
  document?: string;
  newPassword?: string;
  /** null limpa. */
  sectorId?: number | null;
  jobTitleId?: number | null;
  admissionDate?: string | null;
}

function readName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) {
    throw new RequestInputError('Informe o nome');
  }
  return name;
}

function readEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email)) {
    throw new RequestInputError('Informe um e-mail válido');
  }
  return email;
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function documentDigits(value: string): string {
  return value.replace(/[^\d]+/g, '');
}

/** Setor ou cargo escolhido na lista da conta: vazio é "nenhum". */
function readOptionalCatalogId(value: unknown, message: string): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new RequestInputError(message);
  }
  return value;
}

function readAdmissionDate(value: unknown): string | null {
  return readOptionalIsoDate(value === '' ? null : value, 'Data de admissão inválida');
}

/** Campo opcional da edição: ausente mantém; vazio ou null limpa. */
function readOptionalField(record: Record<string, unknown>, key: string): string | null | undefined {
  if (record[key] === undefined) {
    return undefined;
  }
  return readText(record[key]);
}

export function readNewMemberInput(body: unknown): NewMemberInput {
  const record = readRecord(body, 'Pedido inválido');
  const password = record['senha'];
  if (typeof password !== 'string' || password.length < MIN_MEMBER_PASSWORD_LENGTH) {
    throw new RequestInputError(`A senha precisa ter pelo menos ${MIN_MEMBER_PASSWORD_LENGTH} caracteres`);
  }

  const document = readText(record['documento']);
  return {
    name: readName(record['nome']),
    lastName: readText(record['sobrenome']),
    email: readEmail(record['email']),
    password,
    document: document === null ? null : documentDigits(document),
    telefone: readText(record['telefone']),
    dataNascimento: readText(record['data_nascimento']),
    sectorId: readOptionalCatalogId(record['setor_id'], 'Setor inválido'),
    jobTitleId: readOptionalCatalogId(record['cargo_id'], 'Cargo inválido'),
    admissionDate: readAdmissionDate(record['data_admissao']),
  };
}

export function readMemberUpdateInput(body: unknown): MemberUpdateInput {
  const record = readRecord(body, 'Pedido inválido');
  const input: MemberUpdateInput = { name: readName(record['nome']) };

  input.lastName = readOptionalField(record, 'sobrenome');
  input.telefone = readOptionalField(record, 'telefone');
  input.dataNascimento = readOptionalField(record, 'data_nascimento');
  input.country = readOptionalField(record, 'pais');
  input.state = readOptionalField(record, 'estado');
  input.city = readOptionalField(record, 'cidade');

  const photo = record['foto'];
  if (photo !== undefined) {
    if (photo !== null && typeof photo !== 'string') {
      throw new RequestInputError('Foto inválida');
    }
    input.photo = photo;
  }

  // E-mail, documento e senha vazios mantêm o que está gravado, como sempre.
  if (readText(record['email']) !== null) {
    input.email = readEmail(record['email']);
  }

  const document = readText(record['documento']);
  if (document !== null) {
    input.document = documentDigits(document);
  }

  if (record['setor_id'] !== undefined) {
    input.sectorId = readOptionalCatalogId(record['setor_id'], 'Setor inválido');
  }
  if (record['cargo_id'] !== undefined) {
    input.jobTitleId = readOptionalCatalogId(record['cargo_id'], 'Cargo inválido');
  }
  if (record['data_admissao'] !== undefined) {
    input.admissionDate = readAdmissionDate(record['data_admissao']);
  }

  const newPassword = record['nova_senha'];
  if (typeof newPassword === 'string' && newPassword !== '') {
    if (newPassword.length < MIN_MEMBER_PASSWORD_LENGTH) {
      throw new RequestInputError(`A nova senha precisa ter pelo menos ${MIN_MEMBER_PASSWORD_LENGTH} caracteres`);
    }
    input.newPassword = newPassword;
  }

  return input;
}
