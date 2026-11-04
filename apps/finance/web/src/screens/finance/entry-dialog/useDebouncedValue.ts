import { useEffect, useState } from 'react';

/** Espera enquanto a pessoa digita antes de consultar o servidor. */
export const TYPING_DELAY_MS = 220;

/** O valor só muda depois de uma pausa na digitação. Texto, para comparar por valor e não por objeto. */
export function useDebouncedValue<T extends string>(value: T): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), TYPING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}
