import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, FileText, Info, TriangleAlert } from 'lucide-react';
import { EmptyState } from '../../ui/EmptyState';
import { fetchNoticeFiles, fetchNoticeItems } from '../services/noticesService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { NoticeDetailList, NoticeFile, NoticeItem } from '../types';
import { formatIsoDate, formatIsoDateTime } from '../utils/dates';
import { formatMoneyValue } from '../utils/money';
import { LoadError, LoadingBlock } from './LoadStates';

// Abas Itens e Arquivos: buscadas no PNCP só quando abertas (a API guarda por
// 24 h e serve a cópia quando o PNCP falha).

const DETAIL_STALE_MS = 5 * 60 * 1000;

function Notice({ tone, icon, children }: { tone: 'info' | 'warning'; icon: ReactNode; children: ReactNode }) {
  const classes =
    tone === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
      : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300';
  return <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${classes}`}>{icon}<div>{children}</div></div>;
}

function PncpLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300">
      {children}
    </a>
  );
}

/** Avisos da lista: cópia guardada (PNCP falhou) e "há mais no PNCP". */
function ListNotes<T>({ list, moreLabel }: { list: NoticeDetailList<T>; moreLabel: string }) {
  return (
    <>
      {list.stale && (
        <Notice tone="warning" icon={<TriangleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />}>
          O PNCP não respondeu agora. Mostrando a cópia guardada em {formatIsoDateTime(list.fetchedAt)}.
        </Notice>
      )}
      {list.hasMore && (
        <Notice tone="info" icon={<Info size={14} className="mt-px shrink-0" aria-hidden="true" />}>
          Há mais {moreLabel} no PNCP do que os mostrados aqui.{' '}
          {list.pncpLink && <PncpLink href={list.pncpLink}>Ver todos no PNCP</PncpLink>}
        </Notice>
      )}
    </>
  );
}

function NotOnPncp({ pncpLink }: { pncpLink: string | null }) {
  return (
    <EmptyState
      icon={Info}
      title="O PNCP ainda não tem esta compra."
      description="Os dados de itens e arquivos aparecem quando o órgão publicar no PNCP."
      action={pncpLink ? <PncpLink href={pncpLink}>Abrir no PNCP</PncpLink> : undefined}
    />
  );
}

function formatQuantity(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

export function NoticeItemsTab({ noticeId }: { noticeId: number }) {
  const items = useQuery<NoticeDetailList<NoticeItem>, TendersApiError>({
    queryKey: tendersQueryKeys.noticeItems(noticeId),
    queryFn: () => fetchNoticeItems(noticeId),
    staleTime: DETAIL_STALE_MS,
  });

  if (items.isPending) return <LoadingBlock label="Buscando os itens no PNCP…" />;
  if (items.isError) {
    return <LoadError title="Não foi possível carregar os itens" message={items.error.message} onRetry={() => void items.refetch()} retrying={items.isFetching} />;
  }
  const list = items.data;
  if (!list.foundOnPncp) return <NotOnPncp pncpLink={list.pncpLink} />;

  return (
    <div className="grid grid-cols-1 gap-3">
      <ListNotes list={list} moreLabel="itens" />
      {list.records.length === 0 ? (
        <EmptyState icon={FileText} title="O PNCP não informa itens para esta compra." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900/40 dark:text-slate-400">
              <tr>
                <th scope="col" className="w-12 px-3 py-2">Nº</th>
                <th scope="col" className="px-3 py-2">Descrição</th>
                <th scope="col" className="px-3 py-2 text-right">Qtd.</th>
                <th scope="col" className="px-3 py-2">Unidade</th>
                <th scope="col" className="px-3 py-2 text-right">Valor unit. est.</th>
                <th scope="col" className="px-3 py-2 text-right">Valor total est.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {list.records.map((item) => (
                <tr key={item.number} className="align-top text-slate-700 dark:text-slate-200">
                  <td className="px-3 py-2 tabular-nums">{item.number}</td>
                  <td className="px-3 py-2">
                    <p>{item.description ?? 'Sem descrição'}</p>
                    {(item.kind || item.situationName) && (
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{[item.kind, item.situationName].filter(Boolean).join(' · ')}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatQuantity(item.quantity)}</td>
                  <td className="px-3 py-2">{item.unit ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {item.confidentialBudget ? 'Sigiloso' : formatMoneyValue(item.estimatedUnitValue)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {item.confidentialBudget ? 'Sigiloso' : formatMoneyValue(item.estimatedTotalValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function NoticeFilesTab({ noticeId }: { noticeId: number }) {
  const files = useQuery<NoticeDetailList<NoticeFile>, TendersApiError>({
    queryKey: tendersQueryKeys.noticeFiles(noticeId),
    queryFn: () => fetchNoticeFiles(noticeId),
    staleTime: DETAIL_STALE_MS,
  });

  if (files.isPending) return <LoadingBlock label="Buscando os arquivos no PNCP…" />;
  if (files.isError) {
    return <LoadError title="Não foi possível carregar os arquivos" message={files.error.message} onRetry={() => void files.refetch()} retrying={files.isFetching} />;
  }
  const list = files.data;
  if (!list.foundOnPncp) return <NotOnPncp pncpLink={list.pncpLink} />;

  return (
    <div className="grid grid-cols-1 gap-3">
      <ListNotes list={list} moreLabel="arquivos" />
      {list.records.length === 0 ? (
        <EmptyState icon={FileText} title="O PNCP não tem arquivos para esta compra." />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
          {list.records.map((file) => {
            const title = file.title ?? file.typeName ?? `Documento ${file.sequence}`;
            return (
              <li key={file.sequence} className="flex items-center gap-3 px-3 py-2.5">
                <FileText size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {[file.typeName, file.publishedAt ? `publicado em ${formatIsoDate(file.publishedAt)}` : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Abrir ${title} (abre em nova aba)`}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 hover:border-brand-300 hover:text-brand-700 dark:border-slate-600 dark:text-slate-300 dark:hover:text-brand-300"
                >
                  <ExternalLink size={14} aria-hidden="true" />
                  Abrir
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
