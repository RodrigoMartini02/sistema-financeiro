// Sacola da vitrine pública: itens guardados no aparelho, total e a mensagem
// do pedido que vai para o WhatsApp da loja. Sem React nem rede, para poder
// ser testado isoladamente. O preço vale pelo que a vitrine mostra agora; a
// confirmação final é do vendedor, na conversa.

export const MAX_ITEM_QUANTITY = 99;
export const MAX_CUSTOMER_NAME_LENGTH = 80;
export const MAX_ORDER_NOTE_LENGTH = 300;

export interface CartItem {
  productId: string;
  quantity: number;
}

/** O que a sacola precisa saber do produto da vitrine. */
export interface CartProduct {
  id: string;
  nome: string;
  valorFinal: number;
  esgotado: boolean;
}

export interface CartLine {
  product: CartProduct;
  quantity: number;
  subtotal: number;
}

const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBrl(value: number): string {
  return brlFormatter.format(value);
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function clampQuantity(quantity: number): number {
  return Math.min(MAX_ITEM_QUANTITY, Math.max(1, Math.floor(quantity)));
}

export function addToCart(cart: CartItem[], productId: string, quantity = 1): CartItem[] {
  if (cart.some((item) => item.productId === productId)) {
    return cart.map((item) => (
      item.productId === productId ? { ...item, quantity: clampQuantity(item.quantity + quantity) } : item
    ));
  }
  return [...cart, { productId, quantity: clampQuantity(quantity) }];
}

export function removeFromCart(cart: CartItem[], productId: string): CartItem[] {
  return cart.filter((item) => item.productId !== productId);
}

/** Zero ou menos tira o item; acima do limite fica no limite. */
export function setCartQuantity(cart: CartItem[], productId: string, quantity: number): CartItem[] {
  if (quantity <= 0) {
    return removeFromCart(cart, productId);
  }
  return cart.map((item) => (item.productId === productId ? { ...item, quantity: clampQuantity(quantity) } : item));
}

/**
 * Sacola guardada conferida com os produtos de agora: sai o que sumiu da
 * vitrine (desativado ou apagado) ou esgotou, e itens repetidos se juntam.
 */
export function reconcileCart(cart: CartItem[], products: CartProduct[]): CartItem[] {
  const available = new Set(products.filter((product) => !product.esgotado).map((product) => product.id));
  const quantities = new Map<string, number>();
  for (const item of cart) {
    if (!available.has(item.productId) || !Number.isFinite(item.quantity) || item.quantity <= 0) {
      continue;
    }
    quantities.set(item.productId, clampQuantity((quantities.get(item.productId) ?? 0) + item.quantity));
  }
  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
}

/** Itens com o produto e o subtotal pelo preço final de agora. */
export function cartLines(cart: CartItem[], products: CartProduct[]): CartLine[] {
  const byId = new Map(products.map((product) => [product.id, product]));
  return cart.flatMap((item) => {
    const product = byId.get(item.productId);
    if (!product) {
      return [];
    }
    return [{ product, quantity: item.quantity, subtotal: roundCents(product.valorFinal * item.quantity) }];
  });
}

export function cartTotal(lines: CartLine[]): number {
  return roundCents(lines.reduce((sum, line) => sum + line.subtotal, 0));
}

export function cartItemCount(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}

/** Sacola guardada no aparelho (JSON); qualquer coisa fora do formato vira sacola vazia. */
export function parseStoredCart(raw: string | null): CartItem[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.flatMap((entry: unknown) => {
      if (typeof entry !== 'object' || entry === null) {
        return [];
      }
      const { productId, quantity } = entry as { productId?: unknown; quantity?: unknown };
      return typeof productId === 'string' && typeof quantity === 'number' ? [{ productId, quantity }] : [];
    });
  } catch {
    return [];
  }
}

export interface OrderMessageInput {
  storeName: string;
  lines: CartLine[];
  total: number;
  customerName: string;
  note: string | null;
}

/** Texto do pedido como chega no WhatsApp da loja. */
export function buildOrderMessage(input: OrderMessageInput): string {
  const note = input.note?.trim();
  return [
    `Olá, ${input.storeName}! Quero fazer este pedido pela vitrine:`,
    '',
    ...input.lines.map((line) => `${line.quantity}x ${line.product.nome} — ${formatBrl(line.subtotal)}`),
    '',
    `Total: ${formatBrl(input.total)}`,
    `Nome: ${input.customerName.trim()}`,
    ...(note ? [`Observação: ${note}`] : []),
  ].join('\n');
}

/** Link do WhatsApp da loja; com mensagem, ela já vem escrita na conversa. */
export function buildWhatsappUrl(whatsapp: string, message?: string): string {
  const digits = whatsapp.replace(/\D/g, '');
  return message ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : `https://wa.me/${digits}`;
}
