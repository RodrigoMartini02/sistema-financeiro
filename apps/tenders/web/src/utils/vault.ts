import { isValidCpf, onlyDigits } from '@ui/utils/brazilDocuments';
import type {
  DocumentStatus,
  DocumentTypeInfo,
  NewVaultDocument,
  NewVaultPerson,
  VaultDocument,
  VaultDocumentChanges,
  VaultPerson,
  VaultPersonChanges,
} from '../types';
import { addDaysToIsoDate, formatIsoDate, isValidIsoDate } from './dates';

// Cofre de documentos (plano .plans/licitacoes-5-cofre-de-documentos.md): as abas da página, os textos de situação e de
// validade, o agrupamento dos documentos (o vigente de cada tipo e o histórico), o resumo, os formulários de documento e de
// pessoa (com as mesmas regras da API, que confere de novo) e a leitura do arquivo. Sem React, para ter teste.

// --- Abas ---------------------------------------------------------------------------------------------------------------

export const VAULT_TABS = [
  { id: 'cofre', label: 'Cofre' },
  { id: 'pessoas', label: 'Pessoas' },
] as const;
export type VaultTab = (typeof VAULT_TABS)[number]['id'];

export const VAULT_TAB_URL_PARAM = 'aba';

/** As abas da pessoa: a de Pessoas é só do titular (dado pessoal de terceiros). */
export function vaultTabsFor(canSeePeople: boolean): ReadonlyArray<(typeof VAULT_TABS)[number]> {
  return canSeePeople ? VAULT_TABS : VAULT_TABS.filter((tab) => tab.id === 'cofre');
}

/** Aba da URL (`?aba=pessoas`); sem ela, desconhecida ou sem permissão, o Cofre. */
export function vaultTabOf(params: URLSearchParams, canSeePeople: boolean): VaultTab {
  return canSeePeople && params.get(VAULT_TAB_URL_PARAM) === 'pessoas' ? 'pessoas' : 'cofre';
}

/** Parâmetros só com a aba (o Cofre é o padrão e fica fora da URL). */
export function vaultTabParams(tab: VaultTab): URLSearchParams {
  const params = new URLSearchParams();
  if (tab === 'pessoas') params.set(VAULT_TAB_URL_PARAM, tab);
  return params;
}

// --- Limites (os da API) ------------------------------------------------------------------------------------------------

/** Arquivo de até 10 MB. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_DESCRIPTION_LENGTH = 120;
export const MAX_PERSON_NAME_LENGTH = 120;
export const MAX_PERSON_JOB_TITLE_LENGTH = 80;
export const MAX_PERSON_EMAIL_LENGTH = 255;
export const MAX_PERSON_PHONE_LENGTH = 20;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "12 de 300 documentos", no cabeçalho do cofre. */
export function documentLimitText(count: number, limit: number): string {
  return `${count} de ${limit} ${limit === 1 ? 'documento' : 'documentos'}`;
}

/** "3 de 50 pessoas", no cabeçalho da aba Pessoas. */
export function personLimitText(count: number, limit: number): string {
  return `${count} de ${limit} ${limit === 1 ? 'pessoa' : 'pessoas'}`;
}

// --- Situação e validade ------------------------------------------------------------------------------------------------

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  VALID: 'Válido',
  EXPIRING: 'Vencendo',
  EXPIRED: 'Vencido',
};

/** Os tons do selo (`Pill`): verde, âmbar e vermelho. */
export const DOCUMENT_STATUS_TONES: Record<DocumentStatus, 'success' | 'warning' | 'danger'> = {
  VALID: 'success',
  EXPIRING: 'warning',
  EXPIRED: 'danger',
};

/** O texto da validade do documento, com a data: "Vence em 12 dias (23/11/2026)", "Venceu há 3 dias (08/11/2026)"... */
export function documentExpiryText(document: Pick<VaultDocument, 'validUntil' | 'status' | 'daysToExpire'>): string {
  if (document.validUntil === null || document.daysToExpire === null) return 'Sem validade';
  const date = formatIsoDate(document.validUntil);
  const days = document.daysToExpire;
  if (days < 0) return days === -1 ? `Venceu ontem (${date})` : `Venceu há ${-days} dias (${date})`;
  if (days === 0) return `Vence hoje (${date})`;
  if (days === 1) return `Vence amanhã (${date})`;
  return document.status === 'EXPIRING' ? `Vence em ${days} dias (${date})` : `Válido até ${date}`;
}

/** "340 KB", "1,5 MB". */
export function fileSizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}

