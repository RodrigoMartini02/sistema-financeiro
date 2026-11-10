import { formatCep, onlyDigits } from '@ui/utils/brazilDocuments';
import type { CnaeEntry, CompanyProfile, CompanyUpdate } from '../types';
import { formatIsoDate, formatIsoDateTime } from './dates';
import { formatCnpj } from './labels';

// Perfil da empresa (item 1C): textos de exibição, valores do formulário, o corpo do pedido e o texto da confirmação da
// consulta do CNPJ. Sem React, para ter teste: o formulário só liga estes passos aos campos.

/** Mesma regra do servidor (services/companyInput.ts); a API confere de novo. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CEP_DIGITS = 8;

/** CNAE como a Receita o escreve: "6319-4/00". Fora de 7 dígitos, como veio. */
export function formatCnae(code: string): string {
  const digits = onlyDigits(code);
  return digits.length === 7 ? `${digits.slice(0, 4)}-${digits.slice(4, 5)}/${digits.slice(5)}` : code;
}

/** "6319-4/00 · Portais, provedores…"; sem descrição, só o código. */
export function cnaeLabel(cnae: CnaeEntry): string {
  const code = formatCnae(cnae.code);
  return cnae.description.trim() === '' ? code : `${code} · ${cnae.description}`;
}

/** Natureza jurídica como a Receita a escreve: "206-2 · Sociedade Empresária Limitada"; sem nada, null. */
export function legalNatureLabel(nature: CompanyProfile['legalNature']): string | null {
  if (nature === null) return null;
  const digits = onlyDigits(nature.code ?? '');
  const code = digits.length === 4 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : (nature.code ?? '').trim();
  const description = (nature.description ?? '').trim();
  const text = [code, description].filter((part) => part !== '').join(' · ');
  return text === '' ? null : text;
}

type StatusTone = 'income' | 'warning' | 'expense';

const REGISTRATION_STATUSES: Record<string, { label: string; tone: StatusTone }> = {
  ATIVA: { label: 'Ativa', tone: 'income' },
  SUSPENSA: { label: 'Suspensa', tone: 'warning' },
  INAPTA: { label: 'Inapta', tone: 'warning' },
  BAIXADA: { label: 'Baixada', tone: 'expense' },
  NULA: { label: 'Nula', tone: 'expense' },
};

/**
 * A situação cadastral para a tela: o nome, a cor do selo e "desde 03/11/2005". Uma situação que a tela não conhece
 * aparece com o código da API e em tom de alerta.
 */
export function registrationStatusView(status: NonNullable<CompanyProfile['registrationStatus']>): {
  label: string;
  tone: StatusTone;
  since: string | null;
} {
  const known = REGISTRATION_STATUSES[status.code];
  return {
    label: known?.label ?? status.code,
    tone: known?.tone ?? 'warning',
    since: status.since ? `desde ${formatIsoDate(status.since)}` : null,
  };
}

/** "Dados da Receita consultados em 10/11/2026 12:00"; nunca consultou, null. */
export function lookupDateText(lookedUpAt: string | null): string | null {
  return lookedUpAt === null ? null : `Dados da Receita consultados em ${formatIsoDateTime(lookedUpAt)}`;
}

/**
 * A empresa já tem dados além do que o cadastro pede (a razão social)? Vale para decidir se a consulta pede
 * confirmação antes de gravar por cima.
 */
export function hasCompanyData(company: CompanyProfile): boolean {
  const optionalTexts = [
    company.tradeName, company.openingDate, company.size, company.legalType, company.zipCode, company.street,
    company.number, company.complement, company.district, company.city, company.state, company.phone, company.email,
  ];
  return (
    company.lookedUpAt !== null ||
    optionalTexts.some((value) => value !== null && value !== '') ||
    company.legalNature !== null ||
    company.registrationStatus !== null ||
    company.mainCnae !== null ||
    company.secondaryCnaes.length > 0
  );
}

/** O texto da confirmação antes de consultar o CNPJ por cima de dados que já existem. */
export function lookupConfirmation(
  document: string | null,
  hasUnsavedChanges: boolean,
): { title: string; message: string; confirmLabel: string } {
  const unsaved = hasUnsavedChanges ? ' As alterações que você ainda não salvou serão descartadas.' : '';
  return {
    title: 'Buscar dados do CNPJ',
    message:
      `Vamos consultar o CNPJ ${formatCnpj(document)} e atualizar o perfil com o que a consulta informar. ` +
      `O que você preencheu e a consulta também informa será substituído; o que ela não informar fica como está.${unsaved}`,
    confirmLabel: 'Buscar dados',
  };
}

