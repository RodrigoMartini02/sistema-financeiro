import { formatCnpj, formatCpf } from '@ui/utils/brazilDocuments';

export const COMPANY_CLASSIFICATION_OPTIONS = [
  { value: 'MEI', label: 'MEI', description: 'Microempreendedor Individual' },
  { value: 'ME', label: 'ME', description: 'Microempresa' },
  { value: 'EPP', label: 'EPP', description: 'Empresa de Pequeno Porte' },
  { value: 'SLU', label: 'SLU', description: 'Sociedade Limitada Unipessoal' },
  { value: 'EIRELI', label: 'EIRELI', description: 'Empresa Individual de Resp. Limitada' },
  { value: 'LTDA', label: 'LTDA', description: 'Sociedade Limitada' },
  { value: 'SA', label: 'SA', description: 'Sociedade Anônima' },
] as const;

export function formatRegistrationDocument(raw: string, type: 'pessoal' | 'empresa'): string {
  return type === 'empresa' ? formatCnpj(raw) : formatCpf(raw);
}
