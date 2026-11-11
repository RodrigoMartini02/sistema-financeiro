import { useCallback, useState } from 'react';
import { FilePlus2, Pencil, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { Button } from '@ui/components/button';
import { EmptyState } from '@ui/components/EmptyState';
import { InfoBanner } from '@ui/components/InfoBanner';
import { KebabMenu } from '@ui/components/KebabMenu';
import { useConfirm } from '@ui/context/ConfirmContext';
import { formatCpf } from '@ui/utils/brazilDocuments';
import { useDomainLists } from '../hooks/useDomainLists';
import { useVaultDocumentActions } from '../hooks/useVaultDocumentActions';
import { useDeleteVaultPerson, useVaultDocuments, useVaultPeople } from '../hooks/useVault';
import type { DocumentTypeInfo, VaultDocument, VaultPerson } from '../types';
import { buildDocumentEntries, documentsOfPerson, personLimitText, personRolesText } from '../utils/vault';
import { DocumentRow } from './DocumentCard';
import { DocumentFormDialog, type DocumentFormTarget } from './DocumentFormDialog';
import { ListCard, ListCardLine } from './ListCard';
import { LoadError, LoadingBlock } from './LoadStates';
import { PersonFormDialog, type PersonFormTarget } from './PersonFormDialog';

// Aba Pessoas (só o titular; plano .plans/licitacoes-5-cofre-de-documentos.md): sócios, representantes, procuradores e
// responsáveis técnicos, cada um com os documentos pessoais dele (RG ou CNH, procuração...). É dado pessoal de terceiros: o
// colaborador não vê esta aba nem os documentos, e a API recusa o pedido dele.

const LINK_BUTTON =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600';
const LINK_PRIMARY =
  'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200 dark:hover:bg-brand-500/20';

interface PersonCardProps {
  person: VaultPerson;
  documents: VaultDocument[];
  types: readonly DocumentTypeInfo[] | undefined;
  roles: ReadonlyArray<{ id: string; name: string }> | undefined;
  rows: (document: VaultDocument, previous: boolean) => React.ReactNode;
  onAddDocument: () => void;
  onEdit: () => void;
  onRemove: () => void;
}

function PersonCard({ person, documents, types, roles, rows, onAddDocument, onEdit, onRemove }: PersonCardProps) {
  // O vigente de cada tipo primeiro e, marcados como anteriores, os que ele substituiu.
  const entries = buildDocumentEntries(documents, types);
  const lines = [personRolesText(person.roles, roles), person.jobTitle, `CPF ${formatCpf(person.cpf)}`, person.email, person.phone].filter(
    (line): line is string => typeof line === 'string' && line !== '',
  );
  return (
    <ListCard
      title={person.name}
      topAction={
        <KebabMenu
          actions={[
            { key: 'edit', label: 'Editar pessoa', icon: <Pencil size={15} />, onClick: onEdit },
            { key: 'remove', label: 'Excluir pessoa', icon: <Trash2 size={15} />, onClick: onRemove, tone: 'danger' },
          ]}
        />
      }
      context={lines.map((line) => (
        <ListCardLine key={line} lines="all">
          {line}
        </ListCardLine>
      ))}
      footer={
        <div className="grid grid-cols-1 gap-2">
          {entries.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">Nenhum documento guardado para esta pessoa.</p>
          ) : (
            <div className="grid gap-1.5">
              {entries.flatMap((entry) => [
                <div key={entry.document.id}>{rows(entry.document, false)}</div>,
                ...entry.history.map((older) => <div key={older.id}>{rows(older, true)}</div>),
              ])}
            </div>
          )}
          <div>
            <button type="button" onClick={onAddDocument} className={`${LINK_BUTTON} ${LINK_PRIMARY}`}>
              <FilePlus2 size={14} aria-hidden="true" />
              Guardar documento
            </button>
          </div>
        </div>
      }
    />
  );
}

