import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Clock, Lock, RefreshCw, Sparkles } from 'lucide-react';
import { logout } from '../../services/session';
import { Field, Select } from '../../ui/form';
import { TENDERS_LOGIN_ADDRESS } from '../../utils/authOrigin';
import { BillingPanel } from '../components/BillingPanel';
import { activateTenders, fetchActivation } from '../services/billingService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { ExpiredSubscriptionInfo, TenderActivation } from '../types';

// Telas da entrada no módulo fora do sistema: sem acesso (com a ativação para
// o titular), assinatura vencida e erro ao conferir o acesso. Licitações não
// leva ao FINGERENCE: são soluções separadas (plano .plans/site-novo.md).

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

/** Titular sem o módulo: escolhe a conta e começa os 15 dias grátis. */
function ActivationOffer({ activation }: { activation: TenderActivation }) {
  const queryClient = useQueryClient();
  const [chosenId, setChosenId] = useState<number | null>(null);
  const accountId = chosenId ?? activation.accounts[0]?.id ?? null;

  const activate = useMutation<unknown, TendersApiError, number>({
    mutationFn: activateTenders,
    // A entrada confere o acesso de novo e abre o sistema na conta ativada;
    // o botão segue em "Ativando…" até lá.
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: tendersQueryKeys.access });
      queryClient.removeQueries({ queryKey: tendersQueryKeys.activation });
    },
  });

  return (
    <>
      <Sparkles size={28} className="mx-auto text-brand-600" aria-hidden="true" />
      <h1 className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">Comece a usar Licitações</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        Editais do PNCP com as suas buscas salvas, avisos de novos editais e prazos. São 15 dias grátis, sem cartão de crédito.
      </p>
      {activation.accounts.length > 1 && (
        <div className="mt-4 text-left">
          <Field label="Conta">
            <Select
              aria-label="Conta que vai usar Licitações"
              value={accountId ?? ''}
              onChange={(event) => setChosenId(Number(event.target.value))}
            >
              {activation.accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}
      {activate.error && (
        <p role="alert" className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
          {activate.error.message}
        </p>
      )}
      <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
        <button
          type="button"
          disabled={accountId === null || activate.isPending}
          onClick={() => accountId !== null && activate.mutate(accountId)}
          className={`${primaryButton} disabled:opacity-60`}
        >
          {activate.isPending ? 'Ativando…' : 'Ativar Licitações — 15 dias grátis'}
        </button>
        <button type="button" onClick={signOut} className={secondaryButton}>
          Sair
        </button>
      </div>
    </>
  );
}

/** Conta sem o módulo (404): a ativação para o titular. Colaborador sem acesso liberado (403): pedir ao titular. */
export function NoAccessScreen({ reason }: { reason: 'noModule' | 'memberWithoutAccess' }) {
  const activation = useQuery<TenderActivation, TendersApiError>({
    queryKey: tendersQueryKeys.activation,
    queryFn: fetchActivation,
    enabled: reason === 'noModule',
    retry: false,
  });

  if (reason === 'noModule' && activation.isPending) {
    return (
      <GateCard>
        <p className="text-sm text-slate-600 dark:text-slate-300" role="status">Conferindo a sua conta…</p>
      </GateCard>
    );
  }
  if (reason === 'noModule' && activation.isError) {
    return <GateErrorScreen message={activation.error.message} onRetry={() => void activation.refetch()} retrying={activation.isFetching} />;
  }
  if (reason === 'noModule' && activation.data?.canActivate) {
    return (
      <GateCard>
        <ActivationOffer activation={activation.data} />
      </GateCard>
    );
  }

  return (
    <GateCard>
      <Lock size={28} className="mx-auto text-slate-400" aria-hidden="true" />
      <h1 className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">Sua conta não tem acesso a Licitações</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        {reason === 'memberWithoutAccess'
          ? 'O titular da conta ainda não liberou o seu acesso ao módulo. Peça a ele em Configurações → Usuários.'
          : 'O módulo de Licitações não está habilitado para esta conta.'}
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
