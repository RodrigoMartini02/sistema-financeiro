// Sessão no navegador usada pelo app de Licitações. Cópia própria da de Finanças:
// as chaves são as mesmas, porque a sessão ainda vale entre os produtos na mesma
// origem. A separação das chaves por produto é da Etapa 3.

export function getToken(): string | null {
  return sessionStorage.getItem('token') ?? localStorage.getItem('token');
}

export function logout() {
  sessionStorage.removeItem('token');
  localStorage.removeItem('token');
  localStorage.removeItem('usuarioAtual');
  localStorage.removeItem('dadosUsuarioLogado');
  localStorage.removeItem('contaAtivaId');
  localStorage.removeItem('contaAtivaNome');
  localStorage.removeItem('contaAtivaTipo');
}
