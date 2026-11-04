import type { ReactNode } from 'react';
import type { TrackingStatus } from '../types';
import { TRACKING_STATUS_LABELS } from '../utils/labels';

// Selo pequeno do módulo, com as cores do tema claro e do escuro (o Badge de
// src/ui só tem o claro).

export type PillTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'muted';

const TONES: Record<PillTone, string> = {
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  brand: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/30',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  danger: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  muted: 'bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400',
};

interface PillProps {
  tone?: PillTone;
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
}

export function Pill({ tone = 'neutral', icon, title, children }: PillProps) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 ${TONES[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}

const TRACKING_TONES: Record<TrackingStatus, PillTone> = {
  ANALISAR: 'brand',
  PARTICIPAR: 'success',
  DESCARTADO: 'muted',
};

/** Status do acompanhamento da conta. */
export function TrackingStatusPill({ status }: { status: TrackingStatus }) {
  return <Pill tone={TRACKING_TONES[status]}>{TRACKING_STATUS_LABELS[status]}</Pill>;
}
