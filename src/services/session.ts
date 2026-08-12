import { clearFirstAccessGuidesSession } from './firstAccessGuides';

export function getToken(): string | null {
  return sessionStorage.getItem('token') ?? localStorage.getItem('token');
}

export function logout() {
  clearFirstAccessGuidesSession();
  sessionStorage.removeItem('token');
  localStorage.removeItem('token');
  localStorage.removeItem('usuarioAtual');
  localStorage.removeItem('dadosUsuarioLogado');
  localStorage.removeItem('perfilAtivoId');
  localStorage.removeItem('perfilAtivoNome');
  localStorage.removeItem('perfilAtivoTipo');
}
