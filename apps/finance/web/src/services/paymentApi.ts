import { registerPaymentApi } from '@ui/payments/paymentApi';
import { apiRequest } from './apiClient';

// Os pagamentos do diálogo comum pedem ao servidor pelo cliente de API de Finanças e leem a
// chave pública do Mercado Pago na rota de Finanças.
// Importado pelas entradas do app, do assistente e da demonstração.
registerPaymentApi({ request: apiRequest, publicKeyEndpoint: '/planos/config' });
