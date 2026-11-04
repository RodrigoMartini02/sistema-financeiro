import assert from 'node:assert/strict';
import test from 'node:test';
import type { Paginated } from '../types';
import {
  LIST_PAGE_SIZE,
  flattenPages,
  isInfiniteListData,
  nextPageNumber,
  patchListItems,
  withPaging,
  type InfiniteListData,
} from './infiniteList';

interface Row {
  id: number;
  favorite: boolean;
}

const row = (id: number, favorite = false): Row => ({ id, favorite });
const page = (items: Row[], pageNumber: number, totalPages: number): Paginated<Row> => ({
  items,
  page: pageNumber,
  perPage: LIST_PAGE_SIZE,
  total: 120,
  totalPages,
});
const listData = (pages: Array<Paginated<Row>>): InfiniteListData<Paginated<Row>> => ({
  pages,
  pageParams: pages.map((item) => item.page),
});

test('lista infinita: a próxima página existe enquanto a última não chegou', () => {
  assert.equal(LIST_PAGE_SIZE, 50);
  assert.equal(nextPageNumber({ page: 1, totalPages: 3 }), 2);
  assert.equal(nextPageNumber({ page: 2, totalPages: 3 }), 3);
  assert.equal(nextPageNumber({ page: 3, totalPages: 3 }), undefined, 'a última página');
  assert.equal(nextPageNumber({ page: 1, totalPages: 0 }), undefined, 'lista vazia');
});

test('lista infinita: junta as páginas na ordem e tira o item repetido entre duas páginas', () => {
  const pages = [page([row(1), row(2), row(3)], 1, 2), page([row(3), row(4)], 2, 2)];
  assert.deepEqual(
    flattenPages(pages, (item) => item.id).map((item) => item.id),
    [1, 2, 3, 4],
  );
  assert.deepEqual(flattenPages([], (item: Row) => item.id), []);
});

test('lista infinita: a repetição fica com a primeira ocorrência', () => {
  const first = row(7, true);
  const pages = [page([first], 1, 2), page([row(7, false)], 2, 2)];
  assert.equal(flattenPages(pages, (item) => item.id)[0], first);
});

test('lista infinita: a página e o tamanho entram na consulta por quem pede', () => {
  assert.equal(withPaging('', { page: 2, perPage: 50 }), 'page=2&perPage=50');
  assert.equal(withPaging('q=obra&sort=closingAsc', { page: 3, perPage: LIST_PAGE_SIZE }), 'q=obra&sort=closingAsc&page=3&perPage=50');
  assert.equal(withPaging('q=obra&page=1&perPage=10', { page: 4, perPage: 50 }), 'q=obra&page=4&perPage=50', 'troca a página que já estava');
});

test('lista infinita: só os dados em formato de lista infinita entram no cache atualizado', () => {
  assert.equal(isInfiniteListData(listData([page([row(1)], 1, 1)])), true);
  assert.equal(isInfiniteListData({ pages: [], pageParams: [] }), true);
  assert.equal(isInfiniteListData(undefined), false);
  assert.equal(isInfiniteListData(null), false);
  assert.equal(isInfiniteListData(page([row(1)], 1, 1)), false, 'uma consulta comum, com uma página só');
  assert.equal(isInfiniteListData({ id: 3, procurementObject: 'detalhe' }), false);
  assert.equal(isInfiniteListData({ pages: [{ total: 1 }] }), false);
});

test('lista infinita: muda o item na página certa, sem tocar nas outras', () => {
  const data = listData([page([row(1), row(2)], 1, 2), page([row(3), row(4)], 2, 2)]);
  const next = patchListItems<Row, Paginated<Row>>(data, (item) => item.id === 3, (item) => ({ ...item, favorite: true }));
  assert.notEqual(next, data);
  assert.equal(next.pages[1]?.items[0]?.favorite, true);
  assert.equal(next.pages[0], data.pages[0], 'a página sem o item é a mesma');
  assert.equal(next.pages[1]?.items[1], data.pages[1]?.items[1], 'os outros itens são os mesmos');
  assert.deepEqual(next.pageParams, data.pageParams);
  assert.equal(data.pages[1]?.items[0]?.favorite, false, 'os dados antigos não mudam');
});

test('lista infinita: sem o item na lista, os dados são os mesmos', () => {
  const data = listData([page([row(1)], 1, 1)]);
  assert.equal(
    patchListItems<Row, Paginated<Row>>(data, (item) => item.id === 99, (item) => ({ ...item, favorite: true })),
    data,
  );
});
