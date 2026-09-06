import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, Controller, useWatch, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Banknote, CreditCard, Paperclip, QrCode, Repeat2, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Attachment, Expense, ExpenseFormValues, FinanceDashboardData } from '../../types/finance';
import { AttachmentSection, type AttachmentSectionHandle } from '../../ui/AttachmentSection';
import { CategoryFloatingSelect } from '../../ui/CategoryFloatingSelect';
import { Dialog } from '../../ui/dialog';
import {
  C, labelStyle, fieldInputStyle, numericInputStyle,
  panelStyle, chipStyle, MoneyField, MoneyFieldSmall,
} from '../../ui/dialogFormTokens';
import { getRecentCategoryIds, suggestCategoryForDescription } from '../../utils/categorySuggestions';
import { calcularVencimentoFatura, proximoDiaDoMes } from '../../utils/cardDueDate';
import { fetchCategorias, fetchCartoes, saveCategoria } from '../../services/configService';
import { fetchCardLimits } from '../../services/cardLimitsService';
import { fetchExpenseSuggestions, type ExpenseSuggestionMatch } from '../../services/expenseSuggestionsService';
import { queryKeys } from '../../services/queryKeys';
import { getLocalTodayIso } from '../../utils/date';
import { formatCurrency } from './formatters';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { GUIDE_LAYER_MODAL } from '../../context/FirstAccessGuideContext';

// Quantas despesas do lote aparecem sem expandir. As demais ficam atras do
// link, para a lista nao empurrar o formulario para fora da vista.
const LOTE_VISIVEL_PADRAO = 2;

