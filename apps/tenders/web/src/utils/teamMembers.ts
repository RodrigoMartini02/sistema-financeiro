import { isValidCpf, onlyDigits } from '@ui/utils/brazilDocuments';
import type {
  DomainLists,
  NewTeamUser,
  OwnerProfile,
  OwnerProfileUpdate,
  TeamMember,
  TeamUserUpdate,
} from '../types';

// Usuários do módulo (item 1A): textos de exibição, valores do formulário e o corpo dos pedidos. Sem React, para ter
// teste: o formulário só liga estes passos aos campos.

/** Mesma regra do servidor (services/memberInput.ts); a API confere de novo. */
export const MIN_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Iniciais do avatar sem foto: a primeira letra do primeiro e do segundo nome, ou as duas primeiras de um nome só. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'U';
  if (words.length === 1) return (words[0] ?? '').slice(0, 2).toUpperCase();
  return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase();
}

export function fullName(person: { name: string; lastName: string | null }): string {
  return [person.name, person.lastName].filter((part): part is string => typeof part === 'string' && part.trim() !== '').join(' ');
}

type MemberLists = Pick<DomainLists, 'memberSectors' | 'memberJobTitles'>;

/** Nome da lista padrão para o código gravado; com a lista ainda carregando, nada; código fora da lista aparece como está. */
function listName(list: ReadonlyArray<{ id: string; name: string }> | undefined, code: string | null): string | null {
  if (code === null || list === undefined) return null;
  return list.find((item) => item.id === code)?.name ?? code;
}

/** Cargo completo, como em Finanças: "Gerente · Financeiro"; só um dos dois quando falta o outro; nenhum, null. */
export function workTitle(member: Pick<TeamMember, 'jobTitle' | 'sector'>, lists: MemberLists | undefined): string | null {
  const parts = [listName(lists?.memberJobTitles, member.jobTitle), listName(lists?.memberSectors, member.sector)];
  const text = parts.filter((part): part is string => part !== null).join(' · ');
  return text === '' ? null : text;
}

/** Campos do formulário de usuário: tudo texto, como nos campos da tela. */
export interface TeamUserFormValues {
  name: string;
  lastName: string;
  email: string;
  /** Com a máscara do CPF. */
  document: string;
  phone: string;
  /** Código da lista padrão, ou '' para "sem setor". */
  sector: string;
  jobTitle: string;
  /** AAAA-MM-DD, ou ''. */
  admissionDate: string;
  /** Senha inicial (cadastro) ou nova senha (edição); vazia mantém a atual. */
  password: string;
}

export const EMPTY_TEAM_USER_FORM: TeamUserFormValues = {
  name: '',
  lastName: '',
  email: '',
  document: '',
  phone: '',
  sector: '',
  jobTitle: '',
  admissionDate: '',
  password: '',
};

export function formValuesFromMember(member: TeamMember, formatDocument: (digits: string) => string): TeamUserFormValues {
  return {
    name: member.name,
    lastName: member.lastName ?? '',
    email: member.email,
    document: formatDocument(member.document ?? ''),
    phone: member.phone ?? '',
    sector: member.sector ?? '',
    jobTitle: member.jobTitle ?? '',
    admissionDate: member.admissionDate ?? '',
    password: '',
  };
}

export type TeamUserFormField = keyof TeamUserFormValues;
export type TeamUserFormErrors = Partial<Record<TeamUserFormField, string>>;

/**
 * Confere o formulário antes de enviar (a API confere de novo). No cadastro a senha é obrigatória; na edição, só se
 * preenchida. O CPF é opcional, mas preenchido precisa valer.
 */
export function validateTeamUserForm(values: TeamUserFormValues, mode: 'create' | 'edit'): TeamUserFormErrors {
  const errors: TeamUserFormErrors = {};
  if (values.name.trim() === '') {
    errors.name = 'Informe o nome';
  }
  if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'Informe um e-mail válido';
  }
  if (onlyDigits(values.document) !== '' && !isValidCpf(values.document)) {
    errors.document = 'Informe um CPF válido';
  }
  if ((mode === 'create' || values.password !== '') && values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Pelo menos ${MIN_PASSWORD_LENGTH} caracteres`;
  }
  return errors;
}

function optionalText(value: string): string | undefined {
  const text = value.trim();
  return text === '' ? undefined : text;
}

/** Corpo do cadastro: o que ficou em branco não vai. */
export function buildNewTeamUser(values: TeamUserFormValues): NewTeamUser {
  const document = onlyDigits(values.document);
  return {
    name: values.name.trim(),
    lastName: optionalText(values.lastName),
    email: values.email.trim(),
    password: values.password,
    document: document === '' ? undefined : document,
    phone: optionalText(values.phone),
    sector: optionalText(values.sector),
    jobTitle: optionalText(values.jobTitle),
    admissionDate: optionalText(values.admissionDate),
  };
}

/**
 * Corpo da edição: manda todos os campos do formulário, e o vazio limpa o que pode ficar vazio (a API mantém só o
 * que não vem). A senha só vai se foi preenchida.
 */
export function buildTeamUserUpdate(values: TeamUserFormValues): TeamUserUpdate {
  return {
    name: values.name.trim(),
    lastName: values.lastName.trim(),
    email: values.email.trim(),
    document: onlyDigits(values.document),
    phone: values.phone.trim(),
    sector: values.sector,
    jobTitle: values.jobTitle,
    admissionDate: values.admissionDate,
    ...(values.password === '' ? {} : { newPassword: values.password }),
  };
}

/** Campos do perfil do titular. */
export interface OwnerFormValues {
  name: string;
  lastName: string;
  phone: string;
}

export function ownerFormValuesFrom(profile: OwnerProfile): OwnerFormValues {
  return { name: profile.name, lastName: profile.lastName ?? '', phone: profile.phone ?? '' };
}

export function validateOwnerForm(values: OwnerFormValues): Partial<Record<keyof OwnerFormValues, string>> {
  return values.name.trim() === '' ? { name: 'Informe o nome' } : {};
}

export function buildOwnerProfileUpdate(values: OwnerFormValues): OwnerProfileUpdate {
  return { name: values.name.trim(), lastName: values.lastName.trim(), phone: values.phone.trim() };
}
