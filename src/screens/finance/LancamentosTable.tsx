import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Paperclip, Ban, CircleCheck, ArrowRight, ChevronDown, CheckSquare, Pencil, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFinanceDashboard } from '../../hooks/useFinanceDashboard';
import { pagarDespesa, moverDespesa, cancelarDespesa, receberReceita } from '../../services/financeService';
import { apiRequest } from '../../services/apiClient';
import { queryKeys, invalidateExpenseQueries, invalidateFinanceQueries, invalidateIncomeQueries } from '../../services/queryKeys';
import type { Expense, Income, Attachment } from '../../types/finance';
import { Card } from '../../ui/card';
import { EmptyState } from '../../ui/EmptyState';
import { NomeComDetalhe } from '../../ui/NomeComDetalhe';
import { DASH, EntryTypeBadge, SECONDARY_CLASS, TD_CLASS, TH_CLASS, getPaymentMethodLabel } from './entryTable';
import { ExpenseDialog } from './expense-dialog/ExpenseDialog';
import { IncomeDialog } from './income-dialog/IncomeDialog';
import { AttachmentPreviewDialog } from '../../ui/AttachmentPreviewDialog';
import { PaymentModal } from './PaymentModal';
import { BatchPaymentModal } from './BatchPaymentModal';
import { formatCurrency, formatDate } from './formatters';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { useConfirm } from '../../context/ConfirmContext';
import { getLocalTodayIso } from '../../utils/date';
import { filterExpenses, getExpenseStatus, type EntryType, type ExpenseStatus, type PaymentDateWindow } from '../../utils/expenseFilters';
import { effectiveExpenseValue, paymentDifference } from '../../utils/expenseValue';
import { formatDiferenca } from '../despesas/expenseStatus';
import { ExpenseCard } from '../despesas/ExpenseCard';
import { IncomeCard, categoriaReceita } from '../receitas/IncomeCard';
import { DeleteInstallmentDialog } from '../despesas/DeleteInstallmentDialog';

export type Ordenar = 'cadastro_desc' | 'data_asc' | 'data_desc' | 'valor_asc' | 'valor_desc' | 'descricao';

type LancamentoItem =
  | { kind: 'despesa'; id: number; chave: string; data: Expense }
  | { kind: 'receita'; id: number; chave: string; data: Income };

const STATUS_TEXT_COLOR: Record<'pago' | 'atrasada' | 'em_dia' | 'cancelada', string> = {
  pago: 'text-green-600 dark:text-green-400',
  atrasada: 'text-red-600 dark:text-red-400',
  em_dia: 'text-slate-600 dark:text-slate-300',
  cancelada: 'text-slate-400 dark:text-slate-500',
};

const STATUS_LABEL: Record<'pago' | 'atrasada' | 'em_dia' | 'cancelada', string> = {
  pago: 'Pago', atrasada: 'Atrasada', em_dia: 'Em dia', cancelada: 'Cancelada',
};

export function getFirstName(nome?: string | null): string {
  const first = (nome ?? '').trim().split(/\s+/)[0];
  return first || '—';
}

function getExpenseStatusKey(item: Expense): 'pago' | 'atrasada' | 'em_dia' | 'cancelada' {
  return item.status === 'cancelada' ? 'cancelada' : getExpenseStatus(item);
}

function getExpenseStatusColor(item: Expense): string {
  return STATUS_TEXT_COLOR[getExpenseStatusKey(item)];
}

function ExpenseStatusBadge({ item }: { item: Expense }) {
  const key = getExpenseStatusKey(item);
  return <span className={['text-xs', STATUS_TEXT_COLOR[key]].join(' ')}>{STATUS_LABEL[key]}</span>;
}

interface FilterOption { value: string; label: string }

