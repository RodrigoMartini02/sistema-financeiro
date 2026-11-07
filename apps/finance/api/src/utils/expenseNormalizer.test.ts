import assert from 'node:assert/strict';
import test from 'node:test';
import { PERSONAL_DEFAULT_CATEGORIES } from '../services/defaultCategories';
import { CATEGORY_KEYWORDS, inferCategory } from './expenseNormalizer';

test('toda sugestão por palavra é uma subcategoria do catálogo padrão PF (nunca um grupo nem "Outros")', () => {
  const subcategories = new Set(PERSONAL_DEFAULT_CATEGORIES.flatMap((item) => item.subcategories));
  for (const name of Object.keys(CATEGORY_KEYWORDS)) {
    assert.ok(subcategories.has(name), `"${name}" não é subcategoria do catálogo padrão`);
    assert.ok(!name.startsWith('Outros'), `"${name}" é um "Outros"`);
  }
});

test('sem palavra que case, não há sugestão: quem escolhe é o usuário', () => {
  assert.equal(inferCategory(''), null);
  assert.equal(inferCategory('xyz qualquer coisa'), null);
});

test('a palavra mais específica vence', () => {
  assert.equal(inferCategory('Uber Eats pedido'), 'Delivery');
  assert.equal(inferCategory('Uber centro'), 'Aplicativo e Táxi');
  assert.equal(inferCategory('Mercado Livre fone'), 'Compras Online');
  assert.equal(inferCategory('Mercado Angeloni'), 'Mercado');
  assert.equal(inferCategory('Amazon Prime mensal'), 'Streaming de Vídeo');
  assert.equal(inferCategory('Gasolina posto'), 'Combustível');
});

test('exemplos de cada grupo caem na subcategoria certa', () => {
  assert.equal(inferCategory('Aluguel outubro'), 'Aluguel');
  assert.equal(inferCategory('Conta de luz'), 'Energia');
  assert.equal(inferCategory('Farmácia Panvel'), 'Farmácia');
  assert.equal(inferCategory('Academia'), 'Academia');
  assert.equal(inferCategory('Curso de inglês'), 'Cursos');
  assert.equal(inferCategory('Cinema'), 'Eventos e Passeios');
  assert.equal(inferCategory('Camisa nova'), 'Roupas e Calçados');
});
