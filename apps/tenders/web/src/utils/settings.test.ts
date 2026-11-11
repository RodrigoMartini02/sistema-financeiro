import assert from 'node:assert/strict';
import test from 'node:test';
import type { TendersPermissions } from './navigation';
import {
  groupSettingsItems,
  readSettingsRequest,
  resolveSettingsItem,
  settingsRouteTarget,
  visibleSettingsItems,
  withSettingsParam,
} from './settings';

const titular: TendersPermissions = { manageTeam: true, manageCompany: true, manageBilling: true, manageVaultPeople: true, viewCollectionRuns: true, manageEnabledAccounts: false };
const platformAdmin: TendersPermissions = { manageTeam: false, manageCompany: false, manageBilling: false, manageVaultPeople: false, viewCollectionRuns: true, manageEnabledAccounts: true };
const colaborador: TendersPermissions = { manageTeam: false, manageCompany: false, manageBilling: false, manageVaultPeople: false, viewCollectionRuns: false, manageEnabledAccounts: false };

test('seções: o titular vê Perfil, Usuários, Assinatura e Coleta; o admin só a Coleta; o colaborador, nenhuma', () => {
  assert.deepEqual(visibleSettingsItems(titular).map((item) => item.id), ['perfil', 'usuarios', 'assinatura', 'coleta']);
  assert.deepEqual(visibleSettingsItems(platformAdmin).map((item) => item.id), ['coleta']);
  assert.deepEqual(visibleSettingsItems(colaborador), []);
});

test('o Perfil some quando a API não manda a permissão (API antiga na janela do deploy); o resto segue', () => {
  const { manageCompany: _omitted, ...oldApi } = titular;
  assert.deepEqual(
    visibleSettingsItems(oldApi as unknown as TendersPermissions).map((item) => item.id),
    ['usuarios', 'assinatura', 'coleta'],
  );
});

test('menu do modal: seções agrupadas na ordem dos grupos; grupo sem seção visível some', () => {
  assert.deepEqual(
    groupSettingsItems(visibleSettingsItems(titular)).map((entry) => [entry.group, entry.items.map((item) => item.label)]),
    [['Empresa', ['Perfil', 'Usuários']], ['Conta', ['Assinatura']], ['Avançado', ['Coleta']]],
  );
  assert.deepEqual(groupSettingsItems(visibleSettingsItems(platformAdmin)).map((entry) => entry.group), ['Avançado']);
  assert.deepEqual(groupSettingsItems([]), []);
});

test('URL: o modal abre só com um código conhecido em ?config=', () => {
  assert.equal(readSettingsRequest('?config=perfil'), 'perfil');
  assert.equal(readSettingsRequest('?config=usuarios'), 'usuarios');
  assert.equal(readSettingsRequest('?q=obra&config=assinatura&x=1'), 'assinatura');
  assert.equal(readSettingsRequest('?config=coleta'), 'coleta');
  assert.equal(readSettingsRequest(''), null);
  assert.equal(readSettingsRequest('?config='), null);
  assert.equal(readSettingsRequest('?config=outra-coisa'), null);
  assert.equal(readSettingsRequest('?edital=7'), null);
});

test('seção que abre: a pedida se a pessoa a vê; senão a primeira visível; sem nenhuma, não abre', () => {
  const visible = visibleSettingsItems(titular);
  assert.equal(resolveSettingsItem('assinatura', visible), 'assinatura');
  assert.equal(resolveSettingsItem('perfil', visible), 'perfil');
  assert.equal(resolveSettingsItem(null, visible), 'perfil', 'sem pedido, abre no Perfil');
  const adminVisible = visibleSettingsItems(platformAdmin);
  assert.equal(resolveSettingsItem('usuarios', adminVisible), 'coleta', 'o admin pediu o que não vê: cai na Coleta');
  assert.equal(resolveSettingsItem('perfil', adminVisible), 'coleta');
  assert.equal(resolveSettingsItem('usuarios', visibleSettingsItems(colaborador)), null);
});

test('URL: põe e tira o parâmetro do modal sem perder os outros filtros da página', () => {
  assert.equal(withSettingsParam('', 'usuarios'), '?config=usuarios');
  assert.equal(withSettingsParam('', 'perfil'), '?config=perfil');
  assert.equal(withSettingsParam('?q=obra&uf=SP', 'assinatura'), '?q=obra&uf=SP&config=assinatura');
  assert.equal(withSettingsParam('?q=obra&config=usuarios', 'coleta'), '?q=obra&config=coleta', 'trocar de seção troca o valor');
  assert.equal(withSettingsParam('?q=obra&config=usuarios', null), '?q=obra');
  assert.equal(withSettingsParam('?config=usuarios', null), '');
  assert.equal(withSettingsParam('', null), '');
});

test('retorno da cobrança (/configuracoes): início com o modal na Assinatura; sem ela, na primeira seção; sem acesso, só o início', () => {
  assert.deepEqual(settingsRouteTarget(titular), { pathname: '/', search: '?config=assinatura' });
  assert.deepEqual(settingsRouteTarget(platformAdmin), { pathname: '/', search: '?config=coleta' });
  assert.deepEqual(settingsRouteTarget(colaborador), { pathname: '/', search: '' });
});
