import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clientsSummaryCards, daysUntil, expiryLabel, formatHours, formatPercent, incomeStatusView, installmentsLabel,
  isExpiringSoon, termLabel,
} from './contractDisplay';

const TODAY = '2026-10-04';
const nbsp = (text: string) => text.replace(/\u00a0/g, ' ');

test('"vence em N dias" a partir da data final; sem prazo não vence', () => {
  assert.equal(daysUntil('2026-10-24', TODAY), 20);
  assert.equal(expiryLabel('2026-10-24', TODAY), 'Vence em 20 dias');
  assert.equal(expiryLabel('2026-10-05', TODAY), 'Vence amanhã');
  assert.equal(expiryLabel(TODAY, TODAY), 'Vence hoje');
  assert.equal(expiryLabel('2026-10-03', TODAY), 'Venceu ontem');
  assert.equal(expiryLabel('2026-09-30', TODAY), 'Venceu há 4 dias');
  assert.equal(expiryLabel(null, TODAY), null);
});

test('alerta de vencimento: até 60 dias ou vencido, só em contrato ativo', () => {
  assert.equal(isExpiringSoon('ativo', '2026-12-03', TODAY), true);
  assert.equal(isExpiringSoon('ativo', '2026-12-04', TODAY), false);
  assert.equal(isExpiringSoon('ativo', '2026-09-01', TODAY), true);
  assert.equal(isExpiringSoon('ativo', null, TODAY), false);
  assert.equal(isExpiringSoon('encerrado', '2026-10-10', TODAY), false);
});

test('situação da receita: prevista ou faturada vencida aparece atrasada', () => {
  assert.deepEqual(incomeStatusView('prevista', '2026-10-10', TODAY), { label: 'Prevista', tone: 'neutral' });
  assert.deepEqual(incomeStatusView('prevista', '2026-10-03', TODAY), { label: 'Atrasada', tone: 'danger' });
  assert.deepEqual(incomeStatusView('faturada', '2026-10-03', TODAY), { label: 'Faturada, atrasada', tone: 'danger' });
  assert.deepEqual(incomeStatusView('faturada', TODAY, TODAY), { label: 'Faturada', tone: 'info' });
  assert.deepEqual(incomeStatusView('ativa', '2026-09-03', TODAY), { label: 'Recebida', tone: 'success' });
  assert.deepEqual(incomeStatusView('cancelada', '2026-09-03', TODAY), { label: 'Cancelada', tone: 'neutral' });
});

test('vigência, percentuais, horas e parcelas', () => {
  assert.equal(termLabel('2027-01-01', '2027-12-31'), '01/01/2027 a 31/12/2027');
  assert.equal(termLabel('2027-01-01', null), 'Desde 01/01/2027, sem prazo');
  assert.equal(formatPercent(4.8), '4,80%');
  assert.equal(formatHours(12.5), '12,5 h');
  assert.equal(formatHours(40), '40 h');
  assert.equal(nbsp(installmentsLabel({ amount: 1000, installments: 3, firstDate: '2027-01-15' })), '3 parcelas de R$ 333,33 a partir de 15/01/2027');
  assert.equal(nbsp(installmentsLabel({ amount: 500, installments: 1, firstDate: '2027-02-10' })), 'Parcela única a partir de 10/02/2027');
});

test('indicadores do topo: recorrente, vencendo e atrasado, com o tom de cada um', () => {
  const cards = clientsSummaryCards({ monthlyRecurring: 8559, expiringContracts: 1, overdueCount: 2, overdueAmount: 8118 });
  assert.deepEqual(cards.map((card) => [card.label, nbsp(card.value), card.detail, card.tone]), [
    ['Recorrente do mês', 'R$ 8.559,00', 'Mensalidades dos contratos ativos', 'info'],
    ['Vencendo em 60 dias', '1 contrato', 'Renove ou encerre a tempo', 'warn'],
    ['Em atraso', 'R$ 8.118,00', '2 receitas vencidas', 'danger'],
  ]);
  const quiet = clientsSummaryCards({ monthlyRecurring: 0, expiringContracts: 0, overdueCount: 0, overdueAmount: 0 });
  assert.deepEqual(quiet.map((card) => card.tone), ['info', 'neutral', 'neutral']);
  assert.equal(quiet[2]!.detail, 'Nada atrasado');
});
