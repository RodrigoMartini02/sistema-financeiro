import assert from 'node:assert/strict';
import test from 'node:test';
import { TendersApiError } from '../services/tendersApiError';
import type { SanctionBaseResult, SanctionCheckResult, SanctionCompany, SanctionOverview, SanctionPerson, SanctionRecord } from '../types';
import {
  SANCTIONS_DISCLAIMER,
  SANCTION_BASE_NAMES,
  SANCTION_STATUS_LABELS,
  SANCTION_STATUS_TONES,
  applyCheckResult,
  checkedAtText,
  failedBasesText,
  isFreshlyChecked,
  progressText,
  recordDetailLines,
  recordPeriodText,
  recordTitle,
  recordsToggleText,
  runOutcomeText,
  runSanctionChecks,
  subjectsToCheck,
  summarizeSanctionBases,
} from './sanctions';

// Aba Sanções (item 6), a parte sem React: os textos e as cores da situação, o resumo de cada cartão, as linhas de um registro, quem
// o "Consultar todos" ainda precisa consultar e o laço que consulta um por vez (para no limite e quando a fonte não responde).

const NOW = new Date('2026-11-11T18:00:00.000Z');
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

const record = (overrides: Partial<SanctionRecord> = {}): SanctionRecord => ({
  category: 'Impedimento de licitar',
  organ: 'Ministério Exemplo',
  startDate: '2025-01-01',
  endDate: '2026-12-31',
  legalBasis: 'Lei 14.133/2021, art. 156',
  process: '12345.000001/2025-00',
  note: 'Abrangência: Âmbito do órgão sancionador',
  inForce: true,
  ...overrides,
});

const base = (overrides: Partial<SanctionBaseResult> = {}): SanctionBaseResult => ({
  base: 'CEIS',
  status: 'SEM_REGISTRO',
  checkedAt: '2026-11-11T15:00:00-03:00',
  stale: false,
  truncated: false,
  records: [],
  ...overrides,
});

const company = (overrides: Partial<SanctionCompany> = {}): SanctionCompany => ({
  name: 'Alfa Ltda',
  cnpj: '11222333000181',
  registration: { code: 'ATIVA', since: '2005-11-03', lookedUpAt: '2026-11-10T12:00:00-03:00' },
  bases: [base({ base: 'CEIS' }), base({ base: 'CNEP' }), base({ base: 'CEPIM' })],
  ...overrides,
});

const person = (id: number, overrides: Partial<SanctionPerson> = {}): SanctionPerson => ({
  id,
  name: `Pessoa ${id}`,
  roles: ['SOCIO'],
  bases: [base({ base: 'CEIS' }), base({ base: 'CNEP' })],
  ...overrides,
});

const overview = (overrides: Partial<SanctionOverview> = {}): SanctionOverview => ({
  available: true,
  referenceDate: '2026-11-11',
  reuseMinutes: 15,
  staleDays: 7,
  company: company(),
  people: [person(1), person(2)],
  ...overrides,
});

const never = (baseName: 'CEIS' | 'CNEP' | 'CEPIM') => base({ base: baseName, status: 'NAO_CONSULTADO', checkedAt: null });

test('os nomes por extenso dos cadastros e os textos fixos', () => {
  assert.equal(SANCTION_BASE_NAMES.CEIS.fullName, 'Cadastro Nacional de Empresas Inidôneas e Suspensas');
  assert.equal(SANCTION_BASE_NAMES.CNEP.fullName, 'Cadastro Nacional de Empresas Punidas');
  assert.equal(SANCTION_BASE_NAMES.CEPIM.fullName, 'Cadastro de Entidades Privadas sem Fins Lucrativos Impedidas');
  assert.equal(SANCTIONS_DISCLAIMER, 'Consulta automática. Confira sempre a certidão oficial antes da proposta.');
});

test('a situação tem texto e tom: sem registro é verde, em vigor é vermelho, encerrada é âmbar, nunca consultada é neutra', () => {
  assert.deepEqual(SANCTION_STATUS_LABELS, {
    NAO_CONSULTADO: 'Não consultado',
    SEM_REGISTRO: 'Sem registro encontrado',
    EM_VIGOR: 'Registro em vigor',
    ENCERRADA: 'Registros encerrados',
  });
  assert.deepEqual(SANCTION_STATUS_TONES, { NAO_CONSULTADO: 'muted', SEM_REGISTRO: 'success', EM_VIGOR: 'danger', ENCERRADA: 'warning' });
  for (const label of Object.values(SANCTION_STATUS_LABELS)) {
    assert.ok(!/regular|apta/i.test(label), `"${label}" não afirma regularidade`);
  }
});