export function OrdenarChip({ options, value, onChange }: { options: FilterOption[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = value !== (options[0]?.value ?? '');
  const currentLabel = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? '';

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={[
          'inline-flex items-center gap-1.5 rounded-full pl-3 pr-2.5 py-1.5 text-xs font-medium transition select-none whitespace-nowrap',
          isActive
            ? 'bg-[#0EC4D8]/15 text-[#0a9db5] dark:bg-[#0EC4D8]/20 dark:text-[#0EC4D8]'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600',
        ].join(' ')}
      >
        {currentLabel}
        <ChevronDown size={11} className={['transition-transform duration-150', open ? 'rotate-180' : ''].join(' ')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 min-w-[148px] rounded-xl border border-slate-100 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={[
                'flex w-full items-center px-3 py-2 text-left text-xs transition whitespace-nowrap',
                opt.value === value
                  ? 'bg-[#0EC4D8]/10 font-semibold text-[#0a9db5] dark:text-[#0EC4D8]'
                  : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700',
              ].join(' ')}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  onClick, disabled = false, title, colorClass, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  colorClass: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      className={['rounded-lg p-1.5 transition', disabled ? 'opacity-40 cursor-not-allowed' : colorClass].join(' ')}
    >
      {children}
    </button>
  );
}

export interface LancamentosTableProps {
  month: number;
  year: number;
  isEmpresa: boolean;
  escopoFamilia: boolean;
  meIdStr: string | null;
  nomesVisiveis: Set<string>;
  filtroTipo: Set<EntryType>;
  filtroStatus: Set<ExpenseStatus>;
  filtroCategoria: Set<string>;
  filtroFormaPag: Set<string>;
  filtroCartao: Set<string>;
  filtroDataPag: Set<PaymentDateWindow>;
  ordenar: Ordenar;
  hasFilter: boolean;
  /**
   * Opções de forma de pagamento e cartão do mês, para o painel de filtros da tela.
   * Precisa ser estável (ex.: setter do useState): o efeito que a chama depende dela.
   */
  onDataLoaded?: (options: { formas: string[]; cartoes: [string, string][] }) => void;
}

/**
 * Tabela combinada de Receitas + Despesas. Reaproveita as colunas de Despesas
 * como base (superset) — linhas de receita preenchem só o que se aplica e
 * mostram traço no resto, decisão confirmada apesar do risco de esparsidade.
 * Todo o estado de filtro vem do pai (MovimentacoesScreen), que também monta
 * o painel de filtro único da barra de ferramentas.
 */
/** O que cancelar ou excluir a receita desfaz junto, para o aviso da confirmação. */
function incomeUndoNotes(item: Income): string[] {
  return [
    ...(item.produtoId ? ['A quantidade vendida volta para o estoque.'] : []),
    ...(item.representanteId ? ['A comissão desta receita também é cancelada, se ainda não foi paga.'] : []),
  ];
}

export function LancamentosTable({
  month, year, isEmpresa, escopoFamilia, meIdStr, nomesVisiveis,
  filtroTipo, filtroStatus, filtroCategoria, filtroFormaPag, filtroCartao, filtroDataPag, ordenar, hasFilter,
  onDataLoaded,
}: LancamentosTableProps) {
  const [expenseDialog, setExpenseDialog] = useState<{ open: boolean; item?: Expense }>({ open: false });
  const [incomeDialog, setIncomeDialog] = useState<{ open: boolean; item?: Income }>({ open: false });
  const [anexosDialog, setAnexosDialog] = useState<{ open: boolean; title: string; anexos: Attachment[] }>({
    open: false, title: '', anexos: [],
  });
  const [paymentModal, setPaymentModal] = useState<{ open: boolean; item?: Expense }>({ open: false });
  const [installmentDialog, setInstallmentDialog] = useState<{ open: boolean; item?: Expense; mode: 'excluir' | 'cancelar' }>({ open: false, mode: 'excluir' });
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [batchModal, setBatchModal] = useState(false);

  const qc = useQueryClient();
  const confirm = useConfirm();

  const finance = useFinanceDashboard(month, year, true, escopoFamilia ? 'familia' : undefined);
  const allExpenses = finance.dashboard.data?.expenses ?? [];
  const allIncomes = finance.dashboard.data?.incomes ?? [];

  const pagarMut = useMutation({
    mutationFn: ({ id, dataPagamento, valorPago }: { id: number; dataPagamento: string; valorPago: number }) =>
      pagarDespesa(id, dataPagamento, valorPago),
    onSuccess: () => {
      invalidateFinanceQueries(qc, month, year);
      setPaymentModal({ open: false });
    },
  });

  const moverMut = useMutation({
    mutationFn: (id: number) => moverDespesa(id),
    onSuccess: () => invalidateFinanceQueries(qc, month, year),
  });

  const cancelarMut = useMutation({
    mutationFn: ({ id, ids }: { id: number; ids?: number[] }) => cancelarDespesa(id, { ids }),
    onSuccess: () => {
      invalidateFinanceQueries(qc, month, year);
      setInstallmentDialog({ open: false, mode: 'excluir' });
    },
  });

  // Cancelar devolve o estoque vendido e cancela a comissão não paga: além do
  // painel, mudam os produtos e as despesas.
  const cancelarReceitaMut = useMutation({
    mutationFn: (id: number) => apiRequest<void>(`/incomes/${id}/cancelar`, { method: 'PUT' }),
    onSuccess: () => {
      invalidateFinanceQueries(qc, month, year);
      invalidateIncomeQueries(qc);
      invalidateExpenseQueries(qc);
    },
  });

  const receberReceitaMut = useMutation({
    mutationFn: receberReceita,
    onSuccess: () => invalidateFinanceQueries(qc, month, year),
  });

  const handleMoverProximoMes = async (item: Expense) => {
    const ok = await confirm({
      title: 'Mover despesa',
      message: `Mover "${item.descricao}" para o próximo mês?`,
      confirmLabel: 'Mover',
      variant: 'default',
    });
    if (ok) moverMut.mutate(item.id);
  };

  const handleCancelarDespesa = async (item: Expense) => {
    if (item.status === 'cancelada') return;
    if (item.parcela) {
      setInstallmentDialog({ open: true, item, mode: 'cancelar' });
      return;
    }
    const ok = await confirm({
      title: 'Cancelar despesa',
      message: `Cancelar "${item.descricao}"?`,
      confirmLabel: 'Cancelar despesa',
    });
    if (ok) cancelarMut.mutate({ id: item.id });
  };

  const handleExcluirDespesa = async (item: Expense) => {
    if (item.parcela) {
      setInstallmentDialog({ open: true, item, mode: 'excluir' });
      return;
    }
    const ok = await confirm({
      title: 'Excluir despesa',
      message: `Excluir "${item.descricao}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir despesa',
    });
    if (ok) finance.deleteExpense.mutate({ id: item.id });
  };

  const handleConfirmarRecebimento = async (item: Income) => {
    const ok = await confirm({
      title: 'Confirmar recebimento',
      message: `Confirmar recebimento de "${item.descricao}"?`,
      confirmLabel: 'Confirmar',
      variant: 'default',
    });
    if (ok) receberReceitaMut.mutate(item.id);
  };

  const handleCancelarReceita = async (item: Income) => {
    if (item.status === 'cancelada') return;
    const ok = await confirm({
      title: 'Cancelar receita',
      message: [`Cancelar "${item.descricao}"?`, ...incomeUndoNotes(item)].join(' '),
      confirmLabel: 'Cancelar receita',
    });
    if (ok) cancelarReceitaMut.mutate(item.id);
  };

  const handleExcluirReceita = async (item: Income) => {
    // A receita já cancelada devolveu o estoque e cancelou a comissão no cancelamento.
    const notes = item.status === 'cancelada' ? [] : incomeUndoNotes(item);
    const ok = await confirm({
      title: 'Excluir receita',
      message: [`Excluir "${item.descricao}"? Esta ação não pode ser desfeita.`, ...notes].join(' '),
      confirmLabel: 'Excluir receita',
    });
    if (ok) finance.deleteIncome.mutate(item.id);
  };

  const hoje = getLocalTodayIso();

  const passaFiltroMembro = (autorNome?: string | null): boolean => {
    if (meIdStr == null) return true; // ainda carregando — nao bloqueia exibicao
    return !!autorNome && nomesVisiveis.has(autorNome);
  };

  const expensesFiltered = filterExpenses(
    allExpenses,
    {
      types: filtroTipo, statuses: filtroStatus, categoryIds: filtroCategoria,
      paymentMethods: filtroFormaPag, cardIds: filtroCartao, paymentDates: filtroDataPag,
    },
    { meId: meIdStr, visibleNames: nomesVisiveis },
    month,
    year,
  );

  const incomesFiltered = filtroTipo.has('receita')
    ? allIncomes.filter((i) => passaFiltroMembro(i.autorNome))
    : [];

  // Combina as duas listas com um discriminador `kind`, mesmo padrao ja usado
  // em CalendarView.tsx para misturar tipos de lancamento diferentes.
  const combined: LancamentoItem[] = [
    ...expensesFiltered.map((data): LancamentoItem => ({ kind: 'despesa', id: data.id, chave: `despesa-${data.id}`, data })),
    ...incomesFiltered.map((data): LancamentoItem => ({ kind: 'receita', id: data.id, chave: `receita-${data.id}`, data })),
  ];

  // Ordenacao adaptada para lista mista: "data" usa vencimento em despesa e
  // data de recebimento em receita como equivalentes; valor usa o valor
  // exibido de cada tipo.
  const dataDoItem = (item: LancamentoItem): string => item.kind === 'despesa' ? item.data.dataVencimento : item.data.data;
  const valorDoItem = (item: LancamentoItem): number => item.kind === 'despesa' ? effectiveExpenseValue(item.data) : item.data.valor;

  const filtered = [...combined].sort((a, b) => {
    switch (ordenar) {
      case 'cadastro_desc': {
        if (a.kind === 'despesa' && b.kind === 'despesa') {
          return a.data.dataCriacao && b.data.dataCriacao
            ? b.data.dataCriacao.localeCompare(a.data.dataCriacao)
            : b.data.id - a.data.id;
        }
        return dataDoItem(b).localeCompare(dataDoItem(a));
      }
      case 'data_desc': return dataDoItem(b).localeCompare(dataDoItem(a));
      case 'valor_asc': return valorDoItem(a) - valorDoItem(b);
      case 'valor_desc': return valorDoItem(b) - valorDoItem(a);
      case 'descricao': return a.data.descricao.localeCompare(b.data.descricao);
      default: return dataDoItem(a).localeCompare(dataDoItem(b));
    }
  });

  // Depende do resultado da consulta (referência estável no React Query, e
  // `undefined` enquanto carrega), nunca de uma lista recriada a cada render.
  const dashboardData = finance.dashboard.data;
  useEffect(() => {
    if (!onDataLoaded) return;
    const expenses = dashboardData?.expenses ?? [];
    const formas = [...new Set(expenses.map((i) => i.formaPagamento))].sort();
    const cartoes = [...new Map(
      expenses.filter((i) => i.cartaoId != null).map((i) => [String(i.cartaoId), i.cartaoNome ?? `Cartão #${i.cartaoId}`])
    ).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    onDataLoaded({ formas, cartoes });
  }, [dashboardData, onDataLoaded]);

  useEffect(() => { setSelecionadas(new Set()); }, [month, year]);

  const unpaidExpensesFiltered = expensesFiltered.filter((i) => !i.pago);
  const unpaidChaves = new Set(unpaidExpensesFiltered.map((i) => `despesa-${i.id}`));
  const allSelected = unpaidChaves.size > 0 && [...unpaidChaves].every((c) => selecionadas.has(c));
  const hasMovableItem = expensesFiltered.some((item) => !item.pago && item.status !== 'cancelada');

  const filterGuide = useFirstAccessGuide('despesas:filtros-v1', {
    enabled: !finance.dashboard.isLoading && combined.length > 0,
  });
  const loteGuide = useFirstAccessGuide('despesas:lote-v1', {
    enabled: selecionadas.size === 0 && unpaidExpensesFiltered.length > 0,
  });
  const pagarSelecionadasGuide = useFirstAccessGuide('despesas:pagar-selecionadas-v1', {
    enabled: selecionadas.size > 0,
  });
  const moverMesGuide = useFirstAccessGuide('despesas:mover-mes-v1', {
    enabled: hasMovableItem,
  });

  function toggleSelectAll() {
    if (allSelected) {
      setSelecionadas(new Set());
    } else {
      setSelecionadas(new Set(unpaidChaves));
    }
  }

  function toggleItem(chave: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave); else next.add(chave);
      return next;
    });
  }

  const selecionadasExpenses = expensesFiltered.filter((i) => selecionadas.has(`despesa-${i.id}`) && !i.pago);

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {finance.dashboard.error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {finance.dashboard.error.message}
          </div>
        )}

        <Card allowOverflow className="flex min-h-0 flex-1 flex-col">
          {selecionadas.size > 0 && (
            <div className="relative flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-100 dark:border-slate-700 px-4 py-2.5">
              <CheckSquare size={14} className="text-[#0a9db5]" />
              <span className="text-xs font-semibold text-[#0a9db5]">
                {selecionadas.size} selecionada{selecionadas.size !== 1 ? 's' : ''}
              </span>
              <button
                type="button"
                onClick={() => setBatchModal(true)}
                className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700 transition"
              >
                Pagar selecionadas
              </button>
              <button
                type="button"
                onClick={() => setSelecionadas(new Set())}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
              >
                Desmarcar
              </button>
              {pagarSelecionadasGuide.isVisible && (
                <FirstAccessGuideCard
                  floating
                  placement="bottom"
                  className="w-[min(24rem,calc(100vw-2rem))]"
                  icon={CheckSquare}
                  description={firstAccessGuideMessages.despesasPagarSelecionadas}
                  onDismiss={pagarSelecionadasGuide.dismiss}
                  onSilenceAll={pagarSelecionadasGuide.silenceAll}
                />
              )}
            </div>
          )}

          {filterGuide.isVisible && !finance.dashboard.isLoading && combined.length > 0 && (
            <div className="relative px-4 pt-2">
              <FirstAccessGuideCard
                icon={CheckSquare}
                description={firstAccessGuideMessages.despesasFiltros}
                align="right"
                floating
                placement="top"
                className="w-[min(24rem,calc(100vw-2rem))]"
                onDismiss={filterGuide.dismiss}
                onSilenceAll={filterGuide.silenceAll}
              />
            </div>
          )}

          {finance.dashboard.isLoading ? (
            <EmptyState title="Carregando" description="Buscando lançamentos do mês." />
          ) : filtered.length === 0 ? (
            hasFilter ? (
              <EmptyState title="Nenhum resultado" description="Tente ajustar os filtros." />
            ) : (
              <div className="grid justify-items-center gap-3 py-8">
                <EmptyState
                  title="Nenhum lançamento"
                  description="Cadastre sua primeira receita ou despesa para acompanhar o mês."
                />
              </div>
            )
          ) : (
            <div className="relative flex min-h-0 flex-1 flex-col">
              {loteGuide.isVisible && selecionadas.size === 0 && unpaidExpensesFiltered.length > 0 && (
                <FirstAccessGuideCard
                  floating
                  placement="bottom"
                  className="w-[min(24rem,calc(100vw-2rem))]"
                  icon={CheckSquare}
                  description={firstAccessGuideMessages.despesasLote}
                  onDismiss={loteGuide.dismiss}
                  onSilenceAll={loteGuide.silenceAll}
                />
              )}
              {moverMesGuide.isVisible && (
                <FirstAccessGuideCard
                  floating
                  placement="top"
                  align="right"
                  className="w-[min(22rem,calc(100vw-2rem))]"
                  icon={ArrowRight}
                  description={firstAccessGuideMessages.despesasMoverMes}
                  onDismiss={moverMesGuide.dismiss}
                  onSilenceAll={moverMesGuide.silenceAll}
                />
              )}

              {/* Cards — mobile only */}
              <div className="divide-y divide-slate-100 dark:divide-slate-700 md:hidden">
                {filtered.map((item) => item.kind === 'despesa' ? (
                  <ExpenseCard
                    key={item.chave}
                    item={item.data}
                    isEmpresa={isEmpresa}
                    onPay={() => setPaymentModal({ open: true, item: item.data })}
                    onMoveToNextMonth={() => handleMoverProximoMes(item.data)}
                    onCancel={() => handleCancelarDespesa(item.data)}
                    onOpenAttachments={() => setAnexosDialog({ open: true, title: item.data.descricao, anexos: item.data.anexos! })}
                    onEdit={() => setExpenseDialog({ open: true, item: item.data })}
                    onDelete={() => handleExcluirDespesa(item.data)}
                  />
                ) : (
                  <IncomeCard
                    key={item.chave}
                    item={item.data}
                    hoje={hoje}
                    isEmpresa={isEmpresa}
                    onConfirmRecebimento={() => handleConfirmarRecebimento(item.data)}
                    onCancel={() => handleCancelarReceita(item.data)}
                    onOpenAttachments={() => setAnexosDialog({ open: true, title: item.data.descricao, anexos: item.data.anexos! })}
                    onEdit={() => setIncomeDialog({ open: true, item: item.data })}
                    onDelete={() => handleExcluirReceita(item.data)}
                  />
                ))}
              </div>

              {/* Table — desktop only */}
              <div className="hidden min-h-0 flex-1 overflow-auto md:block">
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col style={{ width: '28px' }} />
                    <col style={{ width: '150px' }} />
                    <col style={{ width: '116px' }} />
                    <col style={{ width: '104px' }} />
                    <col style={{ width: '80px' }} />
                    <col style={{ width: '58px' }} />
                    <col style={{ width: '86px' }} />
                    <col style={{ width: '86px' }} />
                    <col style={{ width: '92px' }} />
                    <col style={{ width: '74px' }} />
                    <col style={{ width: '104px' }} />
                    {isEmpresa && <col style={{ width: '64px' }} />}
                    <col style={{ width: '38px' }} />
                    <col style={{ width: '104px' }} />
                  </colgroup>
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-center">
                      <th className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleSelectAll}
                          disabled={unpaidChaves.size === 0}
                          title="Selecionar todas as despesas não pagas"
                          className="rounded accent-[#0EC4D8] cursor-pointer disabled:opacity-40"
                        />
                      </th>
                      <th className={TH_CLASS}>Descrição</th>
                      <th className={TH_CLASS}>Categoria</th>
                      <th className={TH_CLASS}>Pagamento</th>
                      <th className={TH_CLASS}>Usuário</th>
                      <th className={TH_CLASS}>Tipo</th>
                      <th className={TH_CLASS}>Data compra</th>
                      <th className={TH_CLASS}>Vencimento</th>
                      <th className={TH_CLASS}>Data pagamento</th>
                      <th className={TH_CLASS}>Status</th>
                      <th className={TH_CLASS}>Valor</th>
                      {isEmpresa && <th className={TH_CLASS}>NF</th>}
                      <th className={TH_CLASS}>Anexos</th>
                      <th className={TH_CLASS}>Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {filtered.map((item) => item.kind === 'despesa' ? (
                      <ExpenseRow
                        key={item.chave}
                        item={item.data}
                        chave={item.chave}
                        isEmpresa={isEmpresa}
                        selecionada={selecionadas.has(item.chave)}
                        onToggleSelecionada={() => toggleItem(item.chave)}
                        onEdit={() => setExpenseDialog({ open: true, item: item.data })}
                        onPay={() => setPaymentModal({ open: true, item: item.data })}
                        onMoveToNextMonth={() => handleMoverProximoMes(item.data)}
                        onCancel={() => handleCancelarDespesa(item.data)}
                        onDelete={() => handleExcluirDespesa(item.data)}
                        onOpenAttachments={() => setAnexosDialog({ open: true, title: item.data.descricao, anexos: item.data.anexos! })}
                        isCancelarPending={cancelarMut.isPending}
                      />
                    ) : (
                      <IncomeRow
                        key={item.chave}
                        item={item.data}
                        hoje={hoje}
                        isEmpresa={isEmpresa}
                        onEdit={() => setIncomeDialog({ open: true, item: item.data })}
                        onConfirmRecebimento={() => handleConfirmarRecebimento(item.data)}
                        onCancel={() => handleCancelarReceita(item.data)}
                        onDelete={() => handleExcluirReceita(item.data)}
                        onOpenAttachments={() => setAnexosDialog({ open: true, title: item.data.descricao, anexos: item.data.anexos! })}
                        isReceberPending={receberReceitaMut.isPending}
                        isCancelarPending={cancelarReceitaMut.isPending}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      </div>

      <ExpenseDialog
        open={expenseDialog.open}
        expense={expenseDialog.item}
        onClose={() => setExpenseDialog({ open: false })}
      />
      <IncomeDialog
        open={incomeDialog.open}
        income={incomeDialog.item}
        onClose={() => setIncomeDialog({ open: false })}
      />
      <AttachmentPreviewDialog
        open={anexosDialog.open}
        title={anexosDialog.title}
        anexos={anexosDialog.anexos}
        onClose={() => setAnexosDialog({ open: false, title: '', anexos: [] })}
      />
      <PaymentModal
        open={paymentModal.open}
        expense={paymentModal.item ?? null}
        onClose={() => setPaymentModal({ open: false })}
        onConfirm={(dataPagamento, valorPago) => {
          if (!paymentModal.item) return;
          pagarMut.mutate({ id: paymentModal.item.id, dataPagamento, valorPago });
        }}
      />
      <BatchPaymentModal
        open={batchModal}
        expenses={selecionadasExpenses}
        onClose={() => setBatchModal(false)}
        onSuccess={() => {
          setSelecionadas(new Set());
          qc.invalidateQueries({ queryKey: queryKeys.dashboard(month, year) });
        }}
      />
      <DeleteInstallmentDialog
        open={installmentDialog.open}
        expense={installmentDialog.item ?? null}
        mode={installmentDialog.mode}
        isLoading={installmentDialog.mode === 'excluir' ? finance.deleteExpense.isPending : cancelarMut.isPending}
        onClose={() => setInstallmentDialog({ open: false, mode: 'excluir' })}
        onConfirmSelected={(ids) => {
          if (!installmentDialog.item) return;
          if (installmentDialog.mode === 'excluir') {
            finance.deleteExpense.mutate(
              { id: installmentDialog.item.id, ids },
              { onSuccess: () => setInstallmentDialog({ open: false, mode: 'excluir' }) },
            );
          } else {
            cancelarMut.mutate({ id: installmentDialog.item.id, ids });
          }
        }}
      />
    </>
  );
}

// ─── Linha de despesa (colunas completas) ──────────────────────────────────

function ExpenseRow({
  item, chave, isEmpresa, selecionada, onToggleSelecionada, onEdit, onPay, onMoveToNextMonth, onCancel, onDelete, onOpenAttachments, isCancelarPending,
}: {
  item: Expense;
  chave: string;
  isEmpresa: boolean;
  selecionada: boolean;
  onToggleSelecionada: () => void;
  onEdit: () => void;
  onPay: () => void;
  onMoveToNextMonth: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onOpenAttachments: () => void;
  isCancelarPending: boolean;
}) {
  return (
    <tr
      key={chave}
      className={[
        'transition-colors',
        item.status === 'cancelada'
          ? 'opacity-40 line-through'
          : item.pago ? 'opacity-70 hover:opacity-100' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
      ].join(' ')}
    >
      <td className="px-2 py-1.5 text-center">
        {!item.pago && (
          <input
            type="checkbox"
            checked={selecionada}
            onChange={onToggleSelecionada}
            className="rounded accent-[#0EC4D8] cursor-pointer disabled:opacity-40"
          />
        )}
      </td>
      <td className={TD_CLASS}>
        <p className={['truncate text-xs', item.pago ? 'text-slate-400' : 'text-slate-600 dark:text-slate-300'].join(' ')} title={item.descricao}>
          {item.descricao}
        </p>
        {item.observacoes && <p className={['truncate', SECONDARY_CLASS].join(' ')}>{item.observacoes}</p>}
      </td>
      <td className={[TD_CLASS, 'text-xs text-slate-600 dark:text-slate-300'].join(' ')}>
        <NomeComDetalhe principal={item.categoriaPai ?? item.categoria} detalhe={item.categoriaPai ? item.categoria : null} />
      </td>
      <td className={[TD_CLASS, 'text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap'].join(' ')}>
        <NomeComDetalhe principal={getPaymentMethodLabel(item.formaPagamento)} detalhe={item.cartaoNome} />
      </td>
      <td className={[TD_CLASS, 'whitespace-nowrap text-xs text-slate-500 dark:text-slate-400'].join(' ')}>
        {getFirstName(item.pagadorNome ?? item.autorNome)}
        {item.pagadorId != null && item.autorId != null && item.pagadorId !== item.autorId && (
          <span className={['block', SECONDARY_CLASS].join(' ')}>cadastrado por {getFirstName(item.autorNome)}</span>
        )}
      </td>
      <td className={TD_CLASS}><EntryTypeBadge item={item} /></td>
      <td className={[TD_CLASS, 'whitespace-nowrap text-xs text-slate-500 dark:text-slate-400'].join(' ')}>
        {item.dataCompra ? formatDate(item.dataCompra) : DASH}
      </td>
      <td className={[TD_CLASS, 'whitespace-nowrap text-xs text-slate-600 dark:text-slate-300'].join(' ')}>
        {formatDate(item.dataVencimento)}
      </td>
      <td className={[TD_CLASS, 'whitespace-nowrap text-xs text-slate-500 dark:text-slate-400'].join(' ')}>
        {item.dataPagamento && item.pago ? formatDate(item.dataPagamento) : DASH}
      </td>
      <td className={[TD_CLASS, 'whitespace-nowrap'].join(' ')}><ExpenseStatusBadge item={item} /></td>
      <td className={[TD_CLASS, 'whitespace-nowrap'].join(' ')}>
        <span className={['text-xs', getExpenseStatusColor(item)].join(' ')}>{formatCurrency(effectiveExpenseValue(item))}</span>
        {paymentDifference(item) !== null && <p className={SECONDARY_CLASS}>{formatDiferenca(paymentDifference(item)!)}</p>}
      </td>
      {isEmpresa && (
        <td className={[TD_CLASS, 'text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap'].join(' ')}>
          {item.numeroNf ?? DASH}
        </td>
      )}
      <td className={TD_CLASS}>
        {(item.anexos?.length ?? 0) > 0 ? (
          <button
            onClick={onOpenAttachments}
            title={`${item.anexos!.length} anexo(s)`}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-[#0EC4D8] transition"
          >
            <Paperclip size={11} />
            {item.anexos!.length}
          </button>
        ) : <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}
      </td>
      <td className={TD_CLASS}>
        <div className="flex justify-center gap-0.5">
          <ActionBtn
            onClick={onMoveToNextMonth}
            disabled={item.pago || item.status === 'cancelada'}
            title={item.status === 'cancelada' ? 'Cancelada' : item.pago ? 'Já pago' : 'Mover para próximo mês'}
            colorClass="text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/30"
          >
            <ArrowRight size={14} />
          </ActionBtn>
          <ActionBtn
            onClick={onPay}
            disabled={item.pago || item.status === 'cancelada'}
            title={item.status === 'cancelada' ? 'Cancelada' : item.pago ? 'Já pago' : 'Marcar como pago'}
            colorClass="text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
          >
            <CircleCheck size={15} />
          </ActionBtn>
          <ActionBtn onClick={onEdit} title="Editar" colorClass="text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
            <Pencil size={14} />
          </ActionBtn>
          <ActionBtn
            onClick={onCancel}
            disabled={item.status === 'cancelada' || isCancelarPending}
            title={item.status === 'cancelada' ? 'Já cancelada' : 'Cancelar'}
            colorClass="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
          >
            <Ban size={14} />
          </ActionBtn>
          <ActionBtn onClick={onDelete} title="Excluir" colorClass="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30">
            <Trash2 size={14} />
          </ActionBtn>
        </div>
      </td>
    </tr>
  );
}

// ─── Linha de receita (mesmas colunas, com traço nas que não se aplicam) ───

function IncomeRow({
  item, hoje, isEmpresa, onEdit, onConfirmRecebimento, onCancel, onDelete, onOpenAttachments, isReceberPending, isCancelarPending,
}: {
  item: Income;
  hoje: string;
  isEmpresa: boolean;
  onEdit: () => void;
  onConfirmRecebimento: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onOpenAttachments: () => void;
  isReceberPending: boolean;
  isCancelarPending: boolean;
}) {
  const isPrevista = item.status === 'prevista';
  const isAtrasada = isPrevista && item.data < hoje;
  const isCancelada = item.status === 'cancelada';

  return (
    // Fundo verde leve em toda receita, para separar das despesas; a situação
    // (prevista, em atraso) fica só na cor do texto do Status.
    <tr className={[
      'transition-colors bg-emerald-50/60 dark:bg-emerald-950/20',
      isCancelada ? 'opacity-50' : 'hover:bg-emerald-100/60 dark:hover:bg-emerald-950/40',
    ].join(' ')}>
      {/* Seleção — pagamento em lote é exclusivo de despesa */}
      <td className="px-2 py-1.5 text-center">{DASH}</td>
      <td className={TD_CLASS}>
        <p className="truncate text-xs text-slate-600 dark:text-slate-300" title={item.descricao}>{item.descricao}</p>
        {item.observacoes && <p className={['truncate', SECONDARY_CLASS].join(' ')}>{item.observacoes}</p>}
      </td>
      {/* Categoria — mesmo formato da despesa: "Grupo › Categoria" */}
      <td className={[TD_CLASS, 'text-xs text-slate-600 dark:text-slate-300'].join(' ')}>{categoriaReceita(item) ?? DASH}</td>
      {/* Pagamento — mostra cliente/representante quando é conta empresa, senão traço */}
      <td className={[TD_CLASS, 'text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap'].join(' ')}>
        {isEmpresa && (item.representanteNome || item.cliente) ? (item.representanteNome ?? item.cliente) : DASH}
      </td>
      <td className={[TD_CLASS, 'whitespace-nowrap text-xs text-slate-500 dark:text-slate-400'].join(' ')}>
        {getFirstName(item.autorNome)}
      </td>
      {/* Tipo — não se aplica a receita */}
      <td className={TD_CLASS}>{DASH}</td>
      {/* Data compra — não se aplica a receita */}
      <td className={TD_CLASS}>{DASH}</td>
      {/* Vencimento não existe em receita — usa a data de recebimento como equivalente */}
      <td className={[TD_CLASS, 'whitespace-nowrap text-xs text-slate-600 dark:text-slate-300'].join(' ')}>
        {formatDate(item.data)}
      </td>
      {/* Data pagamento — não se aplica a receita */}
      <td className={TD_CLASS}>{DASH}</td>
      {/* Status — usa o status de receita como equivalente */}
      <td className={[TD_CLASS, 'whitespace-nowrap'].join(' ')}>
        {isCancelada ? (
          <span className="text-xs text-slate-400 dark:text-slate-500">Cancelada</span>
        ) : isAtrasada ? (
          <span className="text-xs text-red-600 dark:text-red-400">Em atraso</span>
        ) : isPrevista ? (
          <span className="text-xs text-blue-600 dark:text-blue-400">Prevista</span>
        ) : (
          <span className="text-xs text-green-600 dark:text-green-400">Recebida</span>
        )}
      </td>
      <td className={[TD_CLASS, 'whitespace-nowrap'].join(' ')}>
        <span className="text-xs text-green-600 dark:text-green-400">{formatCurrency(item.valor)}</span>
        {isEmpresa && item.valorComissao != null && item.valorComissao > 0 && (
          <p className={SECONDARY_CLASS}>comissão {formatCurrency(item.valorComissao)}</p>
        )}
      </td>
      {/* NF — não se aplica a receita */}
      {isEmpresa && <td className={TD_CLASS}>{DASH}</td>}
      <td className={TD_CLASS}>
        {(item.anexos?.length ?? 0) > 0 ? (
          <button
            onClick={onOpenAttachments}
            title={`${item.anexos!.length} anexo(s)`}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-[#0EC4D8] transition"
          >
            <Paperclip size={11} />
            {item.anexos!.length}
          </button>
        ) : <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>}
      </td>
      <td className={TD_CLASS}>
        <div className="flex justify-center gap-0.5">
          {/* Espaçadores invisíveis para alinhar Editar/Cancelar/Excluir com
              as mesmas posições ocupadas em ExpenseRow — Mover e Marcar como
              pago não existem em receita, mas reservam a mesma largura de um
              ActionBtn real (p-1.5 + ícone) para manter as colunas de ícone
              alinhadas entre os dois tipos de linha. */}
          <span className="invisible rounded-lg p-1.5" aria-hidden="true"><ArrowRight size={14} /></span>
          <span className="invisible rounded-lg p-1.5" aria-hidden="true"><CircleCheck size={15} /></span>
          <ActionBtn onClick={onEdit} title="Editar" colorClass="text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
            <Pencil size={14} />
          </ActionBtn>
          {isPrevista ? (
            <ActionBtn
              onClick={onConfirmRecebimento}
              disabled={isReceberPending}
              title="Confirmar recebimento"
              colorClass="text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
            >
              <CircleCheck size={15} />
            </ActionBtn>
          ) : (
            <ActionBtn
              onClick={onCancel}
              disabled={isCancelada || isCancelarPending}
              title={isCancelada ? 'Já cancelada' : 'Cancelar'}
              colorClass="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
            >
              <Ban size={14} />
            </ActionBtn>
          )}
          <ActionBtn onClick={onDelete} title="Excluir" colorClass="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30">
            <Trash2 size={14} />
          </ActionBtn>
        </div>
      </td>
    </tr>
  );
}
