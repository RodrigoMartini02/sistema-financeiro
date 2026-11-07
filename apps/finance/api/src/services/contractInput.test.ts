import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestInputError } from '../utils/requestInput';
import {
  assertAmendmentStart, readCatalogServiceInput, readContractInput, readReadjustmentInput,
} from './contractInput';

function assertRejects(read: () => unknown, message: string): void {
  assert.throws(read, (error: unknown) => error instanceof RequestInputError && error.message === message);
}

const body = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  startDate: '2027-01-01',
  endDate: '2027-12-31',
  dueDay: 10,
  monthlyFee: 4500,
  ...overrides,
});

const PRIVATE = { publicEntity: false };
const PUBLIC = { publicEntity: true };

test('contrato com mensalidade: data-base do reajuste é o início e campos opcionais vazios viram nulo', () => {
  const input = readContractInput(body({ number: '  ', notes: '' }), PRIVATE);
  assert.equal(input.startDate, '2027-01-01');
  assert.equal(input.endDate, '2027-12-31');
  assert.equal(input.dueDay, 10);
  assert.equal(input.monthlyFee, 4500);
  assert.equal(input.setupFee, null);
  assert.equal(input.projectFee, null);
  assert.deepEqual(input.hourTypes, []);
  assert.deepEqual(input.services, []);
  assert.equal(input.number, null);
  assert.equal(input.notes, null);
  assert.equal(input.readjustmentBaseDate, '2027-01-01');
  assert.equal(input.publicEntity, null);
});

test('sem prazo, data-base informada e cobranças parceladas', () => {
  const input = readContractInput(body({
    endDate: '',
    monthlyFee: null,
    readjustmentBaseDate: '2027-03-01',
    setupFee: { amount: 1000, installments: 3, firstDate: '2027-01-15' },
    projectFee: { amount: 25000, installments: 5, firstDate: '2027-02-10' },
  }), PRIVATE);
  assert.equal(input.endDate, null);
  assert.equal(input.monthlyFee, null);
  assert.equal(input.readjustmentBaseDate, '2027-03-01');
  assert.deepEqual(input.setupFee, { amount: 1000, installments: 3, firstDate: '2027-01-15' });
  assert.deepEqual(input.projectFee, { amount: 25000, installments: 5, firstDate: '2027-02-10' });
});

test('precisa de ao menos uma cobrança; banco de horas sozinho basta', () => {
  const none = 'Informe ao menos uma cobrança: mensalidade, implantação, projeto ou banco de horas';
  assertRejects(() => readContractInput(body({ monthlyFee: null }), PRIVATE), none);
  assertRejects(() => readContractInput(body({ monthlyFee: null, hourTypes: [] }), PRIVATE), none);
  const input = readContractInput(body({
    monthlyFee: null,
    hourTypes: [{ name: ' Suporte ', hourlyRate: 150, quantity: 40 }],
  }), PRIVATE);
  assert.deepEqual(input.hourTypes, [{ id: null, name: 'Suporte', hourlyRate: 150, quantity: 40 }]);
});

test('valores maiores que zero e parcelas com data', () => {
  assertRejects(() => readContractInput(body({ monthlyFee: 0 }), PRIVATE), 'Mensalidade: informe um valor maior que zero');
  assertRejects(() => readContractInput(body({ monthlyFee: -10 }), PRIVATE), 'Mensalidade: informe um valor maior que zero');
  assertRejects(
    () => readContractInput(body({ setupFee: { amount: 0, installments: 3, firstDate: '2027-01-15' } }), PRIVATE),
    'Implantação: informe o valor total',
  );
  assertRejects(
    () => readContractInput(body({ setupFee: { amount: 1000, installments: 0, firstDate: '2027-01-15' } }), PRIVATE),
    'Implantação: parcelas de 1 a 120',
  );
  assertRejects(
    () => readContractInput(body({ projectFee: { amount: 1000, installments: 121, firstDate: '2027-01-15' } }), PRIVATE),
    'Projeto: parcelas de 1 a 120',
  );
  assertRejects(
    () => readContractInput(body({ projectFee: { amount: 1000, installments: 2, firstDate: '2027-02-30' } }), PRIVATE),
    'Projeto: informe a data da primeira parcela',
  );
  assertRejects(
    () => readContractInput(body({ setupFee: { amount: 0.02, installments: 3, firstDate: '2027-01-15' } }), PRIVATE),
    'Implantação: o valor total não cobre as 3 parcelas',
  );
});

test('tipos de hora: nome único no contrato, valor da hora e quantidade maiores que zero', () => {
  const hours = (hourTypes: unknown[]) => () => readContractInput(body({ hourTypes }), PRIVATE);
  assertRejects(
    hours([{ name: 'Suporte', hourlyRate: 150, quantity: 40 }, { name: 'SUPORTE', hourlyRate: 100, quantity: 10 }]),
    'Tipo de hora repetido: SUPORTE',
  );
  assertRejects(hours([{ name: '', hourlyRate: 150, quantity: 40 }]), 'Informe o nome do tipo de hora');
  assertRejects(hours([{ name: 'Suporte', hourlyRate: 0, quantity: 40 }]), 'Suporte: informe o valor da hora');
  assertRejects(hours([{ name: 'Suporte', hourlyRate: 150, quantity: 0 }]), 'Suporte: informe a quantidade de horas');
  assertRejects(hours([{ id: 3, name: 'A', hourlyRate: 1, quantity: 1 }, { id: 3, name: 'B', hourlyRate: 1, quantity: 1 }]), 'Tipo de hora inválido');
  const input = readContractInput(body({ hourTypes: [{ id: 7, name: 'Presencial', hourlyRate: 180.5, quantity: 12.5 }] }), PRIVATE);
  assert.deepEqual(input.hourTypes, [{ id: 7, name: 'Presencial', hourlyRate: 180.5, quantity: 12.5 }]);
});

