// Leitura e validação dos pedidos de despesa: corpo do POST/PUT e parâmetros das
// consultas de sugestões e duplicata. Sem acesso ao banco — é o que a rota confere
// antes de chamar o serviço, e por isso pode ser testado isoladamente.
import {
  MAX_AMOUNT, RequestInputError, readAmount, readAttachments, readDescription, readIsoDate, readOptionalId,
  readOptionalIsoDate, readOptionalText, readQueryId, readQueryText, readRecord, roundCents,
} from '../utils/requestInput';

export const PAYMENT_METHODS = ['pix', 'dinheiro', 'debito', 'credito'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const BILLING_TYPES = ['single', 'monthly', 'installments'] as const;
export type BillingType = (typeof BILLING_TYPES)[number];

export const MIN_INSTALLMENTS = 2;
export const MAX_INSTALLMENTS = 360;

const MAX_INVOICE_NUMBER_LENGTH = 50;
const MIN_SEARCH_LENGTH = 2;
const CARD_PAYMENT_METHODS: readonly PaymentMethod[] = ['debito', 'credito'];

export interface PaymentInput {
  paid: boolean;
  paymentDate: string | null;
  amountPaid: number | null;
}

export interface InstallmentInput extends PaymentInput {
  amount: number;
  dueDate: string;
}

export interface ExpenseFieldsInput {
  description: string;
  categoryId: number | null;
  paymentMethod: PaymentMethod;
  cardId: number | null;
  purchaseDate: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  attachments: unknown[] | null;
}

export type ExpenseScheduleInput =
  | ({ billingType: 'single' | 'monthly'; amount: number; dueDate: string } & PaymentInput)
  | { billingType: 'installments'; installments: InstallmentInput[] };

export type CreateExpenseInput = ExpenseFieldsInput & ExpenseScheduleInput & { accountId: number | null };

export interface UpdateExpenseInput extends ExpenseFieldsInput, PaymentInput {
  amount: number;
  dueDate: string;
}

export interface SuggestionsQuery {
  /** Vazia quando o texto tem menos de 2 letras: aí só vêm as preferências de pagamento. */
  description: string;
  accountId: number | null;
  categoryId: number | null;
}

export interface DuplicateQuery {
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  /** Preenchido só no parcelado: aí `amount` é o valor da 1ª parcela. */
  installmentCount: number | null;
  accountId: number | null;
  excludeId: number | null;
}

function readOptionalAmountPaid(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RequestInputError('Valor pago inválido');
  }
  if (value > MAX_AMOUNT) {
    throw new RequestInputError('Valor pago acima do limite permitido');
  }
  return roundCents(value);
}

function readPayment(record: Record<string, unknown>): PaymentInput {
  const paid = record['paid'];
  if (typeof paid !== 'boolean') {
    throw new RequestInputError('Informe se a despesa foi paga');
  }
  const paymentDate = readOptionalIsoDate(record['paymentDate'], 'Data do pagamento inválida');
  const amountPaid = readOptionalAmountPaid(record['amountPaid']);
  if (!paid && (paymentDate !== null || amountPaid !== null)) {
    throw new RequestInputError('Data e valor pagos só valem para despesa paga');
  }
  return { paid, paymentDate, amountPaid };
}

function readPaymentMethod(value: unknown): PaymentMethod {
  if (!PAYMENT_METHODS.includes(value as PaymentMethod)) {
    throw new RequestInputError('Forma de pagamento inválida');
  }
  return value as PaymentMethod;
}

