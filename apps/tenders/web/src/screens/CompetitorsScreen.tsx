import { useCallback, useState } from 'react';
import { Plus, Radar } from 'lucide-react';
import { Button } from '@ui/components/button';
import { EmptyState } from '@ui/components/EmptyState';
import { useConfirm } from '@ui/context/ConfirmContext';
import { CompetitorCard } from '../components/CompetitorCard';
import { CompetitorFormDialog, type CompetitorFormTarget } from '../components/CompetitorFormDialog';
import { LoadError, LoadingBlock } from '../components/LoadStates';
import { useCompetitorSummaries, useCompetitors, useRemoveCompetitor } from '../hooks/useCompetitors';
import { isContractStoreUpdating } from '../services/tendersApiError';
import type { Competitor } from '../types';
import { competitorLimitText, competitorTitle, findCompetitorSummary } from '../utils/competitors';

// Concorrentes monitorados (plano .plans/licitacoes-4-concorrentes-monitorados.md): os fornecedores que a pessoa acompanha,
// com os números do armazém de contratos, os contratos recentes de cada um e o aviso no sino quando sai contrato novo. A
// lista vem do Postgres e aparece sempre; os números esperam o armazém e, se ele estiver atualizando, os cards seguem sem
// eles e a tela tenta de novo sozinha.

export function CompetitorsScreen() {
  const list = useCompetitors();
  const items = list.data?.items ?? [];
  const limit = list.data?.limit ?? 30;
  const summaries = useCompetitorSummaries(items.length > 0);
  const confirm = useConfirm();
  const remove = useRemoveCompetitor();
  const [formTarget, setFormTarget] = useState<CompetitorFormTarget | null>(null);
  const closeForm = useCallback(() => setFormTarget(null), []);

  const handleRemove = async (competitor: Competitor) => {
    const confirmed = await confirm({
      title: 'Deixar de acompanhar',
      message: `${competitorTitle(competitor, findCompetitorSummary(summaries.data?.items, competitor.cnpj))} sai da lista e deixa de avisar. Os contratos dele continuam na base.`,
      confirmLabel: 'Deixar de acompanhar',
      variant: 'danger',
    });
    if (confirmed) remove.mutate(competitor.cnpj);
  };

  // Por que os cards estão sem os números, quando estão.
  let numbersNote: string | null = null;
  if (summaries.isError) {
    numbersNote = isContractStoreUpdating(summaries.error)
      ? 'Atualizando os contratos: os números voltam em instantes.'
      : 'Não foi possível carregar os números agora.';
  } else if (summaries.isPending && items.length > 0) {
    numbersNote = 'Carregando os números…';
  }

  let content;
  if (list.isPending) {
    content = <LoadingBlock label="Carregando os concorrentes…" />;
  } else if (list.isError) {
    content = <LoadError message={list.error.message} onRetry={() => void list.refetch()} retrying={list.isFetching} />;
  } else if (items.length === 0) {
    content = (
      <EmptyState
        icon={Radar}
        title="Você ainda não acompanha nenhum concorrente."
        description="Adicione o CNPJ de um fornecedor para ver os contratos dele e receber aviso no sino quando sair contrato novo. Também dá para acompanhar pela página do CNPJ."
        action={
          <Button type="button" size="sm" onClick={() => setFormTarget({ mode: 'add' })} icon={<Plus size={15} aria-hidden="true" />}>
            Adicionar concorrente
          </Button>
        }
      />
    );
  } else {
    content = (
      <>
        {summaries.isError && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200">
            <span>{numbersNote}</span>
            {!isContractStoreUpdating(summaries.error) && (
              <Button type="button" variant="secondary" size="sm" onClick={() => void summaries.refetch()} disabled={summaries.isFetching}>
                Tentar de novo
              </Button>
            )}
          </div>
        )}
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
          {items.map((competitor) => (
            <li key={competitor.cnpj}>
              <CompetitorCard
                competitor={competitor}
                summary={findCompetitorSummary(summaries.data?.items, competitor.cnpj)}
                numbersNote={summaries.isError ? null : numbersNote}
                onEdit={() => setFormTarget({ mode: 'edit', competitor })}
                onRemove={() => void handleRemove(competitor)}
              />
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {list.data
            ? `${competitorLimitText(items.length, limit)}. Receba aviso no sino quando sair contrato novo de cada um.`
            : 'Os fornecedores que você acompanha nesta conta.'}
        </p>
        <Button
          type="button"
          size="sm"
          onClick={() => setFormTarget({ mode: 'add' })}
          disabled={!list.data || items.length >= limit}
          icon={<Plus size={15} aria-hidden="true" />}
          title={list.data && items.length >= limit ? `Você já acompanha ${limit} concorrentes. Deixe de acompanhar algum para adicionar outro.` : undefined}
        >
          Adicionar concorrente
        </Button>
      </div>
      {remove.error && (
        <p role="alert" className="mb-3 text-xs font-medium text-red-600 dark:text-red-400">
          {remove.error.message}
        </p>
      )}
      {content}
      <CompetitorFormDialog target={formTarget} onClose={closeForm} />
    </section>
  );
}
