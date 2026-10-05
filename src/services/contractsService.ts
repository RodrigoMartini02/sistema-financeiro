// Contratos da conta PJ (/api/contracts): ficha, prévia das receitas, criar,
// alterar, encerrar, excluir, aditivo, reajuste, "Faturar", carteira do
// painel, contratos com banco de horas e anexos.
import { apiRequest, getApiUrl } from './apiClient';
import type {
  ChargeKind, ClientType, ContractStatus, WithholdingTax,
} from '../utils/contractDisplay';

export type WithholdingRates = Partial<Record<WithholdingTax, number>>;
export type WithholdingAmounts = Record<WithholdingTax, number>;
export type AttachmentKind = 'pdf' | 'jpg' | 'png';

export interface InstallmentCharge {
  amount: number;
  installments: number;
  firstDate: string;
}

export interface ContractHourType {
  id: number;
  name: string;
  hourlyRate: number;
  quantity: number;
  used: number;
  balance: number;
}

export interface CommitmentBalance {
  year: number;
  number: string;
  amount: number;
  used: number;
  balance: number;
}

export interface ContractIncome {
  id: number;
  description: string;
  status: string;
  chargeKind: ChargeKind | null;
  competence: string | null;
  dueDate: string;
  amount: number;
  grossAmount: number | null;
  withholdings: WithholdingAmounts | null;
  hours: { hourTypeName: string; hours: number } | null;
}

export interface ContractAttachment {
  id: number;
  contractId: number;
  originalName: string;
  kind: AttachmentKind;
  size: number;
  createdAt: string;
}

export interface ContractDetail {
  id: number;
  accountId: number;
  number: string | null;
  description: string | null;
  notes: string | null;
  startDate: string;
  endDate: string | null;
  dueDay: number;
  status: ContractStatus;
  closedAt: string | null;
  previousContractId: number | null;
  nextContractId: number | null;
  amendmentNumber: number;
  client: { id: number; name: string; type: ClientType; document: string; active: boolean };
  representative: { id: number; name: string } | null;
  monthlyClassificationId: number | null;
  setupClassificationId: number | null;
  projectClassificationId: number | null;
  monthlyFee: number | null;
  monthlyNet: number | null;
  setupFee: InstallmentCharge | null;
  projectFee: InstallmentCharge | null;
  hourTypes: ContractHourType[];
  publicEntity: {
    process: string | null;
    modality: string | null;
    withholdings: WithholdingRates;
    commitments: CommitmentBalance[];
  } | null;
  services: Array<{ serviceId: number; name: string; deployed: boolean; active: boolean }>;
  readjustment: { baseDate: string; handledUntil: string | null; available: boolean; anniversary: string };
  expiringSoon: boolean;
  incomes: ContractIncome[];
  attachments: ContractAttachment[];
  canDelete: boolean;
}

export interface ContractListItem {
  id: number;
  number: string | null;
  description: string | null;
  status: ContractStatus;
  startDate: string;
  endDate: string | null;
  dueDay: number;
  closedAt: string | null;
  amendmentNumber: number;
  previousContractId: number | null;
  monthlyFee: number | null;
  monthlyNet: number | null;
  hasHours: boolean;
  expiringSoon: boolean;
  readjustmentAvailable: boolean;
  overdueCount: number;
  overdueAmount: number;
}

/** Corpo do contrato, igual na criação, na alteração, no aditivo e na prévia. */
export interface ContractRequest {
  number: string;
  description: string;
  notes: string;
  startDate: string;
  endDate: string | null;
  dueDay: number;
  monthlyFee: number | null;
  setupFee: InstallmentCharge | null;
  projectFee: InstallmentCharge | null;
  hourTypes: Array<{ id: number | null; name: string; hourlyRate: number; quantity: number }>;
  representativeId: number | null;
  monthlyClassificationId: number | null;
  setupClassificationId: number | null;
  projectClassificationId: number | null;
  services: Array<{ serviceId: number; deployed: boolean }>;
  readjustmentBaseDate: string | null;
  process: string;
  modality: string;
  withholdings: WithholdingRates;
  commitments: Array<{ year: number; number: string; amount: number }>;
}

/** Para onde vai a prévia: contrato novo do cliente, alteração ou aditivo. */
export type ContractPreviewTarget =
  | { mode: 'create'; accountId: number; clientId: number }
  | { mode: 'update'; contractId: number }
  | { mode: 'amendment'; contractId: number };

export interface PreviewIncome {
  chargeKind: ChargeKind;
  competence: string;
  dueDate: string;
  description: string;
  installment: number | null;
  installments: number | null;
  grossAmount: number;
  withholdings: WithholdingAmounts | null;
  amount: number;
}

export interface ContractPreview {
  incomes: PreviewIncome[];
  totalGross: number;
  totalNet: number;
  replacedCount: number;
}

