import { z } from 'zod/v4';
import type { CnaeEntry } from '../db/identity';
import {
  BRAZILIAN_STATES,
  REGISTRATION_STATUSES,
  type CompanySize,
  type LegalType,
  type RegistrationStatus,
} from '../domains';
import { isValidIsoDate } from '../utils/requestInput';

// Consulta cadastral do CNPJ para o perfil da empresa (item 1C): busca os dados públicos da Receita na BrasilAPI e os
// traz nos campos e nas listas do módulo. Só o CNPJ da própria conta é consultado (quem chama passa os 14 dígitos
// gravados na conta, nunca texto do cliente), e nada do que a fonte devolve fora dos campos abaixo é guardado: o
// quadro societário (nomes de pessoas), por exemplo, é descartado já na leitura da resposta.

/** Endereço da fonte, sem chave. O servidor não precisa de variável de ambiente para usá-la. */
export const BRASILAPI_CNPJ_URL = 'https://brasilapi.com.br/api/cnpj/v1';
/**
 * A fonte recusa (403) o pedido com o User-Agent padrão do Node, que o `fetch` manda sozinho (ensaio de 2026-11-10 com
 * dois CNPJs públicos: 403 sem ele, 200 com ele). O nome só diz o que o cliente é: sem nome de produto, de empresa
 * nem dado de ninguém.
 */
export const LOOKUP_USER_AGENT = 'company-lookup/1.0';
export const LOOKUP_TIMEOUT_MS = 10_000;
export const LOOKUP_MAX_ATTEMPTS = 2;
const LOOKUP_RETRY_DELAY_MS = 1_000;
const MAX_SECONDARY_CNAES = 300;

/** O CNPJ não existe na base da fonte (ou ela o recusa como inválido). */
export class CompanyNotFoundError extends Error {
  constructor() {
    super('CNPJ not found by the lookup source');
    this.name = 'CompanyNotFoundError';
  }
}

/** A fonte não respondeu a contento: fora do ar, limite de uso, tempo esgotado ou resposta inesperada. */
export class CompanyLookupUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'CompanyLookupUnavailableError';
  }
}

/**
 * O que a Receita informa sobre a empresa, nos campos do perfil. Texto vazio ou ausente na fonte vira `null`
 * ("a fonte não informou"): quem aplica a consulta nunca apaga um dado por causa disso.
 */
export interface CompanyLookup {
  legalName: string;
  tradeName: string | null;
  openingDate: string | null;
  size: CompanySize | null;
  legalType: LegalType | null;
  legalNatureCode: string | null;
  legalNature: string | null;
  registrationStatus: RegistrationStatus | null;
  registrationStatusDate: string | null;
  mainCnae: CnaeEntry | null;
  /** `null`: a fonte não trouxe a lista. Lista vazia: a empresa não tem CNAE secundário. */
  secondaryCnaes: CnaeEntry[] | null;
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
}

/** O que a API usa da fonte; os testes trocam por uma simulada. */
export interface CompanyLookupSource {
  /** `cnpj`: os 14 dígitos, sem pontuação. */
  lookup(cnpj: string): Promise<CompanyLookup>;
}

// A resposta é lida por um esquema tolerante: campo ausente ou nulo é "não informado", e o que não está aqui (o quadro
// societário, o regime tributário, o capital social...) é descartado pelo próprio esquema.
const optionalText = z.string().nullish();
const textOrNumber = z.union([z.string(), z.number()]).nullish();

const brasilApiCompanySchema = z.object({
  razao_social: optionalText,
  nome_fantasia: optionalText,
  data_inicio_atividade: optionalText,
  opcao_pelo_mei: z.boolean().nullish(),
  data_exclusao_do_mei: optionalText,
  codigo_porte: textOrNumber,
  codigo_natureza_juridica: textOrNumber,
  natureza_juridica: optionalText,
  situacao_cadastral: textOrNumber,
  descricao_situacao_cadastral: optionalText,
  data_situacao_cadastral: optionalText,
  cnae_fiscal: textOrNumber,
  cnae_fiscal_descricao: optionalText,
  cnaes_secundarios: z.array(z.object({ codigo: textOrNumber, descricao: optionalText })).nullish(),
  cep: textOrNumber,
  descricao_tipo_de_logradouro: optionalText,
  logradouro: optionalText,
  numero: textOrNumber,
  complemento: optionalText,
  bairro: optionalText,
  municipio: optionalText,
  uf: optionalText,
  ddd_telefone_1: textOrNumber,
  ddd_telefone_2: textOrNumber,
  email: optionalText,
});

