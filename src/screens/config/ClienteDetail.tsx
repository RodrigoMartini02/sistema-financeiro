import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Plus, RefreshCw, X,
  AlertTriangle, Paperclip, Info, Users, Clock as ClockIcon,
} from 'lucide-react';
import {
  fetchContratos, saveContrato, encerrarContrato, gerarPrevistas, criarReceitaImplantacao, registrarAditivo,
  fetchContratosServicos, vincularServico, atualizarServicoContrato, desvincularServico,
  fetchContratoAnexos, uploadContratoAnexo, viewContratoAnexo, deleteContratoAnexo,
  type Cliente, type Contrato, type ServicoContrato, type ContratoAnexo, type AditivoContratoValues,
} from '../../services/clientesService';
import { fetchServicos, saveServico, type Servico } from '../../services/servicosService';
import { fetchRepresentantes, type Representante } from '../../services/representantesService';
import { queryKeys } from '../../services/queryKeys';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import {
  C, labelStyle, fieldInputStyle, cardStyle,
  valuesTableCardStyle, valuesTableHeaderStyle, valuesTableColLabelStyle,
  valuesRowStyle, valuesRowLastStyle, valuesRowTitleStyle, valuesRowSubtitleStyle,
  valuesInlineFieldStyle, valuesInlineInputStyle, valuesComputedStyle,
  valuesRemoveButtonStyle, valuesAddRowButtonStyle,
  chipGroupLabelStyle,
} from '../../ui/dialogFormTokens';
import { EmptyState } from '../../ui/states';
import { formatCurrency } from '../finance/formatters';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { GUIDE_LAYER_MODAL } from '../../context/FirstAccessGuideContext';
import { useConfirm } from '../../context/ConfirmContext';

// ─── Module-level helpers ─────────────────────────────────────────────────────

// Normalize postgres NUMERIC string → display string (zero → empty string)
const fv = (v: number | string | null | undefined): string => {
  const x = parseFloat(String(v ?? 0));
  return x ? String(x) : '';
};

// ─── Contrato Form ────────────────────────────────────────────────────────────