export interface InvoiceResult {
  incomeId: number;
  status: string;
  warning: string | null;
}

export interface PortfolioItem {
  contractId: number;
  number: string | null;
  clientId: number;
  clientName: string;
  status: ContractStatus;
  monthlyFee: number;
  monthlyNet: number;
  income: { id: number; status: string; amount: number; dueDate: string } | null;
}

export interface ContractWithHours {
  contractId: number;
  number: string | null;
  description: string | null;
  clientId: number;
  clientName: string;
  clientType: ClientType;
  withholdings: WithholdingRates;
  representativeId: number | null;
  hourTypes: ContractHourType[];
}

function previewTargetFields(target: ContractPreviewTarget): Record<string, number> {
  if (target.mode === 'create') return { accountId: target.accountId, clientId: target.clientId };
  if (target.mode === 'update') return { contractId: target.contractId };
  return { amendmentOf: target.contractId };
}

export function fetchClientContracts(accountId: number, clientId: number): Promise<ContractListItem[]> {
  return apiRequest<ContractListItem[]>(`/contracts?accountId=${accountId}&clientId=${clientId}`);
}

export function fetchContract(id: number): Promise<ContractDetail> {
  return apiRequest<ContractDetail>(`/contracts/${id}`);
}

export function previewContract(target: ContractPreviewTarget, body: ContractRequest): Promise<ContractPreview> {
  return apiRequest<ContractPreview>('/contracts/preview', {
    method: 'POST',
    body: JSON.stringify({ ...body, ...previewTargetFields(target) }),
  });
}

export function createContract(accountId: number, clientId: number, body: ContractRequest): Promise<ContractDetail> {
  return apiRequest<ContractDetail>('/contracts', { method: 'POST', body: JSON.stringify({ ...body, accountId, clientId }) });
}

export function updateContract(id: number, body: ContractRequest): Promise<ContractDetail> {
  return apiRequest<ContractDetail>(`/contracts/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function createAmendment(id: number, body: ContractRequest): Promise<ContractDetail> {
  return apiRequest<ContractDetail>(`/contracts/${id}/amendment`, { method: 'POST', body: JSON.stringify(body) });
}

export function closeContract(id: number): Promise<ContractDetail> {
  return apiRequest<ContractDetail>(`/contracts/${id}/close`, { method: 'POST' });
}

export function deleteContract(id: number): Promise<void> {
  return apiRequest<void>(`/contracts/${id}`, { method: 'DELETE' });
}

export function applyReadjustment(id: number, percent: number): Promise<ContractDetail> {
  return apiRequest<ContractDetail>(`/contracts/${id}/readjustment`, {
    method: 'POST',
    body: JSON.stringify({ action: 'apply', percent }),
  });
}

export function dismissReadjustment(id: number): Promise<ContractDetail> {
  return apiRequest<ContractDetail>(`/contracts/${id}/readjustment`, {
    method: 'POST',
    body: JSON.stringify({ action: 'dismiss' }),
  });
}

export function invoiceContractIncome(incomeId: number): Promise<InvoiceResult> {
  return apiRequest<InvoiceResult>(`/contracts/incomes/${incomeId}/invoice`, { method: 'POST' });
}

export function fetchContractPortfolio(accountId: number, month: number, year: number): Promise<PortfolioItem[]> {
  return apiRequest<PortfolioItem[]>(`/contracts/portfolio?accountId=${accountId}&month=${month}&year=${year}`);
}

export function fetchContractsWithHours(accountId: number): Promise<ContractWithHours[]> {
  return apiRequest<ContractWithHours[]>(`/contracts/with-hours?accountId=${accountId}`);
}

function authHeaders(): HeadersInit {
  const token = sessionStorage.getItem('token') ?? localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Envio em multipart (campo "file"): o apiRequest só manda JSON. */
export async function uploadContractAttachment(contractId: number, file: File): Promise<ContractAttachment> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${getApiUrl()}/contracts/${contractId}/attachments`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  const payload = await response.json().catch(() => ({})) as { success?: boolean; message?: string; data?: ContractAttachment };
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.message ?? 'Não foi possível enviar o anexo agora.');
  }
  return payload.data;
}

/** Conteúdo do anexo, para abrir na tela com o tipo conferido. */
export async function fetchContractAttachmentFile(attachmentId: number): Promise<Blob> {
  const response = await fetch(`${getApiUrl()}/contracts/attachments/${attachmentId}/file`, { headers: authHeaders() });
  if (!response.ok) {
    throw new Error('Não foi possível abrir o anexo agora.');
  }
  return response.blob();
}

export function deleteContractAttachment(attachmentId: number): Promise<void> {
  return apiRequest<void>(`/contracts/attachments/${attachmentId}`, { method: 'DELETE' });
}
