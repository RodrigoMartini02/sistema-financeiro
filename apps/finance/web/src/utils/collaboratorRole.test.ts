import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogOptions, collaboratorRoleLabel, readCollaboratorWorkFields } from './collaboratorRole';

test('rótulo da linha: cargo e setor, pulando o que faltar', () => {
  assert.equal(collaboratorRoleLabel({ cargo_nome: 'Gerente', setor_nome: 'Financeiro' }), 'Gerente · Financeiro');
  assert.equal(collaboratorRoleLabel({ cargo_nome: null, setor_nome: 'Financeiro' }), 'Financeiro');
  assert.equal(collaboratorRoleLabel({ cargo_nome: 'Gerente', setor_nome: '  ' }), 'Gerente');
  assert.equal(collaboratorRoleLabel({}), '');
});

test('opções: os ativos e o atual mesmo desativado', () => {
  const items = [
    { id: 1, nome: 'Financeiro', ativo: true },
    { id: 2, nome: 'Comercial', ativo: false },
    { id: 3, nome: 'Suporte', ativo: true },
  ];
  assert.deepEqual(catalogOptions(items), [
    { value: 1, label: 'Financeiro' },
    { value: 3, label: 'Suporte' },
  ]);
  assert.deepEqual(catalogOptions(items, 2), [
    { value: 1, label: 'Financeiro' },
    { value: 2, label: 'Comercial (desativado)' },
    { value: 3, label: 'Suporte' },
  ]);
  assert.deepEqual(catalogOptions(items, 3).map((option) => option.value), [1, 3]);
});

test('formulário: campo ausente não muda; vazio limpa; id vira número', () => {
  const empty = new FormData();
  assert.deepEqual(readCollaboratorWorkFields(empty), {});

  const filled = new FormData();
  filled.set('setor_id', '4');
  filled.set('cargo_id', '');
  filled.set('data_admissao', '2025-02-01');
  assert.deepEqual(readCollaboratorWorkFields(filled), { setor_id: 4, cargo_id: null, data_admissao: '2025-02-01' });

  const cleared = new FormData();
  cleared.set('data_admissao', '');
  assert.deepEqual(readCollaboratorWorkFields(cleared), { data_admissao: null });
});
