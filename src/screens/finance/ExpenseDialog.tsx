import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Banknote, CreditCard, QrCode,
  Repeat, Layers, Plus, X, Tag, Check, Paperclip, FileText, AlertTriangle,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Attachment, Expense, ExpenseFormValues, FinanceDashboardData } from '../../types/finance';
import { Dialog } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Field, Input, Textarea, ToggleGroup, SectionDivider } from '../../ui/form';
import { AttachmentSection, type AttachmentSectionHandle } from '../../ui/AttachmentSection';
import { CategoryChipSelector } from '../../ui/CategoryChipSelector';
import { fetchCategorias, fetchCartoes, saveCategoria } from '../../services/configService';
import { queryKeys } from '../../services/queryKeys';

const schema = z.object({
  descricao:       z.string().min(1, 'Informe a descrição'),
  valor_original:  z.coerce.number().min(0.01, 'Informe o valor inicial'),
  valor_final:     z.coerce.number().min(0).optional(),
  dataVencimento:  z.string().min(10, 'Informe o vencimento'),
  dataCompra:      z.string().optional(),
  categoria:       z.string().optional(),
  categoria_id:    z.coerce.number().optional(),
  cartao_id:       z.coerce.number().optional(),
  formaPagamento:  z.string().min(1),
  pago:            z.boolean(),
  recorrente:      z.boolean(),
  parcelado:       z.boolean(),
  total_parcelas:  z.coerce.number().int().min(2).optional(),
  numero_nf:       z.string().max(50).optional(),
  data_emissao_nf: z.string().optional(),
  tipo_despesa:    z.enum(['opex', 'capex']).optional(),
});

type FormData = z.infer<typeof schema>;

interface CategoriaSugestao { categoriaId: number; categoriaNome: string; }
interface DuplicataInfo { expense: Expense; pendingData: FormData; }

