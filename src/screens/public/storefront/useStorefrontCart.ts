import { useEffect, useMemo, useState } from 'react';
import {
  addToCart, cartItemCount, cartLines, cartTotal, parseStoredCart, reconcileCart, removeFromCart, setCartQuantity,
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
function readStoredCart(storageKey: string): CartItem[] {
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
 * Sacola da vitrine, por loja. A guardada é conferida com os produtos de agora
 * (sai o que sumiu ou esgotou) antes de qualquer conta.
 */
export function useStorefrontCart(storeId: string | undefined, products: CartProduct[]) {
  const storageKey = storeId ? storageKeyOf(storeId) : null;
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!storageKey) return;
    setCart(readStoredCart(storageKey));
    setLoadedKey(storageKey);
  }, [storageKey]);

  // Só grava depois de ler: senão a sacola vazia do primeiro render apagaria a guardada.
  useEffect(() => {
    if (!storageKey || loadedKey !== storageKey) return;
    writeStoredCart(storageKey, cart);
  }, [storageKey, loadedKey, cart]);

  const items = useMemo(() => reconcileCart(cart, products), [cart, products]);
  const lines = useMemo(() => cartLines(items, products), [items, products]);

  return {
    lines,
    count: cartItemCount(items),
    total: cartTotal(lines),
    add: (productId: string, quantity = 1) => setCart((current) => addToCart(reconcileCart(current, products), productId, quantity)),
    setQuantity: (productId: string, quantity: number) => setCart((current) => setCartQuantity(reconcileCart(current, products), productId, quantity)),
    remove: (productId: string) => setCart((current) => removeFromCart(current, productId)),
    clear: () => setCart([]),
  };
}
