import assert from 'node:assert/strict';
import test from 'node:test';
import { formatCpf } from '@ui/utils/brazilDocuments';
import type { TeamMember } from '../types';
import {
  EMPTY_TEAM_USER_FORM,
  buildNewTeamUser,
  buildOwnerProfileUpdate,
  buildTeamUserUpdate,
  formValuesFromMember,
  fullName,
  initials,
  ownerFormValuesFrom,
  validateOwnerForm,
  validateTeamUserForm,
  workTitle,
} from './teamMembers';

const lists = {
  memberSectors: [{ id: 'financeiro', name: 'Financeiro' }, { id: 'recursos-humanos', name: 'Recursos Humanos' }],
  memberJobTitles: [{ id: 'gerente', name: 'Gerente' }],
};

const member: TeamMember = {
  userId: 7,
  name: 'Maria',
  lastName: 'Souza',
  email: 'maria@exemplo.test',
  document: '52998224725',
  phone: '(11) 99999-0000',
  sector: 'financeiro',
  jobTitle: 'gerente',
  admissionDate: '2025-02-01',
  hasAccess: true,
  grantedAt: null,
  photoUrl: null,
};

test('iniciais: duas letras de dois nomes, ou as duas primeiras de um só; vazio vira U', () => {
  assert.equal(initials('Maria Souza'), 'MS');
  assert.equal(initials('  ana   paula   lima '), 'AP');
  assert.equal(initials('Rodrigo'), 'RO');
  assert.equal(initials('   '), 'U');
});

test('nome completo junta nome e sobrenome sem espaço sobrando', () => {
  assert.equal(fullName({ name: 'Maria', lastName: 'Souza' }), 'Maria Souza');
  assert.equal(fullName({ name: 'Maria', lastName: null }), 'Maria');
  assert.equal(fullName({ name: 'Maria', lastName: '  ' }), 'Maria');
});

test('cargo completo: "Cargo · Setor", só um dos dois, nenhum; lista carregando não mostra o código', () => {
  assert.equal(workTitle(member, lists), 'Gerente · Financeiro');
  assert.equal(workTitle({ jobTitle: null, sector: 'recursos-humanos' }, lists), 'Recursos Humanos');
  assert.equal(workTitle({ jobTitle: 'gerente', sector: null }, lists), 'Gerente');
  assert.equal(workTitle({ jobTitle: null, sector: null }, lists), null);
  assert.equal(workTitle(member, undefined), null, 'sem a lista, nada (não aparece o código)');
  assert.equal(workTitle({ jobTitle: 'cargo-antigo', sector: null }, lists), 'cargo-antigo', 'código fora da lista aparece como está');
});

test('formulário de edição parte do usuário, com o CPF formatado', () => {
  assert.deepEqual(formValuesFromMember(member, formatCpf), {
    name: 'Maria',
    lastName: 'Souza',
    email: 'maria@exemplo.test',
    document: '529.982.247-25',
    phone: '(11) 99999-0000',
    sector: 'financeiro',
    jobTitle: 'gerente',
    admissionDate: '2025-02-01',
    password: '',
  });
  assert.deepEqual(
    formValuesFromMember({ ...member, lastName: null, document: null, phone: null, sector: null, jobTitle: null, admissionDate: null }, formatCpf),
    { ...EMPTY_TEAM_USER_FORM, name: 'Maria', email: 'maria@exemplo.test' },
  );
});

test('validação do cadastro: nome, e-mail e senha obrigatórios; CPF opcional, mas válido', () => {
  assert.deepEqual(validateTeamUserForm(EMPTY_TEAM_USER_FORM, 'create'), {
    name: 'Informe o nome',
    email: 'Informe um e-mail válido',
    password: 'Pelo menos 8 caracteres',
  });
  const ok = { ...EMPTY_TEAM_USER_FORM, name: 'Ana', email: 'ana@exemplo.test', password: 'senha-forte-1' };
  assert.deepEqual(validateTeamUserForm(ok, 'create'), {});
  assert.deepEqual(validateTeamUserForm({ ...ok, document: '529.982.247-25' }, 'create'), {});
  assert.deepEqual(validateTeamUserForm({ ...ok, document: '123.456.789-00' }, 'create'), { document: 'Informe um CPF válido' });
  assert.deepEqual(validateTeamUserForm({ ...ok, password: '1234567' }, 'create'), { password: 'Pelo menos 8 caracteres' });
});

test('validação da edição: senha só vale se preenchida', () => {
  const edit = { ...EMPTY_TEAM_USER_FORM, name: 'Ana', email: 'ana@exemplo.test' };
  assert.deepEqual(validateTeamUserForm(edit, 'edit'), {});
  assert.deepEqual(validateTeamUserForm({ ...edit, password: 'curta' }, 'edit'), { password: 'Pelo menos 8 caracteres' });
  assert.deepEqual(validateTeamUserForm({ ...edit, password: 'senha-forte-1' }, 'edit'), {});
  assert.deepEqual(validateTeamUserForm({ ...edit, name: ' ', email: 'x' }, 'edit'), {
    name: 'Informe o nome',
    email: 'Informe um e-mail válido',
  });
});

test('cadastro: apara os textos, deixa o CPF só com dígitos e não manda o que ficou em branco', () => {
  const body = buildNewTeamUser({
    ...EMPTY_TEAM_USER_FORM,
    name: ' Ana ',
    lastName: '  ',
    email: ' ana@exemplo.test ',
    document: '529.982.247-25',
    phone: ' (11) 99999-0000 ',
    sector: 'ti',
    password: 'senha-forte-1',
  });
  assert.deepEqual(body, {
    name: 'Ana',
    lastName: undefined,
    email: 'ana@exemplo.test',
    password: 'senha-forte-1',
    document: '52998224725',
    phone: '(11) 99999-0000',
    sector: 'ti',
    jobTitle: undefined,
    admissionDate: undefined,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(body)), {
    name: 'Ana', email: 'ana@exemplo.test', password: 'senha-forte-1', document: '52998224725', phone: '(11) 99999-0000', sector: 'ti',
  });
});

test('edição: manda todos os campos (vazio limpa) e a senha só se foi preenchida', () => {
  const values = formValuesFromMember({ ...member, lastName: null, sector: null }, formatCpf);
  assert.deepEqual(buildTeamUserUpdate(values), {
    name: 'Maria',
    lastName: '',
    email: 'maria@exemplo.test',
    document: '52998224725',
    phone: '(11) 99999-0000',
    sector: '',
    jobTitle: 'gerente',
    admissionDate: '2025-02-01',
  });
  assert.equal(buildTeamUserUpdate({ ...values, password: 'nova-senha-1' }).newPassword, 'nova-senha-1');
  assert.equal('newPassword' in buildTeamUserUpdate(values), false);
  assert.equal(buildTeamUserUpdate({ ...values, document: '' }).document, '', 'CPF apagado limpa o CPF');
});

test('perfil do titular: formulário, validação e corpo (vazio limpa sobrenome e telefone)', () => {
  const values = ownerFormValuesFrom({ userId: 1, name: 'Rita', lastName: null, email: 'rita@exemplo.test', phone: null, photoUrl: null });
  assert.deepEqual(values, { name: 'Rita', lastName: '', phone: '' });
  assert.deepEqual(validateOwnerForm(values), {});
  assert.deepEqual(validateOwnerForm({ ...values, name: '  ' }), { name: 'Informe o nome' });
  assert.deepEqual(buildOwnerProfileUpdate({ name: ' Rita ', lastName: ' Lima ', phone: '' }), { name: 'Rita', lastName: 'Lima', phone: '' });
});
