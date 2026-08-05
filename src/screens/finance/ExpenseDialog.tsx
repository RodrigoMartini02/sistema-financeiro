import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Banknote, CreditCard, Paperclip, Plus, QrCode, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Attachment, Expense, ExpenseFormValues, FinanceDashboardData } from '../../types/finance';
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
  precoAVista:     z.coerce.number().min(0).optional(),
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
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ── Paleta e tokens visuais extraídos do mockup ────────────────────────
const C = {
  border: '#e6eef3',
  borderInput: '#dbe6ec',
  cardBg: '#fbfdfe',
  panelBg: '#f2f9fb',
  panelBorder: '#dcebf1',
  primary: '#0891b2',
  primaryDark: '#0e7490',
  primarySoft: '#e6f7fa',
  primarySoftBorder: '#b9e6ef',
  text: '#0f2b38',
  textSoft: '#6c8593',
  textMuted: '#7b93a1',
  textFaint: '#8ba3b0',
  placeholder: '#9db0bb',
  chipOffBorder: '#e0e9ee',
  chipOffText: '#416275',
  danger: '#b42318',
  dangerBg: '#fef3f2',
  dangerBorder: '#fbd5d1',
  success: '#067647',
  successBg: '#ecfdf3',
  successBorder: '#b7e4c7',
  warn: '#8a6d1f',
  warnBg: '#fdf6e3',
  warnBorder: '#f0e0b0',
};

const labelStyle: CSSProperties = {
  fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.09em', color: C.textFaint,
  textTransform: 'uppercase', height: 15, display: 'flex', alignItems: 'center', gap: 4,
};

const fieldInputStyle: CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', height: 54, borderRadius: 12,
  border: `1.5px solid ${C.borderInput}`, background: '#fff', padding: '0 14px',
  fontSize: 17, fontWeight: 500, color: C.text, outline: 'none',
};

const smallInputStyle: CSSProperties = {
  width: 168, height: 42, boxSizing: 'border-box', borderRadius: 10,
  border: `1.5px solid ${C.borderInput}`, background: '#fff', padding: '0 12px',
  fontSize: 14, color: C.text, outline: 'none',
};

const numericInputStyle: CSSProperties = {
  width: 76, height: 42, boxSizing: 'border-box', borderRadius: 10,
  border: `1.5px solid ${C.borderInput}`, background: '#fff', padding: '0 12px',
  fontSize: 17, fontWeight: 700, color: C.text, textAlign: 'center',
  fontVariantNumeric: 'tabular-nums', outline: 'none',
};

const cardStyle: CSSProperties = {
  margin: '0 26px 10px', padding: '13px 14px 14px', borderRadius: 14,
  border: `1px solid ${C.border}`, background: C.cardBg,
};

const panelStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10, background: C.panelBg,
  border: `1px solid ${C.panelBorder}`, borderRadius: 12, padding: '12px 14px', marginTop: 9,
};

function chipStyle(active: boolean, opts?: { h?: number; r?: number; size?: number }): CSSProperties {
  const o = opts ?? {};
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer',
    height: o.h ?? 42, padding: '0 10px', borderRadius: o.r ?? 10, fontSize: o.size ?? 13,
    fontWeight: active ? 600 : 500, whiteSpace: 'nowrap',
    border: `1.5px solid ${active ? C.primary : C.chipOffBorder}`,
    background: active ? C.primary : '#fff',
    color: active ? '#fff' : C.chipOffText,
    boxShadow: active ? '0 2px 8px -2px rgba(8,145,178,0.5)' : 'none',
    transition: 'all .13s ease',
  };
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function digitsOnly(value: string): number {
  const digits = value.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

function MoneyField({ value, onChange, autoFocus }: { value: number | undefined; onChange: (v: number) => void; autoFocus?: boolean }) {
  const cents = value ? Math.round(value * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 54, borderRadius: 12, border: `1.5px solid ${C.borderInput}`, background: '#fff', padding: '0 14px' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.textFaint }}>R$</span>
      <input
        type="text"
        inputMode="numeric"
        autoFocus={autoFocus}
        value={cents > 0 ? formatCents(cents) : ''}
        onChange={(e) => onChange(digitsOnly(e.target.value) / 100)}
        placeholder="0,00"
        style={{
          flex: 1, width: '100%', minWidth: 0, border: 'none', background: 'transparent',
          fontSize: 26, fontWeight: 700, color: C.text, letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums', outline: 'none',
        }}
      />
    </div>
  );
}

