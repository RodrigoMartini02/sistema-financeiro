import { apiRequest, getActiveAccountId } from './apiClient';
import type { Appointment, AppointmentFormValues } from '../types/appointments';

export async function fetchAppointments(month: number, year: number): Promise<Appointment[]> {
  const accountId = getActiveAccountId();
  const params = new URLSearchParams({ mes: String(month), ano: String(year) });
  if (accountId) params.set('conta_id', String(accountId));
  return apiRequest<Appointment[]>(`/appointments?${params}`);
}

export async function saveAppointment(values: AppointmentFormValues, id?: number): Promise<Appointment> {
  const accountId = getActiveAccountId();
  const body = { ...values, conta_id: accountId };

  return apiRequest<Appointment>(id ? `/appointments/${id}` : '/appointments', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteAppointment(id: number): Promise<void> {
  return apiRequest<void>(`/appointments/${id}`, { method: 'DELETE' });
}
