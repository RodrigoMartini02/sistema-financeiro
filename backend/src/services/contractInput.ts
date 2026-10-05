// Leitura e validação do contrato (criar, alterar, prévia e aditivo), do
// reajuste e do catálogo de serviços. Sem acesso ao banco: cliente,
// representante, categorias e serviços são conferidos na conta pelo serviço.
import {
  RequestInputError, readAmount, readIsoDate, readOptionalId, readOptionalIsoDate, readOptionalText, readRecord,
  readRequiredText, roundCents,
} from '../utils/requestInput';
import {
  CHARGE_LABELS, MAX_INSTALLMENTS, WITHHOLDING_LABELS, WITHHOLDING_TAXES,
  type InstallmentChargeKind, type WithholdingRates,
} from './contractTypes';

const MAX_CONTRACT_NUMBER = 50;
const MAX_DESCRIPTION = 255;
const MAX_NOTES = 2000;
const MAX_PROCESS = 100;
const MAX_MODALITY = 100;
const MAX_HOUR_TYPES = 20;
const MAX_HOUR_TYPE_NAME = 60;
/** numeric(10,2) da quantidade de horas. */
const MAX_HOURS = 99_999_999.99;
const MAX_SERVICES = 100;
const MAX_COMMITMENTS = 30;
const MAX_COMMITMENT_NUMBER = 50;
/** numeric(14,2) do valor do empenho. */
const MAX_COMMITMENT_AMOUNT = 999_999_999_999.99;
const MIN_COMMITMENT_YEAR = 2000;
const MAX_COMMITMENT_YEAR = 2100;
const MAX_DUE_DAY = 28;
const MAX_SERVICE_NAME = 150;

/** Implantação ou projeto: valor total em parcelas mensais, a primeira na data informada. */
export interface InstallmentChargeInput {
  amount: number;
  installments: number;
  firstDate: string;
}

export interface HourTypeInput {
  /** Tipo já gravado (alteração do contrato); nulo num tipo novo. */
  id: number | null;
  name: string;
  hourlyRate: number;
  quantity: number;
}

export interface CommitmentInput {
  year: number;
  number: string;
  amount: number;
}

export interface ContractServiceInput {
  serviceId: number;
  deployed: boolean;
}

/** Campos que só existem no contrato com órgão público. */
export interface PublicEntityTermsInput {
  process: string | null;
  modality: string | null;
  withholdings: WithholdingRates;
  commitments: CommitmentInput[];
}

export interface ContractInput {
  number: string | null;
  description: string | null;
  notes: string | null;
  startDate: string;
  /** Nula: sem prazo. */
  endDate: string | null;
  dueDay: number;
  monthlyFee: number | null;
  setupFee: InstallmentChargeInput | null;
  projectFee: InstallmentChargeInput | null;
  hourTypes: HourTypeInput[];
  representativeId: number | null;
  monthlyClassificationId: number | null;
  setupClassificationId: number | null;
  projectClassificationId: number | null;
  services: ContractServiceInput[];
  /** Sem data-base informada, vale o início do contrato. */
  readjustmentBaseDate: string;
  /** Nulo quando o cliente não é órgão público. */
  publicEntity: PublicEntityTermsInput | null;
}

export type ReadjustmentInput = { action: 'apply'; percent: number } | { action: 'dismiss' };

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/** Número maior que zero, até `max`, com duas casas. */
function readPositiveDecimal(value: unknown, message: string, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value > max) {
    throw new RequestInputError(message);
  }
  const rounded = roundCents(value);
  if (rounded <= 0) {
    throw new RequestInputError(message);
  }
  return rounded;
}

/** Percentual de 0 a 100 com até duas casas. */
function readPercent(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new RequestInputError(message);
  }
  const hundredths = value * 100;
  if (Math.abs(hundredths - Math.round(hundredths)) > 1e-6) {
    throw new RequestInputError(message);
  }
  return Math.round(hundredths) / 100;
}

function readInteger(value: unknown, min: number, max: number, message: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new RequestInputError(message);
  }
  return value;
}

function readList(value: unknown, max: number, invalidMessage: string, tooManyMessage: string): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new RequestInputError(invalidMessage);
  }
  if (value.length > max) {
    throw new RequestInputError(tooManyMessage);
  }
  return value;
}

