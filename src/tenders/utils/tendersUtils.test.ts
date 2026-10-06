import assert from 'node:assert/strict';
import test from 'node:test';
import { NETWORK_ERROR_MESSAGE, tendersErrorFrom } from '../services/tendersApiError';
import { resolveGateState } from './gateState';
import { loggedUserName } from './loggedUser';
import { appAddressFor } from './modulePaths';
import { NOT_FOUND_TITLE, canOpenSettings, menuRoutes, quickSearchPath, routeForPath } from './navigation';

const address = (pathname: string, search = '', hash = '') => ({ pathname, search, hash });

test('/licitacoes abre o sistema em /licitacoes/app, mantendo query e hash', () => {
  assert.equal(appAddressFor(address('/licitacoes')), '/licitacoes/app');
  assert.equal(appAddressFor(address('/licitacoes/')), '/licitacoes/app');
  assert.equal(appAddressFor(address('/licitacoes', '?origem=site', '#topo')), '/licitacoes/app?origem=site#topo');
  assert.equal(appAddressFor(address('/licitacoes/qualquer')), '/licitacoes/app', 'outro caminho do módulo também vai para o sistema');
});

test('dentro do sistema o endereço não muda', () => {
  assert.equal(appAddressFor(address('/licitacoes/app')), null);
  assert.equal(appAddressFor(address('/licitacoes/app/')), null);
  assert.equal(appAddressFor(address('/licitacoes/app/editais/12', '?aba=itens')), null);
  assert.equal(appAddressFor(address('/licitacoesx')), null);
});

test('entrada no módulo: cada situação de sessão e de /access', () => {
  assert.equal(resolveGateState({ hasToken: false, accessStatus: 'pending', errorStatus: null }), 'login');
  assert.equal(resolveGateState({ hasToken: true, accessStatus: 'pending', errorStatus: null }), 'loading');
  assert.equal(resolveGateState({ hasToken: true, accessStatus: 'success', errorStatus: null }), 'ready');
  assert.equal(resolveGateState({ hasToken: true, accessStatus: 'error', errorStatus: 401 }), 'login');
  assert.equal(resolveGateState({ hasToken: true, accessStatus: 'error', errorStatus: 404 }), 'noModule');
  assert.equal(resolveGateState({ hasToken: true, accessStatus: 'error', errorStatus: 403 }), 'memberWithoutAccess');
  assert.equal(resolveGateState({ hasToken: true, accessStatus: 'error', errorStatus: 500 }), 'error');
  assert.equal(resolveGateState({ hasToken: true, accessStatus: 'error', errorStatus: 0 }), 'error');
});

test('menu: Configurações só para quem administra o módulo', () => {
  const titular = { manageTeam: true, viewCollectionRuns: true };
  const admin = { manageTeam: false, viewCollectionRuns: true };
  const colaborador = { manageTeam: false, viewCollectionRuns: false };
  assert.deepEqual(menuRoutes(titular).map((route) => route.key), [
    'inicio',
    'buscar',
    'buscas',
    'acompanhamento',
    'notificacoes',
    'configuracoes',
  ]);
  assert.equal(canOpenSettings(admin), true);
  assert.equal(menuRoutes(colaborador).some((route) => route.key === 'configuracoes'), false);
  assert.equal(menuRoutes(colaborador).some((route) => route.key === 'edital'), false, 'o edital abre pela lista');
});

test('título da barra pela rota; rota desconhecida não tem título de menu', () => {
  assert.equal(routeForPath('/')?.title, 'Início');
  assert.equal(routeForPath('/buscar')?.title, 'Buscar');
  assert.equal(routeForPath('/buscar/')?.title, 'Buscar');
  assert.equal(routeForPath('/editais/123')?.title, 'Edital');
  assert.equal(routeForPath('/nao-existe'), null);
  assert.equal(NOT_FOUND_TITLE, 'Página não encontrada');
});

test('busca rápida leva para Buscar com o texto; vazio não navega', () => {
  assert.equal(quickSearchPath('  software de gestão  '), '/buscar?q=software%20de%20gest%C3%A3o');
  assert.equal(quickSearchPath('   '), null);
});

test('nome de quem está logado, gravado pelo login; ausente ou ilegível vira "Usuário"', () => {
  assert.equal(loggedUserName(JSON.stringify({ nome: 'Rodrigo', sobrenome: 'Martini' })), 'Rodrigo Martini');
  assert.equal(loggedUserName(JSON.stringify({ nome: 'Ana' })), 'Ana');
  assert.equal(loggedUserName(null), 'Usuário');
  assert.equal(loggedUserName('{quebrado'), 'Usuário');
});

test('erro da API: mensagem da resposta ou a genérica, com o status', () => {
  const fromApi = tendersErrorFrom(403, { success: false, message: 'Seu acesso ainda não foi liberado.' });
  assert.equal(fromApi.status, 403);
  assert.equal(fromApi.message, 'Seu acesso ainda não foi liberado.');
  const withoutMessage = tendersErrorFrom(502, 'html de erro');
  assert.equal(withoutMessage.status, 502);
  assert.equal(withoutMessage.message, NETWORK_ERROR_MESSAGE);
  assert.deepEqual(withoutMessage.fieldErrors, []);
});

test('erro da API: validação de formato (400) traz os campos e a mensagem do primeiro', () => {
  const error = tendersErrorFrom(400, {
    success: false,
    message: 'Validation error',
    errors: [
      { field: 'name', message: 'Nome obrigatório, com até 120 caracteres' },
      { field: 'states[0]', message: 'UF inválida' },
      { campo: 'ignorado' },
    ],
  });
  assert.equal(error.status, 400);
  assert.equal(error.message, 'Nome obrigatório, com até 120 caracteres');
  assert.deepEqual(error.fieldErrors, [
    { field: 'name', message: 'Nome obrigatório, com até 120 caracteres' },
    { field: 'states[0]', message: 'UF inválida' },
  ]);
  const rule = tendersErrorFrom(400, { success: false, message: 'Informe ao menos um critério além do nome.' });
  assert.equal(rule.message, 'Informe ao menos um critério além do nome.');
});
