// CPF, CNPJ, telefone e CEP: máscaras de digitação e conferência dos dígitos
// verificadores, as mesmas contas do servidor (backend/src/middleware/validation.ts).
// Usado no cadastro de clientes, na conta PJ, no login e no checkout da vitrine.

export const BRAZIL_STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ',
  'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** "52998224725" → "529.982.247-25", formatando enquanto se digita. */
export function formatCpf(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** "11222333000181" → "11.222.333/0001-81", formatando enquanto se digita. */
export function formatCnpj(value: string): string {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/** Documento só com dígitos, formatado pelo tamanho: 11 é CPF, 14 é CNPJ. */
export function formatDocument(value: string): string {
  return onlyDigits(value).length > 11 ? formatCnpj(value) : formatCpf(value);
}

/** CPF com dígitos verificadores; a pontuação é ignorada. */
export function isValidCpf(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) {
    return false;
  }
  const checkDigit = (length: number) => {
    const sum = digits
      .slice(0, length)
      .split('')
      .reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return checkDigit(9) === Number(digits[9]) && checkDigit(10) === Number(digits[10]);
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
  const digits = onlyDigits(value);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) {
    return false;
  }
  const first = cnpjCheckDigit(digits.slice(0, 12));
  const second = cnpjCheckDigit(digits.slice(0, 12) + first);
  return digits.endsWith(`${first}${second}`);
}

/** "(19) 3232-1000" ou "(19) 98765-4321", formatando enquanto se digita. */
export function formatPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  const number = digits.slice(2);
  if (number.length <= 4) return `(${digits.slice(0, 2)}) ${number}`;
  const splitAt = number.length === 9 ? 5 : 4;
  return `(${digits.slice(0, 2)}) ${number.slice(0, splitAt)}-${number.slice(splitAt)}`;
}

/** "13015000" → "13015-000". */
export function formatCep(value: string): string {
  const digits = onlyDigits(value).slice(0, 8);
  return digits.length <= 5 ? digits : `${digits.slice(0, 5)}-${digits.slice(5)}`;
}
