import type { SanctionCheckResult, SanctionOverview } from '../types';
import { tendersRequest } from './tendersApi';

// Sanções (plano .plans/licitacoes-6-sancoes.md). A empresa é de todos com acesso ao módulo; as pessoas do cofre, só do
// titular. A leitura não chama o portal: lê o que já foi consultado. A consulta reaproveita o resultado de menos de 15 minutos.

export function fetchSanctions(): Promise<SanctionOverview> {
  return tendersRequest<SanctionOverview>('/sanctions');
}

/** Sem `personId`, consulta a empresa; com ele, uma pessoa do cofre (só o titular). O documento nunca vai no pedido. */
export function checkSanctions(personId?: number): Promise<SanctionCheckResult> {
  return tendersRequest<SanctionCheckResult>('/sanctions/check', {
    method: 'POST',
    body: JSON.stringify(personId === undefined ? {} : { personId }),
  });
}
