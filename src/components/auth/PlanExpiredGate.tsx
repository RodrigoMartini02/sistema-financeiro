import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../services/queryKeys';
import { PlanosScreen } from '../../screens/planos/PlanosScreen';

/** Resposta de GET /planos/status. Para membro ativo, é o plano do titular da conta. */
export interface PlanoStatus {
  status: 'trial' | 'ativo' | 'expirado';
  plano_tipo: string | null;
  plano_expiracao: string | null;
  dias_restantes_trial: number | null;
  /** O plano é do titular: o membro não assina nem paga. */
  isAccountMember?: boolean;
}

/**
 * Tela de bloqueio quando o plano que vale para a pessoa venceu. O titular
 * escolhe um plano ali mesmo; o membro, que usa o plano do titular, só é
 * orientado a pedir a renovação.
 */
export function PlanExpiredGate({ planStatus }: { planStatus: PlanoStatus }) {
  const queryClient = useQueryClient();
  const isAccountMember = planStatus.isAccountMember === true;
  const trialExpired = !planStatus.plano_tipo;
  const title = isAccountMember
    ? 'Plano da conta vencido'
    : trialExpired ? 'Período de teste encerrado' : 'Plano vencido';

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col overflow-auto bg-white">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-600">Fingerence</p>
            <h1 className="text-lg font-bold text-slate-900">{title}</h1>
          </div>
          <button
            type="button"
            onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.planStatus })}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs text-slate-500 transition hover:bg-slate-50"
          >
            {isAccountMember ? 'Verificar de novo' : 'Já paguei — verificar'}
          </button>
        </div>
      </div>
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        {isAccountMember ? (
          <p className="text-center text-sm text-slate-500">
            O plano da conta venceu. Peça ao titular para renovar. Seus dados estão preservados.
          </p>
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
