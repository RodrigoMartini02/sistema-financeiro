// Leitura e validação do pedido feito na vitrine pública (POST
// /catalogo/public/:vitrine/pedidos) e da troca de situação pela loja. Sem
// acesso ao banco: o navegador manda só produto e quantidade — preço, estoque
// e taxa vêm do banco na criação do pedido.
import { isValidCpf } from '../middleware/validation';
import {
  BRAZIL_STATES, EMAIL_PATTERN, RequestInputError, digitsOf, readOptionalText, readRecord, readRequiredText,
} from '../utils/requestInput';
import { isUuid } from './catalogo';
import {
  DELIVERY_TYPES, ORDER_PAYMENT_METHODS, ORDER_STATUSES,
  type DeliveryType, type OrderPaymentMethod, type OrderStatus,
} from './orderPricing';

export const MAX_ORDER_ITEMS = 30;
export const MAX_ORDER_ITEM_QUANTITY = 99;
const MAX_CUSTOMER_NAME = 80;
const MAX_EMAIL = 150;
const MAX_NOTE = 300;

export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export interface OrderAddressInput {
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  state: string;
}

export interface OrderInput {
  items: OrderItemInput[];
  customer: { name: string; email: string; phone: string; cpf: string };
  delivery: { type: DeliveryType; address: OrderAddressInput | null };
  payment: { method: OrderPaymentMethod; cardToken: string | null; paymentMethodId: string | null };
  note: string | null;
}

/** Itens repetidos se juntam: o mesmo produto duas vezes vira uma linha só. */
function readItems(value: unknown): OrderItemInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new RequestInputError('A sacola está vazia');
  }
  const quantities = new Map<string, number>();
  for (const entry of value) {
    const record = readRecord(entry, 'Item inválido');
    const productId = record['produto_id'];
    const quantity = record['quantidade'];
    if (typeof productId !== 'string' || !isUuid(productId)) {
      throw new RequestInputError('Item inválido');
    }
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ORDER_ITEM_QUANTITY) {
      throw new RequestInputError(`Quantidade inválida: de 1 a ${MAX_ORDER_ITEM_QUANTITY} por produto`);
    }
    const total = (quantities.get(productId.toLowerCase()) ?? 0) + quantity;
    if (total > MAX_ORDER_ITEM_QUANTITY) {
      throw new RequestInputError(`Quantidade inválida: de 1 a ${MAX_ORDER_ITEM_QUANTITY} por produto`);
    }
    quantities.set(productId.toLowerCase(), total);
  }
  if (quantities.size > MAX_ORDER_ITEMS) {
    throw new RequestInputError(`A sacola aceita até ${MAX_ORDER_ITEMS} produtos diferentes`);
  }
  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
}

function readCustomer(value: unknown): OrderInput['customer'] {
  const record = readRecord(value, 'Informe seus dados');
  const name = readRequiredText(record['nome'], 'seu nome', 2, MAX_CUSTOMER_NAME);
  const email = readRequiredText(record['email'], 'seu e-mail', 3, MAX_EMAIL).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new RequestInputError('E-mail inválido');
  }
  const phone = digitsOf(record['telefone']);
  if (phone.length !== 10 && phone.length !== 11) {
    throw new RequestInputError('Telefone inválido: informe o DDD e o número');
  }
  const cpf = digitsOf(record['cpf']);
  if (!isValidCpf(cpf)) {
    throw new RequestInputError('CPF inválido');
  }
  return { name, email, phone, cpf };
}

function readAddress(value: unknown): OrderAddressInput {
  const record = readRecord(value, 'Informe o endereço de entrega');
  const cep = digitsOf(record['cep']);
  if (cep.length !== 8) {
    throw new RequestInputError('CEP inválido');
  }
  const state = typeof record['uf'] === 'string' ? record['uf'].trim().toUpperCase() : '';
  if (!BRAZIL_STATES.has(state)) {
    throw new RequestInputError('UF inválida');
  }
  return {
    cep,
    street: readRequiredText(record['rua'], 'a rua', 2, 150),
    number: readRequiredText(record['numero'], 'o número', 1, 20),
    complement: readOptionalText(record['complemento'], 'Complemento', 80),
    district: readRequiredText(record['bairro'], 'o bairro', 2, 80),
    city: readRequiredText(record['cidade'], 'a cidade', 2, 80),
    state,
  };
}

function readDelivery(value: unknown): OrderInput['delivery'] {
  const record = readRecord(value, 'Escolha a entrega');
  const type = record['tipo'];
  if (!DELIVERY_TYPES.includes(type as DeliveryType)) {
    throw new RequestInputError('Escolha retirada ou entrega');
  }
  return {
    type: type as DeliveryType,
    address: type === 'entrega' ? readAddress(record['endereco']) : null,
  };
}

function readPayment(value: unknown): OrderInput['payment'] {
  const record = readRecord(value, 'Escolha o pagamento');
  const method = record['forma'];
  if (!ORDER_PAYMENT_METHODS.includes(method as OrderPaymentMethod)) {
    throw new RequestInputError('Escolha Pix ou cartão');
  }
  const cardToken = record['card_token'];
  if (method === 'cartao' && (typeof cardToken !== 'string' || cardToken.trim() === '' || cardToken.length > 100)) {
    throw new RequestInputError('Confira os dados do cartão');
  }
  // Bandeira do cartão (visa, master...), que a biblioteca do Mercado Pago informa na página.
  const paymentMethodId = record['payment_method_id'];
  return {
    method: method as OrderPaymentMethod,
    cardToken: method === 'cartao' ? (cardToken as string).trim() : null,
    paymentMethodId: method === 'cartao' && typeof paymentMethodId === 'string' && /^[a-z0-9_]{2,30}$/.test(paymentMethodId)
      ? paymentMethodId
      : null,
  };
}

/** Corpo do POST /catalogo/public/:vitrine/pedidos. */
export function readOrderInput(body: unknown): OrderInput {
  const record = readRecord(body, 'Pedido inválido');
  return {
    items: readItems(record['itens']),
    customer: readCustomer(record['cliente']),
    delivery: readDelivery(record['entrega']),
    payment: readPayment(record['pagamento']),
    note: readOptionalText(record['observacao'], 'Observação', MAX_NOTE),
  };
}

/** Corpo do PUT /catalogo/pedidos/:id/situacao. */
export function readOrderStatusInput(body: unknown): OrderStatus {
  const record = readRecord(body, 'Pedido inválido');
  const status = record['situacao'];
  if (!ORDER_STATUSES.includes(status as OrderStatus)) {
    throw new RequestInputError('Situação inválida');
  }
  return status as OrderStatus;
}