test('o selo do cartão vem da pior situação entre as bases', () => {
  const summarize = (...statuses: Array<SanctionBaseResult['status']>) =>
    summarizeSanctionBases(statuses.map((status) => base({ status })));

  assert.deepEqual(summarize('SEM_REGISTRO', 'SEM_REGISTRO', 'SEM_REGISTRO'), { label: 'Sem registro encontrado', tone: 'success' });
  assert.deepEqual(summarize('SEM_REGISTRO', 'ENCERRADA', 'SEM_REGISTRO'), { label: 'Registros encerrados', tone: 'warning' });
  assert.deepEqual(summarize('SEM_REGISTRO', 'EM_VIGOR', 'ENCERRADA'), { label: 'Registro em vigor', tone: 'danger' });
  assert.deepEqual(summarize('EM_VIGOR', 'NAO_CONSULTADO'), { label: 'Registro em vigor', tone: 'danger' }, 'o registro em vigor pesa mais que a consulta incompleta');
  assert.deepEqual(summarize('SEM_REGISTRO', 'NAO_CONSULTADO'), { label: 'Consulta incompleta', tone: 'warning' });
  assert.deepEqual(summarize('ENCERRADA', 'NAO_CONSULTADO'), { label: 'Consulta incompleta', tone: 'warning' });
  assert.deepEqual(summarize('NAO_CONSULTADO', 'NAO_CONSULTADO'), { label: 'Não consultado', tone: 'muted' });
});

test('a data da consulta, com o aviso de consulta antiga e o texto de quando nunca foi consultada', () => {
  assert.equal(checkedAtText(base({ checkedAt: '2026-11-11T15:30:00-03:00' }), 7), 'Consultado em 11/11/2026 15:30');
  assert.equal(
    checkedAtText(base({ checkedAt: '2026-11-01T09:05:00-03:00', stale: true }), 7),
    'Consultado em 01/11/2026 09:05 (há mais de 7 dias; consulte de novo)',
  );
  assert.equal(checkedAtText(never('CEIS'), 7), 'Ainda não consultado.');
});

test('as bases que falharam: o texto no singular e no plural', () => {
  assert.equal(failedBasesText(['CNEP']), 'Não foi possível consultar o CNEP agora. Tente de novo em instantes.');
  assert.equal(failedBasesText(['CEIS', 'CNEP']), 'Não foi possível consultar o CEIS e o CNEP agora. Tente de novo em instantes.');
  assert.equal(failedBasesText(['CEIS', 'CNEP', 'CEPIM']), 'Não foi possível consultar o CEIS, o CNEP e o CEPIM agora. Tente de novo em instantes.');
});

test('o registro: título, período nas formas possíveis e as linhas de detalhe na ordem da tela', () => {
  assert.equal(recordTitle(record()), 'Impedimento de licitar');
  assert.equal(recordTitle(record({ category: null })), 'Registro sem descrição');

  assert.equal(recordPeriodText(record(), 'CEIS'), 'De 01/01/2025 até 31/12/2026');
  assert.equal(recordPeriodText(record({ endDate: null }), 'CNEP'), 'Desde 01/01/2025, sem data final');
  assert.equal(recordPeriodText(record({ startDate: null }), 'CEIS'), 'Até 31/12/2026');
  assert.equal(recordPeriodText(record({ startDate: null, endDate: null }), 'CEIS'), 'Sem datas informadas');
  assert.equal(recordPeriodText(record(), 'CEPIM'), null, 'o CEPIM não tem datas');

  assert.deepEqual(recordDetailLines(record(), 'CEIS'), [
    'Órgão: Ministério Exemplo',
    'De 01/01/2025 até 31/12/2026',
    'Fundamento: Lei 14.133/2021, art. 156',
    'Processo: 12345.000001/2025-00',
    'Abrangência: Âmbito do órgão sancionador',
  ]);
  assert.deepEqual(
    recordDetailLines(record({ organ: null, startDate: null, endDate: null, legalBasis: null, process: null, note: null }), 'CEPIM'),
    [],
  );
  assert.equal(recordsToggleText(1), 'Ver 1 registro');
  assert.equal(recordsToggleText(3), 'Ver 3 registros');
});

test('"em dia" é consultado há menos de 15 minutos em todas as bases', () => {
  assert.equal(isFreshlyChecked([base({ checkedAt: minutesAgo(5) }), base({ checkedAt: minutesAgo(14) })], NOW, 15), true);
  assert.equal(isFreshlyChecked([base({ checkedAt: minutesAgo(5) }), base({ checkedAt: minutesAgo(15) })], NOW, 15), false);
  assert.equal(isFreshlyChecked([base({ checkedAt: minutesAgo(5) }), never('CNEP')], NOW, 15), false, 'uma base nunca consultada');
  assert.equal(isFreshlyChecked([], NOW, 15), true);
});

