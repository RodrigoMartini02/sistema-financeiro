import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCpf } from '@ui/utils/brazilDocuments';
import type { DocumentTypeInfo, VaultDocument, VaultPerson } from '../types';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_TONES,
  EMPTY_DOCUMENT_FORM,
  EMPTY_PERSON_FORM,
  FILE_SIZE_MESSAGE,
  FILE_TYPE_MESSAGE,
  MAX_DOCUMENT_BYTES,
  VAULT_TABS,
  buildDocumentChanges,
  buildDocumentEntries,
  buildNewDocument,
  buildNewPerson,
  buildPersonChanges,
  companyDocuments,
  documentExpiryText,
  documentFileMimeType,
  documentFormFrom,
  documentLimitText,
  documentTitle,
  documentTypeName,
  documentsOfPerson,
  fileSizeText,
  filterEntries,
  personFormFrom,
  personLimitText,
  personRolesText,
  suggestedValidUntil,
  summarizeEntries,
  typesOfOwner,
  validateDocumentFile,
  validateDocumentForm,
  validatePersonForm,
  vaultTabOf,
  vaultTabParams,
  vaultTabsFor,
} from './vault';

// Cofre de documentos (item 5), a parte sem React: abas, textos de situação e validade, o vigente de cada tipo e o histórico, o
// resumo e o filtro, o arquivo e os formulários de documento e de pessoa com as mesmas regras da API.

const type = (id: string, overrides: Partial<DocumentTypeInfo> = {}): DocumentTypeInfo => ({
  id,
  name: `Tipo ${id}`,
  owner: 'EMPRESA',
  validityRequired: false,
  defaultValidityDays: null,
  descriptionRequired: false,
  latestOnly: false,
  issuerUrl: null,
  ...overrides,
});

const TYPES: DocumentTypeInfo[] = [
  type('CONTRATO_SOCIAL', { name: 'Contrato social', latestOnly: true }),
  type('CERTIDAO_FGTS', { name: 'Certificado do FGTS', validityRequired: true, defaultValidityDays: 30, latestOnly: true, issuerUrl: 'https://caixa.exemplo/' }),
  type('ATESTADO', { name: 'Atestado' }),
  type('OUTRO_EMPRESA', { name: 'Outro documento da empresa', descriptionRequired: true }),
  type('DOCUMENTO_IDENTIDADE', { name: 'Documento de identificação', owner: 'PESSOA', latestOnly: true }),
  type('PROCURACAO', { name: 'Procuração', owner: 'PESSOA' }),
];

let nextId = 1;
const document = (overrides: Partial<VaultDocument> = {}): VaultDocument => ({
  id: nextId++,
  type: 'CERTIDAO_FGTS',
  personId: null,
  description: null,
  issuedOn: '2026-11-01',
  validUntil: '2026-12-01',
  fileName: 'certidao.pdf',
  fileType: 'application/pdf',
  fileSize: 120_000,
  status: 'VALID',
  daysToExpire: 40,
  current: true,
  createdAt: '2026-11-01T10:00:00-03:00',
  updatedAt: '2026-11-01T10:00:00-03:00',
  ...overrides,
});

const person = (overrides: Partial<VaultPerson> = {}): VaultPerson => ({
  id: 7,
  name: 'Ana Souza',
  cpf: '52998224725',
  roles: ['SOCIO', 'PROCURADOR'],
  jobTitle: 'Diretora',
  email: 'ana@exemplo.com',
  phone: '(98) 99999-0000',
  documentCount: 2,
  createdAt: '2026-11-01T10:00:00-03:00',
  ...overrides,
});

const NO_FILE = null;
const PDF_FILE = { name: 'a.pdf', size: 1000, type: 'application/pdf' };

