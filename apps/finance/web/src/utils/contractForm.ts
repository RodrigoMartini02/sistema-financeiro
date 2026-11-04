// Estado do contrato em etapas (novo, alteração e aditivo): campos como a tela
// mostra (datas dd/mm/aaaa, valores em centavos, percentuais com vírgula), a
// conferência de cada etapa e o corpo que vai para a API. As mesmas regras do
// servidor (backend/src/services/contractInput.ts), para corrigir antes de enviar.
import type { ContractDetail, ContractRequest, WithholdingRates } from '../services/contractsService';
import { WITHHOLDING_LABELS, WITHHOLDING_TAXES, type WithholdingTax } from './contractDisplay';
import { brDateToIso, isoToBrDate } from './date';

export const MAX_DUE_DAY = 28;
export const MAX_INSTALLMENTS = 120;

export interface InstallmentDraft {
  enabled: boolean;
  totalCents: number | null;
  installments: string;
  /** dd/mm/aaaa. */
  firstDate: string;
}

export interface HourTypeDraft {
  key: string;
  /** Tipo já gravado (alteração); nulo no novo e no aditivo. */
  id: number | null;
  name: string;
  hourlyRateCents: number | null;
  quantity: string;
  /** Horas já lançadas (só na alteração): a quantidade não fica abaixo disso. */
  used: number;
}

export interface CommitmentDraft {
  key: string;
  year: string;
  number: string;
  amountCents: number | null;
}

export interface ContractDraft {
  number: string;
  description: string;
  notes: string;
  /** dd/mm/aaaa. */
  startDate: string;
  endDate: string;
  openEnded: boolean;
  dueDay: number;
  /** dd/mm/aaaa; vazio usa o início do contrato. */
  readjustmentBaseDate: string;
  monthly: { enabled: boolean; amountCents: number | null };
  setup: InstallmentDraft;
  project: InstallmentDraft;
  hourTypes: HourTypeDraft[];
  representativeId: number | null;
  monthlyClassificationId: number | null;
  setupClassificationId: number | null;
  projectClassificationId: number | null;
  services: Array<{ serviceId: number; deployed: boolean }>;
  process: string;
  modality: string;
  /** "4,80"; vazio é sem retenção daquele tributo. */
  withholdings: Record<WithholdingTax, string>;
  commitments: CommitmentDraft[];
}

export type WizardStep = 'term' | 'charges' | 'public' | 'options' | 'preview';

export const WIZARD_STEP_LABELS: Record<WizardStep, string> = {
  term: 'Vigência',
  charges: 'Cobranças',
  public: 'Órgão público',
  options: 'Mais opções',
  preview: 'Prévia',
};

/** Erros por campo: a chave é o nome do campo ("startDate", "hourTypes.2.name"). */
export type DraftErrors = Record<string, string>;

let nextKey = 0;
/** Chave estável das linhas que se acrescentam (tipo de hora, empenho). */
export function newRowKey(): string {
  nextKey += 1;
  return `linha-${nextKey}`;
}

const emptyInstallment = (): InstallmentDraft => ({ enabled: false, totalCents: null, installments: '1', firstDate: '' });

const emptyWithholdings = (): Record<WithholdingTax, string> => ({ ir: '', pisCofinsCsll: '', iss: '', inss: '' });

export function emptyHourType(): HourTypeDraft {
  return { key: newRowKey(), id: null, name: '', hourlyRateCents: null, quantity: '', used: 0 };
}

export function emptyCommitment(year: number): CommitmentDraft {
  return { key: newRowKey(), year: String(year), number: '', amountCents: null };
}

