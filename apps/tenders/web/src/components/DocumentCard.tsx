import { useState } from 'react';
import { ChevronDown, ExternalLink, FileText, Pencil, Trash2 } from 'lucide-react';
import { KebabMenu } from '@ui/components/KebabMenu';
import type { DocumentTypeInfo, VaultDocument } from '../types';
import { formatIsoDate } from '../utils/dates';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_TONES,
  documentExpiryText,
  documentTitle,
  documentTypeName,
  fileSizeText,
  findDocumentTypeInfo,
  type DocumentEntry,
} from '../utils/vault';
import { ListCard, ListCardLine } from './ListCard';
import { Pill } from './Pill';

// Um documento do cofre na tela: o cartão do vigente (com os anteriores recolhidos) e a linha compacta, que serve ao histórico
// e aos documentos de cada pessoa. A situação (válido, vencendo, vencido) vem pronta da API; aqui só se mostra.

const LINK_BUTTON =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50';
const LINK_PRIMARY =
  'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200 dark:hover:bg-brand-500/20';
const LINK_NEUTRAL =
  'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:text-brand-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-brand-300';
const ROW_ICON_BUTTON =
  'inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100';

/** O selo da situação do documento. */
export function DocumentStatusPill({ document }: { document: Pick<VaultDocument, 'status' | 'validUntil'> }) {
  return (
    <Pill tone={DOCUMENT_STATUS_TONES[document.status]} title={document.validUntil === null ? 'Documento sem validade' : undefined}>
      {DOCUMENT_STATUS_LABELS[document.status]}
    </Pill>
  );
}

export interface DocumentActions {
  /** Abre o arquivo (link de vida curta); o id em andamento desabilita o botão do documento. */
  onOpen: (document: VaultDocument) => void;
  openingId: number | null;
  onEdit: (document: VaultDocument) => void;
  onRemove: (document: VaultDocument) => void;
  /** Sem R2 configurado, abrir o arquivo fica indisponível. */
  storageAvailable: boolean;
}

/** As linhas de contexto de um documento: validade, emissão, descrição (quando o título não é ela) e o arquivo. */
function contextLines(document: VaultDocument, types: readonly DocumentTypeInfo[] | undefined): string[] {
  const lines = [documentExpiryText(document)];
  if (document.issuedOn) lines.push(`Emitido em ${formatIsoDate(document.issuedOn)}`);
  const type = findDocumentTypeInfo(types, document.type);
  if (document.description && !type?.descriptionRequired) lines.push(document.description);
  lines.push(`${document.fileName} · ${fileSizeText(document.fileSize)}`);
  return lines;
}

/** Linha compacta de um documento: o título, a situação e as ações (abrir, editar, excluir). */
export function DocumentRow({
  document,
  types,
  actions,
  showTypeName = false,
  previous = false,
}: {
  document: VaultDocument;
  types: readonly DocumentTypeInfo[] | undefined;
  actions: DocumentActions;
  /** Nos documentos de uma pessoa o título é o do tipo; no histórico, a data de emissão já distingue um do outro. */
  showTypeName?: boolean;
  /** Um documento que outro, mais novo do mesmo tipo, substituiu (aparece marcado como "Anterior"). */
  previous?: boolean;
}) {
  const title = showTypeName ? documentTitle(document, types) : documentExpiryText(document);
  const details = showTypeName ? contextLines(document, types) : contextLines(document, types).slice(1);
  const opening = actions.openingId === document.id;
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {previous && <Pill tone="muted">Anterior</Pill>}
          <DocumentStatusPill document={document} />
          <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">{title}</span>
        </div>
        <p className="mt-0.5 break-words text-[11.5px] text-slate-500 dark:text-slate-400">{details.join(' · ')}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => actions.onOpen(document)}
          disabled={!actions.storageAvailable || opening}
          aria-label={`Abrir ${document.fileName}`}
          title={actions.storageAvailable ? 'Abrir o arquivo' : 'Abrir arquivos está indisponível agora'}
          className={ROW_ICON_BUTTON}
        >
          <FileText size={15} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => actions.onEdit(document)} aria-label={`Editar ${document.fileName}`} title="Editar" className={ROW_ICON_BUTTON}>
          <Pencil size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => actions.onRemove(document)}
          aria-label={`Excluir ${document.fileName}`}
          title="Excluir"
          className={`${ROW_ICON_BUTTON} hover:!text-red-600 dark:hover:!text-red-400`}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

interface DocumentCardProps {
  entry: DocumentEntry;
  types: readonly DocumentTypeInfo[] | undefined;
  actions: DocumentActions;
}

/** O cartão de um documento vigente da empresa, com os anteriores do mesmo tipo recolhidos embaixo. */
export function DocumentCard({ entry, types, actions }: DocumentCardProps) {
  const { document, history } = entry;
  const [showHistory, setShowHistory] = useState(false);
  const type = findDocumentTypeInfo(types, document.type);
  const lines = contextLines(document, types);
  const opening = actions.openingId === document.id;

  return (
    <ListCard
      badges={<DocumentStatusPill document={document} />}
      topAction={
        <KebabMenu
          actions={[
            { key: 'edit', label: 'Editar', icon: <Pencil size={15} />, onClick: () => actions.onEdit(document) },
            { key: 'remove', label: 'Excluir', icon: <Trash2 size={15} />, onClick: () => actions.onRemove(document), tone: 'danger' },
          ]}
        />
      }
      title={documentTitle(document, types)}
      context={lines.map((line) => (
        <ListCardLine key={line} lines="all">
          {line}
        </ListCardLine>
      ))}
      footer={
        <div className="grid grid-cols-1 gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => actions.onOpen(document)}
              disabled={!actions.storageAvailable || opening}
              title={actions.storageAvailable ? undefined : 'Abrir arquivos está indisponível agora'}
              className={`${LINK_BUTTON} ${LINK_PRIMARY}`}
            >
              <FileText size={14} aria-hidden="true" />
              {opening ? 'Abrindo…' : 'Abrir'}
            </button>
            {type?.issuerUrl && (
              <a href={type.issuerUrl} target="_blank" rel="noopener noreferrer" className={`${LINK_BUTTON} ${LINK_NEUTRAL}`}>
                <ExternalLink size={14} aria-hidden="true" />
                Emitir no site do órgão
              </a>
            )}
            {history.length > 0 && (
              <button
                type="button"
                aria-expanded={showHistory}
                onClick={() => setShowHistory((open) => !open)}
                className={`${LINK_BUTTON} ${LINK_NEUTRAL}`}
              >
                Anteriores ({history.length})
                <ChevronDown size={14} className={showHistory ? 'rotate-180' : ''} aria-hidden="true" />
              </button>
            )}
          </div>
          {showHistory && (
            <div className="grid gap-1.5" aria-label={`Documentos anteriores: ${documentTypeName(types, document.type)}`}>
              {history.map((older) => (
                <DocumentRow key={older.id} document={older} types={types} actions={actions} />
              ))}
            </div>
          )}
        </div>
      }
    />
  );
}
