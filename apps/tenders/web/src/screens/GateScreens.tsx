import { AlertCircle, Clock, Lock, RefreshCw } from 'lucide-react';
import { BillingPanel } from '../components/BillingPanel';
import { logout } from '../services/session';
import type { ExpiredSubscriptionInfo } from '../types';
import { TENDERS_LOGIN_ADDRESS } from '../utils/loginAddress';

// Telas de entrada: colaborador sem acesso, assinatura vencida e falha na conferência.

function GateCard({ wide = false, children }: { wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <div
        className={`w-full ${wide ? 'max-w-lg' : 'max-w-md'} rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900`}
      >
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
  window.location.replace(TENDERS_LOGIN_ADDRESS);
}

function GateActions() {
  return (
    <div className="mt-5 flex justify-center">
      <button type="button" onClick={signOut} className={secondaryButton}>
        Sair
      </button>
    </div>
  );
}

/** Colaborador sem acesso liberado (403): pedir ao titular da empresa. */
export function NoAccessScreen() {
  return (
    <GateCard>
      <Lock size={28} className="mx-auto text-slate-400" aria-hidden="true" />
      <h1 className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">Sua conta não tem acesso a Licitações</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        O titular da conta ainda não liberou o seu acesso ao módulo. Peça a ele em Configurações → Usuários.
      </p>
      <GateActions />
    </GateCard>
  );
}

/** Assinatura vencida (402): o titular assina aqui mesmo; o colaborador pede ao titular. */
export function ExpiredScreen({ info, message }: { info: ExpiredSubscriptionInfo | null; message: string }) {
  if (info?.role === 'TITULAR') {
    return (
      <GateCard wide>
        <Clock size={28} className="mx-auto text-amber-500" aria-hidden="true" />
        <h1 className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">A assinatura de Licitações venceu</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Conta <strong>{info.account.name}</strong>. Assine para voltar a ver os editais e a receber os avisos. As suas buscas e o acompanhamento continuam guardados.
        </p>
        <div className="mt-5 text-left">
          <BillingPanel accountId={info.account.id} />
        </div>
        <GateActions />
      </GateCard>
    );
  }

  return (
    <GateCard>
      <Clock size={28} className="mx-auto text-amber-500" aria-hidden="true" />
      <h1 className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">A assinatura de Licitações venceu</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{message}</p>
      <GateActions />
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
