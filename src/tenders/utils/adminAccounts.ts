import type { AdminTenderAccount } from '../types';

// Tela "Contas habilitadas": rótulo do tipo da conta e busca local por nome
// da conta, do dono ou e-mail, sem diferenciar maiúsculas nem acentos.

export const ACCOUNT_TYPE_LABELS: Record<AdminTenderAccount['accountType'], string> = {
  pessoal: 'PF',
  empresa: 'PJ',
};

function foldText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function filterAdminAccounts(accounts: AdminTenderAccount[], searchText: string): AdminTenderAccount[] {
  const query = foldText(searchText.trim());
  if (!query) {
    return accounts;
  }
  return accounts.filter((account) =>
    [account.accountName, account.ownerName, account.ownerEmail].some((field) => foldText(field).includes(query)),
  );
}
