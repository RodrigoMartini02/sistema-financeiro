import { ComprasGovRequestError, RETRY_PAGE_SIZES, type ComprasGovClient, type ComprasGovEndpoint, type ComprasGovWindow } from './comprasGovClient';
import { addCalendarDays } from './dates';
import { payloadHash } from './mapping';

// Leitura dos contratos, órgãos e unidades federais do Compras.gov.br (plano .plans/licitacoes-contratos-federais.md).
// A fonte não dá id das linhas e entrega a paginação com falhas (uma linha em duas páginas, outras em nenhuma, com a soma
// igual ao total; medido em 26/10/2026 com 10 órgãos de 2025: a primeira leitura veio incompleta em 6 de 10, de 78% a 99%
// das linhas). A conferência é pela linha inteira: uma leitura só vale quando as linhas distintas somam o
// `totalRegistros`; faltando, a janela é lida de novo com outro tamanho de página (RETRY_PAGE_SIZES) e só as linhas que
// faltavam entram. Numa janela que se pode dividir, uma segunda leitura (499) basta antes de dividir: no Ministério da Saúde
// (17 mil linhas em 2025), nem quatro leituras fecharam (faltaram 2 linhas), e janelas menores têm menos páginas para
// errar. Então a janela é dividida ao meio, e cada metade é conferida sozinha, até FEDERAL_MAX_SPLIT_DEPTH divisões
// (uma janela de um ano chega a faixas de cerca de 11 dias): o limite evita centenas de pedidos por uma única linha que a
// fonte nunca entrega, e a janela que não completa fica sem valer como lida.

/** Divisões ao meio de uma janela que não completa: 5 levam um ano a faixas de 11 ou 12 dias. */
export const FEDERAL_MAX_SPLIT_DEPTH = 5;

export interface FederalReadQuery {
  endpoint: ComprasGovEndpoint;
  /** Filtros além da janela (`codigoOrgao`, `statusOrgao`...). */
  params: Record<string, string>;
  /** Nulo nas consultas sem janela (órgãos e unidades). */
  window: ComprasGovWindow | null;
  /** Limita as páginas da primeira leitura (só a sondagem usa); com limite, a leitura não vale como completa e não se divide. */
  maxPages?: number;
}

export interface FederalRead {
  /** As linhas completas distintas, na ordem em que vieram. */
  rows: unknown[];
  /** O total que a fonte informou. */
  announced: number;
  /** Todas as linhas vieram: distintas ≥ o total informado (e, se a janela foi dividida, cada metade completa). */
  complete: boolean;
  /** Leituras da janela inteira, de 1 a 4 (2 numa janela que se pode dividir). */
  passes: number;
  /** Linhas distintas da primeira leitura (a que a fonte costuma entregar com páginas que não se encaixam). */
  firstPassDistinct: number;
  /** Linhas que vieram de novo (na mesma leitura ou nas seguintes) e foram descartadas. */
  repeated: number;
  /** Páginas pedidas, de todas as leituras. */
  pages: number;
  /** Divisões da janela ao meio feitas para completar a leitura (todas as que houve, nas metades também). */
  splits: number;
  /** A falha da fonte que interrompeu a leitura, se houve: o que veio antes continua em `rows`. */
  failure: ComprasGovRequestError | null;
}

/** Janela que se pode dividir ao meio: tem mais de um dia, é de uma consulta com janela, não é uma amostra e ainda não foi dividida demais. */
function canSplit(query: FederalReadQuery, depth: number): query is FederalReadQuery & { window: ComprasGovWindow } {
  return (
    query.window !== null &&
    query.window.from < query.window.to &&
    query.endpoint.dateParams !== null &&
    query.maxPages === undefined &&
    depth < FEDERAL_MAX_SPLIT_DEPTH
  );
}

/** O dia do meio da janela: a primeira metade vai até ele e a segunda começa no dia seguinte. */
function middleDay(window: ComprasGovWindow): string {
  const days = (Date.parse(`${window.to}T00:00:00Z`) - Date.parse(`${window.from}T00:00:00Z`)) / 86_400_000;
  return addCalendarDays(window.from, Math.floor(days / 2));
}

/**
 * Lê uma consulta da fonte de ponta a ponta, conferindo a completude, relendo em outro tamanho de página e, se ainda
 * faltar linha, dividindo a janela ao meio. Falha da fonte (ComprasGovRequestError) não lança: encerra a leitura com
 * `failure` e as linhas que já vieram; qualquer outro erro lança.
 */
export async function readFederal(client: ComprasGovClient, query: FederalReadQuery, depth = 0): Promise<FederalRead> {
  const seen = new Map<string, unknown>();
  const read: FederalRead = { rows: [], announced: 0, complete: false, passes: 0, firstPassDistinct: 0, repeated: 0, pages: 0, splits: 0, failure: null };
  const splittable = canSplit(query, depth);
  const pageSizes: (number | undefined)[] = !query.endpoint.pageSizeParam ? [undefined] : splittable ? [undefined, RETRY_PAGE_SIZES[0]] : [undefined, ...RETRY_PAGE_SIZES];

  try {
    for (const pageSize of pageSizes) {
      read.passes += 1;
      const pagesOptions = {
        endpoint: query.endpoint,
        params: query.params,
        ...(pageSize !== undefined ? { pageSize } : {}),
        // O limite de páginas vale para a primeira leitura: a sondagem só quer uma amostra.
        ...(query.maxPages !== undefined ? { maxPages: query.maxPages } : {}),
      };
      for await (const page of client.pages(query.window, pagesOptions)) {
        read.pages += 1;
        if (page.pageNumber === 1) {
          read.announced = page.totalRecords;
        }
        for (const raw of page.records) {
          const identity = payloadHash(raw);
          if (seen.has(identity)) {
            read.repeated += 1;
          } else {
            seen.set(identity, raw);
          }
        }
      }
      if (read.passes === 1) {
        read.firstPassDistinct = seen.size;
      }
      if (seen.size >= read.announced || query.maxPages !== undefined) {
        break;
      }
    }

    // Ainda faltou linha depois das leituras da janela inteira: cada metade é conferida sozinha.
    if (seen.size < read.announced && canSplit(query, depth)) {
      const middle = middleDay(query.window);
      const halves = [
        await readFederal(client, { ...query, window: { from: query.window.from, to: middle } }, depth + 1),
        await readFederal(client, { ...query, window: { from: addCalendarDays(middle, 1), to: query.window.to } }, depth + 1),
      ];
      read.splits += 1;
      for (const half of halves) {
        read.pages += half.pages;
        read.repeated += half.repeated;
        read.splits += half.splits;
        read.failure ??= half.failure;
        for (const raw of half.rows) {
          const identity = payloadHash(raw);
          if (!seen.has(identity)) {
            seen.set(identity, raw);
          }
        }
      }
      read.rows = [...seen.values()];
      read.complete = halves.every((half) => half.complete);
      return read;
    }
  } catch (error) {
    if (!(error instanceof ComprasGovRequestError)) {
      throw error;
    }
    read.failure = error;
  }

  read.rows = [...seen.values()];
  read.complete = read.failure === null && query.maxPages === undefined && seen.size >= read.announced;
  return read;
}
