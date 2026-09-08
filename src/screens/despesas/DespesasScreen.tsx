import { useState, useRef, useEffect, type ReactNode } from 'react';
import {
  Paperclip, Plus, Ban,
  CircleCheck, ArrowRight, X, ChevronDown, CheckSquare, Pencil, Trash2,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFinanceDashboard } from '../../hooks/useFinanceDashboard';
import { pagarDespesa, moverDespesa } from '../../services/financeService';
import { queryKeys, invalidateFinanceQueries } from '../../services/queryKeys';
import { apiRequest, getActiveAccountId } from '../../services/apiClient';
import type { Expense, ExpenseFormValues } from '../../types/finance';
import type { Attachment } from '../../types/finance';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { ErrorState } from '../../ui/states';
import { EmptyState } from '../../ui/EmptyState';
import { ExpenseDialog } from '../finance/ExpenseDialog';
import { AttachmentPreviewDialog } from '../../ui/AttachmentPreviewDialog';
import { PaymentModal } from '../finance/PaymentModal';
import { BatchPaymentModal } from '../finance/BatchPaymentModal';
import { formatCurrency, formatDate } from '../finance/formatters';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { useConfirm } from '../../context/ConfirmContext';
import { daysAgoLocalIso, getLocalTodayIso } from '../../utils/date';
import { ExpenseCard } from './ExpenseCard';
import { DeleteInstallmentDialog } from './DeleteInstallmentDialog';

type FiltroStatus = 'todos' | 'pago' | 'em_dia' | 'atrasada';
type FiltroDataPag = 'qualquer' | 'hoje' | 'semana' | 'mes';
type Ordenar = 'cadastro_desc' | 'vencimento_asc' | 'vencimento_desc' | 'valor_asc' | 'valor_desc' | 'descricao';

const FORMA_LABELS: Record<string, string> = {
  dinheiro: 'Dinheiro', pix: 'PIX',
  debito: 'Débito', débito: 'Débito',
  credito: 'Crédito', crédito: 'Crédito',
};

export function getFormaLabel(forma: string): string {
  return FORMA_LABELS[(forma ?? '').toLowerCase()] ?? forma ?? '—';
}

export function getStatus(item: Expense): 'pago' | 'em_dia' | 'atrasada' {
  if (item.pago) return 'pago';
  return item.dataVencimento < getLocalTodayIso() ? 'atrasada' : 'em_dia';
}

// Cor por estado, compartilhada entre Status e Valor: o valor herda a cor do
// estado em vez de repetir a informacao com um codigo proprio.
const STATUS_TEXT_COLOR: Record<'pago' | 'atrasada' | 'em_dia' | 'cancelada', string> = {
  pago: 'text-green-600 dark:text-green-400',
  atrasada: 'text-red-600 dark:text-red-400',
  // Sem cor propria: "em dia" e o estado neutro, o unico que nao pede nada do
  // usuario. Cor so onde ha algo a comunicar — pago encerra, atrasada cobra.
  em_dia: 'text-slate-600 dark:text-slate-300',
  // Cancelada e encerramento, nao pendencia: cinza para nao competir com
  // "atrasada", que e a unica que pede acao.
  cancelada: 'text-slate-400 dark:text-slate-500',
};

const STATUS_LABEL: Record<'pago' | 'atrasada' | 'em_dia' | 'cancelada', string> = {
  pago: 'Pago', atrasada: 'Atrasada', em_dia: 'Em dia', cancelada: 'Cancelada',
};

export function getFirstName(nome?: string | null): string {
  const first = (nome ?? '').trim().split(/\s+/)[0];
  return first || '—';
}

// O valor que a linha representa: o que saiu, quando pago; o previsto, quando
// nao. Em parcelada e o valor da parcela, nao o total da compra.
export function valorExibido(item: Expense): number {
  return item.pago && item.valorPago != null ? item.valorPago : item.valorFinal;
}

