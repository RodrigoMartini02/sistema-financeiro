import { Bell, Bookmark, ClipboardList, LayoutDashboard, Search, Settings, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import type { TendersRoute, TendersRouteKey } from '../utils/navigation';

// Menu lateral do módulo, no estilo do app de finanças (AppShell). No modo
// `responsive`, os rótulos só aparecem a partir de 1280 px (menu recolhido em
// ícones de 768 a 1279 px); na gaveta do celular, sempre.

const ICONS: Record<TendersRouteKey, LucideIcon> = {
  inicio: LayoutDashboard,
  buscar: Search,
  edital: Search,
  buscas: Bookmark,
  acompanhamento: ClipboardList,
  notificacoes: Bell,
  configuracoes: Settings,
};

interface TendersSidebarProps {
  routes: TendersRoute[];
  labels: 'responsive' | 'always';
  onNavigate?: () => void;
}

export function TendersSidebar({ routes, labels, onNavigate }: TendersSidebarProps) {
  const labelClass = labels === 'always' ? '' : 'hidden xl:inline';
  return (
    <div className="flex h-full flex-col bg-[#0D2E3C]">
      <div className="border-b border-[rgba(14,196,216,0.15)] bg-[#0A2530] px-3 py-5 xl:px-5">
        <div className={`flex items-center gap-3 ${labels === 'always' ? 'justify-start px-2' : 'justify-center xl:justify-start'}`}>
          <img src="/icons/fingerence-logo.webp" alt="" className="h-10 w-10 shrink-0 object-contain" />
          <div className={labels === 'always' ? '' : 'hidden xl:block'}>
            <p
              className="leading-none tracking-[0.22em] text-[#E8F4F5]"
              style={{ fontFamily: "'Cinzel', serif", fontSize: '11px', fontWeight: 600, fontStyle: 'italic' }}
            >
              FINGERENCE
            </p>
            <p className="mt-1 text-[10px] font-medium text-[rgba(14,196,216,0.55)]">Licitações</p>
          </div>
        </div>
      </div>

      <nav aria-label="Menu de Licitações" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3 xl:px-3">
        {routes.map((route) => {
          const Icon = ICONS[route.key];
          return (
            <NavLink
              key={route.key}
              to={route.path}
              end={route.path === '/'}
              onClick={onNavigate}
              title={route.title}
              aria-label={labels === 'always' ? undefined : route.title}
              className={({ isActive }) =>
                [
                  'relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0EC4D8]',
                  labels === 'always' ? '' : 'justify-center xl:justify-start',
                  isActive
                    ? 'bg-[rgba(14,196,216,0.10)] font-semibold text-[#0EC4D8]'
                    : 'text-[#E8F4F5] hover:bg-[rgba(14,196,216,0.06)]',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-[#0EC4D8]" />}
                  <Icon size={17} aria-hidden="true" />
                  <span className={labelClass}>{route.title}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-[rgba(14,196,216,0.12)] px-4 py-3">
        <a
          href="/app.html"
          className={`text-[10.5px] text-[rgba(14,196,216,0.45)] hover:text-[#0EC4D8] ${labels === 'always' ? '' : 'hidden xl:inline'}`}
        >
          FINGERENCE
        </a>
      </div>
    </div>
  );
}
