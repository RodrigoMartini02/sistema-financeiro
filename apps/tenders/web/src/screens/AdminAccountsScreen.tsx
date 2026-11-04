import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Search } from 'lucide-react';
import { useConfirm } from '../../context/ConfirmContext';
import { EmptyState } from '../../ui/EmptyState';
import { Input, ToggleRow } from '../../ui/form';
import { LoadError, LoadingBlock } from '../components/LoadStates';
import { useTenderAccess } from '../hooks/useTenderAccess';
import { fetchAdminAccounts, setAccountCourtesy } from '../services/adminAccountsService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { AdminTenderAccount, CourtesyChange } from '../types';
import { ACCOUNT_TYPE_LABELS, adminSituationLabel, filterAdminAccounts } from '../utils/adminAccounts';
import { NotFoundScreen } from './NotFoundScreen';

interface CourtesyToggle {
  accountId: number;
  courtesy: boolean;
}

/**
 * Contas habilitadas (só o admin da plataforma): a cortesia de cada conta. Com
 * cortesia, a conta usa o módulo sem cobrança e sem limite de usuários; sem
 * cortesia, segue pela assinatura (teste, período pago ou recorrente).
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

  const toggle = useMutation<CourtesyChange, TendersApiError, CourtesyToggle>({
    mutationFn: ({ accountId, courtesy }) => setAccountCourtesy(accountId, courtesy),
    // Tudo do módulo: tirar a cortesia da conta em uso pode trocar a conta (ou tirar o acesso).
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tendersQueryKeys.all }),
  });

  if (!canManage) {
    return <NotFoundScreen />;
  }

  const confirmToggle = (account: AdminTenderAccount, courtesy: boolean): Promise<boolean> => {
    if (courtesy) {
      if (account.situation !== 'recorrente') {
        return Promise.resolve(true);
      }
      return confirm({
        title: 'Dar cortesia a uma conta com recorrente',
        message: `A conta "${account.accountName}" paga Licitações no cartão, todo mês. A cortesia não cancela essa cobrança: o titular cancela em Configurações → Assinatura.`,
        confirmLabel: 'Dar cortesia',
      });
    }
    const inUse = account.accountId === accountInUseId
      ? ' Você está usando o módulo por esta conta e pode perder o acesso a ele, inclusive a esta tela.'
      : '';
    return confirm({
      title: 'Tirar a cortesia',
      message: `A conta "${account.accountName}" passa a depender da assinatura. Sem teste ou período pago, o acesso fica bloqueado até o titular assinar.${inUse}`,
      confirmLabel: 'Tirar a cortesia',
      variant: 'danger',
    });
  };

  const handleToggle = async (account: AdminTenderAccount) => {
    const courtesy = !account.courtesy;
    if (await confirmToggle(account, courtesy)) {
      toggle.mutate({ accountId: account.accountId, courtesy });
    }
  };

  const list = accounts.data ?? [];
  const visible = filterAdminAccounts(list, searchText);
  const courtesyCount = list.filter((account) => account.courtesy).length;
  const subscriptionCount = list.filter(
    (account) => !account.courtesy && account.situation !== null && account.situation !== 'desligada',
  ).length;

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
              description={`${ACCOUNT_TYPE_LABELS[account.accountType]} · ${account.ownerName} · ${account.ownerEmail} · ${adminSituationLabel(account)}`}
              checked={account.courtesy}
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
            ? `${courtesyCount} com cortesia e ${subscriptionCount} pela assinatura, de ${list.length} contas ativas. Ligado = cortesia: sem cobrança e sem limite de usuários.`
            : 'Ligue a cortesia nas contas que usam Licitações sem cobrança.'}
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
