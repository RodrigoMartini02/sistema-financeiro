// Entrar com o Google em Licitações: troca o código de autorização pelo perfil (e-mail) da conta Google. Só entra
// quem já tem acesso: o cadastro é sempre pelo formulário da empresa (CNPJ), que o Google não conhece.
import { RequestInputError } from '../utils/requestInput';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v2/userinfo';

export interface GoogleProfile {
  /** Em minúsculas, como o e-mail é guardado no cadastro. */
  email: string;
  googleId: string | null;
}

export type GoogleProfileReader = (code: string, redirectUri: string) => Promise<GoogleProfile>;

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
}

interface GoogleUserInfo {
  email?: string;
  id?: string;
  verified_email?: boolean;
}

/** Credenciais do app no Google (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET), as mesmas de Finanças. */
export function createGoogleProfileReader(env: NodeJS.ProcessEnv, fetchImpl: typeof fetch = fetch): GoogleProfileReader {
  return async (code, redirectUri) => {
    const tokenResponse = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env['GOOGLE_CLIENT_ID'] ?? '',
        client_secret: env['GOOGLE_CLIENT_SECRET'] ?? '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;
    if (tokenData.error || !tokenData.access_token) {
      // A resposta remota pode repetir o código ou dados do pedido. O cliente
      // recebe só a mensagem fixa; o corpo externo não entra em erro nem log.
      throw new RequestInputError('Não foi possível autenticar com o Google. Tente entrar de novo.');
    }

    const userInfoResponse = await fetchImpl(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const googleUser = (await userInfoResponse.json()) as GoogleUserInfo;
    if (!googleUser.email) {
      throw new RequestInputError('Não foi possível obter o e-mail da conta Google.');
    }
    // E-mail que o Google não confirmou não prova que a pessoa é dona dele.
    if (googleUser.verified_email === false) {
      throw new RequestInputError('O Google ainda não confirmou o e-mail desta conta. Confirme-o e tente de novo.');
    }

    return { email: googleUser.email.toLowerCase(), googleId: googleUser.id ?? null };
  };
}
