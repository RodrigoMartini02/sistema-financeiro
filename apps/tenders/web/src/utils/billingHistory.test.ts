import assert from 'node:assert/strict';
import test from 'node:test';
import type { BillingEvent } from '../types';
import { eventAmount, eventNote, eventTitle, groupBillingEvents, monthKey, monthLabel, statusView } from './billingHistory';

// O Intl separa "R$" do valor com espaço não separável.
const NBSP = ' ';

function event(overrides: Partial<BillingEvent> = {}): BillingEvent {
  return {
    id: 1, type: 'PAGAMENTO', status: 'APROVADO', method: 'PIX', origin: null, amountCents: 499, users: 2,
    occurredAt: '2026-11-10T12:00:00-03:00',
    ...overrides,
  };
}

test('mês: sai da própria data ISO (sem fuso do navegador) e em português; data ilegível vira "Sem data"', () => {
  assert.equal(monthKey('2026-11-10T12:00:00-03:00'), '2026-11');
  assert.equal(monthLabel('2026-11-10T12:00:00-03:00'), 'novembro de 2026');
  assert.equal(monthLabel('2026-03-01T00:00:00-03:00'), 'março de 2026', 'a meia-noite de Brasília continua no mês, mesmo que em UTC já fosse outro dia');
  assert.equal(monthLabel('2026-12-31T23:59:00-03:00'), 'dezembro de 2026');
  assert.equal(monthLabel('2026-13-01T00:00:00-03:00'), 'Sem data');
  assert.equal(monthLabel('ontem'), 'Sem data');
  assert.equal(monthKey('ontem'), 'sem-data');
});

test('agrupar: um grupo por mês, na ordem em que os eventos chegam, sem trocar a ordem dentro do mês', () => {
  const groups = groupBillingEvents([
    event({ id: 5, occurredAt: '2026-12-02T09:00:00-03:00' }),
    event({ id: 4, occurredAt: '2026-11-30T20:00:00-03:00' }),
    event({ id: 3, occurredAt: '2026-11-10T12:00:00-03:00' }),
    event({ id: 2, occurredAt: '2026-10-10T12:00:00-03:00' }),
  ]);
  assert.deepEqual(
    groups.map((group) => [group.key, group.label, group.events.map((item) => item.id)]),
    [['2026-12', 'dezembro de 2026', [5]], ['2026-11', 'novembro de 2026', [4, 3]], ['2026-10', 'outubro de 2026', [2]]],
  );
  assert.deepEqual(groupBillingEvents([]), []);
});

test('título: o que aconteceu, pelo tipo e pelo meio do pagamento', () => {
  assert.equal(eventTitle({ type: 'PAGAMENTO', method: 'PIX' }), 'Pagamento por Pix');
  assert.equal(eventTitle({ type: 'PAGAMENTO', method: 'CARTAO' }), 'Pagamento no cartão');
  assert.equal(eventTitle({ type: 'PAGAMENTO', method: 'RECORRENTE' }), 'Cobrança mensal da assinatura');
  assert.equal(eventTitle({ type: 'PAGAMENTO', method: null }), 'Pagamento');
  assert.equal(eventTitle({ type: 'ASSINATURA', method: null }), 'Assinatura recorrente ativada');
  assert.equal(eventTitle({ type: 'CANCELAMENTO', method: null }), 'Assinatura recorrente cancelada');
});

test('linha de apoio: origem do cancelamento, ou os usuários cobrados; sem nada a dizer, nada', () => {
  assert.equal(eventNote({ type: 'CANCELAMENTO', origin: 'TITULAR', users: null }), 'Por você');
  assert.equal(eventNote({ type: 'CANCELAMENTO', origin: 'MERCADO_PAGO', users: null }), 'Pelo Mercado Pago');
  assert.equal(eventNote({ type: 'CANCELAMENTO', origin: 'COBRANCA_RECUSADA', users: null }), 'Por cobrança recusada');
  assert.equal(eventNote({ type: 'CANCELAMENTO', origin: null, users: null }), null);
  assert.equal(eventNote({ type: 'CANCELAMENTO', origin: 'OUTRA' as never, users: null }), null, 'origem que a tela não conhece');
  assert.equal(eventNote({ type: 'PAGAMENTO', origin: null, users: 1 }), '1 usuário');
  assert.equal(eventNote({ type: 'ASSINATURA', origin: null, users: 3 }), '3 usuários');
  assert.equal(eventNote({ type: 'PAGAMENTO', origin: null, users: null }), null, 'recusa não tem usuários cobrados');
});

test('valor: em reais; sem valor, nada', () => {
  assert.equal(eventAmount({ amountCents: 499 }), `R$${NBSP}4,99`);
  assert.equal(eventAmount({ amountCents: 798 }), `R$${NBSP}7,98`);
  assert.equal(eventAmount({ amountCents: 0 }), `R$${NBSP}0,00`);
  assert.equal(eventAmount({ amountCents: null }), null);
});

test('selo do status: aprovado e ativada em verde, recusado em vermelho, cancelada em alerta; desconhecido como veio', () => {
  assert.deepEqual(statusView('APROVADO'), { label: 'Aprovado', tone: 'income' });
  assert.deepEqual(statusView('ATIVADA'), { label: 'Ativada', tone: 'income' });
  assert.deepEqual(statusView('RECUSADO'), { label: 'Recusado', tone: 'expense' });
  assert.deepEqual(statusView('CANCELADA'), { label: 'Cancelada', tone: 'warning' });
  assert.deepEqual(statusView('ESTORNADO' as never), { label: 'ESTORNADO', tone: 'neutral' });
});
