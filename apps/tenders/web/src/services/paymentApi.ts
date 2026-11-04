import { registerPaymentApi } from '@ui/payments/paymentApi';
import { apiJson } from './tendersApi';

// Os pagamentos do diálogo comum pedem ao servidor pelo cliente de API de Licitações
// (mesma URL, mesmo token e mesma saída no 401 do cliente de Finanças) e leem a chave
// pública do Mercado Pago na rota do próprio módulo.
// Importado pela entrada do app de Licitações.
registerPaymentApi({ request: apiJson, publicKeyEndpoint: '/tenders/billing/config' });
