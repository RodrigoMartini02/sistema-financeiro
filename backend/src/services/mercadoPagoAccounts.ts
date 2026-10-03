// Conexão da conta Mercado Pago de cada loja (OAuth): as vendas da vitrine
// caem direto na conta da loja, nunca na do FINGERENCE. Os tokens ficam
// cifrados no banco e são renovados antes de vencer.
import { eq } from 'drizzle-orm';
import { MercadoPagoConfig, OAuth } from 'mercadopago';
import { db } from '../db/client';
import { getJwtSecret } from '../middleware/auth';
import { catalogoMercadoPagoContas, type CatalogoMercadoPagoConta } from '../modules/catalogo/db/schema';
import { resolveCompanyAccount } from '../utils/accountAccess';
import { RequestInputError } from '../utils/requestInput';
import { readConnectState, signConnectState } from './mercadoPagoState';
import { SecretKeyError, decryptSecret, encryptSecret, readSecretKey } from './tokenCrypto';

const AUTHORIZATION_URL = 'https://auth.mercadopago.com.br/authorization';
/** Renova o token quando faltam menos de 7 dias (ele vale cerca de 180). */
const REFRESH_MARGIN_MS = 7 * 24 * 60 * 60 * 1000;
const UNAVAILABLE_MESSAGE = 'O pagamento online ainda não está disponível. Fale com o suporte do FINGERENCE.';
const PERSONAL_ACCOUNT_MESSAGE = 'A vitrine só existe em conta de empresa';

interface OAuthSettings {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface OAuthTokens {
  access_token?: string;
  refresh_token?: string;
  public_key?: string;
  user_id?: number;
  expires_in?: number;
  live_mode?: boolean;
}

/** Cliente Mercado Pago da loja: o pagamento criado com ele cai na conta dela. */
export interface StoreMercadoPago {
  config: MercadoPagoConfig;
  publicKey: string;
  mpUserId: string;
}

export interface MercadoPagoConnectionStatus {
  /** O FINGERENCE tem o aplicativo Mercado Pago configurado (credenciais e chave de cifra). */
  disponivel: boolean;
  conectado: boolean;
  mpUserId: string | null;
  liveMode: boolean | null;
  conectadoEm: Date | null;
}

function backendUrl(): string {
  return process.env['BACKEND_URL'] ?? 'https://sistema-financeiro-backend-o199.onrender.com';
}

function oauthSettings(): OAuthSettings | null {
  const clientId = process.env['MP_CLIENT_ID'];
  const clientSecret = process.env['MP_CLIENT_SECRET'];
  if (!clientId || !clientSecret) {
    return null;
  }
  return { clientId, clientSecret, redirectUri: `${backendUrl()}/api/catalogo/mercado-pago/callback` };
}

function tokensKey(): Buffer {
  return readSecretKey(process.env['MP_TOKENS_KEY']);
}

/** A chave de cifra existe e é válida: sem ela não dá para guardar nem usar os tokens. */
export function hasTokensKey(): boolean {
  try {
    tokensKey();
    return true;
  } catch (error) {
    if (error instanceof SecretKeyError) {
      return false;
    }
    throw error;
  }
}

/**
 * As chamadas de OAuth vão autenticadas com o token do próprio aplicativo do
 * FINGERENCE (o mesmo dos planos); o corpo leva o client_secret.
 */
function oauthClient(settings: OAuthSettings): OAuth {
  return new OAuth(new MercadoPagoConfig({ accessToken: process.env['MP_ACCESS_TOKEN'] ?? settings.clientSecret }));
}

function requireTokens(tokens: OAuthTokens): Required<Pick<OAuthTokens, 'access_token' | 'refresh_token' | 'public_key' | 'user_id' | 'expires_in'>> & { live_mode: boolean } {
  if (!tokens.access_token || !tokens.refresh_token || !tokens.public_key || !tokens.user_id || !tokens.expires_in) {
    throw new Error('Mercado Pago OAuth response is missing tokens');
  }
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    public_key: tokens.public_key,
    user_id: tokens.user_id,
    expires_in: tokens.expires_in,
    live_mode: tokens.live_mode ?? true,
  };
}

/** Endereço da autorização no Mercado Pago, com o "state" da conta e do usuário. */
export function buildConnectUrl(accountId: number, userId: number): string {
  const settings = oauthSettings();
  if (!settings || !hasTokensKey()) {
    throw new RequestInputError(UNAVAILABLE_MESSAGE, 503);
  }
  const params = new URLSearchParams({
    client_id: settings.clientId,
    response_type: 'code',
    platform_id: 'mp',
    state: signConnectState({ accountId, userId }, getJwtSecret()),
    redirect_uri: settings.redirectUri,
  });
  return `${AUTHORIZATION_URL}?${params.toString()}`;
}

/**
 * Volta da autorização: confere o "state", confere de novo que a conta é PJ e
 * de quem iniciou, troca o código pelos tokens e guarda cifrado (substitui a
 * conexão anterior da conta, se houver).
 */