function readInstallmentCharge(value: unknown, kind: InstallmentChargeKind): InstallmentChargeInput | null {
  if (value === undefined || value === null) {
    return null;
  }
  const label = CHARGE_LABELS[kind];
  const record = readRecord(value, `${label}: dados inválidos`);
  const amount = readAmount(record['amount'], `${label}: informe o valor total`);
  const installments = readInteger(
    record['installments'], 1, MAX_INSTALLMENTS, `${label}: parcelas de 1 a ${MAX_INSTALLMENTS}`,
  );
  // Cada parcela precisa de ao menos R$ 0,01.
  if (Math.round(amount * 100) < installments) {
    throw new RequestInputError(`${label}: o valor total não cobre as ${installments} parcelas`);
  }
  const firstDate = readIsoDate(record['firstDate'], `${label}: informe a data da primeira parcela`);
  return { amount, installments, firstDate };
}

function readHourTypes(value: unknown): HourTypeInput[] {
  const entries = readList(value, MAX_HOUR_TYPES, 'Banco de horas inválido', `Até ${MAX_HOUR_TYPES} tipos de hora por contrato`);
  const names = new Set<string>();
  const ids = new Set<number>();
  return entries.map((entry) => {
    const record = readRecord(entry, 'Tipo de hora inválido');
    const id = readOptionalId(record['id'], 'Tipo de hora inválido');
    if (id !== null) {
      if (ids.has(id)) {
        throw new RequestInputError('Tipo de hora inválido');
      }
      ids.add(id);
    }
    const name = readRequiredText(record['name'], 'o nome do tipo de hora', 1, MAX_HOUR_TYPE_NAME);
    const key = name.toLowerCase();
    if (names.has(key)) {
      throw new RequestInputError(`Tipo de hora repetido: ${name}`);
    }
    names.add(key);
    return {
      id,
      name,
      hourlyRate: readAmount(record['hourlyRate'], `${name}: informe o valor da hora`),
      quantity: readPositiveDecimal(record['quantity'], `${name}: informe a quantidade de horas`, MAX_HOURS),
    };
  });
}

function readServices(value: unknown): ContractServiceInput[] {
  const entries = readList(value, MAX_SERVICES, 'Serviços inválidos', `Até ${MAX_SERVICES} serviços por contrato`);
  const seen = new Set<number>();
  return entries.map((entry) => {
    const record = readRecord(entry, 'Serviço inválido');
    const serviceId = readOptionalId(record['serviceId'], 'Serviço inválido');
    const deployed = record['deployed'];
    if (serviceId === null || (deployed !== undefined && typeof deployed !== 'boolean')) {
      throw new RequestInputError('Serviço inválido');
    }
    if (seen.has(serviceId)) {
      throw new RequestInputError('Serviço repetido no contrato');
    }
    seen.add(serviceId);
    return { serviceId, deployed: deployed === true };
  });
}

function readWithholdings(value: unknown): WithholdingRates {
  if (value === undefined || value === null) {
    return {};
  }
  const record = readRecord(value, 'Retenções inválidas');
  const rates: WithholdingRates = {};
  for (const tax of WITHHOLDING_TAXES) {
    if (!isBlank(record[tax])) {
      rates[tax] = readPercent(record[tax], `Retenção de ${WITHHOLDING_LABELS[tax]}: de 0 a 100%, com até duas casas`);
    }
  }
  return rates;
}

function readCommitments(value: unknown): CommitmentInput[] {
  const entries = readList(value, MAX_COMMITMENTS, 'Empenhos inválidos', `Até ${MAX_COMMITMENTS} empenhos por contrato`);
  const years = new Set<number>();
  return entries.map((entry) => {
    const record = readRecord(entry, 'Empenho inválido');
    const year = readInteger(record['year'], MIN_COMMITMENT_YEAR, MAX_COMMITMENT_YEAR, 'Ano do empenho inválido');
    if (years.has(year)) {
      throw new RequestInputError(`Já existe um empenho de ${year} neste contrato`);
    }
    years.add(year);
    return {
      year,
      number: readRequiredText(record['number'], `o número do empenho de ${year}`, 1, MAX_COMMITMENT_NUMBER),
      amount: readPositiveDecimal(record['amount'], `Empenho de ${year}: informe o valor`, MAX_COMMITMENT_AMOUNT),
    };
  });
}