/** Contrato novo: começa hoje, com mensalidade e vencimento no dia 10. */
export function emptyContractDraft(todayIso: string): ContractDraft {
  return {
    number: '',
    description: '',
    notes: '',
    startDate: isoToBrDate(todayIso),
    endDate: '',
    openEnded: true,
    dueDay: 10,
    readjustmentBaseDate: '',
    monthly: { enabled: true, amountCents: null },
    setup: emptyInstallment(),
    project: emptyInstallment(),
    hourTypes: [],
    representativeId: null,
    monthlyClassificationId: null,
    setupClassificationId: null,
    projectClassificationId: null,
    services: [],
    process: '',
    modality: '',
    withholdings: emptyWithholdings(),
    commitments: [],
  };
}

const toCents = (value: number) => Math.round(value * 100);

function formatDecimal(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false });
}

function installmentFromDetail(charge: ContractDetail['setupFee']): InstallmentDraft {
  return charge
    ? { enabled: true, totalCents: toCents(charge.amount), installments: String(charge.installments), firstDate: isoToBrDate(charge.firstDate) }
    : emptyInstallment();
}

/** Primeiro dia do mês seguinte a hoje: o início sugerido do aditivo. */
export function nextMonthStart(todayIso: string): string {
  const [year, month] = todayIso.split('-').map(Number);
  return month === 12 ? `${year! + 1}-01-01` : `${year}-${String(month! + 1).padStart(2, '0')}-01`;
}

/**
 * Contrato gravado como etapas: na alteração, como está; no aditivo, os mesmos
 * termos, começando no mês seguinte, com o banco de horas no saldo inicial e os
 * empenhos pelo saldo atual.
 */
