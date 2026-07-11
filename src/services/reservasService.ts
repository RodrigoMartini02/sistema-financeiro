import { apiRequest, getActiveProfileId } from './apiClient';
import type { Reserva, ReservaFormValues, Movimentacao, MovimentacaoFormValues } from '../types/reservas';

export async function fetchReservas(): Promise<Reserva[]> {
  const id = getActiveProfileId();
  const q = id ? `?perfil_id=${id}` : '';
  return apiRequest<Reserva[]>(`/reservas${q}`);
}

export async function saveReserva(values: ReservaFormValues, id?: number): Promise<Reserva> {
  const profileId = getActiveProfileId();
  const hoje = new Date();

  const body = {
    observacoes: values.observacoes,
    valor: values.valor ?? 0,
    data: hoje.toISOString().slice(0, 10),
    mes: hoje.getMonth(),
    ano: hoje.getFullYear(),
    tipo_reserva: values.objetivo_valor && values.objetivo_valor > 0 ? 'objetivo' : 'normal',
    objetivo_valor: values.objetivo_valor ?? null,
    data_objetivo: values.data_objetivo || null,
    cor: values.cor ?? '#6366f1',
    icone: values.icone ?? '\u{1F4B0}',
    perfil_id: profileId,
  };

  return apiRequest<Reserva>(id ? `/reservas/${id}` : '/reservas', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteReserva(id: number): Promise<void> {
  return apiRequest<void>(`/reservas/${id}`, { method: 'DELETE' });
}

export async function fetchMovimentacoes(reservaId: number): Promise<Movimentacao[]> {
  return apiRequest<Movimentacao[]>(`/reservas/${reservaId}/movimentacoes`);
}

export async function movimentar(reservaId: number, values: MovimentacaoFormValues): Promise<Movimentacao> {
  return apiRequest<Movimentacao>(`/reservas/${reservaId}/movimentar`, {
    method: 'POST',
    body: JSON.stringify(values),
  });
}
