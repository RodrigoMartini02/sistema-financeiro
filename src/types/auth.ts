export interface AuthUser {
  id: number;
  nome: string;
  sobrenome?: string | null;
  email: string;
  documento?: string;
  tipo?: string;
  foto?: string | null;
}
