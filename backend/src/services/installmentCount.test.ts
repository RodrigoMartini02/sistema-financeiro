import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  installmentCountRefusal, planInstallmentCountChange, planSingleConversion, type CountChangeSubject, type CountRow,
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
    isInstallment: true, recurring: false, groupId: 7, invoiceEditLock: null, paid: false, creditWithCard: false,
    hasSourceIncome: false, currentCount: 3,
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

  test('a compra parcelada recusa o valor total: ele é só da despesa única que vira parcelada', () => {
    assert.match(installmentCountRefusal(series, { ...request, amountMode: 'total' })!, /só vale para a despesa única/);
    assert.equal(installmentCountRefusal(series, { ...request, amountMode: 'perInstallment' }), null);
  });

  test('a despesa única em aberto passa, com o valor por parcela (o pedido antigo, sem modo) ou com o total', () => {
    assert.equal(installmentCountRefusal(single, { ...request, applyTo: 'this' }), null);
    assert.equal(installmentCountRefusal(single, { ...request, amountMode: 'perInstallment' }), null);
    assert.equal(installmentCountRefusal(single, { ...request, amountMode: 'total' }), null);
  });

  test('a despesa única paga só vira parcelada pelo valor total, e com o pagamento como estava', () => {
    const paid = { ...single, paid: true };
    assert.equal(installmentCountRefusal(paid, { ...request, paid: true, amountMode: 'total' }), null);
    for (const amountMode of [undefined, 'perInstallment' as const]) {
      assert.match(installmentCountRefusal(paid, { ...request, paid: true, amountMode })!, /dividindo o valor total/);
    }
  });

  test('a conversão não muda o pagamento junto: marcar ou desmarcar "paga" exige salvar antes', () => {
    assert.match(installmentCountRefusal({ ...single, paid: true }, { ...request, paid: false, amountMode: 'total' })!, /Salve a mudança do pagamento/);
    assert.match(installmentCountRefusal(single, { ...request, paid: true, amountMode: 'total' })!, /Salve a mudança do pagamento/);
  });

  test('a única recusa se está ligada à fatura, em grupo, vinda de receita ou paga no crédito com cartão', () => {
    assert.match(installmentCountRefusal({ ...single, invoiceEditLock: 'invoice-item' }, request)!, /ligada à fatura do cartão/);
    assert.match(installmentCountRefusal({ ...single, groupId: 3 }, request)!, /faz parte de um grupo/);
    assert.match(installmentCountRefusal({ ...single, hasSourceIncome: true }, request)!, /comissão/);
    assert.match(
      installmentCountRefusal({ ...single, paid: true, creditWithCard: true }, { ...request, paid: true, amountMode: 'total' })!,
      /paga no crédito com cartão é paga pela fatura/,
    );
    // Em aberto no crédito com cartão pode: as parcelas seguem no mesmo cartão.
    assert.equal(installmentCountRefusal({ ...single, creditWithCard: true }, request), null);
  });
});