/** Campos editáveis do formulário: tudo texto, como nos campos da tela. */
export interface CompanyFormValues {
  legalName: string;
  tradeName: string;
  /** AAAA-MM-DD, ou ''. */
  openingDate: string;
  /** Código da lista padrão (porte e tipo jurídico), ou '' para "não informado". */
  size: string;
  legalType: string;
  /** Com a máscara 00000-000. */
  zipCode: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  /** UF, ou ''. */
  state: string;
  /** Com a máscara do telefone. */
  phone: string;
  email: string;
}

export type CompanyFormField = keyof CompanyFormValues;
export type CompanyFormErrors = Partial<Record<CompanyFormField, string>>;

const FORM_FIELDS: readonly CompanyFormField[] = [
  'legalName', 'tradeName', 'openingDate', 'size', 'legalType', 'zipCode', 'street', 'number', 'complement', 'district',
  'city', 'state', 'phone', 'email',
];

export function companyFormValuesFrom(company: CompanyProfile): CompanyFormValues {
  return {
    legalName: company.legalName ?? '',
    tradeName: company.tradeName ?? '',
    openingDate: company.openingDate ?? '',
    size: company.size ?? '',
    legalType: company.legalType ?? '',
    zipCode: formatCep(company.zipCode ?? ''),
    street: company.street ?? '',
    number: company.number ?? '',
    complement: company.complement ?? '',
    district: company.district ?? '',
    city: company.city ?? '',
    state: company.state ?? '',
    phone: company.phone ?? '',
    email: company.email ?? '',
  };
}

/** O que a API guarda de cada campo: texto aparado, CEP só com os dígitos, e-mail em minúsculas. */
function normalized(values: CompanyFormValues): CompanyFormValues {
  return {
    legalName: values.legalName.trim(),
    tradeName: values.tradeName.trim(),
    openingDate: values.openingDate,
    size: values.size,
    legalType: values.legalType,
    zipCode: onlyDigits(values.zipCode),
    street: values.street.trim(),
    number: values.number.trim(),
    complement: values.complement.trim(),
    district: values.district.trim(),
    city: values.city.trim(),
    state: values.state,
    phone: values.phone.trim(),
    email: values.email.trim().toLowerCase(),
  };
}

/** Confere o formulário antes de enviar (a API confere de novo): razão social obrigatória, CEP de 8 dígitos e e-mail válido. */
export function validateCompanyForm(values: CompanyFormValues): CompanyFormErrors {
  const errors: CompanyFormErrors = {};
  if (values.legalName.trim() === '') {
    errors.legalName = 'Informe a razão social';
  }
  const zipDigits = onlyDigits(values.zipCode);
  if (zipDigits !== '' && zipDigits.length !== CEP_DIGITS) {
    errors.zipCode = 'Informe um CEP válido';
  }
  const email = values.email.trim();
  if (email !== '' && !EMAIL_PATTERN.test(email)) {
    errors.email = 'Informe um e-mail válido';
  }
  return errors;
}

/**
 * Corpo da edição: só o que mudou em relação ao que veio da API (a API mantém o que não vem, e o texto vazio limpa).
 * Sem mudança, `{}`.
 */
export function buildCompanyUpdate(values: CompanyFormValues, initial: CompanyFormValues): CompanyUpdate {
  const next = normalized(values);
  const base = normalized(initial);
  const update: CompanyUpdate = {};
  for (const field of FORM_FIELDS) {
    if (next[field] !== base[field]) {
      update[field] = next[field];
    }
  }
  return update;
}

export function hasCompanyChanges(values: CompanyFormValues, initial: CompanyFormValues): boolean {
  return Object.keys(buildCompanyUpdate(values, initial)).length > 0;
}

/**
 * Chave do formulário: muda quando os dados salvos mudam (salvar ou consultar), e o formulário recomeça dos valores
 * novos. A hora da consulta entra para que uma consulta sempre descarte o que estava digitado, como a confirmação avisa.
 */
export function companyFormKey(company: CompanyProfile): string {
  return JSON.stringify([companyFormValuesFrom(company), company.lookedUpAt]);
}
