import { apiRequest, getActiveAccountId } from './apiClient';
import { getLocalTodayIso } from '../utils/date';
import type { Reserva, ReservaFormValues, Movimentacao, MovimentacaoFormValues } from '../types/reservas';

export async function fetchReservas(): Promise<Reserva[]> {
  const id = getActiveAccountId();
  const q = id ? `?conta_id=${id}` : '';
  return apiRequest<Reserva[]>(`/reservas${q}`);
}

export async function saveReserva(values: ReservaFormValues, id?: number): Promise<Reserva> {
  const accountId = getActiveAccountId();
  const hoje = new Date();

  const body = {
    observacoes: values.observacoes,
    valor: values.valor ?? 0,
    data: getLocalTodayIso(),
    mes: hoje.getMonth(),
    ano: hoje.getFullYear(),
    tipo_reserva: values.objetivo_valor && values.objetivo_valor > 0 ? 'objetivo' : 'normal',
    objetivo_valor: values.objetivo_valor ?? null,
    data_objetivo: values.data_objetivo || null,
    cor: values.cor ?? '#6366f1',
    icone: values.icone ?? '\u{1F4B0}',
    conta_id: accountId,
  };

  return apiRequest<Reserva>(id ? `/reservas/${id}` : '/reservas', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteReserva(id: number): Promise<void> {
  return apiRequest<void>(`/reservas/${id}`, { method: 'DELETE' });
}

export async function fetchMovimentacoes(reservaId: number, month?: number, year?: number): Promise<Movimentacao[]> {
  const params = new URLSearchParams();
  if (month !== undefined && year !== undefined) {
    params.set('mes', String(month));
    params.set('ano', String(year));
  }
  const query = params.size > 0 ? `?${params}` : '';
  return apiRequest<Movimentacao[]>(`/reservas/${reservaId}/movements${query}`);
}

export async function movimentar(reservaId: number, values: MovimentacaoFormValues): Promise<Movimentacao> {
  const tipo = values.tipo === 'deposito' ? 'entrada' : 'saida';
  return apiRequest<Movimentacao>(`/reservas/${reservaId}/move`, {
    method: 'POST',
    body: JSON.stringify({
      tipo,
      valor: values.valor,
      observacoes: values.descricao,
      data: values.data,
    }),
  });
}
