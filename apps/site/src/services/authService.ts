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

export function resolveAuthApiBase(solution: SiteSolution, { hostname, port }: Pick<Location, 'hostname' | 'port'>, configuredBase?: string): string {
  const base = configuredBase?.trim().replace(/\/+$/, '');
  if (base) return base;
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return solution === 'tenders'
      ? 'https://fingerence-licitacoes-api.onrender.com/api'
      : 'https://sistema-financeiro-backend-o199.onrender.com/api';
  }
  return port === '5173' ? '/api' : `http://localhost:${solution === 'tenders' ? 3011 : 3010}/api`;
}

function authApiBase(solution: SiteSolution, configuredBase?: string): string {
  return resolveAuthApiBase(solution, window.location, configuredBase ?? (solution === 'tenders'
    ? import.meta.env?.VITE_TENDERS_API_URL
    : import.meta.env?.VITE_FINANCE_API_URL));
}

/** Login e recuperação são públicos: não enviam token nem alteram outra sessão ao receber 401. */
async function postAuth<T>(solution: SiteSolution, action: string, body: object, configuredBase?: string): Promise<T> {
  const prefix = solution === 'tenders' ? '/tenders/auth' : '/auth';
  const response = await fetch(`${authApiBase(solution, configuredBase)}${prefix}/${action}`, {
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
export function createAuthAdapter(solution: SiteSolution, configuredBase?: string) {
  const post = <T>(action: string, body: object) => postAuth<T>(solution, action, body, configuredBase);
  return {
    login: (document: string, password: string) => post<SessionPayload>('login', { documento: document, senha: password }),
    registerPersonal: (input: PersonalRegistrationInput) => {
      if (solution === 'tenders') {
        return Promise.reject<SessionPayload>(new Error('O cadastro de Licitações é feito com CNPJ.'));
      }
      return post<SessionPayload>('register', {
        nome: input.nome,
        sobrenome: input.sobrenome || undefined,
        documento: input.documento,
        email: input.email,
        senha: input.senha,
        telefone: input.telefone || undefined,
        data_nascimento: input.dataNascimento || undefined,
      });
    },
    registerCompany: (input: CompanyRegistrationInput) => post<SessionPayload>('register', {
      documento: input.documento,
      razao_social: input.razaoSocial,
      nome_fantasia: input.nomeFantasia || undefined,
      enquadramento: input.enquadramento || undefined,
      data_abertura: input.dataAbertura || undefined,
      email: input.email,
      senha: input.senha,
    }),
    googleLogin: (code: string, redirectUri: string) => post<SessionPayload>('google', { code, redirect_uri: redirectUri }),
    forgotPassword: (email: string) => post<{ success: boolean; message: string }>('forgot-password', { email }),
    verifyRecoveryCode: (email: string, code: string) => post<{ success: boolean }>('verify-recovery-code', { email, codigo: code }),
    resetPassword: (email: string, code: string, password: string) => post<{ success: boolean }>('reset-password', {
      email,
      codigo: code,
      nova_senha: password,
    }),
  };
}
