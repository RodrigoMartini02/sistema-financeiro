import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import { readInvoiceMonth, readInvoicePaymentInput } from './cardInvoiceInput';

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cardId: 7,
    invoiceMonth: '2026-10',
    method: 'total',
    paymentDate: '2026-10-10',
    amountPaid: 1000,
    ...overrides,
  };
}

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.message === message);
}

test('lê o pagamento total', () => {
  assert.deepEqual(readInvoicePaymentInput(body()), {
    cardId: 7,
    invoiceMonthStart: '2026-10-01',
    method: 'total',
    paymentDate: '2026-10-10',
    amountPaid: 1000,
    interestAmount: 0,
    installmentCount: null,
  });
});

test('lê o parcial com juros e arredonda os centavos', () => {
  const input = readInvoicePaymentInput(body({ method: 'partial', amountPaid: 600.004, interestAmount: 29.996 }));
  assert.equal(input.method, 'partial');
  assert.equal(input.amountPaid, 600);
  assert.equal(input.interestAmount, 30);
  assert.equal(input.installmentCount, null);
});

test('lê o parcelado: sem valor pago agora e com parcelas', () => {
  const input = readInvoicePaymentInput(body({ method: 'installments', amountPaid: undefined, interestAmount: 80, installmentCount: 3 }));
  assert.equal(input.amountPaid, null);
  assert.equal(input.interestAmount, 80);
  assert.equal(input.installmentCount, 3);
});

test('juros vazios valem zero no parcial e no parcelado', () => {
  assert.equal(readInvoicePaymentInput(body({ method: 'partial', amountPaid: 100 })).interestAmount, 0);
  assert.equal(readInvoicePaymentInput(body({ method: 'installments', amountPaid: null, installmentCount: 2, interestAmount: null })).interestAmount, 0);
});

test('campo que não pertence à forma é recusado', () => {
  assertRejects(() => readInvoicePaymentInput(body({ interestAmount: 10 })), 'No pagamento total, o que passar da soma já entra como encargos');
  assertRejects(() => readInvoicePaymentInput(body({ installmentCount: 3 })), 'Parcelas só valem para o pagamento parcelado');
  assertRejects(
    () => readInvoicePaymentInput(body({ method: 'installments', amountPaid: 100, installmentCount: 3 })),
    'No parcelado não há valor pago agora',
  );
});

test('valor pago ausente, zero, negativo ou acima do limite', () => {
  assertRejects(() => readInvoicePaymentInput(body({ amountPaid: undefined })), 'Informe o valor pago');
  assertRejects(() => readInvoicePaymentInput(body({ amountPaid: 0 })), 'Informe o valor pago');
  assertRejects(() => readInvoicePaymentInput(body({ method: 'partial', amountPaid: -5 })), 'Informe o valor pago');
  assertRejects(() => readInvoicePaymentInput(body({ amountPaid: 100_000_000 })), 'Valor acima do limite permitido');
});

test('juros negativos, não numéricos ou acima do limite', () => {
  assertRejects(() => readInvoicePaymentInput(body({ method: 'partial', amountPaid: 100, interestAmount: -1 })), 'Juros inválidos');
  assertRejects(() => readInvoicePaymentInput(body({ method: 'partial', amountPaid: 100, interestAmount: '30' })), 'Juros inválidos');
  assertRejects(
    () => readInvoicePaymentInput(body({ method: 'partial', amountPaid: 100, interestAmount: 100_000_000 })),
    'Juros acima do limite permitido',
  );
});

test('parcelas fora de 2 a 360 ou não inteiras', () => {
  const message = 'Informe de 2 a 360 parcelas';
  for (const installmentCount of [undefined, 1, 361, 2.5, '3']) {
    assertRejects(
      () => readInvoicePaymentInput(body({ method: 'installments', amountPaid: undefined, installmentCount })),
      message,
    );
  }
});

test('cartão, forma, mês e data inválidos', () => {
  assertRejects(() => readInvoicePaymentInput(body({ cardId: undefined })), 'Informe o cartão');
  assertRejects(() => readInvoicePaymentInput(body({ cardId: 0 })), 'Cartão inválido');
  assertRejects(() => readInvoicePaymentInput(body({ method: 'parcial' })), 'Forma de pagamento inválida');
  assertRejects(() => readInvoicePaymentInput(body({ invoiceMonth: '2026-13' })), 'Mês da fatura inválido');
  assertRejects(() => readInvoicePaymentInput(body({ paymentDate: '2026-02-30' })), 'Data do pagamento inválida');
  assertRejects(() => readInvoicePaymentInput(null), 'Pedido inválido');
});

test('mês da fatura da query', () => {
  assert.equal(readInvoiceMonth('2026-01'), '2026-01-01');
  assertRejects(() => readInvoiceMonth(undefined), 'Mês da fatura inválido');
  assertRejects(() => readInvoiceMonth('2026-1'), 'Mês da fatura inválido');
});
