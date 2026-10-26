import { Link, type To } from 'react-router-dom';
import type { ContractListItem } from '../types';
import { formatIsoDate } from '../utils/dates';
import { formatMoneyValue } from '../utils/money';
import { CnpjLink } from './CnpjLink';
import { ContractBadges, ExpiryBadge } from './ContractBadges';
import { ContractFavoriteButton } from './FavoriteButton';
import { HighlightedText } from './HighlightedText';
import { NoticePlace } from './NoticeCard';

interface ContractCardProps {
  contract: ContractListItem;
  todayIso: string;
  /** Onde o objeto leva: o painel lateral (Contratos a vencer) ou a página do contrato. */
  detailLink: To;
  detailLinkState?: unknown;
}

/** Card do resultado de "Contratos a vencer": tipo, objeto, órgão e local, fornecedor, valor e vencimento. */
export function ContractCard({ contract, todayIso, detailLink, detailLinkState }: ContractCardProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-200 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-brand-500/40">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <ContractBadges contract={contract} todayIso={todayIso} />
        </div>
        <ContractFavoriteButton contract={contract} />
      </div>

      <h3 className="mt-2 text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100">
        <Link
          to={detailLink}
          state={detailLinkState}
          title={contract.contractObject}
          className="line-clamp-2 rounded hover:text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:hover:text-brand-300"
        >
          {contract.highlightedExcerpt ? <HighlightedText text={contract.highlightedExcerpt} /> : contract.contractObject}
        </Link>
      </h3>
      <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
        <NoticePlace notice={contract} />
      </p>
      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
        Fornecedor: <CnpjLink cnpj={contract.supplierDocument}>{contract.supplierName ?? 'Não informado'}</CnpjLink>
      </p>

      <dl className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2 text-xs">
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Valor global</dt>
          <dd className="font-semibold text-slate-800 dark:text-slate-100">{formatMoneyValue(contract.globalValue)}</dd>
        </div>
        <div>
          <dt className="text-slate-500 dark:text-slate-400">Vencimento</dt>
          <dd className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
            {contract.expiresOn && <span>{formatIsoDate(contract.expiresOn)}</span>}
            <ExpiryBadge expiresOn={contract.expiresOn} todayIso={todayIso} />
          </dd>
        </div>
      </dl>
    </article>
  );
}
