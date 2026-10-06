import { AlertCircle, Lock, RefreshCw } from 'lucide-react';
import { logout } from '../../services/session';
import { TENDERS_APP_BASE } from '../utils/modulePaths';

// Telas da entrada no módulo fora do sistema: sem acesso e erro ao conferir o acesso.

const FINANCE_APP_PATH = '/app.html';

function GateCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {children}
      </div>
    </div>
  );
}

const primaryButton =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';
const secondaryButton =
  'inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800';

function signOut() {
  logout();
  window.location.replace(TENDERS_APP_BASE);
}

/** Conta sem o módulo (404) ou colaborador sem acesso liberado (403). */
export function NoAccessScreen({ reason }: { reason: 'noModule' | 'memberWithoutAccess' }) {
  return (
    <GateCard>
      <Lock size={28} className="mx-auto text-slate-400" aria-hidden="true" />
      <h1 className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">Sua conta não tem acesso a Licitações</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        {reason === 'memberWithoutAccess'
          ? 'O titular da conta ainda não liberou o seu acesso ao módulo. Peça a ele em Configurações → Equipe.'
          : 'O módulo de Licitações não está habilitado para esta conta.'}
      </p>
      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        <a href={FINANCE_APP_PATH} className={primaryButton}>
          Ir para o FINGERENCE
        </a>
        <button type="button" onClick={signOut} className={secondaryButton}>
          Sair
        </button>
      </div>
    </GateCard>
  );
}

/** Falha ao conferir o acesso (rede ou servidor). */
export function GateErrorScreen({ message, onRetry, retrying }: { message: string; onRetry: () => void; retrying: boolean }) {
  return (
    <GateCard>
      <AlertCircle size={28} className="mx-auto text-red-500" aria-hidden="true" />
      <h1 className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">Não foi possível abrir Licitações</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{message}</p>
      <div className="mt-5 flex justify-center">
        <button type="button" onClick={onRetry} disabled={retrying} className={`${primaryButton} disabled:opacity-60`}>
          <RefreshCw size={16} className={retrying ? 'animate-spin' : ''} aria-hidden="true" />
          Tentar de novo
        </button>
      </div>
    </GateCard>
  );
}
