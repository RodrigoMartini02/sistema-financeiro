import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import {
  fetchSocios, saveSocio, deleteSocio,
  type Socio, type SocioFormValues,
} from '../../services/sociosService';
import { queryKeys } from '../../services/queryKeys';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, cardStyle } from '../../ui/dialogFormTokens';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { useConfirm } from '../../context/ConfirmContext';
import { Z_GUIDE } from '../../ui/zIndex';

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
      title: 'Excluir sócio',
      message: `Excluir "${socio?.nome}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
    });
    if (ok) onDelete();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pct = parseFloat(fd.get('percentual') as string);
    onSave({ nome: fd.get('nome') as string, percentual: pct });
  };

  return (
    <Dialog open={open} title={socio ? 'Editar sócio' : 'Novo sócio'} onClose={onClose} scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 -26px' }} onSubmit={handleSubmit}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}><span>NOME DO SÓCIO</span><span style={{ color: C.primary }}>*</span></label>
              <input name="nome" defaultValue={socio?.nome} placeholder="Ex: Maria Souza" autoFocus required style={fieldInputStyle} />
            </div>
          </div>
          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}><span>PARTICIPAÇÃO (%)</span><span style={{ color: C.primary }}>*</span></label>
              <input
                name="percentual"
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                defaultValue={socio?.percentual ?? ''}
                placeholder="Ex: 50"
                required
                style={fieldInputStyle}
              />
              <span style={{ fontSize: 12, color: C.textFaint }}>Entre 0,01 e 100</span>
            </div>
          </div>

          {error && (
            <div style={{ margin: '0 26px 14px', borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '10px 14px', fontSize: 13, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ flex: 'none', borderTop: '1px solid #eef3f6', background: '#fafcfd', padding: '14px 26px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          {socio && onDelete && (
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

export function SociosTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Socio }>({ open: false });
  const createGuide = useFirstAccessGuide('socios:novo-v1');

  const socios = useQuery({ queryKey: queryKeys.socios, queryFn: fetchSocios });
  const data = socios.data ?? [];

  const totalPct = data.reduce((s, sc) => s + Number(sc.percentual), 0);

  const saveMut = useMutation({
    mutationFn: ({ v, id }: { v: SocioFormValues; id?: number }) => saveSocio(v, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.socios }); setDialog({ open: false }); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteSocio,
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.socios }); setDialog({ open: false }); },
  });

  return (
    <div className="grid gap-4">
      <div className="relative flex items-center justify-between">
        <p className="text-sm text-slate-500">{data.length} sócio{data.length !== 1 ? 's' : ''} cadastrado{data.length !== 1 ? 's' : ''}</p>
        <Button icon={<Plus size={16} />} onClick={() => setDialog({ open: true })}>
          Novo sócio
        </Button>
        {createGuide.isVisible && (
          <FirstAccessGuideCard
            icon={Plus}
            description={firstAccessGuideMessages.sociosNovo}
            align="right"
            floating
            placement="top"
            className={`absolute right-0 top-full ${Z_GUIDE} mt-3 w-[min(24rem,calc(100vw-2rem))]`}
            onDismiss={createGuide.dismiss}
          />
        )}
      </div>

      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Sócios representam participações no negócio. O total de participações deve somar 100%.
        {totalPct > 0 && (
          <span className={['ml-2 font-bold', totalPct > 100 ? 'text-red-700' : totalPct === 100 ? 'text-green-700' : 'text-amber-700'].join(' ')}>
            Total atual: {totalPct.toFixed(2)}%
          </span>
        )}
      </div>

      {socios.isLoading && <p className="py-4 text-center text-sm text-slate-400">Carregando...</p>}

      <div className="grid gap-2">
        {data.map((s, i) => (
          <ConfigListRow
            key={s.id}
            index={i}
            nome={s.nome}
            dataCriacao={s.data_criacao}
            dataAtualizacao={s.data_atualizacao}
            onClick={() => setDialog({ open: true, item: s })}
          />
        ))}
        {data.length === 0 && !socios.isLoading && (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">Nenhum sócio cadastrado</p>
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
