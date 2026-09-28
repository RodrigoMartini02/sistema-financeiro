import { MONTH_NAMES, type PainelFatia, type PainelGranularidade } from '../../../types/finance';
import type { FatiaPizza } from './graficos/Pizza';
import { formatCurrency } from '../formatters';

const ROTULO_FORMA: Record<string, string> = {
  credito: 'Crédito',
  debito: 'Débito',
  pix: 'Pix',
  dinheiro: 'Dinheiro',
  transferencia: 'Transferência',
  nao_informada: 'Não informada',
};

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

// Faixas do comprometimento da renda (barra e guia de primeiro acesso): até
// 70% saudável, até 90% em alerta, acima disso crítico.
export const FAIXAS_COMPROMETIMENTO: [number, number] = [70, 90];

export interface SituacaoComprometimento {
  tom: 'income' | 'warning' | 'expense';
  rotulo: string;
  classe: string;
}

export function situacaoComprometimento(percentual: number | null): SituacaoComprometimento {
  const [alerta, critico] = FAIXAS_COMPROMETIMENTO;
  if (percentual === null || percentual <= alerta) {
    return { tom: 'income', rotulo: 'saudável', classe: 'text-emerald-600 dark:text-emerald-400' };
  }
  if (percentual <= critico) {
    return { tom: 'warning', rotulo: 'atenção', classe: 'text-amber-600 dark:text-amber-400' };
  }
  return { tom: 'expense', rotulo: 'crítico', classe: 'text-rose-600 dark:text-rose-400' };
}

/** "+ R$ 10,00" / "− R$ 10,00". */
export function formatarComSinal(valor: number): string {
  return `${valor >= 0 ? '+' : '−'} ${formatCurrency(Math.abs(valor))}`;
}

/** Trecho da série que começa depois de hoje: ainda vai vencer. */
export function trechoFuturo(inicio: string, hoje: Date = new Date()): boolean {
  const pad = (numero: number) => String(numero).padStart(2, '0');
  return inicio > `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;
}

/** Fatia pela classificação/categoria principal; as subcategorias vão para o detalhe. */
export function paraFatias(fatias: PainelFatia[]): FatiaPizza[] {
  return fatias.map((fatia) => ({
    nome: fatia.nome,
    valor: fatia.valor,
    detalhes: fatia.subcategorias.map((sub) => [sub.nome, formatCurrency(sub.valor)]),
  }));
}

/** Menor diâmetro das pizzas; acima dele, o disco ocupa o espaço livre do card. */
export const TAMANHO_PIZZA_GRANDE = 240;
export const TAMANHO_PIZZA_MENOR = 170;
