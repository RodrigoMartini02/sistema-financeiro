import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, describe, mock, test } from 'node:test';
import express, { type NextFunction, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import {
  closeLocalTestDatabase,
  createTestAccount,
  databaseTestsSkipReason,
  insertTestNotice,
  withRollback,
} from '../collector/dbTestSupport';
import { ContractStoreUnavailableError, type ContractStoreAccess } from '../contractStore/reader';
import { openTestContractStore, sampleContract, sampleResult, sampleSupplier } from '../contractStore/storeTestSupport';
import { postgresSearchFields } from '../contractStore/textSearch';
import { accounts } from '../db/identity';
import { tenderCompetitors, tenderEnabledAccounts } from '../db/schema';
import type { ObjectStorage } from '../objectStorage';
import { createMemoryStorage } from '../objectStorageTestSupport';
import type { TenderAccount } from '../services/access';
import type { CnpjSummary, CnpjWinnerItem } from '../services/cnpjPage';
import type { CompetitorList, CompetitorSummaryView, CompetitorView } from '../services/competitors';
import type { ContractDetail } from '../services/contractDetail';
import type { ContractSavedSearchView } from '../services/contractSavedSearches';
import type { ContractListItem } from '../services/contractSearch';
import { addAccountMember, testCnpj, testCpf, uniqueToken } from '../services/apiTestSupport';
import type { DashboardView } from '../services/dashboard';
import type { ExpiringContractsView } from '../services/dashboardContracts';
import type { DomainLists } from '../services/domainLists';
import type { NoticeDetail, TrackingHistoryEntry } from '../services/noticeDetail';
import type { NoticeListItem, NoticeTracking, Paginated } from '../services/noticeSearch';
import {
  CompanyLookupUnavailableError,
  CompanyNotFoundError,
  type CompanyLookup,
  type CompanyLookupSource,
} from '../services/companyLookup';
import type { CompanyProfileView } from '../services/companyProfile';
import type { ProfileView } from '../services/profile';
import type { SavedSearchView } from '../services/savedSearches';
import type { BillingEventView } from '../services/billingHistory';
import { applyOneTimePayment, clearRecurring, setRecurring, startTenderTrial, type SubscriptionView } from '../services/subscription';
import type { CourtesyChangeView, TeamMemberView, TenderAccountAdminView } from '../services/team';
import type { DocumentList, DocumentView } from '../services/vaultDocuments';
import type { PersonList, PersonView } from '../services/vaultPeople';
import { CNPJ_RATE_LIMIT } from './cnpj';
import { COMPANY_LOOKUP_RATE_LIMIT } from './company';
import { createTendersRoutes } from './index';
import { PREVIEW_RATE_LIMIT } from './savedSearches';
import { DOCUMENT_UPLOAD_RATE_LIMIT } from './vault';

// Rotas por HTTP, montadas como no server.ts (authenticate simulado com o
// usuário do teste) e com o banco da transação desfeita do teste.

/** CNPJs válidos (dígitos verificadores certos) da página do CNPJ: um fornecedor, um órgão e um que nenhum dado tem. */
const SUPPLIER_CNPJ = '11222333000181';
const AGENCY_CNPJ = '12345678000195';
const UNKNOWN_CNPJ = '98765432000198';

type TestUser = { id: number; type: 'membro' | 'titular' | 'admin' };

interface ApiResponse<T> {
  status: number;
  body: {
    success: boolean;
    data: T;
    message?: string;
    path?: string;
    errors?: Array<{ field: string; message: string }>;
  };
}

interface AccessData {
  account: TenderAccount;
  role: string;
  permissions: {
    manageTeam: boolean;
    manageCompany: boolean;
    manageBilling: boolean;
    manageVaultPeople: boolean;
    viewCollectionRuns: boolean;
    manageEnabledAccounts: boolean;
  };
  subscription: SubscriptionView | null;
}

interface TeamChange {
  member: TeamMemberView;
  warning: string | null;
}

interface MemberData {
  member: TeamMemberView;
}

interface ProfileData {
  profile: ProfileView;
}

interface CompanyData {
  company: CompanyProfileView;
}

/** Um JPEG mínimo (só a assinatura e uns bytes): o servidor confere o tipo pelo conteúdo, não decodifica a imagem. */
const JPEG_DATA_URL = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8]).toString('base64')}`;

/** Um PDF mínimo (só a assinatura e uns bytes): o servidor confere o tipo pelo conteúdo, não lê o PDF. */
function pdfFile(name = 'certidao.pdf'): { name: string; data: string } {
  return { name, data: `data:application/pdf;base64,${Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]).toString('base64')}` };
}

/** 12345678909 vira 123.456.789-09. */
function maskCpf(cpf: string): string {
  return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}

interface BillingData {
  account: TenderAccount;
  subscription: SubscriptionView;
  price: { baseCents: number; includedUsers: number; extraUserCents: number };
}

type SearchData = Paginated<NoticeListItem> & {
  parsedQuery: { terms: string[]; excludedTerms: string[]; termsMode: string };
};

type ApiCall = <T = unknown>(method: string, path: string, options?: { as: TestUser; body?: unknown }) => Promise<ApiResponse<T>>;

/** A consulta do CNPJ fora do ar: os testes que não a usam não devem depender da rede. */
const UNAVAILABLE_COMPANY_LOOKUP: CompanyLookupSource = {
  lookup: async () => {
    throw new CompanyLookupUnavailableError('Company lookup not simulated in this test');
  },
};

/** O que a consulta devolve nos testes: só alguns campos conhecidos, o resto "não veio". */
function companyLookupResult(overrides: Partial<CompanyLookup> = {}): CompanyLookup {
  return {
    legalName: 'EMPRESA ALFA COMERCIO LTDA', tradeName: 'ALFA', openingDate: '2004-09-01', size: 'DEMAIS', legalType: 'LTDA',
    legalNatureCode: '2062', legalNature: 'Sociedade Empresária Limitada', registrationStatus: 'ATIVA', registrationStatusDate: '2005-11-03',
    mainCnae: { code: '6319400', description: 'Portais e provedores de conteúdo' }, secondaryCnaes: [{ code: '6204000', description: 'Consultoria em TI' }],
    zipCode: '04538133', street: 'AVENIDA BRIG FARIA LIMA', number: '3477', complement: null, district: 'ITAIM BIBI', city: 'SAO PAULO',
    state: 'SP', phone: '(11) 2395-8400', email: null,
    ...overrides,
  };
}

/** Fonte simulada da consulta: o resultado (ou o erro) vale até ser trocado; guarda os CNPJs pedidos. */
function companySource(initial: CompanyLookup | Error): { source: CompanyLookupSource; requested: string[]; next: (outcome: CompanyLookup | Error) => void } {
  let outcome = initial;
  const requested: string[] = [];
  return {
    requested,
    next: (value) => {
      outcome = value;
    },
    source: {
      lookup: async (cnpj) => {
        requested.push(cnpj);
        if (outcome instanceof Error) throw outcome;
        return outcome;
      },
    },
  };
}

/** O armazém de contratos ainda sem cópia pronta (o servidor acabou de subir): as buscas de contratos esperam. */
const UPDATING_STORE: ContractStoreAccess = {
  query: () => Promise.reject(new ContractStoreUnavailableError()),
  status: () => ({ ready: false, revision: null, publishedAt: null, today: null, totals: null }),
};

async function withApi(
  tx: TendersDb,
  run: (call: ApiCall) => Promise<void>,
  contractStore: ContractStoreAccess = UPDATING_STORE,
  userFiles: ObjectStorage | null = null,
  companyLookup: CompanyLookupSource = UNAVAILABLE_COMPANY_LOOKUP,
): Promise<void> {
  let currentUser: TestUser | undefined;
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (currentUser) {
      req.tendersUser = { ...currentUser, document: '' };
    }
    next();
  });
  const { routes, adminRoutes } = createTendersRoutes({
    db: tx,
    pncpDetails: { fetchDetailList: async () => [] },
    companyLookup,
    contractStore,
    userFiles,
    now: () => new Date(),
  });
  app.use(
    '/api/tenders/admin',
    (req: Request, res: Response, next: NextFunction) => {
      if (req.tendersUser?.type !== 'admin') {
        res.status(403).json({ success: false, message: 'Access denied. Admin only.' });
        return;
      }
      next();
    },
    adminRoutes,
  );
  app.use('/api/tenders', routes);
  // Igual ao 404 do server.ts.
  app.use((req: Request, res: Response) => {
    res.status(404).json({ success: false, message: 'Route not found', path: req.path });
  });

  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const call: ApiCall = async <T>(method: string, path: string, options?: { as: TestUser; body?: unknown }) => {
    currentUser = options?.as;
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(options?.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    return { status: response.status, body: (await response.json()) as ApiResponse<T>['body'] };
  };
  try {
    await run(call);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('rotas /api/tenders (banco local)', { skip: databaseTestsSkipReason }, () => {
  after(closeLocalTestDatabase);

  test('conta sem o módulo responde como rota inexistente; colaborador sem acesso, 403', async () => {
    await withRollback(async (tx) => {
      const notEnabled = await createTestAccount(tx, 'http-sem', { enabled: false });
      const enabled = await createTestAccount(tx, 'http-com');
      const memberWithoutAccess = await addAccountMember(tx, enabled, 'http-semlib', { access: false });

      await withApi(tx, async (call) => {
        const titular = { id: notEnabled.ownerId, type: 'titular' as const };
        const hidden = await call('GET', '/api/tenders/notices?q=x', { as: titular });
        const unknown = await call('GET', '/api/inexistente', { as: titular });
        assert.equal(hidden.status, 404);
        assert.deepEqual(hidden.body, { success: false, message: 'Route not found', path: '/api/tenders/notices' });
        assert.deepEqual(Object.keys(hidden.body).sort(), Object.keys(unknown.body).sort());

        const forbidden = await call('GET', '/api/tenders/access', { as: { id: memberWithoutAccess, type: 'membro' } });
        assert.equal(forbidden.status, 403);
        assert.equal(forbidden.body.success, false);
      });
    });
  });

  test('accountId de outra conta: 404; inválido: 400 no formato de validação', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-conta');
      const other = await createTestAccount(tx, 'http-conta-outra');
      await withApi(tx, async (call) => {
        const titular = { id: account.ownerId, type: 'titular' as const };
        assert.equal((await call('GET', `/api/tenders/access?accountId=${account.accountId}`, { as: titular })).status, 200);
        assert.equal((await call('GET', `/api/tenders/access?accountId=${other.accountId}`, { as: titular })).status, 404);
        const invalid = await call('GET', '/api/tenders/access?accountId=abc', { as: titular });
        assert.equal(invalid.status, 400);
        assert.deepEqual(invalid.body, {
          success: false,
          message: 'Validation error',
          errors: [{ field: 'accountId', message: 'Conta inválida' }],
        });
      });
    });
  });

  test('validações: formato do escopo, relevância sem termos e limites', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-valida');
      await withApi(tx, async (call) => {
        const as = { id: account.ownerId, type: 'titular' as const };
        const tooMany = await call('GET', '/api/tenders/notices?perPage=500&state=XX', { as });
        assert.equal(tooMany.status, 400);
        assert.equal(tooMany.body.message, 'Validation error');
        assert.deepEqual(tooMany.body.errors?.map((error) => error.field).sort(), ['perPage', 'state']);

        const relevance = await call('GET', '/api/tenders/notices?sort=relevance', { as });
        assert.equal(relevance.status, 400);
        assert.match(String(relevance.body.message), /relevância/);

        const emptySearch = await call('POST', '/api/tenders/saved-searches', { as, body: { name: 'Vazia' } });
        assert.equal(emptySearch.status, 400);
        assert.match(String(emptySearch.body.message), /ao menos um critério/);

        const badTracking = await call('PUT', '/api/tenders/notices/1/tracking', { as, body: { status: 'TALVEZ' } });
        assert.equal(badTracking.status, 400);
        assert.equal(badTracking.body.errors?.[0]?.field, 'status');
      });
    });
  });

  test('fluxo do titular: acesso, busca, busca salva, acompanhamento, histórico, notificações, painel e listas', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-fluxo');
      const token = uniqueToken();
      const noticeId = await insertTestNotice(tx, { procurementObject: `Gestão de licitações ${token}`, state: 'MA' });
      await withApi(tx, async (call) => {
        const as = { id: account.ownerId, type: 'titular' as const };

        const access = await call<AccessData>('GET', '/api/tenders/access', { as });
        assert.equal(access.status, 200);
        assert.equal(access.body.success, true);
        assert.equal(access.body.data.role, 'TITULAR');
        assert.deepEqual(access.body.data.permissions, {
          manageTeam: true, manageCompany: true, manageBilling: true, manageVaultPeople: true, viewCollectionRuns: true, manageEnabledAccounts: false,
        });
        assert.equal(access.body.data.subscription?.situation, 'cortesia');

        const search = await call<SearchData>('GET', `/api/tenders/notices?q=${encodeURIComponent(`${token} licitação`)}&state=MA`, { as });
        assert.equal(search.status, 200);
        assert.deepEqual(search.body.data.items.map((item) => item.id), [noticeId]);
        assert.deepEqual(search.body.data.parsedQuery, { terms: [token, 'licitação'], excludedTerms: [], termsMode: 'E' });
        assert.deepEqual(
          { page: search.body.data.page, perPage: search.body.data.perPage, total: search.body.data.total, totalPages: search.body.data.totalPages },
          { page: 1, perPage: 20, total: 1, totalPages: 1 },
        );

        const created = await call<SavedSearchView>('POST', '/api/tenders/saved-searches', {
          as,
          body: { name: 'Licitações', terms: [token], states: ['MA'], minValue: 10, includeWithoutValue: true },
        });
        assert.equal(created.status, 201);
        assert.equal(created.body.data.openCount, 1);
        const searchId = created.body.data.id;

        const fromSaved = await call<SearchData>('GET', `/api/tenders/notices?savedSearchId=${searchId}`, { as });
        assert.deepEqual(fromSaved.body.data.items.map((item) => item.id), [noticeId]);

        const patched = await call<SavedSearchView>('PATCH', `/api/tenders/saved-searches/${searchId}`, { as, body: { notify: false } });
        assert.equal(patched.body.data.notify, false);
        assert.equal((await call('PATCH', `/api/tenders/saved-searches/${searchId}`, { as, body: {} })).status, 400);

        const tracked = await call<NoticeTracking>('PUT', `/api/tenders/notices/${noticeId}/tracking`, {
          as,
          body: { status: 'PARTICIPAR', note: 'Vamos' },
        });
        assert.equal(tracked.status, 200);
        assert.equal(tracked.body.data.status, 'PARTICIPAR');
        const detail = await call<NoticeDetail>('GET', `/api/tenders/notices/${noticeId}`, { as });
        assert.equal(detail.body.data.tracking?.status, 'PARTICIPAR');
        assert.deepEqual(detail.body.data.matchingSavedSearches, [{ id: searchId, name: 'Licitações' }]);
        const history = await call<TrackingHistoryEntry[]>('GET', `/api/tenders/notices/${noticeId}/history`, { as });
        assert.equal(history.body.data.length, 1);

        const items = await call('GET', `/api/tenders/notices/${noticeId}/items`, { as });
        assert.equal(items.status, 200);

        const count = await call<{ unread: number }>('GET', '/api/tenders/notifications/count', { as });
        assert.deepEqual(count.body, { success: true, data: { unread: 0 } });
        const markAll = await call<{ updated: number }>('POST', '/api/tenders/notifications/mark-all-read', { as });
        assert.equal(markAll.body.data.updated, 0);

        const dashboard = await call<DashboardView>('GET', '/api/tenders/dashboard', { as });
        assert.equal(dashboard.status, 200);
        assert.equal(dashboard.body.data.cards.participating, 1);

        const domains = await call<DomainLists>('GET', '/api/tenders/domains', { as });
        assert.equal(domains.status, 200);
        assert.equal(domains.body.data.modalities.length, 13);
        assert.equal(domains.body.data.memberSectors.length, 8);
        assert.equal(domains.body.data.memberJobTitles.length, 10);
        assert.equal(domains.body.data.companySizes.length, 4);
        assert.equal(domains.body.data.legalTypes.length, 5);
        assert.ok(Array.isArray(domains.body.data.municipalities));

        assert.equal((await call('GET', '/api/tenders/collection/status', { as })).status, 200);
        assert.equal((await call('GET', '/api/tenders/collection/runs?perPage=5', { as })).status, 200);
        assert.equal((await call('GET', '/api/tenders/team', { as })).status, 200);

        assert.equal((await call('DELETE', `/api/tenders/saved-searches/${searchId}`, { as })).status, 200);
        assert.equal((await call('DELETE', `/api/tenders/saved-searches/${searchId}`, { as })).status, 404);
        assert.equal((await call('DELETE', `/api/tenders/notices/${noticeId}/tracking`, { as })).status, 200);
      });
    });
  });

  test('colaborador com acesso usa a busca; equipe e histórico da coleta são do titular', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-colab');
      const member = await addAccountMember(tx, account, 'http-colab-membro', { access: true });
      await withApi(tx, async (call) => {
        const as = { id: member, type: 'membro' as const };
        const access = await call<AccessData>('GET', '/api/tenders/access', { as });
        assert.equal(access.body.data.role, 'COLABORADOR');
        assert.deepEqual(access.body.data.permissions, {
          manageTeam: false, manageCompany: false, manageBilling: false, manageVaultPeople: false, viewCollectionRuns: false, manageEnabledAccounts: false,
        });
        assert.equal((await call('GET', '/api/tenders/notices', { as })).status, 200);
        assert.equal((await call('GET', '/api/tenders/team', { as })).status, 403);
        assert.equal((await call('PUT', `/api/tenders/team/${member}`, { as, body: { hasAccess: true } })).status, 403);
        assert.equal((await call('GET', '/api/tenders/collection/runs', { as })).status, 403);
        assert.equal((await call('GET', '/api/tenders/collection/status', { as })).status, 200);
      });
    });
  });

  test('titular concede acesso pela equipe; admin liga a cortesia pela rota de admin', async () => {
    await withRollback(async (tx) => {
      const admin = await createTestAccount(tx, 'http-admin');
      const client = await createTestAccount(tx, 'http-admin-cliente', { enabled: false });
      const member = await addAccountMember(tx, client, 'http-admin-membro', { access: false });
      await withApi(tx, async (call) => {
        const titular = { id: client.ownerId, type: 'titular' as const };
        const platformAdmin = { id: admin.ownerId, type: 'admin' as const };
        assert.equal((await call('GET', '/api/tenders/access', { as: titular })).status, 404);

        const adminAccess = await call<AccessData>('GET', '/api/tenders/access', { as: platformAdmin });
        assert.equal(adminAccess.body.data.permissions.manageEnabledAccounts, true);
        assert.equal((await call('GET', '/api/tenders/admin/accounts', { as: titular })).status, 403);
        const listed = await call<TenderAccountAdminView[]>('GET', '/api/tenders/admin/accounts', { as: platformAdmin });
        assert.equal(listed.status, 200);
        assert.equal(listed.body.data.find((row) => row.accountId === client.accountId)?.courtesy, false);

        assert.equal((await call('PUT', `/api/tenders/admin/accounts/${client.accountId}`, { as: titular, body: { courtesy: true } })).status, 403);
        assert.equal((await call('PUT', `/api/tenders/admin/accounts/${client.accountId}`, { as: platformAdmin, body: {} })).status, 400);
        const courtesy = await call<CourtesyChangeView>('PUT', `/api/tenders/admin/accounts/${client.accountId}`, {
          as: platformAdmin,
          body: { courtesy: true },
        });
        assert.equal(courtesy.status, 200);
        assert.equal(courtesy.body.data.courtesy, true);
        assert.equal((await call('PUT', '/api/tenders/admin/accounts/999999999', { as: platformAdmin, body: { courtesy: true } })).status, 404);

        assert.equal((await call('GET', '/api/tenders/access', { as: titular })).status, 200);
        assert.equal((await call('GET', '/api/tenders/access', { as: { id: member, type: 'membro' } })).status, 403);
        const granted = await call<TeamChange>('PUT', `/api/tenders/team/${member}`, { as: titular, body: { hasAccess: true } });
        assert.equal(granted.body.data.member.hasAccess, true);
        assert.equal(granted.body.data.warning, null);
        assert.equal((await call('GET', '/api/tenders/access', { as: { id: member, type: 'membro' } })).status, 200);
      });
    });
  });

  test('teste e assinatura vencida: 402 para titular e colaborador; cobrança fica fora da trava', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-teste', { enabled: false });
      const member = await addAccountMember(tx, account, 'http-teste-membro', { access: true });
      // O que o cadastro faz: a conta nasce com o teste de 15 dias.
      await startTenderTrial(tx, account.accountId, account.ownerId, new Date());
      await withApi(tx, async (call) => {
        const titular = { id: account.ownerId, type: 'titular' as const };
        const asMember = { id: member, type: 'membro' as const };

        const access = await call<AccessData>('GET', '/api/tenders/access', { as: titular });
        assert.equal(access.body.data.subscription?.situation, 'teste');

        await tx
          .update(tenderEnabledAccounts)
          .set({ trialUntil: new Date(Date.now() - 60_000).toISOString() })
          .where(eq(tenderEnabledAccounts.accountId, account.accountId));

        const expiredTitular = await call<{ role: string; account: TenderAccount }>('GET', '/api/tenders/access', { as: titular });
        assert.equal(expiredTitular.status, 402);
        assert.equal((expiredTitular.body as unknown as { code: string }).code, 'TENDERS_SUBSCRIPTION_EXPIRED');
        assert.equal(expiredTitular.body.data.role, 'TITULAR');
        assert.equal(expiredTitular.body.data.account.id, account.accountId);
        const expiredMember = await call<{ role: string }>('GET', '/api/tenders/notices', { as: asMember });
        assert.equal(expiredMember.status, 402);
        assert.equal(expiredMember.body.data.role, 'COLABORADOR');

        const billing = await call<BillingData>('GET', `/api/tenders/billing?accountId=${account.accountId}`, { as: titular });
        assert.equal(billing.status, 200);
        assert.equal(billing.body.data.subscription.situation, 'vencida');
        assert.equal(billing.body.data.subscription.usersCount, 2);
        assert.equal(billing.body.data.subscription.monthlyAmountCents, 499);
        assert.deepEqual(billing.body.data.price, { baseCents: 499, includedUsers: 2, extraUserCents: 299 });
        assert.equal((await call('GET', `/api/tenders/billing?accountId=${account.accountId}`, { as: asMember })).status, 403);
        assert.equal((await call('GET', '/api/tenders/billing', { as: titular })).status, 400);
      });
    });
  });

  test('titular cadastra usuário pela equipe, já com acesso; o valor do mês acompanha; cortesia não paga', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-usuarios');
      await withApi(tx, async (call) => {
        const titular = { id: account.ownerId, type: 'titular' as const };
        const newUser = (label: string) => ({
          name: `Usuário ${label}`,
          email: `licitacoes-http-${label}-${Date.now()}@exemplo.test`,
          password: 'senha-forte-1',
        });

        const first = await call<TeamChange>('POST', '/api/tenders/team', { as: titular, body: newUser('um') });
        assert.equal(first.status, 201);
        assert.equal(first.body.data.member.hasAccess, true);
        const second = newUser('dois');
        assert.equal((await call('POST', '/api/tenders/team', { as: titular, body: second })).status, 201);
        assert.equal((await call('POST', '/api/tenders/team', { as: titular, body: second })).status, 400, 'e-mail repetido');
        assert.equal((await call('POST', '/api/tenders/team', { as: titular, body: { name: 'Sem senha', email: 'x@exemplo.test' } })).status, 400);

        const billing = await call<BillingData>('GET', `/api/tenders/billing?accountId=${account.accountId}`, { as: titular });
        assert.equal(billing.body.data.subscription.accessType, 'cortesia');
        assert.equal(billing.body.data.subscription.usersCount, 3);
        assert.equal(billing.body.data.subscription.monthlyAmountCents, 798);
        assert.equal((await call('POST', '/api/tenders/billing/pix', { as: titular, body: { accountId: account.accountId } })).status, 409);
      });
    });
  });

  test('histórico de cobrança por HTTP: só o titular, só da própria conta, mais recente primeiro e sem identificadores do Mercado Pago', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-historico');
      const other = await createTestAccount(tx, 'http-historico-outra');
      const empty = await createTestAccount(tx, 'http-historico-vazio');
      const member = await addAccountMember(tx, account, 'http-historico-membro', { access: true });
      const start = new Date('2026-11-10T15:00:00.000Z');
      const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000);

      // O que a cobrança já fez: um Pix, a ativação da assinatura recorrente e o cancelamento pelo titular.
      await applyOneTimePayment(tx, account.accountId, 'pag-http-1', at(0), { amountCents: 798, method: 'PIX' });
      await setRecurring(tx, account.accountId, 'pre-http', 3, at(1), 798);
      await clearRecurring(tx, account.accountId, 'pre-http', at(2), 'TITULAR');
      await applyOneTimePayment(tx, other.accountId, 'pag-http-outra', at(3), { amountCents: 499, method: 'CARTAO' });
      // Depois disso a assinatura da conta venceu: o módulo trava, mas a cobrança (e o histórico) fica fora da trava.
      await tx
        .update(tenderEnabledAccounts)
        .set({ accessType: 'assinatura', trialUntil: new Date(Date.now() - 60_000).toISOString(), paidUntil: new Date(Date.now() - 60_000).toISOString() })
        .where(eq(tenderEnabledAccounts.accountId, account.accountId));

      await withApi(tx, async (call) => {
        const titular = { id: account.ownerId, type: 'titular' as const };
        assert.equal((await call('GET', '/api/tenders/access', { as: titular })).status, 402, 'a conta está vencida');

        const history = await call<{ events: BillingEventView[] }>('GET', `/api/tenders/billing/history?accountId=${account.accountId}`, { as: titular });
        assert.equal(history.status, 200);
        assert.equal(history.body.success, true);
        assert.deepEqual(
          history.body.data.events.map((event) => [event.type, event.status, event.method, event.origin, event.amountCents, event.occurredAt]),
          [
            ['CANCELAMENTO', 'CANCELADA', null, 'TITULAR', null, '2026-11-10T12:02:00-03:00'],
            ['ASSINATURA', 'ATIVADA', null, null, 798, '2026-11-10T12:01:00-03:00'],
            ['PAGAMENTO', 'APROVADO', 'PIX', null, 798, '2026-11-10T12:00:00-03:00'],
          ],
        );
        const text = JSON.stringify(history.body);
        for (const hidden of ['pag-http-1', 'pre-http', 'paymentId', 'recurringId']) {
          assert.equal(text.includes(hidden), false, hidden);
        }

        // Cada titular vê só o histórico da própria conta; a outra conta, que o pedido nomeia, não existe para ele.
        const otherTitular = { id: other.ownerId, type: 'titular' as const };
        const ownHistory = await call<{ events: BillingEventView[] }>('GET', `/api/tenders/billing/history?accountId=${other.accountId}`, { as: otherTitular });
        assert.deepEqual(ownHistory.body.data.events.map((event) => [event.method, event.amountCents]), [['CARTAO', 499]]);
        assert.equal((await call('GET', `/api/tenders/billing/history?accountId=${account.accountId}`, { as: otherTitular })).status, 404);

        // Colaborador, mesmo com acesso ao módulo, não vê a cobrança; sem a conta ou com a conta inválida, 400.
        assert.equal((await call('GET', `/api/tenders/billing/history?accountId=${account.accountId}`, { as: { id: member, type: 'membro' as const } })).status, 403);
        assert.equal((await call('GET', '/api/tenders/billing/history', { as: titular })).status, 400);
        assert.equal((await call('GET', '/api/tenders/billing/history?accountId=abc', { as: titular })).status, 400);

        // Cortesia, sem nenhuma cobrança: lista vazia, não erro.
        const emptyHistory = await call<{ events: BillingEventView[] }>('GET', `/api/tenders/billing/history?accountId=${empty.accountId}`, { as: { id: empty.ownerId, type: 'titular' as const } });
        assert.equal(emptyHistory.status, 200);
        assert.deepEqual(emptyHistory.body.data.events, []);
      });
    });
  });

  test('equipe por HTTP: o titular cadastra com dados de trabalho, edita e troca a foto; colaborador e outra conta não', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-edicao');
      const other = await createTestAccount(tx, 'http-edicao-outra');
      const stranger = await addAccountMember(tx, other, 'http-edicao-alheio', { access: true });
      const { storage, objects } = createMemoryStorage();
      await withApi(tx, async (call) => {
        const titular = { id: account.ownerId, type: 'titular' as const };
        const created = await call<TeamChange>('POST', '/api/tenders/team', {
          as: titular,
          body: {
            name: 'Maria',
            email: `licitacoes-http-edicao-${Date.now()}@exemplo.test`,
            password: 'senha-forte-1',
            document: '529.982.247-25',
            phone: '11 99999-0000',
            sector: 'financeiro',
            jobTitle: 'gerente',
            admissionDate: '2025-02-01',
          },
        });
        assert.equal(created.status, 201);
        const member = created.body.data.member;
        assert.deepEqual(
          [member.sector, member.jobTitle, member.admissionDate, member.document, member.phone, member.photoUrl],
          ['financeiro', 'gerente', '2025-02-01', '52998224725', '11 99999-0000', null],
        );
        assert.equal('photoKey' in member, false, 'a chave do R2 não sai da API');
        const path = `/api/tenders/team/${member.userId}`;

        const edited = await call<MemberData>('PATCH', path, { as: titular, body: { name: 'Maria Souza', sector: '', newPassword: '' } });
        assert.equal(edited.status, 200);
        assert.deepEqual([edited.body.data.member.name, edited.body.data.member.sector, edited.body.data.member.jobTitle], ['Maria Souza', null, 'gerente']);
        const unchanged = await call<TeamChange>('PUT', path, { as: titular, body: { hasAccess: true } });
        assert.equal(unchanged.body.data.member.hasAccess, true, 'editar não tirou o acesso');

        assert.equal((await call('PATCH', path, { as: titular, body: {} })).status, 400);
        const badSector = await call('PATCH', path, { as: titular, body: { sector: 'nao-existe' } });
        assert.equal(badSector.status, 400);
        assert.equal(badSector.body.message, 'Setor inválido');
        assert.equal((await call('PATCH', '/api/tenders/team/abc', { as: titular, body: { name: 'X' } })).status, 400);
        assert.equal((await call('PATCH', `/api/tenders/team/${stranger}`, { as: titular, body: { name: 'Invasor' } })).status, 404);
        assert.equal((await call('PATCH', `/api/tenders/team/${account.ownerId}`, { as: titular, body: { name: 'Titular' } })).status, 404);

        // Foto: link assinado curto na lista, objeto no R2, e a chave nunca na resposta.
        const photo = await call<MemberData>('PUT', `${path}/photo`, { as: titular, body: { image: JPEG_DATA_URL } });
        assert.equal(photo.status, 200);
        assert.match(photo.body.data.member.photoUrl ?? '', new RegExp(`^memory://usuarios/${member.userId}/[0-9a-f-]{36}\\.jpg\\?expires=3600$`));
        assert.equal(objects.size, 1);
        const listed = await call<TeamMemberView[]>('GET', '/api/tenders/team', { as: titular });
        assert.equal(listed.body.data.find((item) => item.userId === member.userId)?.photoUrl, photo.body.data.member.photoUrl);
        assert.equal(JSON.stringify(listed.body).includes('photoKey'), false);

        const badImage = await call('PUT', `${path}/photo`, { as: titular, body: { image: 'data:image/png;base64,AAAA' } });
        assert.equal(badImage.status, 400);
        assert.equal(objects.size, 1, 'uma imagem recusada não mexe no R2');
        assert.equal((await call('PUT', `/api/tenders/team/${stranger}/photo`, { as: titular, body: { image: JPEG_DATA_URL } })).status, 404);
        assert.equal(objects.size, 1);

        const removed = await call<MemberData>('DELETE', `${path}/photo`, { as: titular });
        assert.equal(removed.body.data.member.photoUrl, null);
        assert.equal(objects.size, 0);

        // O colaborador (com acesso) não gerencia a equipe nem o perfil; o titular de outra conta não o alcança.
        const asMember = { id: member.userId, type: 'membro' as const };
        for (const [method, requestPath, body] of [
          ['GET', '/api/tenders/team', undefined],
          ['PATCH', path, { name: 'Eu mesmo' }],
          ['PUT', `${path}/photo`, { image: JPEG_DATA_URL }],
          ['DELETE', `${path}/photo`, undefined],
          ['GET', '/api/tenders/profile', undefined],
          ['PATCH', '/api/tenders/profile', { name: 'Eu mesmo' }],
          ['PUT', '/api/tenders/profile/photo', { image: JPEG_DATA_URL }],
        ] as const) {
          assert.equal((await call(method, requestPath, { as: asMember, ...(body ? { body } : {}) })).status, 403, `${method} ${requestPath}`);
        }
        const otherTitular = { id: other.ownerId, type: 'titular' as const };
        assert.equal((await call('PATCH', path, { as: otherTitular, body: { name: 'Invasor' } })).status, 404);
        assert.equal((await call('PUT', `${path}/photo`, { as: otherTitular, body: { image: JPEG_DATA_URL } })).status, 404);
        const otherList = await call<TeamMemberView[]>('GET', '/api/tenders/team', { as: otherTitular });
        assert.deepEqual(otherList.body.data.map((item) => item.userId), [stranger], 'cada titular só vê a própria equipe');
      }, UPDATING_STORE, storage);
    });
  });

  test('foto por HTTP sem R2 configurado: 503 com mensagem clara, e a lista segue sem links', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-sem-r2');
      const member = await addAccountMember(tx, account, 'http-sem-r2-membro', { access: true });
      await withApi(tx, async (call) => {
        const titular = { id: account.ownerId, type: 'titular' as const };
        const failed = await call('PUT', `/api/tenders/team/${member}/photo`, { as: titular, body: { image: JPEG_DATA_URL } });
        assert.equal(failed.status, 503);
        assert.match(String(failed.body.message), /não está disponível/);
        assert.equal((await call('PUT', '/api/tenders/profile/photo', { as: titular, body: { image: JPEG_DATA_URL } })).status, 503);
        const listed = await call<TeamMemberView[]>('GET', '/api/tenders/team', { as: titular });
        assert.deepEqual(listed.body.data.map((item) => item.photoUrl), [null]);
      });
    });
  });

  test('perfil do titular por HTTP: lê, altera nome e telefone, troca e tira a foto', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-perfil');
      const { storage, objects } = createMemoryStorage();
      await withApi(tx, async (call) => {
        const titular = { id: account.ownerId, type: 'titular' as const };
        const read = await call<ProfileData>('GET', '/api/tenders/profile', { as: titular });
        assert.equal(read.status, 200);
        assert.deepEqual([read.body.data.profile.phone, read.body.data.profile.photoUrl], [null, null]);

        const updated = await call<ProfileData>('PATCH', '/api/tenders/profile', {
          as: titular,
          body: { name: 'Titular novo', lastName: 'Lima', phone: '11 3333-4444', email: 'ignorado@exemplo.test' },
        });
        assert.equal(updated.status, 200);
        assert.deepEqual(
          [updated.body.data.profile.name, updated.body.data.profile.lastName, updated.body.data.profile.phone],
          ['Titular novo', 'Lima', '11 3333-4444'],
        );
        assert.equal(updated.body.data.profile.email, read.body.data.profile.email, 'o e-mail do titular não muda por aqui');
        assert.equal((await call('PATCH', '/api/tenders/profile', { as: titular, body: {} })).status, 400);
        assert.equal((await call('PATCH', '/api/tenders/profile', { as: titular, body: { name: '' } })).status, 400);

        const photo = await call<ProfileData>('PUT', '/api/tenders/profile/photo', { as: titular, body: { image: JPEG_DATA_URL } });
        assert.match(photo.body.data.profile.photoUrl ?? '', new RegExp(`^memory://usuarios/${account.ownerId}/`));
        assert.equal(objects.size, 1);
        const removed = await call<ProfileData>('DELETE', '/api/tenders/profile/photo', { as: titular });
        assert.equal(removed.body.data.profile.photoUrl, null);
        assert.equal(objects.size, 0);
      }, UPDATING_STORE, storage);
    });
  });

  test('empresa por HTTP: o titular lê, edita e consulta o CNPJ da conta; o nome da conta acompanha; pedido inválido, 400', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-empresa');
      const cnpj = testCnpj(81);
      await tx.update(accounts).set({ document: cnpj }).where(eq(accounts.id, account.accountId));
      const { source, requested } = companySource(companyLookupResult());
      await withApi(tx, async (call) => {
        const as = { id: account.ownerId, type: 'titular' as const };

        const read = await call<CompanyData>('GET', '/api/tenders/company', { as });
        assert.equal(read.status, 200);
        assert.equal(read.body.success, true);
        const empty = read.body.data.company;
        assert.deepEqual(
          [empty.accountId, empty.document, empty.legalName, empty.size, empty.registrationStatus, empty.secondaryCnaes, empty.lookedUpAt],
          [account.accountId, cnpj, null, null, null, [], null],
        );

        // O CNPJ e os fatos da Receita não se editam: o que vier no corpo para eles é ignorado.
        const edited = await call<CompanyData>('PATCH', '/api/tenders/company', {
          as,
          body: {
            tradeName: 'Alfa Licitações', size: 'ME', legalType: 'LTDA', phone: '(11) 3000-0000', state: 'sp',
            document: AGENCY_CNPJ, registrationStatus: 'BAIXADA', mainCnae: { code: '1', description: 'x' },
          },
        });
        assert.equal(edited.status, 200);
        const company = edited.body.data.company;
        assert.deepEqual(
          [company.tradeName, company.size, company.legalType, company.phone, company.state, company.document, company.registrationStatus, company.mainCnae],
          ['Alfa Licitações', 'ME', 'LTDA', '(11) 3000-0000', 'SP', cnpj, null, null],
        );
        const access = await call<AccessData>('GET', '/api/tenders/access', { as });
        assert.equal(access.body.data.account.name, 'Alfa Licitações', 'o nome da conta, que o app mostra, acompanha o fantasia');

        // A consulta usa o CNPJ da conta, nunca um que venha no pedido, e grava na hora.
        const looked = await call<CompanyData>('POST', `/api/tenders/company/lookup?cnpj=${AGENCY_CNPJ}`, {
          as,
          body: { cnpj: AGENCY_CNPJ, document: AGENCY_CNPJ, accountId: 999 },
        });
        assert.equal(looked.status, 200);
        assert.deepEqual(requested, [cnpj]);
        const filled = looked.body.data.company;
        assert.deepEqual(
          [filled.legalName, filled.tradeName, filled.size, filled.legalType, filled.registrationStatus, filled.mainCnae?.code, filled.secondaryCnaes.length],
          ['EMPRESA ALFA COMERCIO LTDA', 'ALFA', 'DEMAIS', 'LTDA', { code: 'ATIVA', since: '2005-11-03' }, '6319400', 1],
        );
        assert.match(filled.lookedUpAt ?? '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/);
        assert.equal(filled.phone, '(11) 2395-8400', 'o que a fonte informa vale sobre o digitado');
        assert.deepEqual((await call<CompanyData>('GET', '/api/tenders/company', { as })).body.data.company, filled);
        const afterLookup = await call<AccessData>('GET', '/api/tenders/access', { as });
        assert.equal(afterLookup.body.data.account.name, 'ALFA');

        // Pedidos inválidos: nada é gravado.
        for (const [body, message] of [
          [{}, 'Informe o que alterar'],
          [{ document: AGENCY_CNPJ }, 'Informe o que alterar'],
          [{ legalName: '' }, 'Informe a razão social'],
          [{ size: 'GRANDE' }, 'Porte inválido'],
          [{ legalType: 'MEI' }, 'Tipo jurídico inválido'],
          [{ zipCode: '123' }, 'CEP inválido'],
          [{ state: 'XX' }, 'UF inválida'],
          [{ email: 'sem-arroba' }, 'Informe um e-mail válido'],
          [{ openingDate: '2026-02-30' }, 'Data de abertura inválida'],
        ] as const) {
          const invalid = await call('PATCH', '/api/tenders/company', { as, body });
          assert.equal(invalid.status, 400, JSON.stringify(body));
          assert.equal(invalid.body.message, message, JSON.stringify(body));
        }
        assert.deepEqual((await call<CompanyData>('GET', '/api/tenders/company', { as })).body.data.company, filled);
      }, UPDATING_STORE, null, source);
    });
  });

  test('empresa por HTTP: colaborador e outra conta ficam de fora; consulta sem CNPJ, não achada ou fora do ar não grava; limite, 429', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-empresa-erros');
      const other = await createTestAccount(tx, 'http-empresa-outra');
      const member = await addAccountMember(tx, account, 'http-empresa-membro', { access: true });
      const { source, requested, next } = companySource(new CompanyNotFoundError());

      await withApi(tx, async (call) => {
        const titular = { id: account.ownerId, type: 'titular' as const };
        const otherTitular = { id: other.ownerId, type: 'titular' as const };

        // O colaborador, mesmo com acesso ao módulo, não vê nem altera a empresa nem consulta o CNPJ.
        const asMember = { id: member, type: 'membro' as const };
        for (const [method, body] of [['GET', undefined], ['PATCH', { phone: '1' }], ['POST', undefined]] as const) {
          const path = method === 'POST' ? '/api/tenders/company/lookup' : '/api/tenders/company';
          assert.equal((await call(method, path, { as: asMember, ...(body ? { body } : {}) })).status, 403, `${method} ${path}`);
        }
        assert.deepEqual(requested, []);

        // O titular de uma conta não alcança a empresa de outra.
        for (const [method, path] of [
          ['GET', `/api/tenders/company?accountId=${other.accountId}`],
          ['PATCH', `/api/tenders/company?accountId=${other.accountId}`],
          ['POST', `/api/tenders/company/lookup?accountId=${other.accountId}`],
        ] as const) {
          assert.equal((await call(method, path, { as: titular, ...(method === 'PATCH' ? { body: { phone: '1' } } : {}) })).status, 404, `${method} ${path}`);
        }
        const otherRead = await call<CompanyData>('GET', '/api/tenders/company', { as: otherTitular });
        assert.equal(otherRead.body.data.company.accountId, other.accountId);
        assert.deepEqual(requested, []);

        // Sem CNPJ na conta: 400, e a fonte nem é chamada.
        const noDocument = await call('POST', '/api/tenders/company/lookup', { as: titular });
        assert.equal(noDocument.status, 400);
        assert.equal(noDocument.body.message, 'Esta conta não tem CNPJ cadastrado.');
        assert.deepEqual(requested, []);

        // Com CNPJ: a fonte não acha (422), está fora do ar (503) ou falha de outro jeito (500 genérico); nada é gravado.
        const cnpj = testCnpj(82);
        await tx.update(accounts).set({ document: cnpj }).where(eq(accounts.id, account.accountId));
        const before = (await call<CompanyData>('GET', '/api/tenders/company', { as: titular })).body.data.company;

        const notFound = await call('POST', '/api/tenders/company/lookup', { as: titular });
        assert.equal(notFound.status, 422);
        assert.equal(notFound.body.message, 'Não encontramos esse CNPJ na consulta cadastral. Confira o CNPJ ou preencha os dados à mão.');

        const logged = mock.method(console, 'error', () => undefined);
        try {
          next(new CompanyLookupUnavailableError('HTTP 503'));
          const unavailable = await call('POST', '/api/tenders/company/lookup', { as: titular });
          assert.equal(unavailable.status, 503);
          assert.equal(unavailable.body.message, 'A consulta de CNPJ não está disponível agora. Tente de novo em instantes ou preencha os dados à mão.');

          next(new TypeError('falha inesperada com detalhe interno'));
          const broken = await call('POST', '/api/tenders/company/lookup', { as: titular });
          assert.equal(broken.status, 500);
          assert.equal(broken.body.message, 'Não foi possível consultar o CNPJ agora.');
          assert.equal(JSON.stringify(broken.body).includes('detalhe interno'), false);
        } finally {
          logged.mock.restore();
        }
        assert.deepEqual(requested, [cnpj, cnpj, cnpj]);
        assert.deepEqual((await call<CompanyData>('GET', '/api/tenders/company', { as: titular })).body.data.company, before);
      }, UPDATING_STORE, null, source);

      // O limite é por pessoa: 5 consultas a cada 10 minutos, contando as que falham; a seguinte volta 429 e não chega à fonte.
      next(companyLookupResult());
      requested.length = 0;
      await withApi(tx, async (call) => {
        const titular = { id: account.ownerId, type: 'titular' as const };
        for (let index = 0; index < COMPANY_LOOKUP_RATE_LIMIT.max; index += 1) {
          assert.equal((await call('POST', '/api/tenders/company/lookup', { as: titular })).status, 200, `consulta ${index + 1}`);
        }
        const limited = await call('POST', '/api/tenders/company/lookup', { as: titular });
        assert.equal(limited.status, 429);
        assert.deepEqual(limited.body, { success: false, message: 'Muitas consultas seguidas. Espere alguns minutos e tente de novo.' });
        assert.equal(requested.length, COMPANY_LOOKUP_RATE_LIMIT.max);

        // Ler e editar não gastam o limite; e o limite de uma pessoa não alcança a outra.
        assert.equal((await call('GET', '/api/tenders/company', { as: titular })).status, 200);
        assert.equal((await call('PATCH', '/api/tenders/company', { as: titular, body: { phone: '1' } })).status, 200);
        const otherTitular = { id: other.ownerId, type: 'titular' as const };
        assert.equal((await call('POST', '/api/tenders/company/lookup', { as: otherTitular })).status, 400, 'a outra pessoa não está limitada');
      }, UPDATING_STORE, null, source);
    });
  });

  test('favoritos por HTTP: favoritar, filtrar e tirar; edital inexistente: 404', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-favorito');
      const token = uniqueToken();
      const noticeId = await insertTestNotice(tx, { procurementObject: `Favorito http ${token}`, proposalClosesAt: '2099-11-20T09:30:00' });
      await withApi(tx, async (call) => {
        const as = { id: account.ownerId, type: 'titular' as const };
        const saved = await call<{ noticeId: number; isFavorite: boolean }>('PUT', `/api/tenders/notices/${noticeId}/favorite`, { as });
        assert.equal(saved.status, 200);
        assert.deepEqual(saved.body.data, { noticeId, isFavorite: true });

        const favorites = await call<SearchData>('GET', `/api/tenders/notices?q=${encodeURIComponent(token)}&favoritesOnly=true`, { as });
        assert.equal(favorites.status, 200);
        assert.deepEqual(favorites.body.data.items.map((item) => [item.id, item.isFavorite]), [[noticeId, true]]);

        const removed = await call<{ noticeId: number; isFavorite: boolean }>('DELETE', `/api/tenders/notices/${noticeId}/favorite`, { as });
        assert.deepEqual(removed.body.data, { noticeId, isFavorite: false });
        assert.equal((await call<SearchData>('GET', `/api/tenders/notices?q=${encodeURIComponent(token)}&favoritesOnly=true`, { as })).body.data.total, 0);

        assert.equal((await call('PUT', '/api/tenders/notices/999999999/favorite', { as })).status, 404);
        assert.equal((await call('GET', '/api/tenders/notices?favoritesOnly=talvez', { as })).status, 400);
      });
    });
  });

  test('busca por número e ano por HTTP; número sem dígito, longo demais ou ano fora da faixa: 400', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-numero');
      const token = uniqueToken();
      const noticeId = await insertTestNotice(tx, {
        procurementObject: `Número http ${token}`,
        purchaseNumber: 'PE 352/26',
        purchaseYear: 2026,
        proposalClosesAt: '2099-11-20T09:30:00',
      });
      await withApi(tx, async (call) => {
        const as = { id: account.ownerId, type: 'titular' as const };
        const search = (params: string) => call<SearchData>('GET', `/api/tenders/notices?q=${encodeURIComponent(token)}&${params}`, { as });
        const found = await search(`number=${encodeURIComponent('PE 352/2026')}&purchaseYear=2026`);
        assert.equal(found.status, 200);
        assert.deepEqual(found.body.data.items.map((item) => item.id), [noticeId]);
        assert.equal((await search('number=352%2F2025')).body.data.total, 0);
        assert.equal((await search('purchaseYear=2025')).body.data.total, 0);

        assert.equal((await search('number=PE')).status, 400);
        assert.equal((await search(`number=${'1'.repeat(61)}`)).status, 400);
        assert.equal((await search('purchaseYear=1999')).status, 400);
        assert.equal((await search('purchaseYear=dois')).status, 400);
      });
    });
  });

  test('contratos e página do CNPJ: conta sem o módulo, 404; colaborador sem acesso, 403; assinatura vencida, 402', async () => {
    await withRollback(async (tx) => {
      const notEnabled = await createTestAccount(tx, 'http-contrato-sem', { enabled: false });
      const enabled = await createTestAccount(tx, 'http-contrato-com');
      const memberWithoutAccess = await addAccountMember(tx, enabled, 'http-contrato-semlib', { access: false });
      const contractPath = `/api/tenders/contracts/${encodeURIComponent(sampleContract(1).pncpControlNumber)}`;
      const cnpjPaths = [`/api/tenders/cnpj/${SUPPLIER_CNPJ}`, `/api/tenders/cnpj/${SUPPLIER_CNPJ}/winners`];
      await withApi(tx, async (call) => {
        const outsider = { id: notEnabled.ownerId, type: 'titular' as const };
        const blocked = { id: memberWithoutAccess, type: 'membro' as const };
        for (const path of ['/api/tenders/contracts', contractPath, '/api/tenders/contract-searches', ...cnpjPaths]) {
          assert.equal((await call('GET', path, { as: outsider })).status, 404, path);
          assert.equal((await call('GET', path, { as: blocked })).status, 403, path);
        }

        await tx
          .update(tenderEnabledAccounts)
          .set({ accessType: 'assinatura', trialUntil: new Date(Date.now() - 60_000).toISOString() })
          .where(eq(tenderEnabledAccounts.accountId, enabled.accountId));
        const titular = { id: enabled.ownerId, type: 'titular' as const };
        assert.equal((await call('GET', '/api/tenders/contracts', { as: titular })).status, 402);
        assert.equal((await call('PUT', `${contractPath}/favorite`, { as: titular })).status, 402);
        for (const path of cnpjPaths) {
          assert.equal((await call('GET', path, { as: titular })).status, 402, path);
        }
      });
    });
  });

  test('esfera e situação por HTTP: nos editais (por cima de uma busca salva), nos contratos, nas listas e com validação', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-esfera');
      const token = uniqueToken();
      const base = { procurementObject: `Esfera http ${token}`, proposalClosesAt: new Date(Date.now() + 10 * 86_400_000).toISOString() };
      const federal = await insertTestNotice(tx, { ...base, governmentSphere: 'F' });
      const municipal = await insertTestNotice(tx, { ...base, governmentSphere: 'M' });
      const revoked = await insertTestNotice(tx, { ...base, governmentSphere: 'M', situationId: 2 });
      const federalContract = sampleContract(11, { contractObject: `Contrato ${token} federal`, expiresOn: '2030-01-01', governmentSphere: 'F' });
      const municipalContract = sampleContract(12, { contractObject: `Contrato ${token} municipal`, expiresOn: '2030-02-01', governmentSphere: 'M' });
      const store = await openTestContractStore([federalContract, municipalContract], { searchFields: postgresSearchFields(tx) });
      try {
        await withApi(
          tx,
          async (call) => {
            const as = { id: account.ownerId, type: 'titular' as const };
            type ContractSearchData = Paginated<ContractListItem> & { parsedQuery: { terms: string[] } };
            const noticeIds = async (path: string) =>
              (await call<SearchData>('GET', path, { as })).body.data.items.map((item) => item.id).sort((a, b) => a - b);
            const sorted = (ids: number[]) => [...ids].sort((a, b) => a - b);
            const contractKeys = async (path: string) =>
              (await call<ContractSearchData>('GET', path, { as })).body.data.items.map((item) => item.pncpControlNumber);

            // Editais: o padrão é só abertos (situação 1); a esfera filtra, em qualquer caixa; a situação vale sem "só abertos".
            const created = await call<SavedSearchView>('POST', '/api/tenders/saved-searches', { as, body: { name: 'Esfera http', terms: [token] } });
            assert.equal(created.status, 201);
            const saved = `/api/tenders/notices?savedSearchId=${created.body.data.id}`;
            assert.deepEqual(await noticeIds(saved), sorted([federal, municipal]), 'a busca salva sozinha: os abertos');
            assert.deepEqual(await noticeIds(`${saved}&sphere=F`), [federal], 'a esfera por cima da busca salva');
            assert.deepEqual(await noticeIds(`${saved}&sphere=m`), [municipal], 'em minúscula também vale');
            assert.deepEqual(await noticeIds(`${saved}&openOnly=false&sphere=M&situation=2`), [revoked], 'esfera e situação juntas');
            assert.deepEqual(await noticeIds(`${saved}&openOnly=false&situation=1&situation=2`), sorted([federal, municipal, revoked]));
            assert.deepEqual(await noticeIds(`/api/tenders/notices?q=${token}&sphere=F&sphere=M`), sorted([federal, municipal]), 'sem busca salva, com a busca da tela');
            assert.deepEqual(await noticeIds(`/api/tenders/notices?q=${token}&sphere=D`), [], 'nenhum distrital');

            // Contratos: a esfera filtra a lista, por cima de uma busca salva também.
            assert.deepEqual(await contractKeys(`/api/tenders/contracts?q=${token}`), [federalContract.pncpControlNumber, municipalContract.pncpControlNumber]);
            assert.deepEqual(await contractKeys(`/api/tenders/contracts?q=${token}&sphere=F`), [federalContract.pncpControlNumber]);
            assert.deepEqual(await contractKeys(`/api/tenders/contracts?q=${token}&sphere=m`), [municipalContract.pncpControlNumber]);
            assert.deepEqual(
              await contractKeys(`/api/tenders/contracts?q=${token}&sphere=F&sphere=M`),
              [federalContract.pncpControlNumber, municipalContract.pncpControlNumber],
            );
            const contractSearch = await call<ContractSavedSearchView>('POST', '/api/tenders/contract-searches', { as, body: { name: 'Esfera http', terms: [token] } });
            assert.equal(contractSearch.status, 201);
            assert.deepEqual(
              await contractKeys(`/api/tenders/contracts?savedSearchId=${contractSearch.body.data.id}&sphere=M`),
              [municipalContract.pncpControlNumber],
              'a esfera por cima da busca salva de contratos',
            );

            // A lista de esferas sai com as outras listas, na ordem da tela.
            const domains = await call<DomainLists>('GET', '/api/tenders/domains', { as });
            assert.deepEqual(domains.body.data.spheres, [
              { id: 'F', name: 'Federal' }, { id: 'E', name: 'Estadual' }, { id: 'M', name: 'Municipal' }, { id: 'D', name: 'Distrital' },
            ]);

            // Valor fora das listas: 400 nos dois filtros.
            const badNotices = await call('GET', '/api/tenders/notices?sphere=X&situation=9', { as });
            assert.equal(badNotices.status, 400);
            assert.deepEqual(badNotices.body.errors?.map((error) => error.field).sort(), ['situation', 'sphere']);
            assert.equal((await call('GET', '/api/tenders/notices?situation=abc', { as })).status, 400);
            const badContracts = await call('GET', '/api/tenders/contracts?sphere=Z', { as });
            assert.equal(badContracts.status, 400);
            assert.deepEqual(badContracts.body.errors?.map((error) => error.field), ['sphere']);
          },
          store.reader,
        );
      } finally {
        await store.close();
      }
    });
  });

  test('concorrentes por HTTP: salvar, listar, apelido, aviso, remover, limite, validações, isolamento e os números do armazém', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-concorrentes');
      const other = await createTestAccount(tx, 'http-concorrentes-outra');
      const colleagueId = await addAccountMember(tx, account, 'http-concorrentes-colega', { access: true });
      const alfa = testCnpj(7301);
      const beta = testCnpj(7302);
      const gama = testCnpj(7303);
      const maskedAlfa = `${alfa.slice(0, 2)}.${alfa.slice(2, 5)}.${alfa.slice(5, 8)}/${alfa.slice(8, 12)}-${alfa.slice(12)}`;
      const store = await openTestContractStore([
        sampleContract(21, { supplierDocument: alfa, supplierName: 'Alfa Ltda', expiresOn: '2030-01-01' }),
        sampleContract(22, { supplierDocument: alfa, supplierName: 'Alfa Ltda', expiresOn: '2020-01-01', originalTermEnd: '2020-01-01' }),
      ]);
      try {
        await withApi(
          tx,
          async (call) => {
            const owner = { id: account.ownerId, type: 'titular' as const };
            const colleague = { id: colleagueId, type: 'membro' as const };
            const outsider = { id: other.ownerId, type: 'titular' as const };
            const list = async (as: TestUser) => (await call<CompetitorList>('GET', '/api/tenders/competitors', { as })).body.data;
            const fields = (response: ApiResponse<unknown>) => response.body.errors?.map((error) => error.field).sort();

            // Validações do formato.
            const noBody = await call('POST', '/api/tenders/competitors', { as: owner, body: {} });
            assert.equal(noBody.status, 400);
            assert.deepEqual(fields(noBody), ['cnpj']);
            assert.equal((await call('POST', '/api/tenders/competitors', { as: owner, body: { cnpj: '11222333000180' } })).status, 400, 'dígito verificador errado');
            assert.deepEqual(fields(await call('POST', '/api/tenders/competitors', { as: owner, body: { cnpj: alfa, nickname: 'x'.repeat(81) } })), ['nickname']);
            assert.deepEqual(fields(await call('POST', '/api/tenders/competitors', { as: owner, body: { cnpj: alfa, nickname: 123 } })), ['nickname']);
            const emptyPatch = await call('PATCH', `/api/tenders/competitors/${alfa}`, { as: owner, body: {} });
            assert.equal(emptyPatch.status, 400);
            assert.deepEqual(emptyPatch.body.errors?.map((error) => error.message), ['Informe nickname ou notify']);
            assert.deepEqual(fields(await call('PATCH', `/api/tenders/competitors/${alfa}`, { as: owner, body: { notify: 'sim' } })), ['notify']);
            assert.equal((await call('PATCH', '/api/tenders/competitors/123', { as: owner, body: { notify: true } })).status, 400, 'CNPJ da rota inválido');
            assert.equal((await call('DELETE', '/api/tenders/competitors/abc', { as: owner })).status, 400);
            assert.deepEqual((await list(owner)).items, [], 'nada foi gravado pelos pedidos inválidos');

            // Salvar: com a máscara e o apelido aparado; de novo, 200 e nada muda.
            const created = await call<CompetitorView>('POST', '/api/tenders/competitors', { as: owner, body: { cnpj: maskedAlfa, nickname: '  Alfa  Principal ' } });
            assert.equal(created.status, 201);
            assert.deepEqual({ cnpj: created.body.data.cnpj, nickname: created.body.data.nickname, notify: created.body.data.notify }, { cnpj: alfa, nickname: 'Alfa Principal', notify: true });
            assert.match(created.body.data.createdAt ?? '', /-03:00$/);
            const again = await call<CompetitorView>('POST', '/api/tenders/competitors', { as: owner, body: { cnpj: alfa, nickname: 'Outro' } });
            assert.equal(again.status, 200);
            assert.equal(again.body.data.nickname, 'Alfa Principal');
            const withoutNickname = await call<CompetitorView>('POST', '/api/tenders/competitors', { as: owner, body: { cnpj: beta } });
            assert.equal(withoutNickname.status, 201);
            assert.equal(withoutNickname.body.data.nickname, null);

            const listed = await list(owner);
            assert.equal(listed.limit, 30);
            assert.deepEqual(listed.items.map((item) => [item.cnpj, item.nickname, item.notify]), [[alfa, 'Alfa Principal', true], [beta, null, true]]);

            // Alterar: aviso, apelido (vazio limpa) e os dois juntos; o que não é da pessoa, 404.
            const muted = await call<CompetitorView>('PATCH', `/api/tenders/competitors/${alfa}`, { as: owner, body: { notify: false } });
            assert.deepEqual([muted.status, muted.body.data.notify, muted.body.data.nickname], [200, false, 'Alfa Principal']);
            assert.equal((await call<CompetitorView>('PATCH', `/api/tenders/competitors/${alfa}`, { as: owner, body: { nickname: '' } })).body.data.nickname, null);
            const both = await call<CompetitorView>('PATCH', `/api/tenders/competitors/${alfa}`, { as: owner, body: { notify: true, nickname: 'Alfa' } });
            assert.deepEqual([both.body.data.notify, both.body.data.nickname], [true, 'Alfa']);
            assert.equal((await call('PATCH', `/api/tenders/competitors/${gama}`, { as: owner, body: { notify: false } })).status, 404, 'quem não acompanha');

            // Os números do armazém, na ordem da lista; quem não tem contrato vem zerado.
            const summary = await call<{ items: CompetitorSummaryView[] }>('GET', '/api/tenders/competitors/summary', { as: owner });
            assert.equal(summary.status, 200);
            assert.deepEqual(summary.body.data.items, [
              { cnpj: alfa, name: 'Alfa Ltda', total: 2, active: 1, last30Days: 0, lastPublishedAt: '2026-01-12T10:00:00-03:00' },
              { cnpj: beta, name: null, total: 0, active: 0, last30Days: 0, lastPublishedAt: null },
            ]);

            // Isolamento: a colega e a outra conta não veem, não alteram e não apagam os meus.
            assert.deepEqual((await list(colleague)).items, []);
            assert.deepEqual((await list(outsider)).items, []);
            assert.equal((await call('PATCH', `/api/tenders/competitors/${alfa}`, { as: colleague, body: { nickname: 'Dela' } })).status, 404);
            assert.equal((await call('DELETE', `/api/tenders/competitors/${alfa}`, { as: colleague })).status, 200, 'remover é idempotente, mesmo sem ter');
            assert.equal((await list(owner)).items.length, 2, 'o que a colega removeu não era meu');
            assert.equal((await call('POST', '/api/tenders/competitors', { as: colleague, body: { cnpj: alfa, nickname: 'Dela' } })).status, 201, 'cada pessoa tem o seu');
            assert.deepEqual((await list(owner)).items.map((item) => item.nickname), ['Alfa', null], 'o apelido dela não é o meu');

            // Limite de 30 por pessoa: o 31º dá 400, e quem já acompanha continua podendo ser salvo de novo.
            await tx.insert(tenderCompetitors).values(
              Array.from({ length: 28 }, (_, index) => ({ accountId: account.accountId, userId: account.ownerId, cnpj: testCnpj(8000 + index) })),
            );
            const overLimit = await call('POST', '/api/tenders/competitors', { as: owner, body: { cnpj: gama } });
            assert.equal(overLimit.status, 400);
            assert.match(overLimit.body.message ?? '', /30 concorrentes/);
            assert.equal((await call('POST', '/api/tenders/competitors', { as: owner, body: { cnpj: alfa } })).status, 200);

            // Remover: idempotente.
            const removed = await call<{ cnpj: string }>('DELETE', `/api/tenders/competitors/${beta}`, { as: owner });
            assert.deepEqual([removed.status, removed.body.data], [200, { cnpj: beta }]);
            assert.equal((await call('DELETE', `/api/tenders/competitors/${beta}`, { as: owner })).status, 200);
            assert.equal((await list(owner)).items.some((item) => item.cnpj === beta), false);
          },
          store.reader,
        );

        // Armazém ainda sem cópia pronta: a lista e o resto não dependem dele; os números esperam (503), e quem não tem
        // concorrente nem consulta o armazém.
        await withApi(tx, async (call) => {
          const owner = { id: account.ownerId, type: 'titular' as const };
          const outsider = { id: other.ownerId, type: 'titular' as const };
          assert.equal((await call('GET', '/api/tenders/competitors', { as: owner })).status, 200);
          const updating = await call('GET', '/api/tenders/competitors/summary', { as: owner });
          assert.equal(updating.status, 503);
          assert.deepEqual(updating.body, {
            success: false,
            code: 'CONTRACT_STORE_UPDATING',
            message: 'Os contratos estão sendo atualizados. Tente de novo em instantes.',
          });
          const empty = await call<{ items: CompetitorSummaryView[] }>('GET', '/api/tenders/competitors/summary', { as: outsider });
          assert.deepEqual([empty.status, empty.body.data.items], [200, []]);

          // O resumo tem o limite por pessoa da página do CNPJ (60 por minuto; os pedidos de antes já contam).
          let limited = 0;
          for (let index = 0; index < CNPJ_RATE_LIMIT.max + 1; index += 1) {
            if ((await call('GET', '/api/tenders/competitors/summary', { as: outsider })).status === 429) limited += 1;
          }
          assert.ok(limited >= 1, 'passou do limite: 429');
        });
      } finally {
        await store.close();
      }
    });
  });

  test('cofre por HTTP: pessoas só do titular; documentos da empresa de todos e os de pessoa só do titular; arquivo, link, validações e isolamento', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-cofre');
      const other = await createTestAccount(tx, 'http-cofre-outra');
      const colleagueId = await addAccountMember(tx, account, 'http-cofre-colega', { access: true });
      const { storage, objects } = createMemoryStorage();
      const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

      await withApi(
        tx,
        async (call) => {
          const owner = { id: account.ownerId, type: 'titular' as const };
          const colleague = { id: colleagueId, type: 'membro' as const };
          const outsider = { id: other.ownerId, type: 'titular' as const };
          const documents = async (as: TestUser) => (await call<DocumentList>('GET', '/api/tenders/vault/documents', { as })).body.data;
          const people = async (as: TestUser) => (await call<PersonList>('GET', '/api/tenders/vault/people', { as })).body.data;

          // As listas do cofre vão em /domains.
          const domains = await call<DomainLists>('GET', '/api/tenders/domains', { as: owner });
          assert.equal(domains.body.data.documentTypes.length, 16);
          assert.equal(domains.body.data.personRoles.length, 5);
          assert.equal(domains.body.data.documentTypes.find((type) => type.id === 'CERTIDAO_FGTS')?.defaultValidityDays, 30);
          assert.deepEqual(domains.body.data.personRoles[0], { id: 'SOCIO', name: 'Sócio' });

          // As pessoas são do titular: o colaborador recebe 403 em tudo.
          for (const [method, path, body] of [
            ['GET', '/api/tenders/vault/people', undefined],
            ['POST', '/api/tenders/vault/people', { name: 'Ana', cpf: testCpf(5001), roles: ['SOCIO'] }],
            ['PATCH', '/api/tenders/vault/people/1', { name: 'Ana' }],
            ['DELETE', '/api/tenders/vault/people/1', undefined],
          ] as const) {
            assert.equal((await call(method, path, { as: colleague, ...(body ? { body } : {}) })).status, 403, `${method} ${path}`);
          }

          // Pessoa: validações e cadastro.
          const badCpf = await call('POST', '/api/tenders/vault/people', { as: owner, body: { name: 'Ana', cpf: '111.111.111-11', roles: ['SOCIO'] } });
          assert.deepEqual([badCpf.status, badCpf.body.message], [400, 'CPF inválido: confira os 11 dígitos']);
          const noRole = await call('POST', '/api/tenders/vault/people', { as: owner, body: { name: 'Ana', cpf: testCpf(5001), roles: [] } });
          assert.deepEqual([noRole.status, noRole.body.message], [400, 'Escolha ao menos um papel para a pessoa']);
          assert.deepEqual((await people(owner)).items, [], 'nada foi gravado pelos pedidos inválidos');

          const createdPerson = await call<{ person: PersonView }>('POST', '/api/tenders/vault/people', {
            as: owner,
            body: { name: ' Ana  Souza ', cpf: maskCpf(testCpf(5001)), roles: ['SOCIO', 'PROCURADOR'], email: 'ANA@exemplo.com' },
          });
          assert.equal(createdPerson.status, 201);
          const person = createdPerson.body.data.person;
          assert.deepEqual({ name: person.name, cpf: person.cpf, roles: person.roles, email: person.email, documentCount: person.documentCount }, { name: 'Ana Souza', cpf: testCpf(5001), roles: ['SOCIO', 'PROCURADOR'], email: 'ana@exemplo.com', documentCount: 0 });
          const duplicate = await call('POST', '/api/tenders/vault/people', { as: owner, body: { name: 'Outra', cpf: testCpf(5001), roles: ['SOCIO'] } });
          assert.deepEqual([duplicate.status, duplicate.body.message], [400, 'Já existe uma pessoa com este CPF nesta conta']);
          const renamed = await call<{ person: PersonView }>('PATCH', `/api/tenders/vault/people/${person.id}`, { as: owner, body: { jobTitle: 'Diretora' } });
          assert.deepEqual([renamed.status, renamed.body.data.person.jobTitle, renamed.body.data.person.name], [200, 'Diretora', 'Ana Souza']);
          assert.equal((await call('PATCH', `/api/tenders/vault/people/${person.id}`, { as: owner, body: {} })).status, 400);
          assert.equal((await call('PATCH', '/api/tenders/vault/people/abc', { as: owner, body: { name: 'x' } })).status, 400, 'identificador inválido');

          // Documento: validações do pedido.
          const post = (as: TestUser, body: unknown) => call<{ document: DocumentView }>('POST', '/api/tenders/vault/documents', { as, body });
          assert.deepEqual([(await post(owner, {})).status, (await post(owner, {})).body.message], [400, 'Tipo de documento inválido']);
          assert.equal((await post(owner, { type: 'CERTIDAO_FGTS', file: pdfFile() })).body.message, 'Informe a validade do documento');
          assert.equal((await post(owner, { type: 'CERTIDAO_FGTS', validUntil: inDays(10) })).body.message, 'Envie o arquivo do documento');
          assert.equal((await post(owner, { type: 'CERTIDAO_FGTS', validUntil: inDays(10), file: { name: 'a.txt', data: 'data:text/plain;base64,aGVsbG8=' } })).body.message, 'O arquivo deve ser um PDF, JPG ou PNG');
          assert.equal((await post(owner, { type: 'CERTIDAO_FGTS', personId: person.id, validUntil: inDays(10), file: pdfFile() })).body.message, 'Este tipo de documento é da empresa e não tem pessoa');
          assert.equal((await post(owner, { type: 'DOCUMENTO_IDENTIDADE', file: pdfFile() })).body.message, 'Escolha a pessoa do documento');
          assert.equal((await documents(owner)).items.length, 0);
          assert.equal(objects.size, 0, 'nenhum pedido inválido chegou ao R2');

          // Guardar: o titular e o colaborador guardam documento da empresa; só o titular guarda o de pessoa.
          const company = await post(owner, { type: 'CERTIDAO_FGTS', issuedOn: inDays(-20), validUntil: inDays(10), file: pdfFile('Certidão FGTS.pdf') });
          assert.equal(company.status, 201);
          assert.deepEqual(
            { type: company.body.data.document.type, status: company.body.data.document.status, daysToExpire: company.body.data.document.daysToExpire, fileName: company.body.data.document.fileName, current: company.body.data.document.current },
            { type: 'CERTIDAO_FGTS', status: 'EXPIRING', daysToExpire: 10, fileName: 'Certidão FGTS.pdf', current: true },
          );
          const byColleague = await post(colleague, { type: 'CONTRATO_SOCIAL', file: pdfFile('contrato.pdf') });
          assert.equal(byColleague.status, 201, 'o colaborador com acesso guarda documento da empresa');
          const personal = await post(owner, { type: 'PROCURACAO', personId: person.id, description: 'Pregão 4/2026', validUntil: inDays(400), file: pdfFile('procuração.pdf') });
          assert.equal(personal.status, 201);
          assert.equal(personal.body.data.document.personId, person.id);
          const forbidden = await post(colleague, { type: 'PROCURACAO', personId: person.id, description: 'x', file: pdfFile() });
          assert.deepEqual([forbidden.status, forbidden.body.message], [403, 'Só o titular da conta pode guardar documentos de pessoas.']);
          const strangerPerson = await post(outsider, { type: 'PROCURACAO', personId: person.id, description: 'x', file: pdfFile() });
          assert.deepEqual([strangerPerson.status, strangerPerson.body.message], [404, 'Pessoa não encontrada']);
          assert.equal(objects.size, 3);
          assert.ok([...objects.keys()].every((key) => key.startsWith(`documentos/${account.accountId}/`)), 'os arquivos ficam na pasta da conta');

          // Lista: o titular vê tudo; o colaborador, só os da empresa; a chave do R2 não sai.
          const asOwner = await documents(owner);
          assert.equal(asOwner.limit, 300);
          assert.equal(asOwner.storageAvailable, true);
          assert.deepEqual(asOwner.items.map((item) => item.type).sort(), ['CERTIDAO_FGTS', 'CONTRATO_SOCIAL', 'PROCURACAO']);
          assert.deepEqual((await documents(colleague)).items.map((item) => item.type).sort(), ['CERTIDAO_FGTS', 'CONTRATO_SOCIAL']);
          assert.deepEqual((await documents(outsider)).items, []);
          const raw = JSON.stringify((await call('GET', '/api/tenders/vault/documents', { as: owner })).body);
          assert.ok(!raw.includes('documentos/') && !raw.includes('arquivo_chave') && !raw.includes('fileKey'), 'a chave do R2 não sai na API');
          assert.equal((await people(owner)).items[0]?.documentCount, 1, 'a pessoa conta o documento dela');

          // Alterar: datas, descrição e arquivo; documento de pessoa o colaborador nem enxerga.
          const documentId = company.body.data.document.id;
          const personalId = personal.body.data.document.id;
          const patched = await call<{ document: DocumentView }>('PATCH', `/api/tenders/vault/documents/${documentId}`, { as: owner, body: { validUntil: inDays(60), description: 'Matriz' } });
          assert.deepEqual([patched.status, patched.body.data.document.validUntil, patched.body.data.document.description, patched.body.data.document.status], [200, inDays(60), 'Matriz', 'VALID']);
          assert.equal((await call('PATCH', `/api/tenders/vault/documents/${documentId}`, { as: owner, body: {} })).body.message, 'Informe o que alterar');
          assert.equal((await call('PATCH', `/api/tenders/vault/documents/${documentId}`, { as: owner, body: { validUntil: '2026-02-30' } })).body.message, 'Data de validade inválida');
          assert.equal((await call('PATCH', `/api/tenders/vault/documents/${documentId}`, { as: owner, body: { validUntil: null } })).body.message, 'Informe a validade do documento');
          assert.equal((await call('PATCH', '/api/tenders/vault/documents/abc', { as: owner, body: { description: 'x' } })).status, 400);
          const swapped = await call<{ document: DocumentView }>('PATCH', `/api/tenders/vault/documents/${documentId}`, { as: owner, body: { file: pdfFile('nova.pdf') } });
          assert.equal(swapped.body.data.document.fileName, 'nova.pdf');
          assert.equal(objects.size, 3, 'o arquivo antigo saiu depois de o novo entrar');
          assert.equal((await call('PATCH', `/api/tenders/vault/documents/${personalId}`, { as: colleague, body: { description: 'invasão' } })).status, 404);
          assert.equal((await call('PATCH', `/api/tenders/vault/documents/${documentId}`, { as: outsider, body: { description: 'invasão' } })).status, 404);

          // Link de abertura: do titular e do colaborador (da empresa); o de pessoa, só do titular.
          const link = await call<{ url: string; expiresInSeconds: number; fileName: string }>('GET', `/api/tenders/vault/documents/${documentId}/link`, { as: colleague });
          assert.equal(link.status, 200);
          assert.match(link.body.data.url, new RegExp(`^memory://documentos/${account.accountId}/[0-9a-f-]{36}\\.pdf\\?expires=120$`));
          assert.deepEqual([link.body.data.expiresInSeconds, link.body.data.fileName], [120, 'nova.pdf']);
          assert.equal((await call('GET', `/api/tenders/vault/documents/${personalId}/link`, { as: owner })).status, 200);
          assert.equal((await call('GET', `/api/tenders/vault/documents/${personalId}/link`, { as: colleague })).status, 404);
          assert.equal((await call('GET', `/api/tenders/vault/documents/${documentId}/link`, { as: outsider })).status, 404);
          assert.equal((await call('GET', '/api/tenders/vault/documents/abc/link', { as: owner })).status, 400);

          // Apagar: o colaborador apaga o da empresa, não o de pessoa; a outra conta não apaga nenhum.
          assert.equal((await call('DELETE', `/api/tenders/vault/documents/${personalId}`, { as: colleague })).status, 404);
          assert.equal((await call('DELETE', `/api/tenders/vault/documents/${documentId}`, { as: outsider })).status, 404);
          const removed = await call<{ id: number }>('DELETE', `/api/tenders/vault/documents/${byColleague.body.data.document.id}`, { as: colleague });
          assert.deepEqual([removed.status, removed.body.data.id], [200, byColleague.body.data.document.id]);
          assert.equal(objects.size, 2);

          // Apagar a pessoa leva os documentos e os arquivos dela.
          const removedPerson = await call<{ id: number; removedDocuments: number }>('DELETE', `/api/tenders/vault/people/${person.id}`, { as: owner });
          assert.deepEqual([removedPerson.status, removedPerson.body.data], [200, { id: person.id, removedDocuments: 1 }]);
          assert.deepEqual((await people(owner)).items, []);
          assert.deepEqual((await documents(owner)).items.map((item) => item.id), [documentId]);
          assert.equal(objects.size, 1);
          assert.equal((await call('DELETE', `/api/tenders/vault/people/${person.id}`, { as: owner })).status, 404, 'apagar de novo: não encontrada');
        },
        UPDATING_STORE,
        storage,
      );

      // Sem R2 configurado (as variáveis R2_* não estão definidas): guardar e abrir dão 503; a lista segue, avisando.
      await withApi(tx, async (call) => {
        const owner = { id: account.ownerId, type: 'titular' as const };
        const stored = await call('POST', '/api/tenders/vault/documents', { as: owner, body: { type: 'CONTRATO_SOCIAL', file: pdfFile() } });
        assert.equal(stored.status, 503);
        assert.match(stored.body.message ?? '', /não estão disponíveis agora/);
        const list = await call<DocumentList>('GET', '/api/tenders/vault/documents', { as: owner });
        assert.deepEqual([list.status, list.body.data.storageAvailable], [200, false]);
        const documentId = list.body.data.items[0]?.id ?? 0;
        assert.equal((await call('GET', `/api/tenders/vault/documents/${documentId}/link`, { as: owner })).status, 503);
      });

      // Os envios têm limite por usuário: 30 a cada 10 minutos.
      await withApi(
        tx,
        async (call) => {
          const owner = { id: account.ownerId, type: 'titular' as const };
          let limited = 0;
          for (let index = 0; index < DOCUMENT_UPLOAD_RATE_LIMIT.max + 2; index += 1) {
            const response = await call('POST', '/api/tenders/vault/documents', { as: owner, body: { type: 'CONTRATO_SOCIAL', file: {} } });
            if (response.status === 429) limited += 1;
          }
          assert.ok(limited >= 1, 'passou do limite: 429');
          const withoutFile = await call('PATCH', '/api/tenders/vault/documents/1', { as: owner, body: { description: 'sem arquivo' } });
          assert.notEqual(withoutFile.status, 429, 'pedido sem arquivo não conta no limite de envios');
        },
        UPDATING_STORE,
        storage,
      );
    });
  });

  test('contratos por HTTP: busca, detalhe, favorito, buscas salvas e validações', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-contratos');
      const contract = sampleContract(7, { contractObject: 'Contrato http de limpeza predial', categoryId: 8, expiresOn: '2030-01-01' });
      const other = sampleContract(8, { contractObject: 'Contrato http de obra', categoryId: 7, expiresOn: '2030-02-01' });
      const key = contract.pncpControlNumber;
      const keyPath = encodeURIComponent(key);
      const store = await openTestContractStore([contract, other], { searchFields: postgresSearchFields(tx) });
      try {
        await withApi(
          tx,
          async (call) => {
            const as = { id: account.ownerId, type: 'titular' as const };
            type ContractSearchData = Paginated<ContractListItem> & { parsedQuery: { terms: string[] } };

            const found = await call<ContractSearchData>('GET', `/api/tenders/contracts?q=${encodeURIComponent('limpeza')}&category=8&sort=relevance`, { as });
            assert.equal(found.status, 200);
            assert.deepEqual(found.body.data.items.map((item) => item.pncpControlNumber), [key]);
            assert.deepEqual(found.body.data.parsedQuery.terms, ['limpeza']);

            const detail = await call<ContractDetail>('GET', `/api/tenders/contracts/${keyPath}`, { as });
            assert.equal(detail.status, 200);
            assert.equal(detail.body.data.pncpControlNumber, key, 'a chave tem barra e vai codificada na URL');
            assert.equal(detail.body.data.isFavorite, false);
            assert.equal((await call('GET', `/api/tenders/contracts/${encodeURIComponent('99999999999999-2-999999/2026')}`, { as })).status, 404, 'fora do armazém');
            for (const invalid of ['999999999', "x'; DROP TABLE y", '03353358000196-2-000216', encodeURIComponent('../x')]) {
              assert.equal((await call('GET', `/api/tenders/contracts/${invalid}`, { as })).status, 404, `chave fora do formato: ${invalid}`);
              assert.equal((await call('PUT', `/api/tenders/contracts/${invalid}/favorite`, { as })).status, 404);
            }

            const favorite = await call<{ pncpControlNumber: string; isFavorite: boolean }>('PUT', `/api/tenders/contracts/${keyPath}/favorite`, { as });
            assert.deepEqual(favorite.body.data, { pncpControlNumber: key, isFavorite: true });
            const favorites = await call<ContractSearchData>('GET', '/api/tenders/contracts?favoritesOnly=true', { as });
            assert.deepEqual(favorites.body.data.items.map((item) => [item.pncpControlNumber, item.isFavorite]), [[key, true]]);
            assert.equal((await call('DELETE', `/api/tenders/contracts/${keyPath}/favorite`, { as })).status, 200);
            assert.equal((await call<ContractSearchData>('GET', '/api/tenders/contracts?favoritesOnly=true', { as })).body.data.total, 0);

            const created = await call<ContractSavedSearchView>('POST', '/api/tenders/contract-searches', {
              as,
              body: { name: 'Contratos http', terms: ['limpeza'], categories: [8] },
            });
            assert.equal(created.status, 201);
            assert.equal(created.body.data.activeCount, 1);
            assert.ok(created.body.data.countedAt, 'o total vem com a data da contagem');
            const searchId = created.body.data.id;
            const bySaved = await call<ContractSearchData>('GET', `/api/tenders/contracts?savedSearchId=${searchId}`, { as });
            assert.deepEqual(bySaved.body.data.items.map((item) => item.pncpControlNumber), [key]);
            const patched = await call<ContractSavedSearchView>('PATCH', `/api/tenders/contract-searches/${searchId}`, { as, body: { notify: false } });
            assert.equal(patched.body.data.notify, false);
            assert.equal((await call('PATCH', `/api/tenders/contract-searches/${searchId}`, { as, body: {} })).status, 400);
            assert.equal((await call('POST', `/api/tenders/contract-searches/${searchId}/duplicate`, { as })).status, 201);
            const preview = await call<{ count: number }>('POST', '/api/tenders/contract-searches/preview', { as, body: { terms: ['limpeza'] } });
            assert.equal(preview.body.data.count, 1);
            assert.equal((await call('DELETE', `/api/tenders/contract-searches/${searchId}`, { as })).status, 200);
            assert.equal((await call('DELETE', `/api/tenders/contract-searches/${searchId}`, { as })).status, 404);

            const invalid = await call('GET', '/api/tenders/contracts?category=99&supplierCnpj=123&expiryFrom=31-12-2026&contractYear=1999&sort=prazo', { as });
            assert.equal(invalid.status, 400);
            assert.deepEqual(invalid.body.errors?.map((error) => error.field).sort(), ['category', 'contractYear', 'expiryFrom', 'sort', 'supplierCnpj']);
            assert.equal((await call('GET', '/api/tenders/contracts?sort=relevance', { as })).status, 400, 'relevância sem termos');
            assert.equal((await call('GET', '/api/tenders/contracts?expiryFrom=2027-01-01&expiryTo=2026-01-01', { as })).status, 400);
            const emptySearch = await call('POST', '/api/tenders/contract-searches', { as, body: { name: 'Vazia' } });
            assert.equal(emptySearch.status, 400);
            assert.match(String(emptySearch.body.message), /ao menos um critério/);
            assert.equal((await call('POST', '/api/tenders/contract-searches', { as, body: { name: 'x', categories: [99] } })).status, 400);
          },
          store.reader,
        );
      } finally {
        await store.close();
      }
    });
  });

  test('contratos com o armazém atualizando: 503 com o código próprio, e o resto do módulo segue', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-contratos-atualizando');
      const key = encodeURIComponent(sampleContract(1).pncpControlNumber);
      await withApi(tx, async (call) => {
        const as = { id: account.ownerId, type: 'titular' as const };
        for (const [method, path, body] of [
          ['GET', '/api/tenders/contracts?q=limpeza', undefined],
          ['GET', `/api/tenders/contracts/${key}`, undefined],
          ['PUT', `/api/tenders/contracts/${key}/favorite`, undefined],
          ['POST', '/api/tenders/contract-searches/preview', { terms: ['limpeza'] }],
        ] as const) {
          const response = await call(method, path, { as, ...(body ? { body } : {}) });
          assert.equal(response.status, 503, `${method} ${path}`);
          assert.deepEqual(response.body, {
            success: false,
            code: 'CONTRACT_STORE_UPDATING',
            message: 'Os contratos estão sendo atualizados. Tente de novo em instantes.',
          });
        }
        // Tirar o favorito, listar e salvar buscas, e os editais não dependem do armazém.
        assert.equal((await call('DELETE', `/api/tenders/contracts/${key}/favorite`, { as })).status, 200);
        assert.equal((await call('GET', '/api/tenders/contract-searches', { as })).status, 200);
        // Início: sem busca de contratos nem favorito, o bloco de contratos a vencer responde vazio sem consultar o armazém.
        const emptyExpiring = await call<ExpiringContractsView>('GET', '/api/tenders/dashboard/contracts', { as });
        assert.equal(emptyExpiring.status, 200);
        assert.deepEqual(emptyExpiring.body.data, {
          within30Days: 0,
          within60Days: 0,
          within90Days: 0,
          byCategory: [],
          sources: { savedSearches: 0, favorites: 0 },
        });
        const created = await call<ContractSavedSearchView>('POST', '/api/tenders/contract-searches', { as, body: { name: 'Sem total ainda', terms: ['limpeza'] } });
        assert.equal(created.status, 201);
        assert.equal(created.body.data.activeCount, null);
        // Com uma busca de contratos, só o bloco de contratos a vencer espera o armazém: o painel do Início segue.
        assert.equal((await call('GET', '/api/tenders/dashboard', { as })).status, 200);
        const expiring = await call('GET', '/api/tenders/dashboard/contracts', { as });
        assert.equal(expiring.status, 503);
        assert.deepEqual(expiring.body, {
          success: false,
          code: 'CONTRACT_STORE_UPDATING',
          message: 'Os contratos estão sendo atualizados. Tente de novo em instantes.',
        });
        assert.equal((await call('GET', '/api/tenders/notices?q=qualquercoisa', { as })).status, 200);
      });
    });
  });

  test('status da coleta: os totais de contratos vêm do manifesto do armazém; sem cópia pronta, vêm vazios', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-coleta-contratos');
      const as = { id: account.ownerId, type: 'titular' as const };
      type StatusData = {
        contracts: { contracts: number | null; activeContracts: number | null; countedOn: string | null; backfill: { completedDays: number } };
        federal: { agencies: number; withData: number; withoutData: number; notMeasured: number; loaded: number; fromYear: number; sourceUntil: string | null; load: unknown; cycle: unknown };
      };
      const store = await openTestContractStore([
        sampleContract(1, { expiresOn: '2030-01-01' }),
        sampleContract(2, { expiresOn: '2031-01-01' }),
        sampleContract(3, { expiresOn: null, originalTermEnd: null }),
        sampleContract(4, { termStart: '2024-01-01', originalTermEnd: '2025-01-01', expiresOn: '2025-01-01' }),
      ]);
      try {
        await withApi(
          tx,
          async (call) => {
            const status = await call<StatusData>('GET', '/api/tenders/collection/status', { as });
            assert.equal(status.status, 200);
            assert.deepEqual(
              { ...status.body.data.contracts, backfill: undefined },
              { contracts: 4, activeContracts: 2, countedOn: '2026-10-19', backfill: undefined },
              'a data da contagem dos vigentes é a da publicação',
            );
            assert.equal(typeof status.body.data.contracts.backfill.completedDays, 'number');
            // O bloco dos contratos federais vem do banco (um registro por órgão), não do armazém: números e as duas últimas execuções.
            const federal = status.body.data.federal;
            for (const count of [federal.agencies, federal.withData, federal.withoutData, federal.notMeasured, federal.loaded]) {
              assert.equal(typeof count, 'number');
            }
            assert.equal(federal.agencies, federal.withData + federal.withoutData + federal.notMeasured, 'cada órgão está em um dos três estados');
            assert.ok(federal.fromYear >= 2000);
            assert.ok(federal.sourceUntil === null || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/.test(federal.sourceUntil));
          },
          store.reader,
        );
      } finally {
        await store.close();
      }

      await withApi(tx, async (call) => {
        const status = await call<StatusData>('GET', '/api/tenders/collection/status', { as });
        assert.equal(status.status, 200);
        assert.deepEqual(
          { contracts: status.body.data.contracts.contracts, activeContracts: status.body.data.contracts.activeContracts, countedOn: status.body.data.contracts.countedOn },
          { contracts: null, activeContracts: null, countedOn: null },
        );
      });
    });
  });

  test('página do CNPJ por HTTP: resumo como fornecedor e como órgão, licitações vencidas com paginação e CNPJ sem dados', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-cnpj');
      const supplier = sampleSupplier(SUPPLIER_CNPJ, 'ALFA LTDA');
      const purchase = (sequence: number) => `${AGENCY_CNPJ}-1-${String(sequence).padStart(6, '0')}/2026`;
      const common = { agencyCnpj: AGENCY_CNPJ, agencyName: 'Prefeitura de Teste', supplierDocument: SUPPLIER_CNPJ, supplierName: 'ALFA LTDA' };
      const store = await openTestContractStore(
        [
          sampleContract(1, { ...common, globalValue: '100.00', expiresOn: '2030-01-01', publishedAt: '2026-03-01T10:00:00' }),
          sampleContract(2, { ...common, globalValue: '50.50', termStart: '2024-01-01', originalTermEnd: '2025-01-01', expiresOn: '2025-01-01', publishedAt: '2026-02-01T10:00:00' }),
        ],
        {
          winners: [
            sampleResult(1, { supplier, purchaseControlNumber: purchase(1), valueCents: 100_000, resultDate: '2026-09-10' }),
            sampleResult(2, { supplier, purchaseControlNumber: purchase(1), valueCents: 50_000, resultDate: '2026-09-11' }),
            sampleResult(1, { supplier, purchaseControlNumber: purchase(2), valueCents: 20_000, resultDate: '2026-09-20' }),
            sampleResult(1, { supplier, purchaseControlNumber: purchase(3), valueCents: 5_000, resultDate: '2026-08-01' }),
          ],
        },
      );
      try {
        await withApi(
          tx,
          async (call) => {
            const as = { id: account.ownerId, type: 'titular' as const };

            const asSupplier = await call<CnpjSummary>('GET', `/api/tenders/cnpj/${SUPPLIER_CNPJ}`, { as });
            assert.equal(asSupplier.status, 200);
            const summary = asSupplier.body.data;
            assert.equal(summary.cnpj, SUPPLIER_CNPJ);
            assert.equal(summary.name, 'ALFA LTDA');
            assert.deepEqual(summary.supplier?.contracts, {
              total: 2,
              active: 1,
              totalValue: 150.5,
              firstPublishedAt: '2026-02-01T10:00:00-03:00',
              lastPublishedAt: '2026-03-01T10:00:00-03:00',
            });
            assert.deepEqual(summary.supplier?.winners, {
              purchases: 3,
              items: 4,
              totalValue: 1750,
              firstResultDate: '2026-08-01',
              lastResultDate: '2026-09-20',
              byYear: [{ year: 2026, purchases: 3, items: 4, totalValue: 1750 }],
            });
            assert.deepEqual(summary.supplier?.topAgencies, [{ cnpj: AGENCY_CNPJ, name: 'Prefeitura de Teste', contracts: 2, totalValue: 150.5 }]);
            assert.equal(summary.agency, null, 'o fornecedor não é órgão');
            assert.deepEqual(summary.coverage, { contractsFrom: '2026-02-01', winnersFrom: '2026-08-01', winnersTo: '2026-09-20' });

            // Como órgão: os contratos do armazém e os editais abertos do banco (os encerrados não contam).
            const before = await call<CnpjSummary>('GET', `/api/tenders/cnpj/${AGENCY_CNPJ}`, { as });
            const baseline = before.body.data.agency?.openNotices ?? 0;
            const noticeId = await insertTestNotice(tx, { pncpControlNumber: purchase(2), agencyCnpj: AGENCY_CNPJ, agencyName: 'Prefeitura (edital)', proposalClosesAt: '2099-11-20T09:30:00' });
            await insertTestNotice(tx, { agencyCnpj: AGENCY_CNPJ, agencyName: 'Prefeitura (edital)', proposalClosesAt: '2099-11-21T09:30:00' });
            await insertTestNotice(tx, { agencyCnpj: AGENCY_CNPJ, agencyName: 'Prefeitura (edital)', proposalClosesAt: '2020-01-01T09:30:00' });
            const asAgency = await call<CnpjSummary>('GET', `/api/tenders/cnpj/${AGENCY_CNPJ}`, { as });
            assert.equal(asAgency.status, 200);
            assert.equal(asAgency.body.data.supplier, null, 'o órgão não é fornecedor');
            assert.equal(asAgency.body.data.name, 'Prefeitura de Teste', 'o nome mais recente do armazém vale antes do edital');
            assert.equal(asAgency.body.data.agency?.openNotices, baseline + 2);
            assert.deepEqual(asAgency.body.data.agency?.contracts, {
              total: 2,
              active: 1,
              totalValue: 150.5,
              firstPublishedAt: '2026-02-01T10:00:00-03:00',
              lastPublishedAt: '2026-03-01T10:00:00-03:00',
            });
            assert.deepEqual(asAgency.body.data.agency?.topSuppliers, [{ cnpj: SUPPLIER_CNPJ, name: 'ALFA LTDA', contracts: 2, totalValue: 150.5 }]);

            // Licitações vencidas: a mais recente primeiro, 2 por página, o edital ligado só onde ele existe.
            const first = await call<Paginated<CnpjWinnerItem>>('GET', `/api/tenders/cnpj/${SUPPLIER_CNPJ}/winners?perPage=2`, { as });
            assert.equal(first.status, 200);
            assert.deepEqual(
              { page: first.body.data.page, perPage: first.body.data.perPage, total: first.body.data.total, totalPages: first.body.data.totalPages },
              { page: 1, perPage: 2, total: 3, totalPages: 2 },
            );
            assert.deepEqual(first.body.data.items.map((item) => [item.purchaseControlNumber, item.items, item.totalValue, item.noticeId]), [
              [purchase(2), 1, 200, noticeId],
              [purchase(1), 2, 1500, null],
            ]);
            assert.equal(first.body.data.items[0]?.agencyName, 'Prefeitura (edital)', 'a fonte de resultados não traz o nome do órgão; o edital traz');
            assert.equal(first.body.data.items[1]?.agencyName, null);
            assert.equal(first.body.data.items[1]?.link, `https://pncp.gov.br/app/editais/${AGENCY_CNPJ}/2026/1`);
            const second = await call<Paginated<CnpjWinnerItem>>('GET', `/api/tenders/cnpj/${SUPPLIER_CNPJ}/winners?perPage=2&page=2`, { as });
            assert.deepEqual(second.body.data.items.map((item) => item.purchaseControlNumber), [purchase(3)]);
            const standard = await call<Paginated<CnpjWinnerItem>>('GET', `/api/tenders/cnpj/${SUPPLIER_CNPJ}/winners`, { as });
            assert.equal(standard.body.data.perPage, 10, 'o padrão da página do CNPJ é 10');

            // CNPJ válido sem nenhum dado: 200, os dois blocos nulos e a cobertura.
            const empty = await call<CnpjSummary>('GET', `/api/tenders/cnpj/${UNKNOWN_CNPJ}`, { as });
            assert.equal(empty.status, 200);
            assert.deepEqual(empty.body.data, { cnpj: UNKNOWN_CNPJ, name: null, supplier: null, agency: null, coverage: summary.coverage });
            const noWins = await call<Paginated<CnpjWinnerItem>>('GET', `/api/tenders/cnpj/${UNKNOWN_CNPJ}/winners`, { as });
            assert.deepEqual(noWins.body.data, { items: [], page: 1, perPage: 10, total: 0, totalPages: 0 });
          },
          store.reader,
        );
      } finally {
        await store.close();
      }
    });
  });

  test('página do CNPJ: CNPJ inválido e paginação fora da faixa, 400; sem cópia do armazém, 503; limite por pessoa, 429', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-cnpj-validacao');
      await withApi(tx, async (call) => {
        const as = { id: account.ownerId, type: 'titular' as const };
        for (const invalid of ['123', 'abc', '11222333000182', '00000000000000', '112223330001811', encodeURIComponent('11.222.333/0001-81')]) {
          for (const path of [`/api/tenders/cnpj/${invalid}`, `/api/tenders/cnpj/${invalid}/winners`]) {
            const response = await call('GET', path, { as });
            assert.equal(response.status, 400, path);
            assert.equal(response.body.message, 'Validation error');
            assert.deepEqual(response.body.errors, [{ field: 'cnpj', message: 'CNPJ inválido' }]);
          }
        }
        const badPage = await call('GET', `/api/tenders/cnpj/${SUPPLIER_CNPJ}/winners?perPage=51&page=0`, { as });
        assert.equal(badPage.status, 400);
        assert.deepEqual(badPage.body.errors?.map((error) => error.field).sort(), ['page', 'perPage']);

        // O armazém sem cópia pronta (padrão do withApi): o resumo e as vitórias esperam, com o código próprio.
        for (const path of [`/api/tenders/cnpj/${SUPPLIER_CNPJ}`, `/api/tenders/cnpj/${SUPPLIER_CNPJ}/winners`]) {
          const response = await call('GET', path, { as });
          assert.equal(response.status, 503, path);
          assert.deepEqual(response.body, {
            success: false,
            code: 'CONTRACT_STORE_UPDATING',
            message: 'Os contratos estão sendo atualizados. Tente de novo em instantes.',
          });
        }
      });

      // O limite é por pessoa e conta todos os pedidos, válidos ou não.
      await withApi(tx, async (call) => {
        const as = { id: account.ownerId, type: 'titular' as const };
        for (let index = 0; index < CNPJ_RATE_LIMIT.max; index += 1) {
          assert.equal((await call('GET', '/api/tenders/cnpj/123', { as })).status, 400);
        }
        const limited = await call('GET', '/api/tenders/cnpj/123', { as });
        assert.equal(limited.status, 429);
        assert.equal(limited.body.success, false);
      });
    });
  });

  test('prévia limitada por usuário', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-previa');
      const token = uniqueToken();
      await withApi(tx, async (call) => {
        const as = { id: account.ownerId, type: 'titular' as const };
        const body = { terms: [token] };
        for (let index = 0; index < PREVIEW_RATE_LIMIT.max; index += 1) {
          assert.equal((await call('POST', '/api/tenders/saved-searches/preview', { as, body })).status, 200);
        }
        const limited = await call('POST', '/api/tenders/saved-searches/preview', { as, body });
        assert.equal(limited.status, 429);
        assert.equal(limited.body.success, false);
      });
    });
  });
});
