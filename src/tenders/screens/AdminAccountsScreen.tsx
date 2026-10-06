import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Search } from 'lucide-react';
import { useConfirm } from '../../context/ConfirmContext';
import { EmptyState } from '../../ui/EmptyState';
import { Input, ToggleRow } from '../../ui/form';
import { LoadError, LoadingBlock } from '../components/LoadStates';
import { useTenderAccess } from '../hooks/useTenderAccess';
import { fetchAdminAccounts, setAccountEnabled } from '../services/adminAccountsService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { AccountEnabledChange, AdminTenderAccount } from '../types';
import { ACCOUNT_TYPE_LABELS, filterAdminAccounts } from '../utils/adminAccounts';
import { NotFoundScreen } from './NotFoundScreen';

interface EnabledChange {
  accountId: number;
  active: boolean;
}

/**
 * Contas habilitadas (só o admin da plataforma): liga e desliga o módulo em
 * cada conta. O titular de uma conta habilitada entra no módulo; os
 * colaboradores dependem da liberação do titular.
 */
export function AdminAccountsScreen() {
  const access = useTenderAccess(true);
  const canManage = access.data?.permissions.manageEnabledAccounts === true;
  const accountInUseId = access.data?.account.id ?? null;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [searchText, setSearchText] = useState('');

  const accounts = useQuery<AdminTenderAccount[], TendersApiError>({
    queryKey: tendersQueryKeys.adminAccounts,
    queryFn: fetchAdminAccounts,
    enabled: canManage,
  });

  const toggle = useMutation<AccountEnabledChange, TendersApiError, EnabledChange>({
    mutationFn: ({ accountId, active }) => setAccountEnabled(accountId, active),
    // Tudo do módulo: desligar a conta em uso troca a conta (ou tira o acesso).
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tendersQueryKeys.all }),
  });

  if (!canManage) {
    return <NotFoundScreen />;
  }

  const handleToggle = async (account: AdminTenderAccount) => {
    const active = !account.enabled;
    if (!active && account.accountId === accountInUseId) {
      const confirmed = await confirm({
        title: 'Desabilitar a conta em uso',
        message: `Você está usando o módulo pela conta "${account.accountName}". Se não houver outra conta sua habilitada, você perde o acesso ao módulo, inclusive a esta tela.`,
        confirmLabel: 'Desabilitar',
        variant: 'danger',
      });
      if (!confirmed) {
        return;
      }
    }
    toggle.mutate({ accountId: account.accountId, active });
  };

  const list = accounts.data ?? [];
  const visible = filterAdminAccounts(list, searchText);
  const enabledCount = list.filter((account) => account.enabled).length;

  let content;
  if (accounts.isPending) {
    content = <LoadingBlock label="Carregando as contas…" />;
  } else if (accounts.isError) {
    content = <LoadError message={accounts.error.message} onRetry={() => void accounts.refetch()} retrying={accounts.isFetching} />;
  } else if (list.length === 0) {
    content = <EmptyState icon={Building2} title="Nenhuma conta ativa na plataforma." />;
  } else if (visible.length === 0) {
    content = <EmptyState icon={Search} title="Nenhuma conta encontrada para essa busca." />;
  } else {
    content = (
      <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2 2xl:grid-cols-3">
        {visible.map((account) => (
          <li key={account.accountId}>
            <ToggleRow
              label={account.accountId === accountInUseId ? `${account.accountName} (em uso)` : account.accountName}
              description={`${ACCOUNT_TYPE_LABELS[account.accountType]} · ${account.ownerName} · ${account.ownerEmail}`}
              checked={account.enabled}
              disabled={toggle.isPending}
              onChange={() => void handleToggle(account)}
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {accounts.data
            ? `${enabledCount} de ${list.length} contas com o módulo habilitado. O titular entra no módulo; os colaboradores dependem da liberação dele.`
            : 'Habilite o módulo nas contas que podem usar Licitações.'}
        </p>
        <div className="w-full sm:w-72">
          <Input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Buscar conta, dono ou e-mail"
            aria-label="Buscar conta, dono ou e-mail"
          />
        </div>
      </div>
      {toggle.error && (
        <p role="alert" className="mb-3 text-xs font-medium text-red-600 dark:text-red-400">
          {toggle.error.message}
        </p>
      )}
      {content}
    </section>
  );
}
