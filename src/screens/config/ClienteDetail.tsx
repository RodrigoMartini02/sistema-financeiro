import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Plus, Trash2, RefreshCw, Check, X,
  Package, FileText, AlertTriangle, ChevronRight,
} from 'lucide-react';
import {
  fetchContratos, saveContrato, encerrarContrato, gerarPrevistas,
  fetchContratosServicos, vincularServico, atualizarServicoContrato, desvincularServico,
  type Cliente, type Contrato, type ServicoContrato,
} from '../../services/clientesService';
import { fetchServicos, type Servico } from '../../services/servicosService';
import { fetchRepresentantes, type Representante } from '../../services/representantesService';
import { queryKeys } from '../../services/queryKeys';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { Field, Input, Textarea, ToggleGroup, SectionDivider } from '../../ui/form';
import { EmptyState } from '../../ui/states';
import { formatCurrency } from '../finance/formatters';

// ─── Contrato Form ────────────────────────────────────────────────────────────

function ContratoForm({
  clienteId, initial, representantes, onSave, onCancel, isSaving,
}: {
  clienteId: number;
  initial?: Partial<Contrato>;
  representantes: Representante[];
  onSave: (data: Parameters<typeof saveContrato>[0]) => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState({
    numero:                       initial?.numero ?? '',
    data_assinatura:              initial?.data_assinatura ?? '',
    vencimento:                   initial?.vencimento ?? '',
    data_inicio_faturamento:      initial?.data_inicio_faturamento ?? '',
    ajuste:                       initial?.ajuste ?? 'NADA CONSTA',
    observacoes:                  initial?.observacoes ?? '',
    num_aditivo:                  String(initial?.num_aditivo ?? 0),
    data_aditivo:                 initial?.data_aditivo ?? '',
    representante_id:             String(initial?.representante_id ?? ''),
    implantacao_parcelas:         String(initial?.implantacao_parcelas ?? 1),
    implantacao_total:            String(((initial?.implantacao_parcelas ?? 1) * (initial?.implantacao_valor_parcela ?? 0)) || ''),
    horas_presenciais_valor:       String(initial?.horas_presenciais_valor ?? ''),
    horas_presenciais_saldo_ini:   String(initial?.horas_presenciais_saldo_ini ?? ''),
    horas_presenciais_saldo_atual: String(initial?.horas_presenciais_saldo_atual ?? ''),
    horas_remotas_valor:           String(initial?.horas_remotas_valor ?? ''),
    horas_remotas_saldo_ini:       String(initial?.horas_remotas_saldo_ini ?? ''),
    horas_remotas_saldo_atual:     String(initial?.horas_remotas_saldo_atual ?? ''),
    valor_contrato:                String(initial?.valor_contrato ?? ''),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const parcelas     = parseInt(form.implantacao_parcelas) || 1;
  const totalImplant = parseFloat(form.implantacao_total) || 0;
  const valorParcela = parcelas > 0 ? totalImplant / parcelas : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      cliente_id:                   clienteId,
      numero:                       form.numero || null,
      data_assinatura:              form.data_assinatura || null,
      vencimento:                   form.vencimento,
      data_aditivo:                 form.data_aditivo || null,
      num_aditivo:                  parseInt(form.num_aditivo) || 0,
      ajuste:                       form.ajuste || null,
      data_inicio_faturamento:      form.data_inicio_faturamento || null,
      observacoes:                  form.observacoes || null,
      representante_id:             form.representante_id ? parseInt(form.representante_id) : null,
      implantacao_parcelas:         parcelas,
      implantacao_valor_parcela:    parseFloat(valorParcela.toFixed(2)),
      horas_presenciais_valor:       parseFloat(form.horas_presenciais_valor) || 0,
      horas_presenciais_saldo_ini:   parseFloat(form.horas_presenciais_saldo_ini) || 0,
      horas_presenciais_saldo_atual: parseFloat(form.horas_presenciais_saldo_atual) || 0,
      horas_remotas_valor:           parseFloat(form.horas_remotas_valor) || 0,
      horas_remotas_saldo_ini:       parseFloat(form.horas_remotas_saldo_ini) || 0,
      horas_remotas_saldo_atual:     parseFloat(form.horas_remotas_saldo_atual) || 0,
      valor_contrato:                parseFloat(form.valor_contrato) || 0,
    } as Parameters<typeof saveContrato>[0]);
  };

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">

      {/* Datas e identificação */}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Número do contrato">
          <Input value={form.numero} onChange={(e) => set('numero', e.target.value)} placeholder="001/2025" />
        </Field>
        <Field label="Data de assinatura">
          <Input type="date" value={form.data_assinatura} onChange={(e) => set('data_assinatura', e.target.value)} />
        </Field>
        <Field label="Vencimento" required>
          <Input type="date" value={form.vencimento} onChange={(e) => set('vencimento', e.target.value)} required />
        </Field>
        <Field label="Início faturamento">
          <Input type="date" value={form.data_inicio_faturamento} onChange={(e) => set('data_inicio_faturamento', e.target.value)} />
        </Field>
        <Field label="Aditivo nº">
          <Input type="number" min="0" value={form.num_aditivo} onChange={(e) => set('num_aditivo', e.target.value)} placeholder="0" />
        </Field>
        <Field label="Data do aditivo">
          <Input type="date" value={form.data_aditivo} onChange={(e) => set('data_aditivo', e.target.value)} />
        </Field>
      </div>

      {/* Valor do contrato */}
      <Field label="Valor do contrato">
        <Input
          type="number" min="0" step="0.01"
          value={form.valor_contrato}
          onChange={(e) => set('valor_contrato', e.target.value)}
          placeholder="0,00"
        />
      </Field>

      {/* Reajuste */}
      <Field label="Reajuste">
        <ToggleGroup
          value={['IGPM', 'IPCA'].includes(form.ajuste) ? form.ajuste : 'NADA CONSTA'}
          options={[
            { value: 'NADA CONSTA', label: 'Nada consta' },
            { value: 'IGPM',        label: 'IGPM' },
            { value: 'IPCA',        label: 'IPCA' },
          ]}
          onChange={(v) => set('ajuste', v)}
        />
      </Field>

      {/* Representante */}
      {representantes.length > 0 && (
        <>
          <SectionDivider label="Representante" />
          <ToggleGroup
            value={form.representante_id}
            options={[
              { value: '', label: 'Nenhum' },
              ...representantes.map((r) => ({ value: String(r.id), label: r.nome })),
            ]}
            onChange={(v) => set('representante_id', v)}
          />
        </>
      )}

      {/* Implantação */}
      <SectionDivider label="Implantação" />
      <div className="grid grid-cols-3 gap-4 items-end">
        <Field label="Total implantação">
          <Input type="number" min="0" step="0.01" value={form.implantacao_total} onChange={(e) => set('implantacao_total', e.target.value)} placeholder="0,00" />
        </Field>
        <Field label="Nº de parcelas">
          <Input type="number" min="1" value={form.implantacao_parcelas} onChange={(e) => set('implantacao_parcelas', e.target.value)} placeholder="1" />
        </Field>
        <Field label="Valor por parcela">
          <div className="flex h-10 items-center px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-800">
            {formatCurrency(valorParcela)}
          </div>
        </Field>
      </div>

      {/* Serviços Técnicos */}
      <SectionDivider label="Serviços Técnicos" />
      <div className="grid gap-4">
        {([
          {
            label:    'Hora Presencial',
            valorKey: 'horas_presenciais_valor'        as keyof typeof form,
            iniKey:   'horas_presenciais_saldo_ini'    as keyof typeof form,
            atualKey: 'horas_presenciais_saldo_atual'  as keyof typeof form,
          },
          {
            label:    'Hora Remoto',
            valorKey: 'horas_remotas_valor'            as keyof typeof form,
            iniKey:   'horas_remotas_saldo_ini'        as keyof typeof form,
            atualKey: 'horas_remotas_saldo_atual'      as keyof typeof form,
          },
        ]).map(({ label, valorKey, iniKey, atualKey }) => (
          <div key={label} className="grid gap-2">
            <p className="text-sm font-semibold text-slate-700">{label}</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Valor/hora">
                <Input type="number" min="0" step="0.01" value={form[valorKey]} onChange={(e) => set(valorKey, e.target.value)} placeholder="0,00" />
              </Field>
              <Field label="Saldo inicial">
                <Input type="number" min="0" step="0.5" value={form[iniKey]} onChange={(e) => set(iniKey, e.target.value)} placeholder="0" />
              </Field>
              <Field label="Saldo atual">
                <Input type="number" min="0" step="0.5" value={form[atualKey]} onChange={(e) => set(atualKey, e.target.value)} placeholder="0" />
              </Field>
            </div>
          </div>
        ))}
      </div>

      {/* Observações */}
      <Field label="Observações">
        <Textarea value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} placeholder="Anotações sobre o contrato..." rows={2} />
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar contrato'}</Button>
      </div>
    </form>
  );
}

