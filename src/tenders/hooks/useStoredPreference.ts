import { useCallback, useState } from 'react';

/**
 * Preferência de tela guardada no navegador (localStorage), como a tabela
 * compacta. Sem armazenamento (modo privado, bloqueio), vale só nesta visita.
 */
export function useStoredPreference<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return allowed.find((option) => option === stored) ?? fallback;
    } catch {
      return fallback;
    }
  });

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Sem armazenamento: a escolha vale até sair da tela.
      }
    },
    [key],
  );

  return [value, update];
}