test('abas: Cofre, Pessoas e Sanções; a de Pessoas só para o titular; a URL guarda só a aba que não é o Cofre', () => {
  assert.deepEqual(VAULT_TABS.map((tab) => tab.id), ['cofre', 'pessoas', 'sancoes']);
  assert.deepEqual(vaultTabsFor(true).map((tab) => tab.id), ['cofre', 'pessoas', 'sancoes']);
  assert.deepEqual(vaultTabsFor(false).map((tab) => tab.id), ['cofre', 'sancoes'], 'o colaborador vê o Cofre e as Sanções (só a empresa)');
  assert.equal(vaultTabOf(new URLSearchParams('aba=pessoas'), true), 'pessoas');
  assert.equal(vaultTabOf(new URLSearchParams('aba=pessoas'), false), 'cofre', 'sem permissão, o Cofre');
  assert.equal(vaultTabOf(new URLSearchParams('aba=sancoes'), true), 'sancoes');
  assert.equal(vaultTabOf(new URLSearchParams('aba=sancoes'), false), 'sancoes', 'as Sanções são de todos com acesso ao módulo');
  assert.equal(vaultTabOf(new URLSearchParams(''), true), 'cofre');
  assert.equal(vaultTabOf(new URLSearchParams('aba=outra'), true), 'cofre');
  assert.equal(vaultTabParams('pessoas').toString(), 'aba=pessoas');
  assert.equal(vaultTabParams('sancoes').toString(), 'aba=sancoes');
  assert.equal(vaultTabParams('cofre').toString(), '');
});

test('limites: "N de 300 documentos" e "N de 50 pessoas", com o singular', () => {
  assert.equal(documentLimitText(12, 300), '12 de 300 documentos');
  assert.equal(documentLimitText(0, 1), '0 de 1 documento');
  assert.equal(personLimitText(3, 50), '3 de 50 pessoas');
});

test('situação: nomes e tons do selo', () => {
  assert.deepEqual(DOCUMENT_STATUS_LABELS, { VALID: 'Válido', EXPIRING: 'Vencendo', EXPIRED: 'Vencido' });
  assert.deepEqual(DOCUMENT_STATUS_TONES, { VALID: 'success', EXPIRING: 'warning', EXPIRED: 'danger' });
});

test('texto da validade: sem validade, vencido, hoje, amanhã, vencendo e válido', () => {
  const text = (overrides: Partial<VaultDocument>) => documentExpiryText(document(overrides));
  assert.equal(text({ validUntil: null, daysToExpire: null }), 'Sem validade');
  assert.equal(text({ validUntil: '2026-11-10', daysToExpire: -1, status: 'EXPIRED' }), 'Venceu ontem (10/11/2026)');
  assert.equal(text({ validUntil: '2026-11-08', daysToExpire: -3, status: 'EXPIRED' }), 'Venceu há 3 dias (08/11/2026)');
  assert.equal(text({ validUntil: '2026-11-11', daysToExpire: 0, status: 'EXPIRING' }), 'Vence hoje (11/11/2026)');
  assert.equal(text({ validUntil: '2026-11-12', daysToExpire: 1, status: 'EXPIRING' }), 'Vence amanhã (12/11/2026)');
  assert.equal(text({ validUntil: '2026-11-23', daysToExpire: 12, status: 'EXPIRING' }), 'Vence em 12 dias (23/11/2026)');
  assert.equal(text({ validUntil: '2027-03-01', daysToExpire: 110, status: 'VALID' }), 'Válido até 01/03/2027');
});

test('tamanho do arquivo em bytes, KB e MB', () => {
  assert.equal(fileSizeText(512), '512 B');
  assert.equal(fileSizeText(120_000), '117 KB');
  assert.equal(fileSizeText(1_572_864), '1,5 MB');
  assert.equal(fileSizeText(MAX_DOCUMENT_BYTES), '10,0 MB');
});

