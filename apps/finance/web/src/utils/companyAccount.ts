// Regras do bloco da empresa (conta PJ), iguais no cadastro pelo site, na Nova
// conta e no Editar conta. O servidor confere as mesmas regras
// (backend/src/services/companyAccountInput.ts).
import type { Enquadramento } from '../types/config';

export const ENQUADRAMENTO_OPTIONS: { value: Enquadramento; label: string; description: string }[] = [
  { value: 'MEI',    label: 'MEI',    description: 'Microempreendedor Individual' },
  { value: 'ME',     label: 'ME',     description: 'Microempresa' },
  { value: 'EPP',    label: 'EPP',    description: 'Empresa de Pequeno Porte' },
  { value: 'SLU',    label: 'SLU',    description: 'Sociedade Limitada Unipessoal' },
  { value: 'EIRELI', label: 'EIRELI', description: 'Empresa Individual de Resp. Limitada' },
  { value: 'LTDA',   label: 'LTDA',   description: 'Sociedade Limitada' },
  { value: 'SA',     label: 'SA',     description: 'Sociedade Anônima' },
];

/** Nome da empresa: nome fantasia ou, sem ele, razão social. */
export function companyDisplayName(company: { nome_fantasia?: string | null; razao_social?: string | null }): string {
  return company.nome_fantasia?.trim() || company.razao_social?.trim() || '';
}
