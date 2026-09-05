import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, AlertCircle } from 'lucide-react';
import {
  fetchSocios, saveSocio, deleteSocio,
  type Socio, type SocioFormValues,
} from '../../services/sociosService';
import { queryKeys } from '../../services/queryKeys';
import { Dialog } from '../../ui/dialog';
import {
  C, labelStyle, fieldInputStyle, saveButtonStyle, saveButtonDisabledStyle,
  dangerButtonStyle, dialogFooterStyle,
} from '../../ui/dialogFormTokens';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { ConfigTabHeader } from '../../ui/ConfigTabHeader';
import { ConfigSwitch } from '../../ui/ConfigSwitch';
import { CFG, CFG_MONO_CLASS, cfgBadgeStyle } from '../../ui/configTokens';
import { EmptyState } from '../../ui/EmptyState';
import { InfoBanner } from '../../ui/InfoBanner';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { useConfirm } from '../../context/ConfirmContext';

// ─── Modal ───────────────────────────────────────────────────────────────────

function SocioDialog({
  open, socio, isSaving, error, onClose, onSave, onDelete,
}: {
  open: boolean; socio?: Socio; isSaving: boolean; error?: string;
  onClose: () => void; onSave: (v: SocioFormValues) => void;
  onDelete?: () => void;
}) {
  const confirm = useConfirm();

  const handleDelete = async () => {
    if (!onDelete) return;
    const ok = await confirm({
      title: 'Desativar sócio',
      message: `Desativar "${socio?.nome}"? Ele deixará de aparecer na lista de sócios ativos.`,
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
      percentual: parseFloat(fd.get('percentual') as string),
    });
  };

  return (
    <Dialog open={open} title={socio ? 'Editar sócio' : 'Novo sócio'} onClose={onClose} size="sm" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={handleSubmit}>
        {/* Altura fixa: o modal não muda de tamanho entre criação e edição. */}
        <div style={{ flex: 1, minHeight: 0, height: 120, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 110px', gap: 10 }}>
            <div>
              <label style={labelStyle}><span>Nome do sócio</span><span style={{ color: C.danger }}>*</span></label>
              <input name="nome" defaultValue={socio?.nome} placeholder="Ex: Maria Souza" autoFocus required style={fieldInputStyle} />
            </div>
            <div>
              <label style={labelStyle}><span>Participação</span><span style={{ color: C.danger }}>*</span></label>
              <input
                name="percentual"
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                defaultValue={socio?.percentual ?? ''}
                placeholder="50"
                required
                className={CFG_MONO_CLASS}
                style={fieldInputStyle}
              />
            </div>
          </div>

          {error && (
            <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        <div style={dialogFooterStyle}>
          {/* Ação destrutiva só na edição de registro existente. */}
          {socio && onDelete && (
            <button type="button" style={dangerButtonStyle} onClick={handleDelete}>Desativar</button>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <button type="submit" disabled={isSaving} style={isSaving ? saveButtonDisabledStyle : saveButtonStyle}>
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Tela ────────────────────────────────────────────────────────────────────

export function SociosTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Socio }>({ open: false });
  const [mostrarDesativados, setMostrarDesativados] = useState(false);
  const createGuide = useFirstAccessGuide('socios:novo-v1');

  const socios = useQuery({
    queryKey: [...queryKeys.socios, mostrarDesativados],
    queryFn: () => fetchSocios(mostrarDesativados),
  });

  const todos = socios.data ?? [];
  const data = todos.filter((s) => (mostrarDesativados ? !s.ativo : s.ativo));

  // A soma de 100% considera apenas os sócios ativos — os desativados não
  // participam da divisão do negócio.
  const totalPct = todos.filter((s) => s.ativo).reduce((sum, s) => sum + Number(s.percentual), 0);

  const saveMut = useMutation({
    mutationFn: ({ v, id }: { v: SocioFormValues; id?: number }) => saveSocio(v, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.socios }); setDialog({ open: false }); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteSocio,
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.socios }); setDialog({ open: false }); },
  });

  const estado = mostrarDesativados ? 'desativado' : 'ativo';
  const contagem = `${data.length} sócio${data.length === 1 ? '' : 's'} ${estado}${data.length === 1 ? '' : 's'}`;

  return (
    <div className="grid gap-2.5">
      <ConfigTabHeader
        filters={
          <ConfigSwitch
            checked={mostrarDesativados}
            onChange={setMostrarDesativados}
            label={contagem}
          />
        }
        actionLabel="Novo sócio"
        onAction={() => setDialog({ open: true })}
      >
        {createGuide.isVisible && (
          <FirstAccessGuideCard
            icon={Plus}
            description={firstAccessGuideMessages.sociosNovo}
            align="right"
            floating
            placement="top"
            className="w-[min(24rem,calc(100vw-2rem))]"
            onDismiss={createGuide.dismiss}
            onSilenceAll={createGuide.silenceAll}
          />
        )}
      </ConfigTabHeader>

      <InfoBanner variant="warn">
        <AlertCircle size={13} style={{ flex: 'none' }} />
        <span>
          O total de participações dos sócios ativos deve somar 100%.
          {totalPct > 0 && (
            <span style={{
              marginLeft: 5, fontWeight: 700,
              color: totalPct > 100 ? '#b91c1c' : totalPct === 100 ? CFG.success : 'inherit',
            }}>
              Total atual: {totalPct.toFixed(2)}%
            </span>
          )}
        </span>
      </InfoBanner>

      {socios.isLoading && (
        <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>Carregando...</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((s, i) => (
          <ConfigListRow
            key={s.id}
            index={i}
            nome={s.nome}
            dataCriacao={s.data_criacao}
            onClick={() => setDialog({ open: true, item: s })}
            badges={<span style={cfgBadgeStyle}>{Number(s.percentual).toFixed(2)}%</span>}
          />
        ))}
        {data.length === 0 && !socios.isLoading && (
          <EmptyState title={mostrarDesativados ? 'Nenhum sócio desativado' : 'Nenhum sócio cadastrado'} />
        )}
      </div>

      <SocioDialog
        open={dialog.open}
        socio={dialog.item}
        isSaving={saveMut.isPending}
        error={saveMut.error?.message}
        onClose={() => setDialog({ open: false })}
        onSave={(v) => saveMut.mutate({ v, id: dialog.item?.id })}
        onDelete={dialog.item ? () => deleteMut.mutate(dialog.item!.id) : undefined}
      />
    </div>
  );
}
