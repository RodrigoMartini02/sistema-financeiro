import { useMemo, useState } from 'react';
import {
  addToCart, cartItemCount, cartLines, cartSavings, cartTotal, parseStoredCart, reconcileCart, removeFromCart, setCartQuantity,
  type CartItem, type CartProduct,
} from '../../../utils/storefrontCart';

function storageKeyOf(storeId: string): string {
  return `fingerence:vitrine:${storeId}:sacola`;
}

/**
 * Sacola guardada no aparelho. Sem armazenamento (aba anônima ou bloqueio do
 * navegador) a leitura falha: a sacola vale só nesta visita, o que não
 * atrapalha a compra.
 */
function readStoredCart(storageKey: string | null): CartItem[] {
  if (!storageKey) {
    return [];
  }
  try {
    return parseStoredCart(localStorage.getItem(storageKey));
  } catch {
    return [];
  }
}

function writeStoredCart(storageKey: string, cart: CartItem[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(cart));
  } catch {
    // Sem armazenamento: a sacola continua na tela até a página fechar.
  }
}

/**
 * Sacola da vitrine, por loja, compartilhada pelas páginas da vitrine pelo
 * armazenamento do aparelho. A guardada é conferida com os produtos de agora
 * (sai o que sumiu ou esgotou) antes de qualquer conta.
 */
export function useStorefrontCart(storeId: string | undefined, products: CartProduct[]) {
  const storageKey = storeId ? storageKeyOf(storeId) : null;
  // Lida já no primeiro render: a sacola e o checkout não podem achar, nem por
  // um instante, que ela está vazia. A loja só é conhecida quando a vitrine
  // carrega; aí a guardada é lida de novo.
  const [stored, setStored] = useState(() => ({ key: storageKey, cart: readStoredCart(storageKey) }));
  const cart = stored.key === storageKey ? stored.cart : readStoredCart(storageKey);
  if (stored.key !== storageKey) {
    setStored({ key: storageKey, cart });
  }

  const items = useMemo(() => reconcileCart(cart, products), [cart, products]);
  const lines = useMemo(() => cartLines(items, products), [items, products]);

  // Grava na hora, não num efeito: depois do pagamento a sacola é limpa e a
  // página troca no mesmo clique, antes de qualquer efeito rodar.
  const update = (next: CartItem[]) => {
    if (!storageKey) return;
    writeStoredCart(storageKey, next);
    setStored({ key: storageKey, cart: next });
  };

  return {
    lines,
    count: cartItemCount(items),
    total: cartTotal(lines),
    savings: cartSavings(lines),
    add: (productId: string, quantity = 1) => update(addToCart(reconcileCart(cart, products), productId, quantity)),
    setQuantity: (productId: string, quantity: number) => update(setCartQuantity(reconcileCart(cart, products), productId, quantity)),
    remove: (productId: string) => update(removeFromCart(cart, productId)),
    clear: () => update([]),
  };
}