export function VaultPeopleTab() {
  const people = useVaultPeople(true);
  const documents = useVaultDocuments();
  const lists = useDomainLists();
  const confirm = useConfirm();
  const removePerson = useDeleteVaultPerson();
  const types = lists.data?.documentTypes;
  const roles = lists.data?.personRoles;
  const storageAvailable = documents.data?.storageAvailable ?? true;
  const [personTarget, setPersonTarget] = useState<PersonFormTarget | null>(null);
  const [documentTarget, setDocumentTarget] = useState<DocumentFormTarget | null>(null);
  const closePerson = useCallback(() => setPersonTarget(null), []);
  const closeDocument = useCallback(() => setDocumentTarget(null), []);
  const { actions, error: documentError } = useVaultDocumentActions({
    types,
    storageAvailable,
    onEdit: (document) => setDocumentTarget({ mode: 'edit', document }),
  });

  const items = people.data?.items ?? [];
  const limit = people.data?.limit ?? 50;

  const handleRemove = async (person: VaultPerson) => {
    const confirmed = await confirm({
      title: 'Excluir pessoa',
      message:
        person.documentCount > 0
          ? `${person.name} sai do cofre junto com ${person.documentCount === 1 ? 'o documento' : `os ${person.documentCount} documentos`} dela e os arquivos. Não dá para desfazer.`
          : `${person.name} sai do cofre. Não dá para desfazer.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (confirmed) removePerson.mutate(person.id);
  };

  let content;
  if (people.isPending) {
    content = <LoadingBlock label="Carregando as pessoas…" />;
  } else if (people.isError) {
    content = <LoadError message={people.error.message} onRetry={() => void people.refetch()} retrying={people.isFetching} />;
  } else if (items.length === 0) {
    content = (
      <EmptyState
        icon={Users}
        title="Nenhuma pessoa cadastrada ainda."
        description="Cadastre os sócios, representantes legais, procuradores e responsáveis técnicos para guardar os documentos pessoais deles, como RG, CNH e procurações."
        action={
          <Button type="button" size="sm" onClick={() => setPersonTarget({ mode: 'create' })} icon={<UserPlus size={15} aria-hidden="true" />}>
            Cadastrar pessoa
          </Button>
        }
      />
    );
  } else {
    content = (
      <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
        {items.map((person) => (
          <li key={person.id}>
            <PersonCard
              person={person}
              documents={documentsOfPerson(documents.data?.items, person.id)}
              types={types}
              roles={roles}
              rows={(document, previous) => <DocumentRow document={document} types={types} actions={actions} showTypeName previous={previous} />}
              onAddDocument={() => setDocumentTarget({ mode: 'create', owner: 'PESSOA', personId: person.id })}
              onEdit={() => setPersonTarget({ mode: 'edit', person })}
              onRemove={() => void handleRemove(person)}
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
          {people.data
            ? `${personLimitText(items.length, limit)}. Só o titular da conta vê as pessoas e os documentos pessoais delas.`
            : 'Pessoas ligadas à empresa e os documentos pessoais delas.'}
        </p>
        <Button
          type="button"
          size="sm"
          onClick={() => setPersonTarget({ mode: 'create' })}
          disabled={!people.data || items.length >= limit}
          icon={<Plus size={15} aria-hidden="true" />}
          title={people.data && items.length >= limit ? `Esta conta já tem ${limit} pessoas. Apague alguma para cadastrar outra.` : undefined}
        >
          Cadastrar pessoa
        </Button>
      </div>
      {!storageAvailable && (
        <div className="mb-3">
          <InfoBanner variant="warn">O envio e a abertura de arquivos estão indisponíveis agora. Os dados das pessoas seguem funcionando.</InfoBanner>
        </div>
      )}
      {(removePerson.error || documentError) && (
        <p role="alert" className="mb-3 text-xs font-medium text-red-600 dark:text-red-400">
          {removePerson.error?.message ?? documentError}
        </p>
      )}
      {content}
      <PersonFormDialog target={personTarget} roles={roles ?? []} onClose={closePerson} />
      <DocumentFormDialog target={documentTarget} types={types} people={items} storageAvailable={storageAvailable} onClose={closeDocument} />
    </section>
  );
}
