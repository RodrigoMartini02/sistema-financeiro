import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Paperclip, X, Clock, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { MONTH_NAMES, type Attachment, type Income, type IncomeFormValues, type FinanceDashboardData } from '../../types/finance';
import { AttachmentSection, type AttachmentSectionHandle } from '../../ui/AttachmentSection';
import { Dialog } from '../../ui/dialog';
import {
  C, labelStyle, fieldInputStyle, smallInputStyle,
  cardStyle, panelStyle, chipStyle, MoneyField,
} from '../../ui/dialogFormTokens';
import { fetchRepresentantes } from '../../services/representantesService';
import { fetchIncomeTypes, saveIncomeType } from '../../services/incomeTypesService';
import { fetchContratosAtivos, fetchClientes, saveCliente } from '../../services/clientesService';
import { fetchIncomeSuggestions, type IncomeSuggestionMatch } from '../../services/incomeSuggestionsService';
import { suggestIncomeTypeForDescription } from '../../utils/incomeTypeSuggestions';
import { queryKeys } from '../../services/queryKeys';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const schema = z.object({
  descricao:       z.string().min(1, 'Informe a descrição'),
  valor:           z.coerce.number().positive('Valor deve ser maior que zero'),
  data:            z.string().min(10, 'Informe a data'),
  cliente:         z.string().optional(),
  tipoReceita:     z.string().optional(),
  representanteId: z.coerce.number().nullable().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean; month: number; year: number;
  income?: Income; isSaving: boolean; error?: string;
  onClose: () => void; onSave: (v: IncomeFormValues) => Promise<void>;
}

export function IncomeDialog({ open, month, year, income, isSaving, error, onClose, onSave }: Props) {
  const qc = useQueryClient();
  const defaultDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
  const isNew = !income;
  const isEmpresa = useMemo(() => localStorage.getItem('perfilAtivoTipo') === 'empresa', []);

  const bodyRef = useRef<HTMLDivElement>(null);
  const attachmentRef = useRef<AttachmentSectionHandle>(null);
  const [anexos, setAnexos] = useState<Attachment[]>([]);
  const [replicar, setReplicar] = useState(false);
  const [replicarMes, setReplicarMes] = useState(month);
  const [replicarAno, setReplicarAno] = useState(year);

  const [horasFaturar, setHorasFaturar] = useState(false);
  const [contratoId, setContratoId] = useState<number | null>(null);
  const [tipoHora, setTipoHora] = useState<'presencial' | 'remoto' | null>(null);
  const [quantidadeHoras, setQuantidadeHoras] = useState<number | ''>('');
  const [clienteTocado, setClienteTocado] = useState(false);
  const [representanteTocado, setRepresentanteTocado] = useState(false);

  const [showTipoForm, setShowTipoForm] = useState<string | null>(null);
  const [showClienteForm, setShowClienteForm] = useState<string | null>(null);
  const [tipoSugestao, setTipoSugestao] = useState<{ nome: string } | null>(null);
  const [duplicataInfo, setDuplicataInfo] = useState<{ income: Income } | null>(null);

  const horasGuide = useFirstAccessGuide('receitas:horas-v1');
  const replicarGuide = useFirstAccessGuide('receitas:replicar-v1');
  const representanteGuide = useFirstAccessGuide('receitas:representante-v1');

  const repsQ = useQuery({ queryKey: queryKeys.representantes, queryFn: fetchRepresentantes, staleTime: 60_000 });
  const representantes = repsQ.data ?? [];

  const contratosQ = useQuery({ queryKey: queryKeys.contratosAtivos, queryFn: fetchContratosAtivos, staleTime: 60_000 });
  const contratosAtivos = contratosQ.data ?? [];

  const typesQ = useQuery({ queryKey: queryKeys.incomeTypes, queryFn: fetchIncomeTypes, staleTime: 60_000 });
  const tiposReceita = (typesQ.data ?? []).filter((t) => t.ativo);

  const clientesQ = useQuery({ queryKey: queryKeys.clientes, queryFn: fetchClientes, staleTime: 60_000 });
  const clientes = clientesQ.data ?? [];

  const criarTipoMut = useMutation({
    mutationFn: (nome: string) => saveIncomeType(nome),
    onSuccess: (tipo) => {
      qc.invalidateQueries({ queryKey: queryKeys.incomeTypes });
      form.setValue('tipoReceita', tipo.nome);
      setShowTipoForm(null);
    },
  });

  const criarClienteMut = useMutation({
    mutationFn: (nome: string) => saveCliente({ nome, cnpj: null }),
    onSuccess: (cliente) => {
      qc.invalidateQueries({ queryKey: queryKeys.clientes });
      form.setValue('cliente', cliente.nome);
      setClienteTocado(true);
      setShowClienteForm(null);
    },
  });

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      descricao: '', valor: '' as unknown as number, data: defaultDate,
      cliente: '', tipoReceita: '', representanteId: null,
    },
  });

  const contratoSelecionado = contratoId ? (contratosAtivos.find((c) => c.id === contratoId) ?? null) : null;
  const valorHora = tipoHora === 'presencial'
    ? (contratoSelecionado?.horas_presenciais_valor ?? null)
    : tipoHora === 'remoto'
    ? (contratoSelecionado?.horas_remotas_valor ?? null)
    : null;
  const saldoAtual = tipoHora === 'presencial'
    ? (contratoSelecionado?.horas_presenciais_saldo_atual ?? null)
    : tipoHora === 'remoto'
    ? (contratoSelecionado?.horas_remotas_saldo_atual ?? null)
    : null;
  const valorCalculado = (valorHora && quantidadeHoras) ? Number(quantidadeHoras) * valorHora : null;

  useEffect(() => {
    if (valorCalculado && valorCalculado > 0) {
      form.setValue('valor', valorCalculado);
    }
  }, [valorCalculado, form]);

  // Contrato traz cliente e representante já vinculados — evita re-digitar/re-selecionar o que já existe.
  useEffect(() => {
    if (!contratoSelecionado) return;
    if (!clienteTocado && !form.getValues('cliente')) {
      form.setValue('cliente', contratoSelecionado.cliente_nome);
    }
    if (!representanteTocado && contratoSelecionado.representante_id && !form.getValues('representanteId')) {
      form.setValue('representanteId', contratoSelecionado.representante_id);
    }
  }, [contratoSelecionado, clienteTocado, representanteTocado, form]);

  useEffect(() => {
    if (!open) {
      setAnexos([]); setReplicar(false);
      setReplicarMes(month); setReplicarAno(year);
      setHorasFaturar(false); setContratoId(null); setTipoHora(null); setQuantidadeHoras('');
      setClienteTocado(false); setRepresentanteTocado(false);
      setShowTipoForm(null); setShowClienteForm(null);
      setTipoSugestao(null); setDuplicataInfo(null);
      return;
    }
    setAnexos(income?.anexos ?? []);
    setClienteTocado(!!income?.cliente);
    setRepresentanteTocado(!!income?.representanteId);
    form.reset({
      descricao:       income?.descricao ?? '',
      valor:           income?.valor ?? ('' as unknown as number),
      data:            income?.data ?? defaultDate,
      cliente:         income?.cliente ?? '',
      tipoReceita:     income?.tipoReceita ?? '',
      representanteId: income?.representanteId ?? null,
    });
  }, [income, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const descricaoWatch          = useWatch({ control: form.control, name: 'descricao' });
  const valorWatch               = useWatch({ control: form.control, name: 'valor' });
  const clienteWatch             = useWatch({ control: form.control, name: 'cliente' });
  const tipoReceitaWatch         = useWatch({ control: form.control, name: 'tipoReceita' });
  const representanteIdWatch     = useWatch({ control: form.control, name: 'representanteId' });

  const repSelecionado = representanteIdWatch
    ? representantes.find((r) => r.id === Number(representanteIdWatch))
    : null;
  const comissaoMatch = repSelecionado?.comissoes?.find((c) => c.tipo_receita === tipoReceitaWatch);
  const valorComissao =
    comissaoMatch && valorWatch > 0
      ? (valorWatch * Number(comissaoMatch.percentual)) / 100
      : null;
  const semComissaoConfigurada = !!repSelecionado && !!tipoReceitaWatch && !comissaoMatch;

  // Recentes: histórico local do dashboard já carregado, sem round-trip extra.
  const cachedIncomes = useMemo(() => {
    const allCached = qc.getQueriesData<FinanceDashboardData>({ queryKey: ['dashboard'] });
    return allCached.flatMap(([, data]) => data?.incomes ?? []);
  }, [qc, month, year]);

  // ── Sugestão de tipo de receita por histórico de descrição parecida (perfil PJ apenas) ──
  useEffect(() => {
    if (!isEmpresa || (descricaoWatch?.length ?? 0) < 3 || tipoReceitaWatch) {
      setTipoSugestao(null);
      return;
    }
    const timer = setTimeout(() => {
      const suggestion = suggestIncomeTypeForDescription(descricaoWatch, cachedIncomes, income?.id);
      setTipoSugestao(suggestion);
    }, 250);
    return () => clearTimeout(timer);
  }, [descricaoWatch, tipoReceitaWatch, cachedIncomes, income?.id]);

  // ── Autocomplete de descrição por histórico real (backend) ──
  const [debouncedDescricao, setDebouncedDescricao] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedDescricao(descricaoWatch ?? ''), 220);
    return () => clearTimeout(timer);
  }, [descricaoWatch]);

  const suggestionsQuery = useQuery({
    queryKey: queryKeys.incomeSuggestions(debouncedDescricao),
    queryFn: () => fetchIncomeSuggestions(debouncedDescricao),
    enabled: debouncedDescricao.trim().length >= 2,
  });

  const [acHidden, setAcHidden] = useState(false);
  const [acIndex, setAcIndex] = useState(-1);
  const acMatches: IncomeSuggestionMatch[] = acHidden ? [] : (suggestionsQuery.data?.matches ?? [])
    .filter((m) => m.descricao.toLowerCase() !== (descricaoWatch ?? '').toLowerCase())
    .slice(0, 4);
  const acOpen = acMatches.length > 0 && (descricaoWatch?.length ?? 0) >= 2;

  const applySuggestionMatch = (match: IncomeSuggestionMatch) => {
    form.setValue('descricao', match.descricao);
    if (!valorWatch) form.setValue('valor', match.valor);
    if (match.cliente && !clienteWatch) { form.setValue('cliente', match.cliente); setClienteTocado(true); }
    if (match.tipoReceita && !tipoReceitaWatch) form.setValue('tipoReceita', match.tipoReceita);
    setAcHidden(true);
    setAcIndex(-1);
  };

  const ultimoValorRecebido = suggestionsQuery.data?.matches.find(
    (m) => m.descricao.toLowerCase() === (descricaoWatch ?? '').toLowerCase(),
  )?.valor;

  // Detecção de duplicata: mesma descrição + valor + cliente nos últimos 7 dias — aviso não bloqueante.
  useEffect(() => {
    const desc = descricaoWatch?.trim();
    if (!desc || !valorWatch) { setDuplicataInfo(null); return; }
    const seteAtras = new Date();
    seteAtras.setDate(seteAtras.getDate() - 7);
    const dup = cachedIncomes.find((i) => {
      if (i.id === income?.id) return false;
      if (i.descricao.toLowerCase() !== desc.toLowerCase()) return false;
      if (i.valor !== valorWatch) return false;
      if ((i.cliente ?? '') !== (clienteWatch ?? '')) return false;
      if (new Date(i.data) < seteAtras) return false;
      return true;
    });
    setDuplicataInfo(dup ? { income: dup } : null);
  }, [descricaoWatch, valorWatch, clienteWatch, cachedIncomes, income?.id]);

  // Cliente precisa corresponder a um cadastro existente — combobox não aceita texto solto.
  const clienteValido = !clienteWatch?.trim() || clientes.some((c) => c.nome === clienteWatch.trim());

  const handleSubmit = async (data: FormData) => {
    const formValues: IncomeFormValues = {
      descricao:         data.descricao,
      valor:             data.valor,
      data:              data.data,
      cliente:           data.cliente,
      tipoReceita:       data.tipoReceita,
      representanteId:   data.representanteId,
      valorComissao:     valorComissao ?? null,
      anexos,
      replicarAte:       isNew && replicar ? { mes: replicarMes, ano: replicarAno } : null,
      contratoId:        isNew && horasFaturar ? contratoId : null,
      tipoHora:          isNew && horasFaturar ? tipoHora : null,
      quantidadeHoras:   isNew && horasFaturar && quantidadeHoras !== '' ? Number(quantidadeHoras) : null,
    };
    await onSave(formValues);
    setDuplicataInfo(null);
  };

  const submitForm = form.handleSubmit(handleSubmit);

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
    if (e.key === 'Tab' && tipoSugestao && !tipoReceitaWatch) {
      e.preventDefault();
      form.setValue('tipoReceita', tipoSugestao.nome);
      setTipoSugestao(null);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !acOpen) {
      e.preventDefault();
      if (clienteValido) submitForm();
      return;
    }
  };

  const currentYear = new Date().getFullYear();
  const replicarAnoOptions = Array.from({ length: 3 }, (_, i) => currentYear + i);
  const replicarMesOptions = Array.from({ length: 12 }, (_, i) => ({ value: i, label: MONTH_NAMES[i] }));

  return (
    <Dialog open={open} title={income ? 'Editar receita' : 'Nova receita'} description="Registre uma entrada financeira" onClose={onClose} size="lg" scrollBody={false}>
      <form
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 calc(-1 * var(--dialog-px))' }}
        onSubmit={submitForm}
        onKeyDown={handleKeyDown}
      >
        {/* Corpo rolável */}
        <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>

          {/* ── Descrição + Anexos ─────────────────────────────────── */}
          <div style={cardStyle}>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7, position: 'relative' }}>
              <label style={labelStyle}>
                <span>DESCRIÇÃO</span><span style={{ color: C.primary }}>*</span>
              </label>
              <input
                {...form.register('descricao', { onChange: () => setAcHidden(false) })}
                placeholder="Ex: Salário mensal"
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
                          {brl(match.valor)}{match.cliente ? ` · ${match.cliente}` : ''}
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
                  title="Anexar arquivo"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, fontSize: '12.5px', fontWeight: 600,
                    color: anexos.length > 0 ? C.primary : C.textMuted, cursor: 'pointer', background: 'transparent', border: 'none', padding: 0,
                  }}
                >
                  <Paperclip size={13} />
                  <span>Anexar arquivo{anexos.length > 0 ? ` (${anexos.length})` : ''}</span>
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
                {tipoSugestao && !tipoReceitaWatch && (
                  <button
                    type="button"
                    onClick={() => { form.setValue('tipoReceita', tipoSugestao.nome); setTipoSugestao(null); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12.5px', color: C.primaryDark, cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
                  >
                    <span style={{ fontWeight: 600, background: C.primarySoft, border: `1px solid ${C.primarySoftBorder}`, borderRadius: 6, padding: '2px 7px' }}>
                      {tipoSugestao.nome}
                    </span>
                    <span style={{ color: C.textMuted }}>sugerido · Tab aceita</span>
                  </button>
                )}
              </div>
              <div style={{ display: 'none' }}>
                <AttachmentSection ref={attachmentRef} value={anexos} onChange={setAnexos} hideTrigger />
              </div>
            </div>
          </div>

          {/* ── Valor + Data + Cliente ─────────────────────────────── */}
          <div style={cardStyle}>
            <div className="grid grid-cols-1 gap-y-3 sm:grid-cols-[1fr_168px]" style={{ columnGap: 18 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <label style={labelStyle}>
                  <span>VALOR</span><span style={{ color: C.primary }}>*</span>
                </label>
                <Controller
                  control={form.control}
                  name="valor"
                  render={({ field }) => <MoneyField value={field.value || undefined} onChange={field.onChange} />}
                />
                <div style={{ fontSize: 12, color: C.textFaint, minHeight: 16 }}>
                  {ultimoValorRecebido ? `Última vez você recebeu ${brl(ultimoValorRecebido)}` : ''}
                </div>
                {form.formState.errors.valor?.message && (
                  <div style={{ fontSize: 12, color: '#b42318' }}>{form.formState.errors.valor.message}</div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <label style={labelStyle}>
                  <span>DATA</span><span style={{ color: C.primary }}>*</span>
                </label>
                <input {...form.register('data')} type="date" style={{ ...fieldInputStyle, fontSize: 14 }} />
              </div>
            </div>

            <div style={{ marginTop: 2, display: 'flex', flexDirection: 'column', gap: 7, position: 'relative' }}>
              <label style={labelStyle}>CLIENTE / FONTE</label>
              <input
                {...form.register('cliente', { onChange: () => setClienteTocado(true) })}
                list="clientes-datalist"
                placeholder="Ex: Empresa XYZ"
                autoComplete="off"
                style={{
                  ...fieldInputStyle, height: 42, fontSize: 14,
                  border: `1.5px solid ${!clienteValido ? '#b42318' : C.borderInput}`,
                }}
              />
              <datalist id="clientes-datalist">
                {clientes.map((c) => <option key={c.id} value={c.nome} />)}
              </datalist>
              {!clienteValido && clienteWatch?.trim() && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ color: '#b42318' }}>Cliente não cadastrado.</span>
                  <button
                    type="button"
                    onClick={() => setShowClienteForm(clienteWatch.trim())}
                    style={{ fontWeight: 600, color: C.primaryDark, cursor: 'pointer', background: 'transparent', border: 'none', padding: 0 }}
                  >
                    + Cadastrar "{clienteWatch.trim()}"
                  </button>
                </div>
              )}
              {showClienteForm !== null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, border: `1.5px solid ${C.primary}`, background: C.primarySoft, padding: 8 }}>
                  <input
                    type="text"
                    defaultValue={showClienteForm}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); const v = e.currentTarget.value.trim(); if (v) criarClienteMut.mutate(v); }
                      if (e.key === 'Escape') { e.preventDefault(); setShowClienteForm(null); }
                    }}
                    id="novo-cliente-input"
                    style={{ flex: 1, height: 32, borderRadius: 8, border: `1px solid ${C.borderInput}`, background: '#fff', padding: '0 10px', fontSize: 13, color: C.text, outline: 'none' }}
                  />
                  <button
                    type="button"
                    disabled={criarClienteMut.isPending}
                    onClick={() => {
                      const el = document.getElementById('novo-cliente-input') as HTMLInputElement | null;
                      const v = el?.value.trim();
                      if (v) criarClienteMut.mutate(v);
                    }}
                    style={{ borderRadius: 8, background: C.primary, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    {criarClienteMut.isPending ? '...' : 'Criar'}
                  </button>
                  <button type="button" onClick={() => setShowClienteForm(null)} style={{ color: C.textMuted, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex' }}>
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Tipo de receita (perfil PJ apenas) ────────────────── */}
          {isEmpresa && (tiposReceita.length > 0 || showTipoForm !== null) && (
            <div style={cardStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 15 }}>
                  <label style={{ ...labelStyle, height: 'auto' }}>TIPO DE RECEITA</label>
                  <span style={{ fontSize: 11, color: '#a8bac4' }}>opcional</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {tiposReceita.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => form.setValue('tipoReceita', tipoReceitaWatch === t.nome ? '' : t.nome)}
                      style={chipStyle(tipoReceitaWatch === t.nome)}
                    >
                      {t.nome}
                    </div>
                  ))}
                  <div
                    onClick={() => setShowTipoForm('')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                      height: 42, padding: '0 10px', borderRadius: 10, fontSize: 12.5, fontWeight: 600,
                      border: `1.5px dashed ${C.chipOffBorder}`, color: C.textMuted, background: '#fff',
                    }}
                  >
                    <span>+</span> novo
                  </div>
                </div>
                {showTipoForm !== null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, border: `1.5px solid ${C.primary}`, background: C.primarySoft, padding: 8 }}>
                    <input
                      type="text"
                      defaultValue={showTipoForm}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); const v = e.currentTarget.value.trim(); if (v) criarTipoMut.mutate(v); }
                        if (e.key === 'Escape') { e.preventDefault(); setShowTipoForm(null); }
                      }}
                      id="novo-tipo-input"
                      placeholder="Nome do tipo de receita"
                      style={{ flex: 1, height: 32, borderRadius: 8, border: `1px solid ${C.borderInput}`, background: '#fff', padding: '0 10px', fontSize: 13, color: C.text, outline: 'none' }}
                    />
                    <button
                      type="button"
                      disabled={criarTipoMut.isPending}
                      onClick={() => {
                        const el = document.getElementById('novo-tipo-input') as HTMLInputElement | null;
                        const v = el?.value.trim();
                        if (v) criarTipoMut.mutate(v);
                      }}
                      style={{ borderRadius: 8, background: C.primary, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >
                      {criarTipoMut.isPending ? '...' : 'Criar'}
                    </button>
                    <button type="button" onClick={() => setShowTipoForm(null)} style={{ color: C.textMuted, background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex' }}>
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Representante (perfil PJ apenas) ──────────────────── */}
          {isEmpresa && representantes.length > 0 && (
            <div style={cardStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, position: 'relative' }}>
                <label style={{ ...labelStyle, height: 'auto' }}>REPRESENTANTE</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <div
                    onClick={() => { form.setValue('representanteId', null); setRepresentanteTocado(true); }}
                    style={chipStyle(!representanteIdWatch)}
                  >
                    Nenhum
                  </div>
                  {representantes.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => { form.setValue('representanteId', r.id); setRepresentanteTocado(true); }}
                      style={chipStyle(Number(representanteIdWatch) === r.id)}
                    >
                      {r.nome}
                    </div>
                  ))}
                </div>
                {representanteGuide.isVisible && (
                  <FirstAccessGuideCard
                    floating
                    placement="bottom"
                    className="absolute left-0 top-full z-[45] mt-3 w-[min(24rem,calc(100vw-2rem))]"
                    icon={Users}
                    description={firstAccessGuideMessages.receitasRepresentante}
                    onDismiss={representanteGuide.dismiss}
                  />
                )}

                {valorComissao !== null && repSelecionado && comissaoMatch && (
                  <div style={{ ...panelStyle, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{repSelecionado.nome}</span>
                    <span style={{ fontSize: 13, color: C.textMuted }}>receberá</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.primaryDark }}>{brl(valorComissao)}</span>
                    <span style={{ fontSize: 13, color: C.textFaint }}>·</span>
                    <span style={{ fontSize: 13, color: C.textMuted }}>{comissaoMatch.percentual}%</span>
                    <span style={{ fontSize: 13, color: C.textFaint }}>·</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, textTransform: 'capitalize', borderRadius: 999,
                      background: C.primarySoft, padding: '2px 8px', color: C.primaryDark,
                    }}>
                      {comissaoMatch.tipo === 'unica' ? 'única' : 'mensal'}
                    </span>
                  </div>
                )}
                {semComissaoConfigurada && (
                  <div style={{ ...panelStyle, background: C.warnBg, borderColor: C.warnBorder }}>
                    <span style={{ fontSize: 12.5, color: C.warn }}>
                      Nenhuma comissão configurada para este tipo de receita.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Horas a faturar (nova receita only) ───────────────── */}
          {isNew && contratosAtivos.length > 0 && (
            <div style={cardStyle}>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => { setHorasFaturar((v) => !v); if (horasFaturar) { setContratoId(null); setTipoHora(null); setQuantidadeHoras(''); } }}
                  style={{
                    display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
                    fontSize: 13, fontWeight: 700, color: C.text, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Clock size={14} />Horas a faturar...</span>
                  {horasFaturar ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {horasGuide.isVisible && (
                  <FirstAccessGuideCard
                    floating
                    placement="bottom"
                    className="absolute left-0 top-full z-[45] mt-3 w-[min(24rem,calc(100vw-2rem))]"
                    icon={Clock}
                    description={firstAccessGuideMessages.receitasHoras}
                    onDismiss={horasGuide.dismiss}
                  />
                )}
                {horasFaturar && (
                  <div style={panelStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <label style={labelStyle}>CONTRATO</label>
                      <select
                        value={contratoId ?? ''}
                        onChange={(e) => { setContratoId(e.target.value ? Number(e.target.value) : null); setTipoHora(null); setQuantidadeHoras(''); }}
                        style={{ ...smallInputStyle, width: '100%' }}
                      >
                        <option value="">Selecione o contrato</option>
                        {contratosAtivos.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.cliente_nome}{c.numero ? ` — ${c.numero}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {contratoSelecionado && (
                      <>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {(contratoSelecionado.horas_presenciais_valor ?? 0) > 0 && (
                            <div onClick={() => setTipoHora('presencial')} style={chipStyle(tipoHora === 'presencial', { h: 36, r: 9, size: 12.5 })}>
                              Presencial
                            </div>
                          )}
                          {(contratoSelecionado.horas_remotas_valor ?? 0) > 0 && (
                            <div onClick={() => setTipoHora('remoto')} style={chipStyle(tipoHora === 'remoto', { h: 36, r: 9, size: 12.5 })}>
                              Remoto
                            </div>
                          )}
                        </div>

                        {tipoHora && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                              <label style={labelStyle}>QUANTIDADE DE HORAS</label>
                              <input
                                type="number"
                                min="0.5"
                                step="0.5"
                                value={quantidadeHoras}
                                onChange={(e) => setQuantidadeHoras(e.target.value !== '' ? Number(e.target.value) : '')}
                                placeholder="0"
                                style={smallInputStyle}
                              />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted }}>
                                {valorHora != null ? `${brl(valorHora)}/h` : '—'}
                              </span>
                              {saldoAtual != null && (
                                <span style={{ fontSize: 12, color: C.textFaint }}>Saldo: {saldoAtual}h disponíveis</span>
                              )}
                            </div>
                          </div>
                        )}

                        {valorCalculado != null && valorCalculado > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, border: `1px solid ${C.primarySoftBorder}`, background: C.primarySoft, padding: '8px 12px' }}>
                            <span style={{ fontSize: 13, color: C.primaryDark }}>Valor calculado:</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: C.primaryDark }}>{brl(valorCalculado)}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Replicar até (nova receita only) ──────────────────── */}
          {isNew && (
            <div style={{ ...cardStyle, marginBottom: 14 }}>
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setReplicar((v) => !v)}
                  style={{
                    display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between',
                    fontSize: 13, fontWeight: 700, color: C.text, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                  }}
                >
                  <span>Replicar até...</span>
                  {replicar ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
                {replicarGuide.isVisible && (
                  <FirstAccessGuideCard
                    floating
                    placement="top"
                    className="absolute left-0 bottom-full z-[45] mb-3 w-[min(24rem,calc(100vw-2rem))]"
                    icon={ChevronDown}
                    description={firstAccessGuideMessages.receitasReplicar}
                    onDismiss={replicarGuide.dismiss}
                  />
                )}
                {replicar && (
                  <div style={panelStyle}>
                    <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap sm:gap-3">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1, minWidth: 140 }}>
                        <label style={labelStyle}>MÊS</label>
                        <select
                          value={replicarMes}
                          onChange={(e) => setReplicarMes(Number(e.target.value))}
                          style={{ ...smallInputStyle, width: '100%' }}
                        >
                          {replicarMesOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, width: 100 }}>
                        <label style={labelStyle}>ANO</label>
                        <select
                          value={replicarAno}
                          onChange={(e) => setReplicarAno(Number(e.target.value))}
                          style={{ ...smallInputStyle, width: '100%' }}
                        >
                          {replicarAnoOptions.map((a) => (
                            <option key={a} value={a}>{a}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div style={{ margin: '0 var(--dialog-px) 14px', borderRadius: 10, border: '1px solid #fbd5d1', background: '#fef3f2', padding: '10px 14px', fontSize: 13, color: '#b42318' }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Rodapé fixo ──────────────────────────────────────────── */}
        <div style={{ flex: 'none', borderTop: '1px solid #eef3f6', background: '#fafcfd', padding: '14px var(--dialog-px) 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {duplicataInfo && (
            <div style={{ fontSize: '12.5px', color: '#a3728a' }}>
              Você já lançou "{duplicataInfo.income.descricao}" nos últimos 7 dias — é outra receita?
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16 }}>
            <button
              type="submit"
              disabled={isSaving || !clienteValido}
              style={{
                padding: '12px 22px', borderRadius: 11, fontSize: 14, fontWeight: 700,
                whiteSpace: 'nowrap', border: 'none', transition: 'all .15s ease',
                cursor: isSaving || !clienteValido ? 'not-allowed' : 'pointer',
                ...(!isSaving && clienteValido
                  ? { background: C.primary, color: '#fff', boxShadow: '0 6px 16px -6px rgba(8,145,178,0.75)' }
                  : { background: '#e6edf1', color: '#a3b6c0', boxShadow: 'none' }),
              }}
            >
              {isSaving ? 'Salvando...' : income ? 'Salvar alterações' : 'Registrar receita'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
