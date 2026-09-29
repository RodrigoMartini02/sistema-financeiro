import path from 'path';
import pdfmake from 'pdfmake';
import { formatIsoDateBr } from '../utils/date';
import type { ExpenseStatus, IncomeStatus, PaymentDateWindow, Report, ReportExpense, ReportFilters, ReportIncome } from './reportService';

const FONTS_DIR = path.join(require.resolve('pdfmake/package.json'), '..', 'fonts', 'Roboto');

pdfmake.setFonts({
  Roboto: {
    normal: path.join(FONTS_DIR, 'Roboto-Regular.ttf'),
    bold: path.join(FONTS_DIR, 'Roboto-Medium.ttf'),
    italics: path.join(FONTS_DIR, 'Roboto-Italic.ttf'),
    bolditalics: path.join(FONTS_DIR, 'Roboto-MediumItalic.ttf'),
  },
});
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((filePath) => path.normalize(filePath).startsWith(path.normalize(FONTS_DIR)));

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferência',
};

const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  paid: 'Pago',
  on_time: 'Em dia',
  overdue: 'Atrasada',
};

const INCOME_STATUS_LABELS: Record<IncomeStatus, string> = {
  received: 'Recebida',
  expected: 'Prevista',
  overdue: 'Em atraso',
};

type Margin = [number, number, number, number];

function formatCurrency(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '-';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** "Alimentação › Mercado"; sem grupo, só a categoria. */
function withDetail(main: string | null, detail: string | null): string {
  if (!main) return detail ?? '-';
  return detail ? `${main} › ${detail}` : main;
}

function firstName(fullName: string | null): string {
  return fullName?.split(' ')[0] ?? '-';
}

function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method.toLowerCase()] ?? method;
}

const PAYMENT_DATE_LABELS: Record<PaymentDateWindow, string> = {
  today: 'Pago hoje',
  week: 'Pago esta semana',
  month: 'Pago este mês',
};

/** Resumo dos filtros para o subtítulo do PDF: "Só despesas · Status: Pago · 2 categorias". */
export function describeFilters(filters: ReportFilters, report: Report, peopleCount: number): string {
  const parts: string[] = [];
  if (filters.types.length === 1) parts.push(filters.types[0] === 'expense' ? 'Só despesas' : 'Só receitas');
  if (filters.expenseStatuses.length > 0) parts.push(`Status: ${filters.expenseStatuses.map((status) => EXPENSE_STATUS_LABELS[status]).join(', ')}`);
  if (filters.categoryIds.length > 0) parts.push(`${filters.categoryIds.length} ${filters.categoryIds.length === 1 ? 'categoria' : 'categorias'}`);
  if (filters.paymentMethods.length > 0) parts.push(`Forma: ${filters.paymentMethods.map(paymentMethodLabel).join(', ')}`);
  if (filters.cardIds.length > 0) {
    const cardNames = report.filterOptions.cards.filter((card) => filters.cardIds.includes(card.id)).map((card) => card.name);
    parts.push(`Cartão: ${cardNames.join(', ')}`);
  }
  if (filters.paymentDates.length > 0) parts.push(filters.paymentDates.map((window) => PAYMENT_DATE_LABELS[window]).join(', '));
  if (peopleCount > 1) parts.push(`${peopleCount} pessoas`);
  return parts.length > 0 ? parts.join(' · ') : 'Sem filtros adicionais';
}

/** "Grupo › Sub" (despesa e receita têm o mesmo formato). */
function categoryLabel(row: Pick<ReportExpense | ReportIncome, 'categoryGroup' | 'categoryName'>): string {
  return row.categoryGroup ? withDetail(row.categoryGroup, row.categoryName) : row.categoryName ?? 'Sem categoria';
}

/** Quem paga e, quando outra pessoa usou o cartão, quem cadastrou. */
function expenseUser(row: ReportExpense): string {
  const payer = firstName(row.payerName);
  return row.authorId !== row.payerId ? `${payer} (cadastrado por ${firstName(row.authorName)})` : payer;
}

