// Pedido ao servidor dos pagamentos (Pix e cartão). O diálogo de pagamento é comum a
// Finanças e a Licitações, mas cada produto fala com o seu cliente de API e com a sua
// rota da chave pública do Mercado Pago: quem monta o app registra os dois no início,
// antes de qualquer tela abrir.

export type PaymentRequest = <T>(endpoint: string, init?: RequestInit) => Promise<T>;

export interface PaymentApi {
  request: PaymentRequest;
  /** Rota que devolve `{ public_key }` do Mercado Pago (Finanças: /planos/config; Licitações: /tenders/billing/config). */
  publicKeyEndpoint: string;
}

let registered: PaymentApi | null = null;

export function registerPaymentApi(api: PaymentApi): void {
  registered = api;
}

function registeredApi(): PaymentApi {
  if (!registered) {
    throw new Error('A API de pagamentos não foi registrada: chame registerPaymentApi no início do app.');
  }
  return registered;
}

/** Pedido ao servidor pela função que o app registrou; sem registro, falha com um erro claro. */
export async function paymentRequest<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
  return registeredApi().request<T>(endpoint, init);
}

/** Rota da chave pública do Mercado Pago do produto que registrou a API; sem registro, falha com um erro claro. */
export function paymentPublicKeyEndpoint(): string {
  return registeredApi().publicKeyEndpoint;
}
