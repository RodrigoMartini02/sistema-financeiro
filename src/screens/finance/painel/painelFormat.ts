import { MONTH_NAMES, type PainelPeriodo } from '../../../types/finance';

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

/** 'set/26' para um mês, '2026' para um ano. */
export function rotuloDoPonto(ano: number, mes: number | null): string {
  if (mes === null) return String(ano);
  return `${MONTH_NAMES[mes]!.slice(0, 3).toLowerCase()}/${String(ano).slice(2)}`;
}

/** Rótulo do mês do fim do período no mesmo formato da série — ponto destacado nos gráficos. */
export function rotuloDoMesFinal(periodo: PainelPeriodo): string {
  const [ano, mes] = periodo.ate.split('-').map(Number);
  return rotuloDoPonto(ano!, mes! - 1);
}

export function formatarPercentual(valor: number): string {
  return `${valor.toFixed(0)}%`;
}

export function contas(quantidade: number): string {
  if (quantidade === 0) return 'nenhuma conta';
  return `${quantidade} conta${quantidade === 1 ? '' : 's'}`;
}
