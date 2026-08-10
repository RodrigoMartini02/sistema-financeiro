export interface Appointment {
  id: number;
  titulo: string;
  descricao?: string | null;
  data: string;
  hora?: string | null;
  duracao_minutos?: number | null;
  local?: string | null;
  perfil_id?: number | null;
}

export interface AppointmentFormValues {
  titulo: string;
  descricao?: string;
  data: string;
  hora?: string;
  duracao_minutos?: number;
  local?: string;
}