type BrasilApiCompany = z.infer<typeof brasilApiCompanySchema>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Texto aparado, com os espaços repetidos unidos e cortado no tamanho da coluna; vazio vira null. */
function cleanText(value: unknown, maxLength: number): string | null {
  const raw = typeof value === 'number' ? String(value) : value;
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.replace(/\s+/g, ' ').trim();
  return text === '' ? null : text.slice(0, maxLength);
}

function digitsOf(value: unknown): string {
  const raw = typeof value === 'number' ? String(value) : value;
  return typeof raw === 'string' ? raw.replace(/\D/g, '') : '';
}

function isoDate(value: unknown): string | null {
  return typeof value === 'string' && isValidIsoDate(value) ? value : null;
}

/** MEI vem da opção da Receita (e some se ela já foi excluída); ME, EPP e Demais, do código de porte (1, 3 e 5). */
function mapCompanySize(data: BrasilApiCompany): CompanySize | null {
  if (data.opcao_pelo_mei === true && cleanText(data.data_exclusao_do_mei, 10) === null) {
    return 'MEI';
  }
  const code = digitsOf(data.codigo_porte);
  if (code === '1') return 'ME';
  if (code === '3') return 'EPP';
  if (code === '5') return 'DEMAIS';
  return null;
}

/**
 * Natureza jurídica da Receita (tabela do IBGE/Concla) nos tipos do módulo: 2062 sociedade empresária limitada,
 * 2305 EIRELI, 2046 e 2054 sociedade anônima aberta e fechada. Qualquer outro código é "Outros"; sem código, nada.
 * SLU não tem código próprio (a Receita a informa como limitada): é ajuste manual.
 */
const LEGAL_TYPE_BY_NATURE_CODE: Readonly<Record<string, LegalType>> = {
  '2062': 'LTDA',
  '2305': 'EIRELI',
  '2046': 'SA',
  '2054': 'SA',
};

function mapLegalType(code: unknown): LegalType | null {
  const digits = digitsOf(code);
  if (digits === '' || /^0+$/.test(digits)) {
    return null;
  }
  return LEGAL_TYPE_BY_NATURE_CODE[digits] ?? 'OUTROS';
}

const REGISTRATION_STATUS_BY_CODE: Readonly<Record<string, RegistrationStatus>> = {
  '1': 'NULA',
  '2': 'ATIVA',
  '3': 'SUSPENSA',
  '4': 'INAPTA',
  '8': 'BAIXADA',
};

/** Pela descrição da fonte ("ATIVA") e, se ela não casar com a lista, pelo código da Receita. */
function mapRegistrationStatus(description: unknown, code: unknown): RegistrationStatus | null {
  const label = cleanText(description, 20)?.toUpperCase();
  const byLabel = REGISTRATION_STATUSES.find((status) => status === label);
  return byLabel ?? REGISTRATION_STATUS_BY_CODE[digitsOf(code)] ?? null;
}

/** CNAE com 7 dígitos; código 0 ou vazio ("sem CNAE") não vale. */
function cnaeEntry(code: unknown, description: unknown): CnaeEntry | null {
  const digits = digitsOf(code);
  if (digits === '' || digits.length > 7 || /^0+$/.test(digits)) {
    return null;
  }
  return { code: digits.padStart(7, '0'), description: cleanText(description, 255) ?? '' };
}

function secondaryCnaes(list: BrasilApiCompany['cnaes_secundarios']): CnaeEntry[] | null {
  if (list === null || list === undefined) {
    return null;
  }
  const byCode = new Map<string, CnaeEntry>();
  for (const item of list) {
    const entry = cnaeEntry(item.codigo, item.descricao);
    if (entry && !byCode.has(entry.code)) {
      byCode.set(entry.code, entry);
    }
  }
  return [...byCode.values()].slice(0, MAX_SECONDARY_CNAES);
}

/** Tipo e nome do logradouro juntos ("AVENIDA BRIG FARIA LIMA"), sem repetir o tipo quando o nome já começa com ele. */
function composeStreet(kind: unknown, name: unknown): string | null {
  const street = cleanText(name, 200);
  if (street === null) {
    return null;
  }
  const type = cleanText(kind, 60);
  const text = type !== null && !street.toUpperCase().startsWith(type.toUpperCase()) ? `${type} ${street}` : street;
  return text.slice(0, 200);
}

function zipCodeOf(value: unknown): string | null {
  const digits = digitsOf(value);
  if (digits.length === 7) {
    return `0${digits}`;
  }
  return digits.length === 8 ? digits : null;
}

