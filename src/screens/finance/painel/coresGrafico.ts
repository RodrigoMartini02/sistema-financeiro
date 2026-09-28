import { useAppContext } from '../../../context/AppContext';

/**
 * Cores dos gráficos do Painel, por tema. As 4 primeiras de `categorias` foram
 * validadas com o validador de paleta do dataviz (daltonismo, luminosidade,
 * contraste com o fundo do card); as 8 seguintes ampliam a paleta para
 * gráficos com muitas fatias (categorias, formas de pagamento).
 *
 * `categorias` tem ordem fixa: a cor segue a posição do item na lista já
 * ordenada. Acima de 12 itens, `corDaPaleta` usa um tom mais claro da mesma
 * cor em vez de repetir uma cor igual.
 */
export interface CoresGrafico {
  receita: string;
  despesa: string;
  categorias: readonly string[];
  /** Série "Venceu" em Contas pagas em cada mês. */
  cadastrado: string;
  pago: string;
  destaque: string;
  /** Mesmo tom do destaque, mais suave: subcategorias nas barras de categorias e metas. */
  destaqueSuave: string;
  /** Fundo do card: base do tom mais claro acima de 12 cores. */
  superficie: string;
  grade: string;
  eixo: string;
  eixoZero: string;
  /** Marca sem identidade própria (ex.: pessoa fora da lista de cores). */
  neutro: string;
  /** Trecho que ainda vai vencer e fatia "Livre". */
  futuro: string;
  positivo: string;
  alerta: string;
  negativo: string;
}

const CLARO: CoresGrafico = {
  receita: '#10b981',
  despesa: '#fb7185',
  categorias: ['#0891b2', '#f59e0b', '#6366f1', '#10b981', '#e11d48', '#8b5cf6', '#0ea5e9', '#84cc16', '#f97316', '#14b8a6', '#db2777', '#64748b'],
  cadastrado: '#6366f1',
  pago: '#0891b2',
  destaque: '#0891b2',
  destaqueSuave: '#67e8f9',
  superficie: '#ffffff',
  grade: '#f1f5f9',
  eixo: '#94a3b8',
  eixoZero: '#e2e8f0',
  neutro: '#94a3b8',
  futuro: '#cbd5e1',
  positivo: '#059669',
  alerta: '#d97706',
  negativo: '#e11d48',
};

const ESCURO: CoresGrafico = {
  receita: '#10b981',
  despesa: '#fb7185',
  categorias: ['#0891b2', '#d97706', '#6366f1', '#059669', '#fb7185', '#a78bfa', '#38bdf8', '#a3e635', '#fb923c', '#2dd4bf', '#f472b6', '#94a3b8'],
  cadastrado: '#6366f1',
  pago: '#0891b2',
  destaque: '#22d3ee',
  destaqueSuave: '#155e75',
  superficie: '#1e293b',
  grade: '#334155',
  eixo: '#94a3b8',
  eixoZero: '#475569',
  neutro: '#64748b',
  futuro: '#475569',
  positivo: '#34d399',
  alerta: '#fbbf24',
  negativo: '#fb7185',
};

export function useCoresGrafico(): CoresGrafico {
  const { theme } = useAppContext();
  return theme === 'dark' ? ESCURO : CLARO;
}

/** Cor do item na posição `indice`; do 13º em diante, a mesma paleta num tom mais claro. */
export function corDaPaleta(indice: number, cores: CoresGrafico): string {
  const total = cores.categorias.length;
  const base = cores.categorias[indice % total]!;
  return indice < total ? base : `color-mix(in srgb, ${base} 50%, ${cores.superficie})`;
}

/**
 * Cor de cada pessoa (usuario_id) na ordem da paleta — a mesma nas pizzas de
 * pessoas e nas barras de Categorias.
 */
export function coresPorPessoa(usuarioIds: number[], cores: CoresGrafico): Map<number, string> {
  return new Map(usuarioIds.map((id, indice) => [id, corDaPaleta(indice, cores)]));
}

/** Cor da situação do comprometimento (saudável, atenção, crítico). */
export function corDaSituacao(tom: 'income' | 'warning' | 'expense', cores: CoresGrafico): string {
  if (tom === 'income') return cores.positivo;
  return tom === 'warning' ? cores.alerta : cores.negativo;
}
