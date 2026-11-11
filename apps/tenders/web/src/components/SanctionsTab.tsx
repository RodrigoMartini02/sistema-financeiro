import { useState } from 'react';
import { ShieldCheck, Users } from 'lucide-react';
import { Button } from '@ui/components/button';
import { EmptyState } from '@ui/components/EmptyState';
import { InfoBanner } from '@ui/components/InfoBanner';
import { useDomainLists } from '../hooks/useDomainLists';
import { useCheckAllSanctions, useCheckSanctions, useSanctions } from '../hooks/useSanctions';
import { useSettingsModal } from '../hooks/useSettingsModal';
import { useTenderAccess } from '../hooks/useTenderAccess';
import type { SanctionCompany, SanctionOverview } from '../types';
import { registrationStatusView, lookupDateText } from '../utils/companyProfile';
import { formatCnpj } from '../utils/labels';
import type { TendersPermissions } from '../utils/navigation';
import {
  SANCTIONS_DISCLAIMER,
  SANCTIONS_NO_CNPJ_TEXT,
  SANCTIONS_UNAVAILABLE_TEXT,
  failedBasesText,
  runOutcomeText,
  subjectsToCheck,
} from '../utils/sanctions';
import { personRolesText } from '../utils/vault';
import { LoadError, LoadingBlock } from './LoadStates';
import { Pill, type PillTone } from './Pill';
import { SanctionSubjectCard } from './SanctionSubjectCard';

// Aba Sanções (plano .plans/licitacoes-6-sancoes.md): a consulta de CEIS, CNEP e CEPIM da empresa e das pessoas do cofre. A empresa
// é de todos com acesso ao módulo; as pessoas, dado pessoal de terceiros, só do titular (a API só as manda a ele). A tela mostra o
// que já foi consultado e consulta sob demanda; sem a chave do portal, a consulta fica indisponível. A situação vem calculada da API.

const NO_PERMISSIONS: TendersPermissions = {
  manageTeam: false,
  manageCompany: false,
  manageBilling: false,
  manageVaultPeople: false,
  viewCollectionRuns: false,
  manageEnabledAccounts: false,
};

const RECEITA_TONES: Record<'income' | 'warning' | 'expense', PillTone> = { income: 'success', warning: 'warning', expense: 'danger' };

const LINK_BUTTON =
  'inline-flex h-8 items-center rounded-lg border border-brand-200 bg-brand-50 px-3 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200 dark:hover:bg-brand-500/20';

/** A situação cadastral que o Perfil guarda (consulta da Receita), só leitura, com o atalho para atualizá-la no Perfil. */
function ReceitaStatus({ registration, onOpenProfile }: { registration: SanctionCompany['registration']; onOpenProfile: (() => void) | null }) {
  const status = registration ? registrationStatusView({ code: registration.code, since: registration.since }) : null;
  const lookedUp = lookupDateText(registration?.lookedUpAt ?? null);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Situação cadastral na Receita</p>
        {status ? (
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <Pill tone={RECEITA_TONES[status.tone]}>{status.label}</Pill>
            {status.since && <span className="text-xs text-slate-500 dark:text-slate-400">{status.since}</span>}
          </div>
        ) : (
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">Ainda não consultada.</p>
        )}
        {lookedUp && <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">{lookedUp}</p>}
      </div>
      {onOpenProfile && (
        <button type="button" onClick={onOpenProfile} className={LINK_BUTTON}>
          Atualizar no Perfil
        </button>
      )}
    </div>
  );
}

const COMPANY_KEY = 'company';
const personKey = (id: number) => `person:${id}`;

