import { useState, useRef, useEffect, type ReactNode } from 'react';
import {
  Paperclip, Plus, RefreshCw, Ban,
  CircleCheck, Clock, TrendingDown, TrendingUp, ArrowRight, X, Lock, LockOpen, ChevronDown, CheckSquare,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFinanceDashboard } from '../../hooks/useFinanceDashboard';
import { useAppContext } from '../../context/AppContext';
import { pagarDespesa, moverDespesa } from '../../services/financeService';
import { queryKeys } from '../../services/queryKeys';
import { apiRequest, getActiveProfileId } from '../../services/apiClient';
import type { Expense, ExpenseFormValues } from '../../types/finance';
import type { Attachment } from '../../types/finance';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { EmptyState, ErrorState } from '../../ui/states';
import { MonthSelector } from '../finance/MonthSelector';
import { ExpenseDialog } from '../finance/ExpenseDialog';
import { AttachmentPreviewDialog } from '../../ui/AttachmentPreviewDialog';
import { PaymentModal } from '../finance/PaymentModal';
import { BatchPaymentModal } from '../finance/BatchPaymentModal';
import { formatCurrency, formatDate } from '../finance/formatters';

type FiltroStatus = 'todos' | 'pago' | 'em_dia' | 'atrasada';
type FiltroDataPag = 'qualquer' | 'hoje' | 'semana' | 'mes';
type Ordenar = 'vencimento_asc' | 'vencimento_desc' | 'valor_asc' | 'valor_desc' | 'descricao';

const FORMA_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro', pix: 'PIX',
  debito: 'Débito', débito: 'Débito',
  credito: 'Crédito', crédito: 'Crédito',
};

function getFormaLabel(forma: string): string {
  return FORMA_LABELS[(forma ?? '').toLowerCase()] ?? forma ?? '—';
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function getStatus(item: Expense): 'pago' | 'em_dia' | 'atrasada' {
  if (item.pago) return 'pago';
  return item.dataVencimento < todayStr() ? 'atrasada' : 'em_dia';
}

function StatusBadge({ item }: { item: Expense }) {
  const s = getStatus(item);
  if (s === 'pago') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700 dark:bg-green-900/40 dark:text-green-400">
        <CircleCheck size={11} /> Pago
      </span>
    );
  }
  if (s === 'atrasada') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-400">
        <Clock size={11} /> Atrasada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
      <Clock size={11} /> Em dia
    </span>
  );
}

function TipoBadge({ item }: { item: Expense }) {
  const hasBadge = item.parcela || item.recorrente;
  if (!hasBadge) return <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {item.parcela && (
        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-blue-900/40 dark:text-blue-400">
          {item.parcela}
        </span>
      )}
      {item.recorrente && (
        <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-600 dark:bg-purple-900/40 dark:text-purple-400">
          Recorrente
        </span>
      )}
    </div>
  );
}

interface FilterOption { value: string; label: string }

