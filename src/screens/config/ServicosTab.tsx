import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus } from 'lucide-react';
import {
  fetchServicos, saveServico, deleteServico,
  type Servico,
} from '../../services/servicosService';
import { queryKeys } from '../../services/queryKeys';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, cardStyle } from '../../ui/dialogFormTokens';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { EmptyState } from '../../ui/EmptyState';
import { InfoBanner } from '../../ui/InfoBanner';
import { formatCurrency } from '../finance/formatters';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { useConfirm } from '../../context/ConfirmContext';

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
  const confirm = useConfirm();

  const handleDelete = async () => {
    if (!onDelete) return;
    const ok = await confirm({
      title: 'Excluir serviço',
      message: `Excluir "${servico?.nome}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
    });
    if (ok) onDelete();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onSave({
      nome: (fd.get('nome') as string).trim(),
      valor_mensal_padrao: parseFloat(fd.get('valor_mensal_padrao') as string) || 0,
    });
  };

  return (
    <Dialog open={open} title={servico ? 'Editar serviço' : 'Novo serviço'} onClose={onClose} scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 -26px' }} onSubmit={handleSubmit}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}><span>NOME DO SERVIÇO</span><span style={{ color: C.primary }}>*</span></label>
              <input
                name="nome"
                defaultValue={servico?.nome}
                placeholder="Ex: Mensalidade, Suporte, CRM..."
                autoFocus
                required
                style={fieldInputStyle}
              />
            </div>
          </div>
          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}>VALOR MENSAL PADRÃO</label>
              <input
                name="valor_mensal_padrao"
                type="number"
                min="0"
                step="0.01"
                defaultValue={servico?.valor_mensal_padrao ?? ''}
                placeholder="0,00"
                style={fieldInputStyle}
              />
              <span style={{ fontSize: 12, color: C.textFaint }}>Pode ser ajustado por contrato</span>
            </div>
          </div>

          {error && (
            <div style={{ margin: '0 26px 14px', borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '10px 14px', fontSize: 13, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ flex: 'none', borderTop: '1px solid #eef3f6', background: '#fafcfd', padding: '14px 26px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          {servico && onDelete && (
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

export function ServicosTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Servico }>({ open: false });
  const createGuide = useFirstAccessGuide('servicos:novo-v1');

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
    <div className="grid gap-3">
      <div className="relative flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {data.length} serviço{data.length !== 1 ? 's' : ''} no catálogo
        </p>
        <Button size="sm" icon={<Plus size={15} />} onClick={() => setDialog({ open: true })}>
          Novo serviço
        </Button>
        {createGuide.isVisible && (
          <FirstAccessGuideCard
            icon={Layers}
            description={firstAccessGuideMessages.servicosNovo}
            align="right"
            floating
            placement="top"
            className="w-[min(24rem,calc(100vw-2rem))]"
            onDismiss={createGuide.dismiss}
            onSilenceAll={createGuide.silenceAll}
          />
        )}
      </div>

      <InfoBanner>
        Serviços do catálogo são reutilizáveis entre contratos. O valor padrão pode ser ajustado por contrato.
      </InfoBanner>

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
          <EmptyState
            icon={Layers}
            title="Nenhum serviço cadastrado"
            description="Crie serviços para vincular aos contratos dos clientes."
          />
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
