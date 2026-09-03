import { getApiUrl, getActiveAccountId } from './apiClient';

interface DownloadReportPdfParams {
  dataInicio: string;
  dataFim: string;
  tipoFiltro: 'todos' | 'despesas' | 'receitas';
  formaFiltro: string;
  statusFiltro: 'todos' | 'pago' | 'pendente';
}

export async function downloadReportPdf({ dataInicio, dataFim, tipoFiltro, formaFiltro, statusFiltro }: DownloadReportPdfParams): Promise<void> {
  const token = sessionStorage.getItem('token') ?? localStorage.getItem('token');
  const accountId = getActiveAccountId();

  const params = new URLSearchParams({ data_inicio: dataInicio, data_fim: dataFim });
  if (tipoFiltro !== 'todos') params.set('tipo', tipoFiltro);
  if (formaFiltro !== 'todos') params.set('forma', formaFiltro);
  if (statusFiltro !== 'todos') params.set('status', statusFiltro);
  if (accountId) params.set('conta_id', String(accountId));

  const response = await fetch(`${getApiUrl()}/relatorios/pdf?${params}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(payload.message ?? 'Não foi possível gerar o relatório em PDF');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `relatorio-${dataInicio}-a-${dataFim}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