test('quem o "Consultar todos" consulta: a empresa (com CNPJ) e as pessoas, menos quem está em dia', () => {
  const stale = [base({ base: 'CEIS', checkedAt: minutesAgo(60) }), base({ base: 'CNEP', checkedAt: minutesAgo(60) })];
  const fresh = [base({ base: 'CEIS', checkedAt: minutesAgo(2) }), base({ base: 'CNEP', checkedAt: minutesAgo(2) })];

  const neverChecked = [never('CEIS'), never('CNEP')];
  const everyone = overview({
    company: company({ bases: [never('CEIS')] }),
    people: [person(1, { bases: neverChecked }), person(2, { bases: neverChecked })],
  });
  assert.deepEqual(subjectsToCheck(everyone, NOW), [
    { personId: null, label: 'Empresa' },
    { personId: 1, label: 'Pessoa 1' },
    { personId: 2, label: 'Pessoa 2' },
  ]);

  const mixed = overview({
    company: company({ bases: [base({ checkedAt: minutesAgo(1) })] }),
    people: [person(1, { bases: fresh }), person(2, { bases: stale }), person(3, { bases: [never('CEIS'), never('CNEP')] })],
  });
  assert.deepEqual(subjectsToCheck(mixed, NOW), [
    { personId: 2, label: 'Pessoa 2' },
    { personId: 3, label: 'Pessoa 3' },
  ]);
});

test('sem CNPJ a empresa fica de fora; o colaborador (sem pessoas) só tem a empresa; tudo em dia, ninguém', () => {
  assert.deepEqual(subjectsToCheck(overview({ company: company({ cnpj: null, bases: [never('CEIS')] }), people: [] }), NOW), []);
  assert.deepEqual(subjectsToCheck(overview({ company: company({ bases: [never('CEIS')] }), people: null }), NOW), [{ personId: null, label: 'Empresa' }]);
  const upToDate = [base({ checkedAt: minutesAgo(3) })];
  assert.deepEqual(subjectsToCheck(overview({ company: company({ bases: upToDate }), people: [person(1, { bases: upToDate })] }), NOW), []);
});

test('o resultado de uma consulta troca a empresa ou a pessoa consultada na leitura da tela', () => {
  const current = overview();
  const updatedCompany = company({ name: 'Alfa Atualizada' });
  assert.equal(applyCheckResult(current, { company: updatedCompany, person: null, failed: [] }).company.name, 'Alfa Atualizada');
  assert.deepEqual(applyCheckResult(current, { company: updatedCompany, person: null, failed: [] }).people, current.people);

  const updatedPerson = person(2, { name: 'Pessoa 2 Atualizada' });
  const afterPerson = applyCheckResult(current, { company: null, person: updatedPerson, failed: [] });
  assert.deepEqual(afterPerson.people?.map((item) => item.name), ['Pessoa 1', 'Pessoa 2 Atualizada']);
  assert.equal(afterPerson.company, current.company);

  assert.equal(applyCheckResult(current, { company: null, person: person(9), failed: [] }).people?.length, 2, 'pessoa que saiu da lista não entra');
  assert.equal(applyCheckResult(overview({ people: null }), { company: null, person: person(1), failed: [] }).people, null);
  assert.equal(applyCheckResult(current, { company: null, person: null, failed: [] }), current);
});

// --- O laço do "Consultar todos" -----------------------------------------------------------------------------------------

const subjects = [
  { personId: null, label: 'Empresa' },
  { personId: 1, label: 'Ana' },
  { personId: 2, label: 'Beto' },
  { personId: 3, label: 'Caio' },
];
const ok = (failed: SanctionCheckResult['failed'] = []): SanctionCheckResult => ({ company: null, person: null, failed });

test('consulta um por vez, na ordem, e conta o andamento', async () => {
  const calls: Array<number | null> = [];
  const progress: Array<[number, number, string]> = [];
  const outcome = await runSanctionChecks(
    subjects,
    async (personId) => {
      calls.push(personId);
      return ok();
    },
    { onProgress: (done, total, current) => progress.push([done, total, current]) },
  );

  assert.deepEqual(calls, [null, 1, 2, 3]);
  assert.deepEqual(progress, [[0, 4, 'Empresa'], [1, 4, 'Ana'], [2, 4, 'Beto'], [3, 4, 'Caio']]);
  assert.deepEqual(outcome, { completed: 4, partial: [], failed: [], stoppedBy: null, message: null });
  assert.equal(runOutcomeText(outcome), null);
});

