// CNPJ no módulo de Licitações (plano .plans/licitacoes-pagina-cnpj.md): uma regra só para as rotas, os serviços e o armazém.
// `isCnpjFormat` confere só os 14 dígitos (os filtros das buscas aceitam o que a fonte traz, inclusive os raros com dígito
// verificador errado); `isValidCnpj` confere também os dígitos verificadores, e vale para abrir a página de um CNPJ.

const CNPJ_FORMAT = /^\d{14}$/;
const REPEATED_DIGITS = /^(\d)\1{13}$/;
const FIRST_CHECK_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const SECOND_CHECK_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const MODULUS = 11;

/** Só os dígitos do texto ("22.493.902/0001-40" vira "22493902000140"). */
export function normalizeCnpj(text: string): string {
  return text.replace(/\D/g, '');
}

/** Texto com exatamente 14 dígitos, sem conferir os dígitos verificadores. */
export function isCnpjFormat(value: unknown): value is string {
  return typeof value === 'string' && CNPJ_FORMAT.test(value);
}

function checkDigit(digits: string, weights: readonly number[]): number {
  let sum = 0;
  for (const [index, weight] of weights.entries()) {
    sum += Number(digits[index]) * weight;
  }
  const rest = sum % MODULUS;
  return rest < 2 ? 0 : MODULUS - rest;
}

/** 14 dígitos com os dois dígitos verificadores certos; os 14 dígitos iguais ("00000000000000") não valem. */
export function isValidCnpj(value: unknown): value is string {
  if (!isCnpjFormat(value) || REPEATED_DIGITS.test(value)) {
    return false;
  }
  return checkDigit(value, FIRST_CHECK_WEIGHTS) === Number(value[12]) && checkDigit(value, SECOND_CHECK_WEIGHTS) === Number(value[13]);
}

/** O CNPJ não tem 14 dígitos: nada vira consulta no armazém. */
export class InvalidCnpjError extends Error {
  constructor() {
    super('CNPJ inválido: informe os 14 dígitos');
    this.name = 'InvalidCnpjError';
  }
}

/** O CNPJ que vai virar literal numa consulta do armazém; fora do formato, `InvalidCnpjError` e consulta nenhuma. */
export function requireCnpjFormat(value: string): string {
  if (!isCnpjFormat(value)) {
    throw new InvalidCnpjError();
  }
  return value;
}
