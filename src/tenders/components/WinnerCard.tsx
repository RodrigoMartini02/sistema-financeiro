import { ExternalLink, FileSearch } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CnpjWinnerItem } from '../types';
import { purchaseLabel, resultPeriodLabel } from '../utils/cnpjPage';
import { formatCnpj } from '../utils/labels';
import { formatMoneyValue } from '../utils/money';
import { CnpjLink } from './CnpjLink';
import { ListCard, ListCardLine } from './ListCard';
import { Pill } from './Pill';

const actionClass =
  'inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-brand-300';

/** Card de uma licitação vencida pelo CNPJ: a compra, o órgão, os itens, o valor e o resultado. */
export function WinnerCard({ winner }: { winner: CnpjWinnerItem }) {
  const place = [winner.cityName, winner.state].filter(Boolean).join('/');
  return (
    <ListCard
      badges={
        <>
          <Pill tone="success">Licitação vencida</Pill>
          <Pill>{winner.year}</Pill>
        </>
      }
      title={`Licitação ${purchaseLabel(winner.purchaseControlNumber)}`}
      context={
        <ListCardLine>
          <CnpjLink cnpj={winner.agencyCnpj}>{winner.agencyName ?? `CNPJ ${formatCnpj(winner.agencyCnpj)}`}</CnpjLink>
          {place ? ` · ${place}` : ''}
        </ListCardLine>
      }
      metrics={[
        { label: 'Itens vencidos', value: winner.items.toLocaleString('pt-BR') },
        { label: 'Valor homologado', value: formatMoneyValue(winner.totalValue) },
        { label: 'Resultado', value: resultPeriodLabel(winner.firstResultDate, winner.lastResultDate) },
      ]}
      footer={
        winner.noticeId !== null || winner.link ? (
          <div className="flex flex-wrap gap-2">
            {winner.noticeId !== null && (
              <Link to={`/editais/${winner.noticeId}`} className={actionClass}>
                <FileSearch size={14} aria-hidden="true" />
                Ver edital
              </Link>
            )}
            {winner.link && (
              <a href={winner.link} target="_blank" rel="noopener noreferrer" className={actionClass}>
                <ExternalLink size={14} aria-hidden="true" />
                Ver compra original
              </a>
            )}
          </div>
        ) : undefined
      }
    />
  );
}