test('vigência: data final igual ou depois do início e dia de vencimento de 1 a 28', () => {
  assertRejects(() => readContractInput(body({ startDate: '' }), PRIVATE), 'Informe a data de início');
  assertRejects(() => readContractInput(body({ endDate: '2026-12-31' }), PRIVATE), 'A data final deve ser igual ou posterior ao início');
  assert.equal(readContractInput(body({ endDate: '2027-01-01' }), PRIVATE).endDate, '2027-01-01');
  assertRejects(() => readContractInput(body({ dueDay: 0 }), PRIVATE), 'Dia de vencimento: de 1 a 28');
  assertRejects(() => readContractInput(body({ dueDay: 29 }), PRIVATE), 'Dia de vencimento: de 1 a 28');
  assertRejects(() => readContractInput(body({ dueDay: 10.5 }), PRIVATE), 'Dia de vencimento: de 1 a 28');
  assert.equal(readContractInput(body({ dueDay: 28 }), PRIVATE).dueDay, 28);
});

test('serviços do contrato: sem repetição, "implantado" falso por padrão', () => {
  const input = readContractInput(body({ services: [{ serviceId: 4, deployed: true }, { serviceId: 9 }] }), PRIVATE);
  assert.deepEqual(input.services, [{ serviceId: 4, deployed: true }, { serviceId: 9, deployed: false }]);
  assertRejects(() => readContractInput(body({ services: [{ serviceId: 4 }, { serviceId: 4 }] }), PRIVATE), 'Serviço repetido no contrato');
  assertRejects(() => readContractInput(body({ services: [{ serviceId: 'x' }] }), PRIVATE), 'Serviço inválido');
});

test('órgão público: processo, modalidade, retenções de 0 a 100 e empenho com ano único', () => {
  const input = readContractInput(body({
    process: ' 123/2026 ',
    modality: 'Pregão eletrônico',
    withholdings: { ir: 4.8, pisCofinsCsll: '', iss: 5, inss: 0 },
    commitments: [{ year: 2027, number: '2027NE000123', amount: 54000 }],
  }), PUBLIC);
  assert.deepEqual(input.publicEntity, {
    process: '123/2026',
    modality: 'Pregão eletrônico',
    withholdings: { ir: 4.8, iss: 5, inss: 0 },
    commitments: [{ year: 2027, number: '2027NE000123', amount: 54000 }],
  });
  const withholdings = (value: unknown) => () => readContractInput(body({ withholdings: { iss: value } }), PUBLIC);
  assertRejects(withholdings(100.01), 'Retenção de ISS: de 0 a 100%, com até duas casas');
  assertRejects(withholdings(-1), 'Retenção de ISS: de 0 a 100%, com até duas casas');
  assertRejects(withholdings(4.805), 'Retenção de ISS: de 0 a 100%, com até duas casas');
  assertRejects(
    () => readContractInput(body({ commitments: [
      { year: 2027, number: 'A', amount: 10 },
      { year: 2027, number: 'B', amount: 20 },
    ] }), PUBLIC),
    'Já existe um empenho de 2027 neste contrato',
  );
  assertRejects(
    () => readContractInput(body({ commitments: [{ year: 2027, number: 'A', amount: 0 }] }), PUBLIC),
    'Empenho de 2027: informe o valor',
  );
  assertRejects(
    () => readContractInput(body({ commitments: [{ year: 2027, number: ' ', amount: 10 }] }), PUBLIC),
    'Informe o número do empenho de 2027',
  );
});

test('cliente que não é órgão público ignora processo, retenções e empenhos', () => {
  const input = readContractInput(body({ withholdings: { iss: 500 }, commitments: 'x' }), PRIVATE);
  assert.equal(input.publicEntity, null);
});

test('aditivo começa no início do contrato atual ou depois', () => {
  assert.doesNotThrow(() => assertAmendmentStart('2027-01-01', '2027-02-01'));
  assert.doesNotThrow(() => assertAmendmentStart('2027-01-01', '2027-01-01'));
  assertRejects(() => assertAmendmentStart('2027-01-01', '2026-12-01'), 'O aditivo não pode começar antes do início do contrato atual');
});

test('reajuste: aplicar pede percentual com duas casas; dispensar não pede nada', () => {
  assert.deepEqual(readReadjustmentInput({ action: 'dismiss' }), { action: 'dismiss' });
  assert.deepEqual(readReadjustmentInput({ action: 'apply', percent: 4.62 }), { action: 'apply', percent: 4.62 });
  assert.deepEqual(readReadjustmentInput({ action: 'apply', percent: 0 }), { action: 'apply', percent: 0 });
  assertRejects(() => readReadjustmentInput({ action: 'apply' }), 'Informe o percentual do reajuste');
  assertRejects(() => readReadjustmentInput({ action: 'apply', percent: 4.625 }), 'Percentual do reajuste: de 0 a 100%, com até duas casas');
  assertRejects(() => readReadjustmentInput({ action: 'apply', percent: -2 }), 'Percentual do reajuste: de 0 a 100%, com até duas casas');
  assertRejects(() => readReadjustmentInput({ action: 'skip' }), 'Reajuste inválido');
});

test('serviço do catálogo: nome de 2 a 150 caracteres', () => {
  assert.deepEqual(readCatalogServiceInput({ name: '  Suporte técnico ' }), { name: 'Suporte técnico' });
  assertRejects(() => readCatalogServiceInput({ name: 'S' }), 'Informe o nome do serviço');
  assertRejects(() => readCatalogServiceInput({ name: 'S'.repeat(151) }), 'O nome do serviço: até 150 caracteres');
});
