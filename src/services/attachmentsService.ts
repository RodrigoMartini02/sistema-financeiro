// Anexos de contratos, produtos e (depois) lançamentos, em /api/attachments. O arquivo passa pelo servidor só no
// envio; para abrir, o app pede um link de vida curta e o navegador baixa direto do R2.
import type { AttachmentOwnerType } from '../utils/attachmentRules';
import { apiRequest, getApiUrl } from './apiClient';

/** O anexo como o servidor devolve: sem a chave do arquivo nem o dono. */
export interface AttachmentSummary {
  id: string;
  name: string;
  contentType: string;
  size: number;
  createdAt: string;
}

export interface AttachmentLink {
  url: string;
  expiresAt: string;
}

function authHeaders(): HeadersInit {
  const token = sessionStorage.getItem('token') ?? localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Envia um arquivo (multipart, campo "file": o apiRequest só manda JSON). Contrato e produto já existem e levam o
 * `ownerId`; despesa e receita não levam, e o arquivo fica pendente até o lançamento ser salvo.
 */
export async function uploadAttachment(ownerType: AttachmentOwnerType, file: File, ownerId?: number | string): Promise<AttachmentSummary> {
  const query = new URLSearchParams({ ownerType });
  if (ownerId !== undefined) {
    query.set('ownerId', String(ownerId));
  }
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${getApiUrl()}/attachments?${query.toString()}`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  });
  const payload = await response.json().catch(() => ({})) as { success?: boolean; message?: string; data?: AttachmentSummary };
  if (!response.ok || !payload.success || !payload.data) {
    throw new Error(payload.message ?? 'Não foi possível enviar o anexo agora.');
  }
  return payload.data;
}

/** Link de leitura do arquivo, válido por poucos minutos. */
export function fetchAttachmentLink(attachmentId: string): Promise<AttachmentLink> {
  return apiRequest<AttachmentLink>(`/attachments/${attachmentId}/link`);
}

export function deleteAttachment(attachmentId: string): Promise<void> {
  return apiRequest<void>(`/attachments/${attachmentId}`, { method: 'DELETE' });
}

/**
 * Abre o anexo numa aba nova. A aba é aberta já no clique (depois de uma espera, o bloqueador de janelas barra) e
 * segue para o link do R2 assim que ele chega. PDF e imagem abrem na aba; o resto baixa.
 */
export async function openAttachment(attachmentId: string): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const link = await fetchAttachmentLink(attachmentId);
    if (tab) {
      tab.opener = null;
      tab.location.replace(link.url);
    } else {
      window.location.assign(link.url);
    }
  } catch (error) {
    tab?.close();
    throw error;
  }
}