const schema = z.object({
  descricao:       z.string().min(1, 'Informe a descrição'),
  valor_original:  z.coerce.number().min(0.01, 'Informe o valor'),
  valor_pago:      z.coerce.number().min(0).optional(),
  precoAVista:     z.coerce.number().min(0).optional(),
  dataCompra:      z.string().min(10, 'Informe a data da compra'),
  dataVencimentoManual: z.string().optional(),
  categoria_id:    z.coerce.number().optional(),
  cartao_id:       z.coerce.number().optional(),
  formaPagamento:  z.string().min(1),
  pago:            z.boolean(),
  repeticao:       z.enum(['nao', 'parcelas', 'mensal']),
  totalParcelas:   z.coerce.number().int().min(2).max(360).optional(),
  parcelasJaPagas: z.coerce.number().int().min(0).optional(),
  diaRecorrencia:  z.coerce.number().int().min(1).max(31).optional(),
  numero_nf:       z.string().max(50).optional(),
  data_emissao_nf: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface DuplicataInfo { expense: Expense; }

const todayIso = getLocalTodayIso;
const todayNumericDay = () => new Date().getDate();
const formatBr = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

interface Props {
  open: boolean; month: number; year: number;
  expense?: Expense; isSaving: boolean; error?: string;
  presetDate?: string;
  onClose: () => void;
  onSave: (items: ExpenseFormValues[]) => Promise<void>;
}

export function ExpenseDialog({ open, month, year, expense, isSaving, error, presetDate, onClose, onSave }: Props) {
  const qc = useQueryClient();
  const isEmpresa = useMemo(() => localStorage.getItem('contaAtivaTipo') === 'empresa', []);
  const isEditing = !!expense;

  const bodyRef = useRef<HTMLDivElement>(null);
  const attachmentRef = useRef<AttachmentSectionHandle>(null);
  const [anexos, setAnexos] = useState<Attachment[]>([]);

  const [batch, setBatch] = useState<ExpenseFormValues[]>([]);
  const [loteExpandido, setLoteExpandido] = useState(false);
  // Indice do item do lote aberto no formulario. Enquanto aberto, o item sai
  // do batch e ocupa o form — por isso nao pode ser salvo em duplicidade.
  const [itemAberto, setItemAberto] = useState<number | null>(null);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  const [showCatForm, setShowCatForm] = useState<string | null>(null);
  const [categoriaSugestao, setCategoriaSugestao] = useState<{ id: number; nome: string } | null>(null);
  const [duplicataInfo, setDuplicataInfo] = useState<DuplicataInfo | null>(null);
  const [nfAberta, setNfAberta] = useState(false);
  const [valorInputMode, setValorInputMode] = useState<'parcela' | 'avista'>('parcela');
  const [methodTouched, setMethodTouched] = useState(false);

  const categorias = useQuery({ queryKey: queryKeys.categorias, queryFn: fetchCategorias });
  const cartoes    = useQuery({ queryKey: queryKeys.cartoes,    queryFn: fetchCartoes });
  const cardLimits = useQuery({ queryKey: queryKeys.cardLimits, queryFn: fetchCardLimits, staleTime: 60_000 });
  const repetitionGuide = useFirstAccessGuide('despesas:toggles-tipo-v1', {
    enabled: open && !isEditing,
    layer: GUIDE_LAYER_MODAL,
  });

  const criarCatMut = useMutation({
    mutationFn: (nome: string) => saveCategoria({ nome }),
    onSuccess: (cat) => {
      qc.invalidateQueries({ queryKey: queryKeys.categorias });
      form.setValue('categoria_id', cat.id as any);
      setShowCatForm(null);
    },
  });

  const form = useForm<FormData>({
    resolver: zodResolver(schema) as Resolver<FormData>,
    defaultValues: {
      descricao: '', valor_original: '' as unknown as number, valor_pago: undefined, precoAVista: undefined,
      dataCompra: todayIso(), dataVencimentoManual: undefined,
      categoria_id: undefined, cartao_id: undefined,
      formaPagamento: '', pago: false, repeticao: 'nao',
      totalParcelas: 2, parcelasJaPagas: 0, diaRecorrencia: todayNumericDay(),
      numero_nf: undefined, data_emissao_nf: undefined,
    },
  });

  const descricaoWatch     = useWatch({ control: form.control, name: 'descricao' });
  const valorOriginalWatch = useWatch({ control: form.control, name: 'valor_original' });
  const valorPagoWatch     = useWatch({ control: form.control, name: 'valor_pago' });
  const pagoWatch          = useWatch({ control: form.control, name: 'pago' });
  const precoAVistaWatch   = useWatch({ control: form.control, name: 'precoAVista' });
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
  const valorDigitado = valorOriginalWatch ?? 0;

  // Modo "à vista": o campo de Valor edita precoAVista; valor_original (o que é salvo) é derivado dividindo pelo nº de parcelas.
  useEffect(() => {
    if (valorInputMode !== 'avista' || repeticao !== 'parcelas') return;
    const n = totalParcelas ?? 1;
    const parcela = precoAVistaWatch && n > 0 ? Math.round((precoAVistaWatch / n) * 100) / 100 : 0;
    form.setValue('valor_original', parcela || ('' as unknown as number));
  }, [valorInputMode, repeticao, precoAVistaWatch, totalParcelas]); // eslint-disable-line react-hooks/exhaustive-deps

  // Desmarcar "Pago" descarta o valor pago digitado.
  useEffect(() => {
    if (!pagoWatch) form.setValue('valor_pago', undefined);
  }, [pagoWatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sair do modo parcelas ou desligar "à vista" volta o campo a editar o valor da parcela diretamente.
  useEffect(() => {
    if (repeticao !== 'parcelas' && valorInputMode === 'avista') setValorInputMode('parcela');
  }, [repeticao, valorInputMode]);

  const cats = useMemo(() => (categorias.data ?? []).filter((c) => c.ativo), [categorias.data]);
  const activeCards = useMemo(
    () => (cartoes.data ?? []).filter((c) => c.ativo && (!c.tipo || c.tipo === 'ambos' || c.tipo === formaPagamento)),
    [cartoes.data, formaPagamento],
  );
  const selectedCard = activeCards.find((c) => c.id === cartaoId) ?? activeCards[0];

  const cachedExpenses = useMemo(() => {
    const allCached = qc.getQueriesData<FinanceDashboardData>({ queryKey: ['dashboard'] });
    return allCached.flatMap(([, data]) => data?.expenses ?? []);
  }, [qc, month, year, categorias.data]);
  const featuredCategoryIds = useMemo(
    () => getRecentCategoryIds(cachedExpenses, cats),
    [cachedExpenses, cats],
  );

  // ── Sugestão de categoria por palavra-chave/histórico local (bloco O QUÊ) ─
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
    .filter((m) => m.descricao.toLowerCase() !== (descricaoWatch ?? '').toLowerCase())
    .slice(0, 4);
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

  const repeticaoOptions = [
    { value: 'nao',      titulo: 'Não repete', ajuda: 'Uma única cobrança' },
    { value: 'parcelas', titulo: 'Parcelado',  ajuda: 'Número fixo de parcelas' },
    { value: 'mensal',   titulo: 'Recorrente', ajuda: 'Todo mês, até cancelar' },
  ] as const;

  const handlePaymentSelect = (v: string) => {
    form.setValue('formaPagamento', v);
    setMethodTouched(true);
  };

  // Cartão selecionado deixou de ser compatível com a forma de pagamento
  // (ex.: cartão só-crédito com formaPagamento trocada para débito) — limpa
  // a seleção para não submeter uma combinação inválida.
  useEffect(() => {
    if (cartaoId && !activeCards.some((c) => c.id === cartaoId)) {
      form.setValue('cartao_id', undefined);
    }
  }, [cartaoId, activeCards]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset ao abrir/fechar ─────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setBatch([]);
      setLoteExpandido(false);
      setItemAberto(null);
      setAnexos([]);
      setShowCatForm(null);
      setCategoriaSugestao(null);
      setDuplicataInfo(null);
      setNfAberta(false);
      setValorInputMode('parcela');
      setMethodTouched(false);
      setSavedMessage('');
      setAcHidden(false);
      return;
    }
    setAnexos(expense?.anexos ?? []);
    const vOrig = expense?.valorOriginal ?? undefined;
    const vFinalDb = expense?.valorFinalTotal;
    const valorPagoDiferente = expense?.pago && expense.valorPago != null && expense.valorPago !== vFinalDb;
    setMethodTouched(true); // ao editar, não sobrescrever forma de pagamento já escolhida
    form.reset({
      descricao:       expense?.descricao ?? '',
      valor_original:  vOrig ?? '' as unknown as number,
      valor_pago:      valorPagoDiferente ? (expense?.valorPago ?? undefined) : undefined,
      precoAVista:     undefined,
      dataCompra:      expense?.dataCompra ?? presetDate ?? todayIso(),
      dataVencimentoManual: expense?.dataVencimento,
      categoria_id:    undefined,
      cartao_id:       undefined,
      formaPagamento:  expense?.formaPagamento ?? '',
      pago:            expense?.pago ?? false,
      repeticao:       expense?.parcelado ? 'parcelas' : expense?.recorrente ? 'mensal' : 'nao',
      totalParcelas:   2, parcelasJaPagas: 0, diaRecorrencia: todayNumericDay(),
      numero_nf:       expense?.numeroNf ?? undefined,
      data_emissao_nf: expense?.dataEmissaoNf ?? undefined,
    });
  }, [expense, open, presetDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reduzir o número de parcelas reajusta "já pagas" para caber no novo limite.
  useEffect(() => {
    const max = Math.max((totalParcelas ?? 2) - 1, 0);
    if ((parcelasJaPagas ?? 0) > max) form.setValue('parcelasJaPagas', max);
  }, [totalParcelas]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Vencimento e status derivados ─────────────────────────────────
  const vencimentoDerivado = useMemo(() => {
    // Campo livre: quando preenchido, manda. Vazio cai no cálculo abaixo, em
    // vez de gravar vazio — data_vencimento é obrigatória no backend e é ela
    // que agenda as parcelas mês a mês.
    if (dataVencimentoManual) {
      return { data: dataVencimentoManual, texto: `Vence ${formatBr(dataVencimentoManual)} · data informada` };
    }
    if (isCredito && selectedCard) {
      const { dataVencimento } = calcularVencimentoFatura(selectedCard, dataCompra || todayIso());
      const prefixo = repeticao === 'nao' ? 'Vence' : 'Primeira vence';
      return { data: dataVencimento, texto: `${prefixo} ${formatBr(dataVencimento)} · fatura ${selectedCard.nome}` };
    }
    const base = dataCompra || todayIso();
    if (repeticao === 'nao') {
      const hoje = todayIso();
      const texto = base > hoje
        ? `Vence ${formatBr(base)}`
        : base === hoje
          ? 'Pago na hora'
          : `Pago em ${formatBr(base)}`;
      return { data: base, texto };
    }
    if (repeticao === 'mensal' && diaRecorrencia) {
      const primeiraOcorrencia = proximoDiaDoMes(base, diaRecorrencia);
      return { data: primeiraOcorrencia, texto: `Primeira vence ${formatBr(primeiraOcorrencia)}` };
    }
    return { data: base, texto: `Primeira vence ${formatBr(base)}` };
  }, [dataVencimentoManual, isCredito, selectedCard, dataCompra, repeticao, diaRecorrencia]);

  const statusDerivado = useMemo(() => {
    if (isCredito) return { label: 'Entra na fatura', color: C.primaryDark, bg: C.primarySoft, border: C.primarySoftBorder };
    const isFuture = vencimentoDerivado.data > todayIso();
    if (isFuture) return { label: 'Agendado', color: C.warn, bg: C.warnBg, border: C.warnBorder };
    return { label: 'Pago', color: C.success, bg: C.successBg, border: C.successBorder };
  }, [isCredito, vencimentoDerivado.data]);

  const valorPagoPreenchido = valorPagoWatch != null;
  const efetivoFinal = pagoWatch ? (valorPagoPreenchido ? (valorPagoWatch ?? valorDigitado) : valorDigitado) : valorDigitado;
  const jurosCalculado = pagoWatch && valorPagoPreenchido ? Math.max(0, efetivoFinal - valorDigitado) : 0;
  const descontoCalculado = pagoWatch && valorPagoPreenchido ? Math.max(0, valorDigitado - efetivoFinal) : 0;

  const totalParceladoDerivado = repeticao === 'parcelas' && (totalParcelas ?? 0) >= 2
    ? valorDigitado * (totalParcelas ?? 1)
    : 0;

  const jurosEmbutido = useMemo(() => {
    if (valorInputMode !== 'avista' || !precoAVistaWatch || totalParceladoDerivado <= 0) return null;
    const diferenca = totalParceladoDerivado - precoAVistaWatch;
    const percentual = precoAVistaWatch > 0 ? (diferenca / precoAVistaWatch) * 100 : 0;
    return { diferenca, percentual };
  }, [valorInputMode, precoAVistaWatch, totalParceladoDerivado]);

  const proximaParcelaVence = useMemo(() => {
    if (repeticao !== 'parcelas') return null;
    const base = vencimentoDerivado.data;
    const d = new Date(base + 'T12:00:00');
    d.setMonth(d.getMonth() + (parcelasJaPagas ?? 0));
    return formatBr(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }, [repeticao, vencimentoDerivado.data, parcelasJaPagas]);

  const mensalTexto = isCredito
    ? `todo mês na fatura ${selectedCard?.nome ?? 'do cartão'}, até cancelar`
    : diaRecorrencia ? `todo dia ${diaRecorrencia}, até cancelar` : 'informe o dia';

  // Total da faixa de resumo: consolida num texto só o que antes aparecia
  // espalhado ao lado do valor, na data e no rodapé do bloco de repetição.
  const resumoTotal = useMemo(() => {
    if (repeticao === 'parcelas' && totalParceladoDerivado > 0) {
      const partes = [`${totalParcelas}x de ${formatCurrency(valorDigitado)}`, `total ${formatCurrency(totalParceladoDerivado)}`];
      if ((parcelasJaPagas ?? 0) > 0) partes.push(`${parcelasJaPagas} paga${(parcelasJaPagas ?? 0) > 1 ? 's' : ''}`);
      if (proximaParcelaVence) partes.push(`próxima vence ${proximaParcelaVence}`);
      return partes.join(' · ');
    }
    if (repeticao === 'mensal') {
      return valorDigitado > 0 ? `${formatCurrency(valorDigitado)} · ${mensalTexto}` : mensalTexto;
    }
    return valorDigitado > 0 ? `total ${formatCurrency(valorDigitado)}` : '';
  }, [repeticao, totalParceladoDerivado, totalParcelas, valorDigitado, parcelasJaPagas, proximaParcelaVence, mensalTexto]);

  const valorLabel = repeticao === 'parcelas' ? 'Valor da parcela' : repeticao === 'mensal' ? 'Valor mensal' : 'Valor da compra';

  const toFormValues = (data: FormData, anexosArr: Attachment[] = []): ExpenseFormValues => ({
    descricao:       data.descricao,
    valor_original:  data.valor_original,
    valor_pago:      data.pago && data.valor_pago != null ? data.valor_pago : undefined,
    dataVencimento:  vencimentoDerivado.data,
    dataCompra:      data.dataCompra,
    categoria_id:    data.categoria_id ? Number(data.categoria_id) : undefined,
    cartao_id:       (isCredito || isDebito) && data.cartao_id ? Number(data.cartao_id) : undefined,
    formaPagamento:  data.formaPagamento,
    pago:            data.pago,
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

  const resetForm = (data: FormData) => {
    form.reset({
      descricao: '', valor_original: '' as unknown as number, valor_pago: undefined, precoAVista: undefined,
      dataCompra: data.dataCompra, dataVencimentoManual: undefined,
      categoria_id: undefined, cartao_id: data.cartao_id,
      formaPagamento: data.formaPagamento, pago: false, repeticao: 'nao',
      totalParcelas: 2, parcelasJaPagas: 0, diaRecorrencia: todayNumericDay(),
      numero_nf: undefined, data_emissao_nf: undefined,
    });
    setValorInputMode('parcela');
  };

  const doSave = async (data: FormData) => {
    setIsSavingAll(true);
    try {
      const items = [...batch, toFormValues(data, anexos)];
      await onSave(items);
      setBatch([]);
      setLoteExpandido(false);
      setItemAberto(null);
      setAnexos([]);
      setDuplicataInfo(null);
      setSavedMessage(items.length > 1 ? `✓ ${items.length} despesas registradas` : '✓ Despesa registrada');
      resetForm(data);
      setTimeout(() => setSavedMessage(''), 2600);
    } finally {
      setIsSavingAll(false);
    }
  };

  // Carrega um item do lote no formulário. Inverso de toFormValues: o batch
  // guarda ExpenseFormValues, o form trabalha com FormData.
  const carregarNoForm = (item: ExpenseFormValues) => {
    setAnexos(item.anexos ?? []);
    setMethodTouched(true); // não sobrescrever a forma de pagamento já escolhida
    setValorInputMode('parcela');
    setNfAberta(!!item.numero_nf || !!item.data_emissao_nf);
    form.reset({
      descricao:       item.descricao,
      valor_original:  item.valor_original,
      valor_pago:      item.valor_pago ?? undefined,
      precoAVista:     undefined,
      dataCompra:      item.dataCompra,
      dataVencimentoManual: item.dataVencimento,
      categoria_id:    item.categoria_id,
      cartao_id:       item.cartao_id,
      formaPagamento:  item.formaPagamento,
      pago:            item.pago,
      repeticao:       item.parcelado ? 'parcelas' : item.recorrente ? 'mensal' : 'nao',
      totalParcelas:   item.total_parcelas ?? 2,
      parcelasJaPagas: item.parcelasJaPagas ?? 0,
      diaRecorrencia:  todayNumericDay(),
      numero_nf:       item.numero_nf ?? undefined,
      data_emissao_nf: item.data_emissao_nf ?? undefined,
    });
  };

  /**
   * Abre um item do lote no formulário. O item sai do batch enquanto está
   * aberto — assim ele nunca é salvo em duplicidade, porque o submit envia
   * [...batch, despesa do formulário].
   *
   * O que estiver em preenchimento vai para o lote antes, se for válido.
   * Incompleto não passa na validação e não teria como virar item de lote.
   */
  const abrirItemDoLote = (indice: number) => {
    const data = form.getValues();
    const emPreenchimento = data.descricao.trim() && data.valor_original
      ? toFormValues(data, anexos)
      : null;

    setBatch((prev) => {
      const alvo = prev[indice];
      if (!alvo) return prev;
      const restante = prev.filter((_, i) => i !== indice);
      const novo = emPreenchimento ? [...restante, emPreenchimento] : restante;
      // O índice de retorno considera a lista já sem o item aberto.
      setItemAberto(Math.min(indice, novo.length));
      carregarNoForm(alvo);
      return novo;
    });
  };

  /** Devolve o item aberto ao lote, na posição de onde saiu. */
  const fecharItemDoLote = () => {
    const data = form.getValues();
    const indice = itemAberto;
    if (indice === null) return;
    // Sem descrição ou valor não há item válido para devolver — mas o dado
    // original já saiu do batch, então descartar apagaria a despesa. O
    // fechamento fica bloqueado até o campo obrigatório voltar.
    if (!data.descricao.trim() || !data.valor_original) {
      form.trigger(['descricao', 'valor_original']);
      return;
    }
    const atualizado = toFormValues(data, anexos);
    setBatch((prev) => [...prev.slice(0, indice), atualizado, ...prev.slice(indice)]);
    setItemAberto(null);
    setAnexos([]);
    resetForm(data);
  };

  const handleAddToBatch = () => {
    const data = form.getValues();
    if (!data.descricao.trim() || !data.valor_original) return;
    setBatch((prev) => [...prev, toFormValues(data, anexos)]);
    setAnexos([]);
    resetForm(data);
    setTimeout(() => form.setFocus('descricao'), 50);
  };

  // Detecção de duplicata: mesma descrição + valor final + forma de pagamento (+ nº de parcelas, se parcelado) nos últimos 7 dias — aviso não bloqueante.
  useEffect(() => {
    const desc = descricaoWatch?.trim();
    if (!desc || !efetivoFinal) { setDuplicataInfo(null); return; }
    const seteAtras = new Date();
    seteAtras.setDate(seteAtras.getDate() - 7);
    const allCached = qc.getQueriesData<FinanceDashboardData>({ queryKey: ['dashboard'] });
    const allExpenses = allCached.flatMap(([, d]) => d?.expenses ?? []);
    const dup = allExpenses.find((e) => {
      if (e.id === expense?.id) return false;
      if (e.descricao.toLowerCase() !== desc.toLowerCase()) return false;
      if (e.valorFinal !== efetivoFinal) return false;
      if (e.formaPagamento !== formaPagamento) return false;
      if (new Date(e.dataVencimento) < seteAtras) return false;
      if (repeticao === 'parcelas') {
        const parcelasDup = e.parcela ? Number(e.parcela.split('/')[1]) : undefined;
        if (parcelasDup !== totalParcelas) return false;
      }
      return true;
    });
    setDuplicataInfo(dup ? { expense: dup } : null);
  }, [descricaoWatch, efetivoFinal, formaPagamento, qc, expense?.id, repeticao, totalParcelas]);

  const submitForm = form.handleSubmit((data) => doSave(data));

  const hasBatch = batch.length > 0;
  // As mais recentes primeiro: sao as que o usuario acabou de lancar e onde um
  // erro de digitacao apareceria. O indice original vai junto para editar e
  // remover pela posicao real no lote.
  const loteVisivel = batch
    .map((item, indice) => ({ item, indice }))
    .reverse()
    .slice(0, loteExpandido ? batch.length : LOTE_VISIVEL_PADRAO);
  const batchTotal = batch.reduce((sum, item) => sum + (item.valor_original ?? 0), 0);
  const podeSalvar = !!descricaoWatch?.trim() && !!valorOriginalWatch;
  const canSubmit = podeSalvar || hasBatch;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (acOpen) { setAcHidden(true); return; }
      onClose();
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
      if (canSubmit) submitForm();
      return;
    }
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      // Com um item do lote aberto, adicionar criaria uma copia: o original
      // esta fora do batch enquanto ocupa o formulario.
      if (itemAberto !== null) { fecharItemDoLote(); return; }
      handleAddToBatch();
    }
  };

  return (
    <Dialog open={open} title={expense ? 'Editar despesa' : 'Nova despesa'} description="Registre uma saída financeira" onClose={onClose} size="xl" scrollBody={false}>
      <form
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
        onSubmit={submitForm}
        onKeyDown={handleKeyDown}
      >
        {/* Corpo rolável */}
        {/* Blocos separados por linha de 1px, não por cards com borda: dentro de
            um modal, card sobre card cria moldura dupla. */}
        <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* ── Bloco 1: O QUÊ (descrição + categoria) ─────────────────── */}
          <div
            className="grid grid-cols-1 gap-y-3 sm:grid-cols-[1.35fr_1fr] sm:gap-y-0"
            style={{ columnGap: 12, alignItems: 'start' }}
          >
            <div style={{ minWidth: 0, position: 'relative' }}>
              <label style={labelStyle}>
                <span>Descrição</span><span style={{ color: C.danger }}>*</span>
              </label>
              {/* Anexar fica ao lado do campo, na mesma altura dele. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  {...form.register('descricao', { onChange: () => setAcHidden(false) })}
                  placeholder="Ex: Conta de luz"
                  autoFocus
                  autoComplete="off"
                  style={fieldInputStyle}
                />
                <button
                  type="button"
                  onClick={() => attachmentRef.current?.openPicker()}
                  title="Anexar comprovante"
                  aria-label="Anexar comprovante"
                  style={{
                    display: 'flex', flex: 'none', height: 32, width: 32,
                    alignItems: 'center', justifyContent: 'center',
                    borderRadius: 10, border: `1px solid ${C.borderInput}`,
                    background: '#fff', cursor: 'pointer',
                    color: anexos.length > 0 ? C.primary : C.textMuted,
                  }}
                >
                  <Paperclip size={14} />
                </button>
              </div>
              {acOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setAcHidden(true)} />
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 41,
                    background: '#fff', border: `1px solid ${C.borderInput}`, borderRadius: 12,
                    boxShadow: '0 20px 44px -14px rgba(13, 47, 63, 0.34)', padding: 6,
                    display: 'flex', flexDirection: 'column',
                  }}>
                    {acMatches.map((match, i) => (
                      <button
                        key={`${match.descricao}-${i}`}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applySuggestionMatch(match)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                          height: 38, padding: '0 10px', borderRadius: 8, cursor: 'pointer', border: 'none',
                          background: i === acIndex ? C.panelBg : 'transparent', textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: '13.5px', fontWeight: 600, color: C.text }}>{match.descricao}</span>
                        <span style={{ fontSize: 12, color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                          {formatCurrency(match.valorFinal)} · {match.formaPagamento}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {categoriaSugestao && !categoriaId && (
                <button
                  type="button"
                  onClick={() => { form.setValue('categoria_id', categoriaSugestao.id as any); setCategoriaSugestao(null); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: '12.5px', color: C.primaryDark, cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
                >
                  <span style={{ fontWeight: 600, background: C.primarySoft, border: `1px solid ${C.primarySoftBorder}`, borderRadius: 6, padding: '2px 7px' }}>
                    {categoriaSugestao.nome}
                  </span>
                  <span style={{ color: C.textMuted }}>sugerida · Tab aceita</span>
                </button>
              )}
            </div>

            <div style={{ minWidth: 0 }}>
              <label style={labelStyle}>Categoria</label>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, border: `1.5px solid ${C.primary}`, background: C.primarySoft, padding: 8 }}>
                  <input
                    type="text"
                    defaultValue={showCatForm}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); const v = e.currentTarget.value.trim(); if (v) criarCatMut.mutate(v); }
                    }}
                    id="nova-categoria-input"
                    style={{ flex: 1, height: 32, borderRadius: 8, border: `1px solid ${C.borderInput}`, background: '#fff', padding: '0 10px', fontSize: 13, color: C.text, outline: 'none' }}
                  />
                  <button
                    type="button"
                    disabled={criarCatMut.isPending}
                    onClick={() => {
                      const el = document.getElementById('nova-categoria-input') as HTMLInputElement | null;
                      const v = el?.value.trim();
                      if (v) criarCatMut.mutate(v);
                    }}
                    style={{ borderRadius: 8, background: C.primary, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    {criarCatMut.isPending ? '...' : 'Criar'}
                  </button>
                  <button type="button" onClick={() => setShowCatForm(null)} style={{ color: C.textMuted, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex' }}>
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Anexos ocupam a largura toda: na coluna da descrição caberiam
              poucos chips. O componente monta sempre — o ref abre o seletor. */}
          <AttachmentSection ref={attachmentRef} value={anexos} onChange={setAnexos} hideTrigger />

          <div style={{ height: 1, background: '#eef2f6' }} />

          {/* ── Linha 2: COMO (forma de pagamento → cartão) ─────────────── */}
          <div
            className="grid grid-cols-1 gap-y-3 sm:grid-cols-[1.35fr_1fr]"
            style={{ columnGap: 12, alignItems: 'start' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <div style={labelStyle}>Forma de pagamento</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {paymentOptions.map((opt) => (
                  <div key={opt.value} onClick={() => handlePaymentSelect(opt.value)} style={chipStyle(formaPagamento === opt.value)}>
                    {opt.icon}
                    {opt.label}
                  </div>
                ))}
              </div>

              {(isCredito || isDebito) && (
                <div style={panelStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: C.textSoft, textTransform: 'uppercase' }}>
                      {isCredito ? 'Cartão · consome limite' : 'Cartão · desconta saldo'}
                    </span>
                    {selectedCard && (
                      <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#33566a', fontVariantNumeric: 'tabular-nums' }}>
                        {activeCards.length <= 1 ? `${selectedCard.nome} · ` : ''}
                        {isCredito
                          ? `limite disponível ${formatCurrency(
                              cardLimits.data?.find((c) => c.id === selectedCard.id)?.disponivel ?? selectedCard.limite ?? 0,
                            )}`
                          : 'conta corrente'}
                      </span>
                    )}
                  </div>
                  {activeCards.length > 1 && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {activeCards.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => { form.setValue('cartao_id', c.id as any); setMethodTouched(true); }}
                          style={chipStyle(c.id === (cartaoId ?? selectedCard?.id), { h: 36, r: 9, size: 12.5 })}
                        >
                          {c.nome}
                        </div>
                      ))}
                    </div>
                  )}
                  {activeCards.length === 0 && (
                    <span style={{ fontSize: '12.5px', color: C.textMuted }}>Nenhum cartão cadastrado</span>
                  )}
                </div>
              )}
            </div>

            {/* Coluna vazia: o tipo de cobrança fica na direita da linha
                seguinte, alinhado com valores e datas. */}
            <div />
          </div>

          <div style={{ height: 1, background: '#eef2f6' }} />

          {/* ── Linha 3: valores e datas à esquerda, tipo de cobrança à direita ── */}
          <div
            className="grid grid-cols-1 gap-y-3 sm:grid-cols-[1.35fr_1fr]"
            style={{ columnGap: 12, alignItems: 'start' }}
          >
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

              {/* Grade 2x2: valores em cima, datas embaixo. Antes o valor pago
                  ficava na outra coluna e a data num bloco separado abaixo. */}
              <div
                className="grid grid-cols-1 gap-x-2.5 gap-y-2 sm:grid-cols-2"
                style={{ alignItems: 'start' }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <label style={labelStyle}>
                      <span>{valorInputMode === 'avista' ? 'Preço à vista' : valorLabel}</span><span style={{ color: C.danger }}>*</span>
                    </label>
                    {repeticao === 'parcelas' && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = valorInputMode === 'avista' ? 'parcela' : 'avista';
                          setValorInputMode(next);
                          if (next === 'parcela') form.setValue('precoAVista', undefined);
                        }}
                        style={{ fontSize: '11.5px', fontWeight: 600, color: C.primaryDark, cursor: 'pointer', background: 'transparent', border: 'none', padding: 0, whiteSpace: 'nowrap' }}
                      >
                        {valorInputMode === 'avista' ? 'valor da parcela' : 'sei o preço à vista'}
                      </button>
                    )}
                  </div>
                  {valorInputMode === 'avista' ? (
                    <Controller
                      control={form.control}
                      name="precoAVista"
                      render={({ field }) => <MoneyField value={field.value} onChange={field.onChange} autoFocus />}
                    />
                  ) : (
                    <Controller
                      control={form.control}
                      name="valor_original"
                      render={({ field }) => <MoneyField value={field.value || undefined} onChange={field.onChange} />}
                    />
                  )}
                  {form.formState.errors.valor_original?.message && (
                    <div style={{ marginTop: 4, fontSize: 12, color: C.danger }}>{form.formState.errors.valor_original.message}</div>
                  )}
                </div>

                {!isCredito && (
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Valor pago</label>
                    <Controller
                      control={form.control}
                      name="valor_pago"
                      render={({ field }) => (
                        <MoneyFieldSmall value={field.value} onChange={field.onChange} disabled={!pagoWatch} />
                      )}
                    />
                  </div>
                )}

                <div style={{ minWidth: 0 }}>
                  <label style={labelStyle}>Data da compra</label>
                  <input
                    {...form.register('dataCompra')}
                    type="date"
                    readOnly={!isEditing && !!presetDate}
                    style={{
                      ...fieldInputStyle,
                      fontVariantNumeric: 'tabular-nums',
                      ...(!isEditing && presetDate ? { background: C.panelBg, cursor: 'not-allowed' } : {}),
                    }}
                  />
                </div>

                <div style={{ minWidth: 0 }}>
                  <label style={labelStyle}>Data do pagamento</label>
                  <input
                    {...form.register('dataVencimentoManual')}
                    type="date"
                    style={{ ...fieldInputStyle, fontVariantNumeric: 'tabular-nums' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, marginTop: -4 }}>
                <span style={{ fontSize: 12, lineHeight: 1.45, color: C.textFaint }}>
                  {isCredito
                    ? 'A data do pagamento vem da fatura do cartão — altere só se combinou outra.'
                    : 'Deixe a data do pagamento em branco para o sistema calcular.'}
                </span>
                {!isCredito && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12.5px', fontWeight: 500, color: C.textMuted, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      {...form.register('pago')}
                      style={{ width: 16, height: 16, accentColor: C.primary, cursor: 'pointer' }}
                    />
                    Assinale se a despesa já foi paga
                  </label>
                )}
              </div>

              {/* Sinalizações de valor: juros embutido, multa e desconto. */}
              {((jurosEmbutido && jurosEmbutido.diferenca > 0) || (pagoWatch && (jurosCalculado > 0 || descontoCalculado > 0))) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {jurosEmbutido && jurosEmbutido.diferenca > 0 && (
                    <span style={{ fontSize: '12.5px', fontWeight: 600, padding: '3px 9px', borderRadius: 7, fontVariantNumeric: 'tabular-nums', color: C.warn, background: C.warnBg, border: `1px solid ${C.warnBorder}` }}>
                      + {formatCurrency(jurosEmbutido.diferenca)} de juros embutido ({jurosEmbutido.percentual.toFixed(1)}%)
                    </span>
                  )}
                  {pagoWatch && jurosCalculado > 0 && (
                    <span style={{ fontSize: '12.5px', fontWeight: 600, padding: '3px 9px', borderRadius: 7, fontVariantNumeric: 'tabular-nums', color: C.danger, background: C.dangerBg, border: `1px solid ${C.dangerBorder}` }}>
                      + {formatCurrency(jurosCalculado)} de multa e juros
                    </span>
                  )}
                  {pagoWatch && descontoCalculado > 0 && (
                    <span style={{ fontSize: '12.5px', fontWeight: 600, padding: '3px 9px', borderRadius: 7, fontVariantNumeric: 'tabular-nums', color: C.success, background: C.successBg, border: `1px solid ${C.successBorder}` }}>
                      − {formatCurrency(descontoCalculado)} de desconto
                    </span>
                  )}
                </div>
              )}

              {ultimoValorPago != null && valorInputMode !== 'avista' && (
                <div style={{ fontSize: 12, color: C.textFaint, marginTop: -6 }}>
                  Última vez você pagou {formatCurrency(ultimoValorPago)}
                </div>
              )}
            </div>

            {/* ── Tipo de cobrança: opções empilhadas, campos aninhados ──── */}
            <div style={{ position: 'relative', minWidth: 0, background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
              <div style={labelStyle}>Tipo de cobrança</div>
              <div role="radiogroup" aria-label="Tipo de cobrança" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {repeticaoOptions.map(({ value, titulo, ajuda }) => {
                  const ativo = repeticao === value;
                  return (
                    <div
                      key={value}
                      role="radio"
                      aria-checked={ativo}
                      tabIndex={0}
                      onClick={() => form.setValue('repeticao', value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); form.setValue('repeticao', value); }
                      }}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
                        padding: '9px 11px', borderRadius: 11,
                        border: `1px solid ${ativo ? C.primary : C.chipOffBorder}`,
                        background: ativo ? C.primarySoft : '#fff',
                        color: ativo ? C.primaryDark : C.chipOffText,
                        transition: 'all .13s ease',
                      }}
                    >
                      <span style={{
                        flex: 'none', width: 15, height: 15, borderRadius: 999, marginTop: 2,
                        border: `1.5px solid ${ativo ? C.primary : '#cddbe3'}`,
                        background: ativo ? C.primary : '#fff',
                        boxShadow: ativo ? 'inset 0 0 0 3px #fff' : 'none',
                      }} />
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{titulo}</span>
                        <span style={{ fontSize: 11.5, fontWeight: 400, color: ativo ? C.primaryDark : C.textFaint }}>{ajuda}</span>

                        {/* Os campos vivem dentro da opção escolhida: antes ficavam
                            num painel solto, desconectado da escolha. */}
                        {ativo && value === 'parcelas' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                            <input {...form.register('totalParcelas')} type="text" inputMode="numeric" placeholder="2" onClick={(e) => e.stopPropagation()} style={numericInputStyle} />
                            <span style={{ fontSize: 13, color: C.textSoft }}>parcelas</span>
                            <input {...form.register('parcelasJaPagas')} type="text" inputMode="numeric" placeholder="0" onClick={(e) => e.stopPropagation()} style={numericInputStyle} />
                            <span style={{ fontSize: 13, color: C.textSoft }}>já pagas</span>
                          </div>
                        )}

                        {ativo && value === 'mensal' && !isCredito && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                            <span style={{ fontSize: 13, color: C.textSoft }}>Todo dia</span>
                            <input {...form.register('diaRecorrencia')} type="text" inputMode="numeric" placeholder="5" onClick={(e) => e.stopPropagation()} style={numericInputStyle} />
                            <span style={{ fontSize: 13, color: C.textSoft }}>de cada mês</span>
                          </div>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              {repetitionGuide.isVisible && (
                <FirstAccessGuideCard
                  floating
                  placement="bottom"
                  className="w-[min(24rem,calc(100vw-2rem))]"
                  icon={Repeat2}
                  description={firstAccessGuideMessages.despesasTogglesTipo}
                  onDismiss={repetitionGuide.dismiss}
                  onSilenceAll={repetitionGuide.silenceAll}
                />
              )}
            </div>
          </div>

          {/* ── Faixa de resumo: status, vencimento e total num lugar só ──
              Antes esses três dados apareciam espalhados em blocos diferentes.
              Descreve a despesa em preenchimento, nao o lote — por isso o
              rótulo e a ocultacao quando o formulario esta vazio: com lote e
              form vazio a faixa aparecia pela metade, sem o total. */}
          {podeSalvar && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            background: C.panelBg, border: `1px solid ${C.panelBorder}`, borderRadius: 12, padding: '9px 12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              {hasBatch && (
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: C.textFaint, textTransform: 'uppercase' }}>
                  Esta despesa
                </span>
              )}
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                color: statusDerivado.color, background: statusDerivado.bg, border: `1px solid ${statusDerivado.border}`,
              }}>
                {statusDerivado.label}
              </span>
              <span style={{ fontSize: '12.5px', color: C.textSoft }}>{vencimentoDerivado.texto}</span>
            </div>
            {resumoTotal && (
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#33566a', fontVariantNumeric: 'tabular-nums' }}>
                {resumoTotal}
              </span>
            )}
          </div>
          )}

          {/* Nota fiscal recolhida: só conta empresa, e só quando pedida. */}
          {isEmpresa && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setNfAberta((v) => !v)}
                  style={{ fontSize: '12.5px', fontWeight: 600, color: C.primaryDark, cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
                >
                  {nfAberta ? 'ocultar nota fiscal' : 'informar nota fiscal'}
                </button>
                {!nfAberta && <span style={{ fontSize: 12, color: C.textFaint }}>opcional · conta empresa</span>}
              </div>
              {nfAberta && (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2" style={{ maxWidth: 380 }}>
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Número da NF</label>
                    <input {...form.register('numero_nf')} placeholder="Ex: 000123456" style={fieldInputStyle} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <label style={labelStyle}>Data de emissão</label>
                    <input {...form.register('data_emissao_nf')} type="date" style={{ ...fieldInputStyle, fontVariantNumeric: 'tabular-nums' }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Lote: lista editável ─────────────────────────────────────
              Nada aqui foi salvo — a gravação só acontece no submit. Por isso
              descrição e valor são editáveis na própria linha. Antes eram chips
              no rodapé, onde não dava para corrigir nada. */}
          {hasBatch && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: C.textSoft, textTransform: 'uppercase' }}>
                  No lote · {batch.length} despesa{batch.length !== 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#33566a', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(batchTotal)}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {loteVisivel.map(({ item, indice }) => (
                  <div
                    key={indice}
                    role="button"
                    tabIndex={0}
                    aria-label={`Editar ${item.descricao || 'despesa'} do lote`}
                    onClick={() => abrirItemDoLote(indice)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirItemDoLote(indice); }
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                      borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff', padding: '7px 9px',
                      transition: 'border-color .13s ease',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.descricao || 'Sem descrição'}
                      </span>
                      <span style={{ fontSize: 11, color: C.textFaint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[cats.find((c) => c.id === item.categoria_id)?.nome, item.formaPagamento]
                          .filter(Boolean)
                          .join(' · ') || 'sem categoria'}
                      </span>
                    </div>

                    <span style={{ flex: 'none', fontSize: 13, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(item.valor_original ?? 0)}
                    </span>

                    <span style={{ flex: 'none', fontSize: 11, fontWeight: 600, color: C.primaryDark }}>
                      editar
                    </span>

                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setBatch((prev) => prev.filter((_, j) => j !== indice)); }}
                      title="Remover do lote"
                      aria-label={`Remover ${item.descricao || 'despesa'} do lote`}
                      style={{
                        display: 'flex', flex: 'none', height: 28, width: 28, alignItems: 'center', justifyContent: 'center',
                        borderRadius: 8, border: 'none', background: 'transparent', color: C.placeholder, cursor: 'pointer',
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {batch.length > LOTE_VISIVEL_PADRAO && (
                <button
                  type="button"
                  onClick={() => setLoteExpandido((v) => !v)}
                  style={{ alignSelf: 'flex-start', fontSize: '12.5px', fontWeight: 600, color: C.primaryDark, cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
                >
                  {loteExpandido ? 'ver menos' : `ver todas as ${batch.length}`}
                </button>
              )}
            </div>
          )}

          {error && (
            <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Rodapé fixo ──────────────────────────────────────────── */}
        <div style={{ flex: 'none', borderTop: '1px solid #eef3f6', background: '#fafcfd', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {duplicataInfo && (
            <div style={{ fontSize: '12.5px', color: '#a3728a' }}>
              Você já lançou isso em {formatBr(duplicataInfo.expense.dataVencimento)} — é outra?
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={savedMessage
              ? { fontSize: '12.5px', fontWeight: 600, color: C.success, display: 'flex', alignItems: 'center', gap: 6 }
              : { fontSize: '12.5px', color: !canSubmit ? '#a3728a' : C.textMuted }
            }>
              {savedMessage || (canSubmit ? '' : 'Preencha descrição e valor para registrar.')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={itemAberto !== null ? fecharItemDoLote : handleAddToBatch}
                disabled={!podeSalvar}
                style={{
                  padding: '0 16px', height: 30, borderRadius: 999, fontSize: 12.5, fontWeight: 600,
                  whiteSpace: 'nowrap', border: 'none', transition: 'all .15s ease',
                  cursor: podeSalvar ? 'pointer' : 'not-allowed',
                  ...(podeSalvar
                    ? { background: C.primarySoft, color: C.primaryDark, boxShadow: 'none' }
                    : { background: '#e6edf1', color: '#a3b6c0', boxShadow: 'none' }),
                }}
              >
                {itemAberto !== null ? 'Concluir edição' : '+ Adicionar ao lote'}
              </button>
              <button
                type="submit"
                disabled={!canSubmit || isSaving || isSavingAll}
                style={{
                  padding: '0 16px', height: 30, borderRadius: 999, fontSize: 12.5, fontWeight: 600,
                  whiteSpace: 'nowrap', border: 'none', transition: 'all .15s ease',
                  cursor: canSubmit && !isSaving && !isSavingAll ? 'pointer' : 'not-allowed',
                  ...(canSubmit
                    ? { background: C.primary, color: '#fff' }
                    : { background: '#e6edf1', color: '#a3b6c0', boxShadow: 'none' }),
                }}
              >
                {isSaving || isSavingAll
                  ? 'Salvando...'
                  : isEditing
                    ? 'Salvar alterações'
                    : hasBatch
                      ? (() => {
                          // Conta o lote mais a despesa em preenchimento, se
                          // valida. Antes o plural era fixo e mostrava
                          // "Salvar 1 despesas".
                          const n = batch.length + (podeSalvar ? 1 : 0);
                          return `Salvar ${n} despesa${n !== 1 ? 's' : ''}`;
                        })()
                      : 'Registrar despesa'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
