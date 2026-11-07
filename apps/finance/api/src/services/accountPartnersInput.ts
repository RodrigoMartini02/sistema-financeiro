// Leitura dos sócios que o modal da conta PJ manda junto com a conta (campo
// `socios` de POST/PUT /api/contas). Sem acesso ao banco: os ids são
// conferidos contra a conta e o dono em accountPartners.ts.
import { MAX_AMOUNT, RequestInputError, readRecord, roundCents } from '../utils/requestInput';

export const MAX_PARTNERS_PER_ACCOUNT = 50;
/** socios.nome: varchar(100). */
const MAX_PARTNER_NAME_LENGTH = 100;
/** 100,00% em centésimos de ponto percentual. */
const FULL_PARTICIPATION_HUNDREDTHS = 10_000;

export interface AccountPartnerInput {
  /** null: sócio novo. */
  id: number | null;
  name: string;
  /** Participação em %, com 2 casas. */
  percentage: number;
  initialCapital: number;
  /** Lançar o capital como receita (uma vez só; ignorado se já foi lançado). */
  launchAsIncome: boolean;
}

function readPartnerId(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new RequestInputError('Sócio inválido');
  }
  return value;
}

function readPartnerName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) {
    throw new RequestInputError('Informe o nome do sócio');
  }
  if (name.length > MAX_PARTNER_NAME_LENGTH) {
    throw new RequestInputError(`Nome do sócio: até ${MAX_PARTNER_NAME_LENGTH} caracteres`);
  }
  return name;
}

function readPercentage(value: unknown, name: string): number {
  const percentage = typeof value === 'number' && Number.isFinite(value) ? roundCents(value) : Number.NaN;
  if (!(percentage >= 0.01 && percentage <= 100)) {
    throw new RequestInputError(`Participação de ${name}: de 0,01% a 100%`);
  }
  return percentage;
}

function readInitialCapital(value: unknown, name: string): number {
  if (value === undefined || value === null) {
    return 0;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_AMOUNT) {
    throw new RequestInputError(`Capital de ${name} inválido`);
  }
  return roundCents(value);
}

function readLaunchAsIncome(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value !== 'boolean') {
    throw new RequestInputError('Sócio inválido');
  }
  return value;
}

function readPartner(value: unknown): AccountPartnerInput {
  const record = readRecord(value, 'Sócio inválido');
  const name = readPartnerName(record['nome']);
  const partner: AccountPartnerInput = {
    id: readPartnerId(record['id']),
    name,
    percentage: readPercentage(record['percentual'], name),
    initialCapital: readInitialCapital(record['capital_inicial'], name),
    launchAsIncome: readLaunchAsIncome(record['lancar_como_receita']),
  };
  if (partner.launchAsIncome && partner.initialCapital <= 0) {
    throw new RequestInputError(`Informe o capital de ${name} para lançar como receita`);
  }
  return partner;
}

/**
 * Lista completa dos sócios ativos da conta, como ficou no modal. Ausente
 * (undefined): o pedido não mexe nos sócios. Com algum sócio, a soma das
 * participações precisa dar exatamente 100%.
 */
export function readAccountPartnersInput(value: unknown): AccountPartnerInput[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new RequestInputError('Sócios inválidos');
  }
  if (value.length > MAX_PARTNERS_PER_ACCOUNT) {
    throw new RequestInputError(`Até ${MAX_PARTNERS_PER_ACCOUNT} sócios por conta`);
  }

  const partners = value.map(readPartner);

  const ids = partners.flatMap((partner) => (partner.id === null ? [] : [partner.id]));
  if (new Set(ids).size !== ids.length) {
    throw new RequestInputError('Sócio repetido na lista');
  }

  const totalHundredths = partners.reduce((sum, partner) => sum + Math.round(partner.percentage * 100), 0);
  if (partners.length > 0 && totalHundredths !== FULL_PARTICIPATION_HUNDREDTHS) {
    throw new RequestInputError('A soma das participações precisa dar 100%');
  }

  return partners;
}
