import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useForm, Controller, useWatch, type Resolver } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Banknote, CreditCard, Paperclip, QrCode, Repeat2, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Attachment, Expense, ExpenseFormValues, FinanceDashboardData } from '../../types/finance';
import { AttachmentSection, type AttachmentSectionHandle } from '../../ui/AttachmentSection';
import { CategoryFloatingSelect } from '../../ui/CategoryFloatingSelect';
import {
  C, labelStyle, fieldInputStyle, numericInputStyle,
  chipStyle, MoneyField, MoneyFieldSmall,
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

/**
 * Resumo que cada formulário publica para o pai. É o mínimo que o rodapé
 * precisa (rótulo do botão, aviso de duplicata e o total do lote) — devolver o
 * objeto inteiro a cada tecla obrigaria o pai a re-renderizar todos os irmãos,
 * que é justamente o risco de desempenho deste desenho empilhado.
 */
export interface ExpenseFormResumo {
  preenchido: boolean;
  valor: number;
  duplicata: Expense | null;
}

/**
 * Handle imperativo: o pai lê os valores no instante do submit, em vez de
 * manter um espelho sincronizado a cada tecla. Assim digitar num formulário não
 * re-renderiza os demais.
 */
export interface ExpenseFormHandle {
  /** Valores atuais, ou null quando descrição/valor ainda estão vazios. */
  getValues: () => ExpenseFormValues | null;
  /** Dispara a validação zod e devolve se passou. */
  validate: () => Promise<boolean>;
  /** Limpa o formulário preservando data/cartão/forma, como após salvar. */
  reset: () => void;
  /** Foca a descrição — usado depois de adicionar ao lote. */
  focus: () => void;
}

interface ExpenseFormProps {
  /** Valores iniciais dos itens do lote. Ausente no formulário do topo. */
  valoresIniciais?: ExpenseFormValues;
  /** Só no modo edição de uma despesa já gravada. */
  expense?: Expense;
  presetDate?: string;
  isEmpresa: boolean;
  isEditing: boolean;
  /** Estado do modal: fechar limpa o formulário do topo. */
  open: boolean;
  /** Container rolável do modal, para o CategoryFloatingSelect se posicionar. */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Autofoco só no formulário de entrada; num item do lote roubaria o foco. */
  autoFocus?: boolean;
  /** Card de primeiro acesso: só uma instância pode registrar o mesmo escopo. */
  guideEnabled?: boolean;
  onResumoChange?: (resumo: ExpenseFormResumo) => void;
  /** Só nos itens do lote. */
  onRemover?: () => void;
  /** Cabeçalho discreto ("Despesa 1"). Ausente no formulário do topo. */
  titulo?: string;
}

/**
 * Corpo do formulário de despesa, com estado próprio. Cada despesa do lote é
 * uma instância desta — por isso o useForm, os 9 estados por despesa, os
 * watches e os derivados vivem aqui, e não no ExpenseDialog.
 *
 * As queries de categorias/cartões/limites são chamadas aqui em vez de descer
 * por prop: o React Query desduplica pela chave, então N instâncias
 * compartilham o mesmo cache e a mesma requisição. Passar por prop obrigaria a
 * repassar também os derivados (cats, activeCards, featuredCategoryIds) e
 * deixaria a fiação maior sem economizar nenhuma ida à rede.
 */
export const ExpenseForm = forwardRef<ExpenseFormHandle, ExpenseFormProps>(function ExpenseForm({
  valoresIniciais, expense, presetDate, isEmpresa, isEditing, open,
  scrollContainerRef, autoFocus, guideEnabled, onResumoChange, onRemover, titulo,
}, ref) {
  const qc = useQueryClient();

  const attachmentRef = useRef<AttachmentSectionHandle>(null);
  // Ref no lugar do getElementById que existia aqui: com vários formulários
  // empilhados o id se repetiria e o botão "Criar" leria sempre o primeiro.
  const novaCategoriaRef = useRef<HTMLInputElement>(null);
  const [anexos, setAnexos] = useState<Attachment[]>([]);

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
    enabled: !!guideEnabled && open && !isEditing,
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
  }, [qc, categorias.data]);
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
    { value: 'nao',      titulo: 'Não repete' },
    { value: 'parcelas', titulo: 'Parcelado' },
    { value: 'mensal',   titulo: 'Recorrente' },
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

  // ── Carga inicial e reset ao abrir/fechar ─────────────────────────────
  // valoresIniciais é lido por ref porque só vale na montagem: um item do lote
  // nasce com os valores que o usuário já digitou e a partir daí a fonte da
  // verdade é o próprio formulário. Reaplicar a prop a cada render apagaria a
  // edição em andamento.
  const valoresIniciaisRef = useRef(valoresIniciais);
  useEffect(() => {
    if (!open) {
      setAnexos([]);
      setShowCatForm(null);
      setCategoriaSugestao(null);
      setDuplicataInfo(null);
      setNfAberta(false);
      setValorInputMode('parcela');
      setMethodTouched(false);
      setAcHidden(false);
      return;
    }
    const inicial = valoresIniciaisRef.current;
    if (inicial) {
      // Item do lote: reidrata o FormData a partir do ExpenseFormValues
      // guardado no pai. Inverso do toFormValues logo abaixo.
      setAnexos(inicial.anexos ?? []);
      setMethodTouched(true); // não sobrescrever a forma de pagamento já escolhida
      setNfAberta(!!inicial.numero_nf || !!inicial.data_emissao_nf);
      form.reset({
        descricao:       inicial.descricao,
        valor_original:  inicial.valor_original ?? ('' as unknown as number),
        valor_pago:      inicial.valor_pago ?? undefined,
        precoAVista:     undefined,
        dataCompra:      inicial.dataCompra ?? presetDate ?? todayIso(),
        dataVencimentoManual: inicial.dataVencimento,
        categoria_id:    inicial.categoria_id,
        cartao_id:       inicial.cartao_id,
        formaPagamento:  inicial.formaPagamento,
        pago:            inicial.pago,
        repeticao:       inicial.parcelado ? 'parcelas' : inicial.recorrente ? 'mensal' : 'nao',
        totalParcelas:   inicial.total_parcelas ?? 2,
        parcelasJaPagas: inicial.parcelasJaPagas ?? 0,
        diaRecorrencia:  todayNumericDay(),
        numero_nf:       inicial.numero_nf ?? undefined,
        data_emissao_nf: inicial.data_emissao_nf ?? undefined,
      });
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
    anexos:          anexosArr,
  });

  const podeSalvar = !!descricaoWatch?.trim() && !!valorOriginalWatch;

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

  // Publica o resumo para o pai. O callback vai por ref para não entrar na lista
  // de dependências: o pai recria a função a cada render e o efeito dispararia
  // em loop.
  const onResumoChangeRef = useRef(onResumoChange);
  onResumoChangeRef.current = onResumoChange;
  useEffect(() => {
    onResumoChangeRef.current?.({
      preenchido: podeSalvar,
      valor: valorDigitado,
      duplicata: duplicataInfo?.expense ?? null,
    });
  }, [podeSalvar, valorDigitado, duplicataInfo]);

  // Limpa preservando data/cartão/forma de pagamento: quem lança várias
  // despesas seguidas costuma repetir esses três.
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
    setAnexos([]);
    setNfAberta(false);
  };

  useImperativeHandle(ref, () => ({
    getValues: () => {
      const data = form.getValues();
      if (!data.descricao?.trim() || !data.valor_original) return null;
      return toFormValues(data, anexos);
    },
    validate: () => form.trigger(),
    reset: () => resetForm(form.getValues()),
    focus: () => form.setFocus('descricao'),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Cabeçalho discreto dos itens do lote. O formulário do topo não tem —
          ele é o próprio formulário de cadastro, já anunciado pelo modal. */}
      {(titulo || onRemover) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: C.textSoft, textTransform: 'uppercase' }}>
            {titulo}
          </span>
          {onRemover && (
            <button
              type="button"
              onClick={onRemover}
              title="Remover do lote"
              aria-label={`Remover ${descricaoWatch?.trim() || titulo || 'despesa'} do lote`}
              style={{
                display: 'flex', flex: 'none', height: 28, width: 28, alignItems: 'center', justifyContent: 'center',
                borderRadius: 8, border: 'none', background: 'transparent', color: C.placeholder, cursor: 'pointer',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

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
              autoFocus={autoFocus}
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
                scrollContainerRef={scrollContainerRef}
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
                ref={novaCategoriaRef}
                style={{ flex: 1, height: 32, borderRadius: 8, border: `1px solid ${C.borderInput}`, background: '#fff', padding: '0 10px', fontSize: 13, color: C.text, outline: 'none' }}
              />
              <button
                type="button"
                disabled={criarCatMut.isPending}
                onClick={() => {
                  const v = novaCategoriaRef.current?.value.trim();
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
        </div>

        {/* Cartão ocupa a coluna da direita, que antes ficava vazia. Antes
            era um painel com moldura, rótulo em caixa alta e chips de 36px
            logo abaixo da forma de pagamento — fora da escala de 32px dos
            demais campos. */}
        {(isCredito || isDebito) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
            <div style={{ ...labelStyle, justifyContent: 'space-between' }}>
              <span>Cartão</span>
              {selectedCard && isCredito && (
                <span style={{ fontWeight: 500, color: C.textFaint, fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(
                    cardLimits.data?.find((c) => c.id === selectedCard.id)?.disponivel ?? selectedCard.limite ?? 0,
                  )} disponível
                </span>
              )}
            </div>
            {activeCards.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {activeCards.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => { form.setValue('cartao_id', c.id as any); setMethodTouched(true); }}
                    style={chipStyle(c.id === (cartaoId ?? selectedCard?.id))}
                  >
                    {c.nome}
                  </div>
                ))}
              </div>
            ) : (
              <span style={{ fontSize: '12.5px', color: C.textMuted }}>Nenhum cartão cadastrado</span>
            )}
          </div>
        )}
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
            {repeticaoOptions.map(({ value, titulo: tituloOpcao }) => {
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
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{tituloOpcao}</span>

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
          Descreve esta despesa, não o lote — por isso some quando o formulário
          está vazio: sem valor a faixa aparecia pela metade, sem o total. */}
      {podeSalvar && (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
        background: C.panelBg, border: `1px solid ${C.panelBorder}`, borderRadius: 12, padding: '9px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
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
    </div>
  );
});
