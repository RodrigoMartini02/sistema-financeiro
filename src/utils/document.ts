import { formatCnpj, formatCpf, formatDocument } from './brazilDocuments';

// Nomes usados pelas telas de conta e de login; as máscaras são as de brazilDocuments.
export const formatCNPJ = formatCnpj;
export const formatCPF = formatCpf;

export function formatDocumento(raw: string, tipo: 'pessoal' | 'empresa'): string {
  return tipo === 'empresa' ? formatCnpj(raw) : formatCpf(raw);
}

/**
 * Para campos que aceitam CPF ou CNPJ sem saber qual de antemão: até 11 dígitos
 * formata como CPF, acima disso como CNPJ.
 */
export const formatDocumentoAuto = formatDocument;
