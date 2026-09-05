import { useQueries } from '@tanstack/react-query';
import { fetchMovimentacoes } from '../services/reservasService';
import { queryKeys } from '../services/queryKeys';
import type { Movimentacao, Reserva } from '../types/reservas';

/** Movimentação com o nome da reserva de origem, para o histórico único. */
export interface MovimentacaoConsolidada extends Movimentacao {
  reservaNome: string;
  reservaCor: string;
}

/**
 * Histórico único de todas as reservas, ordenado da mais recente para a mais
 * antiga.
 *
 * A API expõe movimentações por reserva (`/reservas/:id/movements`), então a
 * consolidação acontece aqui: uma query por reserva, em paralelo, mescladas no
 * final. É um N+1 assumido — no volume real (poucas reservas por usuário) o
 * custo é irrelevante e o React Query ainda cacheia cada uma. Se o número de
 * reservas crescer muito, a saída é um endpoint consolidado no backend.
 */
export function useMovimentacoesConsolidadas(reservas: Reserva[], enabled: boolean) {
  const results = useQueries({
    queries: reservas.map((reserva) => ({
      queryKey: queryKeys.movimentacoes(reserva.id),
      queryFn: () => fetchMovimentacoes(reserva.id),
      enabled,
      staleTime: 30_000,
    })),
  });

  const isLoading = results.some((result) => result.isLoading);
  const error = results.find((result) => result.error)?.error ?? null;

  const movimentacoes: MovimentacaoConsolidada[] = reservas
    .flatMap((reserva, index) => {
      const dados = results[index]?.data ?? [];
      return dados.map((movimentacao) => ({
        ...movimentacao,
        reservaNome: reserva.observacoes || 'Reserva sem nome',
        reservaCor: reserva.cor ?? '#6366f1',
      }));
    })
    .sort((a, b) => new Date(b.data_hora).getTime() - new Date(a.data_hora).getTime());

  return { movimentacoes, isLoading, error };
}
