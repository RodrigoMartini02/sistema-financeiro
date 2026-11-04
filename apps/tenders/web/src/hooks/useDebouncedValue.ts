import { useEffect, useState } from 'react';

/** Valor que só muda depois de `delayMs` sem mudanças. Use com texto ou número (comparados por valor). */
export function useDebouncedValue<T extends string | number | null>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
