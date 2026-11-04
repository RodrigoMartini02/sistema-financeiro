import type { HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  allowOverflow?: boolean;
}

export function Card({ className = '', allowOverflow = false, children, ...props }: CardProps) {
  return (
    <div className={['rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800', allowOverflow ? 'overflow-visible' : 'overflow-hidden', className].join(' ')} {...props}>
      {children}
    </div>
  );
}
