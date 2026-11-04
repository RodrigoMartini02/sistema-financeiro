// Contrato de GET /api/reports (mesmos nomes do backend: services/reportService.ts).

export type ReportEntryType = 'income' | 'expense';
export type ReportExpenseStatus = 'paid' | 'on_time' | 'overdue';
export type ReportPaymentDateWindow = 'today' | 'week' | 'month';
export type ReportIncomeStatus = 'received' | 'expected' | 'overdue';

export interface ReportQuery {
  startDate: string;
  endDate: string;
  types: ReportEntryType[];
  expenseStatuses: ReportExpenseStatus[];
  categoryIds: number[];
  paymentMethods: string[];
  cardIds: number[];
  paymentDates: ReportPaymentDateWindow[];
  /** Vazio = só quem está logado. */
  memberIds: number[];
}

export interface ReportExpense {
  id: number;
  description: string;
  categoryId: number | null;
  categoryName: string | null;
  categoryGroup: string | null;
  paymentMethod: string;
  cardId: number | null;
  cardName: string | null;
  payerId: number;
  payerName: string | null;
  authorId: number;
  authorName: string | null;
  dueDate: string;
  paymentDate: string | null;
  status: ReportExpenseStatus;
  installment: string | null;
  recurring: boolean;
  amount: number;
}

export interface ReportIncome {
  id: number;
  description: string;
  categoryName: string | null;
  categoryGroup: string | null;
  receiptDate: string;
  status: ReportIncomeStatus;
  authorId: number;
  authorName: string | null;
  client: string | null;
  representative: string | null;
  commission: number | null;
  amount: number;
}

export interface Report {
  period: { start: string; end: string };
  expenses: ReportExpense[];
  incomes: ReportIncome[];
  /** `income` soma só as recebidas; previstas ficam fora do total. */
  totals: { income: number; incomeCount: number; expense: number; expenseCount: number };
  filterOptions: {
    paymentMethods: string[];
    cards: Array<{ id: number; name: string }>;
  };
}
