export function formatCNPJ(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function formatCPF(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatDocumento(raw: string, tipo: 'pessoal' | 'empresa'): string {
  return tipo === 'empresa' ? formatCNPJ(raw) : formatCPF(raw);
}

/**
 * Para campos que aceitam CPF ou CNPJ sem saber qual de antemão: até 11 dígitos
 * formata como CPF, acima disso como CNPJ.
 */
export function formatDocumentoAuto(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length > 11 ? formatCNPJ(raw) : formatCPF(raw);
}
