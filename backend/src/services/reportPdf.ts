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

export interface ReportRow {
  tipo: 'despesa' | 'receita';
  descricao: string;
  categoria: string | null;
  formaPagamento: string | null;
  dataVencimento: string | null;
  dataCompra: string | null;
  dataPagamento: string | null;
  dataRecebimento: string | null;
  valorOriginal: number | null;
  valorFinal: number | null;
  valorPago: number | null;
  pago: boolean | null;
  parcelaAtual: number | null;
  numeroParcelas: number | null;
  cliente: string | null;
  representante: string | null;
  numeroNf: string | null;
  dataEmissaoNf: string | null;
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

function rowDate(row: ReportRow): string {
  const date = row.tipo === 'despesa' ? row.dataVencimento : row.dataRecebimento;
  return formatDate(date);
}

function rowValue(row: ReportRow): number | null {
  return row.tipo === 'despesa' ? row.valorFinal : row.valorOriginal;
}

function rowSortKey(row: ReportRow): string {
  const date = row.tipo === 'despesa' ? row.dataVencimento : row.dataRecebimento;
  return date ?? '';
}

export interface GenerateReportPdfInput {
  periodoLabel: string;
  filtrosLabel: string;
  rows: ReportRow[];
}

export async function generateReportPdf({ periodoLabel, filtrosLabel, rows }: GenerateReportPdfInput): Promise<Buffer> {
  const sortedRows = [...rows].sort((a, b) => rowSortKey(a).localeCompare(rowSortKey(b)));

  const totalDespesas = sortedRows
    .filter((r) => r.tipo === 'despesa')
    .reduce((sum, r) => sum + (r.valorFinal ?? 0), 0);
  const totalReceitas = sortedRows
    .filter((r) => r.tipo === 'receita')
    .reduce((sum, r) => sum + (r.valorOriginal ?? 0), 0);

  const tableBody = [
    [
      { text: 'Data', style: 'tableHeader' },
      { text: 'Tipo', style: 'tableHeader' },
      { text: 'Descrição', style: 'tableHeader' },
      { text: 'Categoria', style: 'tableHeader' },
      { text: 'Forma', style: 'tableHeader' },
      { text: 'Status', style: 'tableHeader' },
      { text: 'Cliente/Repr.', style: 'tableHeader' },
      { text: 'Parcela', style: 'tableHeader' },
      { text: 'Valor', style: 'tableHeader', alignment: 'right' },
    ],
    ...sortedRows.map((row) => [
      rowDate(row),
      row.tipo === 'despesa' ? 'Despesa' : 'Receita',
      row.descricao,
      row.categoria ?? '-',
      row.formaPagamento ?? '-',
      row.tipo === 'despesa' ? (row.pago ? 'Pago' : 'Pendente') : '-',
      row.cliente ?? row.representante ?? '-',
      row.numeroParcelas ? `${row.parcelaAtual ?? 1}/${row.numeroParcelas}` : '-',
      { text: formatCurrency(rowValue(row)), alignment: 'right' },
    ]),
  ];

  const docDefinition = {
    pageSize: 'A4',
    pageOrientation: 'landscape' as const,
    pageMargins: [30, 50, 30, 40] as [number, number, number, number],
    defaultStyle: { font: 'Roboto', fontSize: 8 },
    styles: {
      title: { fontSize: 16, bold: true, margin: [0, 0, 0, 4] as [number, number, number, number] },
      subtitle: { fontSize: 10, color: '#555555', margin: [0, 0, 0, 12] as [number, number, number, number] },
      tableHeader: { bold: true, fontSize: 8, fillColor: '#0EC4D8', color: '#FFFFFF' },
      totalsLabel: { bold: true, fontSize: 10 },
      totalsValue: { bold: true, fontSize: 10 },
    },
    content: [
      { text: 'Relatório financeiro', style: 'title' },
      { text: `${periodoLabel} — ${filtrosLabel}`, style: 'subtitle' },
      {
        table: {
          headerRows: 1,
          widths: [55, 45, '*', 70, 55, 50, 80, 40, 65],
          body: tableBody,
        },
        layout: {
          fillColor: (rowIndex: number) => (rowIndex === 0 ? null : rowIndex % 2 === 0 ? '#F8FAFC' : null),
        },
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