test('catálogo: nome do tipo (ou o código, se saiu do catálogo), título com a descrição dos genéricos e tipos por dono', () => {
  assert.equal(documentTypeName(TYPES, 'CERTIDAO_FGTS'), 'Certificado do FGTS');
  assert.equal(documentTypeName(TYPES, 'SUMIU'), 'SUMIU');
  assert.equal(documentTypeName(undefined, 'CERTIDAO_FGTS'), 'CERTIDAO_FGTS', 'catálogo ainda carregando');
  assert.equal(documentTitle({ type: 'OUTRO_EMPRESA', description: 'Alvará de funcionamento' }, TYPES), 'Alvará de funcionamento');
  assert.equal(documentTitle({ type: 'ATESTADO', description: 'Prefeitura' }, TYPES), 'Atestado', 'a descrição dos outros tipos fica para a linha de detalhe');
  assert.equal(documentTitle({ type: 'OUTRO_EMPRESA', description: null }, TYPES), 'Outro documento da empresa');
  assert.deepEqual(typesOfOwner(TYPES, 'EMPRESA').map((item) => item.id), ['CONTRATO_SOCIAL', 'CERTIDAO_FGTS', 'ATESTADO', 'OUTRO_EMPRESA']);
  assert.deepEqual(typesOfOwner(TYPES, 'PESSOA').map((item) => item.id), ['DOCUMENTO_IDENTIDADE', 'PROCURACAO']);
  assert.deepEqual(typesOfOwner(undefined, 'PESSOA'), []);
});

test('agrupamento: o vigente de cada tipo na ordem do catálogo, com o histórico do mesmo tipo e da mesma pessoa', () => {
  const newFgts = document({ type: 'CERTIDAO_FGTS', current: true });
  const oldFgts = document({ type: 'CERTIDAO_FGTS', current: false, status: 'EXPIRED' });
  const oldestFgts = document({ type: 'CERTIDAO_FGTS', current: false, status: 'EXPIRED' });
  const social = document({ type: 'CONTRATO_SOCIAL', validUntil: null, daysToExpire: null });
  const attestA = document({ type: 'ATESTADO' });
  const attestB = document({ type: 'ATESTADO' });
  const identityAna = document({ type: 'DOCUMENTO_IDENTIDADE', personId: 7 });
  const oldIdentityAna = document({ type: 'DOCUMENTO_IDENTIDADE', personId: 7, current: false });
  const identityBia = document({ type: 'DOCUMENTO_IDENTIDADE', personId: 8 });
  const unknownType = document({ type: 'SUMIU' });

  // Na ordem em que a API devolve: por tipo e pessoa, o mais recente primeiro.
  const entries = buildDocumentEntries(
    [attestA, attestB, newFgts, oldFgts, oldestFgts, social, identityAna, oldIdentityAna, identityBia, unknownType],
    TYPES,
  );
  assert.deepEqual(
    entries.map((entry) => [entry.document.id, entry.history.map((old) => old.id)]),
    [
      [social.id, []],
      [newFgts.id, [oldFgts.id, oldestFgts.id]],
      [attestA.id, []],
      [attestB.id, []],
      [identityAna.id, [oldIdentityAna.id]],
      [identityBia.id, []],
      [unknownType.id, []],
    ],
    'tipos pela ordem do catálogo; o que não está no catálogo, por último; o histórico não mistura pessoas',
  );
  assert.deepEqual(buildDocumentEntries([], TYPES), []);
  assert.deepEqual(buildDocumentEntries([newFgts], undefined).map((entry) => entry.document.id), [newFgts.id], 'catálogo ainda carregando');
});

test('documentos da empresa e de uma pessoa', () => {
  const company = document({ personId: null });
  const ana = document({ personId: 7 });
  const bia = document({ personId: 8 });
  assert.deepEqual(companyDocuments([company, ana, bia]), [company]);
  assert.deepEqual(documentsOfPerson([company, ana, bia], 7), [ana]);
  assert.deepEqual(documentsOfPerson(undefined, 7), []);
  assert.deepEqual(companyDocuments(undefined), []);
});

