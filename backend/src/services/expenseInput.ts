// Leitura e validação dos pedidos de despesa: corpo do POST/PUT e parâmetros das
// consultas de sugestões e duplicata. Sem acesso ao banco — é o que a rota confere
// antes de chamar o serviço, e por isso pode ser testado isoladamente.

export const PAYMENT_METHODS = ['pix', 'dinheiro', 'debito', 'credito'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const BILLING_TYPES = ['single', 'monthly', 'installments'] as const;
export type BillingType = (typeof BILLING_TYPES)[number];

export const MIN_INSTALLMENTS = 2;
export const MAX_INSTALLMENTS = 360;
/** Maior valor que cabe nas colunas decimal(10,2). */
export const MAX_AMOUNT = 99_999_999.99;

const MAX_DESCRIPTION_LENGTH = 255;
const MAX_INVOICE_NUMBER_LENGTH = 50;
const MIN_SEARCH_LENGTH = 2;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CARD_PAYMENT_METHODS: readonly PaymentMethod[] = ['debito', 'credito'];

export class ExpenseRequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

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

function readRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ExpenseRequestError(message);
  }
  return value as Record<string, unknown>;
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month! - 1 && date.getUTCDate() === day;
}

function readDate(value: unknown, message: string): string {
  if (typeof value !== 'string' || !isValidIsoDate(value)) {
    throw new ExpenseRequestError(message);
  }
  return value;
}

function readOptionalDate(value: unknown, message: string): string | null {
  if (value === undefined || value === null) return null;
  return readDate(value, message);
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function readAmount(value: unknown, message: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ExpenseRequestError(message);
  }
  if (value > MAX_AMOUNT) {
    throw new ExpenseRequestError('Valor acima do limite permitido');
  }
  return roundCents(value);
}

function readOptionalAmountPaid(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ExpenseRequestError('Valor pago inválido');
  }
  if (value > MAX_AMOUNT) {
    throw new ExpenseRequestError('Valor pago acima do limite permitido');
  }
  return roundCents(value);
}

function readOptionalId(value: unknown, message: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ExpenseRequestError(message);
  }
  return value;
}

function readPayment(record: Record<string, unknown>): PaymentInput {
  const paid = record['paid'];
  if (typeof paid !== 'boolean') {
    throw new ExpenseRequestError('Informe se a despesa foi paga');
  }
  const paymentDate = readOptionalDate(record['paymentDate'], 'Data do pagamento inválida');
  const amountPaid = readOptionalAmountPaid(record['amountPaid']);
  if (!paid && (paymentDate !== null || amountPaid !== null)) {
    throw new ExpenseRequestError('Data e valor pagos só valem para despesa paga');
  }
  return { paid, paymentDate, amountPaid };
}

function readPaymentMethod(value: unknown): PaymentMethod {
  if (!PAYMENT_METHODS.includes(value as PaymentMethod)) {
    throw new ExpenseRequestError('Forma de pagamento inválida');
  }
  return value as PaymentMethod;
}

function readFields(record: Record<string, unknown>): ExpenseFieldsInput {
  const description = typeof record['description'] === 'string' ? record['description'].trim() : '';
  if (!description) {
    throw new ExpenseRequestError('Informe a descrição');
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    throw new ExpenseRequestError(`Descrição: até ${MAX_DESCRIPTION_LENGTH} caracteres`);
  }

  const paymentMethod = readPaymentMethod(record['paymentMethod']);
  const cardId = readOptionalId(record['cardId'], 'Cartão inválido');
  if (cardId !== null && !CARD_PAYMENT_METHODS.includes(paymentMethod)) {
    throw new ExpenseRequestError('O cartão só vale para débito ou crédito');
  }

  const rawInvoiceNumber = record['invoiceNumber'];
  if (rawInvoiceNumber !== undefined && rawInvoiceNumber !== null && typeof rawInvoiceNumber !== 'string') {
    throw new ExpenseRequestError('Número da nota fiscal inválido');
  }
  const invoiceNumber = typeof rawInvoiceNumber === 'string' && rawInvoiceNumber.trim() !== ''
    ? rawInvoiceNumber.trim()
    : null;
  if (invoiceNumber !== null && invoiceNumber.length > MAX_INVOICE_NUMBER_LENGTH) {
    throw new ExpenseRequestError(`Número da nota fiscal: até ${MAX_INVOICE_NUMBER_LENGTH} caracteres`);
  }

  const rawAttachments = record['attachments'];
  let attachments: unknown[] | null = null;
  if (rawAttachments !== undefined && rawAttachments !== null) {
    if (!Array.isArray(rawAttachments) || !rawAttachments.every((item) => typeof item === 'object' && item !== null)) {
      throw new ExpenseRequestError('Anexos inválidos');
    }
    attachments = rawAttachments.length > 0 ? rawAttachments : null;
  }

  return {
    description,
    categoryId: readOptionalId(record['categoryId'], 'Categoria inválida'),
    paymentMethod,
    cardId,
    purchaseDate: readDate(record['purchaseDate'], 'Data da compra inválida'),
    invoiceNumber,
    invoiceDate: readOptionalDate(record['invoiceDate'], 'Data de emissão da nota fiscal inválida'),
    attachments,
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
      throw new ExpenseRequestError(`Informe de ${MIN_INSTALLMENTS} a ${MAX_INSTALLMENTS} parcelas`);
    }
    const installments = list.map((item, index): InstallmentInput => {
      const position = index + 1;
      const installment = readRecord(item, `Parcela ${position} inválida`);
      return {
        amount: readAmount(installment['amount'], `Informe o valor da parcela ${position}`),
        dueDate: readDate(installment['dueDate'], `Vencimento da parcela ${position} inválido`),
        ...readPayment(installment),
      };
    });
    return { ...fields, accountId, billingType, installments };
  }

  if (billingType !== 'single' && billingType !== 'monthly') {
    throw new ExpenseRequestError('Tipo de cobrança inválido');
  }
  return {
    ...fields,
    accountId,
    billingType,
    amount: readAmount(record['amount'], 'Informe o valor'),
    dueDate: readDate(record['dueDate'], 'Data de vencimento inválida'),
    ...readPayment(record),
  };
}

/** Corpo do PUT /expenses/:id — edita uma linha só; parcela e recorrência não mudam. */
export function readUpdateExpenseInput(body: unknown): UpdateExpenseInput {
  const record = readRecord(body, 'Pedido inválido');
  return {
    ...readFields(record),
    amount: readAmount(record['amount'], 'Informe o valor'),
    dueDate: readDate(record['dueDate'], 'Data de vencimento inválida'),
    ...readPayment(record),
  };
}

function readQueryText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readQueryId(value: unknown, message: string): number | null {
  if (value === undefined || value === '') return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ExpenseRequestError(message);
  }
  return id;
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
    throw new ExpenseRequestError('Informe a descrição');
  }
  const installmentCount = readQueryId(query['installment_count'], 'Número de parcelas inválido');
  if (installmentCount !== null && (installmentCount < MIN_INSTALLMENTS || installmentCount > MAX_INSTALLMENTS)) {
    throw new ExpenseRequestError('Número de parcelas inválido');
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
