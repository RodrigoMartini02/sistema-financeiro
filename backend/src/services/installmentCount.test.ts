import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  installmentCountRefusal, planInstallmentCountChange, planSingleToInstallments, type CountChangeSubject, type CountRow,
} from './installmentCount';

function row(number: number, overrides: Partial<CountRow> = {}): CountRow {
  const month = String(number).padStart(2, '0');
  return { id: number * 10, number, dueDate: `2026-${month}-10`, paid: false, invoiceLinked: false, ...overrides };
}

const OPEN_ROWS = [row(1), row(2), row(3)];

describe('planInstallmentCountChange: aumentar', () => {
  test('cria as parcelas novas continuando o calendário da última, de N + 1 até o novo total', () => {
    const result = planInstallmentCountChange({ rows: OPEN_ROWS, editedId: 20, currentCount: 3, nextCount: 5 });
    assert.deepEqual(result, {
      plan: {
        nextCount: 5,
        deleteIds: [],
        create: [{ number: 4, dueDate: '2026-04-10' }, { number: 5, dueDate: '2026-05-10' }],
      },
    });
  });

  test('segue o calendário da última parcela, mesmo depois de um mês curto', () => {
    const rows = [row(1, { dueDate: '2026-01-31' }), row(2, { dueDate: '2026-02-28' })];
    const result = planInstallmentCountChange({ rows, editedId: 10, currentCount: 2, nextCount: 4 });
    // Parte da última parcela (28/02): 28/03 e 28/04.
    assert.deepEqual(result, {
      plan: { nextCount: 4, deleteIds: [], create: [{ number: 3, dueDate: '2026-03-28' }, { number: 4, dueDate: '2026-04-28' }] },
    });
  });

  test('numeração com falha (parcelas excluídas antes): as novas vão de N + 1 e pulam os meses que faltam', () => {
    // "3/10" só com 8 parcelas gravadas: 9 e 10 foram excluídas pela grade.
    const rows = Array.from({ length: 8 }, (_, index) => row(index + 1));
    const result = planInstallmentCountChange({ rows, editedId: 10, currentCount: 10, nextCount: 12 });
    assert.ok('plan' in result);
    assert.deepEqual(result.plan.create, [{ number: 11, dueDate: '2026-11-10' }, { number: 12, dueDate: '2026-12-10' }]);
  });

  test('o mesmo total não muda nada', () => {
    assert.deepEqual(
      planInstallmentCountChange({ rows: OPEN_ROWS, editedId: 10, currentCount: 3, nextCount: 3 }),
      { plan: { nextCount: 3, deleteIds: [], create: [] } },
    );
  });

  test('fora de 2 a 360 recusa', () => {
    for (const nextCount of [1, 361, 2.5, Number.NaN]) {
      const result = planInstallmentCountChange({ rows: OPEN_ROWS, editedId: 10, currentCount: 3, nextCount });
      assert.deepEqual(result, { refusal: 'Informe de 2 a 360 parcelas' });
    }
  });
});

describe('planInstallmentCountChange: reduzir', () => {
  const FIVE = [row(1), row(2), row(3), row(4), row(5)];

  test('apaga a cauda de parcelas abertas', () => {
    const result = planInstallmentCountChange({ rows: FIVE, editedId: 20, currentCount: 5, nextCount: 3 });
    assert.deepEqual(result, { plan: { nextCount: 3, deleteIds: [40, 50], create: [] } });
  });

  test('parcela paga fora da cauda não impede: ela só ganha o novo rótulo', () => {
    const rows = [row(1, { paid: true }), row(2), row(3), row(4)];
    const result = planInstallmentCountChange({ rows, editedId: 20, currentCount: 4, nextCount: 3 });
    assert.deepEqual(result, { plan: { nextCount: 3, deleteIds: [40], create: [] } });
  });

  test('parcela paga na cauda recusa e diz o mínimo (a mais alta que está travada)', () => {
    const rows = [row(1), row(2), row(3), row(4, { paid: true }), row(5)];
    assert.deepEqual(
      planInstallmentCountChange({ rows, editedId: 10, currentCount: 5, nextCount: 2 }),
      { refusal: 'Não dá para reduzir para 2 parcelas: a parcela 4 já foi paga. O mínimo é 4 parcelas.' },
    );
  });

  test('parcela numa fatura do cartão na cauda recusa com o motivo da fatura', () => {
    const rows = [row(1), row(2), row(3, { invoiceLinked: true, paid: true })];
    assert.deepEqual(
      planInstallmentCountChange({ rows, editedId: 10, currentCount: 3, nextCount: 2 }),
      { refusal: 'Não dá para reduzir para 2 parcelas: a parcela 3 está numa fatura do cartão. O mínimo é 3 parcelas.' },
    );
  });

  test('a parcela editada na cauda recusa: ela não pode ser apagada', () => {
    assert.deepEqual(
      planInstallmentCountChange({ rows: FIVE, editedId: 50, currentCount: 5, nextCount: 3 }),
      { refusal: 'Não dá para reduzir para 3 parcelas: a parcela 5 é a que você está editando. O mínimo é 5 parcelas.' },
    );
  });

  test('parcela cancelada e aberta na cauda também é apagada; sem número fica de fora', () => {
    const rows = [row(1), row(2), row(3), { ...row(4), id: 99, number: null }];
    const result = planInstallmentCountChange({ rows, editedId: 10, currentCount: 3, nextCount: 2 });
    assert.deepEqual(result, { plan: { nextCount: 2, deleteIds: [30], create: [] } });
  });
});

