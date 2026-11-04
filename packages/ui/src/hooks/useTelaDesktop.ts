import { useSyncExternalStore } from 'react';

// Mesmo ponto `md` do Tailwind em que as tabelas trocam os cartões pela tabela.
const CONSULTA_DESKTOP = '(min-width: 768px)';

function assinar(avisar: () => void) {
  const consulta = window.matchMedia(CONSULTA_DESKTOP);
  consulta.addEventListener('change', avisar);
  return () => consulta.removeEventListener('change', avisar);
}

/** true em telas a partir de 768px; acompanha o redimensionamento da janela. */
export function useTelaDesktop(): boolean {
  return useSyncExternalStore(assinar, () => window.matchMedia(CONSULTA_DESKTOP).matches, () => false);
}
