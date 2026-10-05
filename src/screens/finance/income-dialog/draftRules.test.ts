import assert from 'node:assert/strict';
import test from 'node:test';
import type { Produto } from '../../../services/catalogoService';
import type { ContractWithHours } from '../../../services/contractsService';
import type { Representante } from '../../../services/representantesService';
import type { ClassificacaoReceita } from '../../../types/config';
import { formatCurrency } from '../formatters';
import { createIncomeDraft, type IncomeDraft } from './draftState';
import {
  buildIncomeCreateInput, buildIncomeUpdateInput, calculatedAmountCents, commissionPreview, contractPrefill,
  defaultRepeatUntil, fixedCategoryPatch, incomeDuplicateQuery, incomeErrorMessage, monthLabel, productSaleInfo, replicaCount,
  summarizeIncomeDraft, validateIncomeDraft, withholdingPreview, type IncomeRuleContext,
} from './draftRules';

const TODAY = '2026-09-29';

const ANA: Representante = {
  id: 7, nome: 'Ana', ativo: true,
  comissoes: [{ classificacao_id: 4, percentual: 10, tipo: 'mensal' }, { classificacao_id: 5, percentual: 5, tipo: 'unica' }],
};
const CANECA: Produto = {
  id: 'p-1', usuarioId: 1, contaId: 17, nome: 'Caneca', descricao: null, categoria: null, valor: '35.00',
  descontoTipo: null, descontoValor: null, valorFinal: 35, descontoPercentual: null, controlaEstoque: true,
  quantidadeEstoque: '10', estoqueMinimo: null, ativo: true, imagens: [], createdAt: '2026-01-01', updatedAt: '2026-01-01',
};
const CONTRATO: ContractWithHours = {
  contractId: 8, number: '12/2026', description: null, clientId: 31, clientName: 'Empresa XYZ', clientType: 'empresa',
  withholdings: {}, representativeId: 7,
  hourTypes: [{ id: 21, name: 'Suporte', hourlyRate: 200, quantity: 40, used: 28, balance: 12 }],
};
// Órgão público com IR de 4,80% e ISS de 5,00%.
const PREFEITURA: ContractWithHours = {
  contractId: 9, number: null, description: null, clientId: 32, clientName: 'Prefeitura', clientType: 'orgao_publico',
  withholdings: { ir: 4.8, iss: 5 }, representativeId: null,
  hourTypes: [{ id: 22, name: 'Plantão', hourlyRate: 150, quantity: 40, used: 0, balance: 40 }],
};

const context: IncomeRuleContext = {
  todayIso: TODAY,
  isCompany: true,
  representatives: [ANA],
  products: [CANECA],
  contracts: [CONTRATO, PREFEITURA],
  clients: [{ id: 31, name: 'Empresa XYZ' }, { id: 32, name: 'Prefeitura' }],
};

function draft(overrides: Partial<IncomeDraft> = {}): IncomeDraft {
  return { ...createIncomeDraft('29/09/2026'), description: 'Consultoria', categoryId: 4, amountCents: 150000, ...overrides };
}

const brl = (reais: number) => formatCurrency(reais);

test('repetir até: meses depois do da receita e mês final padrão', () => {
  assert.equal(replicaCount(draft({ repeatUntil: { month: 11, year: 2026 } }), TODAY), 3);
  assert.equal(replicaCount(draft({ repeatUntil: { month: 8, year: 2026 } }), TODAY), 0);
  assert.equal(replicaCount(draft(), TODAY), 0);
  assert.deepEqual(defaultRepeatUntil(draft(), TODAY), { month: 11, year: 2026 });
  assert.deepEqual(defaultRepeatUntil(draft({ receiptDate: '10/12/2026' }), TODAY), { month: 11, year: 2027 });
  assert.equal(monthLabel(11, 2026), 'dez/26');
});

test('prévia da comissão: mensal, única, sem comissão configurada e sem representante', () => {
  assert.deepEqual(commissionPreview(draft({ representativeId: 7 }), context), {
    kind: 'rule', representativeName: 'Ana', percent: 10, type: 'mensal', amountCents: 15000,
  });
  assert.equal(commissionPreview(draft({ representativeId: 7, categoryId: 5 }), context).kind, 'rule');
  assert.deepEqual(commissionPreview(draft({ representativeId: 7, categoryId: 9 }), context), { kind: 'missing', representativeName: 'Ana' });
  assert.deepEqual(commissionPreview(draft(), context), { kind: 'none' });
});