describe('installmentCountRefusal', () => {
  const series: CountChangeSubject = {
    isInstallment: true, recurring: false, groupId: 7, invoiceEditLock: null, paid: false, hasSourceIncome: false, currentCount: 3,
  };
  const single: CountChangeSubject = { ...series, isInstallment: false, groupId: null, currentCount: null };
  const request = { installmentCount: 5, applyTo: 'all' as const, paid: false };

  test('compra parcelada com "Todas" passa; o mesmo total passa sem exigir "Todas"', () => {
    assert.equal(installmentCountRefusal(series, request), null);
    assert.equal(installmentCountRefusal(series, { ...request, installmentCount: 3, applyTo: 'this' }), null);
  });

  test('compra parcelada recusa alcance diferente de "Todas"', () => {
    for (const applyTo of ['this', 'following'] as const) {
      assert.match(installmentCountRefusal(series, { ...request, applyTo })!, /Todas as parcelas/);
    }
  });

  test('parcela gerada pela fatura e parcela sem grupo recusam', () => {
    assert.match(installmentCountRefusal({ ...series, invoiceEditLock: 'generated' }, request)!, /gerada pelo pagamento da fatura/);
    assert.match(installmentCountRefusal({ ...series, groupId: null }, request)!, /não está ligada a uma compra/);
  });

  test('a recorrente recusa', () => {
    assert.match(installmentCountRefusal({ ...series, recurring: true }, request)!, /recorrente não tem nº de parcelas/);
  });

  test('a despesa única passa quando está aberta, sem grupo e sem fatura', () => {
    assert.equal(installmentCountRefusal(single, { ...request, applyTo: 'this' }), null);
  });

  test('a única recusa se está paga (gravada ou no pedido), ligada à fatura, em grupo ou vinda de receita', () => {
    assert.match(installmentCountRefusal({ ...single, paid: true }, request)!, /paga não vira parcelada/);
    assert.match(installmentCountRefusal(single, { ...request, paid: true })!, /paga não vira parcelada/);
    assert.match(installmentCountRefusal({ ...single, invoiceEditLock: 'invoice-item' }, request)!, /ligada à fatura do cartão/);
    assert.match(installmentCountRefusal({ ...single, groupId: 3 }, request)!, /faz parte de um grupo/);
    assert.match(installmentCountRefusal({ ...single, hasSourceIncome: true }, request)!, /comissão/);
  });
});

describe('planSingleToInstallments', () => {
  test('a despesa vira a parcela 1 e as parcelas 2 a N vencem mês a mês a partir do vencimento dela', () => {
    assert.deepEqual(planSingleToInstallments('2026-01-31', 3), {
      plan: {
        nextCount: 3,
        deleteIds: [],
        create: [{ number: 2, dueDate: '2026-02-28' }, { number: 3, dueDate: '2026-03-31' }],
      },
    });
  });

  test('fora de 2 a 360 recusa', () => {
    assert.deepEqual(planSingleToInstallments('2026-01-10', 1), { refusal: 'Informe de 2 a 360 parcelas' });
  });
});
