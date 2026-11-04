// Checkout da vitrine: máscaras e validação das etapas (identificação,
// entrega e cartão), o total com a taxa de entrega e a contagem regressiva do
// Pix. A validação final é do servidor (backend/src/services/orderInput.ts);
// aqui é para o cliente corrigir antes.
import { BRAZIL_STATES, formatCep, formatCpf, formatPhone, isValidCpf, onlyDigits } from './brazilDocuments';
import { cartSavings, cartTotal, type CartLine } from './storefrontCart';

// As telas da vitrine continuam importando daqui as máscaras, as UFs e o CPF, que são de brazilDocuments.
export { BRAZIL_STATES, formatCep, formatCpf, formatPhone, isValidCpf, onlyDigits };

export type CheckoutDeliveryType = 'retirada' | 'entrega';

export interface CheckoutIdentification {
  nome: string;
  email: string;
  telefone: string;
  cpf: string;
}

export interface CheckoutAddress {
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
}

/** Cartão digitado no checkout; vira token na biblioteca do Mercado Pago e nunca vai ao servidor. */
export interface CheckoutCard {
  numero: string;
  nome: string;
  /** "MM/AA". */
  validade: string;
  cvv: string;
  /** CPF do titular do cartão (começa com o de quem compra). */
  cpf: string;
}

export interface CheckoutTotals {
  subtotal: number;
  savings: number;
  deliveryFee: number;
  total: number;
}

export type CheckoutErrors<T> = Partial<Record<keyof T, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateIdentification(data: CheckoutIdentification): CheckoutErrors<CheckoutIdentification> {
  const errors: CheckoutErrors<CheckoutIdentification> = {};
  if (data.nome.trim().length < 2) errors.nome = 'Informe seu nome';
  if (!EMAIL_PATTERN.test(data.email.trim())) errors.email = 'E-mail inválido';
  const phone = onlyDigits(data.telefone);
  if (phone.length !== 10 && phone.length !== 11) errors.telefone = 'Informe o DDD e o número';
  if (!isValidCpf(data.cpf)) errors.cpf = 'CPF inválido';
  return errors;
}

export function validateAddress(data: CheckoutAddress): CheckoutErrors<CheckoutAddress> {
  const errors: CheckoutErrors<CheckoutAddress> = {};
  if (onlyDigits(data.cep).length !== 8) errors.cep = 'CEP inválido';
  if (data.rua.trim().length < 2) errors.rua = 'Informe a rua';
  if (data.numero.trim().length < 1) errors.numero = 'Informe o número';
  if (data.bairro.trim().length < 2) errors.bairro = 'Informe o bairro';
  if (data.cidade.trim().length < 2) errors.cidade = 'Informe a cidade';
  if (!(BRAZIL_STATES as readonly string[]).includes(data.uf.trim().toUpperCase())) errors.uf = 'UF inválida';
  return errors;
}

export function formatCardNumber(value: string): string {
  return onlyDigits(value).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
}

export function formatCardExpiry(value: string): string {
  const digits = onlyDigits(value).slice(0, 4);
  return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** Validade "MM/AA" no formato do Mercado Pago (ano com 4 dígitos); nulo se inválida ou vencida. */
export function parseCardExpiry(value: string, today = new Date()): { month: string; year: string } | null {
  const match = /^(\d{2})\/(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  const currentYear = today.getFullYear();
  if (month < 1 || month > 12 || year < currentYear || (year === currentYear && month < today.getMonth() + 1)) {
    return null;
  }
  return { month: match[1]!, year: String(year) };
}

export function validateCard(data: CheckoutCard, today = new Date()): CheckoutErrors<CheckoutCard> {
  const errors: CheckoutErrors<CheckoutCard> = {};
  const digits = onlyDigits(data.numero);
  if (digits.length < 13 || digits.length > 19) errors.numero = 'Número do cartão inválido';
  if (data.nome.trim().length < 2) errors.nome = 'Informe o nome impresso no cartão';
  if (!parseCardExpiry(data.validade, today)) errors.validade = 'Validade inválida';
  const cvv = onlyDigits(data.cvv);
  if (cvv.length < 3 || cvv.length > 4) errors.cvv = 'CVV inválido';
  if (!isValidCpf(data.cpf)) errors.cpf = 'CPF do titular inválido';
  return errors;
}

export function hasErrors<T>(errors: CheckoutErrors<T>): boolean {
  return Object.keys(errors).length > 0;
}

/** Produtos pelo preço final mais a taxa da entrega escolhida (a retirada não cobra), como o servidor calcula. */
export function checkoutTotals(lines: CartLine[], deliveryFee: number): CheckoutTotals {
  const subtotal = cartTotal(lines);
  const fee = Math.max(0, deliveryFee);
  return {
    subtotal,
    savings: cartSavings(lines),
    deliveryFee: fee,
    total: Math.round((subtotal + fee) * 100) / 100,
  };
}

/** Tempo que falta para o Pix vencer, como "29:59"; zero quando já venceu. */
export function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
