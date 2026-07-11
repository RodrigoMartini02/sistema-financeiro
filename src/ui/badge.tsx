import type { ReactNode } from 'react';

type Tone = 'income' | 'expense' | 'neutral' | 'warning';

interface BadgeProps { tone?: Tone; children: ReactNode; }

const tones: Record<Tone, string> = {
  income: 'bg-green-100 text-green-700',
  expense: 'bg-red-100 text-red-700',
  neutral: 'bg-slate-100 text-slate-600',
  warning: 'bg-amber-100 text-amber-700',
};

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return (
    <span className={['inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', tones[tone]].join(' ')}>
      {children}
    </span>
  );
}
