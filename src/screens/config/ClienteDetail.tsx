import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Plus, RefreshCw,
  Package, FileText, AlertTriangle, ChevronRight, Paperclip,
} from 'lucide-react';
import {
  fetchContratos, saveContrato, encerrarContrato, gerarPrevistas,
  fetchContratosServicos, vincularServico, atualizarServicoContrato, desvincularServico,
  fetchContratoAnexos, uploadContratoAnexo, viewContratoAnexo, deleteContratoAnexo,
  type Cliente, type Contrato, type ServicoContrato, type ContratoAnexo,
} from '../../services/clientesService';
import { fetchServicos, type Servico } from '../../services/servicosService';
import { fetchRepresentantes, type Representante } from '../../services/representantesService';
import { queryKeys } from '../../services/queryKeys';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { Field, Input, Textarea, ToggleGroup, SectionDivider } from '../../ui/form';
import { EmptyState } from '../../ui/states';
import { formatCurrency } from '../finance/formatters';

// ─── Module-level helpers ─────────────────────────────────────────────────────

// Normalize postgres NUMERIC string → display string (zero → empty string)
const fv = (v: number | string | null | undefined): string => {
  const x = parseFloat(String(v ?? 0));
  return x ? String(x) : '';
};

const MODAL_TABS = [
  { id: 'dados'    as const, label: 'Dados do contrato', icon: FileText },
  { id: 'servicos' as const, label: 'Valores',           icon: Package  },
] as const;

// ─── Contrato Form ────────────────────────────────────────────────────────────

function ContratoForm({
  clienteId, initial, representantes, onSave,
}: {
  clienteId: number;
  initial?: Partial<Contrato>;
  representantes: Representante[];
  onSave: (data: Parameters<typeof saveContrato>[0]) => void;
}) {
  const [form, setForm] = useState({
    numero:                  initial?.numero ?? '',
    data_assinatura:         initial?.data_assinatura ?? '',
    vencimento:              initial?.vencimento ?? '',
    data_inicio_faturamento: initial?.data_inicio_faturamento ?? '',
    ajuste:                  initial?.ajuste ?? 'NADA CONSTA',
    observacoes:             initial?.observacoes ?? '',
    representante_id:        String(initial?.representante_id ?? ''),
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      cliente_id:                clienteId,
      numero:                    form.numero || null,
      data_assinatura:           form.data_assinatura || null,
      vencimento:                form.vencimento,
      data_aditivo:              initial?.data_aditivo ?? null,
      num_aditivo:               initial?.num_aditivo ?? 0,
      ajuste:                    form.ajuste || null,
      data_inicio_faturamento:   form.data_inicio_faturamento || null,
      observacoes:               form.observacoes || null,
      representante_id:          form.representante_id ? parseInt(form.representante_id) : null,
      implantacao_parcelas:      initial?.implantacao_parcelas ?? 1,
      implantacao_valor_parcela: initial?.implantacao_valor_parcela ?? 0,
      horas_presenciais_valor:   initial?.horas_presenciais_valor ?? 0,
      horas_presenciais_saldo_ini: initial?.horas_presenciais_saldo_ini ?? 0,
      horas_remotas_valor:       initial?.horas_remotas_valor ?? 0,
      horas_remotas_saldo_ini:   initial?.horas_remotas_saldo_ini ?? 0,
      valor_contrato:            initial?.valor_contrato ?? 0,
      valor_mensal:              initial?.valor_mensal ?? 0,
    } as Parameters<typeof saveContrato>[0]);
  };

  return (
    <form id="contrato-form" onSubmit={handleSubmit} className="grid gap-5">

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
      </div>

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
          {representantes.length <= 5 ? (
            <ToggleGroup
              value={form.representante_id}
              options={[
                { value: '', label: 'Nenhum' },
                ...representantes.map((r) => ({ value: String(r.id), label: r.nome })),
              ]}
              onChange={(v) => set('representante_id', v)}
            />
          ) : (
            <select
              value={form.representante_id}
              onChange={(e) => set('representante_id', e.target.value)}
              className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-4 focus:ring-brand-100 focus:border-brand-400"
            >
              <option value="">— Nenhum —</option>
              {representantes.map((r) => (
                <option key={r.id} value={String(r.id)}>{r.nome}</option>
              ))}
            </select>
          )}
        </>
      )}

      {/* Observações */}
      <Field label="Observações">
        <Textarea value={form.observacoes} onChange={(e) => set('observacoes', e.target.value)} placeholder="Anotações sobre o contrato..." rows={2} />
      </Field>

    </form>
  );
}