test('resumo e filtro: contam só os vigentes, por situação', () => {
  const valid = document({ status: 'VALID', type: 'ATESTADO' });
  const expiring = document({ status: 'EXPIRING', type: 'ATESTADO' });
  const expiredA = document({ status: 'EXPIRED', type: 'ATESTADO' });
  const expiredB = document({ status: 'EXPIRED', type: 'ATESTADO' });
  const history = document({ status: 'EXPIRED', type: 'CERTIDAO_FGTS', current: false });
  const current = document({ status: 'VALID', type: 'CERTIDAO_FGTS' });
  const entries = buildDocumentEntries([valid, expiring, expiredA, expiredB, history, current], TYPES);

  assert.deepEqual(summarizeEntries(entries), { total: 5, valid: 2, expiring: 1, expired: 2 });
  assert.deepEqual(summarizeEntries([]), { total: 0, valid: 0, expiring: 0, expired: 0 });
  assert.equal(filterEntries(entries, 'ALL').length, 5);
  assert.deepEqual(filterEntries(entries, 'EXPIRED').map((entry) => entry.document.id), [expiredA.id, expiredB.id]);
  assert.deepEqual(filterEntries(entries, 'EXPIRING').map((entry) => entry.document.id), [expiring.id]);
  assert.deepEqual(filterEntries(entries, 'VALID').map((entry) => entry.document.id), [current.id, valid.id], 'na ordem do catálogo: a certidão vem antes do atestado');
});

test('arquivo: PDF, JPG e PNG até 10 MB; o tipo vem do navegador ou, sem ele, da extensão', () => {
  assert.equal(documentFileMimeType({ name: 'a.pdf', type: 'application/pdf' }), 'application/pdf');
  assert.equal(documentFileMimeType({ name: 'foto.JPEG', type: '' }), 'image/jpeg', 'sem tipo do navegador, a extensão decide');
  assert.equal(documentFileMimeType({ name: 'a.png', type: '' }), 'image/png');
  assert.equal(documentFileMimeType({ name: 'a.pdf', type: 'application/zip' }), null, 'o tipo informado vale mais que a extensão');
  assert.equal(documentFileMimeType({ name: 'a.txt', type: '' }), null);
  assert.equal(documentFileMimeType({ name: 'semextensao', type: '' }), null);

  assert.equal(validateDocumentFile(PDF_FILE), null);
  assert.equal(validateDocumentFile({ name: 'a.pdf', size: MAX_DOCUMENT_BYTES, type: 'application/pdf' }), null, 'exatamente 10 MB passa');
  assert.equal(validateDocumentFile({ name: 'a.pdf', size: MAX_DOCUMENT_BYTES + 1, type: 'application/pdf' }), FILE_SIZE_MESSAGE);
  assert.equal(validateDocumentFile({ name: 'a.docx', size: 10, type: 'application/msword' }), FILE_TYPE_MESSAGE);
  assert.equal(validateDocumentFile({ name: 'a.pdf', size: 0, type: 'application/pdf' }), 'O arquivo está vazio');
});

test('validade sugerida: a emissão mais os dias padrão do tipo; sem emissão válida ou sem prazo padrão, nada', () => {
  const fgts = TYPES.find((item) => item.id === 'CERTIDAO_FGTS');
  assert.equal(suggestedValidUntil('2026-11-01', fgts), '2026-12-01');
  assert.equal(suggestedValidUntil('2026-12-15', fgts), '2027-01-14');
  assert.equal(suggestedValidUntil('', fgts), null);
  assert.equal(suggestedValidUntil('2026-02-30', fgts), null);
  assert.equal(suggestedValidUntil('2026-11-01', TYPES.find((item) => item.id === 'ATESTADO')), null);
  assert.equal(suggestedValidUntil('2026-11-01', undefined), null);
});

