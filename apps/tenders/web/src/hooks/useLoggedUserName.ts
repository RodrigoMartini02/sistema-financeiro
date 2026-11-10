import { useSyncExternalStore } from 'react';
import { readLoggedUserName, subscribeToLoggedUser } from '../utils/loggedUser';

/** Nome do usuário logado, que acompanha a edição do perfil nas Configurações. */
export function useLoggedUserName(): string {
  return useSyncExternalStore(subscribeToLoggedUser, readLoggedUserName, readLoggedUserName);
}
