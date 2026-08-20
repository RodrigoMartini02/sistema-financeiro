import path from 'path';
import pdfmake from 'pdfmake';

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

export interface DespesaReportRow {
  descricao: string;
  categoria: string | null;
  formaPagamento: string | null;
  dataVencimento: string;
  dataCompra: string | null;
  valorFinal: number | null;
  pago: boolean;
  recorrente: boolean;
  parcelaAtual: number | null;
  numeroParcelas: number | null;
}

export interface ReceitaReportRow {
  descricao: string;
  tipoReceita: string | null;
  dataRecebimento: string;
  status: string | null;
  cliente: string | null;
  representante: string | null;
  valor: number | null;
  valorComissao: number | null;
}

function formatCurrency(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '-';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDate(value: string | null): string {
  if (!value) return '-';
  const [year, month, day] = value.split('T')[0]!.split('-');
  return `${day}/${month}/${year}`;
}

// Mesma lógica de getStatus() em DespesasScreen.tsx
function despesaStatusLabel(row: DespesaReportRow, todayIso: string): string {
  if (row.pago) return 'Pago';
  return row.dataVencimento < todayIso ? 'Atrasada' : 'Em dia';
}

// Mesma lógica de TipoBadge em DespesasScreen.tsx
function despesaTipoLabel(row: DespesaReportRow): string {
  const parcela = row.numeroParcelas ? `${row.parcelaAtual ?? 1}/${row.numeroParcelas}` : null;
  const parts = [parcela, row.recorrente ? 'Recorrente' : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '-';
}

// Mesma lógica de status inline na coluna Data em ReceitasScreen.tsx
function receitaStatusLabel(row: ReceitaReportRow, todayIso: string): string {
  if (row.status === 'cancelada') return 'Cancelada';
  if (row.status === 'prevista') {
    return row.dataRecebimento < todayIso ? 'Em atraso' : 'Prevista';
  }
  return 'Recebida';
}

// Mesma lógica da coluna Cliente/Representante em ReceitasScreen.tsx
function receitaClienteLabel(row: ReceitaReportRow): string {
  return row.representante ?? row.cliente ?? '-';
}

export interface GenerateReportPdfInput {
  periodoLabel: string;
  filtrosLabel: string;
  despesas: DespesaReportRow[];
  receitas: ReceitaReportRow[];
}

export async function generateReportPdf({ periodoLabel, filtrosLabel, despesas, receitas }: GenerateReportPdfInput): Promise<Buffer> {
  const todayIso = new Date().toISOString().slice(0, 10);

  const sortedDespesas = [...despesas].sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));
  const sortedReceitas = [...receitas].sort((a, b) => a.dataRecebimento.localeCompare(b.dataRecebimento));

  const totalDespesas = sortedDespesas.reduce((sum, r) => sum + (r.valorFinal ?? 0), 0);
  const totalReceitas = sortedReceitas.reduce((sum, r) => sum + (r.valor ?? 0), 0);

  const despesasTableBody = [
    [
      { text: 'Descrição', style: 'tableHeader' },
      { text: 'Tipo', style: 'tableHeader' },
      { text: 'Vencimento', style: 'tableHeader' },
      { text: 'Data compra', style: 'tableHeader' },
      { text: 'Categoria', style: 'tableHeader' },
      { text: 'Pagamento', style: 'tableHeader' },
      { text: 'Status', style: 'tableHeader' },
      { text: 'Valor', style: 'tableHeader', alignment: 'right' },
    ],
    ...sortedDespesas.map((row) => [
      row.descricao,
      despesaTipoLabel(row),
      formatDate(row.dataVencimento),
      formatDate(row.dataCompra),
      row.categoria ?? '-',
      row.formaPagamento ?? '-',
      despesaStatusLabel(row, todayIso),
      { text: formatCurrency(row.valorFinal), alignment: 'right' },
    ]),
  ];

  const receitasTableBody = [
    [
      { text: 'Data', style: 'tableHeader' },
      { text: 'Descrição', style: 'tableHeader' },
      { text: 'Cliente/Repr.', style: 'tableHeader' },
      { text: 'Tipo', style: 'tableHeader' },
      { text: 'Status', style: 'tableHeader' },
      { text: 'Comissão', style: 'tableHeader', alignment: 'right' },
      { text: 'Valor', style: 'tableHeader', alignment: 'right' },
    ],
    ...sortedReceitas.map((row) => [
      formatDate(row.dataRecebimento),
      row.descricao,
      receitaClienteLabel(row),
      row.tipoReceita ?? '-',
      receitaStatusLabel(row, todayIso),
      { text: formatCurrency(row.valorComissao), alignment: 'right' },
      { text: formatCurrency(row.valor), alignment: 'right' },
    ]),
  ];

  const zebraFill = (rowIndex: number) => (rowIndex === 0 ? null : rowIndex % 2 === 0 ? '#F8FAFC' : null);

  const docDefinition = {
    pageSize: 'A4',
    pageOrientation: 'landscape' as const,
    pageMargins: [30, 50, 30, 40] as [number, number, number, number],
    defaultStyle: { font: 'Roboto', fontSize: 8 },
    styles: {
      title: { fontSize: 16, bold: true, margin: [0, 0, 0, 4] as [number, number, number, number] },
      subtitle: { fontSize: 10, color: '#555555', margin: [0, 0, 0, 12] as [number, number, number, number] },
      sectionTitle: { fontSize: 11, bold: true, margin: [0, 12, 0, 6] as [number, number, number, number] },
      tableHeader: { bold: true, fontSize: 8, fillColor: '#0EC4D8', color: '#FFFFFF' },
      subtotalLabel: { bold: true, fontSize: 9 },
      subtotalValue: { bold: true, fontSize: 9 },
      totalsLabel: { bold: true, fontSize: 10 },
      totalsValue: { bold: true, fontSize: 10 },
    },
    content: [
      { text: 'Relatório financeiro', style: 'title' },
      { text: `${periodoLabel} — ${filtrosLabel}`, style: 'subtitle' },

      { text: 'Despesas', style: 'sectionTitle' },
      sortedDespesas.length > 0
        ? {
            table: {
              headerRows: 1,
              widths: ['*', 70, 55, 55, 70, 60, 55, 65],
              body: despesasTableBody,
            },
            layout: { fillColor: zebraFill },
          }
        : { text: 'Nenhuma despesa no período.', italics: true, color: '#888888', margin: [0, 0, 0, 4] as [number, number, number, number] },
      {
        margin: [0, 4, 0, 0] as [number, number, number, number],
        alignment: 'right' as const,
        text: [
          { text: 'Subtotal despesas: ', style: 'subtotalLabel' },
          { text: formatCurrency(totalDespesas), style: 'subtotalValue' },
        ],
      },

      { text: 'Receitas', style: 'sectionTitle' },
      sortedReceitas.length > 0
        ? {
            table: {
              headerRows: 1,
              widths: [55, '*', 90, 70, 65, 65, 65],
              body: receitasTableBody,
            },
            layout: { fillColor: zebraFill },
          }
        : { text: 'Nenhuma receita no período.', italics: true, color: '#888888', margin: [0, 0, 0, 4] as [number, number, number, number] },
      {
        margin: [0, 4, 0, 0] as [number, number, number, number],
        alignment: 'right' as const,
        text: [
          { text: 'Subtotal receitas: ', style: 'subtotalLabel' },
          { text: formatCurrency(totalReceitas), style: 'subtotalValue' },
        ],
      },

      {
        margin: [0, 16, 0, 0] as [number, number, number, number],
        columns: [
          { text: '', width: '*' },
          {
            width: 'auto',
            table: {
              body: [
                [{ text: 'Total de receitas:', style: 'totalsLabel' }, { text: formatCurrency(totalReceitas), style: 'totalsValue', alignment: 'right' }],
                [{ text: 'Total de despesas:', style: 'totalsLabel' }, { text: formatCurrency(totalDespesas), style: 'totalsValue', alignment: 'right' }],
                [{ text: 'Saldo do período:', style: 'totalsLabel' }, { text: formatCurrency(totalReceitas - totalDespesas), style: 'totalsValue', alignment: 'right' }],
              ],
            },
            layout: 'noBorders',
          },
        ],
      },
    ],
  };

  const pdfDoc = pdfmake.createPdf(docDefinition);
  return pdfDoc.getBuffer();
}
