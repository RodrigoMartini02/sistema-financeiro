import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, FileSearch, Maximize2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../ui/EmptyState';
import { getLocalTodayIso } from '../../utils/date';
import { fetchContract } from '../services/contractsService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { ContractAmendment, ContractDetail } from '../types';
import { formatIsoDate } from '../utils/dates';
import { formatCnpj } from '../utils/labels';
import { formatMoneyValue } from '../utils/money';
import { ContractBadges, ExpiryBadge } from './ContractBadges';
import { ContractFavoriteButton } from './FavoriteButton';
import { LoadError, LoadingBlock } from './LoadStates';

// Detalhe do contrato (plano .plans/licitacoes-contratos-a-vencer.md, Parte B):
// no painel lateral de "Contratos a vencer" (?contrato=) e na rota /contratos/:id.

const linkClass =
  'inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-brand-300 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:text-brand-300';

const SPHERE_LABELS: Record<string, string> = { F: 'Federal', E: 'Estadual', M: 'Municipal', D: 'Distrital' };

function InfoItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-slate-800 dark:text-slate-100">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-1 gap-3">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
      {children}
    </section>
  );
}

/** "CNPJ 00.000.000/0000-00" ou, na pessoa física, o CPF mascarado como veio. */
function supplierDocumentLabel(contract: ContractDetail): string | null {
  if (!contract.supplierDocument) return null;
  return contract.supplierPersonType === 'PJ' ? `CNPJ ${formatCnpj(contract.supplierDocument)}` : contract.supplierDocument;
}

function AmendmentsList({ amendments, hasOriginalEnd }: { amendments: ContractAmendment[] | null; hasOriginalEnd: boolean }) {
  if (amendments === null) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {hasOriginalEnd
          ? 'Nenhuma alteração registrada: vale o fim original da vigência.'
          : 'Nenhuma alteração registrada, e o contrato não informa a data de fim.'}
      </p>
    );
  }
  if (amendments.length === 0) {
    return <p className="text-sm text-slate-600 dark:text-slate-300">Nenhum aditivo ou rescisão publicado.</p>;
  }
  return (
    <ol className="grid grid-cols-1 gap-2">
      {[...amendments].reverse().map((term, index) => (
        <li
          key={`${term.sequence ?? 'sem'}-${index}`}
          className={`rounded-xl border px-3 py-2 ${
            term.changesTerm ? 'border-brand-200 bg-brand-50/60 dark:border-brand-500/30 dark:bg-brand-500/10' : 'border-slate-200 dark:border-slate-700'
          }`}
        >
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {term.type ?? 'Termo'}
            {term.number ? ` ${term.number}` : ''}
          </p>
          <dl className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            <div>
              <dt className="inline">Assinatura: </dt>
              <dd className="inline font-semibold tabular-nums">{formatIsoDate(term.signedAt)}</dd>
            </div>
            {term.changesTerm && (
              <div>
                <dt className="inline">Nova vigência até: </dt>
                <dd className="inline font-semibold tabular-nums">{term.endDate ? formatIsoDate(term.endDate) : 'não informada'}</dd>
              </div>
            )}
            {term.addedValue !== null && (
              <div>
                <dt className="inline">Valor acrescido: </dt>
                <dd className="inline font-semibold">{formatMoneyValue(term.addedValue)}</dd>
              </div>
            )}
          </dl>
        </li>
      ))}
    </ol>
  );
}

interface ContractDetailContentProps {
  contract: ContractDetail;
  /** No painel lateral: mostra o atalho para a página do contrato. */
  inDrawer: boolean;
}

