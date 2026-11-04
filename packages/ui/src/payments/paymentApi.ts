// Pedido ao servidor dos pagamentos (Pix e cartão). O diálogo de pagamento é comum a
// Finanças e a Licitações, mas cada produto fala com o seu cliente de API: quem monta
// o app registra a função de pedido no início, antes de qualquer tela abrir.

export type PaymentRequest = <T>(endpoint: string, init?: RequestInit) => Promise<T>;

let registeredRequest: PaymentRequest | null = null;

export function registerPaymentApi(request: PaymentRequest): void {
  registeredRequest = request;
}

/** Pedido ao servidor pela função que o app registrou; sem registro, falha com um erro claro. */
export async function paymentRequest<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
  if (!registeredRequest) {
    throw new Error('A API de pagamentos não foi registrada: chame registerPaymentApi no início do app.');
  }
  return registeredRequest<T>(endpoint, init);
}
