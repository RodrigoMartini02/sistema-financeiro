import { useCallback, useState } from 'react';
import { FolderLock, Plus } from 'lucide-react';
import { Button } from '@ui/components/button';
import { EmptyState } from '@ui/components/EmptyState';
import { InfoBanner } from '@ui/components/InfoBanner';
import { useDomainLists } from '../hooks/useDomainLists';
import { useVaultDocumentActions } from '../hooks/useVaultDocumentActions';
import { useVaultDocuments } from '../hooks/useVault';
import type { VaultDocument } from '../types';
import { buildDocumentEntries, companyDocuments, filterEntries, summarizeEntries, type DocumentStatusFilter } from '../utils/vault';
import { DocumentCard } from './DocumentCard';
import { DocumentFormDialog, type DocumentFormTarget } from './DocumentFormDialog';
import { LoadError, LoadingBlock } from './LoadStates';

// Aba Cofre (plano .plans/licitacoes-5-cofre-de-documentos.md): os documentos da empresa (certidões, contrato social,
// atestados...), de todos com acesso ao módulo. O resumo por situação filtra a lista; cada tipo mostra o documento vigente e,
// recolhidos, os anteriores. A situação vem da API, calculada no dia de hoje.

const FILTER_BUTTON =
  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600';
const FILTER_ACTIVE = 'border-brand-600 bg-brand-600 text-white';
const FILTER_IDLE =
  'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:text-brand-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-brand-300';

export function VaultDocumentsTab() {
  const documents = useVaultDocuments();
  const lists = useDomainLists();
  const types = lists.data?.documentTypes;
  const storageAvailable = documents.data?.storageAvailable ?? true;
  const [formTarget, setFormTarget] = useState<DocumentFormTarget | null>(null);
  const [filter, setFilter] = useState<DocumentStatusFilter>('ALL');
  const closeForm = useCallback(() => setFormTarget(null), []);
  const { actions, error } = useVaultDocumentActions({
    types,
    storageAvailable,
    onEdit: (document: VaultDocument) => setFormTarget({ mode: 'edit', document }),
  });

  const entries = buildDocumentEntries(companyDocuments(documents.data?.items), types);
  const summary = summarizeEntries(entries);
  const visible = filterEntries(entries, filter);
  const addDocument = () => setFormTarget({ mode: 'create', owner: 'EMPRESA' });

  const filters: Array<{ id: DocumentStatusFilter; label: string; count: number }> = [
    { id: 'ALL', label: 'Todos', count: summary.total },
    { id: 'EXPIRED', label: 'Vencidos', count: summary.expired },
    { id: 'EXPIRING', label: 'Vencendo', count: summary.expiring },
    { id: 'VALID', label: 'Válidos', count: summary.valid },
  ];

  let content;
  if (documents.isPending) {
    content = <LoadingBlock label="Carregando os documentos…" />;
  } else if (documents.isError) {
    content = <LoadError message={documents.error.message} onRetry={() => void documents.refetch()} retrying={documents.isFetching} />;
  } else if (entries.length === 0) {
    content = (
      <EmptyState
        icon={FolderLock}
        title="Nenhum documento da empresa guardado ainda."
        description="Guarde as certidões, o contrato social e os atestados para ter tudo à mão na hora de montar a habilitação e receber aviso no sino antes de vencer."
        action={
          <Button type="button" size="sm" onClick={addDocument} icon={<Plus size={15} aria-hidden="true" />}>
            Guardar documento
          </Button>
        }
      />
    );
  } else {
    content = (
      <>
        <div role="group" aria-label="Filtrar por situação" className="mb-3 flex flex-wrap gap-2">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={`${FILTER_BUTTON} ${filter === item.id ? FILTER_ACTIVE : FILTER_IDLE}`}
            >
              {item.label}
              <span className="tabular-nums">{item.count}</span>
            </button>
          ))}
        </div>
        {visible.length === 0 ? (
          <p role="status" className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            Nenhum documento nesta situação.
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
            {visible.map((entry) => (
              <li key={entry.document.id}>
                <DocumentCard entry={entry} types={types} actions={actions} />
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Certidões, contrato social, atestados e os outros documentos da empresa. Todos com acesso a Licitações veem e cuidam deles.
        </p>
        <Button type="button" size="sm" onClick={addDocument} disabled={!documents.data} icon={<Plus size={15} aria-hidden="true" />}>
          Guardar documento
        </Button>
      </div>
      {!storageAvailable && (
        <div className="mb-3">
          <InfoBanner variant="warn">O envio e a abertura de arquivos estão indisponíveis agora. Os dados dos documentos seguem funcionando.</InfoBanner>
        </div>
      )}
      {error && (
        <p role="alert" className="mb-3 text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {content}
      <DocumentFormDialog target={formTarget} types={types} people={[]} storageAvailable={storageAvailable} onClose={closeForm} />
    </section>
  );
}
