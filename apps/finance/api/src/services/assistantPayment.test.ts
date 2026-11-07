import assert from 'node:assert/strict';
import test from 'node:test';
import {
  lastDayOfMonth,
  matchOpenExpenses,
  nextOpenPerGroup,
  searchTerms,
  toOpenExpense,
  type OpenExpenseRow,
} from './assistantPayment';

function row(overrides: Partial<OpenExpenseRow> & Pick<OpenExpenseRow, 'id' | 'description'>): OpenExpenseRow {
  return {
    amount: 100,
    dueDate: '2026-10-10',
    currentInstallment: null,
    numberOfInstallments: null,
    installmentGroupId: null,
    paymentMethod: 'pix',
    ...overrides,
  };
}

test('termos de busca ignoram verbo de pagar, valor, data e palavras de ligacao', () => {
  assert.deepEqual(searchTerms('paguei a conta de luz 121,29 ontem'), ['luz']);
  assert.deepEqual(searchTerms('121,29'), []);
  assert.deepEqual(searchTerms('quitei o boleto da Água'), ['agua']);
});

test('busca casa sem acento e por prefixo', () => {
  const rows = [row({ id: 1, description: 'Água' }), row({ id: 2, description: 'Energia elétrica' })];

  assert.deepEqual(matchOpenExpenses('agua 80', rows).map((item) => item.id), [1]);
  assert.deepEqual(matchOpenExpenses('energ', rows).map((item) => item.id), [2]);
});

test('"conta de agua" nao casa com toda "Conta de ..."', () => {
  const rows = [row({ id: 1, description: 'Conta de luz' }), row({ id: 2, description: 'Conta de água' })];

  assert.deepEqual(matchOpenExpenses('paguei a conta de agua', rows).map((item) => item.id), [2]);
});

test('fica so com as de maior pontuacao, na ordem recebida', () => {
  const rows = [
    row({ id: 1, description: 'Internet casa', dueDate: '2026-10-05' }),
    row({ id: 2, description: 'Internet escritório', dueDate: '2026-10-08' }),
    row({ id: 3, description: 'Aluguel casa', dueDate: '2026-10-01' }),
  ];

  assert.deepEqual(matchOpenExpenses('internet', rows).map((item) => item.id), [1, 2]);
  assert.deepEqual(matchOpenExpenses('internet casa', rows).map((item) => item.id), [1]);
});

test('sem termo de busca ou sem nenhuma que case, devolve vazio', () => {
  const rows = [row({ id: 1, description: 'Luz' })];

  assert.deepEqual(matchOpenExpenses('paguei 99', rows), []);
  assert.deepEqual(matchOpenExpenses('academia', rows), []);
  assert.deepEqual(matchOpenExpenses('luz', []), []);
});

test('prefixo curto demais nao casa', () => {
  assert.deepEqual(matchOpenExpenses('ag', [row({ id: 1, description: 'Água' })]), []);
});

test('uma despesa por grupo: a mais antiga em aberto', () => {
  const rows = [
    row({ id: 13, description: 'TV', dueDate: '2026-10-05', installmentGroupId: 10, currentInstallment: 3 }),
    row({ id: 20, description: 'Luz', dueDate: '2026-10-10' }),
    row({ id: 14, description: 'TV', dueDate: '2026-11-05', installmentGroupId: 10, currentInstallment: 4 }),
    row({ id: 21, description: 'Luz avulsa', dueDate: '2026-11-10' }),
  ];

  assert.deepEqual(nextOpenPerGroup(rows).map((item) => item.id), [13, 20, 21]);
});

test('ultimo dia do mes, inclusive em fevereiro', () => {
  assert.equal(lastDayOfMonth('2026-10-02'), '2026-10-31');
  assert.equal(lastDayOfMonth('2028-02-10'), '2028-02-29');
  assert.equal(lastDayOfMonth('2026-02-10'), '2026-02-28');
});

test('despesa oferecida diz se esta vencida', () => {
  const vencida = toOpenExpense(row({ id: 1, description: 'Luz', dueDate: '2026-09-30' }), '2026-10-02');
  const hoje = toOpenExpense(row({ id: 2, description: 'Água', dueDate: '2026-10-02' }), '2026-10-02');

  assert.equal(vencida.vencida, true);
  assert.equal(hoje.vencida, false);
  assert.deepEqual(Object.keys(hoje).sort(), [
    'descricao', 'formaPagamento', 'id', 'parcelaAtual', 'totalParcelas', 'valor', 'vencida', 'vencimento',
  ]);
});
