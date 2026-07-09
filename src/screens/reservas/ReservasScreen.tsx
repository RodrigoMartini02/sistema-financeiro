import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, TrendingUp, Trash2, Pencil } from 'lucide-react';
import { fetchReservas, saveReserva, deleteReserva, movimentar } from '../../services/reservasService';
import { queryKeys } from '../../services/queryKeys';
import type { Reserva, ReservaFormValues, MovimentacaoFormValues } from '../../types/reservas';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { ErrorState, EmptyState } from '../../ui/states';
import { ReservaDialog } from './ReservaDialog';

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function calcContribuicao(valorAtual: number, meta: number, prazo: string): number | null {
  const hoje = new Date();
  const dataPrazo = new Date(prazo);
  const meses =
    (dataPrazo.getFullYear() - hoje.getFullYear()) * 12 +
    (dataPrazo.getMonth() - hoje.getMonth());
  if (meses <= 0) return null;
  const restante = meta - valorAtual;
  if (restante <= 0) return null;
  return Math.ceil(restante / meses);
}

function ProgressBar({ valor, objetivo, color }: { valor: number; objetivo: number; color: string }) {
  const pct = objetivo > 0 ? Math.min(100, (valor / objetivo) * 100) : 0;
  return (
    <div className="mt-2">
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>{pct.toFixed(0)}% de {fmt(objetivo)}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          className="h-1.5 rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function ReservaCard({
  r,
  onEdit,
  onMovimentar,
  onDelete,
}: {
  r: Reserva;
  onEdit: () => void;
  onMovimentar: () => void;
  onDelete: () => void;
}) {
  const cor = r.cor ?? '#6366f1';
  const icone = r.icone ?? '💰';
  const temMeta = !!r.objetivo_valor && Number(r.objetivo_valor) > 0;
  const contribuicao =
    temMeta && r.data_objetivo
      ? calcContribuicao(Number(r.valor), Number(r.objetivo_valor), r.data_objetivo)
      : null;

  return (
    <Card
      className="flex flex-row items-center gap-6 border-l-4 p-5"
      style={{ borderLeftColor: cor }}
    >
      {/* Zona esquerda */}
      <div className="flex flex-[2] items-center gap-3 min-w-0">
        <span className="text-2xl leading-none shrink-0">{icone}</span>
        <div className="min-w-0">
          <p className="font-semibold text-slate-950 dark:text-white leading-snug truncate">
            {r.observacoes || <span className="text-slate-400 italic text-sm">Sem nome</span>}
          </p>
          {r.data_objetivo && (
            <p className="text-xs text-slate-400 mt-0.5">
              Prazo: {new Date(r.data_objetivo).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
            </p>
          )}
          <span
            className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ background: `${cor}20`, color: cor }}
          >
            {temMeta ? 'Meta' : 'Reserva'}
          </span>
        </div>
      </div>

      {/* Zona central */}
      <div className="flex-[3] min-w-0">
        <p className="text-2xl font-bold text-slate-950 dark:text-white">{fmt(Number(r.valor))}</p>
        {temMeta && r.objetivo_valor && (
          <ProgressBar valor={Number(r.valor)} objetivo={Number(r.objetivo_valor)} color={cor} />
        )}
        {contribuicao !== null && (
          <p className="mt-1 text-xs text-slate-500">
            ~{fmt(contribuicao)}/mês necessários
          </p>
        )}
      </div>

      {/* Zona direita */}
      <div className="flex-none ml-auto flex items-center gap-2">
        <Button
          variant="secondary"
          className="text-xs py-1.5"
          icon={<TrendingUp size={14} />}
          onClick={onMovimentar}
        >
          Movimentar
        </Button>
        <Button
          variant="ghost"
          className="px-2"
          onClick={onEdit}
          aria-label="Editar"
        >
          <Pencil size={15} />
        </Button>
        <Button
          variant="ghost"
          className="px-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
          onClick={onDelete}
          aria-label="Excluir"
        >
          <Trash2 size={15} />
        </Button>
      </div>
    </Card>
  );
}

export function ReservasScreen() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{
    open: boolean;
    item?: Reserva;
    startTab?: 'config' | 'movimentar';
  }>({ open: false });

  const reservas = useQuery({ queryKey: queryKeys.reservas, queryFn: fetchReservas });

  const saveMut = useMutation({
    mutationFn: ({ values, id }: { values: ReservaFormValues; id?: number }) => saveReserva(values, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.reservas }); setDialog({ open: false }); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteReserva,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.reservas }),
  });

  const movMut = useMutation({
    mutationFn: ({ id, values }: { id: number; values: MovimentacaoFormValues }) => movimentar(id, values),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.reservas }); setDialog({ open: false }); },
  });

  const data = reservas.data ?? [];
  const totalReservado = data.reduce((s, r) => s + Number(r.valor), 0);

  return (
    <>
      <div className="mx-auto grid max-w-7xl gap-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="text-sm font-semibold text-brand-700">Gestão de reservas</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">Reservas e metas</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<RefreshCw size={17} />} onClick={() => reservas.refetch()}>
              Atualizar
            </Button>
            <Button icon={<Plus size={17} />} onClick={() => setDialog({ open: true })}>
              Nova reserva
            </Button>
          </div>
        </div>

        <Card className="p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Total reservado</p>
          <p className="mt-1 text-3xl font-bold text-slate-950">{fmt(totalReservado)}</p>
          <p className="mt-0.5 text-sm text-slate-500">
            {data.length} reserva{data.length !== 1 ? 's' : ''}
          </p>
        </Card>

        {reservas.error && (
          <ErrorState title="Erro ao carregar reservas" description={String(reservas.error)} />
        )}

        {reservas.isLoading ? (
          <EmptyState title="Carregando reservas" description="Buscando suas reservas e metas." />
        ) : data.length === 0 ? (
          <EmptyState
            title="Nenhuma reserva cadastrada"
            description="Crie sua primeira reserva para guardar dinheiro com um objetivo."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {data.map((r) => (
              <ReservaCard
                key={r.id}
                r={r}
                onEdit={() => setDialog({ open: true, item: r })}
                onMovimentar={() => setDialog({ open: true, item: r, startTab: 'movimentar' })}
                onDelete={() => {
                  if (confirm('Excluir esta reserva?')) deleteMut.mutate(r.id);
                }}
              />
            ))}
          </div>
        )}
      </div>

      <ReservaDialog
        open={dialog.open}
        reserva={dialog.item}
        isSaving={saveMut.isPending}
        isMovimentando={movMut.isPending}
        error={saveMut.error?.message}
        startTab={dialog.startTab}
        onClose={() => setDialog({ open: false })}
        onSave={(values) => saveMut.mutate({ values, id: dialog.item?.id })}
        onMovimentar={(values) => dialog.item && movMut.mutate({ id: dialog.item.id, values })}
      />
    </>
  );
}
