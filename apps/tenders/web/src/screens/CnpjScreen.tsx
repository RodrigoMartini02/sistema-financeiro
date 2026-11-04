import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, SearchX } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { EmptyState } from '../../ui/EmptyState';
import { isValidCnpj, onlyDigits } from '../../utils/brazilDocuments';
import { CnpjContractList, CnpjNoticeList, CnpjWinnersList } from '../components/CnpjLists';
import { CnpjSection, PartnerRanking, StatTiles, WinnersByYear, type StatTile } from '../components/CnpjSections';
import { ContractsUpdating, LoadError, LoadingBlock } from '../components/LoadStates';
import { Pill } from '../components/Pill';
import { TabPanel, Tabs } from '../components/Tabs';
import { fetchCnpjSummary } from '../services/cnpjService';
import { tendersQueryKeys } from '../services/queryKeys';
import { isContractStoreUpdating, type TendersApiError } from '../services/tendersApiError';
import type { CnpjSummary } from '../types';
import {
  CNPJ_LIST_SIZE,
  CNPJ_TAB_LABELS,
  CNPJ_TAB_PARAM,
  CNPJ_TABS,
  cnpjContractsPath,
  cnpjCoverageNotes,
  cnpjNoticesPath,
  cnpjTabFor,
  type CnpjTab,
} from '../utils/cnpjPage';
import { formatCnpj } from '../utils/labels';
import { formatMoneyValue } from '../utils/money';

// A página do CNPJ (plano .plans/licitacoes-pagina-cnpj.md): o que um CNPJ é nos dados, como fornecedor (contratos e
// licitações vencidas) e como órgão (contratos e editais abertos). Abre pelas caixas de busca, pelos nomes de órgãos e
// fornecedores e pelo atalho dos filtros de CNPJ. Os dados são públicos; a nota de cobertura diz até onde eles vão.

/** Os dados da página não são da conta: ficam em cache por alguns minutos, e a tela tenta de novo se os contratos estão atualizando. */
const SUMMARY_STALE_MS = 5 * 60_000;
const UPDATING_RETRY_MS = 15_000;

const count = (value: number) => value.toLocaleString('pt-BR');

function plural(value: number, one: string, many: string): string {
  return `${count(value)} ${value === 1 ? one : many}`;
}

function SupplierTab({ cnpj, data }: { cnpj: string; data: CnpjSummary['supplier'] }) {
  if (!data) {
    return <EmptyState icon={SearchX} title="Sem registros como fornecedor." description="Este CNPJ não tem contratos nem licitações vencidas na base." />;
  }
  const { contracts, winners, topAgencies } = data;
  const tiles: StatTile[] = [
    { label: 'Contratos', value: count(contracts.total), hint: plural(contracts.active, 'vigente', 'vigentes') },
    { label: 'Valor dos contratos', value: formatMoneyValue(contracts.totalValue), hint: 'Soma do valor global' },
    { label: 'Licitações vencidas', value: count(winners.purchases), hint: plural(winners.items, 'item', 'itens') },
    { label: 'Valor das licitações', value: formatMoneyValue(winners.totalValue), hint: 'Valor homologado dos itens vencidos' },
  ];
  return (
    <div className="grid grid-cols-1 gap-6">
      <StatTiles tiles={tiles} />
      {winners.byYear.length > 0 && (
        <CnpjSection title="Licitações vencidas por ano">
          <WinnersByYear years={winners.byYear} />
        </CnpjSection>
      )}
      {topAgencies.length > 0 && (
        <CnpjSection title="Órgãos que mais contrataram" hint="Pelo valor dos contratos.">
          <PartnerRanking partners={topAgencies} label="Órgãos que mais contrataram" />
        </CnpjSection>
      )}
      {contracts.total > 0 && (
        <CnpjSection
          title="Contratos mais recentes"
          seeAll={contracts.total > CNPJ_LIST_SIZE ? { to: cnpjContractsPath('fornecedor', cnpj), label: `Ver todos os ${count(contracts.total)} contratos` } : undefined}
        >
          <CnpjContractList tab="fornecedor" cnpj={cnpj} />
        </CnpjSection>
      )}
      {winners.purchases > 0 && (
        <CnpjSection title="Licitações vencidas" hint="Da mais recente para a mais antiga.">
          <CnpjWinnersList cnpj={cnpj} />
        </CnpjSection>
      )}
    </div>
  );
}

