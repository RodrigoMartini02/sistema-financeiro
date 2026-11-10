import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompanyProfile } from '../types';
import {
  buildCompanyUpdate,
  cnaeLabel,
  companyFormKey,
  companyFormValuesFrom,
  formatCnae,
  hasCompanyChanges,
  hasCompanyData,
  legalNatureLabel,
  lookupConfirmation,
  lookupDateText,
  registrationStatusView,
  validateCompanyForm,
} from './companyProfile';

function company(overrides: Partial<CompanyProfile> = {}): CompanyProfile {
  return {
    accountId: 1, document: '11222333000181', legalName: 'Empresa Alfa Ltda', tradeName: null, openingDate: null, size: null,
    legalType: null, legalNature: null, registrationStatus: null, mainCnae: null, secondaryCnaes: [], zipCode: null,
    street: null, number: null, complement: null, district: null, city: null, state: null, phone: null, email: null,
    lookedUpAt: null,
    ...overrides,
  };
}

const FILLED = company({
  tradeName: 'Alfa', openingDate: '2004-09-01', size: 'EPP', legalType: 'LTDA',
  legalNature: { code: '2062', description: 'Sociedade Empresária Limitada' },
  registrationStatus: { code: 'ATIVA', since: '2005-11-03' },
  mainCnae: { code: '6319400', description: 'Portais' }, secondaryCnaes: [{ code: '6204000', description: 'Consultoria' }],
  zipCode: '04538133', street: 'Avenida Brigadeiro Faria Lima', number: '3477', complement: 'Andar 17', district: 'Itaim Bibi',
  city: 'São Paulo', state: 'SP', phone: '(11) 2395-8400', email: 'contato@alfa.test', lookedUpAt: '2026-11-10T12:00:00-03:00',
});

test('CNAE: 7 dígitos como a Receita escreve; fora disso, como veio; com a descrição quando há', () => {
  assert.equal(formatCnae('6319400'), '6319-4/00');
  assert.equal(formatCnae('0111301'), '0111-3/01');
  assert.equal(formatCnae('631940'), '631940');
  assert.equal(formatCnae(''), '');
  assert.equal(cnaeLabel({ code: '6319400', description: 'Portais' }), '6319-4/00 · Portais');
  assert.equal(cnaeLabel({ code: '6319400', description: '  ' }), '6319-4/00');
});

test('natureza jurídica: código com hífen e descrição; só um dos dois quando falta o outro; nada, null', () => {
  assert.equal(legalNatureLabel({ code: '2062', description: 'Sociedade Empresária Limitada' }), '206-2 · Sociedade Empresária Limitada');
  assert.equal(legalNatureLabel({ code: null, description: 'Sociedade Anônima' }), 'Sociedade Anônima');
  assert.equal(legalNatureLabel({ code: '2062', description: null }), '206-2');
  assert.equal(legalNatureLabel({ code: '99', description: '' }), '99');
  assert.equal(legalNatureLabel({ code: null, description: null }), null);
  assert.equal(legalNatureLabel(null), null);
});

test('situação cadastral: nome e cor do selo (ativa verde, suspensa e inapta alerta, baixada e nula vermelho) e "desde"', () => {
  assert.deepEqual(registrationStatusView({ code: 'ATIVA', since: '2005-11-03' }), { label: 'Ativa', tone: 'income', since: 'desde 03/11/2005' });
  assert.deepEqual(registrationStatusView({ code: 'SUSPENSA', since: null }), { label: 'Suspensa', tone: 'warning', since: null });
  assert.equal(registrationStatusView({ code: 'INAPTA', since: null }).tone, 'warning');
  assert.equal(registrationStatusView({ code: 'BAIXADA', since: null }).tone, 'expense');
  assert.equal(registrationStatusView({ code: 'NULA', since: null }).tone, 'expense');
  assert.deepEqual(
    registrationStatusView({ code: 'EM_LIQUIDACAO' as never, since: null }),
    { label: 'EM_LIQUIDACAO', tone: 'warning', since: null },
    'situação que a tela não conhece aparece como veio, em alerta',
  );
});

test('data da consulta: com a hora de Brasília; nunca consultou, nada', () => {
  assert.equal(lookupDateText('2026-11-10T12:00:00-03:00'), 'Dados da Receita consultados em 10/11/2026 12:00');
  assert.equal(lookupDateText(null), null);
});

test('já tem dados: só a razão social não conta; qualquer outro campo, a consulta ou um fato da Receita contam', () => {
  assert.equal(hasCompanyData(company()), false);
  assert.equal(hasCompanyData(company({ phone: '(11) 3000-0000' })), true);
  assert.equal(hasCompanyData(company({ state: 'SP' })), true);
  assert.equal(hasCompanyData(company({ lookedUpAt: '2026-11-10T12:00:00-03:00' })), true);
  assert.equal(hasCompanyData(company({ registrationStatus: { code: 'ATIVA', since: null } })), true);
  assert.equal(hasCompanyData(company({ mainCnae: { code: '6319400', description: '' } })), true);
  assert.equal(hasCompanyData(company({ secondaryCnaes: [{ code: '6204000', description: '' }] })), true);
  assert.equal(hasCompanyData(company({ legalNature: { code: '2062', description: null } })), true);
  assert.equal(hasCompanyData(FILLED), true);
});