// --- Catálogo de tipos --------------------------------------------------------------------------------------------------

export function findDocumentTypeInfo(types: readonly DocumentTypeInfo[] | undefined, id: string): DocumentTypeInfo | undefined {
  return types?.find((type) => type.id === id);
}

/** O nome do tipo; com o catálogo ainda carregando ou um código que saiu dele, o próprio código. */
export function documentTypeName(types: readonly DocumentTypeInfo[] | undefined, id: string): string {
  return findDocumentTypeInfo(types, id)?.name ?? id;
}

/** O título do documento: nos tipos genéricos ("Outro documento"), a descrição que a pessoa deu; nos outros, o nome do tipo. */
export function documentTitle(document: Pick<VaultDocument, 'type' | 'description'>, types: readonly DocumentTypeInfo[] | undefined): string {
  const type = findDocumentTypeInfo(types, document.type);
  return type?.descriptionRequired && document.description ? document.description : documentTypeName(types, document.type);
}

/** Os tipos do catálogo de uma empresa ou de uma pessoa, na ordem do catálogo. */
export function typesOfOwner(types: readonly DocumentTypeInfo[] | undefined, owner: DocumentTypeInfo['owner']): DocumentTypeInfo[] {
  return (types ?? []).filter((type) => type.owner === owner);
}

// --- Agrupamento, resumo e filtro ---------------------------------------------------------------------------------------

/** Um documento vigente com os anteriores do mesmo tipo (e da mesma pessoa), que foram substituídos por ele. */
export interface DocumentEntry {
  document: VaultDocument;
  /** Do mais recente ao mais antigo; só os tipos em que o novo substitui o anterior têm histórico. */
  history: VaultDocument[];
}

/**
 * Os documentos vigentes na ordem do catálogo (o vigente de cada tipo, ou todos nos tipos que convivem), cada um com o seu
 * histórico. A API já diz o que é vigente e devolve cada grupo do mais recente ao mais antigo; aqui só se junta e se ordena.
 */
export function buildDocumentEntries(documents: readonly VaultDocument[], types: readonly DocumentTypeInfo[] | undefined): DocumentEntry[] {
  const groupOf = (document: VaultDocument) => `${document.type}:${document.personId ?? ''}`;
  const history = new Map<string, VaultDocument[]>();
  for (const document of documents) {
    if (!document.current) history.set(groupOf(document), [...(history.get(groupOf(document)) ?? []), document]);
  }
  const typeOrder = new Map((types ?? []).map((type, index) => [type.id, index]));
  const orderOf = (document: VaultDocument) => typeOrder.get(document.type) ?? Number.MAX_SAFE_INTEGER;
  return documents
    .filter((document) => document.current)
    .map((document) => ({ document, history: history.get(groupOf(document)) ?? [] }))
    .sort((a, b) => orderOf(a.document) - orderOf(b.document));
}

/** Os documentos da empresa: os que não têm pessoa. */
export function companyDocuments(documents: readonly VaultDocument[] | undefined): VaultDocument[] {
  return (documents ?? []).filter((document) => document.personId === null);
}

/** Os documentos de uma pessoa. */
export function documentsOfPerson(documents: readonly VaultDocument[] | undefined, personId: number): VaultDocument[] {
  return (documents ?? []).filter((document) => document.personId === personId);
}

export interface DocumentSummary {
  total: number;
  valid: number;
  expiring: number;
  expired: number;
}

/** Quantos documentos vigentes há em cada situação (o histórico não conta: o novo substituiu o antigo). */
export function summarizeEntries(entries: readonly DocumentEntry[]): DocumentSummary {
  const count = (status: DocumentStatus) => entries.filter((entry) => entry.document.status === status).length;
  return { total: entries.length, valid: count('VALID'), expiring: count('EXPIRING'), expired: count('EXPIRED') };
}

/** O filtro do resumo: uma situação ou todas. */
export type DocumentStatusFilter = DocumentStatus | 'ALL';

export function filterEntries(entries: readonly DocumentEntry[], filter: DocumentStatusFilter): DocumentEntry[] {
  return filter === 'ALL' ? [...entries] : entries.filter((entry) => entry.document.status === filter);
}

// --- Arquivo ------------------------------------------------------------------------------------------------------------

/** O que a validação precisa do arquivo escolhido (o `File` do navegador serve). */
export interface PickedFile {
  name: string;
  size: number;
  type: string;
}

const MIME_BY_EXTENSION: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
const ACCEPTED_MIME_TYPES = new Set(Object.values(MIME_BY_EXTENSION));