function expenseType(row: ReportExpense): string {
  const parts = [row.installment, row.recurring ? 'Recorrente' : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '-';
}

export interface ReportPdfLabels {
  period: string;
  filters: string;
}

export async function generateReportPdf(report: Report, labels: ReportPdfLabels): Promise<Buffer> {
  const expectedIncome = report.incomes
    .filter((row) => row.status !== 'received')
    .reduce((sum, row) => sum + row.amount, 0);

  const expensesTableBody = [
    [
      { text: 'Descrição', style: 'tableHeader' },
      { text: 'Tipo', style: 'tableHeader' },
      { text: 'Vencimento', style: 'tableHeader' },
      { text: 'Categoria', style: 'tableHeader' },
      { text: 'Pagamento', style: 'tableHeader' },
      { text: 'Usuário', style: 'tableHeader' },
      { text: 'Status', style: 'tableHeader' },
      { text: 'Valor', style: 'tableHeader', alignment: 'right' },
    ],
    ...report.expenses.map((row) => [
      row.description,
      expenseType(row),
      formatIsoDateBr(row.dueDate),
      categoryLabel(row),
      withDetail(paymentMethodLabel(row.paymentMethod), row.cardName),
      expenseUser(row),
      EXPENSE_STATUS_LABELS[row.status],
      { text: formatCurrency(row.amount), alignment: 'right' },
    ]),
  ];

  const incomesTableBody = [
    [
      { text: 'Data', style: 'tableHeader' },
      { text: 'Descrição', style: 'tableHeader' },
      { text: 'Cliente/Repr.', style: 'tableHeader' },
      { text: 'Categoria', style: 'tableHeader' },
      { text: 'Usuário', style: 'tableHeader' },
      { text: 'Status', style: 'tableHeader' },
      { text: 'Comissão', style: 'tableHeader', alignment: 'right' },
      { text: 'Valor', style: 'tableHeader', alignment: 'right' },
    ],
    ...report.incomes.map((row) => [
      formatIsoDateBr(row.receiptDate),
      row.description,
      row.representative ?? row.client ?? '-',
      categoryLabel(row),
      firstName(row.authorName),
      INCOME_STATUS_LABELS[row.status],
      { text: formatCurrency(row.commission), alignment: 'right' },
      { text: formatCurrency(row.amount), alignment: 'right' },
    ]),
  ];

  const zebraFill = (rowIndex: number) => (rowIndex === 0 ? null : rowIndex % 2 === 0 ? '#F8FAFC' : null);
  const emptyText = (text: string) => ({ text, italics: true, color: '#888888', margin: [0, 0, 0, 4] as Margin });
  const subtotal = (label: string, value: number) => ({
    margin: [0, 4, 0, 0] as Margin,
    alignment: 'right' as const,
    text: [{ text: `${label}: `, style: 'subtotal' }, { text: formatCurrency(value), style: 'subtotal' }],
  });

  const docDefinition = {
    pageSize: 'A4',
    pageOrientation: 'landscape' as const,
    pageMargins: [30, 50, 30, 40] as Margin,
    defaultStyle: { font: 'Roboto', fontSize: 8 },
    styles: {
      title: { fontSize: 16, bold: true, margin: [0, 0, 0, 4] as Margin },
      subtitle: { fontSize: 10, color: '#555555', margin: [0, 0, 0, 12] as Margin },
      sectionTitle: { fontSize: 11, bold: true, margin: [0, 12, 0, 6] as Margin },
      tableHeader: { bold: true, fontSize: 8, fillColor: '#0EC4D8', color: '#FFFFFF' },
      subtotal: { bold: true, fontSize: 9 },
      totals: { bold: true, fontSize: 10 },
    },
    content: [
      { text: 'Relatório financeiro', style: 'title' },
      { text: `${labels.period} — ${labels.filters}`, style: 'subtitle' },

      { text: 'Despesas', style: 'sectionTitle' },
      report.expenses.length > 0
        ? {
            table: { headerRows: 1, widths: ['*', 55, 55, 95, 90, 90, 50, 65], body: expensesTableBody },
            layout: { fillColor: zebraFill },
          }
        : emptyText('Nenhuma despesa no período.'),
      subtotal('Subtotal despesas', report.totals.expense),

      { text: 'Receitas', style: 'sectionTitle' },
      report.incomes.length > 0
        ? {
            table: { headerRows: 1, widths: [55, '*', 90, 95, 60, 55, 60, 65], body: incomesTableBody },
            layout: { fillColor: zebraFill },
          }
        : emptyText('Nenhuma receita no período.'),
      subtotal('Subtotal receitas recebidas', report.totals.income),
      ...(expectedIncome > 0 ? [subtotal('Previstas (fora do total)', expectedIncome)] : []),

      {
        margin: [0, 16, 0, 0] as Margin,
        columns: [
          { text: '', width: '*' },
          {
            width: 'auto',
            table: {
              body: [
                [{ text: 'Total de receitas:', style: 'totals' }, { text: formatCurrency(report.totals.income), style: 'totals', alignment: 'right' }],
                [{ text: 'Total de despesas:', style: 'totals' }, { text: formatCurrency(report.totals.expense), style: 'totals', alignment: 'right' }],
                [{ text: 'Saldo do período:', style: 'totals' }, { text: formatCurrency(report.totals.income - report.totals.expense), style: 'totals', alignment: 'right' }],
              ],
            },
            layout: 'noBorders',
          },
        ],
      },
    ],
  };

  return pdfmake.createPdf(docDefinition).getBuffer();
}
