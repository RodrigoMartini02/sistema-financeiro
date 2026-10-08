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
  /** Cliente do cadastro (conta PJ): o nome é sempre o atual. */
  clienteId?: number | null;
  clienteNome?: string | null;
  /** Contrato com órgão público: o valor antes das retenções (`valor` é o líquido). */
  valorBruto?: number | null;
  classificacaoId?: number | null;
  classificacaoNome?: string | null;
  classificacaoPai?: string | null; // nome do grupo, quando a classificação é subcategoria
  representanteId?: number | null;
  representanteNome?: string | null;
  valorComissao?: number | null;
  /** Produto do catálogo vendido nesta receita: cancelar ou excluir devolve o estoque. */
  produtoId?: string | null;
  anexos?: Attachment[] | null;
}

/** "Repetir até": réplicas mensais até este mês (0-11) e ano. */
export interface IncomeRepeatUntil {
  month: number;
  year: number;
}

/** Venda de um produto do catálogo: a quantidade baixa o estoque. */
export interface IncomeProductSale {
  productId: string;
  quantity: number;
}

/** Horas a faturar: o tipo de hora diz o contrato, e as horas descontam o saldo dele. */
export interface IncomeBillableHours {
  hourTypeId: number;
  hours: number;
}

interface IncomeFieldsInput {
  description: string;
  categoryId: number | null;
  amount: number;
  receiptDate: string;
  clientId: number | null;
  representativeId: number | null;
  attachments: Attachment[] | null;
}

/** Corpo do POST /incomes. Datas em ISO e valores em reais. */
export interface IncomeCreateInput extends IncomeFieldsInput {
  accountId: number | null;
  repeatUntil: IncomeRepeatUntil | null;
  productSale: IncomeProductSale | null;
  billableHours: IncomeBillableHours | null;
}

/** Corpo do PUT /incomes/:id: só os campos da própria receita. */
export type IncomeUpdateInput = IncomeFieldsInput;

/** Despesa em aberto que o chip "Pagar despesa" do assistente oferece (GET /expenses/em-aberto). */
export interface OpenExpense {
  id: number;
  descricao: string;
  /** Valor previsto da linha (da parcela, quando parcelada). */
  valor: number;
  vencimento: string;
  parcelaAtual: number | null;
  totalParcelas: number | null;
  formaPagamento: string | null;
  vencida: boolean;
}

export interface Expense {
  id: number;
  descricao: string;
  valorFinal: number;           // valor da linha (por parcela, quando parcelado)
  valorOriginal?: number | null; // valor da compra, como veio do banco
  valorPago?: number | null;    // valor efetivamente pago (pode diferir por juros/desconto)
  categoria: string;
  categoriaId?: number | null;
  categoriaPai?: string | null; // nome da categoria-pai, quando a categoria é subcategoria
  formaPagamento: string;
  cartaoId?: number | null;
  cartaoNome?: string | null;
  /** Quem cadastrou a despesa. */
  autorId?: number | null;
  /** Quem paga: o dono do cartão quando há cartão; sem cartão, quem cadastrou. */
  pagadorId?: number | null;
  pagadorNome?: string | null;
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
  /** Número da parcela (o "3" de "3/10"); nulo fora do parcelado. */
  parcelaAtual?: number | null;
  /** Id da 1a parcela do grupo — todas as parcelas de um parcelamento (a
   *  propria 1a inclusive) compartilham este valor. Usado para buscar/excluir
   *  o grupo inteiro na grade de multi-selecao. */
  grupoParcelamentoId?: number | null;
  observacoes?: string | null;
  numeroNf?: string | null;
  dataEmissaoNf?: string | null;
  anexos?: Attachment[] | null;
  /** Pagamento da fatura do cartão que pagou ou renegociou esta compra. */
  invoicePaymentId?: number | null;
  /** Forma desse pagamento: a compra aparece como "Renegociada" no parcial e no parcelado. */
  invoicePaymentMethod?: InvoicePaymentMethod | null;
  invoicePaymentInstallments?: number | null;
  /** Mês da fatura desse pagamento, 'AAAA-MM'. */
  invoiceMonth?: string | null;
  /** Linha gerada por um pagamento de fatura: restante, parcela ou encargos. */
  invoiceOriginPaymentId?: number | null;
  /** Na linha gerada: a parte do valor que é juros ou encargos. */
  invoiceInterest?: number | null;
}

/** Forma do pagamento da fatura do cartão. */
export type InvoicePaymentMethod = 'total' | 'partial' | 'installments';

/** Corpo do POST /card-invoices/payments ("Pagar fatura"). */
export interface InvoicePaymentInput {
  cardId: number;
  /** 'AAAA-MM'. */
  invoiceMonth: string;
  method: InvoicePaymentMethod;
  paymentDate: string;
  /** Total e parcial. */
  amountPaid?: number;
  /** Parcial e parcelado. */
  interestAmount?: number;
  /** Só no parcelado. */
  installmentCount?: number;
}

export interface CardInvoiceItem {
  expenseId: number;
  description: string;
  amount: number;
  dueDate: string;
  authorName: string | null;
  installment: string | null;
}

export interface InvoicePaymentEntry {
  id: number;
  method: InvoicePaymentMethod;
  paymentDate: string;
  purchasesAmount: number;
  paidAmount: number;
  chargesAmount: number;
  interestAmount: number;
  carriedInterest: number;
  carriedForward: number;
  installmentCount: number | null;
  installmentAmount: number | null;
  firstDueDate: string | null;
  createdAt: string;
  registeredByName: string | null;
  reversedAt: string | null;
  reversedByName: string | null;
  canUndo: boolean;
  undoBlockedReason: string | null;
}

