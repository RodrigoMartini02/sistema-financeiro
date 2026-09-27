import { MONTH_NAMES, type PainelGranularidade } from '../../../types/finance';

const ROTULO_FORMA: Record<string, string> = {
  credito: 'Crédito',
  debito: 'Débito',
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  nao_informada: 'Não informada',
};

export const FORMA_CREDITO = 'credito';

export function rotuloForma(forma: string): string {
  return ROTULO_FORMA[forma] ?? forma.charAt(0).toUpperCase() + forma.slice(1).replace(/_/g, ' ');
}

/** 'set/26' — mês 0-11. */
export function rotuloDoMes(ano: number, mes: number): string {
  return `${MONTH_NAMES[mes]!.slice(0, 3).toLowerCase()}/${String(ano).slice(2)}`;
}

/**
 * Rótulo de um trecho da série: semana '01–07/09' (ou '29/09–05/10' quando
 * cruza o mês), mês 'set/26', ano '2026'.
 */
export function rotuloDoTrecho(inicio: string, fim: string, granularidade: PainelGranularidade): string {
  const [ano, mes, dia] = inicio.split('-');
  if (granularidade === 'ano') return ano!;
  if (granularidade === 'mes') return rotuloDoMes(Number(ano), Number(mes) - 1);
  const [, mesFim, diaFim] = fim.split('-');
  return mes === mesFim ? `${dia}–${diaFim}/${mesFim}` : `${dia}/${mes}–${diaFim}/${mesFim}`;
}

/** Unidade da série para os textos: "semana"/"semanas", "mês"/"meses", "ano"/"anos". */
export function unidadeDaSerie(granularidade: PainelGranularidade): { singular: string; plural: string } {
  if (granularidade === 'semana') return { singular: 'semana', plural: 'semanas' };
  if (granularidade === 'mes') return { singular: 'mês', plural: 'meses' };
  return { singular: 'ano', plural: 'anos' };
}

export function formatarPercentual(valor: number): string {
  return `${valor.toFixed(0)}%`;
}

export function contas(quantidade: number): string {
  if (quantidade === 0) return 'nenhuma conta';
  return `${quantidade} conta${quantidade === 1 ? '' : 's'}`;
}
