export function getToken(): string | null {
  return sessionStorage.getItem('token') ?? localStorage.getItem('token');
}

export function logout() {
  sessionStorage.removeItem('token');
  localStorage.removeItem('token');
  localStorage.removeItem('usuarioAtual');
  localStorage.removeItem('dadosUsuarioLogado');
  localStorage.removeItem('perfilAtivoId');
  localStorage.removeItem('perfilAtivoNome');
  localStorage.removeItem('perfilAtivoTipo');
}
