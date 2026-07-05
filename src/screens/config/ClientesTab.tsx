import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import {
  fetchClientes, saveCliente, deleteCliente,
  type Cliente,
} from '../../services/clientesService';
import { queryKeys } from '../../services/queryKeys';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { Field, Input } from '../../ui/form';
import { EmptyState, ErrorState } from '../../ui/states';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { ClienteDetail } from './ClienteDetail';

// ─── Cliente Dialog ───────────────────────────────────────────────────────────

function ClienteDialog({
  open, cliente, isSaving, error, onClose, onSave, onDelete,
}: {
  open: boolean;
  cliente?: Cliente;
  isSaving: boolean;
  error?: string;
  onClose: () => void;
  onSave: (data: Omit<Cliente, 'id' | 'total_contratos' | 'contratos_ativos'>) => void;
  onDelete?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { if (!open) setConfirmDelete(false); }, [open]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onSave({
      nome: (fd.get('nome') as string).trim(),
      codigo: null,
      tipo_empresa: null,
      cnpj: (fd.get('cnpj') as string) || null,
    });
  };

  return (
    <Dialog open={open} title={cliente ? 'Editar cliente' : 'Novo cliente'} onClose={onClose}>
      <form className="grid gap-5" onSubmit={handleSubmit}>
        <Field label="Nome" required>
          <Input name="nome" defaultValue={cliente?.nome} placeholder="Ex: Empresa Ltda" autoFocus required />
        </Field>
        <Field label="CNPJ" hint="Opcional">
          <Input name="cnpj" defaultValue={cliente?.cnpj ?? ''} placeholder="00.000.000/0001-00" />
        </Field>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="flex items-center gap-2">
          {cliente && onDelete && (
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
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Clientes Tab ─────────────────────────────────────────────────────────────

export function ClientesTab() {
  const qc = useQueryClient();
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; item?: Cliente }>({ open: false });

  const { data: clientes = [], isLoading, error } = useQuery({
    queryKey: queryKeys.clientes,
    queryFn: fetchClientes,
  });

  const saveMut = useMutation({
    mutationFn: (data: { values: Omit<Cliente, 'id' | 'total_contratos' | 'contratos_ativos'>; id?: number }) =>
      saveCliente(data.values, data.id),
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({ queryKey: queryKeys.clientes });
      setDialog({ open: false });
      if (selectedCliente && selectedCliente.id === variables.id) {
        setSelectedCliente((prev) => prev ? { ...prev, ...variables.values } : prev);
      }
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteCliente,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.clientes });
      setDialog({ open: false });
      setSelectedCliente(null);
    },
  });

  if (selectedCliente) {
    return (
      <>
        <ClienteDetail
          cliente={selectedCliente}
          onBack={() => setSelectedCliente(null)}
          onEditCliente={() => setDialog({ open: true, item: selectedCliente })}
        />
        <ClienteDialog
          key={selectedCliente.id}
          open={dialog.open}
          cliente={dialog.item}
          isSaving={saveMut.isPending}
          error={saveMut.error?.message}
          onClose={() => setDialog({ open: false })}
          onSave={(values) => saveMut.mutate({ values, id: dialog.item?.id })}
          onDelete={dialog.item ? () => deleteMut.mutate(dialog.item!.id) : undefined}
        />
      </>
    );
  }

  return (
    <>
      <div className="grid gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} cadastrado{clientes.length !== 1 ? 's' : ''}
          </p>
          <Button icon={<Plus size={15} />} onClick={() => setDialog({ open: true })}>
            Novo cliente
          </Button>
        </div>

        {error && <ErrorState title="Erro ao carregar clientes" description={(error as Error).message} />}

        {isLoading ? (
          <EmptyState title="Carregando" description="Buscando clientes..." />
        ) : clientes.length === 0 ? (
          <EmptyState
            title="Nenhum cliente"
            description="Cadastre o primeiro cliente para começar a gerenciar contratos."
          />
        ) : (
          <div className="grid gap-2">
            {clientes.map((c, i) => (
              <ConfigListRow
                key={c.id}
                index={i}
                nome={c.nome}
                onClick={() => setSelectedCliente(c)}
              />
            ))}
          </div>
        )}
      </div>

    </>
  );
}
