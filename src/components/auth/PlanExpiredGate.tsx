import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Gavel } from 'lucide-react';
import { queryKeys } from '../../services/queryKeys';
import type { PlanoStatus } from '../../services/planosService';
import { fetchTendersAccess } from '../../services/tendersService';
import { PlanosScreen } from '../../screens/planos/PlanosScreen';
import { destinationForAuthOrigin } from '../../utils/authOrigin';
import type { PlanGateReason } from '../../utils/planFeatures';

/**
 * Tela de bloqueio quando o plano que vale para a pessoa não libera o app. O
 * titular escolhe um plano ali mesmo; o membro, que usa o plano do titular, só
 * é orientado a pedir a renovação ou o Premium. Licitações tem assinatura
 * própria: quem tem acesso ao módulo segue para lá.
 */
export function PlanExpiredGate({ planStatus, reason = 'expired' }: { planStatus: PlanoStatus; reason?: PlanGateReason }) {
  const queryClient = useQueryClient();
  // Mesma consulta do atalho do menu: sem acesso ao módulo, a rota responde 404/403/402.
  const tendersAccess = useQuery({
    queryKey: queryKeys.tendersAccess,
    queryFn: fetchTendersAccess,
    retry: false,
    staleTime: 5 * 60_000,
  });
  const isAccountMember = planStatus.isAccountMember === true;
  const trialExpired = !planStatus.plano_tipo;
  const title = reason === 'teamNotInPlan'
    ? 'Plano da conta sem equipe'
    : isAccountMember
      ? 'Plano da conta vencido'
      : trialExpired ? 'Período de teste encerrado' : 'Plano vencido';
  const memberMessage = reason === 'teamNotInPlan'
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            {tendersAccess.isSuccess && (
              <a
                href={destinationForAuthOrigin('tenders')}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-700"
              >
                <Gavel size={14} aria-hidden="true" />
                Ir para Licitações
              </a>
            )}
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.planStatus })}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs text-slate-500 transition hover:bg-slate-50"
            >
              {isAccountMember ? 'Verificar de novo' : 'Já paguei — verificar'}
            </button>
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        {isAccountMember ? (
          <p className="text-center text-sm text-slate-500">{memberMessage}</p>
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
