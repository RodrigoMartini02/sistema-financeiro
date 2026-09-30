import assert from 'node:assert/strict';
import test from 'node:test';
import type { Produto } from '../../../services/catalogoService';
import type { ContratoResumo } from '../../../services/clientesService';
import type { Representante } from '../../../services/representantesService';
import type { ClassificacaoReceita } from '../../../types/config';
import { formatCurrency } from '../formatters';
import { createIncomeDraft, type IncomeDraft } from './draftState';
import {
  buildIncomeCreateInput, buildIncomeUpdateInput, calculatedAmountCents, commissionPreview, contractPrefill,
  defaultRepeatUntil, fixedCategoryPatch, incomeDuplicateQuery, incomeErrorMessage, monthLabel, replicaCount,
  summarizeIncomeDraft, validateIncomeDraft, type IncomeRuleContext,
} from './draftRules';

const TODAY = '2026-09-29';

const ANA: Representante = {
  id: 7, nome: 'Ana', ativo: true,
  comissoes: [{ classificacao_id: 4, percentual: 10, tipo: 'mensal' }, { classificacao_id: 5, percentual: 5, tipo: 'unica' }],
};
const CANECA: Produto = {
  id: 'p-1', usuarioId: 1, contaId: 17, nome: 'Caneca', descricao: null, valor: '35.00', quantidadeEstoque: '10',
  estoqueMinimo: null, ativo: true, imagens: [], createdAt: '2026-01-01', updatedAt: '2026-01-01',
};
const CONTRATO: ContratoResumo = {
  id: 8, cliente_nome: 'Empresa XYZ', representante_id: 7,
  horas_presenciais_valor: 200, horas_presenciais_saldo_atual: 12, horas_remotas_valor: null, horas_remotas_saldo_atual: null,
};

const context: IncomeRuleContext = {
  todayIso: TODAY,
  isCompany: true,
  representatives: [ANA],
  products: [CANECA],
  contracts: [CONTRATO],
  clientNames: ['Empresa XYZ'],
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

  const hours = summarizeIncomeDraft(draft({ categoryId: null, contractId: 8, hourType: 'presencial', hours: 4 }), context);
  assert.deepEqual(hours?.badges, [{ text: '4h presenciais · saldo 12h', tone: 'neutral' }]);

  assert.equal(summarizeIncomeDraft(draft({ amountCents: null }), context), null);
});

test('valor calculado pela venda ou pelas horas, e o que o contrato preenche', () => {
  assert.equal(calculatedAmountCents(draft({ productId: 'p-1', soldQuantity: 2 }), context), 7000);
  assert.equal(calculatedAmountCents(draft({ contractId: 8, hourType: 'presencial', hours: 1.5 }), context), 30000);
  assert.equal(calculatedAmountCents(draft({ contractId: 8, hourType: 'remoto', hours: 2 }), context), null);
  assert.deepEqual(contractPrefill(draft(), CONTRATO), { client: 'Empresa XYZ', representativeId: 7 });
  assert.deepEqual(contractPrefill(draft({ client: 'Outra', representativeId: 3 }), CONTRATO), {});
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

  const wrongClient = validateIncomeDraft(draft({ client: 'Fulano' }), context);
  assert.equal(incomeErrorMessage(wrongClient), 'Escolha um cliente do cadastro.');
  assert.deepEqual(validateIncomeDraft(draft({ client: 'Fulano' }), { ...context, isCompany: false }), {});

  const sameMonth = validateIncomeDraft(draft({ repeatUntil: { month: 8, year: 2026 } }), context);
  assert.equal(incomeErrorMessage(sameMonth), 'Escolha em "Repetir até" um mês depois do da receita, em até 36 meses.');

  const tooMuch = validateIncomeDraft(draft({ productId: 'p-1', soldQuantity: 11 }), context);
  const noHours = validateIncomeDraft(draft({ contractId: 8, hourType: 'presencial', hours: null }), context);
  assert.equal(incomeErrorMessage({ ...tooMuch, ...noHours }), 'Confira a quantidade do produto vendido e complete as horas a faturar.');

  assert.deepEqual(validateIncomeDraft(draft({ receiptDate: '5' }), context), {});
  assert.equal(incomeErrorMessage(validateIncomeDraft(draft({ receiptDate: '31/02/2026' }), context)), 'Confira a data do recebimento.');
});

test('envio da receita nova: repetir até, produto e horas', () => {
  const input = buildIncomeCreateInput(draft({
    client: ' Empresa XYZ ', representativeId: 7, repeatUntil: { month: 11, year: 2026 },
    productId: 'p-1', soldQuantity: 2, contractId: 8, hourType: 'presencial', hours: 3,
  }), context, 17);
  assert.deepEqual(input, {
    description: 'Consultoria', categoryId: 4, amount: 1500, receiptDate: '2026-09-29', client: 'Empresa XYZ',
    representativeId: 7, attachments: null, accountId: 17,
    repeatUntil: { month: 11, year: 2026 },
    productSale: { productId: 'p-1', quantity: 2 },
    billableHours: { contractId: 8, hourType: 'presencial', hours: 3 },
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
  assert.deepEqual(incomeDuplicateQuery(draft({ client: 'Empresa XYZ' }), 3), {
    description: 'Consultoria', amount: 1500, client: 'Empresa XYZ', excludeId: 3,
  });
  assert.equal(incomeDuplicateQuery(draft({ description: '' }), null), null);
  assert.equal(incomeDuplicateQuery(draft(), null)?.client, null);
});