function SanctionsContent({ overview }: { overview: SanctionOverview }) {
  const access = useTenderAccess(true);
  const permissions = access.data?.permissions ?? NO_PERMISSIONS;
  const settings = useSettingsModal(permissions);
  const lists = useDomainLists();
  const check = useCheckSanctions();
  const checkAll = useCheckAllSanctions(check.mutateAsync);
  // O que cada cartão mostra do último pedido dele (a base que falhou, ou o erro da API).
  const [notes, setNotes] = useState<Record<string, string | null>>({});

  const { company, people } = overview;
  const busy = check.isPending || checkAll.running;
  const pendingTarget = check.isPending ? check.variables : undefined;
  const pending = subjectsToCheck(overview, new Date());
  const canOpenProfile = permissions.manageCompany && settings.items.some((item) => item.id === 'perfil') && company.cnpj !== null;
  const outcomeText = checkAll.outcome === null ? null : runOutcomeText(checkAll.outcome);

  const handleCheck = (personId: number | null) => {
    const key = personId === null ? COMPANY_KEY : personKey(personId);
    setNotes((previous) => ({ ...previous, [key]: null }));
    check.mutate(personId, {
      onSuccess: (result) => {
        if (result.failed.length > 0) setNotes((previous) => ({ ...previous, [key]: failedBasesText(result.failed) }));
      },
      onError: (error) => setNotes((previous) => ({ ...previous, [key]: error.message })),
    });
  };

  return (
    <section>
      <div className="mb-4 grid gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-300">
            Consulta nos cadastros federais de sanções (CEIS, CNEP e CEPIM) da empresa
            {people !== null ? ' e das pessoas do cofre' : ''}, com a situação cadastral da empresa na Receita.
          </p>
          {people !== null && (
            <Button
              type="button"
              size="sm"
              onClick={() => void checkAll.run(pending)}
              disabled={!overview.available || busy || pending.length === 0}
              aria-busy={checkAll.running}
              title={
                overview.available && pending.length === 0
                  ? `Tudo já foi consultado há menos de ${overview.reuseMinutes} minutos.`
                  : overview.available
                    ? undefined
                    : SANCTIONS_UNAVAILABLE_TEXT
              }
              icon={<ShieldCheck size={15} aria-hidden="true" />}
            >
              {checkAll.running ? 'Consultando…' : 'Consultar todos'}
            </Button>
          )}
        </div>
        <InfoBanner variant="info">{SANCTIONS_DISCLAIMER}</InfoBanner>
        {!overview.available && <InfoBanner variant="warn">{SANCTIONS_UNAVAILABLE_TEXT}</InfoBanner>}
        {checkAll.progress !== null && (
          <p role="status" className="text-xs font-medium text-brand-700 dark:text-brand-300">
            {checkAll.progress}
          </p>
        )}
        {outcomeText !== null && (
          <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
            {outcomeText}
          </p>
        )}
        {checkAll.outcome !== null && outcomeText === null && checkAll.outcome.completed > 0 && (
          <InfoBanner variant="success">Consulta concluída.</InfoBanner>
        )}
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Empresa</h2>
      <SanctionSubjectCard
        title={company.name ?? 'Empresa'}
        context={company.cnpj === null ? [] : [`CNPJ ${formatCnpj(company.cnpj)}`]}
        bases={company.bases}
        staleDays={overview.staleDays}
        available={overview.available}
        checking={pendingTarget === null}
        busy={busy}
        blockedText={company.cnpj === null ? SANCTIONS_NO_CNPJ_TEXT : null}
        extra={
          <ReceitaStatus registration={company.registration} onOpenProfile={canOpenProfile ? () => settings.open('perfil') : null} />
        }
        note={notes[COMPANY_KEY] ?? null}
        onCheck={() => handleCheck(null)}
      />

      {people === null ? (
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">Só o titular da conta consulta as pessoas do cofre.</p>
      ) : (
        <div className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Pessoas do cofre</h2>
          {people.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhuma pessoa cadastrada ainda."
              description="Cadastre sócios, representantes legais e procuradores na aba Pessoas para consultá-los aqui."
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {people.map((person) => {
                const rolesText = personRolesText(person.roles, lists.data?.personRoles);
                return (
                  <li key={person.id}>
                    <SanctionSubjectCard
                      title={person.name}
                      context={rolesText === '' ? [] : [rolesText]}
                      bases={person.bases}
                      staleDays={overview.staleDays}
                      available={overview.available}
                      checking={pendingTarget === person.id}
                      busy={busy}
                      note={notes[personKey(person.id)] ?? null}
                      onCheck={() => handleCheck(person.id)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export function SanctionsTab() {
  const sanctions = useSanctions();

  if (sanctions.isPending) {
    return <LoadingBlock label="Carregando as consultas de sanções…" />;
  }
  if (sanctions.isError) {
    return <LoadError message={sanctions.error.message} onRetry={() => void sanctions.refetch()} retrying={sanctions.isFetching} />;
  }
  return <SanctionsContent overview={sanctions.data} />;
}
