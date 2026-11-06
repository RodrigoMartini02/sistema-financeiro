import type { StoredSessionUser } from '@ui/auth/session';
import type { SiteSolution } from '../brand';

interface SessionPayload {
  token: string;
  usuario: StoredSessionUser;
}

interface AuthEnvelope<T> {
  success?: boolean;
  message?: string;
  data?: T;
}

export interface PersonalRegistrationInput {
  nome: string;
  sobrenome?: string;
  documento: string;
  email: string;
  senha: string;
  telefone?: string;
  dataNascimento?: string;
}

export interface CompanyRegistrationInput {
  documento: string;
  razaoSocial: string;
  nomeFantasia?: string;
  enquadramento?: string;
  dataAbertura?: string;
  email: string;
  senha: string;
}

function authApiBase(): string {
  const { hostname, port } = window.location;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return 'https://sistema-financeiro-backend-o199.onrender.com/api';
  }
  return port === '5173' ? '/api' : 'http://localhost:3010/api';
}

/** Login e recuperação são públicos: não enviam token nem alteram outra sessão ao receber 401. */
async function postAuth<T>(solution: SiteSolution, action: string, body: object): Promise<T> {
  const prefix = solution === 'tenders' ? '/tenders/auth' : '/auth';
  const response = await fetch(`${authApiBase()}${prefix}/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let payload: AuthEnvelope<T>;
  try {
    payload = await response.json() as AuthEnvelope<T>;
  } catch {
    throw new Error('Não foi possível ler a resposta do servidor. Tente de novo em instantes.');
  }
  if (!response.ok || payload.success === false) {
    throw new Error(payload.message ?? 'Não foi possível concluir a requisição');
  }
  return (payload.data ?? payload) as T;
}

/** Cada formulário usa o mesmo contrato visual com as rotas da sua solução. */
export function createAuthAdapter(solution: SiteSolution) {
  return {
    login: (document: string, password: string) => postAuth<SessionPayload>(solution, 'login', { documento: document, senha: password }),
    registerPersonal: (input: PersonalRegistrationInput) => {
      if (solution === 'tenders') {
        return Promise.reject<SessionPayload>(new Error('O cadastro de Licitações é feito com CNPJ.'));
      }
      return postAuth<SessionPayload>(solution, 'register', {
        nome: input.nome,
        sobrenome: input.sobrenome || undefined,
        documento: input.documento,
        email: input.email,
        senha: input.senha,
        telefone: input.telefone || undefined,
        data_nascimento: input.dataNascimento || undefined,
      });
    },
    registerCompany: (input: CompanyRegistrationInput) => postAuth<SessionPayload>(solution, 'register', {
      documento: input.documento,
      razao_social: input.razaoSocial,
      nome_fantasia: input.nomeFantasia || undefined,
      enquadramento: input.enquadramento || undefined,
      data_abertura: input.dataAbertura || undefined,
      email: input.email,
      senha: input.senha,
    }),
    googleLogin: (code: string, redirectUri: string) => postAuth<SessionPayload>(solution, 'google', { code, redirect_uri: redirectUri }),
    forgotPassword: (email: string) => postAuth<{ success: boolean; message: string }>(solution, 'forgot-password', { email }),
    verifyRecoveryCode: (email: string, code: string) => postAuth<{ success: boolean }>(solution, 'verify-recovery-code', { email, codigo: code }),
    resetPassword: (email: string, code: string, password: string) => postAuth<{ success: boolean }>(solution, 'reset-password', {
      email,
      codigo: code,
      nova_senha: password,
    }),
  };
}
