import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import {
  fetchServicos, saveServico, deleteServico,
  type Servico,
} from '../../services/servicosService';
import { queryKeys } from '../../services/queryKeys';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, dialogFooterStyle, saveButtonStyle, saveButtonDisabledStyle, dangerButtonStyle } from '../../ui/dialogFormTokens';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { ConfigTabHeader } from '../../ui/ConfigTabHeader';
import { ConfigSwitch } from '../../ui/ConfigSwitch';
import { CFG, CFG_MONO_CLASS } from '../../ui/configTokens';
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
      title: 'Desativar serviço',
      message: `Desativar "${servico?.nome}"? Ele deixará de aparecer na lista de serviços ativos.`,
      confirmLabel: 'Desativar',
      variant: 'danger',
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
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={handleSubmit}>
        {/* Altura fixa: o modal não muda de tamanho entre criação e edição. */}
        <div style={{ flex: 1, minHeight: 0, height: 120, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px', gap: 10 }}>
            <div>
              <label style={labelStyle}><span>Nome do serviço</span><span style={{ color: C.danger }}>*</span></label>
              <input
                name="nome"
                defaultValue={servico?.nome}
                placeholder="Ex: Mensalidade, Suporte, CRM..."
                autoFocus
                required
                style={fieldInputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Valor mensal</label>
              <input
                name="valor_mensal_padrao"
                type="number"
                min="0"
                step="0.01"
                defaultValue={servico?.valor_mensal_padrao ?? ''}
                placeholder="0,00"
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
          {servico && onDelete && (
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

export function ServicosTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Servico }>({ open: false });
  const [mostrarDesativados, setMostrarDesativados] = useState(false);
  const createGuide = useFirstAccessGuide('servicos:novo-v1');

  // O backend devolve ativos e inativos por padrão; o filtro é aplicado aqui.
  const servicosQ = useQuery({ queryKey: queryKeys.servicos, queryFn: () => fetchServicos() });
  const data = (servicosQ.data ?? []).filter((s) => (mostrarDesativados ? !s.ativo : s.ativo));

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
    <div className="grid gap-2.5">
      <ConfigTabHeader
        filters={
          <ConfigSwitch
            checked={mostrarDesativados}
            onChange={setMostrarDesativados}
            label={`${data.length} serviço${data.length === 1 ? '' : 's'} ${mostrarDesativados ? 'desativado' : 'ativo'}${data.length === 1 ? '' : 's'}`}
          />
        }
        actionLabel="Novo serviço"
        onAction={() => setDialog({ open: true })}
      >
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
      </ConfigTabHeader>

      <InfoBanner>
        Serviços do catálogo são reutilizáveis entre contratos. O valor padrão pode ser ajustado por contrato.
      </InfoBanner>

      {servicosQ.isLoading && (
        <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>Carregando...</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