// ─── Catálogo Serviço Row ─────────────────────────────────────────────────────

function CatalogoServicoRow({ servico, vinculo, onVincular, onAtualizar, onDesvincular }: {
  servico: Servico;
  vinculo?: ServicoContrato;
  onVincular: (valorMensal: number) => void;
  onAtualizar: (data: Partial<Pick<ServicoContrato, 'valor_mensal' | 'implantado' | 'faturando'>>) => void;
  onDesvincular: () => void;
}) {
  const isLinked = !!vinculo;
  const [checked, setChecked]       = useState(isLinked);
  const [valor, setValor]           = useState(String(vinculo?.valor_mensal ?? servico.valor_mensal_padrao ?? 0));
  const [implantado, setImplantado] = useState(vinculo?.implantado ?? false);
  const [faturando, setFaturando]   = useState(vinculo?.faturando ?? false);
  const [dirty, setDirty]           = useState(false);

  useEffect(() => {
    setChecked(!!vinculo);
    setValor(String(vinculo?.valor_mensal ?? servico.valor_mensal_padrao ?? 0));
    setImplantado(vinculo?.implantado ?? false);
    setFaturando(vinculo?.faturando ?? false);
    setDirty(false);
  }, [vinculo?.id, servico.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = () => {
    if (checked) {
      onDesvincular();
    } else {
      onVincular(parseFloat(valor) || (servico.valor_mensal_padrao ?? 0));
    }
  };

  const handleSave = () => {
    onAtualizar({ valor_mensal: parseFloat(valor) || 0, implantado, faturando });
    setDirty(false);
  };

  const handleCancel = () => {
    setValor(String(vinculo?.valor_mensal ?? servico.valor_mensal_padrao ?? 0));
    setImplantado(vinculo?.implantado ?? false);
    setFaturando(vinculo?.faturando ?? false);
    setDirty(false);
  };

  const change = (fn: () => void) => { fn(); if (checked) setDirty(true); };

  return (
    <div className={[
      'flex items-center gap-4 border-b border-slate-100 last:border-0 px-4 py-3 transition-colors',
      checked ? 'bg-white hover:bg-slate-50/60' : 'bg-slate-50/40',
    ].join(' ')}>
      <input
        type="checkbox"
        checked={checked}
        onChange={handleToggle}
        className="h-4 w-4 shrink-0 cursor-pointer accent-brand-600"
      />
      <span className={`flex-1 text-sm font-medium truncate ${checked ? 'text-slate-800' : 'text-slate-400'}`}>
        {servico.nome}
      </span>
      <input
        type="number" min="0" step="0.01"
        value={valor}
        onChange={(e) => change(() => setValor(e.target.value))}
        disabled={!checked}
        placeholder="0,00"
        className="w-24 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-right disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
      />
      <label className={`flex items-center gap-1.5 text-xs ${checked ? 'text-slate-500' : 'text-slate-300'}`}>
        <input type="checkbox" checked={implantado} onChange={(e) => change(() => setImplantado(e.target.checked))} disabled={!checked} className="h-3.5 w-3.5 cursor-pointer accent-brand-600 disabled:opacity-30" />
        Implantado
      </label>
      <label className={`flex items-center gap-1.5 text-xs ${checked ? 'text-slate-500' : 'text-slate-300'}`}>
        <input type="checkbox" checked={faturando} onChange={(e) => change(() => setFaturando(e.target.checked))} disabled={!checked} className="h-3.5 w-3.5 cursor-pointer accent-brand-600 disabled:opacity-30" />
        Faturando
      </label>
      <div className="flex gap-1 shrink-0 w-[90px] justify-end">
        {dirty ? (
          <>
            <button onClick={handleSave} className="flex items-center gap-1 rounded-lg bg-brand-600 px-2 py-1 text-xs font-semibold text-white hover:bg-brand-700">
              <Check size={11} /> Salvar
            </button>
            <button onClick={handleCancel} className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
              <X size={11} />
            </button>
          </>
        ) : (
          checked && (
            <button onClick={onDesvincular} className="rounded p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors" title="Remover">
              <Trash2 size={13} />
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ─── Contrato Row ─────────────────────────────────────────────────────────────

function ContratoRow({ contrato, index, onClick }: {
  contrato: Contrato;
  index: number;
  onClick: () => void;
}) {
  const isAtivo = contrato.status === 'ativo';
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group flex w-full items-center gap-4 rounded-xl border px-5 py-4 text-left shadow-sm transition hover:shadow-md',
        isAtivo
          ? 'border-brand-300 bg-brand-50/40 hover:border-brand-400'
          : 'border-slate-200 bg-white opacity-60 hover:opacity-100 hover:border-slate-300',
      ].join(' ')}
    >
      <span className={[
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-mono text-sm font-semibold transition',
        isAtivo ? 'bg-brand-100 text-brand-700 group-hover:bg-brand-200' : 'bg-slate-100 text-slate-500',
      ].join(' ')}>
        {String(index + 1).padStart(2, '0')}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {contrato.numero ? `Contrato ${contrato.numero}` : 'Sem número'}
          </p>
          <span className={[
            'rounded-full px-2 py-0.5 text-[10px] font-bold shrink-0',
            isAtivo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500',
          ].join(' ')}>
            {isAtivo ? 'Em vigor' : 'Encerrado'}
          </span>
          {contrato.num_aditivo > 0 && (
            <span className="text-[10px] text-slate-400 shrink-0">{contrato.num_aditivo}º Aditivo</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
          {contrato.vencimento && <span>Vence: {contrato.vencimento}</span>}
          {contrato.representante_nome && <span>· {contrato.representante_nome}</span>}
        </div>
      </div>

      <ChevronRight
        size={15}
        className={[
          'shrink-0 text-slate-300 transition group-hover:translate-x-0.5',
          isAtivo ? 'group-hover:text-brand-400' : 'group-hover:text-slate-400',
        ].join(' ')}
      />
    </button>
  );
}

// ─── Contrato Modal ───────────────────────────────────────────────────────────

function ContratoModal({
  open, contrato, clienteId, representantes, isSaving, onSave, onClose, onEncerrar,
}: {
  open: boolean;
  contrato?: Contrato;
  clienteId: number;
  representantes: Representante[];
  isSaving: boolean;
  onSave: (data: Parameters<typeof saveContrato>[0]) => void;
  onClose: () => void;
  onEncerrar?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'dados' | 'servicos'>('dados');
  const qc = useQueryClient();

  useEffect(() => { if (open) setActiveTab('dados'); }, [open, contrato?.id]);

  const catalogoQ = useQuery({
    queryKey: queryKeys.servicos,
    queryFn: () => fetchServicos(true),
    enabled: open && !!contrato,
  });

  const servicosContratoQ = useQuery({
    queryKey: queryKeys.contratosServicos(contrato?.id ?? 0),
    queryFn: () => fetchContratosServicos(contrato!.id),
    enabled: open && !!contrato,
  });

  const vincularMut = useMutation({
    mutationFn: ({ servicoId, valorMensal }: { servicoId: number; valorMensal: number }) =>
      vincularServico(contrato!.id, servicoId, valorMensal),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.contratosServicos(contrato!.id) }),
  });

  const atualizarServicoMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof atualizarServicoContrato>[1] }) =>
      atualizarServicoContrato(id, data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.contratosServicos(contrato!.id) }),
  });

  const desvincularMut = useMutation({
    mutationFn: desvincularServico,
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.contratosServicos(contrato!.id) }),
  });

  const catalogo       = catalogoQ.data ?? [];
  const servicosContrato = servicosContratoQ.data ?? [];
  const vinculoMap     = new Map(servicosContrato.map((s) => [s.servico_id, s]));

  const hp_ini   = contrato?.horas_presenciais_saldo_ini ?? 0;
  const hr_ini   = contrato?.horas_remotas_saldo_ini ?? 0;
  const hp_atual = contrato?.horas_presenciais_saldo_atual ?? 0;
  const hr_atual = contrato?.horas_remotas_saldo_atual ?? 0;

  const modalTabs = [
    { id: 'dados'    as const, label: 'Dados do contrato', icon: FileText },
    { id: 'servicos' as const, label: 'Serviços',          icon: Package  },
  ];

  return (
    <Dialog
      open={open}
      title={contrato ? 'Editar contrato' : 'Novo contrato'}
      onClose={onClose}
      size="lg"
    >
      <div className="grid gap-4">

        {/* Tabs internas — só quando editando contrato existente */}
        {contrato && (
          <div className="flex gap-1 border-b border-slate-200 -mt-1">
            {modalTabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={[
                  'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors',
                  activeTab === id
                    ? 'border-brand-500 text-brand-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700',
                ].join(' ')}
              >
                <Icon size={14} />{label}
              </button>
            ))}
          </div>
        )}

        {/* ── Dados do contrato ── */}
        {activeTab === 'dados' && (
          <div className="grid gap-5">
            {contrato && (hp_ini > 0 || hr_ini > 0) && (
              <div className="grid grid-cols-2 gap-3">
                {([
                  { label: 'Hora Presencial', valor: contrato.horas_presenciais_valor ?? 0, ini: hp_ini, atual: hp_atual },
                  { label: 'Hora Remoto',     valor: contrato.horas_remotas_valor ?? 0,     ini: hr_ini, atual: hr_atual },
                ]).map(({ label, valor, ini, atual }) => (
                  <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold text-slate-500 mb-1">{label}</p>
                    <div className="flex items-baseline gap-2">
                      <span className={`text-base font-bold ${atual <= 0 && ini > 0 ? 'text-red-600' : 'text-green-700'}`}>
                        {atual}h
                      </span>
                      <span className="text-xs text-slate-400">de {ini}h</span>
                      {valor > 0 && <span className="text-xs text-slate-400">· {formatCurrency(valor)}/h</span>}
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${atual <= 0 ? 'bg-red-400' : 'bg-green-500'}`}
                        style={{ width: `${ini > 0 ? Math.min(100, (atual / ini) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <ContratoForm
              clienteId={clienteId}
              initial={contrato}
              representantes={representantes}
              isSaving={isSaving}
              onSave={onSave}
              onCancel={onClose}
            />

            {onEncerrar && (
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onEncerrar}
                  className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  <AlertTriangle size={12} /> Encerrar contrato
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Serviços ── */}
        {activeTab === 'servicos' && contrato && (
          <div className="grid gap-4">
            {/* Cards de confronto */}
            {(() => {
              const valorContrato  = contrato.valor_contrato ?? 0;
              const totalFaturando = servicosContrato.filter((s) => s.faturando).reduce((acc, s) => acc + s.valor_mensal, 0);
              const diferenca      = valorContrato - totalFaturando;
              return (
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { label: 'Valor do contrato', value: valorContrato,  color: 'text-slate-800' },
                    { label: 'Faturando',          value: totalFaturando, color: 'text-blue-700'  },
                    {
                      label: 'Diferença',
                      value: diferenca,
                      color: diferenca < 0 ? 'text-red-600' : diferenca === 0 ? 'text-green-700' : 'text-amber-600',
                    },
                  ] as { label: string; value: number; color: string }[]).map(({ label, value, color }) => (
                    <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                      <p className={`text-base font-bold ${color}`}>{formatCurrency(value)}</p>
                    </div>
                  ))}
                </div>
              );
            })()}

            {catalogoQ.isLoading ? (
              <p className="py-8 text-center text-sm text-slate-400">Carregando serviços...</p>
            ) : catalogo.length === 0 ? (
              <EmptyState title="Sem serviços" description="Nenhum serviço cadastrado no catálogo." />
            ) : (
              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <div className="grid items-center border-b border-slate-100 bg-slate-50 px-4 py-2"
                  style={{ gridTemplateColumns: '20px 1fr 96px 96px 96px 90px' }}>
                  <span />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Serviço</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Valor/mês</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center">Implantado</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center">Faturando</span>
                  <span />
                </div>
                {catalogo.map((servico) => (
                  <CatalogoServicoRow
                    key={servico.id}
                    servico={servico}
                    vinculo={vinculoMap.get(servico.id)}
                    onVincular={(valorMensal) => vincularMut.mutate({ servicoId: servico.id, valorMensal })}
                    onAtualizar={(data) => {
                      const v = vinculoMap.get(servico.id);
                      if (v) atualizarServicoMut.mutate({ id: v.id, data });
                    }}
                    onDesvincular={() => {
                      const v = vinculoMap.get(servico.id);
                      if (v && confirm(`Remover "${servico.nome}" deste contrato?`)) desvincularMut.mutate(v.id);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </Dialog>
  );
}

// ─── ClienteDetail ────────────────────────────────────────────────────────────

export function ClienteDetail({ cliente, onBack, onEditCliente }: {
  cliente: Cliente;
  onBack: () => void;
  onEditCliente?: () => void;
}) {
  const qc = useQueryClient();
  const [contratoModal, setContratoModal] = useState<{ open: boolean; contrato?: Contrato }>({ open: false });

  const contratosQ = useQuery({
    queryKey: queryKeys.contratos(cliente.id),
    queryFn: () => fetchContratos(cliente.id),
  });

  const representantesQ = useQuery({
    queryKey: queryKeys.representantes,
    queryFn: fetchRepresentantes,
  });

  const contratos      = contratosQ.data ?? [];
  const contrato       = contratos.find((c) => c.status === 'ativo') ?? contratos[0];
  const representantes = (representantesQ.data ?? []).filter((r) => r.ativo);

  const saveContratoMut = useMutation({
    mutationFn: (data: Parameters<typeof saveContrato>[0]) =>
      saveContrato(data, contratoModal.contrato?.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.contratos(cliente.id) });
      setContratoModal({ open: false });
    },
  });

  const encerrarMut = useMutation({
    mutationFn: (id: number) => encerrarContrato(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.contratos(cliente.id) });
      setContratoModal({ open: false });
    },
  });

  const gerarMut = useMutation({
    mutationFn: (id: number) => gerarPrevistas(id),
    onSuccess: (data) => alert(`${data.count} receitas previstas geradas com sucesso!`),
  });

  return (
    <div className="grid gap-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Cliente</p>
          <h3 className="text-lg font-bold text-slate-900">{cliente.nome}</h3>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {onEditCliente && (
            <Button variant="secondary" onClick={onEditCliente}>Editar cliente</Button>
          )}
          {contrato && (
            <Button
              variant="secondary"
              icon={<RefreshCw size={14} />}
              onClick={() => gerarMut.mutate(contrato.id)}
              disabled={gerarMut.isPending}
            >
              {gerarMut.isPending ? 'Gerando...' : 'Gerar previstas'}
            </Button>
          )}
        </div>
      </div>

      {/* Lista de contratos */}
      <div className="grid gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {contratos.length > 0
              ? `${contratos.length} contrato${contratos.length !== 1 ? 's' : ''}`
              : 'Nenhum contrato'}
          </p>
          <Button icon={<Plus size={14} />} onClick={() => setContratoModal({ open: true })}>
            Novo contrato
          </Button>
        </div>

        {contratosQ.isLoading && (
          <p className="py-4 text-center text-sm text-slate-400">Carregando...</p>
        )}

        {!contratosQ.isLoading && contratos.length === 0 && (
          <EmptyState
            title="Sem contratos"
            description="Nenhum contrato cadastrado para este cliente."
          />
        )}

        {contratos.length > 0 && (
          <div className="grid gap-2">
            {contratos.map((c, i) => (
              <ContratoRow
                key={c.id}
                contrato={c}
                index={i}
                onClick={() => setContratoModal({ open: true, contrato: c })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      <ContratoModal
        open={contratoModal.open}
        contrato={contratoModal.contrato}
        clienteId={cliente.id}
        representantes={representantes}
        isSaving={saveContratoMut.isPending}
        onSave={(data) => saveContratoMut.mutate(data)}
        onClose={() => setContratoModal({ open: false })}
        onEncerrar={
          contratoModal.contrato?.status === 'ativo'
            ? () => {
                if (confirm('Encerrar contrato e cancelar receitas previstas futuras?')) {
                  encerrarMut.mutate(contratoModal.contrato!.id);
                }
              }
            : undefined
        }
      />

    </div>
  );
}