test('confirmação da consulta: mostra o CNPJ com pontuação e avisa o que acontece; só fala em descartar se há alteração não salva', () => {
  const plain = lookupConfirmation('11222333000181', false);
  assert.equal(plain.title, 'Buscar dados do CNPJ');
  assert.equal(plain.confirmLabel, 'Buscar dados');
  assert.match(plain.message, /CNPJ 11\.222\.333\/0001-81/);
  assert.match(plain.message, /será substituído/);
  assert.match(plain.message, /fica como está/);
  assert.equal(plain.message.includes('descartadas'), false);
  assert.match(lookupConfirmation('11222333000181', true).message, /ainda não salvou serão descartadas/);
});

test('formulário: o perfil vira texto dos campos (vazio onde não há dado, CEP com máscara)', () => {
  assert.deepEqual(companyFormValuesFrom(company()), {
    legalName: 'Empresa Alfa Ltda', tradeName: '', openingDate: '', size: '', legalType: '', zipCode: '', street: '', number: '',
    complement: '', district: '', city: '', state: '', phone: '', email: '',
  });
  const filled = companyFormValuesFrom(FILLED);
  assert.deepEqual(
    [filled.tradeName, filled.openingDate, filled.size, filled.legalType, filled.zipCode, filled.state, filled.phone, filled.email],
    ['Alfa', '2004-09-01', 'EPP', 'LTDA', '04538-133', 'SP', '(11) 2395-8400', 'contato@alfa.test'],
  );
});

test('validação: razão social obrigatória, CEP com 8 dígitos e e-mail válido; o resto é livre', () => {
  const values = companyFormValuesFrom(FILLED);
  assert.deepEqual(validateCompanyForm(values), {});
  assert.deepEqual(validateCompanyForm({ ...values, legalName: '   ' }), { legalName: 'Informe a razão social' });
  assert.deepEqual(validateCompanyForm({ ...values, zipCode: '04538-13' }), { zipCode: 'Informe um CEP válido' });
  assert.deepEqual(validateCompanyForm({ ...values, zipCode: '' }), {}, 'CEP em branco limpa');
  assert.deepEqual(validateCompanyForm({ ...values, email: 'sem-arroba' }), { email: 'Informe um e-mail válido' });
  assert.deepEqual(validateCompanyForm({ ...values, email: '' }), {}, 'e-mail em branco limpa');
  assert.deepEqual(
    Object.keys(validateCompanyForm({ ...values, legalName: '', zipCode: '1', email: 'x' })).sort(),
    ['email', 'legalName', 'zipCode'],
  );
});

test('corpo da edição: só o que mudou; sem mudança, nada; espaços, máscara do CEP e caixa do e-mail não contam como mudança', () => {
  const initial = companyFormValuesFrom(FILLED);
  assert.deepEqual(buildCompanyUpdate(initial, initial), {});
  assert.equal(hasCompanyChanges(initial, initial), false);

  assert.deepEqual(buildCompanyUpdate({ ...initial, phone: ' (11) 4000-0000 ', size: 'ME' }, initial), { phone: '(11) 4000-0000', size: 'ME' });
  assert.deepEqual(buildCompanyUpdate({ ...initial, zipCode: '04538133', email: ' CONTATO@alfa.test ' }, initial), {}, 'mesmo CEP e e-mail');
  assert.deepEqual(buildCompanyUpdate({ ...initial, zipCode: '01310-100' }, initial), { zipCode: '01310100' }, 'CEP só com os dígitos');
  assert.deepEqual(buildCompanyUpdate({ ...initial, email: ' Novo@Alfa.test ' }, initial), { email: 'novo@alfa.test' });
  assert.equal(hasCompanyChanges({ ...initial, city: 'Campinas' }, initial), true);
});

test('corpo da edição: apagar um campo manda o texto vazio (a API limpa); a razão social nunca vai vazia pela validação', () => {
  const initial = companyFormValuesFrom(FILLED);
  assert.deepEqual(
    buildCompanyUpdate({ ...initial, tradeName: '', openingDate: '', size: '', legalType: '', zipCode: '', complement: '' }, initial),
    { tradeName: '', openingDate: '', size: '', legalType: '', zipCode: '', complement: '' },
  );
  assert.deepEqual(validateCompanyForm({ ...initial, legalName: '' }), { legalName: 'Informe a razão social' });
});

test('chave do formulário: muda quando os dados salvos mudam e quando há consulta nova; não muda se nada mudou', () => {
  const key = companyFormKey(FILLED);
  assert.equal(companyFormKey({ ...FILLED }), key);
  assert.notEqual(companyFormKey({ ...FILLED, phone: '(11) 4000-0000' }), key, 'salvou outro telefone');
  assert.notEqual(companyFormKey({ ...FILLED, lookedUpAt: '2026-11-11T09:30:00-03:00' }), key, 'consultou de novo, mesmo sem mudar nada');
  assert.equal(companyFormKey({ ...FILLED, registrationStatus: { code: 'BAIXADA', since: null } }), key, 'fato da Receita não é do formulário');
});
