import type { HTMLAttributes } from 'react';

export function Card({ className = '', children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={['rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden dark:border-slate-700 dark:bg-slate-800', className].join(' ')} {...props}>
      {children}
    </div>
  );
}
