import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ComprasGovClient } from './comprasGovClient';
import { chooseProbeAgencies, renderFederalProbeReport, runFederalProbe, type FederalProbeDeps } from './federalProbe';
import { parseFederalAgency, type FederalAgency } from './federalMapping';

type Row = Record<string, unknown>;

interface Fixture {
  orgaos: Row[];
  contratos: Record<string, Row>;
}

const fixture = JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'comprasgov-contratos.json'), 'utf8')) as Fixture;
const NOW = new Date('2026-10-26T15:00:00Z');
const WINDOW = { from: '2024-01-01', to: '2024-12-31' };
const OPTIONS = { agencyCodes: [], sample: null, window: WINDOW, maxPages: null } as const;

function contract(name: string, changes: Row = {}): Row {
  const row = fixture.contratos[name];
  assert.ok(row, name);
  return { ...row, ...changes };
}

// As linhas da UFMG que a fonte simulada devolve: um contrato com número do PNCP, um sem, a colisão, o excluído e dois
// tipos que a tabela não conhece. O órgão 36000 não tem linha nenhuma.
const UFMG_ROWS: Row[] = [
  contract('contratoComPncp'),
  contract('contratoSemPncp'),
  contract('colisaoMaisRecente'),
  contract('excluido'),
  contract('empenho'),
  contract('credenciamento'),
  contract('tipoDesconhecido'),
  contract('categoriaDesconhecida'),
  contract('fimAntesDoInicio'),
  contract('semFim'),
];

/** A fonte simulada: a lista de órgãos da fixture e as linhas por órgão; registra os pedidos. */
function fakeClient(rowsByAgency: Record<string, Row[]>) {
  const urls: string[] = [];
  const client = new ComprasGovClient({
    baseUrl: 'https://compras.example',
    requestIntervalMs: 0,
    sleep: async () => undefined,
    fetch: async (input) => {
      const url = new URL(String(input));
      urls.push(`${url.pathname}?${url.searchParams.toString()}`);
      const rows = url.pathname.endsWith('2_consultarOrgao') ? fixture.orgaos : (rowsByAgency[url.searchParams.get('codigoOrgao') ?? ''] ?? []);
      const size = Number(url.searchParams.get('tamanhoPagina') ?? 500);
      const page = Number(url.searchParams.get('pagina') ?? 1);
      const totalPages = Math.max(1, Math.ceil(rows.length / size));
      return new Response(
        JSON.stringify({ resultado: rows.slice((page - 1) * size, page * size), totalRegistros: rows.length, totalPaginas: totalPages, paginasRestantes: Math.max(0, totalPages - page) }),
        { status: 200 },
      );
    },
  });
  const progress: string[] = [];
  const deps: FederalProbeDeps = { client, now: () => NOW, progress: (message) => progress.push(message) };
  return { deps, urls, progress };
}

test('sondagem da UFMG: completude, tipos, número do PNCP, colisão, excluída, desconhecidos e CNPJ', async () => {
  const { deps, urls } = fakeClient({ '26238': UFMG_ROWS });
  const report = await runFederalProbe(deps, OPTIONS);

  assert.deepEqual(report.window, WINDOW);
  assert.deepEqual(report.agenciesList, { announced: 6, rows: 6, federal: 5, sisg: 4, withoutValidCnpj: 1, complete: true });
  assert.equal(report.agencies.length, 1, 'sem órgão pedido, a UFMG');
  const ufmg = report.agencies[0];
  assert.ok(ufmg);
  assert.deepEqual([ufmg.code, ufmg.found, ufmg.name], ['26238', true, 'UNIVERSIDADE FEDERAL DE MINAS GERAIS']);
  assert.deepEqual([ufmg.announced, ufmg.rowsRead, ufmg.complete, ufmg.passes], [10, 10, true, 1]);

  // CNPJ: o cadastro traz a filial; os números do PNCP trazem a matriz.
  assert.deepEqual([ufmg.registeredCnpj, ufmg.headOfficeCnpj, ufmg.resolvedCnpj], ['17217985005840', '17217985000104', '17217985000104']);
  assert.deepEqual(ufmg.learnedCnpjs, [{ cnpj: '17217985000104', rows: 1 }]);
  assert.equal(ufmg.learnedMatchesHeadOffice, true);

  assert.deepEqual(ufmg.skipped, { withPncpNumber: 1, excluded: 1, recent: 0, agencyWithoutCnpj: 0, termEndsBeforeStart: 1, pncpTwin: 0 }, 'o fim antes do início é contado à parte');
  assert.equal(ufmg.invalid, 0);
  assert.deepEqual(ufmg.invalidReasons, []);
  assert.equal(ufmg.mapped, 7);
  assert.deepEqual([ufmg.collidingKeys, ufmg.collidingExtraRows], [1, 1], 'o contrato registrado duas vezes');
  assert.equal(ufmg.withoutEndDate, 1);
  assert.deepEqual(ufmg.byType['50'], { name: 'Contrato', rows: 5, withPncpNumber: 1, shareWithPncpNumber: 0.2, mapped: 3 });
  assert.equal(ufmg.byType['99']?.rows, 1);
  assert.deepEqual(ufmg.unknownTypes, [
    { code: '51', name: 'Credenciamento', rows: 1 },
    { code: '77', name: 'Termo Novo', rows: 1 },
  ]);
  assert.deepEqual(ufmg.unknownCategories, [{ name: 'Categoria Nova', rows: 1 }]);
  assert.equal(ufmg.lastInclusion, '2026-04-30T14:18:46');
  assert.equal(ufmg.units >= 3, true);

  assert.equal(report.totals.shareWithPncpNumberByType['50'], 0.2);
  assert.equal(report.totals.windowsComplete, 1);
  assert.equal(report.totals.windowsIncomplete, 0);
  assert.equal(report.requests, urls.length);
  // O que a sondagem pede: a lista de órgãos e os contratos por início da vigência, só da UFMG.
  assert.match(urls[0] ?? '', /^\/modulo-uasg\/2_consultarOrgao\?/);
  const contractsUrl = new URLSearchParams((urls[1] ?? '').split('?')[1]);
  assert.deepEqual(
    [contractsUrl.get('codigoOrgao'), contractsUrl.get('dataVigenciaInicialMin'), contractsUrl.get('dataVigenciaInicialMax')],
    ['26238', '2024-01-01', '2024-12-31'],
  );
  assert.equal(urls.length, 2);
});

