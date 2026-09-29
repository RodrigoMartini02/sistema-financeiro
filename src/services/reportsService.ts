import { apiRequest, getActiveAccountId, getApiUrl } from './apiClient';
import type { Report, ReportQuery } from '../types/reports';

function toSearchParams(query: ReportQuery): URLSearchParams {
  const params = new URLSearchParams({ start_date: query.startDate, end_date: query.endDate });
  const appendAll = (name: string, values: Array<string | number>) => {
    for (const value of values) params.append(name, String(value));
  };
  appendAll('type', query.types);
  appendAll('status', query.expenseStatuses);
  appendAll('category_id', query.categoryIds);
  appendAll('payment_method', query.paymentMethods);
  appendAll('card_id', query.cardIds);
  appendAll('payment_date', query.paymentDates);
  appendAll('member_id', query.memberIds);
  const accountId = getActiveAccountId();
  if (accountId) params.set('account_id', String(accountId));
  return params;
}

export function fetchReport(query: ReportQuery): Promise<Report> {
  return apiRequest<Report>(`/reports?${toSearchParams(query)}`);
}

/** Baixa o PDF com os mesmos filtros da tela (o backend monta os dois pela mesma fonte). */
export async function downloadReportPdf(query: ReportQuery): Promise<void> {
  const token = sessionStorage.getItem('token') ?? localStorage.getItem('token');
  const response = await fetch(`${getApiUrl()}/reports/pdf?${toSearchParams(query)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(payload.message ?? 'Não foi possível gerar o relatório em PDF');
  }

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = `relatorio-${query.startDate}-a-${query.endDate}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
