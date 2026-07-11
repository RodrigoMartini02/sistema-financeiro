export interface Attachment {
  id: string;
  nome: string;
  tipo: string;
  tamanho: number;
  dados: string;
  dataUpload: string;
}

export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export interface MonthBalance {
  saldoAnterior: number;
  receitas: number;
  despesas: number;
  saldoFinal: number;
}

export interface Income {
  id: number;
  descricao: string;
  valor: number;
  data: string;
  mes: number;
  ano: number;
  status?: 'ativa' | 'cancelada' | 'prevista';
  contratoId?: number | null;
  observacoes?: string | null;
  cliente?: string | null;
  tipoReceita?: string | null;
  representanteId?: number | null;
  representanteNome?: string | null;
  valorComissao?: number | null;
  anexos?: Attachment[] | null;
}

export interface IncomeFormValues {
  descricao: string;
  valor: number;
  data: string;
  cliente?: string;
  tipoReceita?: string;
  observacoes?: string;
  representanteId?: number | null;
  valorComissao?: number | null;
  anexos?: Attachment[];
  replicarAte?: { mes: number; ano: number } | null;
}

export interface Expense {
  id: number;
  descricao: string;
  valorFinal: number;           // valor efetivo por exibição (por parcela para parcelado)
  valorFinalTotal?: number;     // valor_final bruto do banco (total para primeira parcela — usado no edit)
  valorOriginal?: number | null; // preço base acordado
  categoria: string;
  formaPagamento: string;
  dataVencimento: string;
  dataCompra?: string | null;
  dataPagamento?: string | null;
  mes: number;
  ano: number;
  status?: 'ativa' | 'cancelada';
  pago: boolean;
  recorrente: boolean;
  parcelado: boolean;
  parcela?: string | null;
  observacoes?: string | null;
  numeroNf?: string | null;
  dataEmissaoNf?: string | null;
  tipoDespesa?: 'opex' | 'capex' | null;
  anexos?: Attachment[] | null;
}

export interface ExpenseFormValues {
  descricao: string;
  valor_original?: number;      // preço base (obrigatório na prática)
  valor_final?: number;         // valor final com juros ou desconto (opcional)
  dataVencimento: string;
  dataCompra?: string;
  categoria?: string;
  categoria_id?: number;
  cartao_id?: number;
  formaPagamento: string;
  pago: boolean;
  recorrente?: boolean;
  parcelado?: boolean;
  total_parcelas?: number;
  numero_nf?: string;
  data_emissao_nf?: string;
  tipo_despesa?: 'opex' | 'capex';
  observacoes?: string;
  anexos?: Attachment[];
}

export interface FinanceDashboardData {
  incomes: Income[];
  expenses: Expense[];
  balance: MonthBalance;
}
