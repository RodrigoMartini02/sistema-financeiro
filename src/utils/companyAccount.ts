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

function cnpjCheckDigit(digits: string): number {
  // Pesos de 2 a 9, da direita para a esquerda, recomeçando depois do 9.
  let sum = 0;
  for (let index = 0; index < digits.length; index++) {
    const weight = ((digits.length - 1 - index) % 8) + 2;
    sum += Number(digits[index]) * weight;
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

/** CNPJ com 14 dígitos e os dois dígitos verificadores certos; a pontuação é ignorada. */
export function isValidCnpj(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) {
    return false;
  }
  const first = cnpjCheckDigit(digits.slice(0, 12));
  const second = cnpjCheckDigit(digits.slice(0, 12) + first);
  return digits.endsWith(`${first}${second}`);
}
