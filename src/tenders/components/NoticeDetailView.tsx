import { useId, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bookmark, Circle, CircleCheck, ExternalLink, FileSearch, Maximize2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../ui/EmptyState';
import { useNow } from '../hooks/useNow';
import { fetchNotice } from '../services/noticesService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { NoticeDetail } from '../types';
import { formatIsoDateTime } from '../utils/dates';
import { formatCnpj } from '../utils/labels';
import { formatMoneyValue } from '../utils/money';
import { SEARCH_URL_PARAMS } from '../utils/searchFilters';
import { CountdownBadge } from './CountdownBadge';
import { FavoriteButton } from './FavoriteButton';
import { LoadError, LoadingBlock } from './LoadStates';
import { NoticeBadges } from './NoticeBadges';
import { NoticeFilesTab, NoticeItemsTab } from './NoticePncpTabs';
import { NoticeTrackingTab } from './NoticeTrackingTab';
import { TrackingStatusPill } from './Pill';
import { TabPanel, Tabs } from './Tabs';

// Detalhe do edital (escopo, seção 9.4): no painel lateral de Buscar e na
// rota própria /editais/:id.

const TABS = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'itens', label: 'Itens' },
  { id: 'arquivos', label: 'Arquivos' },
  { id: 'acompanhamento', label: 'Acompanhamento' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const externalLinkClass =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-brand-300';

function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-800 dark:text-slate-100">{children}</dd>
    </div>
  );
}

function priceRegistrationLabel(value: boolean | null): string {
  return value === null ? 'Não informado' : value ? 'Sim' : 'Não';
}

