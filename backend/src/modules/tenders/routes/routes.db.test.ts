import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, describe, test } from 'node:test';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { TendersDb } from '../collector/database';
import { closeLocalTestDatabase, createTestAccount, databaseTestsSkipReason, insertTestNotice, withRollback } from '../collector/dbTestSupport';
import type { TenderAccount } from '../services/access';
import { addAccountMember, uniqueToken } from '../services/apiTestSupport';
import type { DashboardView } from '../services/dashboard';
import type { DomainLists } from '../services/domainLists';
import type { NoticeDetail, TrackingHistoryEntry } from '../services/noticeDetail';
import type { NoticeListItem, NoticeTracking, Paginated } from '../services/noticeSearch';
import type { SavedSearchView } from '../services/savedSearches';
import type { EnabledAccountView, TeamMemberView } from '../services/team';
import { createTendersRoutes } from './index';
import { PREVIEW_RATE_LIMIT } from './savedSearches';

// Rotas por HTTP, montadas como no server.ts (authenticate simulado com o
// usuário do teste) e com o banco da transação desfeita do teste.

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
  permissions: { manageTeam: boolean; viewCollectionRuns: boolean };
}

type SearchData = Paginated<NoticeListItem> & {
  parsedQuery: { terms: string[]; excludedTerms: string[]; termsMode: string };
};

type ApiCall = <T = unknown>(method: string, path: string, options?: { as: TestUser; body?: unknown }) => Promise<ApiResponse<T>>;

async function withApi(tx: TendersDb, run: (call: ApiCall) => Promise<void>): Promise<void> {
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
        assert.deepEqual(access.body.data.permissions, { manageTeam: true, viewCollectionRuns: true });

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
        assert.deepEqual(access.body.data.permissions, { manageTeam: false, viewCollectionRuns: false });
        assert.equal((await call('GET', '/api/tenders/notices', { as })).status, 200);
        assert.equal((await call('GET', '/api/tenders/team', { as })).status, 403);
        assert.equal((await call('PUT', `/api/tenders/team/${member}`, { as, body: { hasAccess: true } })).status, 403);
        assert.equal((await call('GET', '/api/tenders/collection/runs', { as })).status, 403);
        assert.equal((await call('GET', '/api/tenders/collection/status', { as })).status, 200);
      });
    });
  });

  test('titular concede acesso pela equipe; admin habilita conta pela rota de admin', async () => {
    await withRollback(async (tx) => {
      const admin = await createTestAccount(tx, 'http-admin');
      const client = await createTestAccount(tx, 'http-admin-cliente', { enabled: false });
      const member = await addAccountMember(tx, client, 'http-admin-membro', { access: false });
      await withApi(tx, async (call) => {
        const titular = { id: client.ownerId, type: 'titular' as const };
        const platformAdmin = { id: admin.ownerId, type: 'admin' as const };
        assert.equal((await call('GET', '/api/tenders/access', { as: titular })).status, 404);

        assert.equal((await call('PUT', `/api/tenders/admin/accounts/${client.accountId}`, { as: titular, body: { active: true } })).status, 403);
        assert.equal((await call('PUT', `/api/tenders/admin/accounts/${client.accountId}`, { as: platformAdmin, body: {} })).status, 400);
        const enabled = await call<EnabledAccountView>('PUT', `/api/tenders/admin/accounts/${client.accountId}`, {
          as: platformAdmin,
          body: { active: true },
        });
        assert.equal(enabled.status, 200);
        assert.equal(enabled.body.data.active, true);
        assert.equal((await call('PUT', '/api/tenders/admin/accounts/999999999', { as: platformAdmin, body: { active: true } })).status, 404);

        assert.equal((await call('GET', '/api/tenders/access', { as: titular })).status, 200);
        assert.equal((await call('GET', '/api/tenders/access', { as: { id: member, type: 'membro' } })).status, 403);
        const granted = await call<TeamMemberView>('PUT', `/api/tenders/team/${member}`, { as: titular, body: { hasAccess: true } });
        assert.equal(granted.body.data.hasAccess, true);
        assert.equal((await call('GET', '/api/tenders/access', { as: { id: member, type: 'membro' } })).status, 200);
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
