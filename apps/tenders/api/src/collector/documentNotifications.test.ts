import assert from 'node:assert/strict';
import test from 'node:test';
import { documentNoticeContent } from './documentNotifications';

// Texto e destino do aviso de vencimento de documento (item 5): o título leva o nome do tipo (ou a descrição, nos genéricos),
// o dono quando é de pessoa e a data; o destino é a aba certa da página Documentação. A geração e os destinatários, com o
// banco, estão em documentNotifications.db.test.ts.

test('documento da empresa: o nome do tipo e a data; descrição (se houver) na mensagem; destino na aba do cofre', () => {
  assert.deepEqual(
    documentNoticeContent({ type: 'CERTIDAO_FGTS', personId: null, description: null, validUntil: '2026-12-01', personName: null }),
    { title: 'Certificado de regularidade do FGTS vence em 01/12/2026', message: null, link: '/documentacao' },
  );
  assert.deepEqual(
    documentNoticeContent({ type: 'ATESTADO_CAPACIDADE', personId: null, description: 'Prefeitura de Imperatriz', validUntil: '2027-03-09', personName: null }),
    { title: 'Atestado de capacidade técnica vence em 09/03/2027', message: 'Prefeitura de Imperatriz', link: '/documentacao' },
  );
});

test('documento genérico ("Outro"): a descrição é o nome, e a mensagem fica vazia', () => {
  assert.deepEqual(
    documentNoticeContent({ type: 'OUTRO_EMPRESA', personId: null, description: 'Alvará de funcionamento', validUntil: '2026-12-31', personName: null }),
    { title: 'Alvará de funcionamento vence em 31/12/2026', message: null, link: '/documentacao' },
  );
});

test('documento de pessoa: o nome da pessoa no título e o destino na aba Pessoas', () => {
  assert.deepEqual(
    documentNoticeContent({ type: 'PROCURACAO', personId: 12, description: 'Pregão 4/2026', validUntil: '2026-11-30', personName: 'Ana Souza' }),
    { title: 'Procuração de Ana Souza vence em 30/11/2026', message: 'Pregão 4/2026', link: '/documentacao?aba=pessoas' },
  );
  assert.deepEqual(
    documentNoticeContent({ type: 'OUTRO_PESSOA', personId: 12, description: 'Certificado de curso', validUntil: '2026-11-30', personName: 'Ana Souza' }),
    { title: 'Certificado de curso de Ana Souza vence em 30/11/2026', message: null, link: '/documentacao?aba=pessoas' },
  );
});
