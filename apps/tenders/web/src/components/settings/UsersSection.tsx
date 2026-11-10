import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, UserPlus, Users } from 'lucide-react';
import { Button } from '@ui/components/button';
import { EmptyState } from '@ui/components/EmptyState';
import { ToggleRow } from '@ui/components/form';
import { useDomainLists } from '../../hooks/useDomainLists';
import { useOwnerProfile } from '../../hooks/useOwnerProfile';
import { useTeam } from '../../hooks/useTeam';
import { useTeamAccess } from '../../hooks/useTeamAccess';
import { fetchBilling } from '../../services/billingService';
import { tendersQueryKeys } from '../../services/queryKeys';
import type { TendersApiError } from '../../services/tendersApiError';
import type { TenderBilling } from '../../types';
import { formatCents, priceNote, usersLabel } from '../../utils/billing';
import { formatIsoDate } from '../../utils/dates';
import { readLoggedUserName } from '../../utils/loggedUser';
import { fullName, workTitle } from '../../utils/teamMembers';
import { LoadError, LoadingBlock } from '../LoadStates';
import { MemberFormDialog, type MemberFormTarget } from './MemberFormDialog';
import { OwnerProfileDialog } from './OwnerProfileDialog';
import { UserAvatar } from './UserAvatar';

/** O que está aberto: nada, o cadastro, a edição de um colaborador (pelo id, para a foto nova aparecer) ou "Meus dados". */
type OpenForm = { kind: 'new' } | { kind: 'edit'; userId: number } | { kind: 'owner' } | null;

const CARD_CLASS = 'rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800';

/**
 * Usuários do módulo (só o titular): quem usa Licitações nesta conta, com foto, dados de trabalho e o acesso ao
 * módulo. O titular cadastra, edita e libera; o valor da assinatura acompanha a quantidade a partir da próxima cobrança.
 */
export function UsersSection({ accountId }: { accountId: number }) {
  const team = useTeam();
  const owner = useOwnerProfile(true);
  const lists = useDomainLists();
  const billing = useQuery<TenderBilling, TendersApiError>({
    queryKey: tendersQueryKeys.billing(accountId),
    queryFn: () => fetchBilling(accountId),
  });
  const access = useTeamAccess();
  const [openForm, setOpenForm] = useState<OpenForm>(null);
  const [warning, setWarning] = useState<string | null>(null);

  if (team.isPending) return <LoadingBlock label="Carregando os usuários…" />;
  if (team.isError) {
    return <LoadError message={team.error.message} onRetry={() => void team.refetch()} retrying={team.isFetching} />;
  }

  const subscription = billing.data?.subscription;
  const profile = owner.data?.profile ?? null;
  const members = team.data;
  const editing = openForm?.kind === 'edit' ? members.find((member) => member.userId === openForm.userId) : undefined;
  const memberTarget: MemberFormTarget | null =
    openForm?.kind === 'new' ? { kind: 'new' } : editing ? { kind: 'edit', member: editing } : null;
  const closeForm = () => setOpenForm(null);

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
        <Button type="button" icon={<UserPlus size={15} aria-hidden="true" />} onClick={() => setOpenForm({ kind: 'new' })}>
          Adicionar usuário
        </Button>
      </div>

      {(warning ?? access.data?.warning) && (
        <p role="alert" className="text-xs font-medium text-amber-700 dark:text-amber-400">{warning ?? access.data?.warning}</p>
      )}
      {access.error && (
        <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{access.error.message}</p>
      )}

      <ul className="grid grid-cols-1 gap-2">
        <li className={`${CARD_CLASS} flex items-center gap-3`}>
          <UserAvatar name={profile ? fullName(profile) : readLoggedUserName()} photoUrl={profile?.photoUrl ?? null} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {profile ? fullName(profile) : readLoggedUserName()} <span className="font-normal text-slate-500 dark:text-slate-400">(você, titular)</span>
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {profile ? `${profile.email} · ` : ''}Sempre tem acesso e cuida da assinatura.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<Pencil size={14} aria-hidden="true" />}
            disabled={profile === null}
            onClick={() => setOpenForm({ kind: 'owner' })}
          >
            Meus dados
          </Button>
        </li>

        {members.map((member) => {
          const pending = access.isPending && access.variables?.userId === member.userId;
          const hasAccess = pending && access.variables ? access.variables.hasAccess : member.hasAccess;
          const work = workTitle(member, lists.data);
          return (
            <li key={member.userId} className={`${CARD_CLASS} flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3`}>
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <UserAvatar name={fullName(member)} photoUrl={member.photoUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{fullName(member)}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {work ? `${work} · ` : ''}{member.email}
                  </p>
                </div>
              </div>
              <div className="sm:w-64">
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
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<Pencil size={14} aria-hidden="true" />}
                aria-label={`Editar ${fullName(member)}`}
                onClick={() => setOpenForm({ kind: 'edit', userId: member.userId })}
              >
                Editar
              </Button>
            </li>
          );
        })}
      </ul>

      {members.length === 0 && (
        <EmptyState icon={Users} title="Nenhum outro usuário nesta conta." description="Adicione quem vai usar Licitações com você." />
      )}

      <MemberFormDialog target={memberTarget} lists={lists.data} onClose={closeForm} onWarning={setWarning} />
      <OwnerProfileDialog profile={openForm?.kind === 'owner' ? profile : null} onClose={closeForm} />
    </div>
  );
}
