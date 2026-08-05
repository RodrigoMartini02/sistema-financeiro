import { apiRequest } from './apiClient';

export interface ExpenseSuggestionMatch {
  descricao: string;
  valorFinal: number;
  categoriaId: number | null;
  formaPagamento: string;
}

export interface CartaoSugerido {
  id: number;
}

export interface ExpenseSuggestions {
  matches: ExpenseSuggestionMatch[];
  formaPagamentoSugerida: string | null;
  cartaoSugerido: CartaoSugerido | null;
}

interface RawMatch {
  descricao: string;
  valor_final?: string | number | null;
  valor_original?: string | number | null;
  categoria_id?: number | null;
  forma_pagamento?: string | null;
}

interface RawCartaoSugerido {
  id: number;
}

interface RawSuggestions {
  matches: RawMatch[];
  forma_pagamento_sugerida: string | null;
  cartao_sugerido: RawCartaoSugerido | null;
}

function asNumber(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchExpenseSuggestions(descricao: string, categoriaId?: number): Promise<ExpenseSuggestions> {
  const q = new URLSearchParams();
  if (descricao) q.set('descricao', descricao);
  if (categoriaId) q.set('categoria_id', String(categoriaId));

  const raw = await apiRequest<RawSuggestions>(`/expenses/suggestions?${q}`);

  return {
    matches: raw.matches.map((match) => ({
      descricao: match.descricao,
      valorFinal: asNumber(match.valor_final ?? match.valor_original),
      categoriaId: match.categoria_id ?? null,
      formaPagamento: match.forma_pagamento ?? 'dinheiro',
    })),
    formaPagamentoSugerida: raw.forma_pagamento_sugerida,
    cartaoSugerido: raw.cartao_sugerido
      ? { id: raw.cartao_sugerido.id }
      : null,
  };
}
