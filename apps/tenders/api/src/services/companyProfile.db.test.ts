import assert from 'node:assert/strict';
import { after, describe, mock, test } from 'node:test';
import { eq } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { closeLocalTestDatabase, createTestAccount, databaseTestsSkipReason, withRollback } from '../collector/dbTestSupport';
import { accounts } from '../db/identity';
import { RequestInputError } from '../utils/requestInput';
import { testCnpj } from './apiTestSupport';
import { CompanyLookupUnavailableError, CompanyNotFoundError, type CompanyLookup, type CompanyLookupSource } from './companyLookup';
import { applyCompanyLookup, readCompanyProfile, updateCompanyProfile } from './companyProfile';

// Perfil da empresa: leitura, edição do titular e gravação da consulta do CNPJ, no banco local (transação desfeita).
// A fonte da consulta é simulada: nenhum teste chama a rede.

const NOW = new Date('2026-11-10T15:00:00.000Z');
const LATER = new Date('2026-11-11T09:30:00.000Z');

const isNotFound = (error: unknown) => error instanceof RequestInputError && error.status === 404;
const isBadRequest = (error: unknown) => error instanceof RequestInputError && error.status === 400;

/** O que a fonte devolve quando sabe tudo da empresa (dados de exemplo). */
function fullLookup(overrides: Partial<CompanyLookup> = {}): CompanyLookup {
  return {
    legalName: 'EMPRESA ALFA COMERCIO LTDA',
    tradeName: 'ALFA',
    openingDate: '2004-09-01',
    size: 'DEMAIS',
    legalType: 'LTDA',
    legalNatureCode: '2062',
    legalNature: 'Sociedade Empresária Limitada',
    registrationStatus: 'ATIVA',
    registrationStatusDate: '2005-11-03',
    mainCnae: { code: '6319400', description: 'Portais, provedores de conteúdo e outros serviços de informação na internet' },
    secondaryCnaes: [
      { code: '4751201', description: 'Comércio varejista especializado de equipamentos de informática' },
      { code: '6204000', description: 'Consultoria em tecnologia da informação' },
    ],
    zipCode: '04538133',
    street: 'AVENIDA BRIG FARIA LIMA',
    number: '3477',
    complement: 'ANDAR 17',
    district: 'ITAIM BIBI',
    city: 'SAO PAULO',
    state: 'SP',
    phone: '(11) 2395-8400',
    email: 'contato@alfa.exemplo.test',
    ...overrides,
  };
}

/** A fonte sabe só a razão social: tudo o mais "não veio". */
function emptyLookup(legalName = 'EMPRESA ALFA COMERCIO LTDA'): CompanyLookup {
  return {
    legalName, tradeName: null, openingDate: null, size: null, legalType: null, legalNatureCode: null, legalNature: null,
    registrationStatus: null, registrationStatusDate: null, mainCnae: null, secondaryCnaes: null, zipCode: null,
    street: null, number: null, complement: null, district: null, city: null, state: null, phone: null, email: null,
  };
}

/** Fonte simulada: devolve o resultado (ou lança o erro) e guarda os CNPJs pedidos. */
function sourceReturning(result: CompanyLookup | Error): { source: CompanyLookupSource; requested: string[] } {
  const requested: string[] = [];
  return {
    requested,
    source: {
      lookup: async (cnpj) => {
        requested.push(cnpj);
        if (result instanceof Error) throw result;
        return result;
      },
    },
  };
}

/** Conta de teste com CNPJ (as contas de teste nascem sem). */
async function createAccountWithCnpj(tx: TendersDb, label: string, seed: number) {
  const account = await createTestAccount(tx, label);
  const cnpj = testCnpj(seed);
  await tx.update(accounts).set({ document: cnpj }).where(eq(accounts.id, account.accountId));
  return { ...account, cnpj };
}

async function accountName(tx: TendersDb, accountId: number): Promise<string | null> {
  const [row] = await tx.select({ name: accounts.name }).from(accounts).where(eq(accounts.id, accountId));
  return row?.name ?? null;
}