function MoneyFieldSmall({ value, onChange, autoFocus }: { value: number | undefined; onChange: (v: number) => void; autoFocus?: boolean }) {
  const cents = value ? Math.round(value * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 42, borderRadius: 10, border: `1.5px solid ${C.borderInput}`, background: '#fff', padding: '0 12px' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.textFaint }}>R$</span>
      <input
        type="text"
        inputMode="numeric"
        autoFocus={autoFocus}
        value={cents > 0 ? formatCents(cents) : ''}
        onChange={(e) => onChange(digitsOnly(e.target.value) / 100)}
        placeholder="0,00"
        style={{
          flex: 1, width: '100%', minWidth: 0, border: 'none', background: 'transparent',
          fontSize: 15, fontWeight: 700, color: C.text, letterSpacing: '-0.01em',
          fontVariantNumeric: 'tabular-nums', outline: 'none',
        }}
      />
    </div>
  );
}

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
  const [vencimentoManualAberto, setVencimentoManualAberto] = useState(false);
  const [jurosDescontoAberto, setJurosDescontoAberto] = useState(false);
  const [jurosDescontoTocado, setJurosDescontoTocado] = useState(false);
  const [valorInputMode, setValorInputMode] = useState<'parcela' | 'avista'>('parcela');
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
      descricao: '', valor_original: '' as unknown as number, valor_final: undefined, precoAVista: undefined,
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

  // Sair do modo parcelas ou desligar "à vista" volta o campo a editar o valor da parcela diretamente.
  useEffect(() => {
    if (repeticao !== 'parcelas' && valorInputMode === 'avista') setValorInputMode('parcela');
  }, [repeticao, valorInputMode]);

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
      setVencimentoManualAberto(false);
      setJurosDescontoAberto(false);
      setJurosDescontoTocado(false);
      setValorInputMode('parcela');
      setMethodTouched(false);
      setSavedMessage('');
      setAcHidden(false);
      return;
    }
    setAnexos(expense?.anexos ?? []);
    const vOrig = expense?.valorOriginal ?? undefined;
    const vFinalDb = expense?.valorFinalTotal;
    const temJurosOuDesconto = !!(vFinalDb && vFinalDb !== vOrig);
    setJurosDescontoAberto(temJurosOuDesconto);
    setJurosDescontoTocado(temJurosOuDesconto);
    setMethodTouched(true); // ao editar, não sobrescrever forma de pagamento já escolhida
    form.reset({
      descricao:       expense?.descricao ?? '',
      valor_original:  vOrig ?? '' as unknown as number,
      valor_final:     temJurosOuDesconto ? vFinalDb : undefined,
      precoAVista:     undefined,
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

  // ── Vencimento e status derivados (bloco QUANDO) ───────────────────────
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
  }, [vencimentoManualAberto, dataVencimentoManual, isCredito, selectedCard, dataCompra, repeticao, diaRecorrencia]);

  const statusDerivado = useMemo(() => {
    if (isCredito) return { label: 'Entra na fatura', color: C.primaryDark, bg: C.primarySoft, border: C.primarySoftBorder };
    const isFuture = vencimentoDerivado.data > todayIso();
    if (isFuture) return { label: 'Agendado', color: C.warn, bg: C.warnBg, border: C.warnBorder };
    return { label: 'Pago', color: C.success, bg: C.successBg, border: C.successBorder };
  }, [isCredito, vencimentoDerivado.data]);

  // O texto de vencimento já diz "Pago na hora"/"Pago em DD/MM" — o selo fica redundante nesse caso.
  const mostrarSeloStatus = statusDerivado.label !== 'Pago';

  const pagoDerivado = statusDerivado.label === 'Pago';

  // Comparação data informada × vencimento conhecido: decide se é multa/juros (atraso) ou desconto (antecipação).
  const dataReferenciaPagamento = vencimentoManualAberto && dataVencimentoManual ? dataVencimentoManual : (dataCompra || todayIso());
  const diffDias = useMemo(() => {
    if (!vencimentoDerivado.data || !dataReferenciaPagamento) return 0;
    const a = new Date(dataReferenciaPagamento + 'T00:00:00');
    const b = new Date(vencimentoDerivado.data + 'T00:00:00');
    return Math.round((a.getTime() - b.getTime()) / 86400000);
  }, [dataReferenciaPagamento, vencimentoDerivado.data]);

  // Abre automaticamente o campo de valor efetivo quando a data diverge do vencimento — usuário pode fechar manualmente.
  useEffect(() => {
    if (jurosDescontoTocado) return;
    if (diffDias !== 0 && !isCredito) setJurosDescontoAberto(true);
  }, [diffDias, isCredito, jurosDescontoTocado]);

  const efetivoFinal = jurosDescontoAberto ? (valorFinalWatch ?? valorDigitado) : valorDigitado;
  const jurosCalculado = jurosDescontoAberto ? Math.max(0, efetivoFinal - valorDigitado) : 0;
  const descontoCalculado = jurosDescontoAberto ? Math.max(0, valorDigitado - efetivoFinal) : 0;

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

  const valorLabel = repeticao === 'parcelas' ? 'VALOR DA PARCELA' : repeticao === 'mensal' ? 'VALOR MENSAL' : 'VALOR PAGO';

  const toFormValues = (data: FormData, anexosArr: Attachment[] = []): ExpenseFormValues => ({
    descricao:       data.descricao,
    valor_original:  data.valor_original,
    valor_final:     jurosDescontoAberto ? data.valor_final : undefined,
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

  const resetForm = (data: FormData) => {
    form.reset({
      descricao: '', valor_original: '' as unknown as number, valor_final: undefined, precoAVista: undefined,
      dataCompra: data.dataCompra, dataVencimentoManual: undefined,
      categoria_id: undefined, cartao_id: data.cartao_id,
      formaPagamento: data.formaPagamento, repeticao: 'nao',
      totalParcelas: 2, parcelasJaPagas: 0, diaRecorrencia: todayNumericDay(),
      numero_nf: undefined, data_emissao_nf: undefined,
    });
    setJurosDescontoAberto(false);
    setJurosDescontoTocado(false);
    setValorInputMode('parcela');
  };

  const doSave = async (data: FormData) => {
    setIsSavingAll(true);
    try {
      const items = [...batch, toFormValues(data, anexos)];
      await onSave(items);
      setBatch([]);
      setAnexos([]);
      setDuplicataInfo(null);
      setSavedMessage(items.length > 1 ? `✓ ${items.length} despesas registradas` : '✓ Despesa registrada');
      resetForm(data);
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
      handleAddToBatch();
    }
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <form
        style={{
          position: 'relative', zIndex: 10, width: 980, maxWidth: '100%', maxHeight: '92vh',
          display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 18,
          boxShadow: '0 32px 80px -24px rgba(13, 47, 63, 0.38), 0 0 0 1px rgba(13, 47, 63, 0.06)',
          overflow: 'hidden', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        }}
        onSubmit={submitForm}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div style={{ flex: 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, padding: '22px 26px 18px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>
              {expense ? 'Editar despesa' : 'Nova despesa'}
            </div>
            <div style={{ fontSize: 13, color: C.textSoft }}>Registre uma saída financeira</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: '50%', border: '1px solid #e3ecf1',
              display: 'grid', placeItems: 'center', color: C.textMuted, cursor: 'pointer', background: 'transparent',
            }}
          >
            <X size={13} />
          </button>
        </div>

        {/* Corpo rolável */}
        <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>

          {/* ── Bloco 1: O QUÊ (descrição + categoria) ─────────────────── */}
          <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1.35fr 1fr', columnGap: 18, alignItems: 'start' }}>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7, position: 'relative' }}>
              <label style={labelStyle}>
                <span>DESCRIÇÃO</span><span style={{ color: C.primary }}>*</span>
              </label>
              <input
                {...form.register('descricao', { onChange: () => setAcHidden(false) })}
                placeholder="Ex: Conta de luz"
                autoFocus
                autoComplete="off"
                style={fieldInputStyle}
              />
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
                          {brl(match.valorFinal)} · {match.formaPagamento}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 20 }}>
                <button
                  type="button"
                  onClick={() => attachmentRef.current?.openPicker()}
                  title="Anexar comprovante"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, fontSize: '12.5px', fontWeight: 600,
                    color: anexos.length > 0 ? C.primary : C.textMuted, cursor: 'pointer', background: 'transparent', border: 'none', padding: 0,
                  }}
                >
                  <Paperclip size={13} />
                  <span>Anexar comprovante{anexos.length > 0 ? ` (${anexos.length})` : ''}</span>
                </button>
                {anexos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setAnexos([])}
                    title="Remover anexos"
                    style={{ display: 'flex', alignItems: 'center', color: C.placeholder, cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
                  >
                    <X size={12} />
                  </button>
                )}
                {categoriaSugestao && !categoriaId && (
                  <button
                    type="button"
                    onClick={() => { form.setValue('categoria_id', categoriaSugestao.id as any); setCategoriaSugestao(null); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12.5px', color: C.primaryDark, cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
                  >
                    <span style={{ fontWeight: 600, background: C.primarySoft, border: `1px solid ${C.primarySoftBorder}`, borderRadius: 6, padding: '2px 7px' }}>
                      {categoriaSugestao.nome}
                    </span>
                    <span style={{ color: C.textMuted }}>sugerida · Tab aceita</span>
                  </button>
                )}
              </div>
              <div style={{ display: 'none' }}>
                <AttachmentSection ref={attachmentRef} value={anexos} onChange={setAnexos} hideTrigger />
              </div>
            </div>

            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, height: 15 }}>
                <label style={{ ...labelStyle, height: 'auto' }}>CATEGORIA</label>
                <span style={{ fontSize: 11, color: '#a8bac4' }}>opcional</span>
              </div>
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

          {/* ── Bloco 2: COMO (forma de pagamento → cartão → isso se repete) ── */}
          <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1.35fr 1fr', columnGap: 18, rowGap: 14, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={labelStyle}>FORMA DE PAGAMENTO</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
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
                    <span style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.09em', color: C.textSoft, textTransform: 'uppercase' }}>
                      {isCredito ? 'CARTÃO · CONSOME LIMITE' : 'CARTÃO · DESCONTA SALDO'}
                    </span>
                    {selectedCard && (
                      <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#33566a', fontVariantNumeric: 'tabular-nums' }}>
                        {activeCards.length <= 1 ? `${selectedCard.nome} · ` : ''}
                        {isCredito ? `limite disponível ${brl(selectedCard.limite ?? 0)}` : 'conta corrente'}
                      </span>
                    )}
                  </div>
                  {activeCards.length > 1 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={labelStyle}>ISSO SE REPETE?</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {([
                  ['nao', 'Não repete'],
                  ['parcelas', 'Parcelas'],
                  ['mensal', 'Todo mês'],
                ] as const).map(([value, label]) => (
                  <div key={value} onClick={() => form.setValue('repeticao', value)} style={chipStyle(repeticao === value)}>
                    {label}
                  </div>
                ))}
              </div>

              {repeticao === 'parcelas' && (
                <div style={panelStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <input {...form.register('totalParcelas')} type="text" inputMode="numeric" placeholder="2" style={numericInputStyle} />
                    <span style={{ fontSize: 13, color: C.textSoft }}>parcelas</span>
                    <input {...form.register('parcelasJaPagas')} type="text" inputMode="numeric" placeholder="0" style={numericInputStyle} />
                    <span style={{ fontSize: 13, color: C.textSoft }}>já pagas</span>
                  </div>
                </div>
              )}

              {repeticao === 'mensal' && !isCredito && (
                <div style={panelStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ fontSize: 13, color: C.textSoft }}>Todo dia</span>
                    <input {...form.register('diaRecorrencia')} type="text" inputMode="numeric" placeholder="5" style={numericInputStyle} />
                    <span style={{ fontSize: 13, color: C.textSoft }}>de cada mês</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Bloco 3: QUANTO (valor, significado depende do bloco COMO) ── */}
          <div style={cardStyle}>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 15 }}>
                <label style={{ ...labelStyle, height: 'auto' }}>
                  <span>{valorInputMode === 'avista' ? 'PREÇO À VISTA' : valorLabel}</span><span style={{ color: C.primary }}>*</span>
                </label>
                {repeticao === 'parcelas' && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = valorInputMode === 'avista' ? 'parcela' : 'avista';
                      setValorInputMode(next);
                      if (next === 'parcela') form.setValue('precoAVista', undefined);
                    }}
                    style={{ fontSize: '11.5px', fontWeight: 600, color: C.primaryDark, cursor: 'pointer', background: 'transparent', border: 'none' }}
                  >
                    {valorInputMode === 'avista' ? 'informar valor da parcela' : 'sei o preço à vista'}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ width: 260 }}>
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
                </div>
                {repeticao === 'parcelas' && totalParceladoDerivado > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.textSoft, fontVariantNumeric: 'tabular-nums' }}>
                    {valorInputMode === 'avista'
                      ? `${totalParcelas}x de ${brl(valorDigitado)}`
                      : `total ${brl(totalParceladoDerivado)}`}
                    {(parcelasJaPagas ?? 0) > 0 ? ` · ${parcelasJaPagas} paga${(parcelasJaPagas ?? 0) > 1 ? 's' : ''}` : ''}
                    {proximaParcelaVence ? ` · próxima vence ${proximaParcelaVence}` : ''}
                  </span>
                )}
                {jurosEmbutido && jurosEmbutido.diferenca > 0 && (
                  <span style={{ fontSize: '12.5px', fontWeight: 600, padding: '3px 9px', borderRadius: 7, fontVariantNumeric: 'tabular-nums', color: C.warn, background: C.warnBg, border: `1px solid ${C.warnBorder}` }}>
                    + {brl(jurosEmbutido.diferenca)} de juros embutido ({jurosEmbutido.percentual.toFixed(1)}%)
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: C.textFaint, minHeight: 18 }}>
                {valorInputMode === 'avista'
                  ? `Dividido em ${totalParcelas}x — este é o valor salvo por parcela`
                  : ultimoValorPago ? `Última vez você pagou ${brl(ultimoValorPago)}` : 'Preço base da compra'}
              </div>
              {form.formState.errors.valor_original?.message && (
                <div style={{ fontSize: 12, color: C.danger }}>{form.formState.errors.valor_original.message}</div>
              )}
            </div>
          </div>

          {/* ── Bloco 4: QUANDO (data, vencimento, status, juros/desconto) ── */}
          <div style={{ ...cardStyle, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}>DATA DA COMPRA</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input {...form.register('dataCompra')} type="date" style={smallInputStyle} />
                {vencimentoManualAberto && (
                  <input {...form.register('dataVencimentoManual')} type="date" style={{ ...smallInputStyle, width: 140, border: `1.5px solid ${C.primary}` }} />
                )}
                {mostrarSeloStatus && !vencimentoManualAberto && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 6,
                    color: statusDerivado.color, background: statusDerivado.bg, border: `1px solid ${statusDerivado.border}`,
                  }}>
                    {statusDerivado.label}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, minHeight: 20 }}>
                {!vencimentoManualAberto && (
                  <span style={{ fontSize: '12.5px', color: C.textSoft }}>{vencimentoDerivado.texto}</span>
                )}
                <button
                  type="button"
                  onClick={() => setVencimentoManualAberto((v) => !v)}
                  style={{ fontSize: '12.5px', fontWeight: 600, color: C.primaryDark, cursor: 'pointer', background: 'transparent', border: 'none' }}
                >
                  {vencimentoManualAberto ? 'usar automática' : 'data de pagamento diferente'}
                </button>
              </div>
            </div>

            {!isCredito && diffDias !== 0 && (
              <div style={panelStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.09em', color: C.textSoft, textTransform: 'uppercase' }}>
                    {diffDias > 0
                      ? `Pago ${diffDias} dia${diffDias > 1 ? 's' : ''} após o vencimento — teve multa ou juros?`
                      : `Pago ${Math.abs(diffDias)} dia${Math.abs(diffDias) > 1 ? 's' : ''} antes do vencimento — teve desconto?`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !jurosDescontoAberto;
                      setJurosDescontoAberto(next);
                      setJurosDescontoTocado(true);
                      if (!next) form.setValue('valor_final', undefined);
                    }}
                    style={{ fontSize: '11.5px', fontWeight: 600, color: C.placeholder, cursor: 'pointer', background: 'transparent', border: 'none' }}
                  >
                    {jurosDescontoAberto ? 'remover' : 'informar valor pago'}
                  </button>
                </div>
                {jurosDescontoAberto && (
                  <>
                    <div style={{ width: 200 }}>
                      <Controller
                        control={form.control}
                        name="valor_final"
                        render={({ field }) => <MoneyFieldSmall value={field.value} onChange={field.onChange} />}
                      />
                    </div>
                    <div style={{ minHeight: 18 }}>
                      {jurosCalculado > 0 && (
                        <span style={{ fontSize: '12.5px', fontWeight: 600, padding: '3px 9px', borderRadius: 7, fontVariantNumeric: 'tabular-nums', color: C.danger, background: C.dangerBg, border: `1px solid ${C.dangerBorder}` }}>
                          + {brl(jurosCalculado)} de multa e juros
                        </span>
                      )}
                      {descontoCalculado > 0 && (
                        <span style={{ fontSize: '12.5px', fontWeight: 600, padding: '3px 9px', borderRadius: 7, fontVariantNumeric: 'tabular-nums', color: C.success, background: C.successBg, border: `1px solid ${C.successBorder}` }}>
                          − {brl(descontoCalculado)} de desconto
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {isEmpresa && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10, marginTop: 4 }}>
                <div style={{ gridColumn: '1 / -1', fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.09em', color: C.textSoft, textTransform: 'uppercase' }}>
                  Nota Fiscal
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <label style={labelStyle}>NÚMERO DA NF</label>
                  <input {...form.register('numero_nf')} placeholder="Ex: 000123456" style={smallInputStyle} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <label style={labelStyle}>DATA DE EMISSÃO</label>
                  <input {...form.register('data_emissao_nf')} type="date" style={smallInputStyle} />
                </div>
              </div>
            )}

            {repeticao === 'mensal' && (
              <div style={{ fontSize: '12.5px', color: C.textSoft }}>
                Recorrência: {mensalTexto}
              </div>
            )}
          </div>

          {error && (
            <div style={{ margin: '0 26px 14px', borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '10px 14px', fontSize: 13, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Rodapé fixo ──────────────────────────────────────────── */}
        <div style={{ flex: 'none', borderTop: '1px solid #eef3f6', background: '#fafcfd', padding: '14px 26px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {hasBatch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 700, letterSpacing: '0.07em', color: C.textSoft }}>
                NO LOTE · {batch.length} · {brl(batchTotal)}
              </span>
              {batch.map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `1px solid ${C.borderInput}`, borderRadius: 8, padding: '5px 8px 5px 10px', fontSize: '12.5px', color: '#33566a' }}>
                  <span style={{ fontWeight: 600 }}>{item.descricao}</span>
                  <span style={{ color: C.textMuted, fontVariantNumeric: 'tabular-nums' }}>{brl(item.valor_original ?? 0)}</span>
                  <span onClick={() => setBatch((prev) => prev.filter((_, j) => j !== i))} style={{ color: C.placeholder, cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>
                    ×
                  </span>
                </div>
              ))}
            </div>
          )}

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
                onClick={handleAddToBatch}
                disabled={!podeSalvar}
                style={{
                  padding: '12px 8px', borderRadius: 11, fontSize: 13, fontWeight: 600,
                  background: 'transparent', border: 'none', boxShadow: 'none',
                  color: podeSalvar ? C.primaryDark : '#adbfc9', cursor: podeSalvar ? 'pointer' : 'not-allowed',
                }}
              >
                + Adicionar ao lote
              </button>
              <button
                type="submit"
                disabled={!canSubmit || isSaving || isSavingAll}
                style={{
                  padding: '12px 22px', borderRadius: 11, fontSize: 14, fontWeight: 700,
                  whiteSpace: 'nowrap', border: 'none', transition: 'all .15s ease',
                  cursor: canSubmit && !isSaving && !isSavingAll ? 'pointer' : 'not-allowed',
                  ...(canSubmit
                    ? { background: C.primary, color: '#fff', boxShadow: '0 6px 16px -6px rgba(8,145,178,0.75)' }
                    : { background: '#e6edf1', color: '#a3b6c0', boxShadow: 'none' }),
                }}
              >
                {isSaving || isSavingAll
                  ? 'Salvando...'
                  : isEditing
                    ? 'Salvar alterações'
                    : hasBatch
                      ? `Salvar ${batch.length + (podeSalvar ? 1 : 0)} despesas`
                      : 'Registrar despesa'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
