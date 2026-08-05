import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Banknote, CreditCard, QrCode,
  Plus, X, Tag, Paperclip, FileText, AlertTriangle, ArrowUp, ArrowDown,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Attachment, Expense, ExpenseFormValues, FinanceDashboardData } from '../../types/finance';
import { Dialog } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Field, Input, ToggleGroup } from '../../ui/form';
import { MoneyInput } from '../../ui/MoneyInput';
import { AttachmentSection, type AttachmentSectionHandle } from '../../ui/AttachmentSection';
import { CategoryFloatingSelect } from '../../ui/CategoryFloatingSelect';
import { getRecentCategoryIds, suggestCategoryForDescription } from '../../utils/categorySuggestions';
import { calcularVencimentoFatura, proximoDiaDoMes } from '../../utils/cardDueDate';
import { fetchCategorias, fetchCartoes, saveCategoria } from '../../services/configService';
import { fetchExpenseSuggestions, type ExpenseSuggestionMatch } from '../../services/expenseSuggestionsService';
import { queryKeys } from '../../services/queryKeys';

const schema = z.object({
  descricao:       z.string().min(1, 'Informe a descrição'),
  valor_original:  z.coerce.number().min(0.01, 'Informe o valor'),
  valor_final:     z.coerce.number().min(0).optional(),
  dataCompra:      z.string().min(10, 'Informe a data da compra'),
  dataVencimentoManual: z.string().optional(),
  categoria_id:    z.coerce.number().optional(),
  cartao_id:       z.coerce.number().optional(),
  formaPagamento:  z.string().min(1),
  repeticao:       z.enum(['nao', 'parcelas', 'mensal']),
  totalParcelas:   z.coerce.number().int().min(2).max(360).optional(),
  parcelasJaPagas: z.coerce.number().int().min(0).optional(),
  diaRecorrencia:  z.coerce.number().int().min(1).max(31).optional(),
  numero_nf:       z.string().max(50).optional(),
  data_emissao_nf: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface DuplicataInfo { expense: Expense; }

const todayIso = () => new Date().toISOString().slice(0, 10);
const todayNumericDay = () => new Date().getDate();
const formatBr = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

interface Props {
  open: boolean; month: number; year: number;
  expense?: Expense; isSaving: boolean; error?: string;
  onClose: () => void;
  onSave: (items: ExpenseFormValues[]) => Promise<void>;
}

export function ExpenseDialog({ open, month, year, expense, isSaving, error, onClose, onSave }: Props) {
  const qc = useQueryClient();
  const isEmpresa = useMemo(() => localStorage.getItem('perfilAtivoTipo') === 'empresa', []);
  const isEditing = !!expense;

  const bodyRef = useRef<HTMLDivElement>(null);
  const attachmentRef = useRef<AttachmentSectionHandle>(null);
  const [anexos, setAnexos] = useState<Attachment[]>([]);

  const [batch, setBatch] = useState<ExpenseFormValues[]>([]);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  const [showCatForm, setShowCatForm] = useState<string | null>(null);
  const [categoriaSugestao, setCategoriaSugestao] = useState<{ id: number; nome: string } | null>(null);
  const [duplicataInfo, setDuplicataInfo] = useState<DuplicataInfo | null>(null);
  const [showValorFinal, setShowValorFinal] = useState(false);
  const [vencimentoManualAberto, setVencimentoManualAberto] = useState(false);
  const [methodTouched, setMethodTouched] = useState(false);

  const categorias = useQuery({ queryKey: queryKeys.categorias, queryFn: fetchCategorias });
  const cartoes    = useQuery({ queryKey: queryKeys.cartoes,    queryFn: fetchCartoes });

  const criarCatMut = useMutation({
    mutationFn: (nome: string) => saveCategoria({ nome }),
    onSuccess: (cat) => {
      qc.invalidateQueries({ queryKey: queryKeys.categorias });
      form.setValue('categoria_id', cat.id as any);
      setShowCatForm(null);
    },
  });

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      descricao: '', valor_original: '' as unknown as number, valor_final: undefined,
      dataCompra: todayIso(), dataVencimentoManual: undefined,
      categoria_id: undefined, cartao_id: undefined,
      formaPagamento: 'pix', repeticao: 'nao',
      totalParcelas: 2, parcelasJaPagas: 0, diaRecorrencia: todayNumericDay(),
      numero_nf: undefined, data_emissao_nf: undefined,
    },
  });

  const descricaoWatch     = useWatch({ control: form.control, name: 'descricao' });
  const valorOriginalWatch = useWatch({ control: form.control, name: 'valor_original' });
  const valorFinalWatch    = useWatch({ control: form.control, name: 'valor_final' });
  const formaPagamento     = useWatch({ control: form.control, name: 'formaPagamento' });
  const cartaoId           = useWatch({ control: form.control, name: 'cartao_id' });
  const categoriaId        = useWatch({ control: form.control, name: 'categoria_id' });
  const dataCompra         = useWatch({ control: form.control, name: 'dataCompra' });
  const dataVencimentoManual = useWatch({ control: form.control, name: 'dataVencimentoManual' });
  const repeticao          = useWatch({ control: form.control, name: 'repeticao' });
  const totalParcelas      = useWatch({ control: form.control, name: 'totalParcelas' });
  const parcelasJaPagas    = useWatch({ control: form.control, name: 'parcelasJaPagas' });
  const diaRecorrencia     = useWatch({ control: form.control, name: 'diaRecorrencia' });

  const isCredito = formaPagamento === 'credito';
  const isDebito  = formaPagamento === 'debito';
  const efetivoFinal = valorFinalWatch ?? valorOriginalWatch ?? 0;
  const jurosCalculado = Math.max(0, efetivoFinal - (valorOriginalWatch ?? 0));
  const descontoCalculado = Math.max(0, (valorOriginalWatch ?? 0) - efetivoFinal);

  const cats = useMemo(() => (categorias.data ?? []).filter((c) => c.ativo), [categorias.data]);
  const activeCards = useMemo(() => (cartoes.data ?? []).filter((c) => c.ativo), [cartoes.data]);
  const selectedCard = activeCards.find((c) => c.id === cartaoId) ?? activeCards[0];

  const cachedExpenses = useMemo(() => {
    const allCached = qc.getQueriesData<FinanceDashboardData>({ queryKey: ['dashboard'] });
    return allCached.flatMap(([, data]) => data?.expenses ?? []);
  }, [qc, month, year, categorias.data]);
  const featuredCategoryIds = useMemo(
    () => getRecentCategoryIds(cachedExpenses, cats),
    [cachedExpenses, cats],
  );

  // ── Sugestão de categoria por palavra-chave/histórico local ──────────
  useEffect(() => {
    if ((descricaoWatch?.length ?? 0) < 3 || categoriaId) {
      setCategoriaSugestao(null);
      return;
    }
    const timer = setTimeout(() => {
      const suggestion = suggestCategoryForDescription(descricaoWatch, cats, cachedExpenses, expense?.id);
      setCategoriaSugestao(suggestion ? { id: suggestion.id, nome: suggestion.name } : null);
    }, 250);
    return () => clearTimeout(timer);
  }, [descricaoWatch, categoriaId, cats, cachedExpenses, expense?.id]);

  // ── Autocomplete de descrição + forma de pagamento sugerida (histórico real) ──
  const [debouncedDescricao, setDebouncedDescricao] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedDescricao(descricaoWatch ?? ''), 220);
    return () => clearTimeout(timer);
  }, [descricaoWatch]);

  const suggestionsQuery = useQuery({
    queryKey: queryKeys.expenseSuggestions(debouncedDescricao, categoriaId),
    queryFn: () => fetchExpenseSuggestions(debouncedDescricao, categoriaId),
    enabled: debouncedDescricao.trim().length >= 2,
  });

  const [acHidden, setAcHidden] = useState(false);
  const [acIndex, setAcIndex] = useState(-1);
  const acMatches: ExpenseSuggestionMatch[] = acHidden ? [] : (suggestionsQuery.data?.matches ?? [])
    .filter((m) => m.descricao.toLowerCase() !== (descricaoWatch ?? '').toLowerCase());
  const acOpen = acMatches.length > 0 && (descricaoWatch?.length ?? 0) >= 2;

  const applySuggestionMatch = (match: ExpenseSuggestionMatch) => {
    form.setValue('descricao', match.descricao);
    if (!valorOriginalWatch) form.setValue('valor_original', match.valorFinal);
    if (match.categoriaId && !categoriaId) form.setValue('categoria_id', match.categoriaId as any);
    form.setValue('formaPagamento', match.formaPagamento);
    setMethodTouched(true);
    setAcHidden(true);
    setAcIndex(-1);
  };

  // Aplica forma de pagamento sugerida por frequência (categoria → geral → PIX), sem travar escolha manual.
  useEffect(() => {
    if (methodTouched) return;
    const sugerida = suggestionsQuery.data?.formaPagamentoSugerida;
    if (sugerida) form.setValue('formaPagamento', sugerida);
  }, [suggestionsQuery.data?.formaPagamentoSugerida, methodTouched]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (methodTouched) return;
    const cartaoSugerido = suggestionsQuery.data?.cartaoSugerido;
    if (cartaoSugerido) form.setValue('cartao_id', cartaoSugerido.id as any);
  }, [suggestionsQuery.data?.cartaoSugerido, methodTouched]); // eslint-disable-line react-hooks/exhaustive-deps

  const ultimoValorPago = suggestionsQuery.data?.matches.find(
    (m) => m.descricao.toLowerCase() === (descricaoWatch ?? '').toLowerCase(),
  )?.valorFinal;

  const paymentOptions = [
    { value: 'pix',      label: 'PIX',      icon: <QrCode size={13} /> },
    { value: 'dinheiro', label: 'Dinheiro', icon: <Banknote size={13} /> },
    { value: 'debito',   label: 'Débito',   icon: <CreditCard size={13} /> },
    { value: 'credito',  label: 'Crédito',  icon: <CreditCard size={13} /> },
  ];

  const handlePaymentSelect = (v: string) => {
    form.setValue('formaPagamento', v);
    setMethodTouched(true);
  };

  // ── Reset ao abrir/fechar ─────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setBatch([]);
      setAnexos([]);
      setShowCatForm(null);
      setCategoriaSugestao(null);
      setDuplicataInfo(null);
      setShowValorFinal(false);
      setVencimentoManualAberto(false);
      setMethodTouched(false);
      setSavedMessage('');
      setAcHidden(false);
      return;
    }
    setAnexos(expense?.anexos ?? []);
    const vOrig = expense?.valorOriginal ?? undefined;
    const vFinalDb = expense?.valorFinalTotal;
    setShowValorFinal(!!(vFinalDb && vFinalDb !== vOrig));
    setMethodTouched(true); // ao editar, não sobrescrever forma de pagamento já escolhida
    form.reset({
      descricao:       expense?.descricao ?? '',
      valor_original:  vOrig ?? '' as unknown as number,
      valor_final:     (vFinalDb && vFinalDb !== vOrig) ? vFinalDb : undefined,
      dataCompra:      expense?.dataCompra ?? todayIso(),
      dataVencimentoManual: expense?.dataVencimento,
      categoria_id:    undefined,
      cartao_id:       undefined,
      formaPagamento:  expense?.formaPagamento ?? 'pix',
      repeticao:       expense?.parcelado ? 'parcelas' : expense?.recorrente ? 'mensal' : 'nao',
      totalParcelas:   2, parcelasJaPagas: 0, diaRecorrencia: todayNumericDay(),
      numero_nf:       expense?.numeroNf ?? undefined,
      data_emissao_nf: expense?.dataEmissaoNf ?? undefined,
    });
  }, [expense, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reduzir o número de parcelas reajusta "já pagas" para caber no novo limite.
  useEffect(() => {
    const max = Math.max((totalParcelas ?? 2) - 1, 0);
    if ((parcelasJaPagas ?? 0) > max) form.setValue('parcelasJaPagas', max);
  }, [totalParcelas]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Vencimento e status derivados ─────────────────────────────────────
  const vencimentoDerivado = useMemo(() => {
    if (vencimentoManualAberto && dataVencimentoManual) {
      return { data: dataVencimentoManual, texto: `Vence ${formatBr(dataVencimentoManual)} · data manual` };
    }
    if (isCredito && selectedCard) {
      const { dataVencimento } = calcularVencimentoFatura(selectedCard, dataCompra || todayIso());
      const prefixo = repeticao === 'nao' ? 'Vence' : 'Primeira vence';
      return { data: dataVencimento, texto: `${prefixo} ${formatBr(dataVencimento)} · fatura ${selectedCard.nome}` };
    }
    const base = dataCompra || todayIso();
    if (repeticao === 'nao') {
      const isFuture = base > todayIso();
      return {
        data: base,
        texto: isFuture ? `Vence ${formatBr(base)}` : 'Pago na hora',
      };
    }
    if (repeticao === 'mensal' && diaRecorrencia) {
      const primeiraOcorrencia = proximoDiaDoMes(base, diaRecorrencia);
      return { data: primeiraOcorrencia, texto: `Primeira vence ${formatBr(primeiraOcorrencia)}` };
    }
    return { data: base, texto: `Primeira vence ${formatBr(base)}` };
  }, [vencimentoManualAberto, dataVencimentoManual, isCredito, selectedCard, dataCompra, repeticao, diaRecorrencia]);

  const statusDerivado = useMemo(() => {
    if (isCredito) return { label: 'Entra na fatura', className: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800' };
    const isFuture = vencimentoDerivado.data > todayIso();
    if (isFuture) return { label: 'Agendado', className: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800' };
    return { label: 'Pago', className: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' };
  }, [isCredito, vencimentoDerivado.data]);

  const pagoDerivado = statusDerivado.label === 'Pago';

  const valorPorParcela = repeticao === 'parcelas' && (totalParcelas ?? 0) >= 2 && efetivoFinal > 0
    ? efetivoFinal / (totalParcelas ?? 1)
    : 0;

  const proximaParcelaVence = useMemo(() => {
    if (repeticao !== 'parcelas') return null;
    const base = vencimentoDerivado.data;
    const d = new Date(base + 'T12:00:00');
    d.setMonth(d.getMonth() + (parcelasJaPagas ?? 0));
    return formatBr(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }, [repeticao, vencimentoDerivado.data, parcelasJaPagas]);

  const mensalTexto = isCredito
    ? `todo mês na fatura ${selectedCard?.nome ?? 'do cartão'}, até cancelar`
    : `todo dia ${diaRecorrencia ?? '?'}, até cancelar`;

  const toFormValues = (data: FormData, anexosArr: Attachment[] = []): ExpenseFormValues => ({
    descricao:       data.descricao,
    valor_original:  data.valor_original,
    valor_final:     showValorFinal ? data.valor_final : undefined,
    dataVencimento:  vencimentoDerivado.data,
    dataCompra:      data.dataCompra,
    categoria_id:    data.categoria_id ? Number(data.categoria_id) : undefined,
    cartao_id:       (isCredito || isDebito) && data.cartao_id ? Number(data.cartao_id) : undefined,
    formaPagamento:  data.formaPagamento,
    pago:            pagoDerivado,
    recorrente:      repeticao === 'mensal',
    recorrenciaMensal: repeticao === 'mensal',
    parcelado:       repeticao === 'parcelas',
    total_parcelas:  repeticao === 'parcelas' ? data.totalParcelas : undefined,
    parcelasJaPagas: repeticao === 'parcelas' ? data.parcelasJaPagas : undefined,
    numero_nf:       isEmpresa ? (data.numero_nf ?? undefined) : undefined,
    data_emissao_nf: isEmpresa ? (data.data_emissao_nf ?? undefined) : undefined,
    tipo_despesa:    'opex',
    anexos:          anexosArr,
  });

  const doSave = async (data: FormData) => {
    setIsSavingAll(true);
    try {
      const items = [...batch, toFormValues(data, anexos)];
      await onSave(items);
      setBatch([]);
      setAnexos([]);
      setDuplicataInfo(null);
      setSavedMessage(items.length > 1 ? `✓ ${items.length} despesas registradas` : '✓ Despesa registrada');
      form.reset({
        descricao: '', valor_original: '' as unknown as number, valor_final: undefined,
        dataCompra: data.dataCompra, dataVencimentoManual: undefined,
        categoria_id: undefined, cartao_id: data.cartao_id,
        formaPagamento: data.formaPagamento, repeticao: 'nao',
        totalParcelas: 2, parcelasJaPagas: 0, diaRecorrencia: todayNumericDay(),
        numero_nf: undefined, data_emissao_nf: undefined,
      });
      setShowValorFinal(false);
      setTimeout(() => setSavedMessage(''), 2600);
    } finally {
      setIsSavingAll(false);
    }
  };

  const handleAddToBatch = () => {
    const data = form.getValues();
    if (!data.descricao.trim() || !data.valor_original) return;
    setBatch((prev) => [...prev, toFormValues(data, anexos)]);
    setAnexos([]);
    form.reset({
      descricao: '', valor_original: '' as unknown as number, valor_final: undefined,
      dataCompra: data.dataCompra, dataVencimentoManual: undefined,
      categoria_id: undefined, cartao_id: data.cartao_id,
      formaPagamento: data.formaPagamento, repeticao: 'nao',
      totalParcelas: 2, parcelasJaPagas: 0, diaRecorrencia: todayNumericDay(),
      numero_nf: undefined, data_emissao_nf: undefined,
    });
    setShowValorFinal(false);
    setTimeout(() => form.setFocus('descricao'), 50);
  };

  // Detecção de duplicata: mesma descrição + valor final + forma de pagamento nos últimos 7 dias — aviso não bloqueante.
  useEffect(() => {
    const desc = descricaoWatch?.trim();
    if (!desc || !efetivoFinal) { setDuplicataInfo(null); return; }
    const seteAtras = new Date();
    seteAtras.setDate(seteAtras.getDate() - 7);
    const allCached = qc.getQueriesData<FinanceDashboardData>({ queryKey: ['dashboard'] });
    const allExpenses = allCached.flatMap(([, d]) => d?.expenses ?? []);
    const dup = allExpenses.find(
      (e) =>
        e.id !== expense?.id &&
        e.descricao.toLowerCase() === desc.toLowerCase() &&
        e.valorFinal === efetivoFinal &&
        e.formaPagamento === formaPagamento &&
        new Date(e.dataVencimento) >= seteAtras,
    );
    setDuplicataInfo(dup ? { expense: dup } : null);
  }, [descricaoWatch, efetivoFinal, formaPagamento, qc, expense?.id]);

  const handleSubmit = form.handleSubmit((data) => doSave(data));

  const hasBatch = batch.length > 0;
  const batchTotal = batch.reduce((sum, item) => sum + (item.valor_original ?? 0), 0);
  const podeSalvar = !!descricaoWatch?.trim() && !!valorOriginalWatch;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (acOpen) { setAcHidden(true); return; }
      return;
    }
    if (acOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      setAcIndex((prev) => Math.max(0, Math.min(acMatches.length - 1, prev + delta)));
      return;
    }
    if (acOpen && e.key === 'Enter' && acIndex >= 0) {
      e.preventDefault();
      applySuggestionMatch(acMatches[acIndex]!);
      return;
    }
    if (e.key === 'Tab' && categoriaSugestao && !categoriaId) {
      e.preventDefault();
      form.setValue('categoria_id', categoriaSugestao.id as any);
      setCategoriaSugestao(null);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !acOpen) {
      e.preventDefault();
      handleSubmit();
      return;
    }
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      handleAddToBatch();
    }
  };

  return (
    <Dialog open={open} title={expense ? 'Editar despesa' : 'Nova despesa'} description="Registre uma saída financeira" onClose={onClose} size="lg" scrollBody={false}>
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
        <div ref={bodyRef} className="scrollbar-thin flex-1 min-h-0 overflow-y-auto px-1 py-1">
          <div className="grid gap-3">

            {/* ── Bloco 1: Identificação ─────────────────────────────── */}
            <div className="grid gap-2 rounded-2xl border border-slate-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/40">
              <div className="flex items-end gap-2">
                <div className="relative flex-1">
                  <Field label="Descrição" required error={form.formState.errors.descricao?.message}>
                    <Input
                      {...form.register('descricao', {
                        onChange: () => setAcHidden(false),
                      })}
                      placeholder="Ex: Conta de luz"
                      autoFocus
                      autoComplete="off"
                    />
                  </Field>
                  {acOpen && (
                    <div className="absolute left-0 top-full z-40 mt-1 w-full rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-slate-600 dark:bg-slate-800">
                      {acMatches.map((match, i) => (
                        <button
                          key={`${match.descricao}-${i}`}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => applySuggestionMatch(match)}
                          className={[
                            'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
                            i === acIndex ? 'bg-brand-50 dark:bg-brand-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-700',
                          ].join(' ')}
                        >
                          <span className="truncate font-medium text-slate-700 dark:text-slate-200">{match.descricao}</span>
                          <span className="shrink-0 text-xs text-slate-400">
                            {match.valorFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => attachmentRef.current?.openPicker()}
                  title="Anexar comprovante"
                  className={[
                    'mb-[1px] flex h-10 items-center gap-1.5 rounded-2xl border px-3 text-xs font-semibold transition-all shrink-0',
                    anexos.length > 0
                      ? 'border-brand-300 bg-brand-50 text-brand-600 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-400'
                      : 'border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600 dark:border-slate-600 dark:text-slate-500',
                  ].join(' ')}
                >
                  <Paperclip size={13} />
                  {anexos.length > 0 && <span>{anexos.length}</span>}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 min-h-[20px]">
                <span className="text-xs text-slate-400">Anexar comprovante</span>
                {categoriaSugestao && !categoriaId && (
                  <button
                    type="button"
                    onClick={() => { form.setValue('categoria_id', categoriaSugestao.id as any); setCategoriaSugestao(null); }}
                    className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 hover:bg-brand-100 transition dark:border-brand-800 dark:bg-brand-900/20 dark:text-brand-400"
                  >
                    <Tag size={11} /> {categoriaSugestao.nome} · Tab aceita
                  </button>
                )}
              </div>

              <div className={anexos.length > 0 ? 'rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50' : ''}>
                <AttachmentSection ref={attachmentRef} value={anexos} onChange={setAnexos} hideTrigger />
              </div>

              <Field label="Categoria" hint="Opcional">
                <Controller
                  control={form.control}
                  name="categoria_id"
                  render={({ field }) => (
                    <CategoryFloatingSelect
                      categories={cats}
                      value={field.value ? Number(field.value) : undefined}
                      onChange={(id) => { field.onChange(id ?? undefined); if (id) setCategoriaSugestao(null); }}
                      onCreateNew={(nome) => setShowCatForm(nome)}
                      featuredIds={featuredCategoryIds}
                      scrollContainerRef={bodyRef}
                    />
                  )}
                />
                {showCatForm !== null && (
                  <div className="mt-2 flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 p-2 dark:border-brand-800 dark:bg-brand-900/20">
                    <Tag size={13} className="shrink-0 text-brand-400" />
                    <input
                      type="text"
                      defaultValue={showCatForm}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); const v = e.currentTarget.value.trim(); if (v) criarCatMut.mutate(v); }
                      }}
                      id="nova-categoria-input"
                      className="flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
                    />
                    <button
                      type="button"
                      disabled={criarCatMut.isPending}
                      onClick={() => {
                        const el = document.getElementById('nova-categoria-input') as HTMLInputElement | null;
                        const v = el?.value.trim();
                        if (v) criarCatMut.mutate(v);
                      }}
                      className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50 transition whitespace-nowrap"
                    >
                      {criarCatMut.isPending ? '...' : 'Criar'}
                    </button>
                    <button type="button" onClick={() => setShowCatForm(null)} className="text-slate-400 hover:text-red-500 transition">
                      <X size={14} />
                    </button>
                  </div>
                )}
              </Field>
            </div>

            {/* ── Bloco 2: Valores ───────────────────────────────────── */}
            <div className="grid gap-2 rounded-2xl border border-slate-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/40">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Valor" required error={form.formState.errors.valor_original?.message}>
                  <Controller
                    control={form.control}
                    name="valor_original"
                    render={({ field }) => (
                      <MoneyInput value={field.value || undefined} onChange={field.onChange} />
                    )}
                  />
                  <p className="text-xs text-slate-400">
                    {ultimoValorPago
                      ? `Última vez você pagou ${ultimoValorPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
                      : 'Preço base da compra'}
                  </p>
                </Field>

                <Field label={showValorFinal ? 'Valor final' : ''}>
                  {showValorFinal ? (
                    <>
                      <div className="flex items-center justify-between">
                        <Controller
                          control={form.control}
                          name="valor_final"
                          render={({ field }) => (
                            <MoneyInput value={field.value} onChange={field.onChange} />
                          )}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => { setShowValorFinal(false); form.setValue('valor_final', undefined); }}
                        className="text-xs text-slate-400 hover:text-red-500 transition"
                      >
                        remover
                      </button>
                      {jurosCalculado > 0 && (
                        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                          <ArrowUp size={11} /> + {jurosCalculado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de juros
                        </span>
                      )}
                      {descontoCalculado > 0 && (
                        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
                          <ArrowDown size={11} /> − {descontoCalculado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de desconto
                        </span>
                      )}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowValorFinal(true)}
                      className="flex h-10 items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-600 transition dark:text-slate-400"
                    >
                      <Plus size={14} /> Teve juros ou desconto
                    </button>
                  )}
                </Field>
              </div>
            </div>

            {/* ── Bloco 3: Pagamento ─────────────────────────────────── */}
            <div className="grid gap-2 rounded-2xl border border-slate-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/40">
              <Field label="Forma de pagamento">
                <ToggleGroup value={formaPagamento} options={paymentOptions} onChange={handlePaymentSelect} />
              </Field>

              {(isCredito || isDebito) && (
                <div className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/30">
                  {activeCards.length > 1 ? (
                    <Controller
                      control={form.control}
                      name="cartao_id"
                      render={({ field }) => (
                        <ToggleGroup
                          value={String(field.value ?? selectedCard?.id ?? '')}
                          options={activeCards.map((c) => ({ value: String(c.id), label: c.nome }))}
                          onChange={(v) => { field.onChange(Number(v)); setMethodTouched(true); }}
                        />
                      )}
                    />
                  ) : (
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{selectedCard?.nome ?? 'Nenhum cartão cadastrado'}</p>
                  )}
                  {selectedCard && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {isCredito
                        ? `Limite disponível: ${((selectedCard.limite ?? 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
                        : 'Desconta da conta vinculada'}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ── Bloco 4: Recorrência e data ────────────────────────── */}
            <div className="grid gap-2 rounded-2xl border border-slate-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/40">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Data da compra">
                  <Input {...form.register('dataCompra')} type="date" />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400">{vencimentoDerivado.texto}</span>
                    <button
                      type="button"
                      onClick={() => setVencimentoManualAberto((v) => !v)}
                      className="text-xs font-semibold text-brand-600 hover:text-brand-700 transition dark:text-brand-400"
                    >
                      {vencimentoManualAberto ? 'usar automática' : 'alterar'}
                    </button>
                    <span className={['rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', statusDerivado.className].join(' ')}>
                      {statusDerivado.label}
                    </span>
                  </div>
                  {vencimentoManualAberto && (
                    <Input {...form.register('dataVencimentoManual')} type="date" />
                  )}
                </Field>

                <Field label="Isso se repete?">
                  <ToggleGroup
                    value={repeticao}
                    options={[
                      { value: 'nao', label: 'Não repete' },
                      { value: 'parcelas', label: 'Parcelas' },
                      { value: 'mensal', label: 'Todo mês' },
                    ]}
                    onChange={(v) => form.setValue('repeticao', v as FormData['repeticao'])}
                  />
                </Field>
              </div>

              {repeticao === 'parcelas' && (
                <div className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/30">
                  <div className="flex flex-wrap items-center gap-3">
                    <Field label="Quantas parcelas">
                      <Input {...form.register('totalParcelas')} type="text" inputMode="numeric" className="w-20 text-center" />
                    </Field>
                    <Field label="Já pagas">
                      <Input {...form.register('parcelasJaPagas')} type="text" inputMode="numeric" className="w-20 text-center" />
                    </Field>
                    {valorPorParcela > 0 && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {totalParcelas}x de {valorPorParcela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        {(parcelasJaPagas ?? 0) > 0 && ` · ${parcelasJaPagas} de ${totalParcelas} pagas`}
                        {proximaParcelaVence && ` · próxima vence ${proximaParcelaVence}`}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {repeticao === 'mensal' && (
                <div className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/30">
                  {!isCredito && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-500 dark:text-slate-400">Todo dia</span>
                      <Input {...form.register('diaRecorrencia')} type="text" inputMode="numeric" className="w-20 text-center" />
                    </div>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400">{mensalTexto}</p>
                </div>
              )}
            </div>

            {isEmpresa && (
              <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/40">
                <div className="col-span-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                  <FileText size={12} /> Nota Fiscal
                </div>
                <Field label="Número da NF">
                  <Input {...form.register('numero_nf')} placeholder="Ex: 000123456" />
                </Field>
                <Field label="Data de emissão">
                  <Input {...form.register('data_emissao_nf')} type="date" />
                </Field>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
          </div>
        </div>

        {/* ── Rodapé fixo ──────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-slate-100 pt-3 dark:border-slate-700">
          {hasBatch && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-slate-500">
                NO LOTE · {batch.length} · {batchTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
              {batch.map((item, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-900/20 dark:text-brand-400">
                  {item.descricao}
                  <button type="button" onClick={() => setBatch((prev) => prev.filter((_, j) => j !== i))} className="text-brand-400 hover:text-red-500 transition">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {duplicataInfo && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
              <AlertTriangle size={13} className="shrink-0" />
              Você já lançou isso em {formatBr(duplicataInfo.expense.dataVencimento)} — é outra?
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <p className={savedMessage ? 'text-xs font-semibold text-green-600' : 'text-xs text-slate-400'}>
              {savedMessage || (podeSalvar || hasBatch ? '' : 'Preencha descrição e valor para registrar.')}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleAddToBatch}
                disabled={!podeSalvar}
                className="rounded-xl px-3 py-2 text-xs font-semibold text-brand-600 hover:bg-brand-50 disabled:cursor-not-allowed disabled:text-slate-300 transition dark:text-brand-400 dark:hover:bg-brand-900/20"
              >
                + Adicionar ao lote
              </button>
              <Button type="submit" disabled={(!podeSalvar && !hasBatch) || isSaving || isSavingAll}>
                {isSaving || isSavingAll
                  ? 'Salvando...'
                  : isEditing
                    ? 'Salvar alterações'
                    : hasBatch
                      ? `Salvar ${batch.length + (podeSalvar ? 1 : 0)} despesas`
                      : 'Registrar despesa'}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
