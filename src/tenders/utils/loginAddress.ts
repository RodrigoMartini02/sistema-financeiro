// Parâmetro que o site entende para abrir o login de uma solução (`?entrar=1`).
// Finanças tem a mesma constante: o valor é um contrato entre o site e os produtos.
const LOGIN_REQUEST_PARAM = 'entrar';

/** Entrada de Licitações sem sessão, com a sessão vencida ou ao sair: a página de Licitações com o login aberto. */
export const TENDERS_LOGIN_ADDRESS = `/licitacoes/?${LOGIN_REQUEST_PARAM}=1`;
