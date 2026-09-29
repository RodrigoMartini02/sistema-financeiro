import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import type { Report, ReportExpense, ReportIncome } from '../../types/reports';
import { NomeComDetalhe } from '../../ui/NomeComDetalhe';
import { DASH, SECONDARY_CLASS, TD_CLASS, TH_CLASS, getPaymentMethodLabel } from '../finance/entryTable';
import { formatCurrency, formatDate } from '../finance/formatters';
import { firstName } from '../finance/memberColors';

export type ReportSortKey = 'description' | 'date' | 'amount';
export interface ReportSort {
  key: ReportSortKey;
  direction: 'asc' | 'desc';
}

type ReportRow =
  | { kind: 'expense'; key: string; description: string; date: string; amount: number; entry: ReportExpense }
  | { kind: 'income'; key: string; description: string; date: string; amount: number; entry: ReportIncome };

const INCOME_PENDING_LABEL: Record<Exclude<ReportIncome['status'], 'received'>, string> = {
  expected: 'Prevista',
  overdue: 'Em atraso',
};

/** Despesas e receitas numa lista só; "data" é o vencimento ou o recebimento. */
export function buildReportRows(report: Report, sort: ReportSort): ReportRow[] {
  const rows: ReportRow[] = [
    ...report.expenses.map((entry): ReportRow => ({
      kind: 'expense', key: `expense-${entry.id}`, description: entry.description, date: entry.dueDate, amount: entry.amount, entry,
    })),
    ...report.incomes.map((entry): ReportRow => ({
      kind: 'income', key: `income-${entry.id}`, description: entry.description, date: entry.receiptDate, amount: entry.amount, entry,
    })),
  ];
  const compare = (a: ReportRow, b: ReportRow) => {
    if (sort.key === 'amount') return a.amount - b.amount;
    if (sort.key === 'description') return a.description.localeCompare(b.description, 'pt-BR');
    return a.date.localeCompare(b.date);
  };
  return rows.sort((a, b) => (sort.direction === 'asc' ? compare(a, b) : -compare(a, b)));
}

function Category({ group, name }: { group: string | null; name: string | null }) {
  if (!name) return DASH;
  return <NomeComDetalhe principal={group ?? name} detalhe={group ? name : null} />;
}

/** Bolinha de situação: receita recebida verde, prevista azul; despesa paga cinza, em aberto vermelha. */
function statusDotClass(row: ReportRow): string {
  if (row.kind === 'income') {
    if (row.entry.status === 'received') return 'bg-green-500';
    return row.entry.status === 'overdue' ? 'bg-red-500' : 'bg-blue-400';
  }
  return row.entry.status === 'paid' ? 'bg-slate-300' : 'bg-red-500';
}

function User({ row }: { row: ReportRow }) {
  if (row.kind === 'income') return <>{firstName(row.entry.authorName ?? '')}</>;
  const { payerName, payerId, authorId, authorName } = row.entry;
  return (
    <>
      {firstName(payerName ?? '')}
      {payerId !== authorId && <span className={['block', SECONDARY_CLASS].join(' ')}>cadastrado por {firstName(authorName ?? '')}</span>}
    </>
  );
}

function Amount({ row }: { row: ReportRow }) {
  const income = row.kind === 'income';
  return (
    <span className={['text-xs tabular-nums', income ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'].join(' ')}>
      {income ? '+' : '−'}{formatCurrency(row.amount)}
    </span>
  );
}

function Description({ row }: { row: ReportRow }) {
  const paidExpense = row.kind === 'expense' && row.entry.status === 'paid';
  return (
    <span className="flex min-w-0 items-center justify-center gap-2">
      <span className={['h-1.5 w-1.5 shrink-0 rounded-full', statusDotClass(row)].join(' ')} aria-hidden="true" />
      <span className="min-w-0">
        <span className={['block truncate text-xs', paidExpense ? 'text-slate-400' : 'text-slate-600 dark:text-slate-300'].join(' ')} title={row.description}>
          {row.description}
        </span>
        {row.kind === 'income' && row.entry.status !== 'received' && (
          <span className={['block', SECONDARY_CLASS].join(' ')}>{INCOME_PENDING_LABEL[row.entry.status]}</span>
        )}
      </span>
    </span>
  );
}

function SortHeader({ label, sortKey, sort, onSort }: { label: string; sortKey: ReportSortKey; sort: ReportSort; onSort: (key: ReportSortKey) => void }) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ChevronUp : ChevronDown;
  return (
    <th className={TH_CLASS} aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 uppercase hover:text-slate-600 dark:hover:text-slate-300">
        {label} <Icon size={12} className={active ? '' : 'text-slate-300 dark:text-slate-600'} />
      </button>
    </th>
  );
}

const incomeRowClass = 'bg-emerald-50/60 hover:bg-emerald-100/60 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40';
const expenseRowClass = 'hover:bg-slate-50 dark:hover:bg-slate-800/50';

/** Tabela no visual de Movimentações (desktop) e cartões no celular. */
export function ReportEntries({ rows, sort, onSort }: { rows: ReportRow[]; sort: ReportSort; onSort: (key: ReportSortKey) => void }) {
  return (
    <>
      <div className="divide-y divide-slate-100 md:hidden dark:divide-slate-700/60">
        {rows.map((row) => (
          <div key={row.key} className={['flex items-start justify-between gap-3 px-4 py-3', row.kind === 'income' ? incomeRowClass : ''].join(' ')}>
            <div className="min-w-0 flex-1">
              <Description row={row} />
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <span>{formatDate(row.date)}</span>
                <span>·</span>
                <Category group={row.entry.categoryGroup} name={row.entry.categoryName} />
                {row.kind === 'expense' && (
                  <span>· <NomeComDetalhe principal={getPaymentMethodLabel(row.entry.paymentMethod)} detalhe={row.entry.cardName} /></span>
                )}
              </div>
            </div>
            <Amount row={row} />
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: '26%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '14%' }} />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
              <SortHeader label="Descrição" sortKey="description" sort={sort} onSort={onSort} />
              <th className={TH_CLASS}>Categoria</th>
              <th className={TH_CLASS}>Forma</th>
              <th className={TH_CLASS}>Usuário</th>
              <SortHeader label="Data" sortKey="date" sort={sort} onSort={onSort} />
              <SortHeader label="Valor" sortKey="amount" sort={sort} onSort={onSort} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {rows.map((row) => (
              <tr key={row.key} className={['transition-colors', row.kind === 'income' ? incomeRowClass : expenseRowClass].join(' ')}>
                <td className={TD_CLASS}><Description row={row} /></td>
                <td className={[TD_CLASS, 'text-xs text-slate-600 dark:text-slate-300'].join(' ')}>
                  <Category group={row.entry.categoryGroup} name={row.entry.categoryName} />
                </td>
                <td className={[TD_CLASS, 'whitespace-nowrap text-xs text-slate-600 dark:text-slate-300'].join(' ')}>
                  {row.kind === 'expense'
                    ? <NomeComDetalhe principal={getPaymentMethodLabel(row.entry.paymentMethod)} detalhe={row.entry.cardName} />
                    : DASH}
                </td>
                <td className={[TD_CLASS, 'whitespace-nowrap text-xs text-slate-500 dark:text-slate-400'].join(' ')}><User row={row} /></td>
                <td className={[TD_CLASS, 'whitespace-nowrap text-xs text-slate-500 dark:text-slate-400'].join(' ')}>{formatDate(row.date)}</td>
                <td className={[TD_CLASS, 'whitespace-nowrap'].join(' ')}><Amount row={row} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