export async function completeConnection(code: string, stateToken: string): Promise<{ accountId: number }> {
  const state = readConnectState(stateToken, getJwtSecret());
  const account = await resolveCompanyAccount(state.userId, state.accountId, PERSONAL_ACCOUNT_MESSAGE);
  const settings = oauthSettings();
  if (!settings) {
    throw new RequestInputError(UNAVAILABLE_MESSAGE, 503);
  }
  const key = tokensKey();

  const tokens = requireTokens(await oauthClient(settings).create({
    body: { client_id: settings.clientId, client_secret: settings.clientSecret, code, redirect_uri: settings.redirectUri },
  }) as OAuthTokens);

  const values = {
    contaId: account.id,
    usuarioId: account.ownerId,
    mpUserId: String(tokens.user_id),
    publicKey: tokens.public_key,
    accessTokenCifrado: encryptSecret(tokens.access_token, key),
    refreshTokenCifrado: encryptSecret(tokens.refresh_token, key),
    expiraEm: new Date(Date.now() + tokens.expires_in * 1000),
    liveMode: tokens.live_mode,
  };
  await db
    .insert(catalogoMercadoPagoContas)
    .values(values)
    .onConflictDoUpdate({
      target: catalogoMercadoPagoContas.contaId,
      set: { ...values, conectadoEm: new Date(), atualizadoEm: new Date() },
    });
  return { accountId: account.id };
}

/** Renova os tokens; se a renovação falhar, segue com o atual enquanto ele valer. */
async function refreshTokens(row: CatalogoMercadoPagoConta, key: Buffer, currentToken: string): Promise<string | null> {
  const settings = oauthSettings();
  const stillValid = row.expiraEm.getTime() > Date.now();
  if (!settings) {
    return stillValid ? currentToken : null;
  }
  try {
    const tokens = requireTokens(await oauthClient(settings).refresh({
      body: { client_id: settings.clientId, client_secret: settings.clientSecret, refresh_token: decryptSecret(row.refreshTokenCifrado, key) },
    }) as OAuthTokens);
    await db
      .update(catalogoMercadoPagoContas)
      .set({
        accessTokenCifrado: encryptSecret(tokens.access_token, key),
        refreshTokenCifrado: encryptSecret(tokens.refresh_token, key),
        publicKey: tokens.public_key,
        expiraEm: new Date(Date.now() + tokens.expires_in * 1000),
        atualizadoEm: new Date(),
      })
      .where(eq(catalogoMercadoPagoContas.id, row.id));
    return tokens.access_token;
  } catch (error) {
    console.error('Mercado Pago token refresh error:', { accountId: row.contaId, error });
    return stillValid ? currentToken : null;
  }
}

/**
 * Cliente Mercado Pago da loja, ou null quando ela não está conectada (ou o
 * token venceu sem conseguir renovar): aí a vitrine volta para o WhatsApp.
 */
export async function getStoreMercadoPago(accountId: number): Promise<StoreMercadoPago | null> {
  if (!hasTokensKey()) {
    return null;
  }
  const [row] = await db.select().from(catalogoMercadoPagoContas).where(eq(catalogoMercadoPagoContas.contaId, accountId)).limit(1);
  if (!row) {
    return null;
  }
  const key = tokensKey();
  let accessToken: string | null = decryptSecret(row.accessTokenCifrado, key);
  if (row.expiraEm.getTime() - Date.now() < REFRESH_MARGIN_MS) {
    accessToken = await refreshTokens(row, key, accessToken);
  }
  if (!accessToken) {
    return null;
  }
  return { config: new MercadoPagoConfig({ accessToken }), publicKey: row.publicKey, mpUserId: row.mpUserId };
}

/** Chave pública da loja (vai para o formulário de cartão), sem decifrar nada. */
export async function getStorePublicKey(accountId: number): Promise<string | null> {
  if (!hasTokensKey()) {
    return null;
  }
  const [row] = await db
    .select({ publicKey: catalogoMercadoPagoContas.publicKey, expiraEm: catalogoMercadoPagoContas.expiraEm })
    .from(catalogoMercadoPagoContas)
    .where(eq(catalogoMercadoPagoContas.contaId, accountId))
    .limit(1);
  return row && row.expiraEm.getTime() > Date.now() ? row.publicKey : null;
}

export async function getConnectionStatus(accountId: number): Promise<MercadoPagoConnectionStatus> {
  const [row] = await db
    .select({
      mpUserId: catalogoMercadoPagoContas.mpUserId,
      liveMode: catalogoMercadoPagoContas.liveMode,
      conectadoEm: catalogoMercadoPagoContas.conectadoEm,
    })
    .from(catalogoMercadoPagoContas)
    .where(eq(catalogoMercadoPagoContas.contaId, accountId))
    .limit(1);
  return {
    disponivel: oauthSettings() !== null && hasTokensKey(),
    conectado: row !== undefined,
    mpUserId: row?.mpUserId ?? null,
    liveMode: row?.liveMode ?? null,
    conectadoEm: row?.conectadoEm ?? null,
  };
}

export async function disconnectMercadoPago(accountId: number): Promise<void> {
  await db.delete(catalogoMercadoPagoContas).where(eq(catalogoMercadoPagoContas.contaId, accountId));
}