describe('perfil da empresa (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('conta nova: perfil vazio, sem consulta, lista de CNAEs vazia; conta que não existe, 404', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'empresa-vazia');
      assert.deepEqual(await readCompanyProfile(tx, account.accountId), {
        accountId: account.accountId, document: null, legalName: null, tradeName: null, openingDate: null, size: null, legalType: null,
        legalNature: null, registrationStatus: null, mainCnae: null, secondaryCnaes: [], zipCode: null, street: null, number: null,
        complement: null, district: null, city: null, state: null, phone: null, email: null, lookedUpAt: null,
      });
      await assert.rejects(readCompanyProfile(tx, 999_999_999), isNotFound);
      await assert.rejects(updateCompanyProfile(tx, 999_999_999, { phone: '1' }), isNotFound);
    });
  });

  test('edição: só o que veio muda, vazio limpa, e o nome da conta acompanha o fantasia ou a razão social', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'empresa-edicao');
      const other = await createTestAccount(tx, 'empresa-edicao-outra');
      const otherBefore = await readCompanyProfile(tx, other.accountId);

      const filled = await updateCompanyProfile(tx, account.accountId, {
        legalName: 'Empresa Alfa Ltda', tradeName: 'Alfa', openingDate: '2010-05-20', size: 'EPP', legalType: 'LTDA',
        zipCode: '01310100', street: 'Avenida Paulista', number: '1000', complement: 'Sala 1', district: 'Bela Vista',
        city: 'São Paulo', state: 'SP', phone: '(11) 3000-0000', email: 'contato@alfa.test',
      });
      assert.deepEqual(
        [filled.legalName, filled.tradeName, filled.openingDate, filled.size, filled.legalType],
        ['Empresa Alfa Ltda', 'Alfa', '2010-05-20', 'EPP', 'LTDA'],
      );
      assert.deepEqual(
        [filled.zipCode, filled.street, filled.number, filled.complement, filled.district, filled.city, filled.state, filled.phone, filled.email],
        ['01310100', 'Avenida Paulista', '1000', 'Sala 1', 'Bela Vista', 'São Paulo', 'SP', '(11) 3000-0000', 'contato@alfa.test'],
      );
      assert.equal(filled.lookedUpAt, null, 'editar não é consultar');
      assert.equal(await accountName(tx, account.accountId), 'Alfa', 'o nome da conta é o fantasia');

      // Só o que veio: o telefone muda, o resto e o nome da conta ficam.
      const phoneOnly = await updateCompanyProfile(tx, account.accountId, { phone: '(11) 4000-0000' });
      assert.deepEqual({ ...phoneOnly, phone: filled.phone }, filled);
      assert.equal(phoneOnly.phone, '(11) 4000-0000');
      assert.equal(await accountName(tx, account.accountId), 'Alfa');

      // Sem fantasia, o nome da conta volta a ser a razão social; e a razão social nova o acompanha.
      assert.equal((await updateCompanyProfile(tx, account.accountId, { tradeName: null })).tradeName, null);
      assert.equal(await accountName(tx, account.accountId), 'Empresa Alfa Ltda');
      await updateCompanyProfile(tx, account.accountId, { legalName: 'Empresa Alfa Comércio Ltda' });
      assert.equal(await accountName(tx, account.accountId), 'Empresa Alfa Comércio Ltda');

      // Vazio limpa o que pode ficar vazio.
      const cleared = await updateCompanyProfile(tx, account.accountId, {
        openingDate: null, size: null, legalType: null, zipCode: null, street: null, number: null, complement: null,
        district: null, city: null, state: null, phone: null, email: null,
      });
      assert.deepEqual(
        [cleared.openingDate, cleared.size, cleared.legalType, cleared.zipCode, cleared.street, cleared.number, cleared.complement, cleared.district, cleared.city, cleared.state, cleared.phone, cleared.email],
        new Array(12).fill(null),
      );
      assert.equal(cleared.legalName, 'Empresa Alfa Comércio Ltda');

      assert.deepEqual(await readCompanyProfile(tx, other.accountId), otherBefore, 'a outra conta não mudou');
    });
  });

  test('edição: o nome da conta cabe na coluna (100) e os fatos da Receita não se mexem', async () => {
    await withRollback(async (tx) => {
      const account = await createAccountWithCnpj(tx, 'empresa-fatos', 11);
      await applyCompanyLookup(tx, account.accountId, sourceReturning(fullLookup()).source, NOW);
      const before = await readCompanyProfile(tx, account.accountId);

      const edited = await updateCompanyProfile(tx, account.accountId, { tradeName: 'F'.repeat(150) });
      assert.equal(edited.tradeName?.length, 150, 'o fantasia guarda o texto inteiro');
      assert.equal((await accountName(tx, account.accountId))?.length, 100, 'o nome da conta é cortado na coluna');
      assert.deepEqual(
        [edited.legalNature, edited.registrationStatus, edited.mainCnae, edited.secondaryCnaes, edited.lookedUpAt, edited.document],
        [before.legalNature, before.registrationStatus, before.mainCnae, before.secondaryCnaes, before.lookedUpAt, before.document],
      );
    });
  });

  test('consulta: grava os dados da Receita no perfil, marca a data e acompanha o nome da conta; o CNPJ vem da conta', async () => {
    await withRollback(async (tx) => {
      const account = await createAccountWithCnpj(tx, 'empresa-consulta', 22);
      const { source, requested } = sourceReturning(fullLookup());

      const view = await applyCompanyLookup(tx, account.accountId, source, NOW);
      assert.deepEqual(requested, [account.cnpj], 'a fonte recebe o CNPJ da conta e só ele');
      assert.deepEqual(view, await readCompanyProfile(tx, account.accountId));
      assert.deepEqual(
        { ...view, lookedUpAt: undefined },
        {
          accountId: account.accountId,
          document: account.cnpj,
          legalName: 'EMPRESA ALFA COMERCIO LTDA',
          tradeName: 'ALFA',
          openingDate: '2004-09-01',
          size: 'DEMAIS',
          legalType: 'LTDA',
          legalNature: { code: '2062', description: 'Sociedade Empresária Limitada' },
          registrationStatus: { code: 'ATIVA', since: '2005-11-03' },
          mainCnae: { code: '6319400', description: 'Portais, provedores de conteúdo e outros serviços de informação na internet' },
          secondaryCnaes: [
            { code: '4751201', description: 'Comércio varejista especializado de equipamentos de informática' },
            { code: '6204000', description: 'Consultoria em tecnologia da informação' },
          ],
          zipCode: '04538133',
          street: 'AVENIDA BRIG FARIA LIMA',
          number: '3477',
          complement: 'ANDAR 17',
          district: 'ITAIM BIBI',
          city: 'SAO PAULO',
          state: 'SP',
          phone: '(11) 2395-8400',
          email: 'contato@alfa.exemplo.test',
          lookedUpAt: undefined,
        },
      );
      assert.equal(new Date(view.lookedUpAt ?? '').getTime(), NOW.getTime(), 'a data da consulta é a do relógio injetado');
      assert.match(view.lookedUpAt ?? '', /-03:00$/, 'em horário de Brasília');
      assert.equal(await accountName(tx, account.accountId), 'ALFA');
    });
  });

  test('consulta nunca apaga: o que a fonte não informou fica; o que informou vale mesmo sobre o digitado; lista vazia limpa os CNAEs', async () => {
    await withRollback(async (tx) => {
      const account = await createAccountWithCnpj(tx, 'empresa-nunca-apaga', 33);
      await applyCompanyLookup(tx, account.accountId, sourceReturning(fullLookup()).source, NOW);
      await updateCompanyProfile(tx, account.accountId, { phone: '(11) 90000-0000', email: 'digitado@alfa.test' });
      const before = await readCompanyProfile(tx, account.accountId);

      // A fonte só sabe a razão social (mudou): o resto fica como estava, inclusive o nome da conta (fantasia).
      const onlyName = await applyCompanyLookup(tx, account.accountId, sourceReturning(emptyLookup('EMPRESA ALFA COMERCIO E SERVICOS LTDA')).source, LATER);
      assert.deepEqual(
        { ...onlyName, legalName: before.legalName, lookedUpAt: before.lookedUpAt },
        before,
        'nada além da razão social e da data mudou',
      );
      assert.equal(onlyName.legalName, 'EMPRESA ALFA COMERCIO E SERVICOS LTDA');
      assert.equal(new Date(onlyName.lookedUpAt ?? '').getTime(), LATER.getTime());
      assert.equal(await accountName(tx, account.accountId), 'ALFA');

      // O que a fonte informa vale, mesmo sobre o que o titular digitou.
      const overwritten = await applyCompanyLookup(tx, account.accountId, sourceReturning(emptyLookup()).source, LATER);
      assert.equal(overwritten.phone, '(11) 90000-0000', 'sem telefone na fonte, o digitado fica');
      const withPhone = await applyCompanyLookup(tx, account.accountId, sourceReturning({ ...emptyLookup(), phone: '(21) 2222-3333', tradeName: 'ALFA NOVA' }).source, LATER);
      assert.deepEqual([withPhone.phone, withPhone.tradeName, withPhone.email], ['(21) 2222-3333', 'ALFA NOVA', 'digitado@alfa.test']);
      assert.equal(await accountName(tx, account.accountId), 'ALFA NOVA', 'o nome da conta segue o fantasia novo');

      // CNAEs secundários: "não veio" mantém; lista vazia é "sem secundário" e limpa.
      assert.equal((await applyCompanyLookup(tx, account.accountId, sourceReturning(emptyLookup()).source, LATER)).secondaryCnaes.length, 2);
      const cleared = await applyCompanyLookup(tx, account.accountId, sourceReturning({ ...emptyLookup(), secondaryCnaes: [] }).source, LATER);
      assert.deepEqual(cleared.secondaryCnaes, []);
      assert.equal(cleared.mainCnae?.code, '6319400', 'o principal não some');
    });
  });

  test('consulta sem fantasia na fonte nem na conta: o nome da conta é a razão social', async () => {
    await withRollback(async (tx) => {
      const account = await createAccountWithCnpj(tx, 'empresa-sem-fantasia', 44);
      await applyCompanyLookup(tx, account.accountId, sourceReturning(emptyLookup('SO RAZAO SOCIAL LTDA')).source, NOW);
      assert.equal(await accountName(tx, account.accountId), 'SO RAZAO SOCIAL LTDA');
    });
  });

  test('consulta com falha não grava nada: sem CNPJ, 400; CNPJ não achado, 422; fonte fora do ar, 503; erro de outro tipo segue como está', async () => {
    await withRollback(async (tx) => {
      const noDocument = await createTestAccount(tx, 'empresa-sem-cnpj');
      const never = sourceReturning(fullLookup());
      await assert.rejects(
        applyCompanyLookup(tx, noDocument.accountId, never.source, NOW),
        (error) => isBadRequest(error) && (error as Error).message === 'Esta conta não tem CNPJ cadastrado.',
      );
      assert.deepEqual(never.requested, [], 'sem CNPJ a fonte nem é chamada');
      await assert.rejects(applyCompanyLookup(tx, 999_999_999, never.source, NOW), isNotFound);

      const account = await createAccountWithCnpj(tx, 'empresa-falhas', 55);
      const before = await readCompanyProfile(tx, account.accountId);
      const nameBefore = await accountName(tx, account.accountId);

      await assert.rejects(
        applyCompanyLookup(tx, account.accountId, sourceReturning(new CompanyNotFoundError()).source, NOW),
        (error) =>
          error instanceof RequestInputError && error.status === 422 &&
          error.message === 'Não encontramos esse CNPJ na consulta cadastral. Confira o CNPJ ou preencha os dados à mão.',
      );

      const logged = mock.method(console, 'error', () => undefined);
      try {
        await assert.rejects(
          applyCompanyLookup(tx, account.accountId, sourceReturning(new CompanyLookupUnavailableError('HTTP 503')).source, NOW),
          (error) =>
            error instanceof RequestInputError && error.status === 503 &&
            error.message === 'A consulta de CNPJ não está disponível agora. Tente de novo em instantes ou preencha os dados à mão.',
        );
        assert.equal(logged.mock.callCount(), 1);
        assert.deepEqual(logged.mock.calls[0]?.arguments, ['Company lookup unavailable:', { accountId: account.accountId, reason: 'HTTP 503' }]);
      } finally {
        logged.mock.restore();
      }

      await assert.rejects(applyCompanyLookup(tx, account.accountId, sourceReturning(new TypeError('bug')).source, NOW), TypeError);

      assert.deepEqual(await readCompanyProfile(tx, account.accountId), before, 'nenhuma falha gravou');
      assert.equal(await accountName(tx, account.accountId), nameBefore);
    });
  });

  test('a consulta grava só na conta pedida', async () => {
    await withRollback(async (tx) => {
      const first = await createAccountWithCnpj(tx, 'empresa-isola-a', 66);
      const second = await createAccountWithCnpj(tx, 'empresa-isola-b', 77);
      const secondBefore = await readCompanyProfile(tx, second.accountId);
      const secondName = await accountName(tx, second.accountId);

      await applyCompanyLookup(tx, first.accountId, sourceReturning(fullLookup()).source, NOW);
      assert.deepEqual(await readCompanyProfile(tx, second.accountId), secondBefore);
      assert.equal(await accountName(tx, second.accountId), secondName);
    });
  });
});
