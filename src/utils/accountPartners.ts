// Linhas da seção "Sócios" do modal da conta PJ: totais, conferência antes de
// salvar e o campo `socios` do pedido. O servidor confere as mesmas regras,
// com as mesmas mensagens (backend/src/services/accountPartnersInput.ts).
import type { AccountPartner, AccountPartnerSaveValue } from '../services/partnersService';

export const MAX_PARTNERS_PER_ACCOUNT = 50;
const MAX_PARTNER_NAME_LENGTH = 100;
/** 100,00% em centésimos de ponto percentual. */
export const FULL_PARTICIPATION_HUNDREDTHS = 10_000;
/** Mesmo teto do servidor: o capital precisa caber numa receita. */
const MAX_CAPITAL = 99_999_999.99;

export interface PartnerRow {
  /** Chave da linha na tela: o sócio novo ainda não tem id. */
  key: string;
  id?: number;
  nome: string;
  /** Participação como digitada ("33,33" ou "33.33"). */
  percentual: string;
  capital: number | undefined;
  launchAsIncome: boolean;
  /** Capital já lançado como receita: fica travado. */
  launched: boolean;
  /** Data da receita do capital (AAAA-MM-DD). */
  launchedAt: string | null;
}

export interface PartnersTotals {
  percentHundredths: number;
  capital: number;
}

let newRowSequence = 0;

export function newPartnerRow(): PartnerRow {
  newRowSequence += 1;
  return {
    key: `new-partner-${newRowSequence}`,
    nome: '',
    percentual: '',
    capital: undefined,
    launchAsIncome: false,
    launched: false,
    launchedAt: null,
  };
}

/** 60 → "60"; 33.33 → "33,33". */
function formatPercentInput(value: number): string {
  return String(value).replace('.', ',');
}

export function partnerRowFromApi(partner: AccountPartner): PartnerRow {
  const capital = Number(partner.capital_inicial);
  return {
    key: `partner-${partner.id}`,
    id: partner.id,
    nome: partner.nome,
    percentual: formatPercentInput(Number(partner.percentual)),
    capital: capital > 0 ? capital : undefined,
    launchAsIncome: false,
    launched: partner.capital_lancado,
    launchedAt: partner.capital_lancado_em,
  };
}

/** "33,33" ou "33.33" → 33.33. Vazio ou inválido → NaN. */
export function parsePercentInput(text: string): number {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return Number.NaN;
  }
  return Number(normalized);
}

function roundToHundredths(value: number): number {
  return Math.round(value * 100) / 100;
}

export function partnersTotals(rows: readonly PartnerRow[]): PartnersTotals {
  let percentHundredths = 0;
  let capital = 0;
  for (const row of rows) {
    const percentage = parsePercentInput(row.percentual);
    if (Number.isFinite(percentage)) {
      percentHundredths += Math.round(percentage * 100);
    }
    capital += row.capital ?? 0;
  }
  return { percentHundredths, capital: roundToHundredths(capital) };
}

/** Primeiro problema das linhas, com o texto do servidor, ou null. */
export function validatePartnerRows(rows: readonly PartnerRow[]): string | null {
  if (rows.length > MAX_PARTNERS_PER_ACCOUNT) {
    return `Até ${MAX_PARTNERS_PER_ACCOUNT} sócios por conta`;
  }

  for (const row of rows) {
    const name = row.nome.trim();
    if (!name) {
      return 'Informe o nome do sócio';
    }
    if (name.length > MAX_PARTNER_NAME_LENGTH) {
      return `Nome do sócio: até ${MAX_PARTNER_NAME_LENGTH} caracteres`;
    }

    const percentage = roundToHundredths(parsePercentInput(row.percentual));
    if (!(percentage >= 0.01 && percentage <= 100)) {
      return `Participação de ${name}: de 0,01% a 100%`;
    }

    if (!row.launched) {
      const capital = row.capital ?? 0;
      if (capital < 0 || capital > MAX_CAPITAL) {
        return `Capital de ${name} inválido`;
      }
      if (row.launchAsIncome && capital <= 0) {
        return `Informe o capital de ${name} para lançar como receita`;
      }
    }
  }

  if (rows.length > 0 && partnersTotals(rows).percentHundredths !== FULL_PARTICIPATION_HUNDREDTHS) {
    return 'A soma das participações precisa dar 100%';
  }
  return null;
}

/** Campo `socios` do pedido: a lista completa dos sócios, como ficou na tela. */
export function buildPartnersPayload(rows: readonly PartnerRow[]): AccountPartnerSaveValue[] {
  return rows.map((row) => ({
    ...(row.id !== undefined ? { id: row.id } : {}),
    nome: row.nome.trim(),
    percentual: roundToHundredths(parsePercentInput(row.percentual)),
    capital_inicial: row.capital ?? 0,
    // Já lançado não lança de novo: o capital é uma vez só.
    lancar_como_receita: !row.launched && row.launchAsIncome,
  }));
}

/** "2026-10-02" → "02/10/2026", sem passar por fuso horário. */
export function formatIsoDateBR(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}