test('resumo: total com as réplicas e os avisos de comissão, estoque e horas', () => {
  const repeated = summarizeIncomeDraft(draft({ repeatUntil: { month: 11, year: 2026 }, representativeId: 7 }), context);
  assert.equal(repeated?.status.text, 'Recebida');
  assert.equal(repeated?.detail, 'em 29/09');
  assert.equal(repeated?.total, `${brl(1500)} · todo mês até dez/26 · 4 lançamentos`);
  assert.deepEqual(repeated?.badges, [{ text: `comissão de ${brl(150)} para Ana (10% · mensal)`, tone: 'info' }]);

  const missing = summarizeIncomeDraft(draft({ representativeId: 7, categoryId: 9 }), context);
  assert.deepEqual(missing?.badges, [{ text: 'sem comissão configurada para esta categoria', tone: 'warning' }]);

  const sale = summarizeIncomeDraft(draft({ categoryId: null, productId: 'p-1', soldQuantity: 12 }), context);
  assert.deepEqual(sale?.badges, [{ text: 'estoque insuficiente: há 10', tone: 'danger' }]);

  const hours = summarizeIncomeDraft(draft({ categoryId: null, contractId: 8, hourTypeId: 21, hours: 4 }), context);
  assert.deepEqual(hours?.badges, [{ text: '4h Suporte · saldo 8h', tone: 'neutral' }]);

  const overBalance = summarizeIncomeDraft(draft({ categoryId: null, contractId: 8, hourTypeId: 21, hours: 13 }), context);
  assert.deepEqual(overBalance?.badges, [{ text: 'saldo de horas insuficiente: restam 12h', tone: 'danger' }]);

  assert.equal(summarizeIncomeDraft(draft({ amountCents: null }), context), null);
});

test('valor calculado pela venda ou pelas horas, e o que o contrato preenche', () => {
  assert.equal(calculatedAmountCents(draft({ productId: 'p-1', soldQuantity: 2 }), context), 7000);
  assert.equal(calculatedAmountCents(draft({ contractId: 8, hourTypeId: 21, hours: 1.5 }), context), 30000);
  assert.equal(calculatedAmountCents(draft({ contractId: 8, hourTypeId: null, hours: 2 }), context), null);
  // As horas são do cliente do contrato; o representante só entra se estiver vazio.
  assert.deepEqual(contractPrefill(draft(), CONTRATO), { clientId: 31, representativeId: 7 });
  assert.deepEqual(contractPrefill(draft({ clientId: 32, representativeId: 3 }), CONTRATO), { clientId: 31 });
});

test('horas de contrato com órgão público: o valor digitado é o bruto e a receita vale o líquido', () => {
  const publicHours = draft({ contractId: 9, hourTypeId: 22, hours: 30, amountCents: 450000, clientId: 32, representativeId: 7 });
  assert.deepEqual(withholdingPreview(publicHours, context), { grossCents: 450000, withheldCents: 44100, netCents: 405900 });
  assert.equal(withholdingPreview(draft({ contractId: 8, hourTypeId: 21, hours: 2 }), context), null);
  const summary = summarizeIncomeDraft(publicHours, context);
  assert.deepEqual(summary?.badges.at(-1), { text: `líquido ${brl(4059)} · retenções de ${brl(441)}`, tone: 'info' });
  // A comissão sai do líquido, como no servidor.
  const commission = commissionPreview(publicHours, context);
  assert.equal(commission.kind === 'rule' ? commission.amountCents : null, 40590);
});

test('categoria fixa preenche o valor vazio e o dia, menos com a data travada', () => {
  const fixed = { id: 4, fixa: { valor: 4500, dia_recebimento: 31, lancar_automatico: false } } as ClassificacaoReceita;
  assert.deepEqual(fixedCategoryPatch(draft({ amountCents: null, receiptDate: '10/02/2026' }), fixed, TODAY, false), {
    amountCents: 450000, receiptDate: '28/02/2026',
  });
  assert.deepEqual(fixedCategoryPatch(draft(), fixed, TODAY, true), {});
  assert.deepEqual(fixedCategoryPatch(draft(), { ...fixed, fixa: null }, TODAY, false), {});
});