function stateOf(value: unknown): string | null {
  const state = cleanText(value, 2)?.toUpperCase();
  return state !== undefined && state !== null && (BRAZILIAN_STATES as readonly string[]).includes(state) ? state : null;
}

/** "(11) 2395-8400" ou "(11) 98765-4321"; número sem 10 ou 11 dígitos não vale. */
function formatPhone(value: unknown): string | null {
  const digits = digitsOf(value);
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return null;
}

function emailOf(value: unknown): string | null {
  const email = cleanText(value, 255)?.toLowerCase();
  return email !== undefined && email !== null && EMAIL_PATTERN.test(email) ? email : null;
}

/**
 * Lê a resposta da fonte nos campos do módulo. Resposta que não é um objeto, ou sem razão social, é "indisponível":
 * a fonte mudou ou falhou, e não há o que aplicar.
 */
export function normalizeCompanyLookup(payload: unknown): CompanyLookup {
  const parsed = brasilApiCompanySchema.safeParse(payload);
  if (!parsed.success) {
    throw new CompanyLookupUnavailableError('Unexpected response format');
  }
  const data = parsed.data;
  const legalName = cleanText(data.razao_social, 150);
  if (legalName === null) {
    throw new CompanyLookupUnavailableError('Response without a legal name');
  }

  return {
    legalName,
    tradeName: cleanText(data.nome_fantasia, 150),
    openingDate: isoDate(data.data_inicio_atividade),
    size: mapCompanySize(data),
    legalType: mapLegalType(data.codigo_natureza_juridica),
    legalNatureCode: digitsOf(data.codigo_natureza_juridica).slice(0, 4) || null,
    legalNature: cleanText(data.natureza_juridica, 150),
    registrationStatus: mapRegistrationStatus(data.descricao_situacao_cadastral, data.situacao_cadastral),
    registrationStatusDate: isoDate(data.data_situacao_cadastral),
    mainCnae: cnaeEntry(data.cnae_fiscal, data.cnae_fiscal_descricao),
    secondaryCnaes: secondaryCnaes(data.cnaes_secundarios),
    zipCode: zipCodeOf(data.cep),
    street: composeStreet(data.descricao_tipo_de_logradouro, data.logradouro),
    number: cleanText(data.numero, 20),
    complement: cleanText(data.complemento, 200),
    district: cleanText(data.bairro, 100),
    city: cleanText(data.municipio, 100),
    state: stateOf(data.uf),
    phone: formatPhone(data.ddd_telefone_1) ?? formatPhone(data.ddd_telefone_2),
    email: emailOf(data.email),
  };
}

export interface BrasilApiSourceOptions {
  baseUrl?: string;
  /** Para os testes; o servidor usa o `fetch` do Node. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
}

const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/**
 * A fonte de verdade: a BrasilAPI. Cada tentativa tem tempo limite; 5xx, 429, tempo esgotado e erro de rede ganham
 * mais uma tentativa curta, e depois disso viram "indisponível". 404 e 400 (CNPJ que a fonte não conhece) viram
 * "não encontrado" na hora. O corpo das respostas de erro nunca é lido, e o da boa só passa pelo esquema acima.
 */
export function createBrasilApiCompanySource(options: BrasilApiSourceOptions = {}): CompanyLookupSource {
  const baseUrl = options.baseUrl ?? BRASILAPI_CNPJ_URL;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? LOOKUP_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? LOOKUP_MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? LOOKUP_RETRY_DELAY_MS;

  return {
    async lookup(cnpj) {
      // O endereço só é montado com 14 dígitos: nada que o cliente escreva chega à URL da fonte.
      if (!/^\d{14}$/.test(cnpj)) {
        throw new Error('The lookup needs the CNPJ as 14 digits');
      }

      let reason = 'No attempt was made';
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (attempt > 1 && retryDelayMs > 0) {
          await delay(retryDelayMs);
        }

        let response: Response;
        try {
          response = await fetchImpl(`${baseUrl}/${cnpj}`, {
            headers: { accept: 'application/json', 'user-agent': LOOKUP_USER_AGENT },
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (error) {
          reason = `Request failed (${error instanceof Error ? error.name : 'unknown'})`;
          continue;
        }

        if (response.status === 404 || response.status === 400) {
          throw new CompanyNotFoundError();
        }
        if (response.status === 429 || response.status >= 500) {
          reason = `HTTP ${response.status}`;
          continue;
        }
        if (!response.ok) {
          throw new CompanyLookupUnavailableError(`HTTP ${response.status}`);
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          reason = 'Response was not valid JSON';
          continue;
        }
        return normalizeCompanyLookup(payload);
      }
      throw new CompanyLookupUnavailableError(reason);
    },
  };
}
