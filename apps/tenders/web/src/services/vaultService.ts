import type {
  NewVaultDocument,
  NewVaultPerson,
  VaultDocument,
  VaultDocumentChanges,
  VaultDocumentLink,
  VaultDocumentList,
  VaultPerson,
  VaultPersonChanges,
  VaultPersonList,
} from '../types';
import { tendersRequest } from './tendersApi';

// Cofre de documentos (plano .plans/licitacoes-5-cofre-de-documentos.md). Os documentos da empresa são de todos com acesso
// ao módulo; as pessoas e os documentos delas, só do titular. O arquivo vai no corpo como data URL e mora no R2; a chave
// dele nunca vem na resposta: o arquivo abre por um link de vida curta.

export function fetchVaultDocuments(): Promise<VaultDocumentList> {
  return tendersRequest<VaultDocumentList>('/vault/documents');
}

export async function createVaultDocument(body: NewVaultDocument): Promise<VaultDocument> {
  const data = await tendersRequest<{ document: VaultDocument }>('/vault/documents', { method: 'POST', body: JSON.stringify(body) });
  return data.document;
}

/** Campo ausente mantém e vazio limpa; o arquivo só vai quando troca. */
export async function updateVaultDocument(id: number, changes: VaultDocumentChanges): Promise<VaultDocument> {
  const data = await tendersRequest<{ document: VaultDocument }>(`/vault/documents/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });
  return data.document;
}

export function deleteVaultDocument(id: number): Promise<{ id: number }> {
  return tendersRequest<{ id: number }>(`/vault/documents/${id}`, { method: 'DELETE' });
}

/** O link de abertura do arquivo (vale por 2 minutos): pede-se a cada clique em "Abrir". */
export function fetchVaultDocumentLink(id: number): Promise<VaultDocumentLink> {
  return tendersRequest<VaultDocumentLink>(`/vault/documents/${id}/link`);
}

export function fetchVaultPeople(): Promise<VaultPersonList> {
  return tendersRequest<VaultPersonList>('/vault/people');
}

export async function createVaultPerson(body: NewVaultPerson): Promise<VaultPerson> {
  const data = await tendersRequest<{ person: VaultPerson }>('/vault/people', { method: 'POST', body: JSON.stringify(body) });
  return data.person;
}

export async function updateVaultPerson(id: number, changes: VaultPersonChanges): Promise<VaultPerson> {
  const data = await tendersRequest<{ person: VaultPerson }>(`/vault/people/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });
  return data.person;
}

/** Apaga a pessoa e os documentos dela. */
export function deleteVaultPerson(id: number): Promise<{ id: number; removedDocuments: number }> {
  return tendersRequest<{ id: number; removedDocuments: number }>(`/vault/people/${id}`, { method: 'DELETE' });
}
