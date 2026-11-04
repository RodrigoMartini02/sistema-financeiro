import { Link, type To } from 'react-router-dom';
import type { ContractListItem } from '../types';
import { formatIsoDate } from '../utils/dates';
import { formatMoneyValue } from '../utils/money';
import { CnpjLink } from './CnpjLink';
import { ContractBadges, ExpiryBadge } from './ContractBadges';
import { ContractFavoriteButton } from './FavoriteButton';
import { HighlightedText } from './HighlightedText';
import { ListCard, ListCardLine } from './ListCard';
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
    <ListCard
      badges={<ContractBadges contract={contract} todayIso={todayIso} />}
      topAction={<ContractFavoriteButton contract={contract} />}
      title={
        <Link
          to={detailLink}
          state={detailLinkState}
          title={contract.contractObject}
          className="line-clamp-2 rounded hover:text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:hover:text-brand-300"
        >
          {contract.highlightedExcerpt ? <HighlightedText text={contract.highlightedExcerpt} /> : contract.contractObject}
        </Link>
      }
      context={
        <>
          <ListCardLine>
            <NoticePlace notice={contract} />
          </ListCardLine>
          <ListCardLine>
            Fornecedor: <CnpjLink cnpj={contract.supplierDocument}>{contract.supplierName ?? 'Não informado'}</CnpjLink>
          </ListCardLine>
        </>
      }
      metrics={[
        { label: 'Valor global', value: formatMoneyValue(contract.globalValue) },
        {
          label: 'Vencimento',
          value: (
            <>
              {contract.expiresOn && <span>{formatIsoDate(contract.expiresOn)}</span>}
              <ExpiryBadge expiresOn={contract.expiresOn} todayIso={todayIso} />
            </>
          ),
        },
      ]}
    />
  );
}
