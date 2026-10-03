import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConfigItemId } from '../layout/ConfigPanel';
import { PERMISSION_FLAGS, type PermissionFlag } from '../types/permissions';
import {
  allowedAssistantIntents, canManageCatalog, canReadCatalogList, dashboardEntries, isAnalyticsViewer, isConfigItemVisible,
  movementControls, resolveSection, visibleSections, type CatalogName, type ConfigItemContext, type PermissionSet,
} from './screenAccess';

const ALL: PermissionSet = Object.fromEntries(PERMISSION_FLAGS.map((flag) => [flag, true]));
const only = (...flags: PermissionFlag[]): PermissionSet => Object.fromEntries(flags.map((flag) => [flag, true]));

const CONFIG_ITEMS: ConfigItemId[] = [
  'contas', 'assinatura', 'categorias', 'classificacoes-receita', 'cartoes', 'servicos', 'catalogo',
  'representantes', 'permissoes', 'acessos', 'integracoes-ia',
];
const owner = (accountType: ConfigItemContext['accountType']): ConfigItemContext => ({
  isOwner: true, isAdmin: false, canViewAnalytics: false, accountType,
});
const member = (accountType: ConfigItemContext['accountType']): ConfigItemContext => ({
  isOwner: false, isAdmin: false, canViewAnalytics: false, accountType,
});
const visibleItems = (permissions: PermissionSet, context: ConfigItemContext) =>
  CONFIG_ITEMS.filter((item) => isConfigItemVisible(item, permissions, context));

test('menu: cada seção com a sua permissão; Clientes só fora da conta pessoal', () => {
  assert.deepEqual(visibleSections(ALL, 'empresa'), ['painel', 'movimentacoes', 'reports', 'clientes']);
  assert.deepEqual(visibleSections(ALL, 'pessoal'), ['painel', 'movimentacoes', 'reports']);
  assert.deepEqual(visibleSections(only('accessExpenses'), 'pessoal'), ['movimentacoes']);
  assert.deepEqual(visibleSections(only('accessIncomes', 'accessClients'), 'empresa'), ['movimentacoes', 'clientes']);
  assert.deepEqual(visibleSections(only('accessDashboard', 'accessReports'), 'empresa'), ['painel', 'reports']);
  assert.deepEqual(visibleSections({}, 'empresa'), []);
});

test('tela mostrada: a escolhida se liberada; senão Movimentações; senão a primeira; null sem nenhuma', () => {
  assert.equal(resolveSection('reports', ['painel', 'movimentacoes', 'reports']), 'reports');
  assert.equal(resolveSection('painel', ['movimentacoes', 'reports']), 'movimentacoes');
  assert.equal(resolveSection('movimentacoes', ['painel', 'reports']), 'painel');
  assert.equal(resolveSection('movimentacoes', []), null);
});

test('Movimentações: botões, calendário, Planejamento e o que buscar', () => {
  assert.deepEqual(movementControls(ALL), { newExpense: true, newIncome: true, calendar: true, planning: true });
  assert.deepEqual(movementControls(only('accessExpenses')), { newExpense: true, newIncome: false, calendar: false, planning: false });
  assert.equal(dashboardEntries(ALL), 'all');
  assert.equal(dashboardEntries(only('accessExpenses')), 'expenses');
  assert.equal(dashboardEntries(only('accessIncomes')), 'incomes');
  assert.equal(dashboardEntries(only('accessCalendar')), null);
});

test('Configurações do titular: tudo da conta empresa; na pessoal sem os itens de empresa', () => {
  assert.deepEqual(visibleItems(ALL, owner('empresa')), [
    'contas', 'assinatura', 'categorias', 'classificacoes-receita', 'cartoes', 'servicos', 'catalogo',
    'representantes', 'permissoes',
  ]);
  assert.deepEqual(visibleItems(ALL, owner('pessoal')), [
    'contas', 'assinatura', 'categorias', 'classificacoes-receita', 'cartoes', 'permissoes',
  ]);
  assert.ok(isConfigItemVisible('acessos', ALL, { ...owner('pessoal'), canViewAnalytics: true }));
  assert.ok(isConfigItemVisible('integracoes-ia', ALL, { ...owner('pessoal'), isAdmin: true }));
});

test('aba Acessos: o CPF liberado só vale para admin', () => {
  assert.equal(isAnalyticsViewer({ tipo: 'admin', documento: '089.964.419-88' }), true);
  assert.equal(isAnalyticsViewer({ tipo: 'membro', documento: '08996441988' }), false);
  assert.equal(isAnalyticsViewer({ tipo: 'titular', documento: '08996441988' }), false);
  assert.equal(isAnalyticsViewer({ tipo: 'admin', documento: '52998224725' }), false);
  assert.equal(isAnalyticsViewer(undefined), false);
});

test('Configurações do membro: cada item com a sua permissão, nunca assinatura nem permissões', () => {
  assert.deepEqual(visibleItems(ALL, member('empresa')), [
    'contas', 'categorias', 'classificacoes-receita', 'cartoes', 'servicos', 'catalogo', 'representantes',
  ]);
  assert.deepEqual(visibleItems(only('accessCards'), member('pessoal')), ['cartoes']);
  assert.deepEqual(visibleItems(only('accessRepresentatives'), member('pessoal')), []);
  assert.deepEqual(visibleItems(only('accessExpenses', 'accessIncomes'), member('empresa')), []);
});

test('listas: o cadastro libera ler e gerenciar; quem lança só lê o que usa', () => {
  const catalogs: CatalogName[] = [
    'accounts', 'expenseCategories', 'incomeCategories', 'cards', 'clients', 'contracts', 'representatives', 'services', 'products',
  ];
  for (const catalog of catalogs) {
    assert.ok(canReadCatalogList(ALL, catalog), catalog);
    assert.ok(canManageCatalog(ALL, catalog), catalog);
  }

  const expenses = only('accessExpenses');
  assert.ok(canReadCatalogList(expenses, 'expenseCategories'));
  assert.ok(canReadCatalogList(expenses, 'cards'));
  assert.equal(canManageCatalog(expenses, 'expenseCategories'), false);
  assert.equal(canReadCatalogList(expenses, 'clients'), false);

  const incomes = only('accessIncomes');
  for (const catalog of ['incomeCategories', 'clients', 'contracts', 'representatives', 'products'] as const) {
    assert.ok(canReadCatalogList(incomes, catalog), catalog);
    assert.equal(canManageCatalog(incomes, catalog), false, catalog);
  }
  assert.equal(canReadCatalogList(incomes, 'cards'), false);

  const contracts = only('accessContracts');
  for (const catalog of ['incomeCategories', 'representatives', 'services'] as const) {
    assert.ok(canReadCatalogList(contracts, catalog), catalog);
  }
  assert.ok(canReadCatalogList(only('accessRepresentatives'), 'incomeCategories'));

  assert.ok(canReadCatalogList({}, 'accounts'));
  assert.equal(canReadCatalogList({}, 'expenseCategories'), false);
});

test('assistente: lançar e pagar despesa, lançar receita só com a permissão; perguntar sempre', () => {
  assert.deepEqual(allowedAssistantIntents(ALL), ['register_expense', 'pay_expense', 'register_income', 'ask']);
  assert.deepEqual(allowedAssistantIntents(only('accessExpenses')), ['register_expense', 'pay_expense', 'ask']);
  assert.deepEqual(allowedAssistantIntents(only('accessIncomes')), ['register_income', 'ask']);
  assert.deepEqual(allowedAssistantIntents({}), ['ask']);
});
