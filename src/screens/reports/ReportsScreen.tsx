import { useEffect, useMemo, useState } from 'react';
import { MotionConfig, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Loader2, Printer } from 'lucide-react';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { getActiveAccountId } from '../../services/apiClient';
import { queryKeys } from '../../services/queryKeys';
import { downloadReportPdf, fetchReport } from '../../services/reportsService';
import type {
  Report, ReportEntryType, ReportExpenseStatus, ReportPaymentDateWindow, ReportQuery,
} from '../../types/reports';
import { DateRangeField } from '../../ui/DateRangeField';
import { MultiFilterPanel } from '../../ui/MultiFilterPanel';
import { ErrorState } from '../../ui/states';
import { formatCurrency } from '../finance/formatters';
import type { EntryType, ExpenseStatus, PaymentDateWindow } from '../../utils/expenseFilters';
import { ENTRADA_PAINEL, Indicador } from '../finance/painel/base';
import { useEntryFilters } from '../finance/useEntryFilters';
import { ReportEntries, buildReportRows, type ReportSort, type ReportSortKey } from './ReportEntries';
import { PERIOD_PRESETS, presetPeriod, samePeriod, type ReportPeriod } from './reportPeriod';

const TYPE_TO_API: Record<EntryType, ReportEntryType> = { receita: 'income', despesa: 'expense' };
const STATUS_TO_API: Record<ExpenseStatus, ReportExpenseStatus> = { pago: 'paid', em_dia: 'on_time', atrasada: 'overdue' };
const PAYMENT_DATE_TO_API: Record<PaymentDateWindow, ReportPaymentDateWindow> = { hoje: 'today', semana: 'week', mes: 'month' };

const PILL = 'inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] font-medium transition';
const PILL_IDLE = 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700';
const PILL_ACTIVE = 'border-[#0EC4D8] bg-[#0EC4D8]/10 text-[#0a9db5] dark:text-[#0EC4D8]';
const NO_FILTER_OPTIONS: Report['filterOptions'] = { paymentMethods: [], cards: [] };

const sorted = <T,>(values: Iterable<T>, compare?: (a: T, b: T) => number) => [...values].sort(compare);
const byNumber = (a: number, b: number) => a - b;

function percentOfIncome(report: Report): string {
  const { income, expense } = report.totals;
  if (income > 0) return `${((expense / income) * 100).toFixed(1)}% das receitas em despesas`;
  return expense > 0 ? 'Sem receitas no período' : 'Sem movimentação';
}

