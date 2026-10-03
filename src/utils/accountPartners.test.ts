import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_PARTNERS_PER_ACCOUNT, buildPartnersPayload, formatIsoDateBR, newPartnerRow, partnerRowFromApi,
  partnersTotals, parsePercentInput, validatePartnerRows, type PartnerRow,
} from './accountPartners';

function row(overrides: Partial<PartnerRow> = {}): PartnerRow {
  return { ...newPartnerRow(), nome: 'Ana', percentual: '100', ...overrides };
}

test('participação digitada com vírgula ou ponto', () => {
  assert.equal(parsePercentInput('33,33'), 33.33);
  assert.equal(parsePercentInput(' 60 '), 60);
  assert.equal(parsePercentInput('12.5'), 12.5);
  assert.ok(Number.isNaN(parsePercentInput('')));
  assert.ok(Number.isNaN(parsePercentInput('dez')));
  assert.ok(Number.isNaN(parsePercentInput('-5')));
});

test('totais somam em centésimos: 33,33 + 33,33 + 33,34 dá 100%', () => {
  const rows = [
    row({ percentual: '33,33', capital: 1000 }),
    row({ nome: 'Bia', percentual: '33,33', capital: 2000.1 }),
    row({ nome: 'Caio', percentual: '33,34', capital: undefined }),
  ];
  assert.deepEqual(partnersTotals(rows), { percentHundredths: 10_000, capital: 3000.1 });
  assert.equal(validatePartnerRows(rows), null);
});

test('conferência: as mesmas regras e textos do servidor', () => {
  assert.equal(validatePartnerRows([]), null);
  assert.equal(validatePartnerRows([row({ nome: '  ' })]), 'Informe o nome do sócio');
  assert.equal(validatePartnerRows([row({ nome: 'x'.repeat(101) })]), 'Nome do sócio: até 100 caracteres');
  assert.equal(validatePartnerRows([row({ percentual: '0' })]), 'Participação de Ana: de 0,01% a 100%');
  assert.equal(validatePartnerRows([row({ percentual: '' })]), 'Participação de Ana: de 0,01% a 100%');
  assert.equal(validatePartnerRows([row({ percentual: '90' })]), 'A soma das participações precisa dar 100%');
  assert.equal(validatePartnerRows([row({ launchAsIncome: true })]), 'Informe o capital de Ana para lançar como receita');
  assert.equal(validatePartnerRows([row({ capital: 100_000_000 })]), 'Capital de Ana inválido');
  const tooMany = Array.from({ length: MAX_PARTNERS_PER_ACCOUNT + 1 }, () => row({ percentual: '1' }));
  assert.equal(validatePartnerRows(tooMany), `Até ${MAX_PARTNERS_PER_ACCOUNT} sócios por conta`);
});

test('capital já lançado não é conferido nem lançado de novo', () => {
  const launched = row({ id: 4, capital: 6000, launched: true, launchedAt: '2026-01-10', launchAsIncome: true });
  assert.equal(validatePartnerRows([launched]), null);
  assert.deepEqual(buildPartnersPayload([launched]), [
    { id: 4, nome: 'Ana', percentual: 100, capital_inicial: 6000, lancar_como_receita: false },
  ]);
});

test('pedido: sócio novo sem id, existente com id, participação com 2 casas', () => {
  const payload = buildPartnersPayload([
    row({ id: 9, nome: ' Ana ', percentual: '60', capital: 6000, launchAsIncome: true }),
    row({ nome: 'Bia', percentual: '39,999' }),
  ]);
  assert.deepEqual(payload, [
    { id: 9, nome: 'Ana', percentual: 60, capital_inicial: 6000, lancar_como_receita: true },
    { nome: 'Bia', percentual: 40, capital_inicial: 0, lancar_como_receita: false },
  ]);
});

test('linha a partir do servidor: capital lido da receita e travado depois do lançamento', () => {
  const launched = partnerRowFromApi({
    id: 3, nome: 'Ana', percentual: '60.00', capital_inicial: '6500.00', capital_lancado: true, capital_lancado_em: '2026-01-10',
  });
  assert.equal(launched.percentual, '60');
  assert.equal(launched.capital, 6500);
  assert.equal(launched.launched, true);
  assert.equal(launched.launchedAt, '2026-01-10');

  const open = partnerRowFromApi({
    id: 5, nome: 'Bia', percentual: '33.33', capital_inicial: '0.00', capital_lancado: false, capital_lancado_em: null,
  });
  assert.equal(open.percentual, '33,33');
  assert.equal(open.capital, undefined);
  assert.equal(open.launched, false);
});

test('linhas novas têm chaves diferentes; data sem passar por fuso', () => {
  assert.notEqual(newPartnerRow().key, newPartnerRow().key);
  assert.equal(formatIsoDateBR('2026-01-10'), '10/01/2026');
});
