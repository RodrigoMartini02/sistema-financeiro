import { RequestInputError } from '../utils/requestInput';

function baseUrl(raw: string | undefined): string {
  try {
    if (!raw?.trim()) throw new Error('missing URL');
    const url = new URL(raw.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('invalid URL');
    }
    return url.origin;
  } catch {
    throw new RequestInputError('A cobrança está indisponível: confira a configuração dos endereços da API e do site.', 503);
  }
}

export function readBillingUrls(env: NodeJS.ProcessEnv): { notificationUrl: string; returnUrl: string } {
  return {
    notificationUrl: `${baseUrl(env['BACKEND_URL'])}/api/tenders/billing/webhook`,
    returnUrl: `${baseUrl(env['FRONTEND_URL'] ?? 'https://fin-gerence.com.br')}/licitacoes/app/configuracoes`,
  };
}