// Diferenca entre o previsto e o pago — juros ou desconto. Só existe quando a
// despesa foi paga por um valor diferente do previsto; nos demais casos nao ha
// nada a comunicar e a linha secundaria nao aparece.
export function diferencaValor(item: Expense): number | null {
  if (!item.pago || item.valorPago == null) return null;
  const diff = item.valorPago - item.valorFinal;
  return diff === 0 ? null : diff;
}

export function formatDiferenca(diff: number): string {
  return `${diff > 0 ? '+' : '−'} ${formatCurrency(Math.abs(diff))}`;
}

// Estilo unico de informacao secundaria em toda a tabela. Antes havia tres
// variacoes (tamanho herdado, 11px cinza e 10px verde) para o mesmo papel.
const SECONDARY_CLASS = 'text-[11px] text-slate-400 dark:text-slate-500';
const TH_CLASS = 'px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-400 text-center';
const TD_CLASS = 'px-2 py-1.5 text-center';

export function getStatusKey(item: Expense): 'pago' | 'atrasada' | 'em_dia' | 'cancelada' {
  return item.status === 'cancelada' ? 'cancelada' : getStatus(item);
}

export function getStatusColor(item: Expense): string {
  return STATUS_TEXT_COLOR[getStatusKey(item)];
}

// Texto colorido em vez de capsula com icone: a cor ja comunica o estado, e o
// mesmo relogio aparecia em "atrasada" e "em dia" sem diferenciar nada.
export function StatusBadge({ item }: { item: Expense }) {
  const key = getStatusKey(item);
  return (
    <span className={['text-xs', STATUS_TEXT_COLOR[key]].join(' ')}>
      {STATUS_LABEL[key]}
    </span>
  );
}