function readPublicEntityTerms(record: Record<string, unknown>): PublicEntityTermsInput {
  return {
    process: readOptionalText(record['process'], 'Processo', MAX_PROCESS),
    modality: readOptionalText(record['modality'], 'Modalidade', MAX_MODALITY),
    withholdings: readWithholdings(record['withholdings']),
    commitments: readCommitments(record['commitments']),
  };
}

/**
 * Corpo do POST e do PUT /api/contracts, da prévia e do aditivo. O cliente vem
 * à parte (fixo depois de criado); `publicEntity` diz se ele é órgão público:
 * sem isso, processo, modalidade, retenções e empenhos são ignorados.
 */
export function readContractInput(body: unknown, options: { publicEntity: boolean }): ContractInput {
  const record = readRecord(body, 'Dados do contrato inválidos');
  const startDate = readIsoDate(record['startDate'], 'Informe a data de início');
  const endDate = readOptionalIsoDate(isBlank(record['endDate']) ? null : record['endDate'], 'Data final inválida');
  if (endDate !== null && endDate < startDate) {
    throw new RequestInputError('A data final deve ser igual ou posterior ao início');
  }
  const dueDay = readInteger(record['dueDay'], 1, MAX_DUE_DAY, `Dia de vencimento: de 1 a ${MAX_DUE_DAY}`);

  const monthlyFee = isBlank(record['monthlyFee'])
    ? null
    : readAmount(record['monthlyFee'], 'Mensalidade: informe um valor maior que zero');
  const setupFee = readInstallmentCharge(record['setupFee'], 'implantacao');
  const projectFee = readInstallmentCharge(record['projectFee'], 'projeto');
  const hourTypes = readHourTypes(record['hourTypes']);
  if (monthlyFee === null && setupFee === null && projectFee === null && hourTypes.length === 0) {
    throw new RequestInputError('Informe ao menos uma cobrança: mensalidade, implantação, projeto ou banco de horas');
  }

  const readjustmentBaseDate = readOptionalIsoDate(
    isBlank(record['readjustmentBaseDate']) ? null : record['readjustmentBaseDate'],
    'Data-base do reajuste inválida',
  );

  return {
    number: readOptionalText(record['number'], 'Número do contrato', MAX_CONTRACT_NUMBER),
    description: readOptionalText(record['description'], 'Descrição', MAX_DESCRIPTION),
    notes: readOptionalText(record['notes'], 'Observações', MAX_NOTES),
    startDate,
    endDate,
    dueDay,
    monthlyFee,
    setupFee,
    projectFee,
    hourTypes,
    representativeId: readOptionalId(record['representativeId'], 'Representante inválido'),
    monthlyClassificationId: readOptionalId(record['monthlyClassificationId'], 'Categoria da mensalidade inválida'),
    setupClassificationId: readOptionalId(record['setupClassificationId'], 'Categoria da implantação inválida'),
    projectClassificationId: readOptionalId(record['projectClassificationId'], 'Categoria do projeto inválida'),
    services: readServices(record['services']),
    readjustmentBaseDate: readjustmentBaseDate ?? startDate,
    publicEntity: options.publicEntity ? readPublicEntityTerms(record) : null,
  };
}

/** O aditivo começa no início do contrato atual ou depois dele. */
export function assertAmendmentStart(previousStartDate: string, startDate: string): void {
  if (startDate < previousStartDate) {
    throw new RequestInputError('O aditivo não pode começar antes do início do contrato atual');
  }
}

/** Corpo do POST /api/contracts/:id/readjustment. */
export function readReadjustmentInput(body: unknown): ReadjustmentInput {
  const record = readRecord(body, 'Reajuste inválido');
  if (record['action'] === 'dismiss') {
    return { action: 'dismiss' };
  }
  if (record['action'] !== 'apply') {
    throw new RequestInputError('Reajuste inválido');
  }
  if (isBlank(record['percent'])) {
    throw new RequestInputError('Informe o percentual do reajuste');
  }
  return {
    action: 'apply',
    percent: readPercent(record['percent'], 'Percentual do reajuste: de 0 a 100%, com até duas casas'),
  };
}

/** Corpo do POST e do PUT /api/service-catalog. */
export function readCatalogServiceInput(body: unknown): { name: string } {
  const record = readRecord(body, 'Dados do serviço inválidos');
  return { name: readRequiredText(record['name'], 'o nome do serviço', 2, MAX_SERVICE_NAME) };
}
