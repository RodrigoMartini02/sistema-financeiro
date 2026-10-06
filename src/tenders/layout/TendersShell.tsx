import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { CONFIG_SCOPE_CLASS } from '../../ui/configTokens';
import { Z_MOBILE_NAV_OVERLAY } from '../../ui/zIndex';
import { useFinanceAccess } from '../hooks/useFinanceAccess';
import type { TenderAccess } from '../hooks/useTenderAccess';
import { useUnreadNotificationsCount } from '../hooks/useUnreadNotificationsCount';
import { readLoggedUserName } from '../utils/loggedUser';
import { NOT_FOUND_TITLE, menuRoutes, routeForPath } from '../utils/navigation';
import { TendersSidebar } from './TendersSidebar';
import { TendersTopBar } from './TendersTopBar';

// Moldura do módulo (escopo, seção 9.3). Responsivo: a partir de 1280 px o
// menu completo; de 768 a 1279 px, recolhido em ícones; abaixo de 768 px,
// gaveta aberta pela barra superior.

export function TendersShell({ access }: { access: TenderAccess }) {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const unreadCount = useUnreadNotificationsCount(true);
  const showFinanceLink = useFinanceAccess(true);
  const routes = menuRoutes(access.permissions);
  const title = routeForPath(location.pathname)?.title ?? NOT_FOUND_TITLE;

  useEffect(() => {
    document.title = `${title} · Licitações`;
  }, [title]);

  useEffect(() => {
    if (!drawerOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [drawerOpen]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <aside className="fixed inset-y-0 left-0 hidden w-16 border-r border-[rgba(14,196,216,0.18)] shadow-sm md:flex md:flex-col xl:w-64">
        <TendersSidebar routes={routes} labels="responsive" />
      </aside>

      {drawerOpen && (
        <div className={`fixed inset-0 md:hidden ${Z_MOBILE_NAV_OVERLAY}`}>
          <div className="absolute inset-0 bg-[#040E12]/60 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <aside aria-label="Menu" className="absolute inset-y-0 left-0 flex w-64 flex-col shadow-2xl">
            <TendersSidebar routes={routes} labels="always" onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="md:pl-16 xl:pl-64">
        <TendersTopBar
          title={title}
          unreadCount={unreadCount.data ?? 0}
          userName={readLoggedUserName()}
          accountName={access.account.name}
          showFinanceLink={showFinanceLink}
          onOpenMenu={() => setDrawerOpen(true)}
        />
        {/* Tokens de tela (claro e escuro) do `.config-scope`, os mesmos que o EmptyState usa. */}
        <main className={`${CONFIG_SCOPE_CLASS} px-4 py-6 sm:px-6 lg:px-8`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
