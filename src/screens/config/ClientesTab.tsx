import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import {
  fetchClientes, saveCliente, deleteCliente,
  type Cliente,
} from '../../services/clientesService';
import { queryKeys } from '../../services/queryKeys';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, dialogFooterStyle, saveButtonStyle, saveButtonDisabledStyle, dangerButtonStyle } from '../../ui/dialogFormTokens';
import { EmptyState, ErrorState } from '../../ui/states';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { ConfigTabHeader } from '../../ui/ConfigTabHeader';
import { CFG, CFG_MONO_CLASS, cfgBadgeStyle } from '../../ui/configTokens';
import { formatCNPJ } from '../../utils/document';
import { ClienteDetail } from './ClienteDetail';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { useConfirm } from '../../context/ConfirmContext';

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
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={handleSubmit}>
        {/* Altura fixa: o modal não muda de tamanho entre criação e edição. */}
        <div style={{ flex: 1, minHeight: 0, height: 120, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 170px', gap: 10 }}>
            <div>
              <label style={labelStyle}><span>Nome</span><span style={{ color: C.danger }}>*</span></label>
              <input name="nome" defaultValue={cliente?.nome} placeholder="Ex: Empresa Ltda" autoFocus required style={fieldInputStyle} />
            </div>
            <div>
              <label style={labelStyle}>CNPJ</label>
              <input
                value={cnpj}
                onChange={(e) => setCnpj(formatCNPJ(e.target.value))}
                placeholder="00.000.000/0001-00"
                inputMode="numeric"
                maxLength={18}
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
      <div className="grid gap-2.5">
        <ConfigTabHeader
          countLabel={`${clientes.length} cliente${clientes.length === 1 ? '' : 's'} cadastrado${clientes.length === 1 ? '' : 's'}`}
          actionLabel="Novo cliente"
          onAction={() => setDialog({ open: true })}
        >
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
        </ConfigTabHeader>

        {error && <ErrorState title="Erro ao carregar clientes" description={(error as Error).message} />}

        {isLoading ? (
          <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>Carregando...</p>
        ) : clientes.length === 0 ? (
          <EmptyState
            title="Nenhum cliente"
            description="Cadastre o primeiro cliente para começar a gerenciar contratos."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {clientes.map((c, i) => (
              <ConfigListRow
                key={c.id}
                index={i}
                nome={c.nome}
                onClick={() => setSelectedCliente(c)}
                badges={c.contratos_ativos
                  ? <span style={cfgBadgeStyle}>{c.contratos_ativos} contrato{c.contratos_ativos === 1 ? '' : 's'}</span>
                  : undefined}
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
