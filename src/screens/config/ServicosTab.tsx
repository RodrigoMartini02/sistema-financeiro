import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import {
  fetchServicos, saveServico, deleteServico,
  type Servico,
} from '../../services/servicosService';
import { queryKeys } from '../../services/queryKeys';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { Field, Input } from '../../ui/form';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { formatCurrency } from '../finance/formatters';

function ServicoDialog({
  open, servico, isSaving, error, onClose, onSave, onDelete,
}: {
  open: boolean;
  servico?: Servico;
  isSaving: boolean;
  error?: string;
  onClose: () => void;
  onSave: (data: { nome: string; valor_mensal_padrao: number }) => void;
  onDelete?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { if (!open) setConfirmDelete(false); }, [open]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onSave({
      nome: (fd.get('nome') as string).trim(),
      valor_mensal_padrao: parseFloat(fd.get('valor_mensal_padrao') as string) || 0,
    });
  };

  return (
    <Dialog open={open} title={servico ? 'Editar serviço' : 'Novo serviço'} onClose={onClose}>
      <form className="grid gap-5" onSubmit={handleSubmit}>
        <Field label="Nome do serviço" required>
          <Input
            name="nome"
            defaultValue={servico?.nome}
            placeholder="Ex: Mensalidade, Suporte, CRM..."
            autoFocus
            required
          />
        </Field>
        <Field label="Valor mensal padrão" hint="Pode ser ajustado por contrato">
          <Input
            name="valor_mensal_padrao"
            type="number"
            min="0"
            step="0.01"
            defaultValue={servico?.valor_mensal_padrao ?? ''}
            placeholder="0,00"
          />
        </Field>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="flex items-center gap-2">
          {servico && onDelete && (
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

export function ServicosTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Servico }>({ open: false });

  const servicosQ = useQuery({ queryKey: queryKeys.servicos, queryFn: () => fetchServicos() });
  const data = (servicosQ.data ?? []).filter((s) => s.ativo);

  const saveMut = useMutation({
    mutationFn: ({ v, id }: { v: { nome: string; valor_mensal_padrao: number }; id?: number }) =>
      saveServico(v, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.servicos });
      setDialog({ open: false });
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteServico,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.servicos });
      setDialog({ open: false });
    },
  });

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {data.length} serviço{data.length !== 1 ? 's' : ''} no catálogo
        </p>
        <Button icon={<Plus size={16} />} onClick={() => setDialog({ open: true })}>
          Novo serviço
        </Button>
      </div>

      <div className="rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800">
        Serviços do catálogo são reutilizáveis entre contratos. O valor padrão pode ser ajustado por contrato.
      </div>

      {servicosQ.isLoading && <p className="py-4 text-center text-sm text-slate-400">Carregando...</p>}

      <div className="grid gap-2">
        {data.map((s, i) => (
          <ConfigListRow
            key={s.id}
            index={i}
            nome={`${s.nome} — ${formatCurrency(s.valor_mensal_padrao)}/mês`}
            dataCriacao={s.criado_em}
            onClick={() => setDialog({ open: true, item: s })}
          />
        ))}
        {data.length === 0 && !servicosQ.isLoading && (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
            Nenhum serviço cadastrado. Crie serviços para vincular aos contratos dos clientes.
          </p>
        )}
      </div>

      <ServicoDialog
        key={dialog.item?.id ?? 'new'}
        open={dialog.open}
        servico={dialog.item}
        isSaving={saveMut.isPending}
        error={saveMut.error?.message}
        onClose={() => setDialog({ open: false })}
        onSave={(v) => saveMut.mutate({ v, id: dialog.item?.id })}
        onDelete={dialog.item ? () => deleteMut.mutate(dialog.item!.id) : undefined}
      />
    </div>
  );
}
