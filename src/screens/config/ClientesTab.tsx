import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import {
  fetchClientes, saveCliente, deleteCliente,
  type Cliente,
} from '../../services/clientesService';
import { queryKeys } from '../../services/queryKeys';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, cardStyle, saveButtonStyle, saveButtonDisabledStyle, dangerButtonStyle } from '../../ui/dialogFormTokens';
import { EmptyState, ErrorState } from '../../ui/states';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { ClienteDetail } from './ClienteDetail';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { useConfirm } from '../../context/ConfirmContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCNPJ(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

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
  const [cnpj, setCnpj] = useState(cliente?.cnpj ?? '');
  const confirm = useConfirm();

  useEffect(() => { setCnpj(cliente?.cnpj ?? ''); }, [cliente?.id, open]);

  const handleDelete = async () => {
    if (!onDelete) return;
    const ok = await confirm({
      title: 'Excluir cliente',
      message: `Excluir "${cliente?.nome}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
    });
    if (ok) onDelete();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onSave({
      nome: (fd.get('nome') as string).trim(),
      cnpj: cnpj || null,
    });
  };

  return (
    <Dialog open={open} title={cliente ? 'Editar cliente' : 'Novo cliente'} onClose={onClose} scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 -26px' }} onSubmit={handleSubmit}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}><span>NOME</span><span style={{ color: C.primary }}>*</span></label>
              <input name="nome" defaultValue={cliente?.nome} placeholder="Ex: Empresa Ltda" autoFocus required style={fieldInputStyle} />
            </div>
          </div>
          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 15 }}>
                <label style={{ ...labelStyle, height: 'auto' }}>CNPJ</label>
                <span style={{ fontSize: 11, color: C.placeholder }}>opcional</span>
              </div>
              <input
                value={cnpj}
                onChange={(e) => setCnpj(formatCNPJ(e.target.value))}
                placeholder="00.000.000/0001-00"
                inputMode="numeric"
                style={fieldInputStyle}
              />
            </div>
          </div>

          {error && (
            <div style={{ margin: '0 26px 14px', borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '10px 14px', fontSize: 13, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ flex: 'none', borderTop: '1px solid #eef3f6', background: '#fafcfd', padding: '14px 26px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          {cliente && onDelete && (
            <button type="button" style={dangerButtonStyle} onClick={handleDelete}>Excluir</button>
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

// ─── Clientes Tab ─────────────────────────────────────────────────────────────

export function ClientesTab() {
  const qc = useQueryClient();
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [dialog, setDialog] = useState<{ open: boolean; item?: Cliente }>({ open: false });
  const createGuide = useFirstAccessGuide('clientes:novo-v1');

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
        <div className="relative flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {clientes.length} cliente{clientes.length !== 1 ? 's' : ''} cadastrado{clientes.length !== 1 ? 's' : ''}
          </p>
          <Button icon={<Plus size={15} />} onClick={() => setDialog({ open: true })}>
            Novo cliente
          </Button>
          {createGuide.isVisible && (
            <FirstAccessGuideCard
              icon={Building2}
              description={firstAccessGuideMessages.clientesNovo}
              align="right"
              floating
              placement="top"
              className="w-[min(25rem,calc(100vw-2rem))]"
              onDismiss={createGuide.dismiss}
              onSilenceAll={createGuide.silenceAll}
            />
          )}
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

      <ClienteDialog
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
