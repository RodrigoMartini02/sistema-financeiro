import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { sql } from 'drizzle-orm';
import {
  closeLocalTestDatabase,
  createTestAccount,
  databaseTestsSkipReason,
  insertTestNotice,
  trackNotice,
  withRollback,
} from '../collector/dbTestSupport';
import { tenderTrackingHistory } from '../db/schema';
import { requesterOf, uniqueToken } from './apiTestSupport';
import { readDashboard } from './dashboard';

// Dashboard (escopo, seção 9.4, e plano .plans/licitacoes-dashboard-gestao.md). A base local tem editais reais, então:
// - as publicações usam um "hoje" em 2031, onde não há edital real (os abertos são comparados com >=, porque a base local tem editais abertos reais);
// - os acompanhamentos são de uma conta de teste, com o relógio de verdade (o banco decide o que está aberto).

const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const NOW_2031 = new Date('2031-03-15T15:00:00Z');

describe('dashboard (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('publicações por dia, mês e modalidade até ontem (dia de Brasília), abertos, esfera e órgãos', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'dash-mercado');
      const agencyA = { agencyCnpj: '11222333000181', agencyName: 'Órgão A' };
      const agencyB = { agencyCnpj: '99888777000166', agencyName: 'Órgão B' };
      const published = (publishedAt: string, modalityId: number, extra: Parameters<typeof insertTestNotice>[1] = {}) =>
        insertTestNotice(tx, { procurementObject: `Publicado ${uniqueToken()}`, publishedAt, modalityId, ...extra });

      // Ontem em Brasília: o das 23:30 já é 02:30 UTC de hoje, e ainda é de ontem.
      await published('2031-03-14T12:00:00-03:00', 2, agencyA);
      await published('2031-03-14T13:00:00-03:00', 2, agencyA);
      await published('2031-03-14T14:00:00-03:00', 2, agencyA);
      await published('2031-03-14T23:30:00-03:00', 2, agencyB);
      await published('2031-03-14T10:00:00-03:00', 3, agencyB);
      // Hoje é parcial e a situação revogada não conta; 8 dias antes só entra nos 30; 12/02 só no mês de fevereiro.
      await published('2031-03-15T09:00:00-03:00', 2, agencyA);
      await published('2031-03-14T15:00:00-03:00', 2, { ...agencyA, situationId: 2 });
      await published('2031-03-08T12:00:00-03:00', 2);
      await published('2031-03-07T12:00:00-03:00', 3);
      await published('2031-02-12T12:00:00-03:00', 2);
      await published('2031-02-12T13:00:00-03:00', 2);

      // Abertos agora (o banco decide pelo relógio de verdade): 2 na modalidade 2 (federais) e 1 na 3 (sem esfera).
      await insertTestNotice(tx, { procurementObject: `Aberto ${uniqueToken()}`, modalityId: 2, governmentSphere: 'F', proposalClosesAt: inDays(30) });
      await insertTestNotice(tx, { procurementObject: `Aberto ${uniqueToken()}`, modalityId: 2, governmentSphere: 'F', proposalClosesAt: inDays(31) });
      await insertTestNotice(tx, { procurementObject: `Aberto ${uniqueToken()}`, modalityId: 3, governmentSphere: null, proposalClosesAt: inDays(32) });

      const dashboard = await readDashboard(tx, requesterOf(account), NOW_2031);

      assert.equal(dashboard.cards.publishedYesterday, 5, 'só ontem: 4 da modalidade 2 e 1 da 3');
      assert.equal(dashboard.cards.published7Days, 6, 'ontem e o de 8/03: os 7 dias vão de 8/03 a 14/03');
      assert.equal(dashboard.cards.published30Days, 7);
      assert.ok(dashboard.cards.openNow >= 3, 'a base local também tem editais reais abertos');

      assert.equal(dashboard.publications.daily.length, 30);
      assert.equal(dashboard.publications.daily.at(-1)?.day, '2031-03-14');
      assert.deepEqual(dashboard.publications.daily.at(-1)?.byModality, { '2': 4, '3': 1 });
      assert.equal(dashboard.publications.monthly.length, 12);
      const [february, march] = dashboard.publications.monthly.slice(-2);
      assert.deepEqual([february?.month, february?.partial, february?.byModality], ['2031-02', false, { '2': 2 }]);
      assert.deepEqual([march?.month, march?.partial, march?.byModality], ['2031-03', true, { '2': 5, '3': 2 }]);

      const [two, three] = [2, 3].map((id) => dashboard.modalities.find((card) => card.id === id));
      assert.deepEqual(
        { ...two, open: undefined, daily: two?.daily.slice(-2) },
        { id: 2, name: 'Diálogo Competitivo', published30Days: 5, open: undefined, analyzing: 0, participating: 0, participated: 0, daily: [0, 4] },
      );
      assert.deepEqual([three?.name, three?.published30Days], ['Concurso', 2]);
      assert.ok((two?.open ?? 0) >= 2 && (three?.open ?? 0) >= 1, 'abertos: os de teste, mais os reais da base local');
      assert.deepEqual(dashboard.modalities.map((card) => card.id), [...dashboard.modalities.map((card) => card.id)].sort((a, b) => a - b));

      assert.deepEqual(dashboard.topAgencies, [
        { cnpj: '11222333000181', name: 'Órgão A', count: 3 },
        { cnpj: '99888777000166', name: 'Órgão B', count: 2 },
      ]);
      assert.ok(dashboard.openBySphere.some((item) => item.sphere === 'F' && item.count >= 2));
      assert.ok(dashboard.openBySphere.some((item) => item.sphere === null && item.count >= 1));
      assert.ok(dashboard.publications.coverageSince === null || /^\d{4}-\d{2}-\d{2}$/.test(dashboard.publications.coverageSince));
    });
  });

  test('acompanhamentos da conta por modalidade, participei, funil e carga de prazos; outra conta não entra', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'dash-conta');
      const other = await createTestAccount(tx, 'dash-conta-outra');
      const tracked = (modalityId: number, closesInDays: number) =>
        insertTestNotice(tx, { procurementObject: `Acompanhado ${uniqueToken()}`, modalityId, proposalClosesAt: inDays(closesInDays) });
      const track = (noticeId: number, status: 'ANALISAR' | 'PARTICIPAR' | 'DESCARTADO') =>
        trackNotice(tx, { accountId: account.accountId, noticeId, status, userId: account.ownerId });

      const analyzingSoon = await tracked(2, 3);
      const participatingNext = await tracked(2, 10);
      const participatingLater = await tracked(3, 20);
      const analyzingFar = await tracked(3, 40);
      const participated = await tracked(2, -2);
      const oldAnalysis = await tracked(3, -5);
      const discarded = await tracked(2, 15);
      await track(analyzingSoon, 'ANALISAR');
      await track(participatingNext, 'PARTICIPAR');
      await track(participatingLater, 'PARTICIPAR');
      await track(analyzingFar, 'ANALISAR');
      await track(participated, 'PARTICIPAR');
      await track(oldAnalysis, 'ANALISAR');
      await track(discarded, 'DESCARTADO');
      await trackNotice(tx, { accountId: other.accountId, noticeId: analyzingSoon, status: 'PARTICIPAR', userId: other.ownerId });
      // A entrada de 40 dias atrás fica fora do funil dos últimos 30 dias.
      await tx
        .update(tenderTrackingHistory)
        .set({ createdAt: sql`now() - interval '40 days'` })
        .where(sql`${tenderTrackingHistory.noticeId} = ${oldAnalysis}`);

      const dashboard = await readDashboard(tx, requesterOf(account), new Date());

      assert.deepEqual(
        [dashboard.cards.analyzing, dashboard.cards.participating, dashboard.cards.participated, dashboard.cards.closingIn7Days],
        [2, 2, 1, 1],
        'em análise e vou participar só com prazo aberto; participei é Vou participar com prazo vencido; descartado não conta',
      );
      const [two, three] = [2, 3].map((id) => dashboard.modalities.find((card) => card.id === id));
      assert.deepEqual([two?.analyzing, two?.participating, two?.participated], [1, 1, 1]);
      assert.deepEqual([three?.analyzing, three?.participating, three?.participated], [1, 1, 0]);

      assert.deepEqual(
        dashboard.funnel,
        { tracked: 5, participating: 3, participated: 1 },
        'entraram nos últimos 30 dias 5 (o de 40 dias e o descartado ficam de fora); 3 estão em Vou participar; 1 já venceu',
      );
      assert.deepEqual(
        dashboard.deadlineLoad.map((week) => week.count),
        [1, 1, 1, 0],
        'em análise e vou participar abertos, por semana de encerramento: 3, 10 e 20 dias; o de 40 dias passa das 4 semanas',
      );

      const empty = await readDashboard(tx, requesterOf(await createTestAccount(tx, 'dash-vazia')), new Date());
      assert.deepEqual(
        [empty.cards.analyzing, empty.cards.participating, empty.cards.participated, empty.cards.closingIn7Days],
        [0, 0, 0, 0],
      );
      assert.deepEqual(empty.funnel, { tracked: 0, participating: 0, participated: 0 });
      assert.deepEqual(empty.deadlineLoad.map((week) => week.count), [0, 0, 0, 0]);
      assert.equal(empty.publications.daily.length, 30);
      assert.equal(empty.publications.monthly.length, 12);
      assert.equal(typeof empty.lastRunFailed, 'boolean');
    });
  });
});
