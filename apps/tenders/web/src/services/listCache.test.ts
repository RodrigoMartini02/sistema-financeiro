import assert from 'node:assert/strict';
import test from 'node:test';
import { listDependsOnFavorites, listDependsOnTracking } from './listCache';
import { isInfiniteListKey, tendersQueryKeys } from './queryKeys';

test('cache das listas: só a chave de lista infinita tem o marcador, dentro do grupo de editais ou de contratos', () => {
  assert.equal(isInfiniteListKey(tendersQueryKeys.noticeInfiniteList('sort=closingAsc')), true);
  assert.equal(isInfiniteListKey(tendersQueryKeys.contractInfiniteList('sort=expiryAsc')), true);
  assert.equal(isInfiniteListKey(tendersQueryKeys.noticeSearch('sort=closingAsc')), false);
  assert.equal(isInfiniteListKey(tendersQueryKeys.contractSearch('sort=expiryAsc')), false);
  assert.equal(isInfiniteListKey(tendersQueryKeys.notice(7)), false);
  assert.equal(isInfiniteListKey(tendersQueryKeys.cnpjWinners('22493902000140')), false);
  assert.equal(isInfiniteListKey(tendersQueryKeys.notificationList('perPage=10')), false, 'a lista curta do sino');

  const [root, group] = tendersQueryKeys.noticeInfiniteList('x');
  assert.deepEqual([root, group], [tendersQueryKeys.notices[0], tendersQueryKeys.notices[1]], 'dentro do grupo, para a troca de conta invalidar');
  assert.deepEqual(tendersQueryKeys.noticeInfiniteList('x').slice(0, 3), [...tendersQueryKeys.noticeInfiniteLists]);
  assert.deepEqual(tendersQueryKeys.contractInfiniteList('x').slice(0, 3), [...tendersQueryKeys.contractInfiniteLists]);
});

test('cache das listas: o favorito só muda a posição dos itens nas listas só de favoritos', () => {
  assert.equal(listDependsOnFavorites('favoritesOnly=true&sort=closingAsc'), true);
  assert.equal(listDependsOnFavorites('q=obra&favoritesOnly=true'), true);
  assert.equal(listDependsOnFavorites('q=obra&sort=closingAsc'), false);
  assert.equal(listDependsOnFavorites('favoritesOnly=false'), false);
});

test('cache das listas: o acompanhamento só muda a posição dos itens nas listas filtradas por ele', () => {
  assert.equal(listDependsOnTracking('trackingStatus=ANALISAR&sort=closingAsc'), true);
  assert.equal(listDependsOnTracking('trackingStatus=SEM'), true);
  assert.equal(listDependsOnTracking('hideDiscarded=true&sort=closingAsc'), false, 'esconder descartados não filtra pelo acompanhamento');
});
