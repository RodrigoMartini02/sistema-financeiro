import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { usePwaUpdate } from '../pwa/usePwaUpdate';

const AUTO_UPDATE_TIMEOUT_MS = 10 * 60 * 1000;

export function UpdatePwaBanner() {
  const { updateAvailable, applyUpdate } = usePwaUpdate();

  useEffect(() => {
    if (!updateAvailable) return;

    const handleVisibilityChange = () => {
      if (document.hidden) applyUpdate();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const timeoutId = window.setTimeout(applyUpdate, AUTO_UPDATE_TIMEOUT_MS);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearTimeout(timeoutId);
    };
  }, [updateAvailable, applyUpdate]);

  if (!updateAvailable) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-cyan-200 bg-white p-4 shadow-2xl dark:border-cyan-900/70 dark:bg-slate-900">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0891b2] text-white">
          <RefreshCw size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-white">Nova versão disponível</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Atualize para pegar as últimas melhorias.</p>
        </div>
        <button
          type="button"
          onClick={applyUpdate}
          className="shrink-0 rounded-lg bg-[#0891b2] px-3.5 py-2 text-xs font-bold text-white transition hover:bg-[#0e7490]"
        >
          Atualizar
        </button>
      </div>
    </div>
  );
}
