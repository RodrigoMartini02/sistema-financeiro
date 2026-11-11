import { findDocumentType, PERSON_ROLE_IDS, type DocumentCatalogEntry, type DocumentTypeDefinition, type PersonRole } from '../domains';
import { isValidCpf } from '../middleware/validation';
import { RequestInputError, isValidIsoDate, readOptionalText, readRecord } from '../utils/requestInput';

// Leitura dos pedidos do cofre (item 5): pessoas e documentos, com as mensagens em português. Sem acesso ao banco: a
// unicidade do CPF, a pessoa ser da conta e os limites por conta são conferidos nos serviços (vaultPeople e
// vaultDocuments). O arquivo tem leitura própria (documentUpload).

export const MAX_PERSON_NAME_LENGTH = 120;
export const MAX_PERSON_JOB_TITLE_LENGTH = 80;
export const MAX_PERSON_EMAIL_LENGTH = 255;
export const MAX_PERSON_PHONE_LENGTH = 20;
export const MAX_DOCUMENT_DESCRIPTION_LENGTH = 120;
/** Datas de emissão e de validade fora desta faixa são erro de digitação. */
const MIN_DOCUMENT_YEAR = 1900;
const MAX_DOCUMENT_YEAR = 2100;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOTHING_TO_CHANGE = 'Informe o que alterar';

export interface PersonInput {
  name: string;
  /** Só os 11 dígitos, com os dígitos verificadores certos. */
  cpf: string;
  roles: PersonRole[];
  jobTitle: string | null;
  /** Em minúsculas. */
  email: string | null;
  phone: string | null;
}

/** Na edição, campo ausente mantém o que está gravado; o que pode ficar vazio, vazio limpa. */
export type PersonChanges = Partial<PersonInput>;

function readPersonName(value: unknown): string {
  const name = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (name === '') {
    throw new RequestInputError('Informe o nome da pessoa');
  }
  if (name.length > MAX_PERSON_NAME_LENGTH) {
    throw new RequestInputError(`Nome: até ${MAX_PERSON_NAME_LENGTH} caracteres`);
  }
  return name;
}

function readPersonCpf(value: unknown): string {
  const digits = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  if (!isValidCpf(digits)) {
    throw new RequestInputError('CPF inválido: confira os 11 dígitos');
  }
  return digits;
}

function readPersonRoles(value: unknown): PersonRole[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new RequestInputError('Escolha ao menos um papel para a pessoa');
  }
  const roles = [...new Set(value)];
  if (!roles.every((role): role is PersonRole => typeof role === 'string' && PERSON_ROLE_IDS.includes(role))) {
    throw new RequestInputError('Papel inválido');
  }
  return roles;
}

function readPersonEmail(value: unknown): string | null {
  const text = readOptionalText(value, 'E-mail', MAX_PERSON_EMAIL_LENGTH);
  if (text === null) {
    return null;
  }
  const email = text.toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new RequestInputError('Informe um e-mail válido');
  }
  return email;
}

export function readPersonInput(body: unknown): PersonInput {
  const record = readRecord(body, 'Pedido inválido');
  return {
    name: readPersonName(record['name']),
    cpf: readPersonCpf(record['cpf']),
    roles: readPersonRoles(record['roles']),
    jobTitle: readOptionalText(record['jobTitle'], 'Cargo', MAX_PERSON_JOB_TITLE_LENGTH),
    email: readPersonEmail(record['email']),
    phone: readOptionalText(record['phone'], 'Telefone', MAX_PERSON_PHONE_LENGTH),
  };
}

export function readPersonChanges(body: unknown): PersonChanges {
  const record = readRecord(body, 'Pedido inválido');
  const changes: PersonChanges = {};
  if (record['name'] !== undefined) {
    changes.name = readPersonName(record['name']);
  }
  if (record['cpf'] !== undefined) {
    changes.cpf = readPersonCpf(record['cpf']);
  }
  if (record['roles'] !== undefined) {
    changes.roles = readPersonRoles(record['roles']);
  }
  if (record['jobTitle'] !== undefined) {
    changes.jobTitle = readOptionalText(record['jobTitle'], 'Cargo', MAX_PERSON_JOB_TITLE_LENGTH);
  }
  if (record['email'] !== undefined) {
    changes.email = readPersonEmail(record['email']);
  }
  if (record['phone'] !== undefined) {
    changes.phone = readOptionalText(record['phone'], 'Telefone', MAX_PERSON_PHONE_LENGTH);
  }
  if (Object.keys(changes).length === 0) {
    throw new RequestInputError(NOTHING_TO_CHANGE);
  }
  return changes;
}