test('órgão fora da lista ou sem linhas entra no relatório, sem derrubar a sondagem', async () => {
  const { deps } = fakeClient({});
  const report = await runFederalProbe(deps, { ...OPTIONS, agencyCodes: ['36000', '99999'] });
  const [health, ghost] = report.agencies;
  assert.deepEqual([health?.found, health?.rowsRead, health?.complete, health?.resolvedCnpj], [true, 0, true, '00394544000185']);
  assert.deepEqual([ghost?.found, ghost?.name, ghost?.resolvedCnpj, ghost?.learnedMatchesHeadOffice], [false, null, null, null]);
});

test('órgão sem CNPJ válido: as linhas são puladas com o motivo', async () => {
  const { deps } = fakeClient({ '32991': [contract('orgaoSemCnpj')] });
  const report = await runFederalProbe(deps, { ...OPTIONS, agencyCodes: ['32991'] });
  const agency = report.agencies[0];
  assert.equal(agency?.resolvedCnpj, null);
  assert.equal(agency?.skipped.agencyWithoutCnpj, 1);
  assert.equal(agency?.mapped, 0);
});

test('com limite de páginas a leitura não vale como completa e o relatório diz', async () => {
  const many = Array.from({ length: 30 }, (_, index) => contract('contratoSemPncp', { numeroContrato: `${String(index).padStart(5, '0')}/2024` }));
  const { deps } = fakeClient({ '26238': many });
  const report = await runFederalProbe(deps, { ...OPTIONS, maxPages: 1 });
  assert.deepEqual([report.agencies[0]?.complete, report.totals.windowsIncomplete], [false, 1]);
});

test('o relatório sai como JSON', async () => {
  const { deps } = fakeClient({ '26238': UFMG_ROWS });
  const text = renderFederalProbeReport(await runFederalProbe(deps, OPTIONS));
  assert.equal(JSON.parse(text).agencies[0].code, '26238');
  assert.doesNotMatch(text, /FULANO|12345678901/, 'a sondagem não imprime documento de pessoa');
});

test('escolha dos órgãos: os pedidos, a UFMG se nada for pedido, e a amostra espalhada pelo SISG sem repetir', () => {
  const agencies: FederalAgency[] = Array.from({ length: 40 }, (_, index) => ({
    code: String(10_000 + index),
    name: `ÓRGÃO ${index}`,
    cnpj: index % 10 === 0 ? null : '17217985005840',
    usesSisg: index % 3 !== 0,
  }));
  assert.deepEqual(chooseProbeAgencies(agencies, { agencyCodes: [], sample: null }), ['26238']);
  assert.deepEqual(chooseProbeAgencies(agencies, { agencyCodes: ['52121'], sample: null }), ['52121']);
  const sample = chooseProbeAgencies(agencies, { agencyCodes: ['26238'], sample: 5 });
  assert.equal(sample.length, 6);
  assert.equal(sample[0], '26238');
  assert.equal(new Set(sample).size, 6);
  const picked = sample.slice(1).map((code) => agencies.find((agency) => agency.code === code));
  assert.ok(picked.every((agency) => agency?.usesSisg === true && agency.cnpj !== null), 'só do SISG e com CNPJ');
  assert.deepEqual(sample.slice(1), [...sample.slice(1)].sort(), 'espalhada pela lista ordenada');
  assert.deepEqual(chooseProbeAgencies(agencies, { agencyCodes: [], sample: 2 }).length, 2, 'só a amostra: sem a UFMG por padrão');
  // Os órgãos da fixture passam pelo mesmo caminho do relatório.
  assert.equal(fixture.orgaos.map(parseFederalAgency).filter((agency) => agency !== null).length, 5);
});
