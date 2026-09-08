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
  /** Quem cadastrou. Preenchido quando a conta tem mais de uma pessoa lancando. */
  autorNome?: string | null;
  valor: number;
  data: string;
  mes: number;
  ano: number;
  status?: 'ativa' | 'cancelada' | 'prevista' | 'faturada';
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
  contratoId?: number | null;
  tipoHora?: 'presencial' | 'remoto' | null;
  quantidadeHoras?: number | null;
}

export interface Expense {
  id: number;
  descricao: string;
  valorFinal: number;           // valor da linha (por parcela, quando parcelado)
  valorFinalTotal?: number;     // mesmo valor, usado na comparação ao editar
  valorOriginal?: number | null; // valor da compra, como veio do banco
  valorPago?: number | null;    // valor efetivamente pago (pode diferir por juros/desconto)
  categoria: string;
  categoriaPai?: string | null; // nome da categoria-pai, quando a categoria é subcategoria
  formaPagamento: string;
  cartaoId?: number | null;
  cartaoNome?: string | null;
  dataVencimento: string;
  dataCompra?: string | null;
  /** Quando o lancamento foi cadastrado. Ordena a tabela: mais recente no topo. */
  dataCriacao?: string | null;
  /** Quem cadastrou. Preenchido quando a conta tem mais de uma pessoa lancando. */
  autorNome?: string | null;
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
  anexos?: Attachment[] | null;
}

export interface ExpenseFormValues {
  descricao: string;
  valor_original?: number;      // preço base (obrigatório na prática)
  valor_pago?: number;          // valor efetivamente pago, quando divergir do valor da compra
  dataVencimento: string;
  dataCompra?: string;
  categoria_id?: number;
  cartao_id?: number;
  formaPagamento: string;
  pago: boolean;
  recorrente?: boolean;
  parcelado?: boolean;
  total_parcelas?: number;
  parcelasJaPagas?: number;     // quantas parcelas nascem pagas (0 a total_parcelas-1)
  recorrenciaMensal?: boolean;  // gera lote fixo de ocorrências futuras (dia livre ou fatura do cartão)
  numero_nf?: string;
  data_emissao_nf?: string;
  observacoes?: string;
  anexos?: Attachment[];
}

export interface FinanceDashboardData {
  incomes: Income[];
  expenses: Expense[];
  balance: MonthBalance;
}

export interface DashboardPanoramaFiltro {
  deMes?: number;
  deAno?: number;
  ateMes?: number;
  ateAno?: number;
  /** Sem valor = painel da família inteira. Com valor = apenas aquele membro. */
  membroId?: number | null;
}

export interface DashboardPanoramaSeriePonto {
  ano: number;
  mes: number | null;
  receitas: number;
  despesas: number;
}

export interface DashboardPanoramaDespesasDetalhe {
  juros: number;
  descontos: number;
  fixas: number;
  variaveis: number;
  pagas: number;
  pendentes: number;
}

export interface DashboardPanoramaData {
  receitas: number;
  despesas: number;
  saldoAnterior: number;
  saldoFinal: number;
  totalLancamentos: number;
  primeiraData: string | null;
  ultimaData: string | null;
  porCategoria: { categoria: string; total: number }[];
  porFormaPagamento: { forma_pagamento: string; total: number }[];
  porOrigem: { origem: 'contrato' | 'avulsa'; total: number }[];
  granularidade: 'mes' | 'ano';
  serie: DashboardPanoramaSeriePonto[];
  despesasDetalhe: DashboardPanoramaDespesasDetalhe;
}
