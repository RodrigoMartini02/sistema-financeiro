import type { ReactNode } from 'react';

/** Link de texto do canto de um painel do Início ("Ver todas"). */
export const panelLinkClass = 'text-xs font-semibold text-brand-700 hover:underline dark:text-brand-300';

/** A casca dos blocos do Início: título, ação opcional no canto e o conteúdo. */
export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
