import type { AdminTenderAccount, CourtesyChange } from '../types';
import { tendersRequest } from './tendersApi';

// Cortesia das contas no módulo (admin da plataforma). As rotas ficam em
// /api/tenders/admin, fora da trava de conta do módulo.

export function fetchAdminAccounts(): Promise<AdminTenderAccount[]> {
  return tendersRequest<AdminTenderAccount[]>('/admin/accounts');
}

export function setAccountCourtesy(accountId: number, courtesy: boolean): Promise<CourtesyChange> {
  return tendersRequest<CourtesyChange>(`/admin/accounts/${accountId}`, {
    method: 'PUT',
    body: JSON.stringify({ courtesy }),
  });
}