// Os tres tipos sao mutuamente exclusivos, mas `parcelado` e `recorrente` sao
// colunas independentes no banco e ha registros antigos com ambos true. A
// prioridade e explicita: parcelada vence, porque o contador de parcelas prova
// que a despesa tem fim.
export function TipoBadge({ item }: { item: Expense }) {
  // Sem cor propria: diferente do Status, onde a cor carrega significado
  // (vermelho pede acao, verde encerra), aqui azul e roxo eram so decoracao.
  // Mesmo tom das demais colunas de dado.
  if (item.parcela) {
    return <span className="text-xs text-slate-600 dark:text-slate-300">{item.parcela}</span>;
  }
  if (item.recorrente) {
    return <span className="text-xs text-slate-600 dark:text-slate-300">Recorrente</span>;
  }
  return <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>;
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
  onClick, disabled = false, title, colorClass, children,
}: {
  onClick: () => void;
  // Opcional: acoes como Editar e Excluir nunca sao bloqueadas, e exigir a prop
  // obrigava a passar `disabled={false}` sem ganho nenhum.
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
      className={[
        'rounded-lg p-1.5 transition',
        disabled ? 'opacity-40 cursor-not-allowed' : colorClass,
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export interface FilteredSummary {
  total: number;
  count: number;
  active: boolean;
}

interface DespesasScreenProps {
  month: number;
  year: number;
  toolbarStart?: ReactNode;
  onFilteredSummaryChange?: (summary: FilteredSummary) => void;
}

export function DespesasScreen({ month, year, toolbarStart, onFilteredSummaryChange }: DespesasScreenProps) {
  const [dialog, setDialog] = useState<{ open: boolean; item?: Expense }>({ open: false });
  const [anexosDialog, setAnexosDialog] = useState<{ open: boolean; title: string; anexos: Attachment[] }>({
    open: false, title: '', anexos: [],
  });
  const [paymentModal, setPaymentModal] = useState<{ open: boolean; item?: Expense }>({ open: false });
  const [deleteInstallmentDialog, setDeleteInstallmentDialog] = useState<{ open: boolean; item?: Expense }>({ open: false });

  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>('todos');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroAutor, setFiltroAutor] = useState('');
  const [filtroFormaPag, setFiltroFormaPag] = useState('');
  const [filtroCartao, setFiltroCartao] = useState('');
  const [filtroDataPag, setFiltroDataPag] = useState<FiltroDataPag>('qualquer');
  const [ordenar, setOrdenar] = useState<Ordenar>('cadastro_desc');
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [batchModal, setBatchModal] = useState(false);

  const isEmpresa = localStorage.getItem('contaAtivaTipo') === 'empresa';
  const qc = useQueryClient();
  const confirm = useConfirm();
  const finance = useFinanceDashboard(month, year);
  const allItems = finance.dashboard.data?.expenses ?? [];

  const mesStatusQuery = useQuery({
    queryKey: queryKeys.mesStatus(year, month),
    queryFn: async () => {
      const accountId = getActiveAccountId();
      const q = accountId ? `?conta_id=${accountId}` : '';
      const all = await apiRequest<{ ano: number; mes: number; fechado: boolean }[]>(`/meses${q}`);
      return all.find((m) => m.ano === year && m.mes === month)?.fechado ?? false;
    },
  });
  const mesFechado = mesStatusQuery.data === true;

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
    mutationFn: (id: number) => apiRequest<void>(`/despesas/${id}/cancelar`, { method: 'PUT' }),
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
    const ok = await confirm({
      title: 'Cancelar despesa',
      message: `Cancelar "${item.descricao}"?`,
      confirmLabel: 'Cancelar despesa',
    });
    if (ok) cancelarMut.mutate(item.id);
  };

  const handleExcluirDespesa = async (item: Expense) => {
    if (item.parcela) {
      setDeleteInstallmentDialog({ open: true, item });
      return;
    }
    const ok = await confirm({
      title: 'Excluir despesa',
      message: `Excluir "${item.descricao}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir despesa',
    });
    if (ok) finance.deleteExpense.mutate({ id: item.id });
  };

  const categorias = [...new Set(allItems.map((i) => i.categoria))].sort();
  // Autores distintos entre os lancamentos do periodo. A coluna "Quem lancou"
  // so aparece quando ha mais de um: numa conta usada por uma pessoa so, ela
  // repetiria o mesmo nome em toda linha.
  const autores = [...new Set(allItems.map((i) => i.autorNome).filter(Boolean) as string[])].sort();
  const mostrarAutor = autores.length > 1;
  const formas = [...new Set(allItems.map((i) => i.formaPagamento))].sort();
  const cartoesUsados = [...new Map(
    allItems.filter((i) => i.cartaoId != null).map((i) => [String(i.cartaoId), i.cartaoNome ?? `Cartão #${i.cartaoId}`])
  ).entries()].sort((a, b) => a[1].localeCompare(b[1]));

  const hoje = getLocalTodayIso();
  const semanaAgo = daysAgoLocalIso(7);
  const mesPrefixo = `${year}-${String(month + 1).padStart(2, '0')}`;

  const filtered = allItems
    .filter((i) => {
      if (filtroStatus !== 'todos' && getStatus(i) !== filtroStatus) return false;
      if (filtroCategoria && i.categoria !== filtroCategoria) return false;
      if (filtroAutor && i.autorNome !== filtroAutor) return false;
      if (filtroFormaPag && i.formaPagamento !== filtroFormaPag) return false;
      if (filtroCartao && String(i.cartaoId ?? '') !== filtroCartao) return false;
      if (filtroDataPag === 'hoje' && i.dataPagamento !== hoje) return false;
      if (filtroDataPag === 'semana' && (!i.dataPagamento || i.dataPagamento < semanaAgo || i.dataPagamento > hoje)) return false;
      if (filtroDataPag === 'mes' && (!i.dataPagamento || !i.dataPagamento.startsWith(mesPrefixo))) return false;
      return true;
    })
    .sort((a, b) => {
      switch (ordenar) {
        // Padrao: o que acabou de ser cadastrado aparece primeiro. Despesas
        // antigas podem nao ter data_criacao — nesse caso o id, que e serial,
        // preserva a ordem de insercao.
        case 'cadastro_desc':
          return a.dataCriacao && b.dataCriacao
            ? b.dataCriacao.localeCompare(a.dataCriacao)
            : b.id - a.id;
        case 'vencimento_desc': return b.dataVencimento.localeCompare(a.dataVencimento);
        case 'valor_asc': return a.valorFinal - b.valorFinal;
        case 'valor_desc': return b.valorFinal - a.valorFinal;
        case 'descricao': return a.descricao.localeCompare(b.descricao);
        default: return a.dataVencimento.localeCompare(b.dataVencimento);
      }
    });

  const hasFilter2 =
    filtroStatus !== 'todos' || filtroCategoria !== '' || filtroFormaPag !== '' || filtroCartao !== '' || filtroDataPag !== 'qualquer' || filtroAutor !== '';

  useEffect(() => {
    onFilteredSummaryChange?.({
      total: filtered.reduce((s, i) => s + i.valorFinal, 0),
      count: filtered.length,
      active: hasFilter2,
    });
  }, [filtered, hasFilter2, onFilteredSummaryChange]);

  useEffect(() => { setSelecionadas(new Set()); }, [month, year]);

  const unpaidFiltered = filtered.filter((i) => !i.pago);
  const allSelected = unpaidFiltered.length > 0 && unpaidFiltered.every((i) => selecionadas.has(i.id));
  const hasMovableItem = filtered.some((item) => !item.pago && !mesFechado && item.status !== 'cancelada');
  const filterGuide = useFirstAccessGuide('despesas:filtros-v1', {
    enabled: !finance.dashboard.isLoading && allItems.length > 0,
  });
  const loteGuide = useFirstAccessGuide('despesas:lote-v1', {
    enabled: selecionadas.size === 0 && !mesFechado && unpaidFiltered.length > 0,
  });
  const pagarSelecionadasGuide = useFirstAccessGuide('despesas:pagar-selecionadas-v1', {
    enabled: selecionadas.size > 0 && !mesFechado,
  });
  const moverMesGuide = useFirstAccessGuide('despesas:mover-mes-v1', {
    enabled: hasMovableItem,
  });

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

  const handleSave = async (values: ExpenseFormValues[]) => {
    for (const v of values) {
      await finance.saveExpense.mutateAsync({ values: v, id: values.length === 1 ? dialog.item?.id : undefined });
    }
    setDialog({ open: false });
  };

  return (
    <>
      {/* min-h-0 em toda a cadeia: a altura vem do <main> em modo fillViewport,
          e cada nivel precisa poder encolher para o scroll acontecer dentro da
          tabela, e nao na pagina. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {finance.dashboard.error && (
          <ErrorState title="Erro ao carregar despesas" description={finance.dashboard.error.message} />
        )}

        {/* Table card */}
        <Card allowOverflow className="flex min-h-0 flex-1 flex-col">
          {/* Toolbar: filtros — shrink-0 para nao ser comprimida pelo corpo
              rolavel que divide a altura com ela. */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 px-4 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {toolbarStart}
              <div className="relative shrink-0">
                {selecionadas.size > 0 && !mesFechado ? (
                  <div className="flex flex-wrap items-center gap-2">
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
                {pagarSelecionadasGuide.isVisible && selecionadas.size > 0 && !mesFechado && (
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
            </div>
            <div className="relative flex flex-wrap items-center justify-end gap-1.5">
              {filterGuide.isVisible && !finance.dashboard.isLoading && allItems.length > 0 && (
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
              )}
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
              {cartoesUsados.length > 0 && (
                <FilterChip
                  value={filtroCartao}
                  onChange={setFiltroCartao}
                  options={[
                    { value: '', label: 'Cartão' },
                    ...cartoesUsados.map(([id, nome]) => ({ value: id, label: nome })),
                  ]}
                />
              )}
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
                  { value: 'cadastro_desc', label: 'Mais recentes' },
                  { value: 'vencimento_asc', label: 'Vencimento ↑' },
                  { value: 'vencimento_desc', label: 'Vencimento ↓' },
                  { value: 'valor_asc', label: 'Valor ↑' },
                  { value: 'valor_desc', label: 'Valor ↓' },
                  { value: 'descricao', label: 'A–Z' },
                ]}
              />
              {mostrarAutor && (
                <FilterChip
                  value={filtroAutor}
                  onChange={setFiltroAutor}
                  options={[
                    { value: '', label: 'Todos os membros' },
                    ...autores.map((a) => ({ value: a, label: a })),
                  ]}
                />
              )}
              {hasFilter2 && (
                <button
                  type="button"
                  onClick={() => {
                    setFiltroStatus('todos');
                    setFiltroCategoria('');
                    setFiltroFormaPag('');
                    setFiltroCartao('');
                    setFiltroDataPag('qualquer');
                    setFiltroAutor('');
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
            hasFilter2 ? (
              <EmptyState title="Nenhum resultado" description="Tente ajustar os filtros." />
            ) : (
              <div className="grid justify-items-center gap-3 py-8">
                <EmptyState
                  title="Nenhuma despesa"
                  description="Cadastre sua primeira despesa para acompanhar pagamentos, vencimentos e categorias."
                />
                <Button icon={<Plus size={15} />} onClick={() => setDialog({ open: true })}>
                  Nova despesa
                </Button>
              </div>
            )
          ) : (
            <div className="relative flex min-h-0 flex-1 flex-col">
              {loteGuide.isVisible && selecionadas.size === 0 && !mesFechado && unpaidFiltered.length > 0 && (
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
                {filtered.map((item) => (
                  <ExpenseCard
                    key={item.id}
                    item={item}
                    isEmpresa={isEmpresa}
                    mesFechado={mesFechado}
                    onPay={() => setPaymentModal({ open: true, item })}
                    onMoveToNextMonth={() => handleMoverProximoMes(item)}
                    onCancel={() => handleCancelarDespesa(item)}
                    onOpenAttachments={() => setAnexosDialog({ open: true, title: item.descricao, anexos: item.anexos! })}
                    onEdit={() => setDialog({ open: true, item })}
                    onDelete={() => handleExcluirDespesa(item)}
                  />
                ))}
              </div>

              {/* Table — desktop only. min-h-0 e obrigatorio: sem ele o filho
                  de um flex nao encolhe abaixo do conteudo e o overflow-y
                  nunca chega a rolar. */}
              <div className="hidden min-h-0 flex-1 overflow-auto md:block">
              <table className="w-full text-sm table-fixed">
                {/* Larguras redistribuidas pelo conteudo real: descricao tem no
                    maximo poucas palavras e antes reservava 180px; datas e
                    valores cabem em menos. A largura vive so aqui — a celula
                    nao repete max-w, que antes disputava com este valor. */}
                <colgroup>
                  <col style={{ width: '34px' }} />{/* seleção */}
                  <col style={{ width: '150px' }} />{/* descrição */}
                  <col style={{ width: '72px' }} />{/* tipo */}
                  <col style={{ width: '86px' }} />{/* vencimento */}
                  <col style={{ width: '86px' }} />{/* data compra */}
                  <col style={{ width: '116px' }} />{/* categoria */}
                  {mostrarAutor && <col style={{ width: '80px' }} />}
                  <col style={{ width: '104px' }} />{/* pagamento */}
                  <col style={{ width: '86px' }} />{/* data pagamento */}
                  <col style={{ width: '74px' }} />{/* status */}
                  <col style={{ width: '104px' }} />{/* valor */}
                  {isEmpresa && <col style={{ width: '64px' }} />}
                  <col style={{ width: '58px' }} />{/* anexos */}
                  <col style={{ width: '104px' }} />{/* ações */}
                </colgroup>
                {/* sticky: o corpo rola dentro do container e o cabecalho
                    permanece. Precisa de fundo opaco para as linhas nao
                    aparecerem por tras ao passar. */}
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-center">
                    <th className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        disabled={mesFechado || unpaidFiltered.length === 0}
                        title="Selecionar todas não pagas"
                        className="rounded accent-[#0EC4D8] cursor-pointer disabled:opacity-40"
                      />
                    </th>
                    <th className={TH_CLASS}>Descrição</th>
                    <th className={TH_CLASS}>Tipo</th>
                    <th className={TH_CLASS}>Vencimento</th>
                    <th className={TH_CLASS}>Data compra</th>
                    <th className={TH_CLASS}>Categoria</th>
                    {mostrarAutor && <th className={TH_CLASS}>Quem lançou</th>}
                    <th className={TH_CLASS}>Pagamento</th>
                    {/* Data de pagamento ganhou coluna propria: ja existia filtro
                        por ela, mas o dado vivia como texto secundario dentro de
                        Vencimento, sem ser ordenavel nem legivel. */}
                    <th className={TH_CLASS}>Data pagamento</th>
                    <th className={TH_CLASS}>Status</th>
                    <th className={TH_CLASS}>Valor</th>
                    {isEmpresa && <th className={TH_CLASS}>NF</th>}
                    <th className={TH_CLASS}>Anexos</th>
                    <th className={TH_CLASS}>Ações</th>
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
                      <td className="px-2 py-1.5 text-center">
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

                      {/* Descrição — peso normal: o negrito competia com o valor
                          sem que a descricao fosse mais importante que ele. */}
                      <td className={TD_CLASS}>
                        <p className={['truncate text-xs', item.pago ? 'text-slate-400' : 'text-slate-600 dark:text-slate-300'].join(' ')}>
                          {item.descricao}
                        </p>
                        {item.observacoes && (
                          <p className={['truncate', SECONDARY_CLASS].join(' ')}>{item.observacoes}</p>
                        )}
                      </td>

                      {/* Tipo */}
                      <td className={TD_CLASS}>
                        <TipoBadge item={item} />
                      </td>

                      {/* Vencimento — so a data; o "pago em" virou coluna. */}
                      <td className={[TD_CLASS, 'whitespace-nowrap text-xs text-slate-600 dark:text-slate-300'].join(' ')}>
                        {formatDate(item.dataVencimento)}
                      </td>

                      {/* Data compra */}
                      <td className={[TD_CLASS, 'whitespace-nowrap text-xs text-slate-500 dark:text-slate-400'].join(' ')}>
                        {item.dataCompra ? formatDate(item.dataCompra) : <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>

                      {/* Categoria — texto com hierarquia em vez de chip. A cor da
                          categoria nao e usada porque nenhuma tela permite
                          escolhe-la: todas nascem no mesmo azul padrao. */}
                      <td className={[TD_CLASS, 'text-xs text-slate-600 dark:text-slate-300'].join(' ')}>
                        {item.categoriaPai && (
                          <span className={SECONDARY_CLASS}>{item.categoriaPai} › </span>
                        )}
                        <span className="truncate">{item.categoria}</span>
                      </td>

                      {/* Quem lancou: so aparece quando ha mais de uma pessoa
                          lancando na conta. Primeiro nome basta para distinguir. */}
                      {mostrarAutor && (
                        <td className={[TD_CLASS, 'whitespace-nowrap text-xs text-slate-500 dark:text-slate-400'].join(' ')}>
                          {getFirstName(item.autorNome)}
                        </td>
                      )}

                      {/* Pagamento */}
                      <td className={[TD_CLASS, 'text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap'].join(' ')}>
                        {getFormaLabel(item.formaPagamento)}
                        {item.cartaoNome && (
                          <span className={SECONDARY_CLASS}> · {item.cartaoNome}</span>
                        )}
                      </td>

                      {/* Data pagamento */}
                      <td className={[TD_CLASS, 'whitespace-nowrap text-xs text-slate-500 dark:text-slate-400'].join(' ')}>
                        {item.dataPagamento && item.pago
                          ? formatDate(item.dataPagamento)
                          : <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </td>

                      {/* Status */}
                      <td className={[TD_CLASS, 'whitespace-nowrap'].join(' ')}>
                        <StatusBadge item={item} />
                      </td>

                      {/* Valor — um valor so, na cor do estado. O "inicial" antes
                          aparecia mesmo igual ao final, repetindo o mesmo numero;
                          agora so a diferenca real (juros/desconto) e mostrada. */}
                      <td className={[TD_CLASS, 'whitespace-nowrap'].join(' ')}>
                        <span className={['text-xs', getStatusColor(item)].join(' ')}>
                          {formatCurrency(valorExibido(item))}
                        </span>
                        {diferencaValor(item) !== null && (
                          <p className={SECONDARY_CLASS}>{formatDiferenca(diferencaValor(item)!)}</p>
                        )}
                      </td>

                      {/* NF (empresa only) */}
                      {isEmpresa && (
                        <td className={[TD_CLASS, 'text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap'].join(' ')}>
                          {item.numeroNf ?? <span className="text-slate-300 dark:text-slate-600">—</span>}
                        </td>
                      )}

                      {/* Anexos — clipe sem capsula. O icone fica porque e ele que
                          identifica o anexo; um numero solto nao comunicaria. */}
                      <td className={TD_CLASS}>
                        {(item.anexos?.length ?? 0) > 0 ? (
                          <button
                            onClick={() => setAnexosDialog({ open: true, title: item.descricao, anexos: item.anexos! })}
                            title={`${item.anexos!.length} anexo(s)`}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-[#0EC4D8] transition"
                          >
                            <Paperclip size={11} />
                            {item.anexos!.length}
                          </button>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className={TD_CLASS}>
                        <div className="flex justify-center gap-0.5">
                          <ActionBtn
                            onClick={() => setDialog({ open: true, item })}
                            title="Editar"
                            colorClass="text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                          >
                            <Pencil size={14} />
                          </ActionBtn>
                          <ActionBtn
                            onClick={() => setPaymentModal({ open: true, item })}
                            disabled={item.pago || mesFechado || item.status === 'cancelada'}
                            title={item.status === 'cancelada' ? 'Cancelada' : item.pago ? 'Já pago' : mesFechado ? 'Mês fechado' : 'Marcar como pago'}
                            colorClass="text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                          >
                            <CircleCheck size={15} />
                          </ActionBtn>
                          <ActionBtn
                            onClick={() => handleMoverProximoMes(item)}
                            disabled={item.pago || mesFechado || item.status === 'cancelada'}
                            title={item.status === 'cancelada' ? 'Cancelada' : item.pago ? 'Já pago' : mesFechado ? 'Mês fechado' : 'Mover para próximo mês'}
                            colorClass="text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/30"
                          >
                            <ArrowRight size={14} />
                          </ActionBtn>
                          <ActionBtn
                            onClick={() => handleCancelarDespesa(item)}
                            disabled={item.status === 'cancelada' || cancelarMut.isPending}
                            title={item.status === 'cancelada' ? 'Já cancelada' : 'Cancelar'}
                            colorClass="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                          >
                            <Ban size={14} />
                          </ActionBtn>
                          <ActionBtn
                            onClick={() => handleExcluirDespesa(item)}
                            disabled={false}
                            title="Excluir"
                            colorClass="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                          >
                            <Trash2 size={14} />
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
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
      <DeleteInstallmentDialog
        open={deleteInstallmentDialog.open}
        expense={deleteInstallmentDialog.item ?? null}
        isLoading={finance.deleteExpense.isPending}
        onClose={() => setDeleteInstallmentDialog({ open: false })}
        onDeleteOne={() => {
          if (!deleteInstallmentDialog.item) return;
          finance.deleteExpense.mutate(
            { id: deleteInstallmentDialog.item.id },
            { onSuccess: () => setDeleteInstallmentDialog({ open: false }) },
          );
        }}
        onDeleteGroup={() => {
          if (!deleteInstallmentDialog.item) return;
          finance.deleteExpense.mutate(
            { id: deleteInstallmentDialog.item.id, deleteGroup: true },
            { onSuccess: () => setDeleteInstallmentDialog({ open: false }) },
          );
        }}
      />
    </>
  );
}
