import { AlertCircle, DatabaseZap, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '../../ui/button';

// Carregando e erro dentro das telas do módulo. O LoadingState de src/ui/states
// ocupa a tela inteira e o ErrorState não tem o tema escuro nem "tentar de novo".

export function LoadingBlock({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500 dark:text-slate-400">
      <Loader2 size={18} className="animate-spin text-brand-600 dark:text-brand-400" aria-hidden="true" />
      {label}
    </div>
  );
}

/**
 * Os contratos estão sendo atualizados (o servidor acabou de subir ou trocou os
 * arquivos): não é uma falha, e a tela tenta de novo sozinha. A mensagem vem da
 * API, que também guarda o código CONTRACT_STORE_UPDATING.
 */
export function ContractsUpdating({
  message = 'Os contratos estão sendo atualizados. Tente de novo em instantes.',
  onRetry,
  retrying = false,
}: {
  message?: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-5 text-center dark:border-brand-500/30 dark:bg-brand-500/10"
    >
      <DatabaseZap size={22} className="text-brand-600 dark:text-brand-300" aria-hidden="true" />
      <p className="text-sm font-semibold text-brand-800 dark:text-brand-200">Atualizando os contratos</p>
      <p className="text-xs text-brand-700 dark:text-brand-200/90">{message}</p>
      {onRetry && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onRetry}
          disabled={retrying}
          className="mt-1"
          icon={<RefreshCw size={14} className={retrying ? 'animate-spin' : ''} aria-hidden="true" />}
        >
          Tentar de novo
        </Button>
      )}
    </div>
  );
}

interface LoadErrorProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}

export function LoadError({ title = 'Não foi possível carregar', message, onRetry, retrying = false }: LoadErrorProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-center dark:border-red-500/30 dark:bg-red-500/10"
    >
      <AlertCircle size={22} className="text-red-500 dark:text-red-400" aria-hidden="true" />
      <p className="text-sm font-semibold text-red-700 dark:text-red-300">{title}</p>
      <p className="text-xs text-red-600 dark:text-red-300/90">{message}</p>
      {onRetry && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onRetry}
          disabled={retrying}
          className="mt-1"
          icon={<RefreshCw size={14} className={retrying ? 'animate-spin' : ''} aria-hidden="true" />}
        >
          Tentar de novo
        </Button>
      )}
    </div>
  );
}
