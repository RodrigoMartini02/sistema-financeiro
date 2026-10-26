import { ExternalLink, FileSearch } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CnpjWinnerItem } from '../types';
import { purchaseLabel, resultPeriodLabel } from '../utils/cnpjPage';
import { formatCnpj } from '../utils/labels';
import { formatMoneyValue } from '../utils/money';
import { CnpjLink } from './CnpjLink';
import { Pill } from './Pill';

const actionClass =
  'inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-brand-300';

/** Card de uma licitação vencida pelo CNPJ: a compra, o órgão, os itens, o valor e o resultado. */
export function WinnerCard({ winner }: { winner: CnpjWinnerItem }) {
  const place = [winner.cityName, winner.state].filter(Boolean).join('/');
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex flex-wrap items-center gap-1.5">
        <Pill tone="success">Licitação vencida</Pill>
        <Pill>{winner.year}</Pill>
      </div>

      <h3 className="mt-2 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">Licitação {purchaseLabel(winner.purchaseControlNumber)}</h3>
      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
        <CnpjLink cnpj={winner.agencyCnpj}>{winner.agencyName ?? `CNPJ ${formatCnpj(winner.agencyCnpj)}`}</CnpjLink>
        {place ? ` · ${place}` : ''}
      </p>

      <dl className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2 text-xs">
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Itens vencidos</dt>
          <dd className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{winner.items.toLocaleString('pt-BR')}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Valor homologado</dt>
          <dd className="font-semibold text-slate-800 dark:text-slate-100">{formatMoneyValue(winner.totalValue)}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Resultado</dt>
          <dd className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">{resultPeriodLabel(winner.firstResultDate, winner.lastResultDate)}</dd>
        </div>
      </dl>

      {(winner.noticeId !== null || winner.link) && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
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
      )}
    </article>
  );
}
