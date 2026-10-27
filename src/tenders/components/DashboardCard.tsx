import type { ReactNode } from 'react';

/** Link de texto do canto de um bloco do Dashboard ("Ver contratos"). */
export const dashboardLinkClass = 'text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300';

interface DashboardCardProps {
  title: string;
  /** Linha pequena sob o título: o que o bloco conta e o período. */
  subtitle?: string;
  /** O canto direito: um alternador ou um link. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A casca dos blocos do Dashboard: título, subtítulo, ação no canto e o conteúdo. */
export function DashboardCard({ title, subtitle, action, children, className = '' }: DashboardCardProps) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