/** O atributo `accept` do campo de arquivo. */
export const DOCUMENT_FILE_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';
export const FILE_TYPE_MESSAGE = 'Envie um arquivo PDF, JPG ou PNG';
export const FILE_SIZE_MESSAGE = 'O arquivo deve ter no máximo 10 MB';

/** O tipo do arquivo: o que o navegador informou e, sem ele, o que a extensão diz; fora de PDF, JPG e PNG, null. */
export function documentFileMimeType(file: Pick<PickedFile, 'name' | 'type'>): string | null {
  if (ACCEPTED_MIME_TYPES.has(file.type)) return file.type;
  if (file.type !== '') return null;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? null;
}

/** Mensagem de erro do arquivo escolhido (tipo e tamanho); sem problema, null. A API confere de novo pelo conteúdo. */
export function validateDocumentFile(file: PickedFile): string | null {
  if (documentFileMimeType(file) === null) return FILE_TYPE_MESSAGE;
  if (file.size === 0) return 'O arquivo está vazio';
  if (file.size > MAX_DOCUMENT_BYTES) return FILE_SIZE_MESSAGE;
  return null;
}

/**
 * Lê o arquivo como data URL, com o tipo certo no prefixo (o do arquivo ou, se o navegador não informou, o da extensão), que
 * é o que a API espera e confere contra o conteúdo.
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  const mime = documentFileMimeType(file);
  return new Promise((resolve, reject) => {
    if (mime === null) {
      reject(new Error(FILE_TYPE_MESSAGE));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(`data:${mime};base64,${result.slice(result.indexOf(',') + 1)}`);
    };
    reader.readAsDataURL(file);
  });
}

// --- Formulário de documento --------------------------------------------------------------------------------------------

/** Campos do formulário de documento: tudo texto, como nos campos da tela. */
export interface DocumentFormValues {
  /** Código do tipo (o de pessoa ou o da empresa, conforme o formulário). */
  type: string;
  /** Id da pessoa, como texto; vazio nos tipos da empresa. */
  personId: string;
  description: string;
  /** AAAA-MM-DD, ou ''. */
  issuedOn: string;
  validUntil: string;
}

export const EMPTY_DOCUMENT_FORM: DocumentFormValues = { type: '', personId: '', description: '', issuedOn: '', validUntil: '' };

export function documentFormFrom(document: VaultDocument): DocumentFormValues {
  return {
    type: document.type,
    personId: document.personId === null ? '' : String(document.personId),
    description: document.description ?? '',
    issuedOn: document.issuedOn ?? '',
    validUntil: document.validUntil ?? '',
  };
}

export type DocumentFormField = keyof DocumentFormValues | 'file';
export type DocumentFormErrors = Partial<Record<DocumentFormField, string>>;

/** A validade sugerida: a emissão mais os dias padrão do tipo; sem emissão válida ou sem prazo padrão, null. */
export function suggestedValidUntil(issuedOn: string, type: Pick<DocumentTypeInfo, 'defaultValidityDays'> | undefined): string | null {
  if (!type || type.defaultValidityDays === null || !isValidIsoDate(issuedOn)) return null;
  return addDaysToIsoDate(issuedOn, type.defaultValidityDays);
}

/**
 * Confere o formulário antes de enviar (a API confere de novo): o tipo, a pessoa (tipos de pessoa), a descrição (tipos
 * genéricos), a validade (tipos que vencem), a ordem das datas e o arquivo (obrigatório ao guardar; ao editar, só se trocar).
 */
export function validateDocumentForm(
  values: DocumentFormValues,
  file: PickedFile | null,
  types: readonly DocumentTypeInfo[] | undefined,
  mode: 'create' | 'edit',
): DocumentFormErrors {
  const errors: DocumentFormErrors = {};
  const type = findDocumentTypeInfo(types, values.type);
  if (!type) {
    errors.type = 'Escolha o tipo de documento';
    return errors;
  }
  if (mode === 'create' && type.owner === 'PESSOA' && values.personId === '') {
    errors.personId = 'Escolha a pessoa do documento';
  }
  const description = values.description.trim();
  if (type.descriptionRequired && description === '') {
    errors.description = 'Descreva o documento';
  } else if (description.length > MAX_DOCUMENT_DESCRIPTION_LENGTH) {
    errors.description = `Até ${MAX_DOCUMENT_DESCRIPTION_LENGTH} caracteres`;
  }
  if (type.validityRequired && values.validUntil === '') {
    errors.validUntil = 'Informe a validade do documento';
  }
  if (values.issuedOn !== '' && values.validUntil !== '' && values.issuedOn > values.validUntil) {
    errors.issuedOn = 'A emissão não pode ser depois da validade';
  }
  if (file) {
    const fileError = validateDocumentFile(file);
    if (fileError) errors.file = fileError;
  } else if (mode === 'create') {
    errors.file = 'Escolha o arquivo do documento';
  }
  return errors;
}

