export interface AuthUser {
  id: number;
  nome: string;
  sobrenome?: string | null;
  email: string;
  documento?: string;
  tipo?: string;
  /** Papel dentro da conta vinculada: 'member' (familia) ou 'collaborator'
   *  (empresa). null quando o usuario e titular/independente. */
  role?: 'member' | 'collaborator' | null;
  foto?: string | null;
}