export function draftFromContract(contract: ContractDetail, mode: 'edit' | 'amendment', todayIso: string): ContractDraft {
  const amendment = mode === 'amendment';
  const startDate = amendment ? nextMonthStart(todayIso) : contract.startDate;
  const endDate = amendment && contract.endDate !== null && contract.endDate < startDate ? null : contract.endDate;
  const withholdings = emptyWithholdings();
  for (const tax of WITHHOLDING_TAXES) {
    const rate = contract.publicEntity?.withholdings[tax];
    if (rate !== undefined) {
      withholdings[tax] = rate.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
  }
  const commitments = (contract.publicEntity?.commitments ?? [])
    .map((commitment) => ({ ...commitment, amount: amendment ? commitment.balance : commitment.amount }))
    .filter((commitment) => commitment.amount > 0)
    .map((commitment) => ({
      key: newRowKey(), year: String(commitment.year), number: commitment.number, amountCents: toCents(commitment.amount),
    }));

  return {
    number: contract.number ?? '',
    description: contract.description ?? '',
    notes: contract.notes ?? '',
    startDate: isoToBrDate(startDate),
    endDate: endDate === null ? '' : isoToBrDate(endDate),
    openEnded: endDate === null,
    dueDay: contract.dueDay,
    readjustmentBaseDate: isoToBrDate(contract.readjustment.baseDate),
    monthly: { enabled: contract.monthlyFee !== null, amountCents: contract.monthlyFee === null ? null : toCents(contract.monthlyFee) },
    setup: installmentFromDetail(contract.setupFee),
    project: installmentFromDetail(contract.projectFee),
    hourTypes: contract.hourTypes.map((hourType) => ({
      key: newRowKey(),
      id: amendment ? null : hourType.id,
      name: hourType.name,
      hourlyRateCents: toCents(hourType.hourlyRate),
      quantity: formatDecimal(hourType.quantity),
      used: amendment ? 0 : hourType.used,
    })),
    representativeId: contract.representative?.id ?? null,
    monthlyClassificationId: contract.monthlyClassificationId,
    setupClassificationId: contract.setupClassificationId,
    projectClassificationId: contract.projectClassificationId,
    services: contract.services.map((service) => ({ serviceId: service.serviceId, deployed: service.deployed })),
    process: contract.publicEntity?.process ?? '',
    modality: contract.publicEntity?.modality ?? '',
    withholdings,
    commitments,
  };
}

/** Etapas do contrato: "Órgão público" só quando o cliente é órgão público. */
export function wizardSteps(publicEntity: boolean): WizardStep[] {
  return publicEntity ? ['term', 'charges', 'public', 'options', 'preview'] : ['term', 'charges', 'options', 'preview'];
}

/** "12,5" ou "12.5" → 12.5 (com vírgula, o ponto é milhar); vazio ou inválido → null. */
export function parseDecimal(text: string): number | null {
  const trimmed = text.trim();
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed;
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Percentual de 0 a 100 com até duas casas; vazio fica de fora (sem retenção). */
function parsePercent(text: string): number | null | 'invalid' {
  if (!text.trim()) return null;
  const value = parseDecimal(text);
  if (value === null || value < 0 || value > 100 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
    return 'invalid';
  }
  return value;
}

function checkInstallment(draft: InstallmentDraft, field: 'setup' | 'project', label: string, errors: DraftErrors): void {
  if (!draft.enabled) return;
  if (!draft.totalCents || draft.totalCents <= 0) {
    errors[`${field}.total`] = `${label}: informe o valor total`;
  }
  const installments = Number(draft.installments);
  if (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS) {
    errors[`${field}.installments`] = `${label}: parcelas de 1 a ${MAX_INSTALLMENTS}`;
  } else if (draft.totalCents && draft.totalCents < installments) {
    errors[`${field}.total`] = `${label}: o valor total não cobre as ${installments} parcelas`;
  }
  if (!brDateToIso(draft.firstDate)) {
    errors[`${field}.firstDate`] = `${label}: informe a data da primeira parcela`;
  }
}

/** Erros da etapa; vazio quando dá para seguir. */
export function validateStep(step: WizardStep, draft: ContractDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (step === 'term') {
    const start = brDateToIso(draft.startDate);
    if (!start) errors.startDate = 'Informe a data de início';
    if (!draft.openEnded) {
      const end = brDateToIso(draft.endDate);
      if (!end) errors.endDate = 'Informe a data final ou marque "Sem prazo"';
      else if (start && end < start) errors.endDate = 'A data final deve ser igual ou posterior ao início';
    }
    if (!Number.isInteger(draft.dueDay) || draft.dueDay < 1 || draft.dueDay > MAX_DUE_DAY) {
      errors.dueDay = `Dia de vencimento: de 1 a ${MAX_DUE_DAY}`;
    }
    if (draft.readjustmentBaseDate.trim() && !brDateToIso(draft.readjustmentBaseDate)) {
      errors.readjustmentBaseDate = 'Data-base do reajuste inválida';
    }
  }
  if (step === 'charges') {
    const hasCharge = draft.monthly.enabled || draft.setup.enabled || draft.project.enabled || draft.hourTypes.length > 0;
    if (!hasCharge) {
      errors.charges = 'Informe ao menos uma cobrança: mensalidade, implantação, projeto ou banco de horas';
    }
    if (draft.monthly.enabled && (!draft.monthly.amountCents || draft.monthly.amountCents <= 0)) {
      errors['monthly.amount'] = 'Mensalidade: informe um valor maior que zero';
    }
    checkInstallment(draft.setup, 'setup', 'Implantação', errors);
    checkInstallment(draft.project, 'project', 'Projeto', errors);
    const names = new Set<string>();
    draft.hourTypes.forEach((hourType, index) => {
      const name = hourType.name.trim();
      if (!name) {
        errors[`hourTypes.${index}.name`] = 'Informe o nome do tipo de hora';
      } else if (names.has(name.toLowerCase())) {
        errors[`hourTypes.${index}.name`] = `Tipo de hora repetido: ${name}`;
      }
      names.add(name.toLowerCase());
      if (!hourType.hourlyRateCents || hourType.hourlyRateCents <= 0) {
        errors[`hourTypes.${index}.hourlyRate`] = `${name || 'Tipo de hora'}: informe o valor da hora`;
      }
      const quantity = parseDecimal(hourType.quantity);
      if (quantity === null || quantity <= 0) {
        errors[`hourTypes.${index}.quantity`] = `${name || 'Tipo de hora'}: informe a quantidade de horas`;
      } else if (quantity < hourType.used) {
        errors[`hourTypes.${index}.quantity`] = `${name}: a quantidade não pode ficar abaixo das horas já lançadas`;
      }
    });
  }
  if (step === 'public') {
    for (const tax of WITHHOLDING_TAXES) {
      if (parsePercent(draft.withholdings[tax]) === 'invalid') {
        errors[`withholdings.${tax}`] = `Retenção de ${WITHHOLDING_LABELS[tax]}: de 0 a 100%, com até duas casas`;
      }
    }
    const years = new Set<string>();
    draft.commitments.forEach((commitment, index) => {
      const year = Number(commitment.year);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        errors[`commitments.${index}.year`] = 'Ano do empenho inválido';
      } else if (years.has(commitment.year)) {
        errors[`commitments.${index}.year`] = `Já existe um empenho de ${year} neste contrato`;
      }
      years.add(commitment.year);
      if (!commitment.number.trim()) {
        errors[`commitments.${index}.number`] = 'Informe o número do empenho';
      }
      if (!commitment.amountCents || commitment.amountCents <= 0) {
        errors[`commitments.${index}.amount`] = 'Informe o valor do empenho';
      }
    });
  }
  return errors;
}

/** Primeira etapa com erro, para voltar a ela ao salvar. */
export function firstInvalidStep(steps: WizardStep[], draft: ContractDraft): WizardStep | null {
  return steps.find((step) => Object.keys(validateStep(step, draft)).length > 0) ?? null;
}

function installmentBody(draft: InstallmentDraft): ContractRequest['setupFee'] {
  if (!draft.enabled || !draft.totalCents) return null;
  return { amount: draft.totalCents / 100, installments: Number(draft.installments), firstDate: brDateToIso(draft.firstDate) };
}

/** Corpo da API a partir das etapas (já conferidas). Fora do órgão público, a parte dele vai vazia. */
export function contractRequestBody(draft: ContractDraft, publicEntity: boolean): ContractRequest {
  const withholdings: WithholdingRates = {};
  if (publicEntity) {
    for (const tax of WITHHOLDING_TAXES) {
      const rate = parsePercent(draft.withholdings[tax]);
      if (typeof rate === 'number') withholdings[tax] = rate;
    }
  }
  return {
    number: draft.number.trim(),
    description: draft.description.trim(),
    notes: draft.notes.trim(),
    startDate: brDateToIso(draft.startDate),
    endDate: draft.openEnded ? null : brDateToIso(draft.endDate),
    dueDay: draft.dueDay,
    monthlyFee: draft.monthly.enabled && draft.monthly.amountCents ? draft.monthly.amountCents / 100 : null,
    setupFee: installmentBody(draft.setup),
    projectFee: installmentBody(draft.project),
    hourTypes: draft.hourTypes.map((hourType) => ({
      id: hourType.id,
      name: hourType.name.trim(),
      hourlyRate: (hourType.hourlyRateCents ?? 0) / 100,
      quantity: parseDecimal(hourType.quantity) ?? 0,
    })),
    representativeId: draft.representativeId,
    monthlyClassificationId: draft.monthly.enabled ? draft.monthlyClassificationId : null,
    setupClassificationId: draft.setup.enabled ? draft.setupClassificationId : null,
    projectClassificationId: draft.project.enabled ? draft.projectClassificationId : null,
    services: draft.services,
    readjustmentBaseDate: brDateToIso(draft.readjustmentBaseDate) || null,
    process: publicEntity ? draft.process.trim() : '',
    modality: publicEntity ? draft.modality.trim() : '',
    withholdings,
    commitments: publicEntity
      ? draft.commitments.map((commitment) => ({
        year: Number(commitment.year),
        number: commitment.number.trim(),
        amount: (commitment.amountCents ?? 0) / 100,
      }))
      : [],
  };
}
