// Leitura e validação do cadastro de cliente de uma conta PJ (POST e PUT
// /api/clients) e dos filtros da lista. Sem acesso ao banco: o documento
// repetido na conta é conferido no serviço, pelo índice único.
import { isValidCnpj, isValidCpf } from '../middleware/validation';
import {
  BRAZIL_STATES, EMAIL_PATTERN, RequestInputError, digitsOf, readOptionalText, readQueryText, readRecord,
  readRequiredText,
} from '../utils/requestInput';
import {
  CLIENT_KINDS, CLIENT_LIST_STATUSES, GOVERNMENT_SPHERES,
  type ClientKind, type ClientListStatus, type GovernmentSphere,
} from './contractTypes';

const MAX_NAME = 150;
const MAX_AGENCY = 150;
const MAX_CONTACT_NAME = 100;
const MAX_EMAIL = 150;
const MAX_SEARCH = 100;

export interface ClientInput {
  type: ClientKind;
  name: string;
  /** Só dígitos: CPF na pessoa física, CNPJ na empresa e no órgão público. */
  document: string;
  /** Só no órgão público; nulo nos outros tipos. */
  sphere: GovernmentSphere | null;
  agency: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
}

export interface ClientListQuery {
  search: string;
  type: ClientKind | null;
  status: ClientListStatus;
}

function isClientKind(value: unknown): value is ClientKind {
  return CLIENT_KINDS.some((kind) => kind === value);
}

function isGovernmentSphere(value: unknown): value is GovernmentSphere {
  return GOVERNMENT_SPHERES.some((sphere) => sphere === value);
}

function isClientListStatus(value: unknown): value is ClientListStatus {
  return CLIENT_LIST_STATUSES.some((status) => status === value);
}

export function documentLabel(type: ClientKind): 'CPF' | 'CNPJ' {
  return type === 'pessoa_fisica' ? 'CPF' : 'CNPJ';
}

function readDocument(value: unknown, type: ClientKind): string {
  const document = digitsOf(value);
  const label = documentLabel(type);
  if (!document) {
    throw new RequestInputError(`Informe o ${label}`);
  }
  const valid = type === 'pessoa_fisica' ? isValidCpf(document) : isValidCnpj(document);
  if (!valid) {
    throw new RequestInputError(`${label} inválido`);
  }
  return document;
}

function readEmail(value: unknown): string | null {
  const email = readOptionalText(value, 'E-mail', MAX_EMAIL)?.toLowerCase() ?? null;
  if (email !== null && !EMAIL_PATTERN.test(email)) {
    throw new RequestInputError('E-mail inválido');
  }
  return email;
}

function readPhone(value: unknown): string | null {
  const phone = digitsOf(value);
  if (!phone) {
    return null;
  }
  if (phone.length !== 10 && phone.length !== 11) {
    throw new RequestInputError('Telefone inválido: informe o DDD e o número');
  }
  return phone;
}

function readZipCode(value: unknown): string | null {
  const zipCode = digitsOf(value);
  if (!zipCode) {
    return null;
  }
  if (zipCode.length !== 8) {
    throw new RequestInputError('CEP inválido');
  }
  return zipCode;
}

function readState(value: unknown): string | null {
  const state = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!state) {
    return null;
  }
  if (!BRAZIL_STATES.has(state)) {
    throw new RequestInputError('UF inválida');
  }
  return state;
}

/** Corpo do POST e do PUT /api/clients. Contato e endereço são opcionais, mas validados quando vêm. */
export function readClientInput(body: unknown): ClientInput {
  const record = readRecord(body, 'Dados do cliente inválidos');
  const type = record['type'];
  if (!isClientKind(type)) {
    throw new RequestInputError('Escolha o tipo do cliente: pessoa física, empresa ou órgão público');
  }
  const name = readRequiredText(record['name'], 'o nome', 2, MAX_NAME);
  const document = readDocument(record['document'], type);

  let sphere: GovernmentSphere | null = null;
  let agency: string | null = null;
  if (type === 'orgao_publico') {
    if (!isGovernmentSphere(record['sphere'])) {
      throw new RequestInputError('Informe a esfera: municipal, estadual ou federal');
    }
    sphere = record['sphere'];
    agency = readRequiredText(record['agency'], 'o órgão ou secretaria', 2, MAX_AGENCY);
  }

  return {
    type,
    name,
    document,
    sphere,
    agency,
    contactName: readOptionalText(record['contactName'], 'Nome do contato', MAX_CONTACT_NAME),
    contactEmail: readEmail(record['contactEmail']),
    contactPhone: readPhone(record['contactPhone']),
    zipCode: readZipCode(record['zipCode']),
    street: readOptionalText(record['street'], 'Rua', 150),
    number: readOptionalText(record['number'], 'Número', 20),
    complement: readOptionalText(record['complement'], 'Complemento', 80),
    district: readOptionalText(record['district'], 'Bairro', 80),
    city: readOptionalText(record['city'], 'Cidade', 80),
    state: readState(record['state']),
  };
}

/** Corpo do PUT /api/clients/:id/active. */
export function readClientActiveInput(body: unknown): boolean {
  const record = readRecord(body, 'Situação inválida');
  const active = record['active'];
  if (typeof active !== 'boolean') {
    throw new RequestInputError('Situação inválida');
  }
  return active;
}

/** Filtros do GET /api/clients: sem situação, mostra os ativos. */
export function readClientListQuery(query: Record<string, unknown>): ClientListQuery {
  const type = readQueryText(query['type']);
  if (type && !isClientKind(type)) {
    throw new RequestInputError('Tipo de cliente inválido');
  }
  const status = readQueryText(query['status']) || 'active';
  if (!isClientListStatus(status)) {
    throw new RequestInputError('Situação inválida');
  }
  return {
    search: readQueryText(query['search']).slice(0, MAX_SEARCH),
    type: isClientKind(type) ? type : null,
    status,
  };
}