test('validação aponta os campos e monta a mensagem do rodapé', () => {
  const empty = validateIncomeDraft(draft({ description: ' ', amountCents: null }), context);
  assert.equal(incomeErrorMessage(empty), 'Preencha descrição e valor.');

  const wrongClient = validateIncomeDraft(draft({ clientId: 32, contractId: 8, hourTypeId: 21, hours: 2 }), context);
  assert.equal(incomeErrorMessage(wrongClient), 'Use o cliente do contrato das horas.');
  assert.deepEqual(validateIncomeDraft(draft({ clientId: 32 }), context), {});

  const overBalance = validateIncomeDraft(draft({ clientId: 31, contractId: 8, hourTypeId: 21, hours: 12.5 }), context);
  assert.equal(incomeErrorMessage(overBalance), 'Lance no máximo o saldo de horas do contrato.');

  const sameMonth = validateIncomeDraft(draft({ repeatUntil: { month: 8, year: 2026 } }), context);
  assert.equal(incomeErrorMessage(sameMonth), 'Escolha em "Repetir até" um mês depois do da receita, em até 36 meses.');

  const tooMuch = validateIncomeDraft(draft({ productId: 'p-1', soldQuantity: 11 }), context);
  const noHours = validateIncomeDraft(draft({ contractId: 8, hourTypeId: 21, hours: null }), context);
  assert.equal(incomeErrorMessage({ ...tooMuch, ...noHours }), 'Confira a quantidade do produto vendido e complete as horas a faturar.');

  assert.deepEqual(validateIncomeDraft(draft({ receiptDate: '5' }), context), {});
  assert.equal(incomeErrorMessage(validateIncomeDraft(draft({ receiptDate: '31/02/2026' }), context)), 'Confira a data do recebimento.');
});

test('envio da receita nova: repetir até, produto e horas', () => {
  const input = buildIncomeCreateInput(draft({
    clientId: 31, representativeId: 7, repeatUntil: { month: 11, year: 2026 },
    productId: 'p-1', soldQuantity: 2, contractId: 8, hourTypeId: 21, hours: 3,
  }), context, 17);
  assert.deepEqual(input, {
    description: 'Consultoria', categoryId: 4, amount: 1500, receiptDate: '2026-09-29', clientId: 31,
    representativeId: 7, attachments: null, accountId: 17,
    repeatUntil: { month: 11, year: 2026 },
    productSale: { productId: 'p-1', quantity: 2 },
    billableHours: { hourTypeId: 21, hours: 3 },
  });

  const simple = buildIncomeCreateInput(draft({ receiptDate: '5' }), context, null);
  assert.equal(simple.receiptDate, '2026-09-05');
  assert.equal(simple.repeatUntil, null);
  assert.equal(simple.productSale, null);
  assert.equal(simple.billableHours, null);
});

test('edição envia só os campos da própria receita', () => {
  const input = buildIncomeUpdateInput(draft({ repeatUntil: { month: 11, year: 2026 }, productId: 'p-1', soldQuantity: 1 }), context);
  assert.equal('repeatUntil' in input, false);
  assert.equal('productSale' in input, false);
  assert.equal(input.amount, 1500);
});

test('duplicata compara descrição, valor e cliente', () => {
  assert.deepEqual(incomeDuplicateQuery(draft({ clientId: 31 }), 3), {
    description: 'Consultoria', amount: 1500, clientId: 31, excludeId: 3,
  });
  assert.equal(incomeDuplicateQuery(draft({ description: '' }), null), null);
  assert.equal(incomeDuplicateQuery(draft(), null)?.clientId, null);
});

test('produto com desconto pré-preenche o valor com o preço final', () => {
  const comDesconto: Produto = {
    ...CANECA, descontoTipo: 'percentual', descontoValor: '20.00', valorFinal: 28, descontoPercentual: 20,
  };
  const comDescontoContext: IncomeRuleContext = { ...context, products: [comDesconto] };
  assert.equal(calculatedAmountCents(draft({ productId: 'p-1', soldQuantity: 2 }), comDescontoContext), 5600);
});

test('produto sem controle de estoque não fica insuficiente nem mostra o estoque', () => {
  const semControle: Produto = { ...CANECA, controlaEstoque: false, quantidadeEstoque: '0' };
  const semControleContext: IncomeRuleContext = { ...context, products: [semControle] };
  const venda = draft({ categoryId: null, productId: 'p-1', soldQuantity: 5 });
  assert.equal(productSaleInfo(venda, semControleContext)?.insufficient, false);
  assert.equal(validateIncomeDraft(venda, semControleContext).product, undefined);
  assert.deepEqual(summarizeIncomeDraft(venda, semControleContext)?.badges ?? [], []);
});
