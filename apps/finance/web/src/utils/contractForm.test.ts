import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContractDetail } from '../services/contractsService';
import {
  contractRequestBody, draftFromContract, emptyCommitment, emptyContractDraft, emptyHourType, firstInvalidStep, nextMonthStart,
  parseDecimal, validateStep, wizardSteps, type ContractDraft,
} from './contractForm';

const TODAY = '2026-10-04';

const draft = (overrides: Partial<ContractDraft> = {}): ContractDraft => ({
  ...emptyContractDraft(TODAY),
  startDate: '01/01/2027',
  endDate: '31/12/2027',
  openEnded: false,
  monthly: { enabled: true, amountCents: 450000 },
  ...overrides,
});

test('contrato novo começa hoje, sem prazo, com mensalidade e vencimento no dia 10', () => {
  const empty = emptyContractDraft(TODAY);
  assert.equal(empty.startDate, '04/10/2026');
  assert.equal(empty.openEnded, true);
  assert.equal(empty.dueDay, 10);
  assert.deepEqual(empty.monthly, { enabled: true, amountCents: null });
  assert.deepEqual(wizardSteps(false), ['term', 'charges', 'options', 'preview']);
  assert.deepEqual(wizardSteps(true), ['term', 'charges', 'public', 'options', 'preview']);
});

test('vigência: início, data final depois do início, dia de 1 a 28', () => {
  assert.deepEqual(validateStep('term', draft()), {});
  assert.equal(validateStep('term', draft({ startDate: '31/02/2027' })).startDate, 'Informe a data de início');
  assert.equal(validateStep('term', draft({ endDate: '31/12/2026' })).endDate, 'A data final deve ser igual ou posterior ao início');
  assert.equal(validateStep('term', draft({ endDate: '' })).endDate, 'Informe a data final ou marque "Sem prazo"');
  assert.deepEqual(validateStep('term', draft({ endDate: '', openEnded: true })), {});
  assert.equal(validateStep('term', draft({ dueDay: 29 })).dueDay, 'Dia de vencimento: de 1 a 28');
});

test('cobranças: ao menos uma, valores maiores que zero, parcelas com data e horas sem nome repetido', () => {
  assert.equal(
    validateStep('charges', draft({ monthly: { enabled: false, amountCents: null } })).charges,
    'Informe ao menos uma cobrança: mensalidade, implantação, projeto ou banco de horas',
  );
  assert.equal(validateStep('charges', draft({ monthly: { enabled: true, amountCents: null } }))['monthly.amount'], 'Mensalidade: informe um valor maior que zero');

  const setup = { enabled: true, totalCents: 100000, installments: '0', firstDate: '' };
  const errors = validateStep('charges', draft({ setup }));
  assert.equal(errors['setup.installments'], 'Implantação: parcelas de 1 a 120');
  assert.equal(errors['setup.firstDate'], 'Implantação: informe a data da primeira parcela');
  assert.equal(
    validateStep('charges', draft({ project: { enabled: true, totalCents: 2, installments: '3', firstDate: '10/02/2027' } }))['project.total'],
    'Projeto: o valor total não cobre as 3 parcelas',
  );

  const hours = [
    { ...emptyHourType(), name: 'Suporte', hourlyRateCents: 15000, quantity: '40' },
    { ...emptyHourType(), name: 'suporte', hourlyRateCents: 0, quantity: '0' },
  ];
  const hourErrors = validateStep('charges', draft({ hourTypes: hours }));
  assert.equal(hourErrors['hourTypes.1.name'], 'Tipo de hora repetido: suporte');
  assert.equal(hourErrors['hourTypes.1.hourlyRate'], 'suporte: informe o valor da hora');
  assert.equal(hourErrors['hourTypes.1.quantity'], 'suporte: informe a quantidade de horas');
  assert.equal(
    validateStep('charges', draft({ hourTypes: [{ ...hours[0]!, quantity: '4', used: 5 }] }))['hourTypes.0.quantity'],
    'Suporte: a quantidade não pode ficar abaixo das horas já lançadas',
  );
});

test('órgão público: retenções de 0 a 100 com duas casas e um empenho por ano', () => {
  const withholdings = { ir: '4,80', pisCofinsCsll: '', iss: '100,01', inss: '1,234' };
  const errors = validateStep('public', draft({ withholdings }));
  assert.equal(errors['withholdings.ir'], undefined);
  assert.equal(errors['withholdings.iss'], 'Retenção de ISS: de 0 a 100%, com até duas casas');
  assert.equal(errors['withholdings.inss'], 'Retenção de INSS: de 0 a 100%, com até duas casas');

  const commitments = [
    { ...emptyCommitment(2027), number: '2027NE1', amountCents: 5400000 },
    { ...emptyCommitment(2027), number: '', amountCents: null },
  ];
  const commitmentErrors = validateStep('public', draft({ commitments }));
  assert.equal(commitmentErrors['commitments.1.year'], 'Já existe um empenho de 2027 neste contrato');
  assert.equal(commitmentErrors['commitments.1.number'], 'Informe o número do empenho');
  assert.equal(commitmentErrors['commitments.1.amount'], 'Informe o valor do empenho');
  assert.equal(firstInvalidStep(wizardSteps(true), draft({ commitments })), 'public');
});

