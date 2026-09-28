// Regras de agenda da receita fixa, sem banco: tudo em datas ISO (AAAA-MM-DD)
// no fuso do sistema, para os testes cobrirem virada de mês e meses curtos.

const pad = (value: number) => String(value).padStart(2, '0');

/** Primeiro dia do mês da data: é a competência do lançamento. */
export function competenciaDe(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Dia do lançamento no mês: dia 31 em fevereiro vira o último dia do mês. */
export function dataDoLancamento(competencia: string, diaRecebimento: number): string {
  const [ano, mes] = competencia.split('-').map(Number);
  const ultimoDia = new Date(ano!, mes!, 0).getDate();
  return `${ano}-${pad(mes!)}-${pad(Math.min(diaRecebimento, ultimoDia))}`;
}

function mesSeguinte(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number);
  return mes === 12 ? `${ano! + 1}-01-01` : `${ano}-${pad(mes! + 1)}-01`;
}

/**
 * Primeiro mês do automático: o mês em que foi ligado, se o dia do
 * recebimento ainda não passou; senão, o mês seguinte.
 */
export function primeiraCompetencia(ligadoEm: string, diaRecebimento: number): string {
  const competencia = competenciaDe(ligadoEm);
  return ligadoEm <= dataDoLancamento(competencia, diaRecebimento) ? competencia : mesSeguinte(competencia);
}

export interface ConfiguracaoFixa {
  diaRecebimento: number;
  lancarAutomatico: boolean;
  automaticoDesde: string | null;
}

/**
 * Competência a lançar hoje, ou null. Só o mês atual — mês inteiro perdido não
 * é recuperado — e só a partir do dia configurado. Quem já lançou o mês
 * (índice único no banco) informa em `jaLancada`.
 */
export function competenciaParaLancar(hoje: string, config: ConfiguracaoFixa, jaLancada: boolean): string | null {
  if (!config.lancarAutomatico || !config.automaticoDesde || jaLancada) return null;
  const competencia = competenciaDe(hoje);
  if (competencia < primeiraCompetencia(config.automaticoDesde, config.diaRecebimento)) return null;
  return hoje >= dataDoLancamento(competencia, config.diaRecebimento) ? competencia : null;
}
