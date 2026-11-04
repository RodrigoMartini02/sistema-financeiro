import type { AdminTenderAccount } from '../types';
import { situationLabel } from './billing';

// Tela "Contas habilitadas": rótulo do tipo da conta, situação no módulo e
// busca local por nome da conta, do dono ou e-mail, sem diferenciar
// maiúsculas nem acentos.

export const ACCOUNT_TYPE_LABELS: Record<AdminTenderAccount['accountType'], string> = {
  pessoal: 'PF',
  empresa: 'PJ',
};

/** Situação da conta no módulo; a conta que nunca teve o módulo aparece como "Sem o módulo". */
export function adminSituationLabel(account: AdminTenderAccount): string {
  return account.situation === null ? 'Sem o módulo' : situationLabel({ ...account, situation: account.situation });
}

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
