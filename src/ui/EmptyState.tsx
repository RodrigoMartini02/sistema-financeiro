import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, icon: Icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-slate-400 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      {Icon && <Icon size={28} strokeWidth={1.5} />}
      <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{title}</p>
      {description && <p className="text-xs text-slate-400">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