function optionalText(value: string): string | undefined {
  const text = value.trim();
  return text === '' ? undefined : text;
}

/** Corpo de guardar: o que ficou em branco não vai; a pessoa só vai nos tipos de pessoa. */
export function buildNewDocument(
  values: DocumentFormValues,
  file: { name: string; data: string },
  types: readonly DocumentTypeInfo[] | undefined,
): NewVaultDocument {
  const type = findDocumentTypeInfo(types, values.type);
  return {
    type: values.type,
    ...(type?.owner === 'PESSOA' && values.personId !== '' ? { personId: Number(values.personId) } : {}),
    description: optionalText(values.description),
    issuedOn: optionalText(values.issuedOn),
    validUntil: optionalText(values.validUntil),
    file,
  };
}

/** Corpo de editar: manda os três campos do formulário (vazio limpa) e o arquivo só se foi trocado. */
export function buildDocumentChanges(values: DocumentFormValues, file: { name: string; data: string } | null): VaultDocumentChanges {
  return {
    description: values.description.trim(),
    issuedOn: values.issuedOn,
    validUntil: values.validUntil,
    ...(file ? { file } : {}),
  };
}

// --- Formulário de pessoa -----------------------------------------------------------------------------------------------

export interface PersonFormValues {
  name: string;
  /** Com a máscara do CPF. */
  cpf: string;
  /** Códigos dos papéis marcados. */
  roles: string[];
  jobTitle: string;
  email: string;
  phone: string;
}

export const EMPTY_PERSON_FORM: PersonFormValues = { name: '', cpf: '', roles: [], jobTitle: '', email: '', phone: '' };

export function personFormFrom(person: VaultPerson, formatDocument: (digits: string) => string): PersonFormValues {
  return {
    name: person.name,
    cpf: formatDocument(person.cpf),
    roles: [...person.roles],
    jobTitle: person.jobTitle ?? '',
    email: person.email ?? '',
    phone: person.phone ?? '',
  };
}

export type PersonFormField = keyof PersonFormValues;
export type PersonFormErrors = Partial<Record<PersonFormField, string>>;

/** Confere o formulário antes de enviar (a API confere de novo): nome, CPF válido, ao menos um papel e o e-mail, se houver. */
export function validatePersonForm(values: PersonFormValues): PersonFormErrors {
  const errors: PersonFormErrors = {};
  const name = values.name.trim();
  if (name === '') errors.name = 'Informe o nome da pessoa';
  else if (name.length > MAX_PERSON_NAME_LENGTH) errors.name = `Até ${MAX_PERSON_NAME_LENGTH} caracteres`;
  if (!isValidCpf(values.cpf)) errors.cpf = 'Informe um CPF válido';
  if (values.roles.length === 0) errors.roles = 'Escolha ao menos um papel';
  if (values.email.trim() !== '' && !EMAIL_PATTERN.test(values.email.trim())) errors.email = 'Informe um e-mail válido';
  return errors;
}

/** Corpo do cadastro: o que ficou em branco não vai. */
export function buildNewPerson(values: PersonFormValues): NewVaultPerson {
  return {
    name: values.name.trim(),
    cpf: onlyDigits(values.cpf),
    roles: values.roles,
    jobTitle: optionalText(values.jobTitle),
    email: optionalText(values.email),
    phone: optionalText(values.phone),
  };
}

/** Corpo da edição: manda todos os campos do formulário, e o vazio limpa o que pode ficar vazio. */
export function buildPersonChanges(values: PersonFormValues): VaultPersonChanges {
  return {
    name: values.name.trim(),
    cpf: onlyDigits(values.cpf),
    roles: values.roles,
    jobTitle: values.jobTitle.trim(),
    email: values.email.trim(),
    phone: values.phone.trim(),
  };
}

/** Os papéis da pessoa por extenso, na ordem da lista padrão: "Sócio, Procurador". */
export function personRolesText(roleIds: readonly string[], roles: ReadonlyArray<{ id: string; name: string }> | undefined): string {
  const known = roles ?? [];
  const names = known.filter((role) => roleIds.includes(role.id)).map((role) => role.name);
  const unknown = roleIds.filter((id) => !known.some((role) => role.id === id));
  return [...names, ...unknown].join(', ');
}
