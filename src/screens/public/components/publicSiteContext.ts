import { createContext, useContext } from 'react';
import type { SiteSolution } from '../../../brand';

/** Ações de "Entrar" e "Começar grátis", da moldura do site (PublicLayout). */
export interface PublicSiteActions {
  /** Finanças abre o login; Licitações abre o sistema, que tem o próprio login. */
  enter: (solution: SiteSolution) => void;
  /** Cadastro já naquela solução (em Licitações, com o teste dela). */
  startFree: (solution: SiteSolution) => void;
}

export const PublicSiteContext = createContext<PublicSiteActions | null>(null);

export function usePublicSite(): PublicSiteActions {
  const actions = useContext(PublicSiteContext);
  if (!actions) {
    throw new Error('usePublicSite precisa estar dentro do PublicLayout');
  }
  return actions;
}