// ─── Catálogo Serviço Row ─────────────────────────────────────────────────────

function CatalogoServicoRow({ servico, vinculo, numero, showStatus = true, onVincular, onAtualizar, onDesvincular }: {
  servico: Servico;
  vinculo?: ServicoContrato;
  numero?: number;
  showStatus?: boolean;
  onVincular: (valorMensal: number) => void;
  onAtualizar: (data: Partial<Pick<ServicoContrato, 'valor_mensal' | 'implantado' | 'faturando'>>) => void;
  onDesvincular: () => void;
}) {
  const checked = !!vinculo;
  const [valor, setValor]           = useState(fv(vinculo?.valor_mensal ?? servico.valor_mensal_padrao));
  const [implantado, setImplantado] = useState(vinculo?.implantado ?? false);
  const [faturando, setFaturando]   = useState(vinculo?.faturando ?? false);

  useEffect(() => {
    setValor(fv(vinculo?.valor_mensal ?? servico.valor_mensal_padrao));
    setImplantado(vinculo?.implantado ?? false);
    setFaturando(vinculo?.faturando ?? false);
  }, [vinculo?.id, servico.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = () => {
    if (checked) {
      onDesvincular();
    } else {
      onVincular(parseFloat(valor) || parseFloat(String(servico.valor_mensal_padrao ?? 0)) || 0);
    }
  };

  const handleImplantado = (v: boolean) => {
    setImplantado(v);
    if (vinculo) onAtualizar({ implantado: v, faturando, valor_mensal: parseFloat(valor) || 0 });
  };

  const handleFaturando = (v: boolean) => {
    setFaturando(v);
    if (vinculo) onAtualizar({ faturando: v, implantado, valor_mensal: parseFloat(valor) || 0 });
  };

  const handleValorBlur = () => {
    if (vinculo) onAtualizar({ valor_mensal: parseFloat(valor) || 0, implantado, faturando });
  };

  return (
    <div
      className={[
        'grid items-center gap-x-3 rounded-xl border px-4 py-3 transition-colors',
        checked ? 'border-slate-200 bg-white shadow-sm' : 'border-slate-100 bg-slate-50/40',
      ].join(' ')}
      style={{ gridTemplateColumns: showStatus ? '28px 1fr 90px 72px 80px 80px' : '28px 1fr 90px 72px' }}
    >
      <div className="flex justify-center">
        {checked && numero ? (
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-100 text-[10px] font-bold text-brand-700">
            {numero}
          </span>
        ) : <span />}
      </div>
      <span className={`text-sm font-medium truncate ${checked ? 'text-slate-800' : 'text-slate-400'}`}>
        {servico.nome}
      </span>
      <input
        type="number" min="0" step="0.01"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={handleValorBlur}
        disabled={!checked}
        placeholder="0,00"
        className="w-24 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-right disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
      />
      <div className="flex justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={handleToggle}
          className="h-4 w-4 cursor-pointer accent-brand-600"
        />
      </div>
      {showStatus && (
        <div className="flex justify-center">
          <input
            type="checkbox"
            checked={implantado}
            onChange={(e) => handleImplantado(e.target.checked)}
            disabled={!checked}
            className="h-4 w-4 cursor-pointer accent-brand-600 disabled:opacity-30"
          />
        </div>
      )}
      {showStatus && (
        <div className="flex justify-center">
          <input
            type="checkbox"
            checked={faturando}
            onChange={(e) => handleFaturando(e.target.checked)}
            disabled={!checked}
            className="h-4 w-4 cursor-pointer accent-brand-600 disabled:opacity-30"
          />
        </div>
      )}
    </div>
  );
}

// ─── Contrato Anexos ──────────────────────────────────────────────────────────

function ContratoAnexos({ contratoId }: { contratoId: number }) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const anexosQ = useQuery({
    queryKey: queryKeys.contratoAnexos(contratoId),
    queryFn: () => fetchContratoAnexos(contratoId),
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadContratoAnexo(contratoId, file),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.contratoAnexos(contratoId) }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteContratoAnexo,
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.contratoAnexos(contratoId) }),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMut.mutate(file);
    e.target.value = '';
  };

  const handleView = async (id: number) => {
    try {
      const blob = await viewContratoAnexo(id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 15000);
    } catch (err) {
      console.error('Failed to open attachment:', err);
    }
  };

  const anexos: ContratoAnexo[] = anexosQ.data ?? [];

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Anexos</span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploadMut.isPending}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500 hover:border-brand-400 hover:text-brand-600 transition disabled:opacity-50"
        >
          <Paperclip size={12} />
          {uploadMut.isPending ? 'Enviando...' : 'Anexar arquivo'}
        </button>
        <input ref={inputRef} type="file" className="hidden" onChange={handleFileChange} />
      </div>

      {anexosQ.isLoading && (
        <p className="text-xs text-slate-400 py-1">Carregando...</p>
      )}

      {!anexosQ.isLoading && anexos.length === 0 && (
        <p className="text-xs text-slate-400 py-1">Nenhum arquivo anexado</p>
      )}

      {anexos.map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5">
          <Paperclip size={14} className="shrink-0 text-slate-400" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-700 truncate">{a.nome_original}</p>
            {a.tamanho != null && (
              <p className="text-[10px] text-slate-400">{(a.tamanho / 1024).toFixed(0)} KB</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleView(a.id)}
              className="text-xs font-medium text-brand-600 hover:text-brand-700 transition"
            >
              Visualizar
            </button>
            <button
              type="button"
              onClick={() => deleteMut.mutate(a.id)}
              disabled={deleteMut.isPending}
              className="text-xs font-medium text-red-500 hover:text-red-700 transition disabled:opacity-50"
            >
              Excluir
            </button>
          </div>
        </div>
      ))}
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
  onSave: (data: Parameters<typeof saveContrato>[0], pendingServicos?: Map<number, number>) => void;
  onClose: () => void;
  onEncerrar?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'dados' | 'servicos'>('dados');
  const [pendingServicos, setPendingServicos] = useState<Map<number, number>>(new Map());
  const [valMensal, setValMensal]   = useState(fv(contrato?.valor_mensal));
  const [implTotal, setImplTotal]   = useState(fv((contrato?.implantacao_parcelas ?? 1) * (contrato?.implantacao_valor_parcela ?? 0)));
  const [implParc, setImplParc]     = useState(fv(contrato?.implantacao_parcelas));
  const [hpValor, setHpValor]       = useState(fv(contrato?.horas_presenciais_valor));
  const [hpIni, setHpIni]           = useState(fv(contrato?.horas_presenciais_saldo_ini));
  const [hrValor, setHrValor]       = useState(fv(contrato?.horas_remotas_valor));
  const [hrIni, setHrIni]           = useState(fv(contrato?.horas_remotas_saldo_ini));

  const periodoMeses = (() => {
    if (!contrato?.data_assinatura || !contrato?.vencimento) return 0;
    const [ay, am] = contrato.data_assinatura.split('-').map(Number);
    const [vy, vm] = contrato.vencimento.split('-').map(Number);
    return Math.max(0, (vy! - ay!) * 12 + (vm! - am!) + 1);
  })();
  const vMensalNum   = parseFloat(valMensal) || 0;
  const implTotalNum = parseFloat(implTotal)  || 0;
  const hpIniNum     = parseFloat(hpIni)      || 0;
  const hpValorNum   = parseFloat(hpValor)    || 0;
  const hrIniNum     = parseFloat(hrIni)      || 0;
  const hrValorNum   = parseFloat(hrValor)    || 0;
  const somaCalc     = vMensalNum * periodoMeses + implTotalNum + hpIniNum * hpValorNum + hrIniNum * hrValorNum;

  const qc = useQueryClient();

  useEffect(() => {
    if (open) {
      setActiveTab('dados');
      setPendingServicos(new Map());
    }
  }, [open, contrato?.id]);
  useEffect(() => {
    setValMensal(fv(contrato?.valor_mensal));
    setImplTotal(fv((contrato?.implantacao_parcelas ?? 1) * (contrato?.implantacao_valor_parcela ?? 0)));
    setImplParc(fv(contrato?.implantacao_parcelas));
    setHpValor(fv(contrato?.horas_presenciais_valor));
    setHpIni(fv(contrato?.horas_presenciais_saldo_ini));
    setHrValor(fv(contrato?.horas_remotas_valor));
    setHrIni(fv(contrato?.horas_remotas_saldo_ini));
  }, [contrato?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveWithValores = (formData: Parameters<typeof saveContrato>[0]) => {
    const parc = parseInt(implParc) || 1;
    onSave(
      {
        ...formData,
        valor_mensal: vMensalNum || 0,
        valor_contrato: somaCalc || 0,
        implantacao_parcelas: parc,
        implantacao_valor_parcela: parseFloat((implTotalNum / parc).toFixed(2)),
        horas_presenciais_valor: hpValorNum || 0,
        horas_presenciais_saldo_ini: hpIniNum || 0,
        horas_remotas_valor: hrValorNum || 0,
        horas_remotas_saldo_ini: hrIniNum || 0,
      },
      pendingServicos,
    );
  };

  const handleFooterSave = () => {
    if (activeTab === 'servicos' && contrato) {
      onClose();
    } else {
      (document.getElementById('contrato-form') as HTMLFormElement | null)?.requestSubmit();
    }
  };

  const catalogoQ = useQuery({
    queryKey: queryKeys.servicos,
    queryFn: () => fetchServicos(true),
    enabled: open,
  });

  const servicosContratoQ = useQuery({
    queryKey: queryKeys.contratosServicos(contrato?.id ?? 0),
    queryFn: () => fetchContratosServicos(contrato!.id),
    enabled: open && !!contrato,
  });

  const patchValoresMut = useMutation({
    mutationFn: (v: {
      vContrato: number; vMensal: number;
      iTotal: number; iParc: number;
      hpV: number; hpI: number;
      hrV: number; hrI: number;
    }) => {
      const parc = v.iParc || 1;
      return saveContrato(
        {
          cliente_id:                    contrato!.cliente_id,
          numero:                        contrato!.numero ?? null,
          data_assinatura:               contrato!.data_assinatura ?? null,
          vencimento:                    contrato!.vencimento,
          data_aditivo:                  contrato!.data_aditivo ?? null,
          num_aditivo:                   contrato!.num_aditivo ?? 0,
          ajuste:                        contrato!.ajuste ?? null,
          data_inicio_faturamento:       contrato!.data_inicio_faturamento ?? null,
          observacoes:                   contrato!.observacoes ?? null,
          representante_id:              contrato!.representante_id ?? null,
          implantacao_parcelas:          parc,
          implantacao_valor_parcela:     parseFloat((v.iTotal / parc).toFixed(2)),
          horas_presenciais_valor:       v.hpV,
          horas_presenciais_saldo_ini:   v.hpI,
          horas_remotas_valor:           v.hrV,
          horas_remotas_saldo_ini:       v.hrI,
          valor_contrato:                v.vContrato,
          valor_mensal:                  v.vMensal,
        },
        contrato!.id,
      );
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.contratos(contrato!.cliente_id) }),
  });

  const saveValores = () => {
    if (!contrato) return;
    patchValoresMut.mutate({
      vContrato: somaCalc,
      vMensal:   vMensalNum,
      iTotal:    implTotalNum,
      iParc:     parseInt(implParc) || 1,
      hpV: hpValorNum, hpI: hpIniNum,
      hrV: hrValorNum, hrI: hrIniNum,
    });
  };

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


  return (
    <Dialog
      open={open}
      title={contrato ? 'Editar contrato' : 'Novo contrato'}
      onClose={onClose}
      size="lg"
    >
      <div className="grid gap-4">

        {/* Tabs */}
        <div className="flex gap-1 border-b border-slate-200 -mt-1">
          {MODAL_TABS.map(({ id, label, icon: Icon }) => (
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

        {/* ── Dados do contrato ── */}
        {activeTab === 'dados' && (
          <div className="grid gap-4">
            <ContratoForm
              clienteId={clienteId}
              initial={contrato}
              representantes={representantes}
              onSave={contrato ? onSave : handleSaveWithValores}
            />
            {contrato && (
              <>
                <div className="-mx-1 border-t border-slate-100" />
                <ContratoAnexos contratoId={contrato.id} />
              </>
            )}
          </div>
        )}

        {/* ── Serviços ── */}
        {activeTab === 'servicos' && (() => {
          const vinculoOrdem = new Map(
            [...servicosContrato].sort((a, b) => a.id - b.id).map((v, i) => [v.servico_id, i + 1])
          );
          const totalFaturando = servicosContrato.filter((s) => s.faturando).reduce((acc, s) => acc + parseFloat(String(s.valor_mensal ?? 0)), 0);
          const diferencaFaturando = vMensalNum - totalFaturando;
          return (
          <div className="grid gap-4">
            {/* Cards: total mensal × valor total × faturando × diferença */}
            <div className="grid grid-cols-4 gap-3">
              {([
                { label: 'Total mensal', value: vMensalNum * periodoMeses, color: 'text-slate-800' },
                { label: 'Valor total',  value: somaCalc,                  color: 'text-slate-800' },
                { label: 'Faturando',    value: totalFaturando,            color: 'text-blue-700'  },
                {
                  label: 'Diferença',
                  value: diferencaFaturando,
                  color: diferencaFaturando < 0 ? 'text-red-600' : diferencaFaturando === 0 ? 'text-green-700' : 'text-amber-600',
                },
              ] as { label: string; value: number; color: string }[]).map(({ label, value, color }) => (
                <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
                  <p className={`text-base font-bold ${color}`}>{formatCurrency(value)}</p>
                </div>
              ))}
            </div>

            {/* ── Prestação de serviço ── */}
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 grid gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Prestação de serviço</span>
              <div className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">Valor mensal</span>
                <div className="flex-1">
                  <Input
                    type="number" min="0" step="0.01"
                    value={valMensal}
                    onChange={(e) => setValMensal(e.target.value)}
                    onBlur={saveValores}
                    placeholder="0,00"
                  />
                </div>
              </div>
            </div>

            {/* ── Serviços técnicos ── */}
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 grid gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Serviços técnicos</span>
              <div className="flex items-center gap-4">
                <span className="w-36 shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">Implantação</span>
                <div className="flex-1 grid grid-cols-3 gap-3 items-end">
                  <div className="grid gap-1.5">
                    <span className="text-xs text-slate-400">Total</span>
                    <Input type="number" min="0" step="0.01" value={implTotal} onChange={(e) => setImplTotal(e.target.value)} onBlur={saveValores} placeholder="0,00" />
                  </div>
                  <div className="grid gap-1.5">
                    <span className="text-xs text-slate-400">Nº de parcelas</span>
                    <Input type="number" min="1" value={implParc} onChange={(e) => setImplParc(e.target.value)} onBlur={saveValores} placeholder="1" />
                  </div>
                  <div className="grid gap-1.5">
                    <span className="text-xs text-slate-400">Valor por parcela</span>
                    <div className="flex h-10 items-center px-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
                      {formatCurrency(implTotalNum / (parseInt(implParc) || 1))}
                    </div>
                  </div>
                </div>
              </div>

              {([
                {
                  label: 'Hora Presencial', vS: hpValor, vSet: setHpValor, iS: hpIni, iSet: setHpIni,
                  saldoAtual: contrato ? parseFloat(String(contrato.horas_presenciais_saldo_atual ?? 0)) || 0 : null,
                },
                {
                  label: 'Hora Remoto', vS: hrValor, vSet: setHrValor, iS: hrIni, iSet: setHrIni,
                  saldoAtual: contrato ? parseFloat(String(contrato.horas_remotas_saldo_atual ?? 0)) || 0 : null,
                },
              ] as { label: string; vS: string; vSet: (v: string) => void; iS: string; iSet: (v: string) => void; saldoAtual: number | null }[]).map(({ label, vS, vSet, iS, iSet, saldoAtual }) => (
                <div key={label} className="flex items-center gap-4">
                  <span className="w-36 shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>
                  <div className="flex-1 grid grid-cols-3 gap-3">
                    <div className="grid gap-1.5">
                      <span className="text-xs text-slate-400">Valor/hora</span>
                      <Input type="number" min="0" step="0.01" value={vS} onChange={(e) => vSet(e.target.value)} onBlur={saveValores} placeholder="0,00" />
                    </div>
                    <div className="grid gap-1.5">
                      <span className="text-xs text-slate-400">Saldo inicial</span>
                      <Input type="number" min="0" step="0.5" value={iS} onChange={(e) => iSet(e.target.value)} onBlur={saveValores} placeholder="0" />
                    </div>
                    <div className="grid gap-1.5">
                      <span className="text-xs text-slate-400">Saldo atual</span>
                      <div className="flex h-10 items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700">
                        {saldoAtual !== null ? `${saldoAtual}h` : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ── Discriminação de prestação de serviço ── */}
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 grid gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Discriminação de prestação de serviço</span>
              {catalogoQ.isLoading ? (
                <p className="py-8 text-center text-sm text-slate-400">Carregando serviços...</p>
              ) : catalogo.length === 0 ? (
                <EmptyState title="Sem serviços" description="Nenhum serviço cadastrado no catálogo." />
              ) : (
                <>
                  <div className="grid items-center gap-x-3 px-1 pb-1"
                    style={{ gridTemplateColumns: contrato ? '28px 1fr 90px 72px 80px 80px' : '28px 1fr 90px 72px' }}>
                    <span />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Serviço</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Valor/mês</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center">Contratado</span>
                    {contrato && <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center">Implantado</span>}
                    {contrato && <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center">Faturando</span>}
                  </div>
                  <div className="grid gap-2">
                    {catalogo.map((servico) => {
                      const pendingValor = pendingServicos.get(servico.id);
                      const syntheticVinculo: ServicoContrato | undefined = !contrato && pendingServicos.has(servico.id)
                        ? { id: 0, contrato_id: 0, servico_id: servico.id, servico_nome: servico.nome, valor_mensal: pendingValor ?? 0, implantado: false, faturando: false }
                        : undefined;
                      return (
                        <CatalogoServicoRow
                          key={servico.id}
                          servico={servico}
                          vinculo={contrato ? vinculoMap.get(servico.id) : syntheticVinculo}
                          numero={contrato ? vinculoOrdem.get(servico.id) : undefined}
                          showStatus={!!contrato}
                          onVincular={(valorMensal) => {
                            if (contrato) {
                              vincularMut.mutate({ servicoId: servico.id, valorMensal });
                            } else {
                              setPendingServicos((m) => new Map(m).set(servico.id, valorMensal));
                            }
                          }}
                          onAtualizar={(data) => {
                            if (contrato) {
                              const v = vinculoMap.get(servico.id);
                              if (v) atualizarServicoMut.mutate({ id: v.id, data });
                            } else if (data.valor_mensal !== undefined) {
                              setPendingServicos((m) => new Map(m).set(servico.id, data.valor_mensal!));
                            }
                          }}
                          onDesvincular={() => {
                            if (contrato) {
                              const v = vinculoMap.get(servico.id);
                              if (v && confirm(`Remover "${servico.nome}" deste contrato?`)) desvincularMut.mutate(v.id);
                            } else {
                              setPendingServicos((m) => { const n = new Map(m); n.delete(servico.id); return n; });
                            }
                          }}
                        />
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
          );
        })()}

        {/* ── Persistent footer ── */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-2">
          {onEncerrar ? (
            <button
              type="button"
              onClick={onEncerrar}
              className="flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
            >
              <AlertTriangle size={12} /> Encerrar contrato
            </button>
          ) : <span />}
          <Button disabled={isSaving} onClick={handleFooterSave}>
            {isSaving ? 'Salvando...' : 'Salvar contrato'}
          </Button>
        </div>

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
  // Deriva o contrato do modal da query viva para que saves parciais (patchValoresMut) reflitam imediatamente
  const contratoParaModal = contratoModal.contrato
    ? (contratos.find((c) => c.id === contratoModal.contrato!.id) ?? contratoModal.contrato)
    : undefined;
  const representantes = (representantesQ.data ?? []).filter((r) => r.ativo);

  const saveContratoMut = useMutation({
    mutationFn: async ({ data, pendingServicos }: {
      data: Parameters<typeof saveContrato>[0];
      pendingServicos?: Map<number, number>;
    }) => {
      const saved = await saveContrato(data, contratoModal.contrato?.id);
      if (!contratoModal.contrato && pendingServicos?.size) {
        await Promise.all(
          Array.from(pendingServicos.entries()).map(([servicoId, valorMensal]) =>
            vincularServico(saved.id, servicoId, valorMensal),
          ),
        );
      }
      return saved;
    },
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
        contrato={contratoParaModal}
        clienteId={cliente.id}
        representantes={representantes}
        isSaving={saveContratoMut.isPending}
        onSave={(data, pendingServicos) => saveContratoMut.mutate({ data, pendingServicos })}
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