function NoticeTimeline({ notice }: { notice: NoticeDetail }) {
  const now = useNow().getTime();
  const steps = [
    { key: 'published', label: 'Publicação', at: notice.publishedAt },
    { key: 'opens', label: 'Abertura das propostas', at: notice.proposalOpensAt },
    { key: 'closes', label: 'Encerramento', at: notice.proposalClosesAt },
  ];
  const nextIndex = steps.findIndex((step) => step.at !== null && new Date(step.at).getTime() > now);
  return (
    <ol aria-label="Datas do edital" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {steps.map((step, index) => {
        const done = step.at !== null && new Date(step.at).getTime() <= now;
        const next = index === nextIndex;
        return (
          <li
            key={step.key}
            aria-current={next ? 'step' : undefined}
            className={`rounded-xl border px-3 py-2 ${
              next ? 'border-brand-300 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10' : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {done ? <CircleCheck size={12} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}
              {step.label}
            </p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">{formatIsoDateTime(step.at)}</p>
            {next && (
              <div className="mt-1">
                {step.key === 'closes' ? (
                  <CountdownBadge closesAt={step.at} />
                ) : (
                  <span className="text-xs font-semibold text-brand-700 dark:text-brand-300">Próxima etapa</span>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function SummaryTab({ notice }: { notice: NoticeDetail }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      <InfoItem label="Modalidade">{notice.modalityName ?? 'Não informada'}</InfoItem>
      <InfoItem label="Modo de disputa">{notice.disputeModeName ?? 'Não informado'}</InfoItem>
      <InfoItem label="Valor estimado">{formatMoneyValue(notice.estimatedTotalValue)}</InfoItem>
      <InfoItem label="Registro de preços (SRP)">{priceRegistrationLabel(notice.isPriceRegistration)}</InfoItem>
      <InfoItem label="Situação">{notice.situationName ?? 'Não informada'}</InfoItem>
      <div className="sm:col-span-2">
        <InfoItem label="Informação complementar">
          <span className="whitespace-pre-line">{notice.additionalInformation?.trim() || 'Não informada'}</span>
        </InfoItem>
      </div>
    </dl>
  );
}

interface NoticeDetailContentProps {
  notice: NoticeDetail;
  /** No painel lateral: mostra o atalho para a página do edital. */
  inDrawer: boolean;
}

export function NoticeDetailContent({ notice, inDrawer }: NoticeDetailContentProps) {
  const [tab, setTab] = useState<TabId>('resumo');
  const idPrefix = useId();
  const city = [notice.cityName, notice.state].filter(Boolean).join('/');
  const purchase = notice.purchaseNumber ? `${notice.purchaseNumber}${notice.purchaseYear ? `/${notice.purchaseYear}` : ''}` : null;

  return (
    <article className="grid grid-cols-1 gap-5">
      <header className="grid grid-cols-1 gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <NoticeBadges notice={notice} />
          {notice.tracking && <TrackingStatusPill status={notice.tracking.status} />}
          <CountdownBadge closesAt={notice.proposalClosesAt} />
        </div>
        <h2 className="text-base font-semibold leading-snug text-slate-900 dark:text-slate-100 sm:text-lg">{notice.procurementObject}</h2>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <InfoItem label="Órgão">
            {notice.agencyName ?? 'Não informado'}
            {notice.agencyCnpj && <span className="block text-xs text-slate-500 dark:text-slate-400">CNPJ {formatCnpj(notice.agencyCnpj)}</span>}
          </InfoItem>
          {notice.unitName && notice.unitName !== notice.agencyName && <InfoItem label="Unidade">{notice.unitName}</InfoItem>}
          <InfoItem label="Município/UF">{city || 'Não informado'}</InfoItem>
          <InfoItem label="Número da compra">{purchase ?? 'Não informado'}</InfoItem>
          <InfoItem label="Processo">{notice.processNumber ?? 'Não informado'}</InfoItem>
          <InfoItem label="Controle PNCP">{notice.pncpControlNumber}</InfoItem>
        </dl>
        <div className="flex flex-wrap items-start gap-2">
          <FavoriteButton notice={notice} variant="labeled" />
          {notice.pncpLink && (
            <a href={notice.pncpLink} target="_blank" rel="noopener noreferrer" className={externalLinkClass}>
              <ExternalLink size={14} aria-hidden="true" />
              Abrir no PNCP
            </a>
          )}
          {notice.sourceSystemLink && (
            <a href={notice.sourceSystemLink} target="_blank" rel="noopener noreferrer" className={externalLinkClass}>
              <ExternalLink size={14} aria-hidden="true" />
              Sistema de origem
            </a>
          )}
          {inDrawer && (
            <Link to={`/editais/${notice.id}`} className={externalLinkClass}>
              <Maximize2 size={14} aria-hidden="true" />
              Abrir em página própria
            </Link>
          )}
        </div>
      </header>

      <NoticeTimeline notice={notice} />

      <section aria-label="Buscas salvas que batem" className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        <Bookmark size={14} className="text-slate-400" aria-hidden="true" />
        {notice.matchingSavedSearches.length === 0 ? (
          <span>Nenhuma das suas buscas salvas bate com este edital.</span>
        ) : (
          <>
            <span>Bate com suas buscas salvas:</span>
            {notice.matchingSavedSearches.map((search) => (
              <Link
                key={search.id}
                to={`/buscar?${SEARCH_URL_PARAMS.savedSearch}=${search.id}`}
                className="rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-700 hover:underline dark:bg-brand-500/10 dark:text-brand-300"
              >
                {search.name}
              </Link>
            ))}
          </>
        )}
      </section>

      <div>
        <Tabs tabs={TABS} active={tab} onChange={setTab} label="Partes do edital" idPrefix={idPrefix} />
        <TabPanel idPrefix={idPrefix} tabId={tab}>
          {tab === 'resumo' && <SummaryTab notice={notice} />}
          {tab === 'itens' && <NoticeItemsTab noticeId={notice.id} />}
          {tab === 'arquivos' && <NoticeFilesTab noticeId={notice.id} />}
          {tab === 'acompanhamento' && <NoticeTrackingTab notice={notice} />}
        </TabPanel>
      </div>
    </article>
  );
}

/** Edital pela API, com carregando, não encontrado e erro. */
export function NoticeDetailView({ noticeId, inDrawer }: { noticeId: number; inDrawer: boolean }) {
  const detail = useQuery<NoticeDetail, TendersApiError>({
    queryKey: tendersQueryKeys.notice(noticeId),
    queryFn: () => fetchNotice(noticeId),
  });

  if (detail.isPending) return <LoadingBlock label="Abrindo o edital…" />;
  if (detail.isError) {
    if (detail.error.status === 404) {
      return (
        <EmptyState
          icon={FileSearch}
          title="Edital não encontrado."
          description="Ele pode ter saído da base (editais encerrados há mais de 12 meses ou sem prazo de proposta)."
          action={
            <Link to="/buscar" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
              Ir para Buscar
            </Link>
          }
        />
      );
    }
    return <LoadError title="Não foi possível abrir o edital" message={detail.error.message} onRetry={() => void detail.refetch()} retrying={detail.isFetching} />;
  }
  return <NoticeDetailContent notice={detail.data} inDrawer={inDrawer} />;
}
