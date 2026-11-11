import assert from 'node:assert/strict';
import test from 'node:test';
import type { Competitor, CompetitorSummary } from '../types';
import {
  COMPETITOR_CNPJ_MESSAGE,
  EMPTY_COMPETITOR_FORM,
  MAX_COMPETITOR_NICKNAME_LENGTH,
  competitorContextLines,
  competitorFormSchema,
  competitorFormToBody,
  competitorLimitText,
  competitorMetrics,
  competitorNicknameSchema,
  competitorTitle,
  findCompetitor,
  findCompetitorSummary,
} from './competitors';

const CNPJ = '11222333000181';
const competitor = (overrides: Partial<Competitor> = {}): Competitor => ({ cnpj: CNPJ, nickname: null, notify: true, createdAt: '2026-11-01T10:00:00-03:00', ...overrides });
const summary = (overrides: Partial<CompetitorSummary> = {}): CompetitorSummary => ({
  cnpj: CNPJ,
  name: 'Alfa Ltda',
  total: 1234,
  active: 12,
  last30Days: 3,
  lastPublishedAt: '2026-10-19T12:00:00-03:00',
  ...overrides,
});

function messagesOf(values: { cnpj: string; nickname: string }): string[] {
  const parsed = competitorFormSchema.safeParse(values);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
}

test('formulário: CNPJ com ou sem pontuação e os dígitos verificadores certos; apelido de até 80 caracteres', () => {
  assert.deepEqual(messagesOf({ cnpj: '11222333000181', nickname: '' }), []);
  assert.deepEqual(messagesOf({ cnpj: '11.222.333/0001-81', nickname: 'Alfa' }), []);
  assert.deepEqual(messagesOf({ cnpj: '11222333000180', nickname: '' }), [COMPETITOR_CNPJ_MESSAGE], 'dígito verificador errado');
  assert.deepEqual(messagesOf({ cnpj: '', nickname: '' }), [COMPETITOR_CNPJ_MESSAGE]);
  assert.deepEqual(messagesOf({ cnpj: '11111111111111', nickname: '' }), [COMPETITOR_CNPJ_MESSAGE], 'os 14 dígitos iguais não valem');
  assert.deepEqual(messagesOf({ cnpj: '123.456.789-09', nickname: '' }), [COMPETITOR_CNPJ_MESSAGE], 'CPF não é concorrente');
  assert.deepEqual(messagesOf({ cnpj: CNPJ, nickname: 'x'.repeat(MAX_COMPETITOR_NICKNAME_LENGTH) }), []);
  assert.deepEqual(messagesOf({ cnpj: CNPJ, nickname: 'x'.repeat(MAX_COMPETITOR_NICKNAME_LENGTH + 1) }), [`Apelido com até ${MAX_COMPETITOR_NICKNAME_LENGTH} caracteres`]);
  assert.deepEqual(messagesOf({ cnpj: CNPJ, nickname: `  ${'x'.repeat(MAX_COMPETITOR_NICKNAME_LENGTH)}  ` }), [], 'o apelido é aparado antes de contar');
  assert.equal(competitorNicknameSchema.safeParse({ nickname: '' }).success, true, 'editar: apelido vazio limpa');
  assert.equal(competitorNicknameSchema.safeParse({ nickname: 'x'.repeat(81) }).success, false);
  assert.deepEqual(EMPTY_COMPETITOR_FORM, { cnpj: '', nickname: '' });
});

test('formulário → corpo da API: o CNPJ só com os dígitos e o apelido aparado; apelido em branco não vai', () => {
  assert.deepEqual(competitorFormToBody({ cnpj: '11.222.333/0001-81', nickname: '  Alfa Rival ' }), { cnpj: CNPJ, nickname: 'Alfa Rival' });
  assert.deepEqual(competitorFormToBody({ cnpj: CNPJ, nickname: '   ' }), { cnpj: CNPJ });
});

test('título do card: o apelido; senão o nome no contrato mais recente; senão o CNPJ formatado', () => {
  assert.equal(competitorTitle(competitor({ nickname: 'Alfa Rival' }), summary()), 'Alfa Rival');
  assert.equal(competitorTitle(competitor(), summary()), 'Alfa Ltda');
  assert.equal(competitorTitle(competitor(), summary({ name: null })), '11.222.333/0001-81');
  assert.equal(competitorTitle(competitor(), undefined), '11.222.333/0001-81', 'sem o resumo do armazém ainda');
  assert.equal(competitorTitle(competitor(), null), '11.222.333/0001-81');
});

test('linhas de contexto: o nome quando o título é o apelido, e o CNPJ quando o título não é o CNPJ', () => {
  assert.deepEqual(competitorContextLines(competitor({ nickname: 'Alfa Rival' }), summary()), ['Alfa Ltda', 'CNPJ 11.222.333/0001-81']);
  assert.deepEqual(competitorContextLines(competitor({ nickname: 'Alfa Ltda' }), summary()), ['CNPJ 11.222.333/0001-81'], 'apelido igual ao nome: sem repetir');
  assert.deepEqual(competitorContextLines(competitor(), summary()), ['CNPJ 11.222.333/0001-81'], 'o título é o nome');
  assert.deepEqual(competitorContextLines(competitor({ nickname: 'Alfa' }), undefined), ['CNPJ 11.222.333/0001-81'], 'sem resumo: só o CNPJ');
  assert.deepEqual(competitorContextLines(competitor(), undefined), [], 'o título já é o CNPJ');
  assert.deepEqual(competitorContextLines(competitor(), summary({ name: null })), [], 'o título já é o CNPJ');
});

test('números do card: contratos, vigentes, novos em 30 dias e o último publicado; sem resumo, nenhum', () => {
  assert.deepEqual(competitorMetrics(summary()), [
    { label: 'Contratos', value: (1234).toLocaleString('pt-BR') },
    { label: 'Vigentes', value: '12' },
    { label: 'Novos em 30 dias', value: '3' },
    { label: 'Último publicado', value: '19/10/2026' },
  ]);
  assert.equal(competitorMetrics(summary({ total: 0, active: 0, last30Days: 0, lastPublishedAt: null, name: null }))[3]?.value, '—', 'sem contrato, sem data');
  assert.deepEqual(competitorMetrics(undefined), []);
});

test('limite no cabeçalho e busca na lista', () => {
  assert.equal(competitorLimitText(2, 30), '2 de 30 concorrentes');
  assert.equal(competitorLimitText(0, 1), '0 de 1 concorrente');
  const list = { items: [competitor(), competitor({ cnpj: '22493902000140', nickname: 'Beta' })] };
  assert.equal(findCompetitor(list, '22493902000140')?.nickname, 'Beta');
  assert.equal(findCompetitor(list, '06990590000123'), undefined);
  assert.equal(findCompetitor(undefined, CNPJ), undefined);
  assert.equal(findCompetitorSummary([summary(), summary({ cnpj: '22493902000140' })], '22493902000140')?.cnpj, '22493902000140');
  assert.equal(findCompetitorSummary(undefined, CNPJ), undefined);
});