describe('planSingleConversion', () => {
  type ConversionInput = Parameters<typeof planSingleConversion>[0];
  const base: ConversionInput = { dueDate: '2026-01-31', count: 3, mode: 'total', amountCents: 10000, paidCents: null, interestCents: 0 };
  const plan = (patch: Partial<ConversionInput> = {}) => {
    const result = planSingleConversion({ ...base, ...patch });
    assert.ok('plan' in result, 'refusal' in result ? result.refusal : '');
    return result.plan;
  };
  const sum = (values: Array<number | null>) => values.reduce<number>((total, value) => total + (value ?? 0), 0);

  test('em aberto, por parcela: a despesa vira a parcela 1 e as demais vencem mês a mês, cada uma com o valor informado', () => {
    const { nextCount, installments } = plan({ mode: 'perInstallment', amountCents: 21835 });
    assert.equal(nextCount, 3);
    assert.deepEqual(installments, [
      { number: 1, dueDate: '2026-01-31', amountCents: 21835, paidCents: null, interestCents: 0 },
      { number: 2, dueDate: '2026-02-28', amountCents: 21835, paidCents: null, interestCents: 0 },
      { number: 3, dueDate: '2026-03-31', amountCents: 21835, paidCents: null, interestCents: 0 },
    ]);
  });

  test('por parcela, o juros que a despesa já guarda fica na parcela 1', () => {
    const { installments } = plan({ mode: 'perInstallment', interestCents: 250 });
    assert.deepEqual(installments.map((item) => item.interestCents), [250, 0, 0]);
  });

  test('por parcela, a despesa paga não entra: multiplicaria o que foi pago', () => {
    assert.deepEqual(
      planSingleConversion({ ...base, mode: 'perInstallment', paidCents: 10000 }),
      { refusal: 'A despesa paga vira parcelada dividindo o valor total: informe o total da compra' },
    );
  });

  test('total em aberto: R$ 100,00 em 3 soma exatamente R$ 100,00, com a diferença de centavos na última', () => {
    const { installments } = plan();
    assert.deepEqual(installments.map((item) => item.amountCents), [3333, 3333, 3334]);
    assert.deepEqual(installments.map((item) => item.paidCents), [null, null, null]);
    assert.deepEqual(installments.map((item) => item.dueDate), ['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  test('total pago: o pagamento se divide na mesma proporção e todas as parcelas ficam quitadas', () => {
    const { installments } = plan({ paidCents: 10000 });
    assert.deepEqual(installments.map((item) => item.amountCents), [3333, 3333, 3334]);
    assert.deepEqual(installments.map((item) => item.paidCents), [3333, 3333, 3334]);
  });

  test('total pago com juros e multa: o valor pago a mais anda junto e a soma continua exata', () => {
    const { installments } = plan({ paidCents: 10500 });
    assert.deepEqual(installments.map((item) => item.paidCents), [3499, 3499, 3502]);
    assert.equal(sum(installments.map((item) => item.paidCents)), 10500);
    assert.equal(sum(installments.map((item) => item.amountCents)), 10000);
    assert.equal(sum(installments.map((item) => item.paidCents! - item.amountCents)), 500);
  });

  test('total pago com desconto: o valor pago a menos também se divide sem perder centavos', () => {
    const { installments } = plan({ paidCents: 9500 });
    assert.deepEqual(installments.map((item) => item.paidCents), [3166, 3166, 3168]);
    assert.equal(sum(installments.map((item) => item.paidCents! - item.amountCents)), -500);
  });

  test('o juros que a despesa já guarda se divide entre as parcelas, sem passar do valor de cada uma', () => {
    const { installments } = plan({ interestCents: 300 });
    assert.deepEqual(installments.map((item) => item.interestCents), [100, 100, 100]);
    const tiny = plan({ count: 2, amountCents: 3, interestCents: 3 });
    assert.deepEqual(tiny.installments.map((item) => [item.amountCents, item.interestCents]), [[1, 1], [2, 2]]);
  });

  test('as somas nunca mudam, para qualquer total, pagamento e nº de parcelas', () => {
    for (const amountCents of [1, 7, 100, 9999, 10001, 123456]) {
      for (const count of [2, 3, 7, 12, 360]) {
        if (amountCents < count) continue;
        for (const paidCents of [null, 0, amountCents, Math.round(amountCents * 1.05), Math.round(amountCents * 0.9)]) {
          const { installments } = plan({ amountCents, count, paidCents });
          assert.equal(installments.length, count);
          assert.equal(sum(installments.map((item) => item.amountCents)), amountCents);
          assert.ok(installments.every((item) => item.amountCents >= 1));
          if (paidCents !== null) assert.equal(sum(installments.map((item) => item.paidCents)), paidCents);
          assert.deepEqual(installments.map((item) => item.number), Array.from({ length: count }, (_, index) => index + 1));
        }
      }
    }
  });

  test('a conversão é determinística: o mesmo pedido dá o mesmo plano', () => {
    assert.deepEqual(plan({ paidCents: 10500, interestCents: 120 }), plan({ paidCents: 10500, interestCents: 120 }));
  });

  test('recusa nº de parcelas fora de 2 a 360, total sem 1 centavo por parcela e valor inválido', () => {
    assert.deepEqual(planSingleConversion({ ...base, count: 1 }), { refusal: 'Informe de 2 a 360 parcelas' });
    assert.deepEqual(planSingleConversion({ ...base, count: 361 }), { refusal: 'Informe de 2 a 360 parcelas' });
    assert.deepEqual(planSingleConversion({ ...base, amountCents: 2 }), { refusal: 'O total precisa permitir pelo menos R$ 0,01 por parcela' });
    assert.deepEqual(planSingleConversion({ ...base, amountCents: 0 }), { refusal: 'Informe o valor da despesa' });
  });
});
