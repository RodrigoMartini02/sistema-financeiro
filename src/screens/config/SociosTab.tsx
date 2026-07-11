import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import {
  fetchSocios, saveSocio, deleteSocio,
  type Socio, type SocioFormValues,
} from '../../services/sociosService';
import { queryKeys } from '../../services/queryKeys';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { Field, Input } from '../../ui/form';
import { ConfigListRow } from '../../ui/ConfigListRow';

function SocioDialog({
  open, socio, isSaving, error, onClose, onSave, onDelete,
}: {
  open: boolean; socio?: Socio; isSaving: boolean; error?: string;
  onClose: () => void; onSave: (v: SocioFormValues) => void;
  onDelete?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { if (!open) setConfirmDelete(false); }, [open]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pct = parseFloat(fd.get('percentual') as string);
    onSave({ nome: fd.get('nome') as string, percentual: pct });
  };

  return (
    <Dialog open={open} title={socio ? 'Editar sócio' : 'Novo sócio'} onClose={onClose}>
      <form className="grid gap-5" onSubmit={handleSubmit}>
        <Field label="Nome do sócio">
          <Input name="nome" defaultValue={socio?.nome} placeholder="Ex: Maria Souza" autoFocus required />
        </Field>
        <Field label="Participação (%)" hint="Entre 0,01 e 100">
          <Input
            name="percentual"
            type="number"
            min="0.01"
            max="100"
            step="0.01"
            defaultValue={socio?.percentual ?? ''}
            placeholder="Ex: 50"
            required
          />
        </Field>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="flex items-center gap-2">
          {socio && onDelete && (
            !confirmDelete ? (
              <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)}>Excluir</Button>
            ) : (
              <>
                <span className="text-sm text-slate-600">Confirmar?</span>
                <Button type="button" variant="danger" onClick={() => { onDelete(); setConfirmDelete(false); }}>Sim</Button>
                <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Não</Button>
              </>
            )
          )}
          <div className="ml-auto">
            <Button type="submit" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

export function SociosTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Socio }>({ open: false });

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
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{data.length} sócio{data.length !== 1 ? 's' : ''} cadastrado{data.length !== 1 ? 's' : ''}</p>
        <Button icon={<Plus size={16} />} onClick={() => setDialog({ open: true })}>
          Novo sócio
        </Button>
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
