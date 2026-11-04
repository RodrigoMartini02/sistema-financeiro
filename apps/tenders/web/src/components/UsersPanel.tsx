import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserPlus, Users } from 'lucide-react';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/EmptyState';
import { ToggleRow } from '../../ui/form';
import { useTeamAccess } from '../hooks/useTeamAccess';
import { fetchBilling } from '../services/billingService';
import { tendersQueryKeys } from '../services/queryKeys';
import { fetchTeam } from '../services/settingsService';
import type { TendersApiError } from '../services/tendersApiError';
import type { TeamMember, TenderBilling } from '../types';
import { formatIsoDate } from '../utils/dates';
import { formatCents, priceNote, usersLabel } from '../utils/billing';
import { AddUserDialog } from './AddUserDialog';
import { LoadError, LoadingBlock } from './LoadStates';

/**
 * Usuários do módulo (só o titular): quem usa Licitações nesta conta, sem
 * permissões. O titular cadastra, libera e remove; o valor da assinatura
 * acompanha a quantidade a partir da próxima cobrança.
 */
export function UsersPanel({ accountId }: { accountId: number }) {
  const team = useQuery<TeamMember[], TendersApiError>({ queryKey: tendersQueryKeys.team, queryFn: fetchTeam });
  const billing = useQuery<TenderBilling, TendersApiError>({
    queryKey: tendersQueryKeys.billing(accountId),
    queryFn: () => fetchBilling(accountId),
  });
  const access = useTeamAccess();
  const [adding, setAdding] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  if (team.isPending) return <LoadingBlock label="Carregando os usuários…" />;
  if (team.isError) {
    return <LoadError message={team.error.message} onRetry={() => void team.refetch()} retrying={team.isFetching} />;
  }

  const subscription = billing.data?.subscription;
  const shownWarning = warning ?? access.data?.warning ?? null;

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="text-sm text-slate-600 dark:text-slate-300">
          <p>Quem tem acesso usa o módulo nesta conta, com as próprias buscas salvas e notificações. O acompanhamento dos editais é da conta.</p>
          {subscription?.accessType === 'cortesia' && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Cortesia: sem cobrança e sem limite de usuários.</p>
          )}
          {subscription?.accessType === 'assinatura' && billing.data && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {priceNote(billing.data.price)} Agora: {usersLabel(subscription.usersCount)}, {formatCents(subscription.monthlyAmountCents)}/mês.
            </p>
          )}
        </div>
        <Button type="button" icon={<UserPlus size={15} aria-hidden="true" />} onClick={() => setAdding(true)}>
          Adicionar usuário
        </Button>
      </div>

      {shownWarning && (
        <p role="alert" className="text-xs font-medium text-amber-700 dark:text-amber-400">{shownWarning}</p>
      )}
      {access.error && (
        <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{access.error.message}</p>
      )}

      <ul className="grid grid-cols-1 gap-2">
        <li className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Você (titular)</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Sempre tem acesso e cuida da assinatura.</p>
        </li>
        {team.data.map((member) => {
          const pending = access.isPending && access.variables?.userId === member.userId;
          const hasAccess = pending && access.variables ? access.variables.hasAccess : member.hasAccess;
          return (
            <li
              key={member.userId}
              className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{member.name}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{member.email}</p>
              </div>
              <div className="sm:w-72">
                <ToggleRow
                  label="Acesso a Licitações"
                  description={hasAccess ? (member.grantedAt ? `Liberado em ${formatIsoDate(member.grantedAt)}` : 'Liberado') : 'Sem acesso'}
                  checked={hasAccess}
                  disabled={access.isPending}
                  onChange={() => {
                    setWarning(null);
                    access.mutate({ userId: member.userId, hasAccess: !hasAccess });
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {team.data.length === 0 && (
        <EmptyState icon={Users} title="Nenhum outro usuário nesta conta." description="Adicione quem vai usar Licitações com você." />
      )}

      <AddUserDialog open={adding} onClose={() => setAdding(false)} onWarning={setWarning} />
    </div>
  );
}