test('formulário de documento: tipo, pessoa, descrição, validade, ordem das datas e arquivo', () => {
  const form = { ...EMPTY_DOCUMENT_FORM, type: 'CERTIDAO_FGTS', issuedOn: '2026-11-01', validUntil: '2026-12-01' };
  assert.deepEqual(validateDocumentForm(form, PDF_FILE, TYPES, 'create'), {});
  assert.deepEqual(validateDocumentForm(EMPTY_DOCUMENT_FORM, PDF_FILE, TYPES, 'create'), { type: 'Escolha o tipo de documento' });
  assert.deepEqual(validateDocumentForm({ ...form, type: 'SUMIU' }, PDF_FILE, TYPES, 'create'), { type: 'Escolha o tipo de documento' });
  assert.deepEqual(validateDocumentForm({ ...form, validUntil: '' }, PDF_FILE, TYPES, 'create'), { validUntil: 'Informe a validade do documento' });
  assert.deepEqual(validateDocumentForm({ ...form, issuedOn: '2026-12-02' }, PDF_FILE, TYPES, 'create'), { issuedOn: 'A emissão não pode ser depois da validade' });
  assert.deepEqual(validateDocumentForm(form, NO_FILE, TYPES, 'create'), { file: 'Escolha o arquivo do documento' });
  assert.deepEqual(validateDocumentForm(form, { name: 'a.zip', size: 10, type: 'application/zip' }, TYPES, 'create'), { file: FILE_TYPE_MESSAGE });

  // Tipo genérico: descrição obrigatória e de até 120 caracteres.
  const generic = { ...EMPTY_DOCUMENT_FORM, type: 'OUTRO_EMPRESA' };
  assert.deepEqual(validateDocumentForm(generic, PDF_FILE, TYPES, 'create'), { description: 'Descreva o documento' });
  assert.deepEqual(validateDocumentForm({ ...generic, description: '   ' }, PDF_FILE, TYPES, 'create'), { description: 'Descreva o documento' });
  assert.deepEqual(validateDocumentForm({ ...generic, description: 'x'.repeat(121) }, PDF_FILE, TYPES, 'create'), { description: 'Até 120 caracteres' });

  // Tipo de pessoa: a pessoa é obrigatória ao guardar.
  const personal = { ...EMPTY_DOCUMENT_FORM, type: 'PROCURACAO' };
  assert.deepEqual(validateDocumentForm(personal, PDF_FILE, TYPES, 'create'), { personId: 'Escolha a pessoa do documento' });
  assert.deepEqual(validateDocumentForm({ ...personal, personId: '7' }, PDF_FILE, TYPES, 'create'), {});

  // Editar: o arquivo só entra se trocar; a pessoa e o tipo não mudam.
  assert.deepEqual(validateDocumentForm(form, NO_FILE, TYPES, 'edit'), {});
  assert.deepEqual(validateDocumentForm(personal, NO_FILE, TYPES, 'edit'), {});
  assert.deepEqual(validateDocumentForm(form, { name: 'a.zip', size: 10, type: 'application/zip' }, TYPES, 'edit'), { file: FILE_TYPE_MESSAGE });
});

test('corpo de guardar: o que ficou em branco não vai; a pessoa só nos tipos de pessoa', () => {
  const file = { name: 'a.pdf', data: 'data:application/pdf;base64,AAAA' };
  assert.deepEqual(
    JSON.parse(JSON.stringify(buildNewDocument({ type: 'CERTIDAO_FGTS', personId: '', description: '  ', issuedOn: '2026-11-01', validUntil: '2026-12-01' }, file, TYPES))),
    { type: 'CERTIDAO_FGTS', issuedOn: '2026-11-01', validUntil: '2026-12-01', file },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(buildNewDocument({ type: 'PROCURACAO', personId: '7', description: ' Pregão 4/2026 ', issuedOn: '', validUntil: '' }, file, TYPES))),
    { type: 'PROCURACAO', personId: 7, description: 'Pregão 4/2026', file },
  );
  assert.equal(
    'personId' in JSON.parse(JSON.stringify(buildNewDocument({ type: 'CERTIDAO_FGTS', personId: '7', description: '', issuedOn: '', validUntil: '2026-12-01' }, file, TYPES))),
    false,
    'tipo da empresa nunca manda a pessoa',
  );
});