function CompactCheck({
  label, checked, onChange, icon,
}: {
  label: string; checked: boolean; onChange: (v: boolean) => void; icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all',
        checked
          ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 dark:border-brand-600'
          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-400',
      ].join(' ')}
    >
      <span className={[
        'flex h-3.5 w-3.5 items-center justify-center rounded-full border transition',
        checked ? 'border-brand-600 bg-brand-600' : 'border-slate-300 dark:border-slate-500',
      ].join(' ')}>
        {checked && <Check size={8} className="text-white" strokeWidth={3} />}
      </span>
      {icon}
      {label}
    </button>
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
  const defaultDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

  const isEmpresa = useMemo(() => localStorage.getItem('perfilAtivoTipo') === 'empresa', []);

  const categorias = useQuery({ queryKey: queryKeys.categorias, queryFn: fetchCategorias });
  const cartoes    = useQuery({ queryKey: queryKeys.cartoes,    queryFn: fetchCartoes });

  const attachmentRef = useRef<AttachmentSectionHandle>(null);
  const [anexos, setAnexos] = useState<Attachment[]>([]);

  const [batch, setBatch]          = useState<ExpenseFormValues[]>([]);
  const [isSavingAll, setIsSaving] = useState(false);

  const [showCatForm, setShowCatForm] = useState(false);
  const [novaCatNome, setNovaCatNome] = useState('');

  const [categoriaSugestao, setCategoriaSugestao] = useState<CategoriaSugestao | null>(null);
  const [duplicataInfo, setDuplicataInfo]         = useState<DuplicataInfo | null>(null);

  const criarCatMut = useMutation({
    mutationFn: (nome: string) => saveCategoria({ nome }),
    onSuccess: (cat) => {
      qc.invalidateQueries({ queryKey: queryKeys.categorias });
      form.setValue('categoria_id', cat.id as any);
      setShowCatForm(false);
      setNovaCatNome('');
    },
  });

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      descricao: '', valor_original: '' as unknown as number, valor_final: undefined,
      dataVencimento: defaultDate, dataCompra: defaultDate,
      categoria: '', categoria_id: undefined, cartao_id: undefined,
      formaPagamento: 'pix', pago: false, recorrente: false,
      parcelado: false, total_parcelas: 2,
      numero_nf: undefined, data_emissao_nf: undefined,
      tipo_despesa: undefined,
    },
  });

  const formaPagamento     = useWatch({ control: form.control, name: 'formaPagamento' });
  const cartaoId           = useWatch({ control: form.control, name: 'cartao_id' });
  const parcelado          = useWatch({ control: form.control, name: 'parcelado' });
  const recorrente         = useWatch({ control: form.control, name: 'recorrente' });
  const categoriaId        = useWatch({ control: form.control, name: 'categoria_id' });
  const totalParcelas      = useWatch({ control: form.control, name: 'total_parcelas' });
  const valorOriginalWatch = useWatch({ control: form.control, name: 'valor_original' });
  const valorFinalWatch    = useWatch({ control: form.control, name: 'valor_final' });
  const descricaoWatch     = useWatch({ control: form.control, name: 'descricao' });
  const isCredito = formaPagamento === 'credito';

  const efectivoFinal    = valorFinalWatch ?? valorOriginalWatch ?? 0;
  const jurosCalculado   = Math.max(0, efectivoFinal - (valorOriginalWatch ?? 0));
  const descontoCalculado = Math.max(0, (valorOriginalWatch ?? 0) - efectivoFinal);
  const valorPorParcela  = parcelado && (totalParcelas ?? 0) >= 2 && efectivoFinal > 0
    ? efectivoFinal / (totalParcelas ?? 1)
    : 0;

  // Feature 1: Auto-sugestão de categoria
  const cats = (categorias.data ?? []).filter((c) => c.ativo);
  useEffect(() => {
    if ((descricaoWatch?.length ?? 0) < 3 || categoriaId) {
      setCategoriaSugestao(null);
      return;
    }
    const timer = setTimeout(() => {
      const allCached = qc.getQueriesData<FinanceDashboardData>({ queryKey: ['dashboard'] });
      const allExpenses = allCached.flatMap(([, d]) => d?.expenses ?? []);
      const match = allExpenses.find(
        (e) => e.id !== expense?.id && e.descricao.toLowerCase().includes(descricaoWatch.toLowerCase()),
      );
      if (match) {
        const cat = cats.find((c) => c.nome === match.categoria);
        if (cat) setCategoriaSugestao({ categoriaId: cat.id, categoriaNome: cat.nome });
        else setCategoriaSugestao(null);
      } else {
        setCategoriaSugestao(null);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [descricaoWatch, categoriaId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deriva tipo_despesa automaticamente da categoria selecionada
  useEffect(() => {
    if (!categoriaId) return;
    const cat = cats.find((c) => c.id === Number(categoriaId));
    if (cat?.tipo_despesa) {
      form.setValue('tipo_despesa', cat.tipo_despesa);
    }
  }, [categoriaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCards = (cartoes.data ?? []).filter((c) => c.ativo);
  const paymentOptions = [
    { value: 'dinheiro', label: 'Dinheiro', icon: <Banknote size={13} /> },
    { value: 'pix',      label: 'PIX',      icon: <QrCode size={13} /> },
    { value: 'debito',   label: 'Débito',   icon: <CreditCard size={13} /> },
    ...activeCards.map((c) => ({
      value: `card:${c.id}`,
      label: c.nome + (c.numero_cartao ? ` ••${String(c.numero_cartao).slice(-2)}` : ''),
      icon: <CreditCard size={13} />,
    })),
  ];
  const paymentSelection = isCredito && cartaoId ? `card:${cartaoId}` : formaPagamento;

  const handlePaymentSelect = (v: string) => {
    if (v.startsWith('card:')) {
      form.setValue('formaPagamento', 'credito');
      form.setValue('cartao_id', Number(v.replace('card:', '')) as any);
    } else {
      form.setValue('formaPagamento', v);
      form.setValue('cartao_id', undefined);
    }
  };

  useEffect(() => {
    if (!open) {
      setBatch([]);
      setAnexos([]);
      setShowCatForm(false);
      setNovaCatNome('');
      setCategoriaSugestao(null);
      setDuplicataInfo(null);
      return;
    }
    setAnexos(expense?.anexos ?? []);
    const vOrig = expense?.valorOriginal ?? undefined;
    const vFinalDb = expense?.valorFinalTotal;
    form.reset({
      descricao:       expense?.descricao ?? '',
      valor_original:  vOrig ?? '' as unknown as number,
      valor_final:     (vFinalDb && vFinalDb !== vOrig) ? vFinalDb : undefined,
      dataVencimento:  expense?.dataVencimento ?? defaultDate,
      dataCompra:      expense?.dataCompra ?? defaultDate,
      categoria:       expense?.categoria ?? '',
      categoria_id:    undefined,
      cartao_id:       undefined,
      formaPagamento:  expense?.formaPagamento ?? 'pix',
      pago:            expense?.pago ?? false,
      recorrente:      false,
      parcelado:       expense?.parcelado ?? false,
      total_parcelas:  2,
      numero_nf:       expense?.numeroNf ?? undefined,
      data_emissao_nf: expense?.dataEmissaoNf ?? undefined,
      tipo_despesa:    expense?.tipoDespesa ?? undefined,
    });
  }, [expense, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toFormValues = (data: FormData, anexosArr: Attachment[] = []): ExpenseFormValues => ({
    descricao:       data.descricao,
    valor_original:  data.valor_original,
    valor_final:     data.valor_final,
    dataVencimento:  data.dataVencimento,
    dataCompra:      data.dataCompra,
    categoria:       data.categoria,
    categoria_id:    data.categoria_id ? Number(data.categoria_id) : undefined,
    cartao_id:       data.cartao_id    ? Number(data.cartao_id)    : undefined,
    formaPagamento:  data.formaPagamento,
    pago:            data.pago,
    recorrente:      data.recorrente,
    parcelado:       data.parcelado,
    total_parcelas:  data.parcelado ? data.total_parcelas : undefined,
    numero_nf:       isEmpresa ? (data.numero_nf ?? undefined) : undefined,
    data_emissao_nf: isEmpresa ? (data.data_emissao_nf ?? undefined) : undefined,
    tipo_despesa:    data.tipo_despesa ?? 'opex',
    anexos:          anexosArr,
  });

  const doSave = async (data: FormData) => {
    setIsSaving(true);
    try {
      await onSave([...batch, toFormValues(data, anexos)]);
      setBatch([]);
      setAnexos([]);
      setDuplicataInfo(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddToBatch = form.handleSubmit((data) => {
    setBatch((prev) => [...prev, toFormValues(data, anexos)]);
    setAnexos([]);
    form.reset({
      descricao: '', valor_original: '' as unknown as number, valor_final: undefined,
      dataVencimento: data.dataVencimento, dataCompra: data.dataCompra,
      categoria: '', categoria_id: data.categoria_id,
      cartao_id: data.cartao_id,
      formaPagamento: data.formaPagamento,
      pago: data.pago, recorrente: false, parcelado: false, total_parcelas: 2,
      numero_nf: undefined, data_emissao_nf: undefined,
      tipo_despesa: data.tipo_despesa,
    });
    setTimeout(() => form.setFocus('descricao'), 50);
  });

  // Feature 4: duplicate detection
  const handleSubmit = async (data: FormData) => {
    const seteAtras = new Date();
    seteAtras.setDate(seteAtras.getDate() - 7);
    const allCached = qc.getQueriesData<FinanceDashboardData>({ queryKey: ['dashboard'] });
    const allExpenses = allCached.flatMap(([, d]) => d?.expenses ?? []);
    const formValorEfetivo = data.valor_final ?? data.valor_original ?? 0;
    const dup = allExpenses.find(
      (e) =>
        e.id !== expense?.id &&
        e.descricao.toLowerCase() === data.descricao.toLowerCase() &&
        e.valorFinal === formValorEfetivo &&
        e.formaPagamento === data.formaPagamento &&
        new Date(e.dataVencimento) >= seteAtras,
    );
    if (dup && !duplicataInfo) {
      setDuplicataInfo({ expense: dup, pendingData: data });
      return;
    }
    await doSave(data);
  };

  const isEditing = !!expense;
  const hasBatch  = batch.length > 0;

  return (
    <Dialog open={open} title={expense ? 'Editar despesa' : 'Nova despesa'} description="Registre uma saída financeira" onClose={onClose} size="lg">
      <form className="grid gap-3" onSubmit={form.handleSubmit(handleSubmit)}>

        {/* ── Batch preview ─────────────────────────────────────── */}
        {hasBatch && !isEditing && (
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
            <p className="mb-2 text-xs font-bold text-brand-700">
              {batch.length} despesa{batch.length !== 1 ? 's' : ''} no lote:
            </p>
            <div className="grid gap-1.5 max-h-32 overflow-y-auto pr-1">
              {batch.map((item, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs shadow-sm border border-brand-100">
                  <span className="flex-1 truncate font-semibold text-slate-700">{item.descricao}</span>
                  <span className="shrink-0 text-slate-400">
                    {(item.valor_original ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setBatch((prev) => prev.filter((_, j) => j !== i))}
                    className="shrink-0 rounded p-0.5 text-slate-300 hover:text-red-500 transition"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Status: Já pago · Recorrente · Parcelado ─────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <Controller
            control={form.control}
            name="pago"
            render={({ field }) => (
              <CompactCheck
                label="Já pago"
                checked={field.value}
                onChange={(v) => { field.onChange(v); if (v) form.setValue('recorrente', false); }}
              />
            )}
          />
          <Controller
            control={form.control}
            name="recorrente"
            render={({ field }) => (
              <CompactCheck
                label="Recorrente"
                icon={<Repeat size={11} />}
                checked={field.value}
                onChange={(v) => { field.onChange(v); if (v) { form.setValue('parcelado', false); form.setValue('pago', false); } }}
              />
            )}
          />
          {!recorrente && (
            <Controller
              control={form.control}
              name="parcelado"
              render={({ field }) => (
                <CompactCheck
                  label="Parcelado"
                  icon={<Layers size={11} />}
                  checked={field.value}
                  onChange={(v) => field.onChange(v)}
                />
              )}
            />
          )}
        </div>

        {/* ── Descrição + Anexos ────────────────────────────────── */}
        <div className="grid gap-2">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Field label="Descrição" required error={form.formState.errors.descricao?.message}>
                <Input {...form.register('descricao')} placeholder="Ex: Conta de luz" />
              </Field>
            </div>
            <button
              type="button"
              onClick={() => attachmentRef.current?.openPicker()}
              title="Anexar arquivo"
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

          {categoriaSugestao && !categoriaId && (
            <div className="flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-xs dark:border-brand-800 dark:bg-brand-900/20">
              <Tag size={12} className="shrink-0 text-brand-400" />
              <span className="flex-1 text-slate-600 dark:text-slate-400">
                Categoria sugerida: <strong className="text-slate-700 dark:text-slate-300">{categoriaSugestao.categoriaNome}</strong>
              </span>
              <button
                type="button"
                onClick={() => { form.setValue('categoria_id', categoriaSugestao.categoriaId as any); setCategoriaSugestao(null); }}
                className="rounded bg-brand-100 px-2 py-0.5 font-semibold text-brand-700 hover:bg-brand-200 transition dark:bg-brand-900/40 dark:text-brand-400"
              >
                Usar
              </button>
              <button type="button" onClick={() => setCategoriaSugestao(null)} className="text-slate-300 hover:text-red-400 transition">
                <X size={12} />
              </button>
            </div>
          )}

          <div className={anexos.length > 0 ? 'rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50' : ''}>
            <AttachmentSection ref={attachmentRef} value={anexos} onChange={setAnexos} hideTrigger />
          </div>
        </div>

        {/* ── Valor + Datas ─────────────────────────────────────── */}
        <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
          {/* linha 1: valor inicial | valor final */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Valor inicial (R$)" required error={form.formState.errors.valor_original?.message} hint="Preço base">
              <Input
                {...form.register('valor_original')}
                type="number" step="0.01" min="0" placeholder="0,00" autoFocus
              />
            </Field>
            <Field label="Valor final (R$)" hint={jurosCalculado > 0 ? 'Com juros' : descontoCalculado > 0 ? 'Com desconto' : 'Com juros ou desconto'}>
              <Input
                {...form.register('valor_final')}
                type="number" step="0.01" min="0" placeholder="Igual ao inicial"
              />
            </Field>
          </div>

          {/* linha 2: datas + nº parcelas (quando parcelado) */}
          <div className={`grid gap-2 ${parcelado ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <Field label="Data da compra">
              <Input {...form.register('dataCompra')} type="date" />
            </Field>
            <Field label={parcelado ? 'Vencimento 1ª parcela' : 'Vencimento'} required error={form.formState.errors.dataVencimento?.message}>
              <Input {...form.register('dataVencimento')} type="date" />
            </Field>
            {parcelado && (
              <Field label="Nº de parcelas" error={form.formState.errors.total_parcelas?.message}>
                <Input
                  {...form.register('total_parcelas')}
                  type="number" min="2" max="60" placeholder="2"
                />
              </Field>
            )}
          </div>

          {/* preview de parcelas */}
          {parcelado && valorPorParcela > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-xs dark:border-brand-800 dark:bg-brand-900/20">
              {(valorOriginalWatch ?? 0) > 0 && (
                <span className="text-slate-500">
                  Inicial: <strong className="text-slate-700">{(valorOriginalWatch ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                </span>
              )}
              {jurosCalculado > 0 && (
                <span className="text-slate-500">
                  Juros: <strong className="text-amber-600">+{jurosCalculado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                </span>
              )}
              {descontoCalculado > 0 && (
                <span className="text-slate-500">
                  Desconto: <strong className="text-green-600">-{descontoCalculado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
                </span>
              )}
              <span className="font-semibold text-brand-700 ml-auto">
                {totalParcelas ?? 0}x de {valorPorParcela.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </div>
          )}
        </div>

        {/* ── Categoria ─────────────────────────────────────────── */}
        <Field label="Categoria" required>
          <Controller
            control={form.control}
            name="categoria_id"
            render={({ field }) => (
              <CategoryChipSelector
                categories={cats}
                value={field.value ? Number(field.value) : undefined}
                onChange={(id) => { field.onChange(id ?? undefined); if (id) setCategoriaSugestao(null); }}
                onCreateNew={() => { setShowCatForm((v) => !v); setNovaCatNome(''); }}
              />
            )}
          />

          {showCatForm && (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 p-2">
              <Tag size={13} className="shrink-0 text-brand-400" />
              <input
                type="text"
                value={novaCatNome}
                onChange={(e) => setNovaCatNome(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); if (novaCatNome.trim()) criarCatMut.mutate(novaCatNome.trim()); }
                }}
                placeholder="Nome da nova categoria"
                autoFocus
                className="flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-200"
              />
              <button
                type="button"
                disabled={!novaCatNome.trim() || criarCatMut.isPending}
                onClick={() => criarCatMut.mutate(novaCatNome.trim())}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50 transition whitespace-nowrap"
              >
                {criarCatMut.isPending ? '...' : 'Criar'}
              </button>
              <button type="button" onClick={() => setShowCatForm(false)} className="text-slate-400 hover:text-red-500 transition">
                <X size={14} />
              </button>
            </div>
          )}
          {criarCatMut.isError && (
            <p className="mt-1 text-xs text-red-600">{criarCatMut.error?.message}</p>
          )}
        </Field>

        {/* ── Forma de pagamento ────────────────────────────────── */}
        <Field label="Forma de pagamento">
          <ToggleGroup value={paymentSelection} options={paymentOptions} onChange={handlePaymentSelect} />
        </Field>

        {/* ── Feature 2: Nota Fiscal (empresa only) ────────────── */}
        {isEmpresa && (
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/30">
            <div className="col-span-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <FileText size={12} />
              Nota Fiscal
            </div>
            <Field label="Número da NF">
              <Input
                {...form.register('numero_nf')}
                placeholder="Ex: 000123456"
              />
            </Field>
            <Field label="Data de emissão">
              <Input {...form.register('data_emissao_nf')} type="date" />
            </Field>
          </div>
        )}

        {/* Feature 4: Aviso de duplicata */}
        {duplicataInfo && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-900/20">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-amber-800 dark:text-amber-400">Possível duplicata detectada</p>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-500">
                Já existe &ldquo;{duplicataInfo.expense.descricao}&rdquo; de{' '}
                {duplicataInfo.expense.valorFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}{' '}
                com vencimento em{' '}
                {new Date(duplicataInfo.expense.dataVencimento + 'T00:00:00').toLocaleDateString('pt-BR')}.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => doSave(duplicataInfo.pendingData)}
                disabled={isSaving || isSavingAll}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50 transition whitespace-nowrap"
              >
                Salvar mesmo assim
              </button>
              <button
                type="button"
                onClick={() => setDuplicataInfo(null)}
                className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-100 transition dark:border-amber-700 dark:text-amber-400"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {!isEditing && (
            <Button type="button" variant="secondary" icon={<Plus size={14} />} onClick={handleAddToBatch}>
              Adicionar ao lote
            </Button>
          )}
          <Button type="submit" disabled={isSaving || isSavingAll}>
            {isSaving || isSavingAll
              ? 'Salvando...'
              : isEditing
                ? 'Salvar alterações'
                : hasBatch
                  ? `Salvar lote (${batch.length + 1})`
                  : 'Registrar despesa'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
