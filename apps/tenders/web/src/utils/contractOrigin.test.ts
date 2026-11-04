import assert from 'node:assert/strict';
import test from 'node:test';
import { FEDERAL_AMENDMENTS_NOTICE, FEDERAL_EXPIRY_NOTICE, contractOriginView } from './contractOrigin';

test('contrato da base nacional: com o link do documento, o número de controle e sem avisos', () => {
  assert.deepEqual(contractOriginView({ origin: 'NATIONAL', pncpLink: 'https://exemplo.test/contratos/1' }), {
    documentLink: 'https://exemplo.test/contratos/1',
    showControlNumber: true,
    expiryNotice: null,
    amendmentsNotice: null,
  });
});

test('contrato federal: sem o botão do documento, sem número de controle e com o aviso do vencimento e dos aditivos', () => {
  assert.deepEqual(contractOriginView({ origin: 'FEDERAL', pncpLink: null }), {
    documentLink: null,
    showControlNumber: false,
    expiryNotice: FEDERAL_EXPIRY_NOTICE,
    amendmentsNotice: FEDERAL_AMENDMENTS_NOTICE,
  });
});

test('os avisos não citam a base nacional de contratações pelo nome', () => {
  // screenTexts.test.ts: nenhum texto de tela cita o PNCP.
  assert.doesNotMatch(`${FEDERAL_EXPIRY_NOTICE} ${FEDERAL_AMENDMENTS_NOTICE}`, /pncp/i);
});
