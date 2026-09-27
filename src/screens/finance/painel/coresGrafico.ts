import { useAppContext } from '../../../context/AppContext';

/**
 * Cores dos gráficos do Painel, por tema. Todas validadas com o validador de
 * paleta do dataviz (daltonismo, faixa de luminosidade, contraste com o fundo
 * do card: branco no claro, slate-800 no escuro). Trocar um valor aqui exige
 * validar de novo — não ajustar no olho.
 *
 * `categorias` tem ordem fixa (a cor segue a entidade, nunca a posição):
 * formas de pagamento, cartões, tipo de gasto, à vista × parcelado e pessoas
 * usam as cores nesta ordem.
 */
export interface CoresGrafico {
  receita: string;
  despesa: string;
  resultado: string;
  categorias: readonly string[];
  cadastrado: string;
  pago: string;
  destaque: string;
  /** Mesmo tom do destaque, mais suave: subcategorias no ranking de categorias. */
  destaqueSuave: string;
  /** Fundo do card: anel em volta dos pontos da linha, separando-os das barras. */
  superficie: string;
  grade: string;
  eixo: string;
  eixoZero: string;
  /** Marca sem identidade própria (ex.: pessoa fora da lista de cores). */
  neutro: string;
}

const CLARO: CoresGrafico = {
  receita: '#047857',
  despesa: '#fb7185',
  resultado: '#6366f1',
  categorias: ['#0891b2', '#f59e0b', '#6366f1', '#10b981'],
  cadastrado: '#6366f1',
  pago: '#0891b2',
  destaque: '#0891b2',
  destaqueSuave: '#67e8f9',
  superficie: '#ffffff',
  grade: '#f1f5f9',
  eixo: '#94a3b8',
  eixoZero: '#e2e8f0',
  neutro: '#94a3b8',
};

const ESCURO: CoresGrafico = {
  receita: '#059669',
  despesa: '#f43f5e',
  resultado: '#6366f1',
  categorias: ['#0891b2', '#d97706', '#6366f1', '#059669'],
  cadastrado: '#6366f1',
  pago: '#0891b2',
  destaque: '#22d3ee',
  destaqueSuave: '#155e75',
  superficie: '#1e293b',
  grade: '#334155',
  eixo: '#94a3b8',
  eixoZero: '#475569',
  neutro: '#64748b',
};

export function useCoresGrafico(): CoresGrafico {
  const { theme } = useAppContext();
  return theme === 'dark' ? ESCURO : CLARO;
}

export interface FatiaGrafico {
  nome: string;
  valor: number;
  cor: string;
}

/**
 * Fatias de pizza com cor por posição, na ordem fixa da paleta. A paleta tem 4
 * cores e nunca é repetida em ciclo: acima de 4 itens, os menores viram uma
 * fatia "Outras" na 4ª cor.
 */
export function fatiasComOutras<T extends { nome: string; valor: number }>(itens: T[], cores: CoresGrafico): Array<T & { cor: string } | FatiaGrafico> {
  const limite = cores.categorias.length;
  if (itens.length <= limite) {
    return itens.map((item, indice) => ({ ...item, cor: cores.categorias[indice]! }));
  }
  const principais = itens.slice(0, limite - 1).map((item, indice) => ({ ...item, cor: cores.categorias[indice]! }));
  const resto = itens.slice(limite - 1).reduce((soma, item) => soma + item.valor, 0);
  return [...principais, { nome: 'Outras', valor: resto, cor: cores.categorias[limite - 1]! }];
}

/**
 * Cor de cada pessoa (usuario_id) na ordem fixa da paleta — a mesma nas pizzas
 * de pessoas e nas barras de Categorias. Acima de 4 pessoas, as demais dividem
 * a 4ª cor em vez de repetir a paleta em ciclo.
 */
export function coresPorPessoa(usuarioIds: number[], cores: CoresGrafico): Map<number, string> {
  const limite = cores.categorias.length;
  return new Map(usuarioIds.map((id, indice) => [id, cores.categorias[Math.min(indice, limite - 1)]!]));
}
