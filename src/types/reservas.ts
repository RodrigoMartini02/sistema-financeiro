export interface Reserva {
  id: number;
  observacoes: string;
  valor: number;
  data: string;
  mes: number;
  ano: number;
  tipo_reserva: 'normal' | 'objetivo';
  objetivo_valor?: number | null;
  objetivo_atingido?: boolean;
  data_objetivo?: string | null;
  cor?: string | null;
  icone?: string | null;
  perfil_id?: number | null;
}

export interface ReservaFormValues {
  observacoes: string;
  valor?: number;
  objetivo_valor?: number;
  data_objetivo?: string;
  cor?: string;
  icone?: string;
}

export interface Movimentacao {
  id: number;
  reserva_id: number;
  tipo: 'entrada' | 'saida';
  valor: number;
  observacoes?: string | null;
  data_hora: string;
}

export interface MovimentacaoFormValues {
  tipo: 'deposito' | 'retirada';
  valor: number;
  descricao?: string;
  data: string;
}
