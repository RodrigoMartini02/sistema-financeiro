// Biblioteca JS do Mercado Pago (sdk.mercadopago.com/js/v2), carregada uma
// vez por página e usada pelos planos e pelo checkout da vitrine para
// transformar o cartão digitado num token — o número do cartão nunca passa
// pelo servidor do FINGERENCE.

export interface MercadoPagoCardTokenInput {
  cardNumber: string;
  cardholderName: string;
  cardExpirationMonth: string;
  cardExpirationYear: string;
  securityCode: string;
  identificationType?: string;
  identificationNumber?: string;
}

export interface MercadoPagoInstance {
  createCardToken(input: MercadoPagoCardTokenInput): Promise<{ id?: string }>;
  getPaymentMethods(input: { bin: string }): Promise<{ results?: Array<{ id?: string }> }>;
}

type MercadoPagoConstructor = new (publicKey: string, options?: { locale?: string }) => MercadoPagoInstance;

declare global {
  interface Window {
    MercadoPago?: MercadoPagoConstructor;
  }
}

const SCRIPT_ID = 'mp-sdk';
const SCRIPT_URL = 'https://sdk.mercadopago.com/js/v2';

let scriptPromise: Promise<void> | null = null;

/** Carrega o script uma vez só; chamadas seguintes reaproveitam o mesmo carregamento. */
export function loadMercadoPagoScript(): Promise<void> {
  if (window.MercadoPago) {
    return Promise.resolve();
  }
  if (scriptPromise) {
    return scriptPromise;
  }
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null ?? document.createElement('script');
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => {
      scriptPromise = null;
      reject(new Error('Não foi possível carregar o pagamento por cartão'));
    });
    if (!script.id) {
      script.id = SCRIPT_ID;
      script.src = SCRIPT_URL;
      document.head.appendChild(script);
    }
  });
  return scriptPromise;
}

/** Instância da biblioteca com a chave pública de quem recebe (o FINGERENCE nos planos, a loja na vitrine). */
export async function createMercadoPago(publicKey: string): Promise<MercadoPagoInstance> {
  await loadMercadoPagoScript();
  if (!window.MercadoPago) {
    throw new Error('Não foi possível carregar o pagamento por cartão');
  }
  return new window.MercadoPago(publicKey, { locale: 'pt-BR' });
}
