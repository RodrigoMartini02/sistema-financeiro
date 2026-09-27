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
  /** Só as despesas do mês já pagas — base do card Saldo Atual. */
  despesasPagas: number;
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
  classificacaoId?: number | null;
  classificacaoNome?: string | null;
  representanteId?: number | null;
  representanteNome?: string | null;
  valorComissao?: number | null;
  anexos?: Attachment[] | null;
}

export interface IncomeFormValues {
  descricao: string;
  valor: number;
  data: string;
  /** Conta (PF/CNPJ) onde o lançamento entra. Undefined/null usa a conta ativa. */
  contaId?: number | null;
  cliente?: string;
  classificacaoId?: number | null;
  observacoes?: string;
  representanteId?: number | null;
  valorComissao?: number | null;
  anexos?: Attachment[];
  replicarAte?: { mes: number; ano: number } | null;
  contratoId?: number | null;
  tipoHora?: 'presencial' | 'remoto' | null;
  quantidadeHoras?: number | null;
  /** Produto do catálogo vendido; a quantidade baixa o estoque. */
  produtoId?: string | null;
  quantidadeVendida?: number | null;
}

export interface Expense {
  id: number;
  descricao: string;
  valorFinal: number;           // valor da linha (por parcela, quando parcelado)
  valorFinalTotal?: number;     // mesmo valor, usado na comparação ao editar
  valorOriginal?: number | null; // valor da compra, como veio do banco
  valorPago?: number | null;    // valor efetivamente pago (pode diferir por juros/desconto)
  categoria: string;
  categoriaId?: number | null;
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
  /** Id da 1a parcela do grupo — todas as parcelas de um parcelamento (a
   *  propria 1a inclusive) compartilham este valor. Usado para buscar/excluir
   *  o grupo inteiro na grade de multi-selecao. */
  grupoParcelamentoId?: number | null;
  observacoes?: string | null;
  numeroNf?: string | null;
  dataEmissaoNf?: string | null;
  anexos?: Attachment[] | null;
}

export interface ExpenseFormValues {
  descricao: string;
  /** Conta (PF/CNPJ) onde o lançamento entra. Undefined/null usa a conta ativa. */
  contaId?: number | null;
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

/** Período do Painel: datas ISO 'AAAA-MM-DD', inclusivas. */
export interface PainelPeriodo {
  de: string;
  ate: string;
}

export interface PainelFiltro extends PainelPeriodo {
  /**
   * `undefined` (padrão) = só o próprio usuário. `null` = todas as pessoas
   * visíveis. Uma lista de ids = exatamente essas pessoas.
   */
  membroId?: number[] | null;
}

export type PainelGranularidade = 'semana' | 'mes' | 'ano';

/** Um trecho da série (semana, mês ou ano), recortado ao período: datas ISO inclusivas. */
export interface PainelPontoSerie {
  inicio: string;
  fim: string;
  receitas: number;
  despesas: number;
  credito: number;
  pago: number;
  /** Juros e descontos das despesas que vencem no trecho. */
  juros: number;
  descontos: number;
}

export interface PainelCategoria {
  categoriaId: number | null;
  categoria: string;
  parentId: number | null;
  usuarioId: number;
  autorNome: string | null;
  total: number;
}

/** Soma por classificação principal; subcategorias como detalhe. null = "Sem classificação". */
export interface PainelFatiaClassificacao {
  classificacaoId: number | null;
  nome: string;
  valor: number;
  subcategorias: { classificacaoId: number; nome: string; valor: number }[];
}

export interface PainelData {
  periodo: PainelPeriodo;
  periodoAnterior: PainelPeriodo;
  tipoConta: 'pessoal' | 'empresa';
  totalLancamentos: number;
  resumo: {
    entrou: number;
    saiu: number;
    pago: number;
    aPagar: number;
    entrouAnterior: number;
    saiuAnterior: number;
    saldoAnterior: number;
    saldoFinal: number;
  };
  serie: { granularidade: PainelGranularidade; pontos: PainelPontoSerie[] };
  formasPagamento: { forma: string; valor: number; quantidade: number; juros: number }[];
  cartoes: { id: number; nome: string; gasto: number; limite: number | null; usado: number | null }[];
  aVistaParcelado: { aVista: number; parcelado: number };
  tipoGasto: { fixo: number; parcela: number; livre: number };
  emDia: { cadastrado: number; pagoEmDia: number; pagoComAtraso: number; emAberto: number; quitadoDeAnteriores: number };
  contasEmAberto: {
    atraso: { valor: number; quantidade: number };
    proximos30Dias: { valor: number; quantidade: number };
    comprometido: { ano: number; mes: number; parcelas: number; outras: number }[];
  };
  /** null quando o bloco não se aplica: conta empresa ou membro sem Planejamento. */
  planejado: { categoriaId: number; categoria: string; parentId: number | null; meta: number; gasto: number }[] | null;
  porPessoa: { usuarioId: number; nome: string; receitas: number; despesas: number }[];
  jurosDescontos: { periodo: { juros: number; descontos: number }; ano: { juros: number; descontos: number } };
  categorias: PainelCategoria[];
  /** De onde veio o dinheiro: recebido e a receber por classificação, comprometimento previsto, fixa × variável. */
  receitas: {
    porClassificacao: PainelFatiaClassificacao[];
    aReceber: { total: number; porClassificacao: PainelFatiaClassificacao[] };
    rendaPrevista: number;
    comprometimentoPrevisto: number | null;
    fixa: number;
    variavel: number;
    fixasConsomem: number | null;
    temFixa: boolean;
    periodoEncerrado: boolean;
  };
  empresa: {
    estoqueBaixo: { id: string; nome: string; quantidadeEstoque: number; estoqueMinimo: number }[];
  } | null;
}