function FilterChip({
  options, value, onChange,
}: {
  options: FilterOption[];
  value: string;
  onChange: (v: string) => void;
}) {
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
        <ChevronDown
          size={11}
          className={['transition-transform duration-150', open ? 'rotate-180' : ''].join(' ')}
        />
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
  onClick, disabled, title, colorClass, children,
}: {
  onClick: () => void;
  disabled: boolean;
  title: string;
  colorClass: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      className={[
        'rounded-lg p-1.5 transition',
        disabled ? 'opacity-40 cursor-not-allowed' : colorClass,
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export function DespesasScreen() {
  const { month, year, setMonth, setYear } = useAppContext();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Expense }>({ open: false });
  const [anexosDialog, setAnexosDialog] = useState<{ open: boolean; title: string; anexos: Attachment[] }>({
    open: false, title: '', anexos: [],
  });
  const [paymentModal, setPaymentModal] = useState<{ open: boolean; item?: Expense }>({ open: false });

  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('todos');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroFormaPag, setFiltroFormaPag] = useState('');
  const [filtroDataPag, setFiltroDataPag] = useState<FiltroDataPag>('qualquer');
  const [ordenar, setOrdenar] = useState<Ordenar>('vencimento_asc');
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [batchModal, setBatchModal] = useState(false);

  const isEmpresa = localStorage.getItem('perfilAtivoTipo') === 'empresa';
  const qc = useQueryClient();
  const finance = useFinanceDashboard(month, year);
  const allItems = finance.dashboard.data?.expenses ?? [];

  const mesStatusQuery = useQuery({
    queryKey: queryKeys.mesStatus(year, month),
    queryFn: async () => {
      const pid = getActiveProfileId();
      const q = pid ? `?perfil_id=${pid}` : '';
      const all = await apiRequest<{ ano: number; mes: number; fechado: boolean }[]>(`/meses${q}`);
      return all.find((m) => m.ano === year && m.mes === month)?.fechado ?? false;
    },
  });
  const mesFechado = mesStatusQuery.data === true;

  const fecharMut = useMutation({
    mutationFn: async () => {
      const pid = getActiveProfileId();
      const body = pid ? { perfil_id: pid } : {};
      await apiRequest<void>(`/meses/${year}/${month}/fechar`, { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.mesStatus(year, month) }),
  });

  const reabrirMut = useMutation({
    mutationFn: async () => {
      const pid = getActiveProfileId();
      const body = pid ? { perfil_id: pid } : {};
      await apiRequest<void>(`/meses/${year}/${month}/reabrir`, { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.mesStatus(year, month) }),
  });

  const pagarMut = useMutation({
    mutationFn: ({ id, dataPagamento, valorPago }: { id: number; dataPagamento: string; valorPago: number }) =>
      pagarDespesa(id, dataPagamento, valorPago),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.dashboard(month, year) });
      setPaymentModal({ open: false });
    },
  });

  const moverMut = useMutation({
    mutationFn: (id: number) => moverDespesa(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dashboard(month, year) }),
  });

  const cancelarMut = useMutation({
    mutationFn: (id: number) => apiRequest<void>(`/despesas/${id}/cancelar`, { method: 'PUT' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dashboard(month, year) }),
  });

  const categorias = [...new Set(allItems.map((i) => i.categoria))].sort();
  const formas = [...new Set(allItems.map((i) => i.formaPagamento))].sort();

  const hoje = todayStr();
  const semanaAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const mesPrefixo = `${year}-${String(month).padStart(2, '0')}`;

  const filtered = allItems
    .filter((i) => {
      if (filtroStatus !== 'todos' && getStatus(i) !== filtroStatus) return false;
      if (filtroCategoria && i.categoria !== filtroCategoria) return false;
      if (filtroFormaPag && i.formaPagamento !== filtroFormaPag) return false;
      if (filtroDataPag === 'hoje' && i.dataPagamento !== hoje) return false;
      if (filtroDataPag === 'semana' && (!i.dataPagamento || i.dataPagamento < semanaAgo || i.dataPagamento > hoje)) return false;
      if (filtroDataPag === 'mes' && (!i.dataPagamento || !i.dataPagamento.startsWith(mesPrefixo))) return false;
      return true;
    })
    .sort((a, b) => {
      switch (ordenar) {
        case 'vencimento_desc': return b.dataVencimento.localeCompare(a.dataVencimento);
        case 'valor_asc': return a.valorFinal - b.valorFinal;
        case 'valor_desc': return b.valorFinal - a.valorFinal;
        case 'descricao': return a.descricao.localeCompare(b.descricao);
        default: return a.dataVencimento.localeCompare(b.dataVencimento);
      }
    });

  const hasFilter2 =
    filtroStatus !== 'todos' || filtroCategoria !== '' || filtroFormaPag !== '' || filtroDataPag !== 'qualquer';

  useEffect(() => { setSelecionadas(new Set()); }, [month, year]);

  const unpaidFiltered = filtered.filter((i) => !i.pago);
  const allSelected = unpaidFiltered.length > 0 && unpaidFiltered.every((i) => selecionadas.has(i.id));

  function toggleSelectAll() {
    if (allSelected) {
      setSelecionadas(new Set());
    } else {
      setSelecionadas(new Set(unpaidFiltered.map((i) => i.id)));
    }
  }

  function toggleItem(id: number) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const ativas = allItems.filter((i) => i.status !== 'cancelada');
  const total = ativas.reduce((s, i) => s + i.valorFinal, 0);
  const totalPago = ativas.filter((i) => i.pago).reduce((s, i) => s + i.valorFinal, 0);
  const totalPendente = total - totalPago;
  const totalDiferenca = ativas.reduce((s, i) =>
    i.valorOriginal != null ? s + (i.valorFinal - i.valorOriginal) : s, 0);

  const handleSave = async (values: ExpenseFormValues[]) => {
    for (const v of values) {
      await finance.saveExpense.mutateAsync({ values: v, id: values.length === 1 ? dialog.item?.id : undefined });
    }
    setDialog({ open: false });
  };

  return (
    <>
      <div className="grid gap-4">
        {/* Header */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-bold text-slate-950 dark:text-white">Despesas</h2>
            <div className="flex gap-2">
              <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => finance.dashboard.refetch()}>
                Atualizar
              </Button>
              <Button
                variant="secondary"
                icon={mesFechado ? <LockOpen size={15} /> : <Lock size={15} />}
                onClick={() => mesFechado ? reabrirMut.mutate() : fecharMut.mutate()}
                disabled={fecharMut.isPending || reabrirMut.isPending}
              >
                {mesFechado ? 'Reabrir mês' : 'Fechar mês'}
              </Button>
              <Button icon={<Plus size={15} />} onClick={() => setDialog({ open: true })}>
                Nova despesa
              </Button>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
            <MonthSelector month={month} year={year} onMonthChange={setMonth} onYearChange={setYear} />
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown size={15} className="text-red-400" />
              <p className="text-xs font-semibold uppercase text-slate-500">Total</p>
            </div>
            <p className="text-2xl font-bold text-red-700">{formatCurrency(total)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{allItems.length} lançamento(s)</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CircleCheck size={15} className="text-green-400" />
              <p className="text-xs font-semibold uppercase text-slate-500">Pagas</p>
            </div>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(totalPago)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{allItems.filter((i) => i.pago).length} item(s)</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={15} className="text-amber-400" />
              <p className="text-xs font-semibold uppercase text-slate-500">Pendentes</p>
            </div>
            <p className="text-2xl font-bold text-amber-700">{formatCurrency(totalPendente)}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{allItems.filter((i) => !i.pago).length} item(s)</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              {totalDiferenca > 0
                ? <TrendingUp size={15} className="text-amber-400" />
                : <TrendingDown size={15} className="text-emerald-400" />}
              <p className="text-xs font-semibold uppercase text-slate-500">Diferença</p>
            </div>
            <p className={['text-2xl font-bold', totalDiferenca > 0 ? 'text-amber-600' : totalDiferenca < 0 ? 'text-emerald-600' : 'text-slate-400'].join(' ')}>
              {totalDiferenca === 0 ? '—' : (totalDiferenca > 0 ? '+' : '') + formatCurrency(totalDiferenca)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {totalDiferenca > 0 ? 'encargos/juros' : totalDiferenca < 0 ? 'economia' : 'sem variação'}
            </p>
          </Card>
        </div>

        {finance.dashboard.error && (
          <ErrorState title="Erro ao carregar despesas" description={finance.dashboard.error.message} />
        )}

        {/* Table card */}
        <Card>
          {/* Toolbar: filtros */}
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 px-4 py-3">
            <div className="shrink-0">
              {selecionadas.size > 0 && !mesFechado ? (
                <div className="flex items-center gap-2">
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
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <FilterChip
                value={filtroStatus}
                onChange={(v) => setFiltroStatus(v as FiltroStatus)}
                options={[
                  { value: 'todos', label: 'Status' },
                  { value: 'pago', label: 'Pago' },
                  { value: 'em_dia', label: 'Em dia' },
                  { value: 'atrasada', label: 'Atrasada' },
                ]}
              />
              <FilterChip
                value={filtroCategoria}
                onChange={setFiltroCategoria}
                options={[
                  { value: '', label: 'Categoria' },
                  ...categorias.map((c) => ({ value: c, label: c })),
                ]}
              />
              <FilterChip
                value={filtroFormaPag}
                onChange={setFiltroFormaPag}
                options={[
                  { value: '', label: 'Pagamento' },
                  ...formas.map((f) => ({ value: f, label: getFormaLabel(f) })),
                ]}
              />
              <FilterChip
                value={filtroDataPag}
                onChange={(v) => setFiltroDataPag(v as FiltroDataPag)}
                options={[
                  { value: 'qualquer', label: 'Data pag.' },
                  { value: 'hoje', label: 'Pago hoje' },
                  { value: 'semana', label: 'Esta semana' },
                  { value: 'mes', label: 'Este mês' },
                ]}
              />
              <FilterChip
                value={ordenar}
                onChange={(v) => setOrdenar(v as Ordenar)}
                options={[
                  { value: 'vencimento_asc', label: 'Vencimento ↑' },
                  { value: 'vencimento_desc', label: 'Vencimento ↓' },
                  { value: 'valor_asc', label: 'Valor ↑' },
                  { value: 'valor_desc', label: 'Valor ↓' },
                  { value: 'descricao', label: 'A–Z' },
                ]}
              />
              {hasFilter2 && (
                <button
                  type="button"
                  onClick={() => {
                    setFiltroStatus('todos');
                    setFiltroCategoria('');
                    setFiltroFormaPag('');
                    setFiltroDataPag('qualquer');
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-100 transition dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                >
                  <X size={10} /> Limpar
                </button>
              )}
            </div>
          </div>

          {finance.dashboard.isLoading ? (
            <EmptyState title="Carregando" description="Buscando despesas do mês." />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={hasFilter2 ? 'Nenhum resultado' : 'Nenhuma despesa'}
              description={hasFilter2 ? 'Tente ajustar os filtros.' : 'Nenhuma despesa registrada neste mês.'}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col style={{ width: '40px' }} />
                  <col style={{ width: '180px' }} />
                  <col style={{ width: '80px' }} />
                  <col style={{ width: '110px' }} />
                  <col style={{ width: '100px' }} />
                  <col style={{ width: '120px' }} />
                  <col style={{ width: '90px' }} />
                  <col style={{ width: '90px' }} />
                  <col style={{ width: '110px' }} />
                  {isEmpresa && <col style={{ width: '70px' }} />}
                  <col style={{ width: '70px' }} />
                  <col style={{ width: '110px' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-left">
                    <th className="px-3 py-2.5 text-center">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        disabled={mesFechado || unpaidFiltered.length === 0}
                        title="Selecionar todas não pagas"
                        className="rounded accent-[#0EC4D8] cursor-pointer disabled:opacity-40"
                      />
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Descrição</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Tipo</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Vencimento</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Data compra</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Categoria</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Pagamento</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Status</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 text-right">Valor</th>
                    {isEmpresa && <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">NF</th>}
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 text-center">Anexos</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filtered.map((item) => (
                    <tr
                      key={item.id}
                      className={[
                        'transition-colors',
                        item.status === 'cancelada'
                          ? 'opacity-40 line-through'
                          : item.pago ? 'opacity-70 hover:opacity-100' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                      ].join(' ')}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-3 text-center">
                        {!item.pago && (
                          <input
                            type="checkbox"
                            checked={selecionadas.has(item.id)}
                            onChange={() => toggleItem(item.id)}
                            disabled={mesFechado}
                            className="rounded accent-[#0EC4D8] cursor-pointer disabled:opacity-40"
                          />
                        )}
                      </td>

                      {/* Descrição */}
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className={['font-semibold truncate', item.pago ? 'text-slate-400' : 'text-slate-900 dark:text-white'].join(' ')}>
                          {item.descricao}
                        </p>
                        {item.observacoes && (
                          <p className="text-[11px] text-slate-400 truncate">{item.observacoes}</p>
                        )}
                      </td>

                      {/* Tipo */}
                      <td className="px-4 py-3">
                        <TipoBadge item={item} />
                      </td>

                      {/* Vencimento */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs text-slate-600 dark:text-slate-300">{formatDate(item.dataVencimento)}</span>
                        {item.dataPagamento && item.pago && (
                          <p className="text-[10px] text-green-600 dark:text-green-400">
                            pago em {formatDate(item.dataPagamento)}
                          </p>
                        )}
                      </td>

                      {/* Data compra */}
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                        {item.dataCompra ? formatDate(item.dataCompra) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>

                      {/* Categoria */}
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                          {item.categoria}
                        </span>
                      </td>

                      {/* Pagamento */}
                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {getFormaLabel(item.formaPagamento)}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        {item.status === 'cancelada' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-600">
                            Cancelada
                          </span>
                        ) : (
                          <StatusBadge item={item} />
                        )}
                      </td>

                      {/* Valor */}
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <p className="text-[10px] text-slate-400 font-normal">
                          {item.valorOriginal != null ? `inicial ${formatCurrency(item.valorOriginal)}` : ''}
                        </p>
                        <span className={['font-bold', item.pago ? 'text-slate-400 line-through' : 'text-red-700 dark:text-red-400'].join(' ')}>
                          {formatCurrency(item.valorFinal)}
                        </span>
                      </td>

                      {/* NF (empresa only) */}
                      {isEmpresa && (
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {item.numeroNf ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                        </td>
                      )}

                      {/* Anexos */}
                      <td className="px-4 py-3 text-center">
                        {(item.anexos?.length ?? 0) > 0 ? (
                          <button
                            onClick={() => setAnexosDialog({ open: true, title: item.descricao, anexos: item.anexos! })}
                            title={`${item.anexos!.length} anexo(s)`}
                            className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-[#0EC4D8]/10 hover:text-[#0EC4D8] transition"
                          >
                            <Paperclip size={10} />
                            {item.anexos!.length}
                          </button>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <ActionBtn
                            onClick={() => setPaymentModal({ open: true, item })}
                            disabled={item.pago || mesFechado || item.status === 'cancelada'}
                            title={item.status === 'cancelada' ? 'Cancelada' : item.pago ? 'Já pago' : mesFechado ? 'Mês fechado' : 'Marcar como pago'}
                            colorClass="text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                          >
                            <CircleCheck size={15} />
                          </ActionBtn>
                          <ActionBtn
                            onClick={() => {
                              if (confirm(`Mover "${item.descricao}" para o próximo mês?`)) {
                                moverMut.mutate(item.id);
                              }
                            }}
                            disabled={item.pago || mesFechado || item.status === 'cancelada'}
                            title={item.status === 'cancelada' ? 'Cancelada' : item.pago ? 'Já pago' : mesFechado ? 'Mês fechado' : 'Mover para próximo mês'}
                            colorClass="text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/30"
                          >
                            <ArrowRight size={14} />
                          </ActionBtn>
                          <ActionBtn
                            onClick={() => {
                              if (item.status === 'cancelada') return;
                              if (confirm(`Cancelar "${item.descricao}"?`)) cancelarMut.mutate(item.id);
                            }}
                            disabled={item.status === 'cancelada' || cancelarMut.isPending}
                            title={item.status === 'cancelada' ? 'Já cancelada' : 'Cancelar'}
                            colorClass="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                          >
                            <Ban size={14} />
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <ExpenseDialog
        open={dialog.open}
        expense={dialog.item}
        month={month}
        year={year}
        isSaving={finance.saveExpense.isPending}
        error={finance.saveExpense.error?.message}
        onClose={() => setDialog({ open: false })}
        onSave={handleSave}
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
        expenses={filtered.filter((i) => selecionadas.has(i.id) && !i.pago)}
        onClose={() => setBatchModal(false)}
        onSuccess={() => {
          setSelecionadas(new Set());
          qc.invalidateQueries({ queryKey: queryKeys.dashboard(month, year) });
        }}
      />
    </>
  );
}
