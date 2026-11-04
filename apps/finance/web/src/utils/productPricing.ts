// Preço do produto do catálogo com desconto. É o mesmo cálculo do servidor
// (backend/src/services/productPricing.ts): mudar uma regra exige mudar a
// outra. A tela usa para a prévia do cadastro; o preço gravado já chega pronto
// em `valorFinal`.

export type ProductDiscountType = 'valor' | 'percentual';

export interface ProductDiscount {
  type: ProductDiscountType;
  value: number;
}

const MIN_FINAL_PRICE = 0.01;

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateFinalPrice(price: number, discount: ProductDiscount | null): number {
  if (discount === null) {
    return roundCents(price);
  }
  if (discount.type === 'percentual') {
    return roundCents(price * (1 - discount.value / 100));
  }
  return roundCents(price - discount.value);
}

/** Selo "-X%": inteiro; abaixo de 1% não há selo (o preço riscado continua). */
export function calculateDiscountPercent(price: number, discount: ProductDiscount | null): number | null {
  if (discount === null || price <= 0) {
    return null;
  }
  const percent = discount.type === 'percentual' ? discount.value : (discount.value / price) * 100;
  const rounded = Math.round(percent);
  return rounded >= 1 ? rounded : null;
}

/** Desconto como o produto chega da API (numeric vem como texto). */
export function productDiscountOf(product: { descontoTipo: ProductDiscountType | null; descontoValor: string | null }): ProductDiscount | null {
  if (product.descontoTipo === null || product.descontoValor === null) {
    return null;
  }
  return { type: product.descontoTipo, value: Number(product.descontoValor) };
}

/** Mensagem do campo de desconto no cadastro, ou null quando está tudo certo. Mesmas faixas do servidor. */
export function validateProductDiscount(price: number | undefined, discount: ProductDiscount | null): string | null {
  if (discount === null) {
    return null;
  }
  if (!Number.isFinite(discount.value) || discount.value <= 0) {
    return 'Informe o desconto';
  }
  if (discount.type === 'percentual' && discount.value >= 100) {
    return 'Use um desconto menor que 100%';
  }
  if (price === undefined || price <= 0) {
    return null;
  }
  if (discount.type === 'valor' && discount.value >= price) {
    return 'Use um desconto menor que o preço';
  }
  if (calculateFinalPrice(price, discount) < MIN_FINAL_PRICE) {
    return 'O preço com desconto precisa ser de pelo menos R$ 0,01';
  }
  return null;
}
