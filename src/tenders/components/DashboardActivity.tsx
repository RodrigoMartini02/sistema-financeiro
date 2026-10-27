import { Bell, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../ui/EmptyState';
import { useOpenNotification } from '../hooks/useNotificationActions';
import type { DashboardView } from '../types';
import { funnelBars } from '../utils/dashboard';
import { formatIsoDateTime } from '../utils/dates';
import { NOTIFICATION_TYPE_LABELS } from '../utils/labels';
import { CountBars } from './CountBars';
import { panelLinkClass } from './DashboardPanel';

/** Funil de acompanhamento da conta: em análise, vou participar e descartados, e quantos entraram nos últimos 7 e 30 dias. */
export function FunnelChart({ funnel }: { funnel: DashboardView['funnel'] }) {
  const total = funnel.analyzing + funnel.participating + funnel.discarded;
  if (total === 0) {
    return (
      <EmptyState
        icon={Filter}
        title="Nenhum edital acompanhado ainda."
        description="Marque Analisar ou Vou participar nos editais da busca para montar o funil."
        action={
          <Link to="/buscar" className={panelLinkClass}>
            Buscar editais
          </Link>
        }
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3">
      <CountBars label="Funil de acompanhamento" labelSize="wide" items={funnelBars(funnel)} />
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Entraram no acompanhamento: {funnel.enteredLast7Days.toLocaleString('pt-BR')} em 7 dias · {funnel.enteredLast30Days.toLocaleString('pt-BR')} em 30 dias.
        Em análise e Vou participar contam só os editais ainda abertos.
      </p>
    </div>
  );
}

/** As notificações não lidas mais recentes; o clique marca como lida e abre o edital ou o contrato. */
export function UnreadNotifications({ notifications }: { notifications: DashboardView['notifications'] }) {
  const open = useOpenNotification();
  if (notifications.recent.length === 0) {
    return <EmptyState icon={Bell} title="Nenhuma notificação não lida." />;
  }
  const hidden = notifications.unreadCount - notifications.recent.length;
  return (
    <div className="grid grid-cols-1 gap-2">
      <ul className="divide-y divide-slate-100 dark:divide-slate-700">
        {notifications.recent.map((notification) => (
          <li key={notification.id} className="py-2 first:pt-0 last:pb-0">
            <button
              type="button"
              onClick={() => open(notification)}
              className="group block w-full rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden="true" />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                  {NOTIFICATION_TYPE_LABELS[notification.type]}
                </span>
                <span className="text-[11px] tabular-nums text-slate-400">{formatIsoDateTime(notification.createdAt)}</span>
              </span>
              <span className="mt-0.5 block line-clamp-2 text-sm font-semibold text-slate-800 group-hover:text-brand-700 group-hover:underline dark:text-slate-100 dark:group-hover:text-brand-300">
                {notification.title}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <Link to="/notificacoes" className={panelLinkClass}>
          Mais {hidden.toLocaleString('pt-BR')} não {hidden === 1 ? 'lida' : 'lidas'}
        </Link>
      )}
    </div>
  );
}
