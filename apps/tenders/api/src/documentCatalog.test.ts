import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DOCUMENT_OWNERS,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  PERSON_ROLES,
  PERSON_ROLE_IDS,
  TENDER_NOTIFICATION_TYPES,
  findDocumentType,
} from './domains';

// Invariantes do catálogo do cofre (item 5): códigos únicos e estáveis (são gravados no banco), dono válido, regras de
// validade coerentes e links só onde o órgão emissor é um só.

test('tipos de documento: códigos únicos, em maiúsculas, e cabem na coluna (30 caracteres)', () => {
  const ids = DOCUMENT_TYPES.map((type) => type.id);
  assert.equal(new Set(ids).size, ids.length, 'códigos repetidos');
  for (const id of ids) {
    assert.match(id, /^[A-Z_]+$/);
    assert.ok(id.length <= 30, `${id} não cabe em documento.tipo`);
  }
  assert.equal(new Set(DOCUMENT_TYPES.map((type) => type.name)).size, DOCUMENT_TYPES.length, 'nomes repetidos');
});

test('tipos de documento: todo dono é válido e existem tipos da empresa e de pessoa', () => {
  for (const type of DOCUMENT_TYPES) {
    assert.ok((DOCUMENT_OWNERS as readonly string[]).includes(type.owner), `${type.id}: dono inválido`);
  }
  assert.ok(DOCUMENT_TYPES.some((type) => type.owner === 'EMPRESA'));
  assert.ok(DOCUMENT_TYPES.some((type) => type.owner === 'PESSOA'));
});

test('tipos de documento: a validade padrão só existe onde a validade é obrigatória, e é um número de dias positivo', () => {
  for (const type of DOCUMENT_TYPES) {
    if (type.defaultValidityDays !== null) {
      assert.ok(type.validityRequired, `${type.id}: tem validade padrão, mas a validade não é obrigatória`);
      assert.ok(Number.isInteger(type.defaultValidityDays) && type.defaultValidityDays > 0, `${type.id}: validade padrão inválida`);
    }
    if (type.validityRequired) {
      assert.notEqual(type.defaultValidityDays, null, `${type.id}: validade obrigatória sem sugestão de prazo`);
    }
  }
});

test('tipos de documento: os genéricos exigem descrição; os que convivem (vários documentos) não substituem o anterior', () => {
  assert.equal(findDocumentType('OUTRO_EMPRESA')?.descriptionRequired, true);
  assert.equal(findDocumentType('OUTRO_PESSOA')?.descriptionRequired, true);
  for (const type of DOCUMENT_TYPES) {
    if (type.descriptionRequired) {
      assert.equal(type.latestOnly, false, `${type.id}: genérico não pode esconder o anterior no histórico`);
    }
  }
  for (const id of ['CERTIDAO_FEDERAL', 'CERTIDAO_ESTADUAL', 'CERTIDAO_MUNICIPAL', 'CERTIDAO_FGTS', 'CERTIDAO_TRABALHISTA', 'CERTIDAO_FALENCIA']) {
    assert.equal(findDocumentType(id)?.latestOnly, true, `${id}: a certidão nova substitui a antiga`);
  }
  for (const id of ['ATESTADO_CAPACIDADE', 'BALANCO_PATRIMONIAL', 'PROCURACAO']) {
    assert.equal(findDocumentType(id)?.latestOnly, false, `${id}: vários convivem`);
  }
});

test('tipos de documento: o site do órgão emissor, quando há, é um endereço https só de tipos da empresa que não são genéricos', () => {
  for (const type of DOCUMENT_TYPES) {
    if (type.issuerUrl !== null) {
      assert.match(type.issuerUrl, /^https:\/\/[a-z0-9.-]+\//, `${type.id}: endereço inválido`);
      assert.equal(type.owner, 'EMPRESA');
      assert.equal(type.descriptionRequired, false);
    }
  }
  // Estadual, municipal e falência variam por estado, município e tribunal: sem endereço único.
  for (const id of ['CERTIDAO_ESTADUAL', 'CERTIDAO_MUNICIPAL', 'CERTIDAO_FALENCIA']) {
    assert.equal(findDocumentType(id)?.issuerUrl, null, `${id}: não há um site único`);
  }
});

test('tipo pelo código: o que existe volta, o que não existe é undefined', () => {
  assert.equal(findDocumentType('CERTIDAO_FGTS')?.name, 'Certificado de regularidade do FGTS');
  assert.equal(findDocumentType('NAO_EXISTE'), undefined);
  assert.equal(findDocumentType(''), undefined);
});

test('papéis da pessoa, situações do documento e avisos de vencimento', () => {
  assert.equal(new Set(PERSON_ROLES.map((role) => role.id)).size, PERSON_ROLES.length);
  assert.deepEqual([...PERSON_ROLE_IDS], PERSON_ROLES.map((role) => role.id));
  assert.deepEqual([...DOCUMENT_STATUSES], ['VALID', 'EXPIRING', 'EXPIRED']);
  assert.ok((TENDER_NOTIFICATION_TYPES as readonly string[]).includes('DOCUMENTO_VENCE_30D'));
  assert.ok((TENDER_NOTIFICATION_TYPES as readonly string[]).includes('DOCUMENTO_VENCE_7D'));
});
