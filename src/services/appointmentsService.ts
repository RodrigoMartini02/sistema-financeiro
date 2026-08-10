import { apiRequest, getActiveProfileId } from './apiClient';
import type { Appointment, AppointmentFormValues } from '../types/appointments';

export async function fetchAppointments(month: number, year: number): Promise<Appointment[]> {
  const profileId = getActiveProfileId();
  const params = new URLSearchParams({ mes: String(month), ano: String(year) });
  if (profileId) params.set('perfil_id', String(profileId));
  return apiRequest<Appointment[]>(`/appointments?${params}`);
}

export async function saveAppointment(values: AppointmentFormValues, id?: number): Promise<Appointment> {
  const profileId = getActiveProfileId();
  const body = { ...values, perfil_id: profileId };

  return apiRequest<Appointment>(id ? `/appointments/${id}` : '/appointments', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteAppointment(id: number): Promise<void> {
  return apiRequest<void>(`/appointments/${id}`, { method: 'DELETE' });
}
