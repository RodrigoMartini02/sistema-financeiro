import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PiggyBank, Plus, RefreshCw, TrendingUp, Trash2, Pencil } from 'lucide-react';
import { fetchReservas, saveReserva, deleteReserva } from '../../services/reservasService';
import { queryKeys } from '../../services/queryKeys';
import type { Reserva, ReservaFormValues } from '../../types/reservas';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { ErrorState } from '../../ui/states';
import { EmptyState } from '../../ui/EmptyState';
import { C } from '../../ui/dialogFormTokens';
import { ReservaDialog } from './ReservaDialog';
import { ReservasPanel } from './ReservasPanel';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { useConfirm } from '../../context/ConfirmContext';
import { calcContribuicaoMensal } from '../../utils/reservaContribuicao';
import { getLocalTodayIso } from '../../utils/date';
import { formatCurrency } from '../finance/formatters';

/** Linha compacta, no mesmo padrão das listas de Configurações. */
function ReservaLinha({
  reserva, index, onEdit, onDelete,
}: {
  reserva: Reserva;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cor = reserva.cor ?? '#6366f1';
  const saldo = Number(reserva.valor);
  const meta = Number(reserva.objetivo_valor ?? 0);
  const temMeta = meta > 0;
  const pct = temMeta ? Math.min(100, (saldo / meta) * 100) : 0;
  const contribuicao = temMeta && reserva.data_objetivo
    ? calcContribuicaoMensal(saldo, meta, reserva.data_objetivo)
    : null;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        minHeight: 44, padding: '8px 12px', borderRadius: 12,
        border: '1px solid #e9eef3', background: '#fff',
      }}
    >
      <span style={{ flex: 'none', width: 20, fontSize: 10.5, fontWeight: 500, color: '#57687c' }}>
        {String(index + 1).padStart(2, '0')}
      </span>

      <span
        style={{
          display: 'flex', flex: 'none', height: 30, width: 30, alignItems: 'center', justifyContent: 'center',
          borderRadius: 9, background: `${cor}18`, fontSize: 15,
        }}
      >
        {reserva.icone ?? '💰'}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {reserva.observacoes || 'Reserva sem nome'}
        </p>
        {temMeta && (
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ height: 3, flex: 1, maxWidth: 140, borderRadius: 999, background: '#f1f5f9' }}>
              <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: cor }} />
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 500, color: C.textMuted }}>
              {pct.toFixed(0)}% de {formatCurrency(meta)}
              {contribuicao !== null && ` · ${formatCurrency(contribuicao)}/mês`}
            </span>
          </div>
        )}
      </div>

      <span style={{ flex: 'none', fontSize: 14, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
        {formatCurrency(saldo)}
      </span>

      <div style={{ display: 'flex', flex: 'none', gap: 2 }}>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Editar ${reserva.observacoes || 'reserva'}`}
          title="Editar"
          style={{
            display: 'flex', height: 28, width: 28, alignItems: 'center', justifyContent: 'center',
            borderRadius: 8, border: 'none', background: 'transparent', color: C.textMuted, cursor: 'pointer',
          }}
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Excluir ${reserva.observacoes || 'reserva'}`}
          title="Excluir"
          style={{
            display: 'flex', height: 28, width: 28, alignItems: 'center', justifyContent: 'center',
            borderRadius: 8, border: 'none', background: 'transparent', color: C.placeholder, cursor: 'pointer',
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

export function ReservasScreen() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Reserva }>({ open: false });
  const [painelAberto, setPainelAberto] = useState(false);
  const guide = useFirstAccessGuide('reservas:novo-v1');
  const moveGuide = useFirstAccessGuide('reservas:movimentar-v1');
  const confirm = useConfirm();

  const reservas = useQuery({ queryKey: queryKeys.reservas, queryFn: fetchReservas });

  const saveMut = useMutation({
    mutationFn: ({ values, id }: { values: ReservaFormValues; id?: number }) => saveReserva(values, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.reservas }); setDialog({ open: false }); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteReserva,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.reservas }),
  });

  const handleDeleteReserva = async (id: number) => {
    const ok = await confirm({
      title: 'Excluir reserva',
      message: 'Excluir esta reserva? O histórico de movimentações também é perdido.',
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (ok) deleteMut.mutate(id);
  };

  const data = reservas.data ?? [];
  const totalReservado = data.reduce((soma, reserva) => soma + Number(reserva.valor), 0);

  return (
    <>
      <div className="mx-auto grid max-w-7xl gap-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold text-brand-700">Gestão de reservas</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">Reservas e metas</h2>
          </div>
          <div className="relative flex flex-wrap gap-2">
            <Button variant="secondary" icon={<RefreshCw size={17} />} onClick={() => reservas.refetch()}>
              Atualizar
            </Button>
            {/* Depositar e retirar acontecem no painel, que também traz o
                histórico — não há um segundo formulário para isso. */}
            <Button variant="secondary" icon={<TrendingUp size={17} />} onClick={() => setPainelAberto(true)}>
              Movimentar
            </Button>
            <Button icon={<Plus size={17} />} onClick={() => setDialog({ open: true })}>
              Nova reserva
            </Button>
            {guide.isVisible && !reservas.isLoading && data.length === 0 && (
              <FirstAccessGuideCard
                floating
                placement="top"
                align="right"
                className="w-[min(25rem,calc(100vw-2rem))]"
                icon={PiggyBank}
                description={firstAccessGuideMessages.reservasNova}
                onDismiss={guide.dismiss}
                onSilenceAll={guide.silenceAll}
              />
            )}
            {moveGuide.isVisible && data.length > 0 && (
              <FirstAccessGuideCard
                floating
                placement="top"
                align="right"
                className="w-[min(22rem,calc(100vw-2rem))]"
                icon={TrendingUp}
                description={firstAccessGuideMessages.reservasMovimentar}
                onDismiss={moveGuide.dismiss}
                onSilenceAll={moveGuide.silenceAll}
              />
            )}
          </div>
        </div>

        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Total reservado</p>
          <p className="mt-1 text-3xl font-bold text-slate-950">{formatCurrency(totalReservado)}</p>
          <p className="mt-0.5 text-sm text-slate-500">
            {data.length} reserva{data.length !== 1 ? 's' : ''} · separado do saldo disponível
          </p>
        </Card>

        {reservas.error && (
          <ErrorState title="Erro ao carregar reservas" description={String(reservas.error)} />
        )}

        {reservas.isLoading ? (
          <p className="py-4 text-center text-sm text-slate-500">Carregando reservas...</p>
        ) : data.length === 0 ? (
          <EmptyState
            icon={PiggyBank}
            title="Nenhuma reserva cadastrada"
            description="Crie uma reserva para acompanhar objetivos, emergências ou valores separados."
            action={
              <Button icon={<Plus size={15} />} onClick={() => setDialog({ open: true })}>
                Criar reserva
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            {data.map((reserva, index) => (
              <ReservaLinha
                key={reserva.id}
                reserva={reserva}
                index={index}
                onEdit={() => setDialog({ open: true, item: reserva })}
                onDelete={() => handleDeleteReserva(reserva.id)}
              />
            ))}
          </div>
        )}
      </div>

      <ReservaDialog
        open={dialog.open}
        reserva={dialog.item}
        isSaving={saveMut.isPending}
        error={saveMut.error?.message}
        onClose={() => setDialog({ open: false })}
        onSave={(values) => saveMut.mutate({ values, id: dialog.item?.id })}
      />

      <ReservasPanel
        open={painelAberto}
        defaultDate={getLocalTodayIso()}
        onClose={() => setPainelAberto(false)}
      />
    </>
  );
}