function ContratoForm({
  clienteId, initial, representantes, onSave, readOnly = false,
}: {
  clienteId: number;
  initial?: Partial<Contrato>;
  representantes: Representante[];
  onSave: (data: Parameters<typeof saveContrato>[0]) => void;
  readOnly?: boolean;
}) {
  const [form, setForm] = useState({
    numero:                  initial?.numero ?? '',
    vencimento:              initial?.vencimento ?? '',
    data_inicio_faturamento: initial?.data_inicio_faturamento ?? '',
    ajuste:                  initial?.ajuste ?? 'NADA CONSTA',
    observacoes:             initial?.observacoes ?? '',
    descricao:               initial?.descricao ?? '',
    representante_id:        String(initial?.representante_id ?? ''),
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const reajusteGuide = useFirstAccessGuide('clientes:reajuste-v1', {
    enabled: !readOnly,
    layer: GUIDE_LAYER_MODAL,
  });
  const representanteGuide = useFirstAccessGuide('clientes:representante-v1', {
    enabled: !readOnly,
    layer: GUIDE_LAYER_MODAL,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      cliente_id:                clienteId,
      numero:                    form.numero || null,
      vencimento:                form.vencimento,
      data_aditivo:              initial?.data_aditivo ?? null,
      num_aditivo:               initial?.num_aditivo ?? 0,
      ajuste:                    form.ajuste || null,
      data_inicio_faturamento:   form.data_inicio_faturamento || null,
      observacoes:               form.observacoes || null,
      descricao:                 form.descricao || null,
      representante_id:          form.representante_id ? parseInt(form.representante_id) : null,
      implantacao_parcelas:      initial?.implantacao_parcelas ?? 1,
      implantacao_valor_parcela: initial?.implantacao_valor_parcela ?? 0,
      horas_presenciais_valor:   initial?.horas_presenciais_valor ?? 0,
      horas_presenciais_saldo_ini: initial?.horas_presenciais_saldo_ini ?? 0,
      horas_remotas_valor:       initial?.horas_remotas_valor ?? 0,
      horas_remotas_saldo_ini:   initial?.horas_remotas_saldo_ini ?? 0,
      valor_mensal:              initial?.valor_mensal ?? 0,
    } as Parameters<typeof saveContrato>[0]);
  };

  if (readOnly) {
    const repNome = representantes.find((r) => String(r.id) === form.representante_id)?.nome;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 130px) minmax(0, 2fr) repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Número</label>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{form.numero || '—'}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Descrição</label>
            <p style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{form.descricao || '—'}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Vencimento</label>
            <p style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{form.vencimento || '—'}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Início fatur.</label>
            <p style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{form.data_inicio_faturamento || '—'}</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, auto) minmax(0, 1fr)', gap: 28 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={chipGroupLabelStyle}>Reajuste</span>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
              {form.ajuste === 'IGPM' ? 'IGPM' : form.ajuste === 'IPCA' ? 'IPCA' : 'Nada consta'}
            </p>
          </div>
          {representantes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={chipGroupLabelStyle}>Representante</span>
              <p style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{repNome || 'Nenhum'}</p>
            </div>
          )}
        </div>

        {form.observacoes && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Observações</label>
            <p style={{ fontSize: 13.5, lineHeight: 1.5, color: C.text }}>{form.observacoes}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <form id="contrato-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Identificação */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 130px) minmax(0, 2fr) repeat(2, minmax(0, 1fr))', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle}>Número</label>
          <input value={form.numero} onChange={(e) => set('numero', e.target.value)} placeholder="001/2025" style={{ ...fieldInputStyle, height: 40, fontSize: 14, fontWeight: 600 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle}>Descrição</label>
          <input value={form.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="Mensalidade de suporte técnico" style={{ ...fieldInputStyle, height: 40, fontSize: 14 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle}>Vencimento <span style={{ color: C.danger }}>*</span></label>
          <input type="date" value={form.vencimento} onChange={(e) => set('vencimento', e.target.value)} required style={{ ...fieldInputStyle, height: 40, fontSize: 13 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle}>Início fatur.</label>
          <input type="date" value={form.data_inicio_faturamento} onChange={(e) => set('data_inicio_faturamento', e.target.value)} style={{ ...fieldInputStyle, height: 40, fontSize: 13 }} />
        </div>
      </div>

      {/* Reajuste + Representante (empilhados) ao lado de Observações */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 260px) minmax(0, 1fr)', gap: 28, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Reajuste</label>
            <select
              value={['IGPM', 'IPCA'].includes(form.ajuste) ? form.ajuste : 'NADA CONSTA'}
              onChange={(e) => set('ajuste', e.target.value)}
              style={{ ...fieldInputStyle, height: 40, fontSize: 14 }}
            >
              <option value="NADA CONSTA">Nada consta</option>
              <option value="IGPM">IGPM</option>
              <option value="IPCA">IPCA</option>
            </select>
            {reajusteGuide.isVisible && (
              <FirstAccessGuideCard
                floating
                placement="bottom"
                className="w-[min(25rem,calc(100vw-2rem))]"
                icon={Info}
                description={firstAccessGuideMessages.clientesReajuste}
                onDismiss={reajusteGuide.dismiss}
                onSilenceAll={reajusteGuide.silenceAll}
              />
            )}
          </div>

          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>Representante</label>
            <select
              value={form.representante_id}
              onChange={(e) => set('representante_id', e.target.value)}
              style={{ ...fieldInputStyle, height: 40, fontSize: 14 }}
            >
              <option value="">Nenhum</option>
              {representantes.map((r) => (
                <option key={r.id} value={String(r.id)}>{r.nome}</option>
              ))}
            </select>
            {representanteGuide.isVisible && (
              <FirstAccessGuideCard
                floating
                placement="bottom"
                className="w-[min(25rem,calc(100vw-2rem))]"
                icon={Users}
                description={firstAccessGuideMessages.clientesRepresentante}
                onDismiss={representanteGuide.dismiss}
                onSilenceAll={representanteGuide.silenceAll}
              />
            )}
          </div>
        </div>

        {/* Observações */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={labelStyle}>Observações</label>
          <textarea
            value={form.observacoes}
            onChange={(e) => set('observacoes', e.target.value)}
            placeholder="Anotações sobre o contrato…"
            rows={3}
            style={{ ...fieldInputStyle, flex: 1, height: 'auto', minHeight: 108, padding: '10px 12px', fontSize: 13.5, fontWeight: 400, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>
      </div>

    </form>
  );
}

// ─── Catálogo Serviço Row ─────────────────────────────────────────────────────

function CatalogoServicoRow({ servico, vinculo, numero, showStatus = true, disabled = false, onVincular, onAtualizar, onDesvincular }: {
  servico: Servico;
  vinculo?: ServicoContrato;
  numero?: number;
  showStatus?: boolean;
  disabled?: boolean;
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

  const checkboxStyle: CSSProperties = { width: 16, height: 16, accentColor: C.primary, cursor: 'pointer', margin: 0 };
  const checkboxDisabledStyle: CSSProperties = { ...checkboxStyle, opacity: 0.3, cursor: 'not-allowed' };

  return (
    <div
      style={{
        display: 'grid', alignItems: 'center', columnGap: 12, borderRadius: 12, border: `1px solid ${checked ? C.border : C.panelBg}`,
        background: checked ? '#fff' : C.panelBg, padding: '9px 0', gridTemplateColumns: showStatus ? '28px 1fr 90px 72px 80px 80px' : '28px 1fr 90px 72px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {checked && numero ? (
          <span style={{ display: 'flex', height: 24, width: 24, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 8, background: C.primarySoft, color: C.primaryDark, fontSize: 10, fontWeight: 700 }}>
            {numero}
          </span>
        ) : <span />}
      </div>
      <span style={{ fontSize: 13.5, fontWeight: 500, color: checked ? C.text : C.placeholder, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {servico.nome}
      </span>
      <input
        type="number" min="0" step="0.01"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={handleValorBlur}
        disabled={!checked || disabled}
        placeholder="0,00"
        style={{
          width: 96, borderRadius: 9, border: `1.5px solid ${C.borderInput}`, background: '#fff', padding: '6px 10px',
          fontSize: 13.5, fontWeight: 600, color: C.text, textAlign: 'right', fontVariantNumeric: 'tabular-nums', outline: 'none',
          opacity: (!checked || disabled) ? 0.3 : 1, cursor: (!checked || disabled) ? 'not-allowed' : 'text',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={handleToggle}
          disabled={disabled}
          style={disabled ? checkboxDisabledStyle : checkboxStyle}
        />
      </div>
      {showStatus && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <input
            type="checkbox"
            checked={implantado}
            onChange={(e) => handleImplantado(e.target.checked)}
            disabled={!checked || disabled}
            style={(!checked || disabled) ? checkboxDisabledStyle : checkboxStyle}
          />
        </div>
      )}
      {showStatus && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <input
            type="checkbox"
            checked={faturando}
            onChange={(e) => handleFaturando(e.target.checked)}
            disabled={!checked || disabled || (parseFloat(valor) || 0) <= 0}
            title={!disabled && checked && (parseFloat(valor) || 0) <= 0 ? 'Defina o valor/mês primeiro' : undefined}
            style={(!checked || disabled || (parseFloat(valor) || 0) <= 0) ? checkboxDisabledStyle : checkboxStyle}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={chipGroupLabelStyle}>Anexos</span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploadMut.isPending}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 9,
            border: `1.5px dashed ${C.chipOffBorder}`, background: 'transparent', color: C.textMuted,
            fontSize: 12, fontWeight: 600, cursor: uploadMut.isPending ? 'not-allowed' : 'pointer', opacity: uploadMut.isPending ? 0.5 : 1,
          }}
        >
          <Paperclip size={12} />
          {uploadMut.isPending ? 'Enviando...' : 'Anexar arquivo'}
        </button>
        <input ref={inputRef} type="file" className="hidden" onChange={handleFileChange} />
      </div>

      {anexosQ.isLoading && (
        <p style={{ fontSize: 12, color: C.placeholder, padding: '4px 0' }}>Carregando...</p>
      )}

      {!anexosQ.isLoading && anexos.length === 0 && (
        <p style={{ fontSize: 12, color: C.placeholder, padding: '4px 0' }}>Nenhum arquivo anexado</p>
      )}

      {anexos.map((a) => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 12, background: C.panelBg, border: `1px solid ${C.border}`, padding: '11px 14px' }}>
          <Paperclip size={14} style={{ flexShrink: 0, color: C.placeholder }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome_original}</p>
            {a.tamanho != null && (
              <p style={{ fontSize: 10, color: C.placeholder }}>{(a.tamanho / 1024).toFixed(0)} KB</p>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => handleView(a.id)}
              style={{ fontSize: 12, fontWeight: 600, color: C.primaryDark, background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Ver
            </button>
            <button
              type="button"
              onClick={() => deleteMut.mutate(a.id)}
              disabled={deleteMut.isPending}
              style={{ fontSize: 12, fontWeight: 600, color: C.danger, background: 'none', border: 'none', cursor: deleteMut.isPending ? 'not-allowed' : 'pointer', opacity: deleteMut.isPending ? 0.5 : 1 }}
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

function ContratoRow({ contrato, index, active, onClick }: {
  contrato: Contrato;
  index: number;
  active: boolean;
  onClick: () => void;
}) {
  const isAtivo = contrato.status === 'ativo';
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition',
        active
          ? 'border-brand-400 bg-brand-50 shadow-sm'
          : isAtivo
            ? 'border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/30'
            : 'border-slate-200 bg-white opacity-60 hover:opacity-100 hover:border-slate-300',
      ].join(' ')}
    >
      <span className={[
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-semibold transition',
        active || isAtivo ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500',
      ].join(' ')}>
        {String(index + 1).padStart(2, '0')}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[13px] font-semibold text-slate-900">
            {contrato.numero ? `Contrato ${contrato.numero}` : 'Sem número'}
          </p>
          {contrato.num_aditivo > 0 && (
            <span className="shrink-0 text-[10px] text-slate-400">{contrato.num_aditivo}º Adit.</span>
          )}
        </div>
        <span className={[
          'text-[11px] font-medium',
          isAtivo ? 'text-green-600' : 'text-slate-400',
        ].join(' ')}>
          {isAtivo ? 'Em vigor' : 'Encerrado'}
        </span>
      </div>
    </button>
  );
}

// ─── Contrato Detail Pane (coluna direita do master-detail) ──────────────────

function ContratoDetailPane({
  contrato, clienteId, representantes, isSaving, onSave, onEncerrar, onRegistrarAditivo,
}: {
  contrato?: Contrato;
  clienteId: number;
  representantes: Representante[];
  isSaving: boolean;
  onSave: (data: Parameters<typeof saveContrato>[0], pendingServicos?: Map<number, number>) => void;
  onEncerrar?: () => void;
  onRegistrarAditivo?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(!contrato);
  const [activeTab, setActiveTab] = useState<'dados' | 'servicos' | 'anexos'>('dados');
  const servicosVinculoGuide = useFirstAccessGuide('clientes:servicos-vinculo-v1', {
    enabled: activeTab === 'servicos' && !!contrato,
    layer: GUIDE_LAYER_MODAL,
  });
  const implantacaoGuide = useFirstAccessGuide('clientes:implantacao-v1', {
    enabled: isEditing,
    layer: GUIDE_LAYER_MODAL,
  });
  const horasGuide = useFirstAccessGuide('clientes:horas-v1', {
    enabled: true,
    layer: GUIDE_LAYER_MODAL,
  });
  const encerrarGuide = useFirstAccessGuide('clientes:encerrar-contrato-v1', {
    enabled: !!onEncerrar,
    layer: GUIDE_LAYER_MODAL,
  });
  const [pendingServicos, setPendingServicos] = useState<Map<number, number>>(new Map());
  const [showServicoForm, setShowServicoForm] = useState(false);
  const [valMensal, setValMensal]           = useState(fv(contrato?.valor_mensal));
  const [implValorParcela, setImplValorParcela] = useState(fv(contrato?.implantacao_valor_parcela));
  const [implParc, setImplParc]             = useState(fv(contrato?.implantacao_parcelas));
  const [hpValor, setHpValor]               = useState(fv(contrato?.horas_presenciais_valor));
  const [hpIni, setHpIni]                   = useState(fv(contrato?.horas_presenciais_saldo_ini));
  const [hrValor, setHrValor]               = useState(fv(contrato?.horas_remotas_valor));
  const [hrIni, setHrIni]                   = useState(fv(contrato?.horas_remotas_saldo_ini));

  type LinhaValor = 'mensalidade' | 'implantacao' | 'horaPresencial' | 'horaRemoto';
  const linhaPresenteInicial = (linha: LinhaValor): boolean => {
    if (!contrato) return true;
    switch (linha) {
      case 'mensalidade':     return (contrato.valor_mensal ?? 0) > 0;
      case 'implantacao':     return (contrato.implantacao_valor_parcela ?? 0) > 0;
      case 'horaPresencial':  return (contrato.horas_presenciais_valor ?? 0) > 0 || (contrato.horas_presenciais_saldo_ini ?? 0) > 0;
      case 'horaRemoto':      return (contrato.horas_remotas_valor ?? 0) > 0 || (contrato.horas_remotas_saldo_ini ?? 0) > 0;
    }
  };
  const [linhasVisiveis, setLinhasVisiveis] = useState<Record<LinhaValor, boolean>>({
    mensalidade:    linhaPresenteInicial('mensalidade'),
    implantacao:    linhaPresenteInicial('implantacao'),
    horaPresencial: linhaPresenteInicial('horaPresencial'),
    horaRemoto:     linhaPresenteInicial('horaRemoto'),
  });

  const removerLinha = (linha: LinhaValor) => {
    setLinhasVisiveis((v) => ({ ...v, [linha]: false }));
    if (linha === 'mensalidade') setValMensal('');
    if (linha === 'implantacao') { setImplValorParcela(''); setImplParc(''); }
    if (linha === 'horaPresencial') { setHpValor(''); setHpIni(''); }
    if (linha === 'horaRemoto') { setHrValor(''); setHrIni(''); }
  };
  const adicionarLinha = (linha: LinhaValor) => setLinhasVisiveis((v) => ({ ...v, [linha]: true }));

  const vMensalNum        = parseFloat(valMensal) || 0;
  const implValorParcelaNum = parseFloat(implValorParcela) || 0;
  const implParcNum       = parseInt(implParc) || 1;
  const implTotalNum      = implValorParcelaNum * implParcNum;
  const hpIniNum     = parseFloat(hpIni)      || 0;
  const hpValorNum   = parseFloat(hpValor)    || 0;
  const hrIniNum     = parseFloat(hrIni)      || 0;
  const hrValorNum   = parseFloat(hrValor)    || 0;
  const totalAnual   =
    (linhasVisiveis.mensalidade ? vMensalNum * 12 : 0) +
    (linhasVisiveis.implantacao ? implTotalNum : 0) +
    (linhasVisiveis.horaPresencial ? hpIniNum * hpValorNum : 0) +
    (linhasVisiveis.horaRemoto ? hrIniNum * hrValorNum : 0);

  const qc = useQueryClient();

  const criarServicoMut = useMutation({
    mutationFn: (nome: string) => saveServico({ nome, valor_mensal_padrao: 0 }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.servicos }),
  });

  useEffect(() => {
    setIsEditing(!contrato);
    setPendingServicos(new Map());
    setActiveTab('dados');
  }, [contrato?.id]);

  useEffect(() => {
    setValMensal(fv(contrato?.valor_mensal));
    setImplValorParcela(fv(contrato?.implantacao_valor_parcela));
    setImplParc(fv(contrato?.implantacao_parcelas));
    setHpValor(fv(contrato?.horas_presenciais_valor));
    setHpIni(fv(contrato?.horas_presenciais_saldo_ini));
    setHrValor(fv(contrato?.horas_remotas_valor));
    setHrIni(fv(contrato?.horas_remotas_saldo_ini));
    setLinhasVisiveis({
      mensalidade:    linhaPresenteInicial('mensalidade'),
      implantacao:    linhaPresenteInicial('implantacao'),
      horaPresencial: linhaPresenteInicial('horaPresencial'),
      horaRemoto:     linhaPresenteInicial('horaRemoto'),
    });
  }, [contrato?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCancelEdit = () => {
    setValMensal(fv(contrato?.valor_mensal));
    setImplValorParcela(fv(contrato?.implantacao_valor_parcela));
    setImplParc(fv(contrato?.implantacao_parcelas));
    setHpValor(fv(contrato?.horas_presenciais_valor));
    setHpIni(fv(contrato?.horas_presenciais_saldo_ini));
    setHrValor(fv(contrato?.horas_remotas_valor));
    setHrIni(fv(contrato?.horas_remotas_saldo_ini));
    setLinhasVisiveis({
      mensalidade:    linhaPresenteInicial('mensalidade'),
      implantacao:    linhaPresenteInicial('implantacao'),
      horaPresencial: linhaPresenteInicial('horaPresencial'),
      horaRemoto:     linhaPresenteInicial('horaRemoto'),
    });
    setIsEditing(false);
  };

  const handleSaveWithValores = (formData: Parameters<typeof saveContrato>[0]) => {
    onSave(
      {
        ...formData,
        valor_mensal: linhasVisiveis.mensalidade ? (vMensalNum || 0) : 0,
        implantacao_parcelas: linhasVisiveis.implantacao ? implParcNum : 1,
        implantacao_valor_parcela: linhasVisiveis.implantacao ? implValorParcelaNum : 0,
        horas_presenciais_valor: linhasVisiveis.horaPresencial ? (hpValorNum || 0) : 0,
        horas_presenciais_saldo_ini: linhasVisiveis.horaPresencial ? (hpIniNum || 0) : 0,
        horas_remotas_valor: linhasVisiveis.horaRemoto ? (hrValorNum || 0) : 0,
        horas_remotas_saldo_ini: linhasVisiveis.horaRemoto ? (hrIniNum || 0) : 0,
      },
      pendingServicos,
    );
  };

  const catalogoQ = useQuery({
    queryKey: queryKeys.servicos,
    queryFn: () => fetchServicos(true),
  });

  const servicosContratoQ = useQuery({
    queryKey: queryKeys.contratosServicos(contrato?.id ?? 0),
    queryFn: () => fetchContratosServicos(contrato!.id),
    enabled: !!contrato,
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

  const confirm = useConfirm();

  const handleDesvincularServico = async (servicoNome: string, vinculoId: number) => {
    const ok = await confirm({
      title: 'Remover serviço',
      message: `Remover "${servicoNome}" deste contrato?`,
      confirmLabel: 'Remover',
    });
    if (ok) desvincularMut.mutate(vinculoId);
  };

  const catalogo         = catalogoQ.data ?? [];
  const servicosContrato = servicosContratoQ.data ?? [];
  const vinculoMap       = new Map(servicosContrato.map((s) => [s.servico_id, s]));
  const vinculoOrdem     = new Map(
    [...servicosContrato].sort((a, b) => a.id - b.id).map((v, i) => [v.servico_id, i + 1])
  );
  const totalFaturando   = servicosContrato
    .filter((s) => s.faturando)
    .reduce((acc, s) => acc + parseFloat(String(s.valor_mensal ?? 0)), 0);

  const tabs: { id: 'dados' | 'servicos' | 'anexos'; label: string; count?: number }[] = [
    { id: 'dados', label: 'Dados' },
    { id: 'servicos', label: 'Serviços', count: servicosContrato.length > 0 ? servicosContrato.length : undefined },
    { id: 'anexos', label: 'Anexos' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, borderRadius: 14, border: `1px solid ${C.border}`, background: '#fff' }}>
      <div style={{ display: 'flex', flexShrink: 0, alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
        <div>
          <p style={{ fontSize: 15.5, fontWeight: 700, color: C.text }}>
            {contrato ? `Contrato ${contrato.numero || '—'}` : 'Novo contrato'}
          </p>
          {onEncerrar && <p style={{ fontSize: 12, color: C.textMuted }}>Em vigor</p>}
        </div>
      </div>

      <div className="scrollbar-thin" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* ── Abas ── */}
        <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}` }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, height: 38, padding: '0 4px', marginBottom: -1,
                border: 'none', borderBottom: `2px solid ${activeTab === tab.id ? C.primary : 'transparent'}`,
                background: 'transparent', cursor: 'pointer',
                fontSize: 13.5, fontWeight: activeTab === tab.id ? 700 : 500,
                color: activeTab === tab.id ? C.primaryDark : C.textMuted,
              }}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span style={{ display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 6px', borderRadius: 999, background: C.primarySoft, color: C.primaryDark, fontSize: 10, fontWeight: 700 }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'dados' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* ── Dados do contrato ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={chipGroupLabelStyle}>Contrato</span>
            <span style={{ flex: 1, height: 1, background: C.border }} />
          </div>
          <ContratoForm
            key={isEditing ? 'edit' : 'read'}
            clienteId={clienteId}
            initial={contrato}
            representantes={representantes}
            readOnly={!isEditing}
            onSave={handleSaveWithValores}
          />
        </div>

        {/* ── Valores ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={chipGroupLabelStyle}>Valores</span>
            <span style={{ flex: 1, height: 1, background: C.border }} />
          </div>

          <div style={valuesTableCardStyle}>
            <div style={valuesTableHeaderStyle}>
              <span />
              <span style={valuesTableColLabelStyle}>Und</span>
              <span style={valuesTableColLabelStyle}>Qtde</span>
              <span style={valuesTableColLabelStyle}>Valor unitário</span>
              <span style={valuesTableColLabelStyle}>Calculado</span>
              <span />
            </div>

            {/* Mensalidade */}
            {linhasVisiveis.mensalidade && (
              <div style={valuesRowStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <span style={valuesRowTitleStyle}>Mensalidade</span>
                  <span style={valuesRowSubtitleStyle}>recorrente</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', height: 38, fontSize: 12.5, color: C.placeholder }}>Mês</div>
                <div style={{ display: 'flex', alignItems: 'center', height: 38, fontSize: 13.5, fontWeight: 600, color: C.text }}>12</div>
                <div style={valuesInlineFieldStyle}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.placeholder }}>R$</span>
                  {isEditing ? (
                    <input type="number" min="0" step="0.01" value={valMensal} onChange={(e) => setValMensal(e.target.value)} placeholder="0,00" style={valuesInlineInputStyle} />
                  ) : (
                    <span style={valuesInlineInputStyle}>{vMensalNum > 0 ? valMensal : '—'}</span>
                  )}
                </div>
                <span style={valuesComputedStyle}>{formatCurrency(vMensalNum * 12)}</span>
                {isEditing ? (
                  <button type="button" onClick={() => removerLinha('mensalidade')} style={valuesRemoveButtonStyle} title="Remover linha">×</button>
                ) : <span />}
              </div>
            )}

            {/* Implantação */}
            {linhasVisiveis.implantacao && (
              <div style={valuesRowStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, position: 'relative' }}>
                  <span style={valuesRowTitleStyle}>Implantação</span>
                  <span style={valuesRowSubtitleStyle}>taxa única</span>
                  {isEditing && implantacaoGuide.isVisible && (
                    <FirstAccessGuideCard
                      floating
                      placement="bottom"
                      className="w-[min(25rem,calc(100vw-2rem))]"
                      icon={Info}
                      description={firstAccessGuideMessages.clientesImplantacao}
                      onDismiss={implantacaoGuide.dismiss}
                      onSilenceAll={implantacaoGuide.silenceAll}
                    />
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', height: 38, fontSize: 12.5, color: C.placeholder }}>Parcela</div>
                <div style={valuesInlineFieldStyle}>
                  {isEditing ? (
                    <input type="number" min="1" value={implParc} onChange={(e) => setImplParc(e.target.value)} placeholder="1" style={valuesInlineInputStyle} />
                  ) : (
                    <span style={valuesInlineInputStyle}>{implParc || '1'}</span>
                  )}
                </div>
                <div style={valuesInlineFieldStyle}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.placeholder }}>R$</span>
                  {isEditing ? (
                    <input type="number" min="0" step="0.01" value={implValorParcela} onChange={(e) => setImplValorParcela(e.target.value)} placeholder="0,00" style={valuesInlineInputStyle} />
                  ) : (
                    <span style={valuesInlineInputStyle}>{implValorParcelaNum > 0 ? implValorParcela : '—'}</span>
                  )}
                </div>
                <span style={valuesComputedStyle}>{formatCurrency(implTotalNum)}</span>
                {isEditing ? (
                  <button type="button" onClick={() => removerLinha('implantacao')} style={valuesRemoveButtonStyle} title="Remover linha">×</button>
                ) : <span />}
              </div>
            )}

            {/* Hora presencial */}
            {linhasVisiveis.horaPresencial && (
              <div style={valuesRowStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, position: 'relative' }}>
                  <span style={valuesRowTitleStyle}>Hora presencial</span>
                  <span style={valuesRowSubtitleStyle}>banco de horas</span>
                  {horasGuide.isVisible && (
                    <FirstAccessGuideCard
                      floating
                      placement="bottom"
                      className="w-[min(25rem,calc(100vw-2rem))]"
                      icon={ClockIcon}
                      description={firstAccessGuideMessages.clientesHoras}
                      onDismiss={horasGuide.dismiss}
                      onSilenceAll={horasGuide.silenceAll}
                    />
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', height: 38, fontSize: 12.5, color: C.placeholder }}>Hora</div>
                <div style={valuesInlineFieldStyle}>
                  {isEditing ? (
                    <input type="number" min="0" step="0.5" value={hpIni} onChange={(e) => setHpIni(e.target.value)} placeholder="0" style={valuesInlineInputStyle} />
                  ) : (
                    <span style={valuesInlineInputStyle}>{hpIni || '0'}</span>
                  )}
                </div>
                <div style={valuesInlineFieldStyle}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.placeholder }}>R$</span>
                  {isEditing ? (
                    <input type="number" min="0" step="0.01" value={hpValor} onChange={(e) => setHpValor(e.target.value)} placeholder="0,00" style={valuesInlineInputStyle} />
                  ) : (
                    <span style={valuesInlineInputStyle}>{hpValorNum > 0 ? hpValor : '—'}</span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                  <span style={valuesComputedStyle}>{formatCurrency(hpIniNum * hpValorNum)}</span>
                  <span style={{ fontSize: 10, color: C.placeholder }}>
                    {contrato ? `${parseFloat(String(contrato.horas_presenciais_saldo_atual ?? 0)) || 0}h restantes` : ''}
                  </span>
                </div>
                {isEditing ? (
                  <button type="button" onClick={() => removerLinha('horaPresencial')} style={valuesRemoveButtonStyle} title="Remover linha">×</button>
                ) : <span />}
              </div>
            )}

            {/* Hora remoto */}
            {linhasVisiveis.horaRemoto && (
              <div style={valuesRowLastStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                  <span style={valuesRowTitleStyle}>Hora remoto</span>
                  <span style={valuesRowSubtitleStyle}>banco de horas</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', height: 38, fontSize: 12.5, color: C.placeholder }}>Hora</div>
                <div style={valuesInlineFieldStyle}>
                  {isEditing ? (
                    <input type="number" min="0" step="0.5" value={hrIni} onChange={(e) => setHrIni(e.target.value)} placeholder="0" style={valuesInlineInputStyle} />
                  ) : (
                    <span style={valuesInlineInputStyle}>{hrIni || '0'}</span>
                  )}
                </div>
                <div style={valuesInlineFieldStyle}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.placeholder }}>R$</span>
                  {isEditing ? (
                    <input type="number" min="0" step="0.01" value={hrValor} onChange={(e) => setHrValor(e.target.value)} placeholder="0,00" style={valuesInlineInputStyle} />
                  ) : (
                    <span style={valuesInlineInputStyle}>{hrValorNum > 0 ? hrValor : '—'}</span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                  <span style={valuesComputedStyle}>{formatCurrency(hrIniNum * hrValorNum)}</span>
                  <span style={{ fontSize: 10, color: C.placeholder }}>
                    {contrato ? `${parseFloat(String(contrato.horas_remotas_saldo_atual ?? 0)) || 0}h restantes` : ''}
                  </span>
                </div>
                {isEditing ? (
                  <button type="button" onClick={() => removerLinha('horaRemoto')} style={valuesRemoveButtonStyle} title="Remover linha">×</button>
                ) : <span />}
              </div>
            )}

            {/* Linha de totais */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 16px', background: C.panelBg, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.placeholder }}>Total do contrato</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(totalAnual)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.placeholder }}>Mensal</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(linhasVisiveis.mensalidade ? vMensalNum : 0)}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.placeholder }}>Faturando</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: C.primaryDark, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(totalFaturando)}</span>
              </div>
            </div>
          </div>

          {isEditing && (!linhasVisiveis.mensalidade || !linhasVisiveis.implantacao || !linhasVisiveis.horaPresencial || !linhasVisiveis.horaRemoto) && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {!linhasVisiveis.mensalidade && (
                <button type="button" onClick={() => adicionarLinha('mensalidade')} style={valuesAddRowButtonStyle}><Plus size={12} /> Mensalidade</button>
              )}
              {!linhasVisiveis.implantacao && (
                <button type="button" onClick={() => adicionarLinha('implantacao')} style={valuesAddRowButtonStyle}><Plus size={12} /> Implantação</button>
              )}
              {!linhasVisiveis.horaPresencial && (
                <button type="button" onClick={() => adicionarLinha('horaPresencial')} style={valuesAddRowButtonStyle}><Plus size={12} /> Hora presencial</button>
              )}
              {!linhasVisiveis.horaRemoto && (
                <button type="button" onClick={() => adicionarLinha('horaRemoto')} style={valuesAddRowButtonStyle}><Plus size={12} /> Hora remoto</button>
              )}
            </div>
          )}
        </div>
        </div>
        )}

        {activeTab === 'servicos' && (
          <div className="flex flex-col gap-3">
            {catalogoQ.isLoading ? (
              <p style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: C.placeholder }}>Carregando serviços...</p>
            ) : catalogo.length === 0 ? (
              <div className="grid gap-3">
                <EmptyState title="Sem serviços" description="Nenhum serviço cadastrado no catálogo." />
                {!showServicoForm ? (
                  <button
                    type="button"
                    onClick={() => setShowServicoForm(true)}
                    style={{ margin: '0 auto', display: 'flex', alignItems: 'center', gap: 6, borderRadius: 12, border: `1.5px dashed ${C.chipOffBorder}`, padding: '8px 16px', fontSize: 12, fontWeight: 600, color: C.textMuted, background: 'transparent', cursor: 'pointer' }}
                  >
                    <Plus size={13} /> Cadastrar serviço
                  </button>
                ) : (
                  <div style={{ margin: '0 auto', display: 'flex', width: '100%', maxWidth: 384, alignItems: 'center', gap: 8, borderRadius: 12, border: `1px solid ${C.primarySoftBorder}`, background: C.primarySoft, padding: 8 }}>
                    <input
                      type="text"
                      id="novo-servico-input"
                      autoFocus
                      placeholder="Nome do serviço"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const v = e.currentTarget.value.trim();
                          if (v) criarServicoMut.mutate(v, { onSuccess: () => setShowServicoForm(false) });
                        }
                        if (e.key === 'Escape') { e.preventDefault(); setShowServicoForm(false); }
                      }}
                      style={{ flex: 1, borderRadius: 8, border: `1.5px solid ${C.borderInput}`, background: '#fff', padding: '6px 10px', fontSize: 13, color: C.text, outline: 'none' }}
                    />
                    <button
                      type="button"
                      disabled={criarServicoMut.isPending}
                      onClick={() => {
                        const el = document.getElementById('novo-servico-input') as HTMLInputElement | null;
                        const v = el?.value.trim();
                        if (v) criarServicoMut.mutate(v, { onSuccess: () => setShowServicoForm(false) });
                      }}
                      style={{ borderRadius: 8, background: C.primary, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#fff', border: 'none', cursor: criarServicoMut.isPending ? 'not-allowed' : 'pointer', opacity: criarServicoMut.isPending ? 0.5 : 1, whiteSpace: 'nowrap' }}
                    >
                      {criarServicoMut.isPending ? '...' : 'Criar'}
                    </button>
                    <button type="button" onClick={() => setShowServicoForm(false)} style={{ color: C.placeholder, background: 'none', border: 'none', cursor: 'pointer' }}>
                      <X size={14} />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div
                  style={{
                    position: 'relative', display: 'grid', alignItems: 'center', columnGap: 12,
                    padding: '8px 0', borderBottom: `1px solid ${C.border}`,
                    gridTemplateColumns: contrato ? '28px 1fr 90px 72px 80px 80px' : '28px 1fr 90px 72px',
                  }}
                >
                  <span />
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.textFaint }}>Serviço</span>
                  <span style={{ ...valuesTableColLabelStyle, textAlign: 'right' }}>Valor/mês</span>
                  <span style={{ ...valuesTableColLabelStyle, textAlign: 'center' }}>Contratado</span>
                  {contrato && <span style={{ ...valuesTableColLabelStyle, textAlign: 'center' }}>Implantado</span>}
                  {contrato && <span style={{ ...valuesTableColLabelStyle, textAlign: 'center' }}>Faturando</span>}
                  {contrato && servicosVinculoGuide.isVisible && (
                    <FirstAccessGuideCard
                      floating
                      placement="top"
                      align="right"
                      className="w-[min(25rem,calc(100vw-2rem))]"
                      icon={Info}
                      description={firstAccessGuideMessages.clientesServicosVinculo}
                      onDismiss={servicosVinculoGuide.dismiss}
                      onSilenceAll={servicosVinculoGuide.silenceAll}
                    />
                  )}
                </div>
                <div className="scrollbar-thin overflow-y-auto flex-1 grid gap-2 content-start">
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
                        disabled={!isEditing}
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
                            if (v) handleDesvincularServico(servico.nome, v.id);
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
            {catalogo.length > 0 && (
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0 0', marginTop: 8, borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.placeholder }}>Faturando</span>
                <span style={{ fontSize: 17, fontWeight: 800, color: C.primaryDark, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(totalFaturando)}</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'anexos' && (
          contrato
            ? <ContratoAnexos contratoId={contrato.id} />
            : <p style={{ fontSize: 13, color: C.placeholder, padding: '24px 0', textAlign: 'center' }}>Salve o contrato para anexar arquivos.</p>
        )}

      </div>
      </div>

      <div style={{ display: 'flex', flexShrink: 0, alignItems: 'center', justifyContent: 'flex-end', gap: 24, flexWrap: 'wrap', borderTop: `1px solid ${C.border}`, padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {onEncerrar && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={onEncerrar}
                style={{ display: 'flex', alignItems: 'center', gap: 6, height: 40, padding: '0 14px', borderRadius: 11, border: 'none', background: 'transparent', color: C.danger, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                <AlertTriangle size={13} /> Encerrar
              </button>
              {encerrarGuide.isVisible && (
                <FirstAccessGuideCard
                  floating
                  placement="top"
                  className="w-[min(24rem,calc(100vw-2rem))]"
                  icon={AlertTriangle}
                  description={firstAccessGuideMessages.clientesEncerrarContrato}
                  onDismiss={encerrarGuide.dismiss}
                  onSilenceAll={encerrarGuide.silenceAll}
                />
              )}
            </div>
          )}
          {onRegistrarAditivo && (
            <button
              type="button"
              onClick={onRegistrarAditivo}
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 40, padding: '0 16px', borderRadius: 11, border: `1.5px solid ${C.chipOffBorder}`, background: '#fff', color: C.chipOffText, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <RefreshCw size={13} /> Registrar aditivo
            </button>
          )}
          {!isEditing && contrato ? (
            <Button onClick={() => setIsEditing(true)}>Editar</Button>
          ) : (
            <>
              {contrato && (
                <Button variant="secondary" onClick={handleCancelEdit}>Cancelar</Button>
              )}
              <Button
                disabled={isSaving}
                onClick={() => (document.getElementById('contrato-form') as HTMLFormElement | null)?.requestSubmit()}
              >
                {isSaving ? 'Salvando...' : contrato ? 'Salvar alterações' : 'Criar contrato'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Aditivo Modal ────────────────────────────────────────────────────────────

function AditivoModal({
  open, contrato, isSaving, onClose, onSave,
}: {
  open: boolean;
  contrato?: Contrato;
  isSaving: boolean;
  onClose: () => void;
  onSave: (data: AditivoContratoValues) => void;
}) {
  const [form, setForm] = useState({
    novo_numero: '', novo_vencimento: '',
    nova_data_inicio_faturamento: '', observacoes: '',
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      novo_numero: contrato?.numero ?? '',
      novo_vencimento: '',
      nova_data_inicio_faturamento: '',
      observacoes: contrato?.observacoes ?? '',
    });
  }, [open, contrato]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      novo_numero: form.novo_numero || null,
      novo_vencimento: form.novo_vencimento,
      novo_num_aditivo: (contrato?.num_aditivo ?? 0) + 1,
      nova_data_aditivo: null,
      novo_ajuste: contrato?.ajuste ?? null,
      nova_data_inicio_faturamento: form.nova_data_inicio_faturamento || null,
      observacoes: form.observacoes || null,
    });
  };

  return (
    <Dialog open={open} title="Registrar aditivo" onClose={onClose} scrollBody={false}>
      <form id="aditivo-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 -26px' }}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          <p style={{ margin: '0 26px 14px', fontSize: 12.5, color: C.textMuted }}>
            Encerra o contrato atual e cria um novo, copiando valores, horas e serviços vinculados.
          </p>
          <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Novo número</label>
              <input value={form.novo_numero} onChange={(e) => set('novo_numero', e.target.value)} placeholder="002/2026" style={{ ...fieldInputStyle, height: 40, fontSize: 14, fontWeight: 600 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Novo vencimento <span style={{ color: C.danger }}>*</span></label>
              <input type="date" value={form.novo_vencimento} onChange={(e) => set('novo_vencimento', e.target.value)} required style={{ ...fieldInputStyle, height: 40, fontSize: 13 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Novo início fatur.</label>
              <input type="date" value={form.nova_data_inicio_faturamento} onChange={(e) => set('nova_data_inicio_faturamento', e.target.value)} style={{ ...fieldInputStyle, height: 40, fontSize: 13 }} />
            </div>
          </div>
          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle}>Observações</label>
              <textarea
                value={form.observacoes}
                onChange={(e) => set('observacoes', e.target.value)}
                rows={3}
                style={{ ...fieldInputStyle, height: 'auto', minHeight: 86, padding: '10px 12px', fontSize: 13.5, fontWeight: 400, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
          </div>
        </div>
        <div style={{ flex: 'none', borderTop: `1px solid ${C.border}`, background: '#fafcfd', padding: '14px 26px 16px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ height: 40, padding: '0 16px', borderRadius: 11, fontSize: 13, fontWeight: 600, border: `1.5px solid ${C.chipOffBorder}`, background: '#fff', color: C.chipOffText, cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSaving}
            style={{
              height: 40, padding: '0 20px', borderRadius: 11, fontSize: 13, fontWeight: 700, border: 'none',
              background: C.primary, color: '#fff', boxShadow: '0 2px 10px -2px rgba(8,145,178,0.55)',
              cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.6 : 1,
            }}
          >
            {isSaving ? 'Registrando...' : 'Registrar aditivo'}
          </button>
        </div>
      </form>
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
  const confirm = useConfirm();
  // undefined = nenhum contrato ainda selecionado (padrão: cai no ativo mais recente);
  // 'new' = formulário de novo contrato; number = id de um contrato existente selecionado.
  const [selectedId, setSelectedId] = useState<number | 'new' | undefined>(undefined);
  const gerarPrevistasGuide = useFirstAccessGuide('clientes:gerar-previstas-v1');

  const contratosQ = useQuery({
    queryKey: queryKeys.contratos(cliente.id),
    queryFn: () => fetchContratos(cliente.id),
  });

  const representantesQ = useQuery({
    queryKey: queryKeys.representantes,
    queryFn: fetchRepresentantes,
  });

  const contratos = contratosQ.data ?? [];
  const contratoAtivo = contratos.find((c) => c.status === 'ativo') ?? contratos[0];
  const selectedContrato = selectedId === 'new'
    ? undefined
    : selectedId !== undefined
      ? contratos.find((c) => c.id === selectedId)
      : contratoAtivo;
  const isNewForm = selectedId === 'new' || (selectedId === undefined && !contratoAtivo);
  const representantes = (representantesQ.data ?? []).filter((r) => r.ativo);

  const saveContratoMut = useMutation({
    mutationFn: async ({ data, pendingServicos }: {
      data: Parameters<typeof saveContrato>[0];
      pendingServicos?: Map<number, number>;
    }) => {
      const saved = await saveContrato(data, selectedContrato?.id);
      if (!selectedContrato && pendingServicos?.size) {
        await Promise.all(
          Array.from(pendingServicos.entries()).map(([servicoId, valorMensal]) =>
            vincularServico(saved.id, servicoId, valorMensal),
          ),
        );
      }
      return saved;
    },
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: queryKeys.contratos(cliente.id) });
      // Novo ou editado: re-gerar previstas sempre que houver início de faturamento,
      // já que gerarPrevistas cancela+regenera com segurança (idempotente).
      if (saved.data_inicio_faturamento) {
        gerarMut.mutate(saved.id);
      }
      if (!selectedContrato && (saved.implantacao_valor_parcela ?? 0) > 0) {
        // Receita de implantação só faz sentido na criação do contrato.
        void criarReceitaImplantacao(saved.id);
      }
      setSelectedId(saved.id);
    },
  });

  const encerrarMut = useMutation({
    mutationFn: (id: number) => encerrarContrato(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.contratos(cliente.id) });
    },
  });

  const handleEncerrarContrato = async (contratoId: number) => {
    const ok = await confirm({
      title: 'Encerrar contrato',
      message: 'Encerrar contrato e cancelar receitas previstas futuras?',
      confirmLabel: 'Encerrar contrato',
    });
    if (ok) encerrarMut.mutate(contratoId);
  };

  const [aditivoModal, setAditivoModal] = useState<{ open: boolean; contrato?: Contrato }>({ open: false });

  const aditivoMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: AditivoContratoValues }) => registrarAditivo(id, data),
    onSuccess: (novoContrato) => {
      void qc.invalidateQueries({ queryKey: queryKeys.contratos(cliente.id) });
      setAditivoModal({ open: false });
      setSelectedId(novoContrato.id);
    },
  });

  const gerarMut = useMutation({
    mutationFn: (id: number) => gerarPrevistas(id),
  });

  return (
    <div className="flex h-full flex-col gap-4">

      {/* Header */}
      <div className="flex shrink-0 items-center gap-3">
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
          {contratoAtivo && (
            <div className="relative">
              <div className="flex flex-col items-end gap-0.5">
                <Button
                  variant="secondary"
                  icon={<RefreshCw size={14} />}
                  onClick={() => gerarMut.mutate(contratoAtivo.id)}
                  disabled={gerarMut.isPending}
                >
                  {gerarMut.isPending ? 'Gerando...' : 'Gerar previstas'}
                </Button>
                {gerarMut.isSuccess && (
                  <span className="text-[11px] text-slate-400">
                    {gerarMut.data.count} previstas geradas
                  </span>
                )}
              </div>
              {gerarPrevistasGuide.isVisible && (
                <FirstAccessGuideCard
                  floating
                  placement="top"
                  align="right"
                  className="w-[min(25rem,calc(100vw-2rem))]"
                  icon={RefreshCw}
                  description={firstAccessGuideMessages.clientesGerarPrevistas}
                  onDismiss={gerarPrevistasGuide.dismiss}
                  onSilenceAll={gerarPrevistasGuide.silenceAll}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Master-detail: lista de contratos à esquerda, detalhe à direita */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        <div className="flex shrink-0 flex-col gap-3 lg:w-[260px]">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {contratos.length > 0
                ? `${contratos.length} contrato${contratos.length !== 1 ? 's' : ''}`
                : 'Nenhum contrato'}
            </p>
            <Button icon={<Plus size={14} />} onClick={() => setSelectedId('new')}>
              Novo
            </Button>
          </div>

          {contratosQ.isLoading && (
            <p className="py-4 text-center text-sm text-slate-400">Carregando...</p>
          )}

          {!contratosQ.isLoading && contratos.length === 0 && !isNewForm && (
            <EmptyState
              title="Sem contratos"
              description="Nenhum contrato cadastrado para este cliente."
            />
          )}

          {contratos.length > 0 && (
            <div className="scrollbar-thin grid gap-2 overflow-y-auto lg:max-h-full">
              {contratos.map((c, i) => (
                <ContratoRow
                  key={c.id}
                  contrato={c}
                  index={i}
                  active={!isNewForm && selectedContrato?.id === c.id}
                  onClick={() => setSelectedId(c.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1">
          <ContratoDetailPane
            key={isNewForm ? 'new' : selectedContrato?.id}
            contrato={selectedContrato}
            clienteId={cliente.id}
            representantes={representantes}
            isSaving={saveContratoMut.isPending}
            onSave={(data, pendingServicos) => saveContratoMut.mutate({ data, pendingServicos })}
            onEncerrar={
              selectedContrato?.status === 'ativo'
                ? () => handleEncerrarContrato(selectedContrato.id)
                : undefined
            }
            onRegistrarAditivo={
              selectedContrato?.status === 'ativo'
                ? () => setAditivoModal({ open: true, contrato: selectedContrato })
                : undefined
            }
          />
        </div>
      </div>

      <AditivoModal
        open={aditivoModal.open}
        contrato={aditivoModal.contrato}
        isSaving={aditivoMut.isPending}
        onClose={() => setAditivoModal({ open: false })}
        onSave={(data) => {
          if (aditivoModal.contrato) aditivoMut.mutate({ id: aditivoModal.contrato.id, data });
        }}
      />

    </div>
  );
}