function readFields(record: Record<string, unknown>): ExpenseFieldsInput {
  const description = readDescription(record['description']);
  const paymentMethod = readPaymentMethod(record['paymentMethod']);
  const cardId = readOptionalId(record['cardId'], 'Cartão inválido');
  if (cardId !== null && !CARD_PAYMENT_METHODS.includes(paymentMethod)) {
    throw new RequestInputError('O cartão só vale para débito ou crédito');
  }

  return {
    description,
    categoryId: readOptionalId(record['categoryId'], 'Categoria inválida'),
    paymentMethod,
    cardId,
    purchaseDate: readIsoDate(record['purchaseDate'], 'Data da compra inválida'),
    invoiceNumber: readOptionalText(record['invoiceNumber'], 'Número da nota fiscal', MAX_INVOICE_NUMBER_LENGTH),
    invoiceDate: readOptionalIsoDate(record['invoiceDate'], 'Data de emissão da nota fiscal inválida'),
    attachments: readAttachments(record['attachments']),
  };
}

/** Corpo do POST /expenses. */
export function readCreateExpenseInput(body: unknown): CreateExpenseInput {
  const record = readRecord(body, 'Pedido inválido');
  const fields = readFields(record);
  const accountId = readOptionalId(record['accountId'], 'Conta inválida');
  const billingType = record['billingType'];

  if (billingType === 'installments') {
    const list = record['installments'];
    if (!Array.isArray(list) || list.length < MIN_INSTALLMENTS || list.length > MAX_INSTALLMENTS) {
      throw new RequestInputError(`Informe de ${MIN_INSTALLMENTS} a ${MAX_INSTALLMENTS} parcelas`);
    }
    const installments = list.map((item, index): InstallmentInput => {
      const position = index + 1;
      const installment = readRecord(item, `Parcela ${position} inválida`);
      return {
        amount: readAmount(installment['amount'], `Informe o valor da parcela ${position}`),
        dueDate: readIsoDate(installment['dueDate'], `Vencimento da parcela ${position} inválido`),
        ...readPayment(installment),
      };
    });
    return { ...fields, accountId, billingType, installments };
  }

  if (billingType !== 'single' && billingType !== 'monthly') {
    throw new RequestInputError('Tipo de cobrança inválido');
  }
  return {
    ...fields,
    accountId,
    billingType,
    amount: readAmount(record['amount'], 'Informe o valor'),
    dueDate: readIsoDate(record['dueDate'], 'Data de vencimento inválida'),
    ...readPayment(record),
  };
}

/** Corpo do PUT /expenses/:id — edita uma linha só; parcela e recorrência não mudam. */
export function readUpdateExpenseInput(body: unknown): UpdateExpenseInput {
  const record = readRecord(body, 'Pedido inválido');
  return {
    ...readFields(record),
    amount: readAmount(record['amount'], 'Informe o valor'),
    dueDate: readIsoDate(record['dueDate'], 'Data de vencimento inválida'),
    ...readPayment(record),
  };
}

/** GET /expenses/suggestions?description=&account_id=&category_id= */
export function readSuggestionsQuery(query: Record<string, unknown>): SuggestionsQuery {
  const description = readQueryText(query['description']);
  return {
    description: description.length >= MIN_SEARCH_LENGTH ? description : '',
    accountId: readQueryId(query['account_id'], 'Conta inválida'),
    categoryId: readQueryId(query['category_id'], 'Categoria inválida'),
  };
}

/** GET /expenses/duplicate?description=&amount=&payment_method=&installment_count=&account_id=&exclude_id= */
export function readDuplicateQuery(query: Record<string, unknown>): DuplicateQuery {
  const description = readQueryText(query['description']);
  if (!description) {
    throw new RequestInputError('Informe a descrição');
  }
  const installmentCount = readQueryId(query['installment_count'], 'Número de parcelas inválido');
  if (installmentCount !== null && (installmentCount < MIN_INSTALLMENTS || installmentCount > MAX_INSTALLMENTS)) {
    throw new RequestInputError('Número de parcelas inválido');
  }
  return {
    description,
    amount: readAmount(Number(query['amount']), 'Informe o valor'),
    paymentMethod: readPaymentMethod(query['payment_method']),
    installmentCount,
    accountId: readQueryId(query['account_id'], 'Conta inválida'),
    excludeId: readQueryId(query['exclude_id'], 'Despesa inválida'),
  };
}
