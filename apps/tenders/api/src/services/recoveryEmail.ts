// Envio do código de recuperação de senha por e-mail (EmailJS). Mesma conta de e-mail e mesmo modelo de Finanças
// (EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_USER_ID), com o nome do produto nos parâmetros do modelo.
import { RECOVERY_CODE_VALIDITY_MINUTES } from './authMessages';

const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';
const PRODUCT_NAME = 'FINGERENCE Licitações';
const DEFAULT_ORIGIN = 'https://fin-gerence.com.br';

export interface RecoveryEmail {
  to: string;
  name: string;
  code: string;
}

export type RecoveryEmailSender = (message: RecoveryEmail) => Promise<void>;

/** Sem as três variáveis do EmailJS, o envio falha com erro (a rota responde 502, sem expor o motivo). */
export function createRecoveryEmailSender(env: NodeJS.ProcessEnv, fetchImpl: typeof fetch = fetch): RecoveryEmailSender {
  return async ({ to, name, code }) => {
    const serviceId = env['EMAILJS_SERVICE_ID'];
    const templateId = env['EMAILJS_TEMPLATE_ID'];
    const userId = env['EMAILJS_USER_ID'];
    if (!serviceId || !templateId || !userId) {
      throw new Error('Email service not configured');
    }

    const response = await fetchImpl(EMAILJS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: env['FRONTEND_URL'] ?? DEFAULT_ORIGIN,
      },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: userId,
        template_params: {
          to_email: to,
          to_name: name,
          codigo_recuperacao: code,
          validade: `${RECOVERY_CODE_VALIDITY_MINUTES} minutos`,
          sistema_nome: PRODUCT_NAME,
          assunto: `[${PRODUCT_NAME}] Código de Recuperação de Senha`,
        },
      }),
    });

    if (!response.ok) {
      // A resposta externa pode repetir dados do pedido (código ou credenciais).
      // O erro vai ao log da rota: guardar só o provedor e o status HTTP.
      throw new Error(`EmailJS request failed (HTTP ${response.status})`);
    }
  };
}
