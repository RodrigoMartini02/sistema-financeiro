import assert from 'node:assert/strict';
import test from 'node:test';
import type { OpcaoCatalogo } from '../types/config';
import { suggestIncomeClassificationForDescription } from './incomeClassificationSuggestions';

const CATALOGO: OpcaoCatalogo[] = [
  { id: 1, nome: 'Emprego', ativo: true, selectable: false },
  { id: 2, nome: 'Salário', parent_id: 1, ativo: true, selectable: true },
  { id: 3, nome: 'Férias', parent_id: 1, ativo: false, selectable: true },
];

test('sugere a classificação da receita parecida quando ela recebe lançamento', () => {
  const historico = [{ description: 'Salário mensal', categoryId: 2 }];
  assert.equal(suggestIncomeClassificationForDescription('Salário mensal outubro', historico, CATALOGO)?.id, 2);
});

test('não sugere grupo (só o nome das subcategorias) nem classificação desativada', () => {
  assert.equal(suggestIncomeClassificationForDescription('Salário mensal', [{ description: 'Salário mensal', categoryId: 1 }], CATALOGO), null);
  assert.equal(suggestIncomeClassificationForDescription('Férias 2026', [{ description: 'Férias 2026', categoryId: 3 }], CATALOGO), null);
});

test('descrição curta ou sem receita parecida não sugere nada', () => {
  assert.equal(suggestIncomeClassificationForDescription('ab', [{ description: 'ab', categoryId: 2 }], CATALOGO), null);
  assert.equal(suggestIncomeClassificationForDescription('Aluguel', [{ description: 'Salário', categoryId: 2 }], CATALOGO), null);
});
