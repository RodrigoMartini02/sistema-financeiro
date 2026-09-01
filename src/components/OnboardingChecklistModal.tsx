import { useEffect } from 'react';
import { Check, Compass, X } from 'lucide-react';
import type { OnboardingChecklistItem, OnboardingTarget } from '../hooks/useOnboardingChecklist';
import { Z_MODAL } from '../ui/zIndex';

interface OnboardingChecklistModalProps {
  open: boolean;
  items: OnboardingChecklistItem[];
  onDismiss: () => void;
  onGoToTarget: (target: OnboardingTarget) => void;
}

export function OnboardingChecklistModal({ open, items, onDismiss, onGoToTarget }: OnboardingChecklistModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div className={['fixed inset-0 flex items-center justify-center p-4', Z_MODAL].join(' ')}>
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onDismiss} />
      <div
        className={[
          'relative flex w-full max-w-md flex-col gap-4 rounded-2xl border px-5 py-4 text-sm leading-6 shadow-lg',
          'border-cyan-300 bg-cyan-50 text-slate-800 shadow-cyan-900/10',
          'dark:border-cyan-700/70 dark:bg-cyan-950 dark:text-cyan-50 dark:shadow-black/20',
        ].join(' ')}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-cyan-700 shadow-sm ring-1 ring-cyan-200 dark:bg-cyan-900 dark:text-cyan-100 dark:ring-cyan-700" aria-hidden="true">
            <Compass size={17} strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900 dark:text-white">Vamos configurar seu sistema</p>
            <p className="mt-0.5 text-xs font-normal text-slate-500 dark:text-cyan-100/70">
              Alguns cadastros ajudam a aproveitar melhor despesas e receitas. Configure quando quiser.
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-cyan-700/60 transition hover:bg-white hover:text-cyan-900 dark:text-cyan-100/70 dark:hover:bg-cyan-900 dark:hover:text-white"
            aria-label="Fechar guia"
          >
            <X size={14} />
          </button>
        </div>

        <div className="grid gap-2">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => { onGoToTarget(item.target); onDismiss(); }}
              className="flex items-start gap-3 rounded-xl border border-cyan-200 bg-white px-3 py-2.5 text-left transition hover:border-cyan-400 hover:bg-cyan-50 dark:border-cyan-800 dark:bg-cyan-900/40 dark:hover:border-cyan-600 dark:hover:bg-cyan-900/70"
            >
              <span
                className={[
                  'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  item.done
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200'
                    : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-800 dark:text-cyan-100',
                ].join(' ')}
              >
                {item.done ? <Check size={13} /> : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <p className={['text-sm font-semibold', item.done ? 'text-slate-400 line-through dark:text-cyan-300/50' : 'text-slate-900 dark:text-white'].join(' ')}>
                  {item.label}
                </p>
                <p className="mt-0.5 text-xs font-normal text-slate-500 dark:text-cyan-100/70">{item.description}</p>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
