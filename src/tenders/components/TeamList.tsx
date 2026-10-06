import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { EmptyState } from '../../ui/EmptyState';
import { ToggleRow } from '../../ui/form';
import { useTeamAccess } from '../hooks/useTeamAccess';
import { tendersQueryKeys } from '../services/queryKeys';
import { fetchTeam } from '../services/settingsService';
import type { TendersApiError } from '../services/tendersApiError';
import type { TeamMember } from '../types';
import { formatIsoDate } from '../utils/dates';
import { LoadError, LoadingBlock } from './LoadStates';

/** Equipe (só o titular): colaboradores ativos da conta e o acesso de cada um ao módulo. */
export function TeamList() {
  const team = useQuery<TeamMember[], TendersApiError>({ queryKey: tendersQueryKeys.team, queryFn: fetchTeam });
  const access = useTeamAccess();

  if (team.isPending) return <LoadingBlock label="Carregando a equipe…" />;
  if (team.isError) {
    return <LoadError message={team.error.message} onRetry={() => void team.refetch()} retrying={team.isFetching} />;
  }
  if (team.data.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Nenhum colaborador ativo nesta conta."
        description="Os colaboradores são cadastrados no FINGERENCE, em Configurações → Pessoas. Depois, o acesso a Licitações é liberado aqui."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        Quem tem acesso usa o módulo nesta conta, com as próprias buscas salvas e notificações. O acompanhamento dos editais é da conta.
      </p>
      {access.error && (
        <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
          {access.error.message}
        </p>
      )}
      <ul className="grid grid-cols-1 gap-2">
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
                  onChange={() => access.mutate({ userId: member.userId, hasAccess: !hasAccess })}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
