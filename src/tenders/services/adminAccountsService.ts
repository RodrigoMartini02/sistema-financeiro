import type { AccountEnabledChange, AdminTenderAccount } from '../types';
import { tendersRequest } from './tendersApi';

// Habilitação de contas no módulo (admin da plataforma). As rotas ficam em
// /api/tenders/admin, fora da trava de conta do módulo.

export function fetchAdminAccounts(): Promise<AdminTenderAccount[]> {
  return tendersRequest<AdminTenderAccount[]>('/admin/accounts');
}

export function setAccountEnabled(accountId: number, active: boolean): Promise<AccountEnabledChange> {
  return tendersRequest<AccountEnabledChange>(`/admin/accounts/${accountId}`, {
    method: 'PUT',
    body: JSON.stringify({ active }),
  });
}