export function ContractDetailContent({ contract, inDrawer }: ContractDetailContentProps) {
  const todayIso = getLocalTodayIso();
  const city = [contract.cityName, contract.state].filter(Boolean).join('/');
  const sphere = contract.governmentSphere ? SPHERE_LABELS[contract.governmentSphere] : undefined;
  const supplierDocument = supplierDocumentLabel(contract);

  return (
    <article className="grid grid-cols-1 gap-6">
      <header className="grid grid-cols-1 gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <ContractBadges contract={contract} todayIso={todayIso} />
          <ExpiryBadge expiresOn={contract.expiresOn} todayIso={todayIso} />
        </div>
        <h2 className="text-base font-semibold leading-snug text-slate-900 dark:text-slate-100 sm:text-lg">{contract.contractObject}</h2>
        <div className="flex flex-wrap items-start gap-2">
          <ContractFavoriteButton contract={contract} variant="labeled" />
          <a href={contract.pncpLink} target="_blank" rel="noopener noreferrer" className={linkClass}>
            <ExternalLink size={14} aria-hidden="true" />
            Ver documento original
          </a>
          {contract.originNoticeId !== null ? (
            <Link to={`/editais/${contract.originNoticeId}`} className={linkClass}>
              <FileSearch size={14} aria-hidden="true" />
              Edital de origem
            </Link>
          ) : (
            contract.originPncpLink && (
              <a href={contract.originPncpLink} target="_blank" rel="noopener noreferrer" className={linkClass}>
                <ExternalLink size={14} aria-hidden="true" />
                Ver edital de origem
              </a>
            )
          )}
          {inDrawer && (
            <Link to={`/contratos/${contract.id}`} className={linkClass}>
              <Maximize2 size={14} aria-hidden="true" />
              Abrir em página própria
            </Link>
          )}
        </div>
      </header>

      <Section title="Vigência">
        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <InfoItem label="Início">{formatIsoDate(contract.termStart)}</InfoItem>
          <InfoItem label="Fim original">{contract.originalTermEnd ? formatIsoDate(contract.originalTermEnd) : 'Sem data de fim'}</InfoItem>
          <InfoItem label="Vencimento atual">
            <span className="font-semibold">{contract.expiresOn ? formatIsoDate(contract.expiresOn) : 'Sem data de fim'}</span>
          </InfoItem>
        </dl>
      </Section>

      <Section title="Aditivos e rescisões">
        <AmendmentsList amendments={contract.amendments} hasOriginalEnd={contract.originalTermEnd !== null} />
      </Section>

      <Section title="Contrato">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <InfoItem label="Órgão">
            {contract.agencyName ?? 'Não informado'}
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              CNPJ {formatCnpj(contract.agencyCnpj)}
              {sphere ? ` · ${sphere}` : ''}
            </span>
          </InfoItem>
          {contract.unitName && contract.unitName !== contract.agencyName && <InfoItem label="Unidade">{contract.unitName}</InfoItem>}
          <InfoItem label="Município/UF">{city || 'Não informado'}</InfoItem>
          <InfoItem label="Tipo">{contract.contractTypeName ?? 'Não informado'}</InfoItem>
          <InfoItem label="Categoria">{contract.categoryName ?? 'Não informada'}</InfoItem>
          <InfoItem label="Número do contrato">{contract.contractNumber ?? 'Não informado'}</InfoItem>
          <InfoItem label="Processo">{contract.processNumber ?? 'Não informado'}</InfoItem>
          <InfoItem label="Ano">{contract.contractYear}</InfoItem>
          <InfoItem label="Assinatura">{formatIsoDate(contract.signedAt)}</InfoItem>
          <InfoItem label="Número de controle">{contract.pncpControlNumber}</InfoItem>
          {contract.purchaseControlNumber && <InfoItem label="Compra de origem">{contract.purchaseControlNumber}</InfoItem>}
        </dl>
      </Section>

      <Section title="Fornecedor e valores">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <InfoItem label="Fornecedor">
            {contract.supplierName ?? 'Não informado'}
            {supplierDocument && <span className="block text-xs text-slate-500 dark:text-slate-400">{supplierDocument}</span>}
          </InfoItem>
          <InfoItem label="Valor inicial">{formatMoneyValue(contract.initialValue)}</InfoItem>
          <InfoItem label="Valor global">{formatMoneyValue(contract.globalValue)}</InfoItem>
          <div className="sm:col-span-2">
            <InfoItem label="Informação complementar">
              <span className="whitespace-pre-line">{contract.additionalInformation?.trim() || 'Não informada'}</span>
            </InfoItem>
          </div>
        </dl>
      </Section>
    </article>
  );
}

/** Contrato pela API, com carregando, não encontrado e erro. */
export function ContractDetailView({ contractId, inDrawer }: { contractId: number; inDrawer: boolean }) {
  const detail = useQuery<ContractDetail, TendersApiError>({
    queryKey: tendersQueryKeys.contract(contractId),
    queryFn: () => fetchContract(contractId),
  });

  if (detail.isPending) return <LoadingBlock label="Abrindo o contrato…" />;
  if (detail.isError) {
    if (detail.error.status === 404) {
      return (
        <EmptyState
          icon={FileSearch}
          title="Contrato não encontrado."
          description="Confira o link ou procure o contrato pelo número em Contratos a vencer."
          action={
            <Link to="/contratos" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
              Ir para Contratos a vencer
            </Link>
          }
        />
      );
    }
    return <LoadError title="Não foi possível abrir o contrato" message={detail.error.message} onRetry={() => void detail.refetch()} retrying={detail.isFetching} />;
  }
  return <ContractDetailContent contract={detail.data} inDrawer={inDrawer} />;
}
