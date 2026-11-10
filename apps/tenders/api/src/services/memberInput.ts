// Leitura do cadastro e da edição de colaborador (POST e PATCH /api/tenders/team) e do perfil do titular
// (PATCH /api/tenders/profile), com as mensagens em português. Sem acesso ao banco: a validade do CPF, a unicidade do
// e-mail e do documento e o vínculo do colaborador com a conta são conferidos em accountMemberCreation e team.
// Cópia enxuta do `services/memberInput.ts` de Finanças (os dois backends são independentes), com os campos em
// inglês. Em Licitações toda conta é de empresa: o colaborador é pessoa (CPF) e tem dados de trabalho (setor,
// cargo e admissão), sem data de nascimento.
import { MEMBER_JOB_TITLE_IDS, MEMBER_SECTOR_IDS } from '../domains';
import { RequestInputError, readOptionalIsoDate, readOptionalText, readRecord } from '../utils/requestInput';

export const MIN_MEMBER_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Tamanhos das colunas de `usuarios`. */
const MAX_NAME_LENGTH = 255;
const MAX_EMAIL_LENGTH = 255;
const MAX_PHONE_LENGTH = 20;

export interface NewMemberInput {
  name: string;
  lastName: string | null;
  /** Em minúsculas. */
  email: string;
  password: string;
  /** Só os dígitos; null quando não veio (o documento é opcional). */
  document: string | null;
  phone: string | null;
  /** Código da lista padrão (domains.ts); null: sem setor. */
  sector: string | null;
  /** Código da lista padrão (domains.ts); null: sem cargo. */
  jobTitle: string | null;
  /** AAAA-MM-DD. */
  admissionDate: string | null;
}

/** Na edição, campo ausente (undefined) mantém o valor gravado; null limpa o que pode ficar vazio. */
export interface MemberUpdateInput {
  name?: string;
  lastName?: string | null;
  /** Em minúsculas. */
  email?: string;
  /** Só os dígitos; null limpa o CPF (o colaborador passa a entrar só pelo e-mail). */
  document?: string | null;
  phone?: string | null;
  sector?: string | null;
  jobTitle?: string | null;
  admissionDate?: string | null;
  newPassword?: string;
}

/** O titular edita só o que é da pessoa; e-mail, CPF e senha dele seguem pelos fluxos de acesso. */
export interface ProfileUpdateInput {
  name?: string;
  lastName?: string | null;
  phone?: string | null;
}

function readName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) {
    throw new RequestInputError('Informe o nome');
  }
  if (name.length > MAX_NAME_LENGTH) {
    throw new RequestInputError(`Nome: até ${MAX_NAME_LENGTH} caracteres`);
  }
  return name;
}

function readEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH) {
    throw new RequestInputError('Informe um e-mail válido');
  }
  return email;
}

/** CPF opcional, só com os dígitos; vazio (ou sem nenhum dígito) é "sem documento". A validade é conferida depois. */
function readDocumentDigits(value: unknown): string | null {
  const text = readOptionalText(value, 'Documento', 30);
  const digits = text === null ? '' : text.replace(/[^\d]+/g, '');
  return digits === '' ? null : digits;
}

/** Setor ou cargo da lista padrão: vazio é "nenhum"; código fora da lista é erro. */
function readCatalogCode(value: unknown, allowed: readonly string[], message: string): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new RequestInputError(message);
  }
  return value;
}

function readAdmissionDate(value: unknown): string | null {
  return readOptionalIsoDate(value === '' ? null : value, 'Data de admissão inválida');
}

function readPassword(value: unknown, message: string): string {
  if (typeof value !== 'string' || value.length < MIN_MEMBER_PASSWORD_LENGTH) {
    throw new RequestInputError(message);
  }
  return value;
}

export function readNewMemberInput(body: unknown): NewMemberInput {
  const record = readRecord(body, 'Pedido inválido');
  return {
    name: readName(record['name']),
    lastName: readOptionalText(record['lastName'], 'Sobrenome', MAX_NAME_LENGTH),
    email: readEmail(record['email']),
    password: readPassword(record['password'], `A senha precisa ter pelo menos ${MIN_MEMBER_PASSWORD_LENGTH} caracteres`),
    document: readDocumentDigits(record['document']),
    phone: readOptionalText(record['phone'], 'Telefone', MAX_PHONE_LENGTH),
    sector: readCatalogCode(record['sector'], MEMBER_SECTOR_IDS, 'Setor inválido'),
    jobTitle: readCatalogCode(record['jobTitle'], MEMBER_JOB_TITLE_IDS, 'Cargo inválido'),
    admissionDate: readAdmissionDate(record['admissionDate']),
  };
}

/** Nome, sobrenome e telefone: os campos da pessoa, comuns à edição do colaborador e do titular. */
function readPersonFields(record: Record<string, unknown>, input: ProfileUpdateInput): void {
  if (record['name'] !== undefined) {
    input.name = readName(record['name']);
  }
  if (record['lastName'] !== undefined) {
    input.lastName = readOptionalText(record['lastName'], 'Sobrenome', MAX_NAME_LENGTH);
  }
  if (record['phone'] !== undefined) {
    input.phone = readOptionalText(record['phone'], 'Telefone', MAX_PHONE_LENGTH);
  }
}

const NOTHING_TO_CHANGE = 'Informe o que alterar';

export function readMemberUpdateInput(body: unknown): MemberUpdateInput {
  const record = readRecord(body, 'Pedido inválido');
  const input: MemberUpdateInput = {};
  readPersonFields(record, input);

  if (record['email'] !== undefined) {
    input.email = readEmail(record['email']);
  }
  if (record['document'] !== undefined) {
    input.document = readDocumentDigits(record['document']);
  }
  if (record['sector'] !== undefined) {
    input.sector = readCatalogCode(record['sector'], MEMBER_SECTOR_IDS, 'Setor inválido');
  }
  if (record['jobTitle'] !== undefined) {
    input.jobTitle = readCatalogCode(record['jobTitle'], MEMBER_JOB_TITLE_IDS, 'Cargo inválido');
  }
  if (record['admissionDate'] !== undefined) {
    input.admissionDate = readAdmissionDate(record['admissionDate']);
  }
  // Senha vazia é "manter a atual": o formulário manda o campo mesmo sem preencher.
  const newPassword = record['newPassword'];
  if (newPassword !== undefined && newPassword !== '') {
    input.newPassword = readPassword(newPassword, `A nova senha precisa ter pelo menos ${MIN_MEMBER_PASSWORD_LENGTH} caracteres`);
  }

  if (Object.keys(input).length === 0) {
    throw new RequestInputError(NOTHING_TO_CHANGE);
  }
  return input;
}

export function readProfileUpdateInput(body: unknown): ProfileUpdateInput {
  const record = readRecord(body, 'Pedido inválido');
  const input: ProfileUpdateInput = {};
  readPersonFields(record, input);
  if (Object.keys(input).length === 0) {
    throw new RequestInputError(NOTHING_TO_CHANGE);
  }
  return input;
}