function AgencyTab({ cnpj, data }: { cnpj: string; data: CnpjSummary['agency'] }) {
  if (!data) {
    return <EmptyState icon={SearchX} title="Sem registros como órgão." description="Este CNPJ não tem contratos nem editais abertos na base." />;
  }
  const { contracts, openNotices, topSuppliers } = data;
  const tiles: StatTile[] = [
    { label: 'Contratos', value: count(contracts.total), hint: plural(contracts.active, 'vigente', 'vigentes') },
    { label: 'Valor dos contratos', value: formatMoneyValue(contracts.totalValue), hint: 'Soma do valor global' },
    { label: 'Editais abertos', value: count(openNotices), hint: 'Recebendo propostas agora' },
  ];
  return (
    <div className="grid grid-cols-1 gap-6">
      <StatTiles tiles={tiles} />
      {topSuppliers.length > 0 && (
        <CnpjSection title="Fornecedores mais contratados" hint="Pelo valor dos contratos.">
          <PartnerRanking partners={topSuppliers} label="Fornecedores mais contratados" />
        </CnpjSection>
      )}
      {contracts.total > 0 && (
        <CnpjSection
          title="Contratos mais recentes"
          seeAll={contracts.total > CNPJ_LIST_SIZE ? { to: cnpjContractsPath('orgao', cnpj), label: `Ver todos os ${count(contracts.total)} contratos` } : undefined}
        >
          <CnpjContractList tab="orgao" cnpj={cnpj} />
        </CnpjSection>
      )}
      {openNotices > 0 && (
        <CnpjSection
          title="Editais abertos"
          hint="Os mais recentes."
          seeAll={openNotices > CNPJ_LIST_SIZE ? { to: cnpjNoticesPath(cnpj), label: `Ver todos os ${count(openNotices)} editais` } : undefined}
        >
          <CnpjNoticeList cnpj={cnpj} />
        </CnpjSection>
      )}
    </div>
  );
}

function CnpjContent({ cnpj, summary }: { cnpj: string; summary: CnpjSummary }) {
  const [params, setParams] = useSearchParams();
  const tab = cnpjTabFor(params.get(CNPJ_TAB_PARAM), summary);
  const changeTab = (next: CnpjTab) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set(CNPJ_TAB_PARAM, next);
    setParams(nextParams, { replace: true });
  };
  const notes = cnpjCoverageNotes(summary.coverage);
  const hasData = summary.supplier !== null || summary.agency !== null;

  return (
    <div className="grid grid-cols-1 gap-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {summary.supplier && <Pill tone="brand">Fornecedor</Pill>}
          {summary.agency && <Pill tone="success">Órgão contratante</Pill>}
          {!hasData && <Pill tone="muted">Sem registros</Pill>}
        </div>
        <h2 className="mt-2 flex items-start gap-2 text-lg font-bold leading-snug text-slate-900 dark:text-white">
          <Building2 size={20} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <span className="min-w-0 break-words">{summary.name ?? formatCnpj(cnpj)}</span>
        </h2>
        {summary.name && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">CNPJ {formatCnpj(cnpj)}</p>}
        <ul className="mt-3 grid grid-cols-1 gap-0.5 text-xs text-slate-500 dark:text-slate-400">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </header>

      <div>
        <Tabs tabs={CNPJ_TABS.map((id) => ({ id, label: CNPJ_TAB_LABELS[id] }))} active={tab} onChange={changeTab} label="Papel do CNPJ" idPrefix="cnpj" />
        <TabPanel idPrefix="cnpj" tabId={tab}>
          {tab === 'fornecedor' ? <SupplierTab cnpj={cnpj} data={summary.supplier} /> : <AgencyTab cnpj={cnpj} data={summary.agency} />}
        </TabPanel>
      </div>
    </div>
  );
}

/** Página de um CNPJ (/cnpj/:cnpj). */
export function CnpjScreen() {
  const { cnpj: param } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const digits = onlyDigits(param ?? '');
  const cnpj = isValidCnpj(digits) ? digits : null;
  // Chegou por link direto (primeira página aberta no app): voltar leva para Editais.
  const canGoBack = location.key !== 'default';

  const summary = useQuery<CnpjSummary, TendersApiError>({
    queryKey: tendersQueryKeys.cnpj(cnpj ?? ''),
    queryFn: () => fetchCnpjSummary(cnpj ?? ''),
    enabled: cnpj !== null,
    staleTime: SUMMARY_STALE_MS,
    refetchInterval: (query) => (isContractStoreUpdating(query.state.error) ? UPDATING_RETRY_MS : false),
  });

  let content;
  if (cnpj === null) {
    content = (
      <EmptyState
        icon={SearchX}
        title="CNPJ inválido."
        description="Confira os 14 dígitos do CNPJ."
        action={
          <Link to="/buscar" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
            Ir para Editais
          </Link>
        }
      />
    );
  } else if (isContractStoreUpdating(summary.error)) {
    content = <ContractsUpdating message={summary.error?.message} onRetry={() => void summary.refetch()} retrying={summary.isFetching} />;
  } else if (summary.isPending) {
    content = <LoadingBlock label="Carregando o CNPJ…" />;
  } else if (summary.isError) {
    content = <LoadError title="Não foi possível carregar o CNPJ" message={summary.error.message} onRetry={() => void summary.refetch()} retrying={summary.isFetching} />;
  } else {
    content = <CnpjContent key={cnpj} cnpj={cnpj} summary={summary.data} />;
  }

  return (
    <section>
      <button
        type="button"
        onClick={() => (canGoBack ? navigate(-1) : navigate('/buscar'))}
        className="mb-3 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-slate-600 hover:text-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 dark:text-slate-300 dark:hover:text-brand-300"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Voltar
      </button>
      {content}
    </section>
  );
}
