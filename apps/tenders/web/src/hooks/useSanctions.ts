import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { checkSanctions, fetchSanctions } from '../services/sanctionsService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { SanctionCheckResult, SanctionOverview } from '../types';
import { applyCheckResult, progressText, runSanctionChecks, type SanctionRunOutcome, type SanctionSubjectRef } from '../utils/sanctions';

// Aba Sanções. A leitura não chama o portal; a consulta atualiza a leitura com o resultado (sem ler tudo de novo).

/** A empresa e, para o titular, as pessoas do cofre, com o que já foi consultado. */
export function useSanctions() {
  return useQuery<SanctionOverview, TendersApiError>({ queryKey: tendersQueryKeys.sanctions, queryFn: fetchSanctions });
}

/**
 * Consulta um assunto: `null` é a empresa, e um número, uma pessoa do cofre. O resultado entra na leitura da tela. `variables`
 * diz quem está sendo consultado, para o cartão mostrar o andamento.
 */
export function useCheckSanctions() {
  const queryClient = useQueryClient();
  return useMutation<SanctionCheckResult, TendersApiError, number | null>({
    mutationFn: (personId) => checkSanctions(personId ?? undefined),
    onSuccess: (result) => {
      queryClient.setQueryData<SanctionOverview>(tendersQueryKeys.sanctions, (current) =>
        current === undefined ? current : applyCheckResult(current, result),
      );
    },
  });
}

export interface CheckAllState {
  running: boolean;
  /** "Consultando 2 de 5: Ana…" enquanto roda. */
  progress: string | null;
  /** O resultado do último "Consultar todos" que terminou. */
  outcome: SanctionRunOutcome | null;
}

/**
 * "Consultar todos": consulta um assunto por vez, no navegador, com o andamento. Sair da tela interrompe (o que já foi consultado
 * fica guardado pela API). `check` é a mesma consulta do botão de cada cartão.
 */
export function useCheckAllSanctions(check: (personId: number | null) => Promise<SanctionCheckResult>) {
  const [state, setState] = useState<CheckAllState>({ running: false, progress: null, outcome: null });
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  const run = useCallback(
    async (subjects: readonly SanctionSubjectRef[]) => {
      setState({ running: true, progress: null, outcome: null });
      const outcome = await runSanctionChecks(subjects, check, {
        onProgress: (done, total, current) => {
          if (!cancelled.current) setState((previous) => ({ ...previous, progress: progressText(done, total, current) }));
        },
        isCancelled: () => cancelled.current,
      });
      if (!cancelled.current) setState({ running: false, progress: null, outcome });
    },
    [check],
  );

  return { ...state, run };
}
