import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { queryKeys } from '../../services/queryKeys';
import { startFinanceTrial, type PlanoStatus } from '../../services/planosService';
import { PlanosScreen } from '../../screens/planos/PlanosScreen';
import type { PlanGateReason } from '../../utils/planFeatures';

/**
 * Tela de bloqueio quando o plano que vale para a pessoa não libera o app. O
 * titular escolhe um plano ali mesmo; o membro, que usa o plano do titular, só
 * é orientado a pedir a renovação ou o Premium. Quem se cadastrou por
 * Licitações (`sem_teste`) começa aqui o teste de 15 dias do FINGERENCE.
 */
export function PlanExpiredGate({ planStatus, reason = 'expired' }: { planStatus: PlanoStatus; reason?: PlanGateReason }) {
  const queryClient = useQueryClient();
  const refreshPlan = () => queryClient.invalidateQueries({ queryKey: queryKeys.planStatus });

  const startTrial = useMutation<void, Error, void>({
    mutationFn: startFinanceTrial,
    onSuccess: refreshPlan,
  });

  const isAccountMember = planStatus.isAccountMember === true;
  const notStarted = reason === 'notStarted';
  const trialExpired = !planStatus.plano_tipo;
  const title = notStarted
    ? 'Comece seu teste grátis'
    : reason === 'teamNotInPlan'
      ? 'Plano da conta sem equipe'
      : isAccountMember
        ? 'Plano da conta vencido'
        : trialExpired ? 'Período de teste encerrado' : 'Plano vencido';
  const memberMessage = notStarted
    ? 'O responsável pela conta ainda não começou o teste do FINGERENCE Finanças.'
    : reason === 'teamNotInPlan'
      ? 'O plano da conta não inclui equipe. Peça ao titular para assinar o Premium. Seus dados estão preservados.'
      : 'O plano da conta venceu. Peça ao titular para renovar. Seus dados estão preservados.';

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col overflow-auto bg-white">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-600">Fingerence</p>
            <h1 className="text-lg font-bold text-slate-900">{title}</h1>
          </div>
          {!notStarted && (
            <button
              type="button"
              onClick={() => void refreshPlan()}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs text-slate-500 transition hover:bg-slate-50"
            >
              {isAccountMember ? 'Verificar de novo' : 'Já paguei — verificar'}
            </button>
          )}
        </div>
      </div>
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        {isAccountMember ? (
          <p className="text-center text-sm text-slate-500">{memberMessage}</p>
        ) : notStarted ? (
          <div className="mx-auto max-w-md rounded-2xl border border-slate-200 p-8 text-center">
            <Sparkles size={28} className="mx-auto text-brand-600" aria-hidden="true" />
            <h2 className="mt-3 text-xl font-bold text-slate-900">15 dias grátis no FINGERENCE Finanças</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Receitas, despesas, cartões e relatórios, com tudo do Premium liberado durante o teste. Sem cartão de crédito.
            </p>
            {startTrial.error && (
              <p role="alert" className="mt-4 text-sm font-medium text-red-600">{startTrial.error.message}</p>
            )}
            <button
              type="button"
              onClick={() => startTrial.mutate()}
              disabled={startTrial.isPending}
              className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {startTrial.isPending ? 'Começando…' : 'Começar meu teste'}
            </button>
          </div>
        ) : (
          <>
            <p className="mb-8 text-center text-sm text-slate-500">
              Seus dados estão preservados. Escolha um plano para continuar usando o Fingerence.
            </p>
            <PlanosScreen />
          </>
        )}
      </div>
    </div>
  );
}
