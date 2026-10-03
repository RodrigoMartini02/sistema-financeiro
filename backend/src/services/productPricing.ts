// Preço do produto do catálogo com desconto. É o mesmo cálculo da tela
// (src/utils/productPricing.ts): mudar uma regra exige mudar a outra. Sem
// acesso ao banco, para poder ser testado isoladamente.
import { RequestInputError, roundCents } from '../utils/requestInput';

export const PRODUCT_DISCOUNT_TYPES = ['valor', 'percentual'] as const;
export type ProductDiscountType = (typeof PRODUCT_DISCOUNT_TYPES)[number];

export interface ProductDiscount {
  type: ProductDiscountType;
  value: number;
}

/** O desconto nunca deixa o produto de graça. */
const MIN_FINAL_PRICE = 0.01;

/** Preço final, arredondado em centavos: `valor − desconto` ou `valor × (1 − %/100)`. */
export function calculateFinalPrice(price: number, discount: ProductDiscount | null): number {
  if (discount === null) {
    return roundCents(price);
  }
  if (discount.type === 'percentual') {
    return roundCents(price * (1 - discount.value / 100));
  }
  return roundCents(price - discount.value);
}

/**
 * Percentual do selo "-X%": o próprio no desconto em %, calculado no desconto
 * em R$. Arredondado para inteiro; abaixo de 1% não há selo (o preço riscado
 * continua aparecendo).
 */
export function calculateDiscountPercent(price: number, discount: ProductDiscount | null): number | null {
  if (discount === null || price <= 0) {
    return null;
  }
  const percent = discount.type === 'percentual' ? discount.value : (discount.value / price) * 100;
  const rounded = Math.round(percent);
  return rounded >= 1 ? rounded : null;
}

/** Desconto como está gravado no produto (numeric volta como texto). */
export function storedProductDiscount(type: string | null, value: string | null): ProductDiscount | null {
  if (type === null || value === null || !PRODUCT_DISCOUNT_TYPES.includes(type as ProductDiscountType)) {
    return null;
  }
  return { type: type as ProductDiscountType, value: Number(value) };
}

/** Preço final e selo do produto gravado, para as respostas da API. */
export function buildProductPricing(product: { valor: string; descontoTipo: string | null; descontoValor: string | null }): {
  valorFinal: number;
  descontoPercentual: number | null;
} {
  const price = Number(product.valor);
  const discount = storedProductDiscount(product.descontoTipo, product.descontoValor);
  return {
    valorFinal: calculateFinalPrice(price, discount),
    descontoPercentual: calculateDiscountPercent(price, discount),
  };
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/**
 * Desconto do pedido: tipo e valor juntos, ou nenhum dos dois. Em % fica entre
 * 0 e 100 (exclusive); em R$, abaixo do preço; e o preço final é de pelo menos
 * R$ 0,01.
 */
export function readProductDiscount(typeValue: unknown, amountValue: unknown, price: number): ProductDiscount | null {
  if (isEmpty(typeValue) && isEmpty(amountValue)) {
    return null;
  }
  if (isEmpty(typeValue) || isEmpty(amountValue)) {
    throw new RequestInputError('Desconto: informe o tipo e o valor');
  }
  if (!PRODUCT_DISCOUNT_TYPES.includes(typeValue as ProductDiscountType)) {
    throw new RequestInputError('Tipo de desconto inválido');
  }
  if (typeof amountValue !== 'number' || !Number.isFinite(amountValue) || amountValue <= 0) {
    throw new RequestInputError('Desconto deve ser maior que zero');
  }

  const discount: ProductDiscount = { type: typeValue as ProductDiscountType, value: roundCents(amountValue) };
  if (discount.type === 'percentual' && discount.value >= 100) {
    throw new RequestInputError('Desconto em %: use um valor menor que 100');
  }
  if (discount.type === 'valor' && discount.value >= price) {
    throw new RequestInputError('Desconto em R$: use um valor menor que o preço do produto');
  }
  if (calculateFinalPrice(price, discount) < MIN_FINAL_PRICE) {
    throw new RequestInputError('O preço com desconto precisa ser de pelo menos R$ 0,01');
  }
  return discount;
}
