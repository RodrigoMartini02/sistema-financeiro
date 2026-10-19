import assert from 'node:assert/strict';
import test from 'node:test';
import type { Produto } from '../../../services/catalogoService';
import type { ContractWithHours } from '../../../services/contractsService';
import type { Representante } from '../../../services/representantesService';
import type { ClassificacaoReceita } from '../../../types/config';
import { formatCurrency } from '../formatters';
import type { Income } from '../../../types/finance';
import { createIncomeDraft, incomeDraftFromIncome, type IncomeDraft } from './draftState';
import {
  buildIncomeCreateInput, buildIncomeUpdateInput, calculatedAmountCents, commissionPreview, contractPrefill,
  defaultRepeatUntil, effectiveNetCents, fixedCategoryPatch, incomeDuplicateQuery, incomeErrorMessage, monthLabel, productSaleInfo, replicaCount,
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
  return { ...createIncomeDraft('29/09/2026'), description: 'Consultoria', categoryId: 4, grossCents: 150000, ...overrides };
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

  assert.equal(summarizeIncomeDraft(draft({ grossCents: null }), context), null);
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
  const publicHours = draft({ contractId: 9, hourTypeId: 22, hours: 30, grossCents: 450000, clientId: 32, representativeId: 7 });
  assert.deepEqual(withholdingPreview(publicHours, context), { grossCents: 450000, withheldCents: 44100, netCents: 405900 });
  assert.equal(withholdingPreview(draft({ contractId: 8, hourTypeId: 21, hours: 2 }), context), null);
  const summary = summarizeIncomeDraft(publicHours, context);
  assert.deepEqual(summary?.badges.at(-1), { text: `líquido ${brl(4059)} · retenções de ${brl(441)}`, tone: 'info' });
  // A comissão sai do líquido, como no servidor.
  const commission = commissionPreview(publicHours, context);
  assert.equal(commission.kind === 'rule' ? commission.amountCents : null, 40590);
});

test('categoria fixa preenche o valor vazio e o dia, menos com a data travada', () => {
  const fixed = { id: 4, fixa: { valor: 4500, dia_recebimento: 31 } } as ClassificacaoReceita;
  assert.deepEqual(fixedCategoryPatch(draft({ grossCents: null, receiptDate: '10/02/2026' }), fixed, TODAY, false), {
    grossCents: 450000, receiptDate: '28/02/2026',
  });
  assert.deepEqual(fixedCategoryPatch(draft(), fixed, TODAY, true), {});
  assert.deepEqual(fixedCategoryPatch(draft(), { ...fixed, fixa: null }, TODAY, false), {});
});

test('validação aponta os campos e monta a mensagem do rodapé', () => {
  const empty = validateIncomeDraft(draft({ description: ' ', grossCents: null }), context);
  assert.equal(incomeErrorMessage(empty), 'Preencha descrição e valor bruto.');

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
    description: 'Consultoria', categoryId: 4, grossAmount: 1500, netAmount: 1500, receiptDate: '2026-09-29', clientId: 31,
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
  assert.equal(input.grossAmount, 1500);
  assert.equal(input.netAmount, 1500);
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

test('a categoria é obrigatória: sem ela a receita não vai para a API', () => {
  const noCategory = validateIncomeDraft(draft({ categoryId: null }), context);
  assert.deepEqual(noCategory, { category: true });
  assert.equal(incomeErrorMessage(noCategory), 'Preencha categoria.');

  const empty = validateIncomeDraft(draft({ description: ' ', categoryId: null, grossCents: null }), context);
  assert.equal(incomeErrorMessage(empty), 'Preencha descrição, categoria e valor bruto.');
});

test('o líquido acompanha o bruto até ser editado, e a receita sem desconto envia os dois iguais', () => {
  const semDesconto = draft({ netCents: null });
  assert.equal(effectiveNetCents(semDesconto, context), 150000);
  const input = buildIncomeCreateInput(semDesconto, context, 17);
  assert.equal(input.grossAmount, 1500);
  assert.equal(input.netAmount, 1500);
  // Mudar o bruto leva o líquido junto.
  assert.equal(effectiveNetCents({ ...semDesconto, grossCents: 200000 }, context), 200000);
});

test('líquido menor que o bruto: a diferença são juros e taxas, e o resumo avisa', () => {
  // Empréstimo de R$ 1.000 com taxa de R$ 100: entrou R$ 900.
  const emprestimo = draft({ grossCents: 100000, netCents: 90000 });
  assert.equal(effectiveNetCents(emprestimo, context), 90000);
  const input = buildIncomeCreateInput(emprestimo, context, 17);
  assert.equal(input.grossAmount, 1000);
  assert.equal(input.netAmount, 900);
  assert.deepEqual(summarizeIncomeDraft(emprestimo, context)?.badges.at(-1), {
    text: `entram ${brl(900)} · juros e taxas de ${brl(100)}`, tone: 'info',
  });
  // A comissão sai do líquido.
  const comissao = commissionPreview({ ...emprestimo, representativeId: 7 }, context);
  assert.equal(comissao.kind === 'rule' ? comissao.amountCents : null, 9000);
});

test('líquido maior que o bruto é erro e a mensagem do rodapé explica', () => {
  const acima = validateIncomeDraft(draft({ grossCents: 100000, netCents: 120000 }), context);
  assert.deepEqual(acima, { net: true });
  assert.equal(incomeErrorMessage(acima), 'O valor líquido não pode passar do bruto.');
  assert.deepEqual(validateIncomeDraft(draft({ grossCents: 100000, netCents: 100000 }), context), {});
  assert.deepEqual(validateIncomeDraft(draft({ grossCents: 100000, netCents: 90000 }), context), {});
});

test('contrato com retenção: o líquido é o calculado, ignora o digitado e vai no envio', () => {
  const publicHours = draft({ contractId: 9, hourTypeId: 22, hours: 30, grossCents: 450000, netCents: 450000, clientId: 32 });
  assert.equal(effectiveNetCents(publicHours, context), 405900);
  assert.equal(buildIncomeCreateInput(publicHours, context, 17).netAmount, 4059);
  assert.deepEqual(validateIncomeDraft(publicHours, context), {});
});

test('editar uma receita: bruto e líquido voltam preenchidos, e líquido igual ao bruto continua acompanhando', () => {
  const base: Income = {
    id: 1, descricao: 'Empréstimo', valorLiquido: 900, valorBruto: 1000, data: '2026-09-29', mes: 8, ano: 2026, classificacaoId: 4,
  };
  const comTaxa = incomeDraftFromIncome(base);
  assert.equal(comTaxa.grossCents, 100000);
  assert.equal(comTaxa.netCents, 90000);
  const semTaxa = incomeDraftFromIncome({ ...base, valorLiquido: 1000 });
  assert.equal(semTaxa.grossCents, 100000);
  assert.equal(semTaxa.netCents, null);
});