/** Fatura de um cartão no mês (GET /card-invoices). */
export interface CardInvoice {
  card: { id: number; name: string; dueDay: number; ownerName: string | null };
  dueDate: string;
  openTotal: number;
  openItems: CardInvoiceItem[];
  payments: InvoicePaymentEntry[];
}

/** Fatura renegociada no período, para o aviso do Painel. */
export interface RenegotiatedInvoice {
  cardId: number;
  cardName: string;
  invoiceMonth: string;
  method: 'partial' | 'installments';
  carriedForward: number;
  installmentCount: number | null;
  installmentAmount: number | null;
  firstDueDate: string;
}

export const PAYMENT_METHODS = ['pix', 'dinheiro', 'debito', 'credito'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isPaymentMethod(value: string): value is PaymentMethod {
  return (PAYMENT_METHODS as readonly string[]).includes(value);
}

/** Não repete, recorrente (12 ocorrências) ou parcelado (uma linha por parcela). */
export type ExpenseBillingType = 'single' | 'monthly' | 'installments';

export interface ExpensePaymentInput {
  paid: boolean;
  /** Data real do pagamento. Paga sem data grava o vencimento. */
  paymentDate: string | null;
  /** Paga sem valor grava o próprio valor da despesa. */
  amountPaid: number | null;
}

export interface ExpenseInstallmentInput extends ExpensePaymentInput {
  amount: number;
  dueDate: string;
}

interface ExpenseFieldsInput {
  description: string;
  categoryId: number | null;
  paymentMethod: PaymentMethod;
  cardId: number | null;
  purchaseDate: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  attachments: Attachment[] | null;
}

/** Corpo do POST /expenses. Datas em ISO e valores em reais. */
export type ExpenseCreateInput = ExpenseFieldsInput & { accountId: number | null } & (
  | ({ billingType: 'single' | 'monthly'; amount: number; dueDate: string } & ExpensePaymentInput)
  | { billingType: 'installments'; installments: ExpenseInstallmentInput[] }
);

/**
 * Alcance da edição numa série: só a linha, ela e as próximas, ou todas. Só o
 * parcelado escolhe; o mensal sempre vale para as próximas em aberto.
 */
export type ExpenseUpdateScope = 'this' | 'following' | 'all';

/**
 * Corpo do PUT /expenses/:id: edita a linha e, numa série, as outras do alcance
 * (`applyTo`); número da parcela, recorrência e conta não mudam.
 */
export interface ExpenseUpdateInput extends ExpenseFieldsInput, ExpensePaymentInput {
  amount: number;
  dueDate: string;
  applyTo?: ExpenseUpdateScope;
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
  /** Filtros de despesa do botão de filtros; vazio não filtra. Receitas nunca são filtradas. */
  categoryIds?: number[];
  cardIds?: number[];
  paymentMethods?: string[];
}

export type PainelGranularidade = 'semana' | 'mes' | 'ano';

/** Um trecho da série (semana, mês ou ano), recortado ao período: datas ISO inclusivas. */
export interface PainelPontoSerie {
  inicio: string;
  fim: string;
  receitas: number;
  despesas: number;
  /** Despesas do trecho por forma de pagamento (mesma chave de `formasPagamento`). */
  formas: Record<string, number>;
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

/** Soma pelo item principal (classificação ou categoria); subcategorias como detalhe. id null = sem classificação/categoria. */
export interface PainelFatia {
  id: number | null;
  nome: string;
  valor: number;
  subcategorias: { id: number; nome: string; valor: number }[];
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
  cartoes: {
    id: number;
    nome: string;
    gasto: number;
    limite: number | null;
    usado: number | null;
    donoId: number;
    /** Nome do dono quando o cartão não é de quem vê o painel; null quando é dele. */
    dono: string | null;
    /** Quanto cada pessoa (quem lançou) gastou no cartão no período. */
    porPessoa: { usuarioId: number; nome: string; gasto: number }[];
  }[];
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
  jurosDescontos: {
    periodo: { juros: number; descontos: number };
    ano: { juros: number; descontos: number };
    /** Juros do restante e das parcelas da fatura ainda não pagos. Ausente na resposta antiga. */
    upcomingInterest?: number;
  };
  /** Faturas renegociadas no período. Ausente na resposta antiga. */
  renegotiatedInvoices?: RenegotiatedInvoice[];
  categorias: PainelCategoria[];
  /** De onde veio o dinheiro: recebido e a receber por classificação, comprometimento previsto, fixa × variável. */
  receitas: {
    porClassificacao: PainelFatia[];
    aReceber: { total: number; porClassificacao: PainelFatia[] };
    rendaPrevista: number;
    comprometimentoPrevisto: number | null;
    fixa: number;
    variavel: number;
    temFixa: boolean;
    periodoEncerrado: boolean;
  };
  /** Para onde foi: despesas do período pela categoria principal. */
  despesasPorCategoria: PainelFatia[];
  /** Compras cadastradas por outra pessoa no cartão de quem paga, por categoria e quem cadastrou. */
  categoriasPorOutros: { categoriaId: number | null; autorId: number; autorNome: string; total: number }[];
  empresa: {
    estoqueBaixo: { id: string; nome: string; quantidadeEstoque: number; estoqueMinimo: number }[];
  } | null;
  /** Opções do botão de filtros: formas e cartões das despesas do período, sem os filtros aplicados. */
  filterOptions: { paymentMethods: string[]; cards: { id: number; name: string }[] };
}