test('corpo da API: datas em ISO, centavos em reais e a parte de órgão público só nele', () => {
  const full = draft({
    number: ' 12/2027 ',
    readjustmentBaseDate: '',
    setup: { enabled: true, totalCents: 100000, installments: '3', firstDate: '15/01/2027' },
    hourTypes: [{ ...emptyHourType(), id: 4, name: ' Suporte ', hourlyRateCents: 15050, quantity: '12,5' }],
    monthlyClassificationId: 7,
    projectClassificationId: 9,
    withholdings: { ir: '4,80', pisCofinsCsll: '', iss: '5', inss: '' },
    process: ' 123/2026 ',
    commitments: [{ ...emptyCommitment(2027), number: '2027NE1', amountCents: 5400000 }],
  });
  const body = contractRequestBody(full, true);
  assert.equal(body.number, '12/2027');
  assert.equal(body.startDate, '2027-01-01');
  assert.equal(body.endDate, '2027-12-31');
  assert.equal(body.monthlyFee, 4500);
  assert.deepEqual(body.setupFee, { amount: 1000, installments: 3, firstDate: '2027-01-15' });
  assert.equal(body.projectFee, null);
  assert.deepEqual(body.hourTypes, [{ id: 4, name: 'Suporte', hourlyRate: 150.5, quantity: 12.5 }]);
  assert.equal(body.monthlyClassificationId, 7);
  assert.equal(body.projectClassificationId, null);
  assert.equal(body.readjustmentBaseDate, null);
  assert.deepEqual(body.withholdings, { ir: 4.8, iss: 5 });
  assert.equal(body.process, '123/2026');
  assert.deepEqual(body.commitments, [{ year: 2027, number: '2027NE1', amount: 54000 }]);

  const privateBody = contractRequestBody(full, false);
  assert.deepEqual(privateBody.withholdings, {});
  assert.deepEqual(privateBody.commitments, []);
  assert.equal(privateBody.process, '');
  assert.equal(contractRequestBody(draft({ openEnded: true }), false).endDate, null);
});

test('números com vírgula ou ponto', () => {
  assert.equal(parseDecimal('12,5'), 12.5);
  assert.equal(parseDecimal('12.5'), 12.5);
  assert.equal(parseDecimal('1.000,50'), 1000.5);
  assert.equal(parseDecimal(''), null);
  assert.equal(parseDecimal('abc'), null);
});

const contract = (overrides: Partial<ContractDetail> = {}): ContractDetail => ({
  id: 3,
  accountId: 19,
  number: '12/2027',
  description: null,
  notes: null,
  startDate: '2027-01-01',
  endDate: '2027-12-31',
  dueDay: 10,
  status: 'ativo',
  closedAt: null,
  previousContractId: null,
  nextContractId: null,
  amendmentNumber: 0,
  client: { id: 8, name: 'Prefeitura', type: 'orgao_publico', document: '11222333000181', active: true },
  representative: { id: 2, name: 'Ana' },
  monthlyClassificationId: 7,
  setupClassificationId: null,
  projectClassificationId: null,
  monthlyFee: 4500,
  monthlyNet: 4059,
  setupFee: null,
  projectFee: null,
  hourTypes: [{ id: 11, name: 'Suporte', hourlyRate: 150, quantity: 40, used: 5, balance: 35 }],
  publicEntity: {
    process: '123/2026',
    modality: 'Pregão',
    withholdings: { ir: 4.8, iss: 5 },
    commitments: [{ year: 2027, number: '2027NE1', amount: 54000, used: 13500, balance: 40500 }],
  },
  services: [{ serviceId: 5, name: 'ERP', deployed: true, active: true }],
  readjustment: { baseDate: '2027-01-01', handledUntil: null, available: false, anniversary: '2028-01-01' },
  expiringSoon: false,
  incomes: [],
  attachments: [],
  canDelete: false,
  ...overrides,
});

test('alteração: os termos gravados, com os tipos de hora pelo id e as horas usadas', () => {
  const edit = draftFromContract(contract(), 'edit', TODAY);
  assert.equal(edit.startDate, '01/01/2027');
  assert.equal(edit.endDate, '31/12/2027');
  assert.equal(edit.openEnded, false);
  assert.deepEqual(edit.monthly, { enabled: true, amountCents: 450000 });
  assert.equal(edit.hourTypes[0]!.id, 11);
  assert.equal(edit.hourTypes[0]!.used, 5);
  assert.equal(edit.hourTypes[0]!.quantity, '40');
  assert.deepEqual(edit.withholdings, { ir: '4,80', pisCofinsCsll: '', iss: '5,00', inss: '' });
  assert.equal(edit.commitments[0]!.amountCents, 5400000);
  assert.equal(edit.representativeId, 2);
});

test('aditivo: começa no mês seguinte, horas no saldo inicial e empenhos pelo saldo', () => {
  assert.equal(nextMonthStart('2026-12-15'), '2027-01-01');
  const amendment = draftFromContract(contract(), 'amendment', '2027-01-20');
  assert.equal(amendment.startDate, '01/02/2027');
  assert.equal(amendment.endDate, '31/12/2027');
  assert.equal(amendment.hourTypes[0]!.id, null);
  assert.equal(amendment.hourTypes[0]!.used, 0);
  assert.equal(amendment.commitments[0]!.amountCents, 4050000);
  const afterEnd = draftFromContract(contract(), 'amendment', '2027-12-20');
  assert.equal(afterEnd.startDate, '01/01/2028');
  assert.equal(afterEnd.openEnded, true);
});
