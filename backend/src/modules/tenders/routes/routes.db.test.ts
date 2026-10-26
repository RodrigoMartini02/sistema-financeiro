import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, describe, test } from 'node:test';
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
import { tenderEnabledAccounts } from '../db/schema';
import type { TenderAccount } from '../services/access';
import type { CnpjSummary, CnpjWinnerItem } from '../services/cnpjPage';
import type { ContractDetail } from '../services/contractDetail';
import type { ContractSavedSearchView } from '../services/contractSavedSearches';
import type { ContractListItem } from '../services/contractSearch';
import { addAccountMember, uniqueToken } from '../services/apiTestSupport';
import type { DashboardView } from '../services/dashboard';
import type { DomainLists } from '../services/domainLists';
import type { NoticeDetail, TrackingHistoryEntry } from '../services/noticeDetail';
import type { NoticeListItem, NoticeTracking, Paginated } from '../services/noticeSearch';
import type { SavedSearchView } from '../services/savedSearches';
import type { SubscriptionView } from '../services/subscription';
import type { CourtesyChangeView, TeamMemberView, TenderAccountAdminView } from '../services/team';
import { CNPJ_RATE_LIMIT } from './cnpj';
import { createTendersRoutes } from './index';
import { PREVIEW_RATE_LIMIT } from './savedSearches';

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
  permissions: { manageTeam: boolean; manageBilling: boolean; viewCollectionRuns: boolean; manageEnabledAccounts: boolean };
  subscription: SubscriptionView | null;
}

interface TeamChange {
  member: TeamMemberView;
  warning: string | null;
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

/** O armazém de contratos ainda sem cópia pronta (o servidor acabou de subir): as buscas de contratos esperam. */
const UPDATING_STORE: ContractStoreAccess = {
  query: () => Promise.reject(new ContractStoreUnavailableError()),
  status: () => ({ ready: false, revision: null, publishedAt: null, today: null, totals: null }),
};

async function withApi(tx: TendersDb, run: (call: ApiCall) => Promise<void>, contractStore: ContractStoreAccess = UPDATING_STORE): Promise<void> {
  let currentUser: TestUser | undefined;
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (currentUser) {
      req.user = { ...currentUser, document: '', role: null };
    }
    next();
  });
  const { routes, adminRoutes } = createTendersRoutes({
    db: tx,
    pncpDetails: { fetchDetailList: async () => [] },
    contractStore,
    now: () => new Date(),
  });
  app.use(
    '/api/tenders/admin',
    (req: Request, res: Response, next: NextFunction) => {
      if (req.user?.type !== 'admin') {
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
          manageTeam: true, manageBilling: true, viewCollectionRuns: true, manageEnabledAccounts: false,
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
          manageTeam: false, manageBilling: false, viewCollectionRuns: false, manageEnabledAccounts: false,
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

  test('ativação e assinatura vencida: 402 para titular e colaborador; cobrança fica fora da trava', async () => {
    await withRollback(async (tx) => {
      const account = await createTestAccount(tx, 'http-ativacao', { enabled: false });
      const member = await addAccountMember(tx, account, 'http-ativacao-membro', { access: true });
      await withApi(tx, async (call) => {
        const titular = { id: account.ownerId, type: 'titular' as const };
        const asMember = { id: member, type: 'membro' as const };

        const activatable = await call<{ canActivate: boolean; accounts: TenderAccount[] }>('GET', '/api/tenders/activation', { as: titular });
        assert.deepEqual(
          { canActivate: activatable.body.data.canActivate, ids: activatable.body.data.accounts.map((owned) => owned.id) },
          { canActivate: true, ids: [account.accountId] },
        );
        assert.equal((await call<{ canActivate: boolean }>('GET', '/api/tenders/activation', { as: asMember })).body.data.canActivate, false);
        assert.equal((await call('POST', '/api/tenders/activation', { as: titular, body: {} })).status, 400);
        assert.equal((await call('POST', '/api/tenders/activation', { as: titular, body: { accountId: account.accountId } })).status, 201);
        assert.equal((await call('POST', '/api/tenders/activation', { as: titular, body: { accountId: account.accountId } })).status, 409);

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
          nome: `Usuário ${label}`,
          email: `licitacoes-http-${label}-${Date.now()}@exemplo.test`,
          senha: 'senha-forte-1',
        });

        const first = await call<TeamChange>('POST', '/api/tenders/team', { as: titular, body: newUser('um') });
        assert.equal(first.status, 201);
        assert.equal(first.body.data.member.hasAccess, true);
        const second = newUser('dois');
        assert.equal((await call('POST', '/api/tenders/team', { as: titular, body: second })).status, 201);
        assert.equal((await call('POST', '/api/tenders/team', { as: titular, body: second })).status, 400, 'e-mail repetido');
        assert.equal((await call('POST', '/api/tenders/team', { as: titular, body: { nome: 'Sem senha', email: 'x@exemplo.test' } })).status, 400);

        const billing = await call<BillingData>('GET', `/api/tenders/billing?accountId=${account.accountId}`, { as: titular });
        assert.equal(billing.body.data.subscription.accessType, 'cortesia');
        assert.equal(billing.body.data.subscription.usersCount, 3);
        assert.equal(billing.body.data.subscription.monthlyAmountCents, 798);
        assert.equal((await call('POST', '/api/tenders/billing/pix', { as: titular, body: { accountId: account.accountId } })).status, 409);
      });
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
        const created = await call<ContractSavedSearchView>('POST', '/api/tenders/contract-searches', { as, body: { name: 'Sem total ainda', terms: ['limpeza'] } });
        assert.equal(created.status, 201);
        assert.equal(created.body.data.activeCount, null);
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
