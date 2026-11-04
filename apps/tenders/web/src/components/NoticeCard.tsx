import { Link, type To } from 'react-router-dom';
import type { NoticeListItem } from '../types';
import { formatIsoDateTime } from '../utils/dates';
import { formatMoneyValue } from '../utils/money';
import { CnpjLink } from './CnpjLink';
import { CountdownBadge } from './CountdownBadge';
import { FavoriteButton } from './FavoriteButton';
import { HighlightedText } from './HighlightedText';
import { ListCard, ListCardLine } from './ListCard';
import { NoticeBadges } from './NoticeBadges';
import { TrackingStatusPill } from './Pill';
import { TrackingActions } from './TrackingActions';

/** Órgão · Município/UF, com o que houver. */
export function noticePlace(notice: Pick<NoticeListItem, 'agencyName' | 'cityName' | 'state'>): string {
  const city = [notice.cityName, notice.state].filter(Boolean).join('/');
  return [notice.agencyName, city].filter(Boolean).join(' · ');
}

/** "Órgão · Município/UF" com o nome do órgão como link para a página do CNPJ (quando o CNPJ é válido). */
export function NoticePlace({ notice }: { notice: Pick<NoticeListItem, 'agencyName' | 'cityName' | 'state'> & { agencyCnpj: string | null } }) {
  const city = [notice.cityName, notice.state].filter(Boolean).join('/');
  if (!notice.agencyName && !city) return <>Órgão não informado</>;
  return (
    <>
      {notice.agencyName && <CnpjLink cnpj={notice.agencyCnpj}>{notice.agencyName}</CnpjLink>}
      {notice.agencyName && city ? ' · ' : ''}
      {city}
    </>
  );
}

interface NoticeCardProps {
  notice: NoticeListItem;
  /** Onde o objeto leva: o painel lateral (Editais) ou a página do edital. */
  detailLink: To;
  detailLinkState?: unknown;
}

/** Card do resultado da busca (escopo, seção 9.4). */
export function NoticeCard({ notice, detailLink, detailLinkState }: NoticeCardProps) {
  return (
    <ListCard
      badges={
        <>
          <NoticeBadges notice={notice} />
          {notice.tracking && <TrackingStatusPill status={notice.tracking.status} />}
        </>
      }
      topAction={<FavoriteButton notice={notice} />}
      title={
        <Link
          to={detailLink}
          state={detailLinkState}
          title={notice.procurementObject}
          className="line-clamp-2 rounded hover:text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:hover:text-brand-300"
        >
          {notice.highlightedExcerpt ? <HighlightedText text={notice.highlightedExcerpt} /> : notice.procurementObject}
        </Link>
      }
      context={
        <ListCardLine>
          <NoticePlace notice={notice} />
        </ListCardLine>
      }
      metrics={[
        { label: 'Valor estimado', value: formatMoneyValue(notice.estimatedTotalValue) },
        {
          label: 'Encerramento',
          value: (
            <>
              {notice.proposalClosesAt && <span>{formatIsoDateTime(notice.proposalClosesAt)}</span>}
              <CountdownBadge closesAt={notice.proposalClosesAt} />
            </>
          ),
        },
      ]}
      footer={<TrackingActions notice={notice} />}
    />
  );
}
