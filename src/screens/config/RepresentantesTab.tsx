import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Percent, Check } from 'lucide-react';
import {
  fetchRepresentantes, saveRepresentante, deleteRepresentante,
  type Representante, type RepresentanteFormValues, type Comissao,
} from '../../services/representantesService';
import { fetchIncomeTypes, saveIncomeType } from '../../services/incomeTypesService';
import { queryKeys } from '../../services/queryKeys';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, saveButtonStyle, saveButtonDisabledStyle, dangerButtonStyle, dialogFooterStyle } from '../../ui/dialogFormTokens';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { ConfigTabHeader } from '../../ui/ConfigTabHeader';
import { ConfigSwitch } from '../../ui/ConfigSwitch';
import { CFG, cfgBadgeStyle, cfgDividerStyle, cfgIconButtonStyle } from '../../ui/configTokens';
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
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          ref={inputRef}
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleCreate(); }
            if (e.key === 'Escape') cancelCreate();
          }}
          placeholder="Nome do tipo de receita"
          style={{ ...fieldInputStyle, flex: 1, borderColor: C.primary }}
        />
        <button
          type="button"
          onClick={handleCreate}
          disabled={saving || !newName.trim()}
          style={{ ...cfgIconButtonStyle, borderColor: C.primary, background: C.primary, color: '#fff', opacity: saving || !newName.trim() ? 0.5 : 1 }}
          title="Criar tipo"
        >
          <Check size={13} />
        </button>
        <button
          type="button"
          onClick={cancelCreate}
          style={cfgIconButtonStyle}
          title="Cancelar"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  const tipoAtual = comissao.tipo ?? 'mensal';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 110px 32px', gap: 8, alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 6, minWidth: 0 }}>
        <select
          value={comissao.tipo_receita}
          onChange={(e) => onChange({ ...comissao, tipo_receita: e.target.value })}
          style={{ ...fieldInputStyle, flex: 1 }}
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
          style={cfgIconButtonStyle}
        >
          <Plus size={13} />
        </button>
      </div>

      {/* Frequência: segmented control, mesma escala dos demais campos. */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 3, height: 32, padding: 3, borderRadius: 999, background: CFG.chipBg }}>
          {([['mensal', 'Mensal'], ['unica', 'Única']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange({ ...comissao, tipo: id })}
              style={{
                display: 'flex', alignItems: 'center', padding: '0 12px', borderRadius: 999,
                border: 'none', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                background: tipoAtual === id ? CFG.primary : 'transparent',
                color: tipoAtual === id ? '#fff' : CFG.muted,
              }}
            >
              {label}
            </button>
          ))}
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

      <div style={{ position: 'relative' }}>
        <input
          type="number"
          min="0.01"
          max="100"
          step="0.01"
          value={comissao.percentual}
          onChange={(e) => onChange({ ...comissao, percentual: parseFloat(e.target.value) || 0 })}
          style={{ ...fieldInputStyle, paddingRight: 24 }}
          placeholder="0,00"
        />
        <Percent size={11} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: C.placeholder }} />
      </div>

      <button
        type="button"
        onClick={onRemove}
        title="Remover comissão"
        style={{ ...cfgIconButtonStyle, border: 'none', color: C.placeholder }}
      >
        <X size={13} />
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
      title: 'Desativar representante',
      message: `Desativar "${rep?.nome}"? Ele deixará de aparecer na lista de representantes ativos.`,
      confirmLabel: 'Desativar',
      variant: 'danger',
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
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={handleSubmit}>
        {/* A lista de comissões é dinâmica, então aqui a altura é limitada por
            maxHeight com scroll — não fixa como nos demais modais. */}
        <div style={{ flex: 1, minHeight: 0, maxHeight: 340, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}><span>Nome completo</span><span style={{ color: C.danger }}>*</span></label>
            <input name="nome" defaultValue={rep?.nome} placeholder="Ex: João Silva" autoFocus required style={fieldInputStyle} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>E-mail</label>
              <input name="email" type="email" defaultValue={rep?.email ?? ''} placeholder="joao@email.com" style={fieldInputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Telefone</label>
              <input name="telefone" defaultValue={rep?.telefone ?? ''} placeholder="(11) 99999-9999" style={fieldInputStyle} />
            </div>
          </div>

          <div style={cfgDividerStyle} />

          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={labelStyle}>Comissões por tipo de receita</label>

            {tiposReceita.length === 0 && (
              <p style={{ borderRadius: 10, border: `1px solid ${CFG.warnBorder}`, background: CFG.warnBg, padding: '7px 9px', fontSize: 11.5, color: CFG.warnText, margin: 0 }}>
                Nenhum tipo de receita cadastrado. Use o botão <strong>+</strong> ao lado do seletor para criar um.
              </p>
            )}

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 110px 32px', gap: 8, padding: '0 2px' }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: CFG.muted }}>Tipo de receita</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: CFG.muted }}>Frequência</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: CFG.muted }}>Percentual</span>
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
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, height: 30, borderRadius: 999, border: `1px dashed ${CFG.borderInput}`, fontSize: 11.5, fontWeight: 600, color: CFG.muted, background: 'transparent', cursor: 'pointer' }}
              >
                <Plus size={12} strokeWidth={2.6} />
                Adicionar comissão
              </button>
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
            <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        <div style={dialogFooterStyle}>
          {/* Ação destrutiva só na edição de registro existente. */}
          {rep && onDelete && (
            <button type="button" style={dangerButtonStyle} onClick={handleDelete}>Desativar</button>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <button
              type="submit"
              disabled={isSaving}
              style={isSaving ? saveButtonDisabledStyle : saveButtonStyle}
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
  const [mostrarDesativados, setMostrarDesativados] = useState(false);
  const createGuide = useFirstAccessGuide('representantes:novo-v1');

  const reps = useQuery({
    queryKey: [...queryKeys.representantes, mostrarDesativados],
    queryFn: () => fetchRepresentantes(mostrarDesativados),
  });
  const incomeTypesQ = useQuery({ queryKey: queryKeys.incomeTypes, queryFn: fetchIncomeTypes });
  const todos = reps.data ?? [];
  const data = todos.filter((r) => (mostrarDesativados ? !r.ativo : r.ativo));
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
    <div className="grid gap-2.5">
      <ConfigTabHeader
        filters={
          <ConfigSwitch
            checked={mostrarDesativados}
            onChange={setMostrarDesativados}
            label={`${data.length} representante${data.length === 1 ? '' : 's'} ${mostrarDesativados ? 'desativado' : 'ativo'}${data.length === 1 ? '' : 's'}`}
          />
        }
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((r, i) => (
          <ConfigListRow
            key={r.id}
            index={i}
            nome={r.nome}
            dataCriacao={r.data_criacao}
            onClick={() => setDialog({ open: true, item: r })}
            badges={r.comissoes?.length
              ? <span style={cfgBadgeStyle}>{r.comissoes.length} comissã{r.comissoes.length === 1 ? 'o' : 'es'}</span>
              : undefined}
          />
        ))}
        {data.length === 0 && !reps.isLoading && (
          <EmptyState title={mostrarDesativados ? 'Nenhum representante desativado' : 'Nenhum representante cadastrado'} />
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