test('base que falhou num assunto: o assunto fica como parcial e o laço segue', async () => {
  const outcome = await runSanctionChecks(subjects, async (personId) => ok(personId === 1 ? ['CNEP'] : []));
  assert.deepEqual(outcome, { completed: 4, partial: ['Ana'], failed: [], stoppedBy: null, message: null });
  assert.equal(runOutcomeText(outcome), 'Não foi possível consultar tudo de: Ana. Tente de novo em instantes.');
});

test('o limite de consultas (429) para o laço, sem insistir, e a mensagem da API vai para a tela', async () => {
  const calls: Array<number | null> = [];
  const outcome = await runSanctionChecks(subjects, async (personId) => {
    calls.push(personId);
    if (personId === 1) throw new TendersApiError('Muitas consultas seguidas. Espere alguns minutos e tente de novo.', 429);
    return ok();
  });

  assert.deepEqual(calls, [null, 1], 'não tenta os seguintes');
  assert.deepEqual(outcome, {
    completed: 1,
    partial: [],
    failed: ['Ana'],
    stoppedBy: 'limit',
    message: 'Muitas consultas seguidas. Espere alguns minutos e tente de novo.',
  });
  assert.equal(
    runOutcomeText(outcome),
    'Muitas consultas seguidas. Espere alguns minutos e tente de novo. O que já foi consultado ficou guardado.',
  );
});

test('fonte fora do ar (503), sessão vencida (401) ou sem rede (0) também param o laço', async () => {
  for (const status of [503, 401, 0]) {
    const calls: Array<number | null> = [];
    const outcome = await runSanctionChecks(subjects, async (personId) => {
      calls.push(personId);
      throw new TendersApiError('A consulta de sanções não está disponível agora. Tente de novo mais tarde.', status);
    });
    assert.deepEqual(calls, [null], `status ${status}`);
    assert.equal(outcome.stoppedBy, 'unavailable');
    assert.deepEqual(outcome.failed, ['Empresa']);
  }
  const text = runOutcomeText(
    await runSanctionChecks(subjects, async () => {
      throw new TendersApiError('A consulta de sanções não está disponível agora. Tente de novo mais tarde.', 503);
    }),
  );
  assert.equal(text, 'A consulta de sanções não está disponível agora. Tente de novo mais tarde. O que já foi consultado ficou guardado.');
});

test('erro só daquele assunto (404 da pessoa que saiu, 400 sem CNPJ, 500) falha o assunto e o laço segue', async () => {
  for (const status of [400, 404, 500]) {
    const outcome = await runSanctionChecks(subjects, async (personId) => {
      if (personId === 2) throw new TendersApiError('erro', status);
      return ok();
    });
    assert.equal(outcome.stoppedBy, null, `status ${status}`);
    assert.equal(outcome.completed, 3);
    assert.deepEqual(outcome.failed, ['Beto']);
  }
  const outcome = await runSanctionChecks(subjects, async (personId) => {
    if (personId === 2) throw new Error('algo inesperado');
    return ok();
  });
  assert.equal(outcome.stoppedBy, 'unavailable', 'erro sem status (rede) para o laço');
});

test('quem sai da tela cancela o laço: nada mais é consultado e não há texto de erro', async () => {
  let cancelled = false;
  const calls: Array<number | null> = [];
  const outcome = await runSanctionChecks(
    subjects,
    async (personId) => {
      calls.push(personId);
      cancelled = true;
      return ok();
    },
    { isCancelled: () => cancelled },
  );
  assert.deepEqual(calls, [null]);
  assert.equal(outcome.stoppedBy, 'cancelled');
  assert.equal(runOutcomeText(outcome), null);
});

test('sem ninguém para consultar, o laço termina na hora', async () => {
  const outcome = await runSanctionChecks([], async () => {
    throw new Error('não deveria consultar');
  });
  assert.deepEqual(outcome, { completed: 0, partial: [], failed: [], stoppedBy: null, message: null });
});

test('o andamento: "Consultando 2 de 4: Ana…", sem passar do total', () => {
  assert.equal(progressText(0, 4, 'Empresa'), 'Consultando 1 de 4: Empresa…');
  assert.equal(progressText(1, 4, 'Ana'), 'Consultando 2 de 4: Ana…');
  assert.equal(progressText(4, 4, 'Caio'), 'Consultando 4 de 4: Caio…');
});