test('corpo de editar: manda as datas e a descrição (vazio limpa) e o arquivo só se trocou', () => {
  const values = { ...EMPTY_DOCUMENT_FORM, type: 'CERTIDAO_FGTS', description: ' Matriz ', issuedOn: '2026-11-01', validUntil: '' };
  assert.deepEqual(buildDocumentChanges(values, null), { description: 'Matriz', issuedOn: '2026-11-01', validUntil: '' });
  const file = { name: 'b.png', data: 'data:image/png;base64,AAAA' };
  assert.deepEqual(buildDocumentChanges(values, file), { description: 'Matriz', issuedOn: '2026-11-01', validUntil: '', file });
  assert.deepEqual(
    documentFormFrom(document({ type: 'PROCURACAO', personId: 7, description: 'Pregão', issuedOn: null, validUntil: '2027-01-01' })),
    { type: 'PROCURACAO', personId: '7', description: 'Pregão', issuedOn: '', validUntil: '2027-01-01' },
  );
});

test('formulário de pessoa: nome, CPF válido, ao menos um papel e e-mail válido, se houver', () => {
  const form = { ...EMPTY_PERSON_FORM, name: 'Ana Souza', cpf: '529.982.247-25', roles: ['SOCIO'] };
  assert.deepEqual(validatePersonForm(form), {});
  assert.deepEqual(validatePersonForm(EMPTY_PERSON_FORM), { name: 'Informe o nome da pessoa', cpf: 'Informe um CPF válido', roles: 'Escolha ao menos um papel' });
  assert.deepEqual(validatePersonForm({ ...form, cpf: '111.111.111-11' }), { cpf: 'Informe um CPF válido' });
  assert.deepEqual(validatePersonForm({ ...form, name: 'a'.repeat(121) }), { name: 'Até 120 caracteres' });
  assert.deepEqual(validatePersonForm({ ...form, email: 'sem-arroba' }), { email: 'Informe um e-mail válido' });
  assert.deepEqual(validatePersonForm({ ...form, email: ' ana@exemplo.com ' }), {});
});

test('corpo da pessoa: cadastro sem o que ficou em branco; edição com tudo (vazio limpa); formulário a partir da pessoa', () => {
  const form = { name: ' Ana Souza ', cpf: '529.982.247-25', roles: ['SOCIO', 'PROCURADOR'], jobTitle: ' ', email: ' ana@exemplo.com ', phone: '' };
  assert.deepEqual(JSON.parse(JSON.stringify(buildNewPerson(form))), { name: 'Ana Souza', cpf: '52998224725', roles: ['SOCIO', 'PROCURADOR'], email: 'ana@exemplo.com' });
  assert.deepEqual(buildPersonChanges(form), { name: 'Ana Souza', cpf: '52998224725', roles: ['SOCIO', 'PROCURADOR'], jobTitle: '', email: 'ana@exemplo.com', phone: '' });
  assert.deepEqual(personFormFrom(person({ jobTitle: null, phone: null }), formatCpf), {
    name: 'Ana Souza',
    cpf: '529.982.247-25',
    roles: ['SOCIO', 'PROCURADOR'],
    jobTitle: '',
    email: 'ana@exemplo.com',
    phone: '',
  });
});

test('papéis por extenso: na ordem da lista padrão; código desconhecido aparece como está', () => {
  const roles = [{ id: 'SOCIO', name: 'Sócio' }, { id: 'PROCURADOR', name: 'Procurador' }, { id: 'RESPONSAVEL_TECNICO', name: 'Responsável técnico' }];
  assert.equal(personRolesText(['PROCURADOR', 'SOCIO'], roles), 'Sócio, Procurador');
  assert.equal(personRolesText(['SOCIO', 'ANTIGO'], roles), 'Sócio, ANTIGO');
  assert.equal(personRolesText(['SOCIO'], undefined), 'SOCIO', 'lista ainda carregando');
  assert.equal(personRolesText([], roles), '');
});
