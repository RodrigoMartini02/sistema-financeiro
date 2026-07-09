import { useState, useEffect } from 'react';
import { Cookie, X, ShieldCheck } from 'lucide-react';
import { TermosModal } from '../screens/public/TermosModal';

const STORAGE_KEY = 'lgpd_consent';

export type ConsentLevel = 'all' | 'essential';

export function getConsent(): ConsentLevel | null {
  try { return localStorage.getItem(STORAGE_KEY) as ConsentLevel | null; } catch { return null; }
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [privOpen, setPrivOpen] = useState(false);

  useEffect(() => {
    if (!getConsent()) setVisible(true);
  }, []);

  const accept = (level: ConsentLevel) => {
    localStorage.setItem(STORAGE_KEY, level);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6">
          {/* Icon + text */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100">
              <Cookie size={16} className="text-brand-600" />
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Usamos cookies essenciais para o funcionamento do sistema e, com seu consentimento, cookies analíticos para melhorar a experiência.
              Consulte nossa{' '}
              <button
                type="button"
                onClick={() => setPrivOpen(true)}
                className="font-semibold text-brand-600 underline underline-offset-2 hover:text-brand-700"
              >
                Política de Privacidade e LGPD
              </button>
              .
            </p>
          </div>

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => accept('essential')}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition whitespace-nowrap"
            >
              Apenas essenciais
            </button>
            <button
              type="button"
              onClick={() => accept('all')}
              className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition whitespace-nowrap"
            >
              <ShieldCheck size={14} /> Aceitar todos
            </button>
            <button
              type="button"
              onClick={() => accept('essential')}
              aria-label="Fechar"
              className="ml-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      <TermosModal open={privOpen} tipo="privacidade" onClose={() => setPrivOpen(false)} />
    </>
  );
}