export function ReportsScreen() {
  const [period, setPeriod] = useState<ReportPeriod>(() => presetPeriod('current_month'));
  // Período e pessoas só valem ao clicar em Consultar; os demais filtros valem na hora.
  const [appliedPeriod, setAppliedPeriod] = useState<ReportPeriod | null>(null);
  const [appliedMemberIds, setAppliedMemberIds] = useState<number[]>([]);
  const [sort, setSort] = useState<ReportSort>({ key: 'date', direction: 'desc' });
  const [filterOptions, setFilterOptions] = useState<Report['filterOptions']>(NO_FILTER_OPTIONS);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const consultGuide = useFirstAccessGuide('reports:consult-v1');
  const exportGuide = useFirstAccessGuide('reports:export-v1');

  const filters = useEntryFilters({
    paymentMethods: filterOptions.paymentMethods,
    cards: filterOptions.cards.map((card): [string, string] => [String(card.id), card.name]),
  });
  const { state } = filters;

  // Só quem está logado é o padrão: o backend já assume isso sem member_id.
  const selectedMemberIds = filters.meId !== null && state.memberIds.size === 1 && state.memberIds.has(filters.meId)
    ? []
    : sorted([...state.memberIds].map(Number), byNumber);
  const hasPendingChange = !samePeriod(period, appliedPeriod)
    || selectedMemberIds.join(',') !== appliedMemberIds.join(',');

  const query = useMemo<ReportQuery | null>(() => {
    if (!appliedPeriod) return null;
    const expenseFilters = state.types.has('despesa');
    return {
      startDate: appliedPeriod.start,
      endDate: appliedPeriod.end,
      types: state.types.size === 2 ? [] : sorted([...state.types].map((type) => TYPE_TO_API[type])),
      expenseStatuses: expenseFilters ? sorted([...state.statuses].map((status) => STATUS_TO_API[status])) : [],
      categoryIds: expenseFilters ? sorted([...state.categoryIds].map(Number), byNumber) : [],
      paymentMethods: expenseFilters ? sorted(state.paymentMethods) : [],
      cardIds: expenseFilters ? sorted([...state.cardIds].map(Number), byNumber) : [],
      paymentDates: expenseFilters ? sorted([...state.paymentDates].map((window) => PAYMENT_DATE_TO_API[window])) : [],
      memberIds: appliedMemberIds,
    };
  }, [appliedPeriod, appliedMemberIds, state.types, state.statuses, state.categoryIds, state.paymentMethods, state.cardIds, state.paymentDates]);

  const accountId = getActiveAccountId();
  const reportQ = useQuery({
    queryKey: queryKeys.reports(accountId, query!),
    queryFn: () => fetchReport(query!),
    // Sem nenhum tipo marcado não há o que buscar: a lista fica vazia.
    enabled: query !== null && state.types.size > 0,
    placeholderData: (previous) => previous,
  });
  const report = state.types.size > 0 ? reportQ.data : undefined;

  useEffect(() => {
    if (reportQ.data) setFilterOptions(reportQ.data.filterOptions);
  }, [reportQ.data]);

  const rows = useMemo(() => (report ? buildReportRows(report, sort) : []), [report, sort]);
  const expectedIncomes = report?.incomes.filter((income) => income.status !== 'received').length ?? 0;
  const balance = report ? report.totals.income - report.totals.expense : 0;

  const consult = () => {
    setAppliedPeriod(period);
    setAppliedMemberIds(selectedMemberIds);
  };

  const exportPdf = async () => {
    if (!query) return;
    setExportError('');
    setExporting(true);
    try {
      await downloadReportPdf(query);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Não foi possível gerar o relatório em PDF');
    } finally {
      setExporting(false);
    }
  };

  const sortBy = (key: ReportSortKey) => setSort((current) => (
    current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'desc' }
  ));

  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="m-0 mr-auto text-2xl font-semibold text-slate-950 dark:text-white">Relatórios</h1>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Atalhos de período">
          {PERIOD_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setPeriod(presetPeriod(preset.id))}
              aria-pressed={samePeriod(period, presetPeriod(preset.id))}
              className={[PILL, samePeriod(period, presetPeriod(preset.id)) ? PILL_ACTIVE : PILL_IDLE].join(' ')}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <DateRangeField value={period} onChange={setPeriod} className={[PILL, PILL_IDLE].join(' ')} />

        <div className="relative">
          <button
            type="button"
            onClick={consult}
            disabled={!hasPendingChange || !period.start || !period.end || period.start > period.end}
            className={[
              PILL,
              hasPendingChange
                ? 'border-[#0EC4D8] bg-[#0EC4D8] text-white hover:bg-[#0ab5c7]'
                : 'cursor-default border-slate-200 bg-slate-100 text-slate-400 dark:border-slate-700 dark:bg-slate-700 dark:text-slate-500',
            ].join(' ')}
          >
            Consultar
          </button>
          {consultGuide.isVisible && (
            <FirstAccessGuideCard
              icon={BarChart3}
              description={firstAccessGuideMessages.reportsConsult}
              align="right"
              floating
              placement="top"
              className="w-[min(24rem,calc(100vw-2rem))]"
              onDismiss={consultGuide.dismiss}
              onSilenceAll={consultGuide.silenceAll}
            />
          )}
        </div>

        <MultiFilterPanel groups={filters.groups} hasActiveFilters={filters.hasActiveFilters} onClear={filters.clear} />

        <div className="relative">
          <button
            type="button"
            onClick={exportPdf}
            disabled={!query || exporting}
            className={[PILL, PILL_IDLE, 'gap-2 disabled:cursor-not-allowed disabled:opacity-50'].join(' ')}
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
            {exporting ? 'Gerando PDF...' : 'Exportar PDF'}
          </button>
          {exportGuide.isVisible && (
            <FirstAccessGuideCard
              icon={Printer}
              description={firstAccessGuideMessages.reportsExport}
              align="right"
              floating
              placement="top"
              className="w-[min(24rem,calc(100vw-2rem))]"
              onDismiss={exportGuide.dismiss}
              onSilenceAll={exportGuide.silenceAll}
            />
          )}
          {exportError && (
            <p className="absolute right-0 top-full z-10 mt-1 w-max max-w-xs text-right text-xs font-medium text-red-600 dark:text-red-400">
              {exportError}
            </p>
          )}
        </div>
      </div>

      {reportQ.error && <ErrorState title="Não foi possível carregar o relatório" description={reportQ.error.message} />}

      {report && (
        <MotionConfig reducedMotion="user">
          <motion.section className="grid gap-4 sm:grid-cols-3" variants={ENTRADA_PAINEL} initial="oculto" animate="visivel" aria-label="Resumo do período">
            <Indicador
              rotulo="Receitas"
              valor={formatCurrency(report.totals.income)}
              nota={`${report.totals.incomeCount} lançamento(s)${expectedIncomes > 0 ? ` · ${expectedIncomes} prevista(s) fora do total` : ''}`}
            />
            <Indicador rotulo="Despesas" valor={formatCurrency(report.totals.expense)} nota={`${report.totals.expenseCount} lançamento(s)`} />
            <Indicador
              rotulo="Saldo do período"
              valor={formatCurrency(balance)}
              nota={percentOfIncome(report)}
              tom={balance < 0 ? 'text-rose-600 dark:text-rose-400' : undefined}
            />
          </motion.section>
        </MotionConfig>
      )}

      <section className="overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h3 className="m-0 border-b border-slate-100 px-[18px] py-3.5 text-sm font-medium text-slate-900 dark:border-slate-700 dark:text-white">
          Lançamentos <span className="text-slate-400">({rows.length})</span>
        </h3>
        {!appliedPeriod ? (
          <p className="py-8 text-center text-sm text-slate-400">Selecione um período e clique em Consultar</p>
        ) : reportQ.isLoading ? (
          <p className="py-8 text-center text-sm text-slate-400">Carregando...</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">Nenhum lançamento com estes filtros</p>
        ) : (
          <ReportEntries rows={rows} sort={sort} onSort={sortBy} />
        )}
      </section>
    </div>
  );
}
