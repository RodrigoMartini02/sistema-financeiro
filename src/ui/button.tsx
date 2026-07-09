import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: ReactNode;
}

const styles = {
  primary:   'bg-brand-600 text-white hover:bg-brand-700 shadow-sm focus:ring-brand-200',
  secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shadow-sm focus:ring-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600',
  ghost:     'bg-transparent text-slate-600 hover:bg-slate-100 focus:ring-slate-200 dark:text-slate-400 dark:hover:bg-slate-800',
  danger:    'bg-red-600 text-white hover:bg-red-700 shadow-sm focus:ring-red-200',
};

export function Button({ variant = 'primary', icon, children, className = '', disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-[14px] px-5 py-2.5 text-sm font-semibold transition-all',
        'focus:outline-none focus:ring-2 focus:ring-offset-1',
        'disabled:opacity-50 disabled:pointer-events-none',
        styles[variant],
        className,
      ].join(' ')}
    >
      {icon}
      {children}
    </button>
  );
}
