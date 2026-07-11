import { apiRequest } from './apiClient';
import type { AuthUser } from '../types/auth';

interface LoginPayload {
  token: string;
  usuario: AuthUser;
}

interface VerifySessionPayload {
  usuario: AuthUser;
}

export async function login(documento: string, senha: string): Promise<LoginPayload> {
  return apiRequest<LoginPayload>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ documento, senha }),
  });
}

export async function verifySession(): Promise<AuthUser> {
  const payload = await apiRequest<VerifySessionPayload>('/auth/verify');
  return payload.usuario;
}

export async function register(nome: string, documento: string, email: string, senha: string): Promise<LoginPayload> {
  return apiRequest<LoginPayload>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ nome, documento, email, senha }),
  });
}

export async function googleLogin(code: string, redirectUri: string): Promise<LoginPayload> {
  return apiRequest<LoginPayload>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });
}

export function buildGoogleOAuthUrl(redirectUri: string): string {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function getGoogleRedirectUri(): string {
  return `${window.location.origin}/index.html`;
}

export async function forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
  return apiRequest('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
}

export async function verifyRecoveryCode(email: string, codigo: string): Promise<{ success: boolean }> {
  return apiRequest('/auth/verify-recovery-code', { method: 'POST', body: JSON.stringify({ email, codigo }) });
}

export async function resetPassword(email: string, codigo: string, novaSenha: string): Promise<{ success: boolean }> {
  return apiRequest('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, codigo, nova_senha: novaSenha }) });
}


