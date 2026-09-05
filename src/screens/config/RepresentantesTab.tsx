import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Percent, Check } from 'lucide-react';
import {
  fetchRepresentantes, saveRepresentante, deleteRepresentante,
  type Representante, type RepresentanteFormValues, type Comissao,
} from '../../services/representantesService';
import { fetchIncomeTypes, saveIncomeType } from '../../services/incomeTypesService';
import { queryKeys } from '../../services/queryKeys';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, cardStyle, chipStyle } from '../../ui/dialogFormTokens';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { ConfigTabHeader } from '../../ui/ConfigTabHeader';
import { CFG } from '../../ui/configTokens';
import { EmptyState } from '../../ui/EmptyState';
import { InfoBanner } from '../../ui/InfoBanner';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { GUIDE_LAYER_MODAL } from '../../context/FirstAccessGuideContext';
import { useConfirm } from '../../context/ConfirmContext';

function ComissaoRow({
  comissao,
  tiposReceita,
  onChange,
  onRemove,
  onCreateType,
  tipoGuide,
}: {
  comissao: Comissao;
  tiposReceita: string[];
  onChange: (c: Comissao) => void;
  onRemove: () => void;
  onCreateType: (name: string) => Promise<string>;
  tipoGuide?: { description: string; onDismiss: () => void };
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const created = await onCreateType(name);
      onChange({ ...comissao, tipo_receita: created });
      setCreating(false);
      setNewName('');
    } finally {
      setSaving(false);
    }
  };

  const cancelCreate = () => { setCreating(false); setNewName(''); };

  if (creating) {
    return (
      <div style={{ borderRadius: 10, border: `1.5px solid ${C.primary}`, background: C.primarySoft, padding: 10, display: 'grid', gap: 8 }}>
        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.primaryDark, margin: 0 }}>Criar tipo de receita</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleCreate(); }
              if (e.key === 'Escape') cancelCreate();
            }}
            placeholder="Ex: Mensalidade, Consultoria..."
            style={{ flex: 1, height: 36, borderRadius: 8, border: `1.5px solid ${C.primary}`, background: '#fff', padding: '0 10px', fontSize: 13, color: C.text, outline: 'none' }}
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving || !newName.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8, background: C.primary, padding: '0 12px', fontSize: 13, fontWeight: 600, color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', opacity: saving || !newName.trim() ? 0.5 : 1 }}
          >
            <Check size={13} />
            {saving ? 'Salvando...' : 'Criar'}
          </button>
          <button
            type="button"
            onClick={cancelCreate}
            style={{ borderRadius: 8, border: `1.5px solid ${C.borderInput}`, background: '#fff', padding: '0 12px', fontSize: 13, color: C.textMuted, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Cancelar
          </button>
        </div>
        <p style={{ fontSize: 12, color: C.primaryDark, margin: 0 }}>O tipo será salvo e selecionado automaticamente nesta linha.</p>
      </div>
    );
  }

  const tipoAtual = comissao.tipo ?? 'mensal';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', flex: 1, gap: 6 }}>
        <select
          value={comissao.tipo_receita}
          onChange={(e) => onChange({ ...comissao, tipo_receita: e.target.value })}
          style={{ ...fieldInputStyle, height: 42, fontSize: 14, flex: 1 }}
        >
          {tiposReceita.length === 0 && (
            <option value={comissao.tipo_receita}>{comissao.tipo_receita || '—'}</option>
          )}
          {tiposReceita.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setCreating(true)}
          title="Criar novo tipo de receita"
          style={{ display: 'flex', height: 42, width: 42, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: `1.5px dashed ${C.chipOffBorder}`, color: C.textMuted, background: 'transparent', cursor: 'pointer' }}
        >
          <Plus size={14} />
        </button>
      </div>
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <div onClick={() => onChange({ ...comissao, tipo: 'mensal' })} style={chipStyle(tipoAtual === 'mensal', { h: 42, r: 10, size: 12.5 })}>
            Mensal
          </div>
          <div onClick={() => onChange({ ...comissao, tipo: 'unica' })} style={chipStyle(tipoAtual === 'unica', { h: 42, r: 10, size: 12.5 })}>
            Única
          </div>
        </div>
        {tipoGuide && (
          <FirstAccessGuideCard
            floating
            placement="bottom"
            className="w-[min(24rem,calc(100vw-2rem))]"
            icon={Percent}
            description={tipoGuide.description}
            onDismiss={tipoGuide.onDismiss}
          />
        )}
      </div>
      <div style={{ position: 'relative', width: 110 }}>
        <input
          type="number"
          min="0.01"
          max="100"
          step="0.01"
          value={comissao.percentual}
          onChange={(e) => onChange({ ...comissao, percentual: parseFloat(e.target.value) || 0 })}
          style={{ ...fieldInputStyle, height: 42, fontSize: 14, paddingRight: 26 }}
          placeholder="0,00"
        />
        <Percent size={12} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: C.placeholder }} />
      </div>
      <button
        type="button"
        onClick={onRemove}
        style={{ display: 'flex', height: 36, width: 36, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 9, color: C.placeholder, background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function RepresentanteDialog({
  open, rep, tiposReceita, isSaving, error, onClose, onSave, onDelete,
}: {
  open: boolean; rep?: Representante; tiposReceita: string[]; isSaving: boolean; error?: string;
  onClose: () => void; onSave: (v: RepresentanteFormValues) => void;
  onDelete?: () => void;
}) {
  const qc = useQueryClient();
  const defaultTipo = tiposReceita[0] ?? '';
  const [comissoes, setComissoes] = useState<Comissao[]>(
    rep?.comissoes?.length ? rep.comissoes : [{ tipo_receita: defaultTipo, percentual: 5, tipo: 'mensal' }]
  );
  const confirm = useConfirm();
  const comissoesGuide = useFirstAccessGuide('representantes:comissoes-v1', {
    enabled: open,
    layer: GUIDE_LAYER_MODAL,
  });
  const tipoComissaoGuide = useFirstAccessGuide('representantes:tipo-comissao-v1', {
    enabled: open && comissoes.length > 0,
    layer: GUIDE_LAYER_MODAL,
  });

  const createTypeMut = useMutation({
    mutationFn: (nome: string) => saveIncomeType(nome),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.incomeTypes }),
  });

  const handleCreateType = async (nome: string): Promise<string> => {
    const created = await createTypeMut.mutateAsync(nome);
    return created.nome;
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    const ok = await confirm({
      title: 'Excluir representante',
      message: `Excluir "${rep?.nome}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
    });
    if (ok) onDelete();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onSave({
      nome: fd.get('nome') as string,
      email: (fd.get('email') as string) || undefined,
      telefone: (fd.get('telefone') as string) || undefined,
      comissoes: comissoes.filter((c) => c.tipo_receita && c.percentual > 0),
    });
  };

  const addComissao = () =>
    setComissoes((prev) => [...prev, { tipo_receita: defaultTipo, percentual: 5, tipo: 'mensal' }]);

  const updateComissao = (i: number, c: Comissao) =>
    setComissoes((prev) => prev.map((x, idx) => (idx === i ? c : x)));

  const removeComissao = (i: number) =>
    setComissoes((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <Dialog open={open} title={rep ? 'Editar representante' : 'Novo representante'} onClose={onClose} size="lg" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 -26px' }} onSubmit={handleSubmit}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}><span>NOME COMPLETO</span><span style={{ color: C.primary }}>*</span></label>
              <input name="nome" defaultValue={rep?.nome} placeholder="Ex: João Silva" autoFocus required style={fieldInputStyle} />
            </div>
          </div>

          <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 15 }}>
                <label style={{ ...labelStyle, height: 'auto' }}>E-MAIL</label>
                <span style={{ fontSize: 11, color: C.placeholder }}>opcional</span>
              </div>
              <input name="email" type="email" defaultValue={rep?.email ?? ''} placeholder="joao@email.com" style={fieldInputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 15 }}>
                <label style={{ ...labelStyle, height: 'auto' }}>TELEFONE</label>
                <span style={{ fontSize: 11, color: C.placeholder }}>opcional</span>
              </div>
              <input name="telefone" defaultValue={rep?.telefone ?? ''} placeholder="(11) 99999-9999" style={fieldInputStyle} />
            </div>
          </div>

          <div style={{ ...cardStyle, position: 'relative' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={labelStyle}>COMISSÕES POR TIPO DE RECEITA</label>

              {tiposReceita.length === 0 && (
                <p style={{ borderRadius: 8, border: `1px solid ${C.warnBorder}`, background: C.warnBg, padding: '8px 12px', fontSize: 12.5, color: C.warn, margin: 0 }}>
                  Nenhum tipo de receita cadastrado. Use o botão <strong>+</strong> ao lado do seletor para criar um.
                </p>
              )}

              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 110px 36px', gap: 8, padding: '0 2px' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.textMuted }}>Tipo de receita</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.textMuted }}>Frequência</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.textMuted }}>Percentual</span>
                  <span />
                </div>
                {comissoes.map((c, i) => (
                  <ComissaoRow
                    key={i}
                    comissao={c}
                    tiposReceita={tiposReceita}
                    onChange={(updated) => updateComissao(i, updated)}
                    onRemove={() => removeComissao(i)}
                    onCreateType={handleCreateType}
                    tipoGuide={i === 0 && tipoComissaoGuide.isVisible
                      ? { description: firstAccessGuideMessages.representantesTipoComissao, onDismiss: tipoComissaoGuide.dismiss }
                      : undefined}
                  />
                ))}
                <button
                  type="button"
                  onClick={addComissao}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, borderRadius: 10, border: `1.5px dashed ${C.chipOffBorder}`, padding: '10px 12px', fontSize: 13, color: C.textMuted, background: 'transparent', cursor: 'pointer' }}
                >
                  <Plus size={14} />
                  Adicionar comissão
                </button>
              </div>
            </div>
            {comissoesGuide.isVisible && (
              <FirstAccessGuideCard
                floating
                placement="top"
                className="w-[min(25rem,calc(100vw-2rem))]"
                icon={Percent}
                description={firstAccessGuideMessages.representantesComissoes}
                onDismiss={comissoesGuide.dismiss}
                onSilenceAll={comissoesGuide.silenceAll}
              />
            )}
          </div>

          {error && (
            <div style={{ margin: '0 26px 14px', borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '10px 14px', fontSize: 13, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ flex: 'none', borderTop: '1px solid #eef3f6', background: '#fafcfd', padding: '14px 26px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          {rep && onDelete && (
            <Button type="button" variant="danger" onClick={handleDelete}>Excluir</Button>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                padding: '12px 22px', borderRadius: 11, fontSize: 14, fontWeight: 700,
                border: 'none', transition: 'all .15s ease', cursor: isSaving ? 'not-allowed' : 'pointer',
                ...(isSaving
                  ? { background: '#e6edf1', color: '#a3b6c0', boxShadow: 'none' }
                  : { background: C.primary, color: '#fff', boxShadow: '0 6px 16px -6px rgba(8,145,178,0.75)' }),
              }}
            >
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

export function RepresentantesTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Representante }>({ open: false });
  const createGuide = useFirstAccessGuide('representantes:novo-v1');

  const reps = useQuery({ queryKey: queryKeys.representantes, queryFn: fetchRepresentantes });
  const incomeTypesQ = useQuery({ queryKey: queryKeys.incomeTypes, queryFn: fetchIncomeTypes });
  const data = reps.data ?? [];
  const tiposReceita = (incomeTypesQ.data ?? []).filter((t) => t.ativo).map((t) => t.nome);

  const saveMut = useMutation({
    mutationFn: ({ v, id }: { v: RepresentanteFormValues; id?: number }) => saveRepresentante(v, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.representantes }); setDialog({ open: false }); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteRepresentante,
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.representantes }); setDialog({ open: false }); },
  });

  return (
    <div className="grid gap-3">
      <ConfigTabHeader
        countLabel={`${data.length} representante${data.length !== 1 ? 's' : ''} cadastrado${data.length !== 1 ? 's' : ''}`}
        actionLabel="Novo representante"
        onAction={() => setDialog({ open: true })}
      >
        {createGuide.isVisible && (
          <FirstAccessGuideCard
            icon={Plus}
            description={firstAccessGuideMessages.representantesNovo}
            align="right"
            floating
            placement="top"
            className="w-[min(24rem,calc(100vw-2rem))]"
            onDismiss={createGuide.dismiss}
            onSilenceAll={createGuide.silenceAll}
          />
        )}
      </ConfigTabHeader>

      <InfoBanner>
        Representantes recebem comissão automática calculada sobre receitas por tipo. Configure os percentuais por categoria.
      </InfoBanner>

      {reps.isLoading && (
        <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>Carregando...</p>
      )}

      <div className="grid gap-1.5">
        {data.map((r, i) => (
          <ConfigListRow
            key={r.id}
            index={i}
            nome={r.nome}
            dataCriacao={r.data_criacao}
            dataAtualizacao={r.data_atualizacao}
            onClick={() => setDialog({ open: true, item: r })}
          />
        ))}
        {data.length === 0 && !reps.isLoading && (
          <EmptyState title="Nenhum representante cadastrado" />
        )}
      </div>

      <RepresentanteDialog
        open={dialog.open}
        rep={dialog.item}
        tiposReceita={tiposReceita}
        isSaving={saveMut.isPending}
        error={saveMut.error?.message}
        onClose={() => setDialog({ open: false })}
        onSave={(v) => saveMut.mutate({ v, id: dialog.item?.id })}
        onDelete={dialog.item ? () => deleteMut.mutate(dialog.item!.id) : undefined}
      />
    </div>
  );
}
