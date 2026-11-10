// Leitura da edição do perfil da empresa (PATCH /api/tenders/company), com as mensagens em português. Sem acesso ao
// banco. Campo ausente mantém o valor gravado; texto vazio (ou null) limpa o que pode ficar vazio. A razão social
// nunca fica vazia. Os fatos da Receita (situação, natureza jurídica e CNAEs) e o CNPJ não entram aqui: só a consulta
// os grava.
import {
  BRAZILIAN_STATES,
  COMPANY_SIZE_IDS,
  LEGAL_TYPE_IDS,
  type CompanySize,
  type LegalType,
} from '../domains';
import { RequestInputError, readOptionalIsoDate, readOptionalText, readRecord } from '../utils/requestInput';

/** Tamanhos das colunas de `contas`. */
const MAX_LEGAL_NAME_LENGTH = 150;
const MAX_STREET_LENGTH = 200;
const MAX_NUMBER_LENGTH = 20;
const MAX_COMPLEMENT_LENGTH = 200;
const MAX_DISTRICT_LENGTH = 100;
const MAX_CITY_LENGTH = 100;
const MAX_PHONE_LENGTH = 20;
const MAX_EMAIL_LENGTH = 255;
const ZIP_CODE_DIGITS = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CompanyUpdateInput {
  legalName?: string;
  tradeName?: string | null;
  /** AAAA-MM-DD. */
  openingDate?: string | null;
  size?: CompanySize | null;
  legalType?: LegalType | null;
  /** Só os 8 dígitos. */
  zipCode?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  /** UF em maiúsculas. */
  state?: string | null;
  phone?: string | null;
  /** Em minúsculas. */
  email?: string | null;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function readLegalName(value: unknown): string {
  const legalName = typeof value === 'string' ? value.trim() : '';
  if (!legalName) {
    throw new RequestInputError('Informe a razão social');
  }
  if (legalName.length > MAX_LEGAL_NAME_LENGTH) {
    throw new RequestInputError(`Razão social: até ${MAX_LEGAL_NAME_LENGTH} caracteres`);
  }
  return legalName;
}

/** Código de uma das listas do módulo; vazio é "nenhum". */
function readListCode<T extends string>(value: unknown, allowed: readonly string[], message: string): T | null {
  if (isBlank(value)) {
    return null;
  }
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new RequestInputError(message);
  }
  return value as T;
}

function readZipCode(value: unknown): string | null {
  if (isBlank(value)) {
    return null;
  }
  const digits = typeof value === 'string' ? value.replace(/\D/g, '') : '';
  if (digits.length !== ZIP_CODE_DIGITS) {
    throw new RequestInputError('CEP inválido');
  }
  return digits;
}

function readState(value: unknown): string | null {
  if (isBlank(value)) {
    return null;
  }
  const state = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!(BRAZILIAN_STATES as readonly string[]).includes(state)) {
    throw new RequestInputError('UF inválida');
  }
  return state;
}

function readEmail(value: unknown): string | null {
  if (isBlank(value)) {
    return null;
  }
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH) {
    throw new RequestInputError('Informe um e-mail válido');
  }
  return email;
}

export function readCompanyUpdateInput(body: unknown): CompanyUpdateInput {
  const record = readRecord(body, 'Pedido inválido');
  const input: CompanyUpdateInput = {};

  if (record['legalName'] !== undefined) {
    input.legalName = readLegalName(record['legalName']);
  }
  if (record['tradeName'] !== undefined) {
    input.tradeName = readOptionalText(record['tradeName'], 'Nome fantasia', MAX_LEGAL_NAME_LENGTH);
  }
  if (record['openingDate'] !== undefined) {
    input.openingDate = readOptionalIsoDate(record['openingDate'] === '' ? null : record['openingDate'], 'Data de abertura inválida');
  }
  if (record['size'] !== undefined) {
    input.size = readListCode<CompanySize>(record['size'], COMPANY_SIZE_IDS, 'Porte inválido');
  }
  if (record['legalType'] !== undefined) {
    input.legalType = readListCode<LegalType>(record['legalType'], LEGAL_TYPE_IDS, 'Tipo jurídico inválido');
  }
  if (record['zipCode'] !== undefined) {
    input.zipCode = readZipCode(record['zipCode']);
  }
  if (record['street'] !== undefined) {
    input.street = readOptionalText(record['street'], 'Logradouro', MAX_STREET_LENGTH);
  }
  if (record['number'] !== undefined) {
    input.number = readOptionalText(record['number'], 'Número', MAX_NUMBER_LENGTH);
  }
  if (record['complement'] !== undefined) {
    input.complement = readOptionalText(record['complement'], 'Complemento', MAX_COMPLEMENT_LENGTH);
  }
  if (record['district'] !== undefined) {
    input.district = readOptionalText(record['district'], 'Bairro', MAX_DISTRICT_LENGTH);
  }
  if (record['city'] !== undefined) {
    input.city = readOptionalText(record['city'], 'Cidade', MAX_CITY_LENGTH);
  }
  if (record['state'] !== undefined) {
    input.state = readState(record['state']);
  }
  if (record['phone'] !== undefined) {
    input.phone = readOptionalText(record['phone'], 'Telefone', MAX_PHONE_LENGTH);
  }
  if (record['email'] !== undefined) {
    input.email = readEmail(record['email']);
  }

  if (Object.keys(input).length === 0) {
    throw new RequestInputError('Informe o que alterar');
  }
  return input;
}