/** Os campos do documento que a pessoa preenche, além do tipo e do arquivo. */
export interface DocumentFields {
  description: string | null;
  /** AAAA-MM-DD. */
  issuedOn: string | null;
  /** AAAA-MM-DD; o próprio dia ainda vale. */
  validUntil: string | null;
}

export interface NewDocumentInput extends DocumentFields {
  type: DocumentCatalogEntry;
  /** A pessoa do documento (tipos de pessoa); nulo nos tipos da empresa. */
  personId: number | null;
}

/** Na edição, campo ausente mantém; vazio limpa. O tipo e a pessoa não mudam. */
export type DocumentChanges = Partial<DocumentFields>;

function readDocumentTypeCode(value: unknown): DocumentCatalogEntry {
  const type = typeof value === 'string' ? findDocumentType(value) : undefined;
  if (!type) {
    throw new RequestInputError('Tipo de documento inválido');
  }
  return type;
}

function readDocumentPersonId(value: unknown, type: DocumentTypeDefinition): number | null {
  if (type.owner === 'EMPRESA') {
    if (value !== undefined && value !== null) {
      throw new RequestInputError('Este tipo de documento é da empresa e não tem pessoa');
    }
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new RequestInputError('Escolha a pessoa do documento');
  }
  return value;
}

function readDocumentDescription(value: unknown): string | null {
  const text = readOptionalText(value, 'Descrição', MAX_DOCUMENT_DESCRIPTION_LENGTH);
  return text === null ? null : text.replace(/\s+/g, ' ');
}

/** Data AAAA-MM-DD de calendário, vazia ou nula é "sem data"; fora de 1900 a 2100 é erro de digitação. */
function readDocumentDate(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  if (typeof value !== 'string' || !isValidIsoDate(value)) {
    throw new RequestInputError(`${label} inválida`);
  }
  const year = Number(value.slice(0, 4));
  if (year < MIN_DOCUMENT_YEAR || year > MAX_DOCUMENT_YEAR) {
    throw new RequestInputError(`${label} inválida`);
  }
  return value;
}

/**
 * As regras do tipo sobre os campos (na criação e, com os campos já mesclados, na edição): a validade é obrigatória nos
 * tipos que vencem, a descrição nos tipos genéricos, e a emissão não pode ser depois da validade.
 */
export function assertDocumentFields(type: DocumentTypeDefinition, fields: DocumentFields): void {
  if (type.descriptionRequired && fields.description === null) {
    throw new RequestInputError('Descreva o documento');
  }
  if (type.validityRequired && fields.validUntil === null) {
    throw new RequestInputError('Informe a validade do documento');
  }
  if (fields.issuedOn !== null && fields.validUntil !== null && fields.issuedOn > fields.validUntil) {
    throw new RequestInputError('A emissão não pode ser depois da validade');
  }
}

/** Corpo de `POST /vault/documents` sem o arquivo: o tipo, a pessoa (tipos de pessoa), a descrição e as datas. */
export function readNewDocumentInput(body: unknown): NewDocumentInput {
  const record = readRecord(body, 'Pedido inválido');
  const type = readDocumentTypeCode(record['type']);
  const input: NewDocumentInput = {
    type,
    personId: readDocumentPersonId(record['personId'], type),
    description: readDocumentDescription(record['description']),
    issuedOn: readDocumentDate(record['issuedOn'], 'Data de emissão'),
    validUntil: readDocumentDate(record['validUntil'], 'Data de validade'),
  };
  assertDocumentFields(type, input);
  return input;
}

/**
 * Corpo de `PATCH /vault/documents/:id` sem o arquivo: só os campos que vieram. As regras do tipo são conferidas depois, com
 * o que já está gravado (`assertDocumentFields`). `hasFile` diz se veio um arquivo novo (lido à parte).
 */
export function readDocumentChanges(body: unknown): { changes: DocumentChanges; hasFile: boolean } {
  const record = readRecord(body, 'Pedido inválido');
  const changes: DocumentChanges = {};
  if (record['description'] !== undefined) {
    changes.description = readDocumentDescription(record['description']);
  }
  if (record['issuedOn'] !== undefined) {
    changes.issuedOn = readDocumentDate(record['issuedOn'], 'Data de emissão');
  }
  if (record['validUntil'] !== undefined) {
    changes.validUntil = readDocumentDate(record['validUntil'], 'Data de validade');
  }
  const hasFile = record['file'] !== undefined;
  if (Object.keys(changes).length === 0 && !hasFile) {
    throw new RequestInputError(NOTHING_TO_CHANGE);
  }
  return { changes, hasFile };
}
