import { apiRequest } from './apiClient';

export interface IncomeSuggestionMatch {
  descricao: string;
  valor: number;
  cliente: string | null;
  tipoReceita: string | null;
}

export interface IncomeSuggestions {
  matches: IncomeSuggestionMatch[];
}

interface RawMatch {
  descricao: string;
  valor?: string | number | null;
  cliente?: string | null;
  tipo_receita?: string | null;
}

interface RawSuggestions {
  matches: RawMatch[];
}

function asNumber(value: string | number | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchIncomeSuggestions(descricao: string): Promise<IncomeSuggestions> {
  const q = new URLSearchParams();
  if (descricao) q.set('descricao', descricao);

  const raw = await apiRequest<RawSuggestions>(`/incomes/suggestions?${q}`);

  return {
    matches: raw.matches.map((match) => ({
      descricao: match.descricao,
      valor: asNumber(match.valor),
      cliente: match.cliente ?? null,
      tipoReceita: match.tipo_receita ?? null,
    })),
  };
}
