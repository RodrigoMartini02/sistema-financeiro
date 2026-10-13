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

/**
 * Competências gravadas como previstas ao ligar ou salvar a fixa (plano
 * .plans/receita-fixa-ano-previsto.md): da primeira — o mês de `inicio`, se o
 * dia ainda não passou, ou o seguinte — até dezembro do ano dela.
 */
export function competenciasAteDezembro(inicio: string, diaRecebimento: number): string[] {
  const primeira = primeiraCompetencia(inicio, diaRecebimento);
  const ano = primeira.slice(0, 4);
  const competencias: string[] = [];
  for (let competencia = primeira; competencia.startsWith(ano); competencia = mesSeguinte(competencia)) {
    competencias.push(competencia);
  }
  return competencias;
}

/** Ano que a renovação grava: o seguinte ao último gravado, ou o ano de hoje, se a decisão demorou. */
export function anoDaRenovacao(anoRegistrado: number, hoje: string): number {
  return Math.max(anoRegistrado + 1, Number(hoje.slice(0, 4)));
}

/**
 * Competências da renovação para `ano`: janeiro a dezembro. Se a decisão vem
 * já dentro de `ano`, vale a regra de ligar a fixa: a partir do mês atual, se
 * o dia ainda não passou.
 */
export function competenciasDaRenovacao(hoje: string, ano: number, diaRecebimento: number): string[] {
  const inicioDoAno = `${ano}-01-01`;
  return competenciasAteDezembro(hoje > inicioDoAno ? hoje : inicioDoAno, diaRecebimento)
    .filter((competencia) => competencia.startsWith(`${ano}-`));
}

/**
 * A fixa pergunta se continua a partir de 1º de dezembro do último ano
 * gravado. Não há fim: a fixa continua ligada até alguém decidir.
 */
export function renovacaoPendente(anoRegistrado: number, hoje: string): boolean {
  return hoje >= `${anoRegistrado}-12-01`;
}
