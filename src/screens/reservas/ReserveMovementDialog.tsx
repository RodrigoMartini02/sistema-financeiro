import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import type { MovimentacaoFormValues, Reserva } from '../../types/reservas';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { formatCurrency } from '../finance/formatters';

interface ReserveMovementDialogProps {
  open: boolean;
  reservas: Reserva[];
  defaultDate: string;
  isSaving: boolean;
  error?: string;
  onClose: () => void;
  onManageReserves: () => void;
  onSubmit: (reserveId: number, values: MovimentacaoFormValues) => void;
}

export function ReserveMovementDialog({
  open,
  reservas,
  defaultDate,
  isSaving,
  error,
  onClose,
  onManageReserves,
  onSubmit,
}: ReserveMovementDialogProps) {
  const [reserveId, setReserveId] = useState('');
  const [tipo, setTipo] = useState<MovimentacaoFormValues['tipo']>('deposito');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(defaultDate);
  const [descricao, setDescricao] = useState('');

  useEffect(() => {
    if (!open) return;

    setReserveId(reservas[0] ? String(reservas[0].id) : '');
    setTipo('deposito');
    setValor('');
    setData(defaultDate);
    setDescricao('');
  }, [open, reservas, defaultDate]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedReserveId = Number(reserveId);
    const parsedAmount = Number(valor.replace(',', '.'));

    if (!Number.isInteger(parsedReserveId) || parsedAmount <= 0 || !data) return;

    onSubmit(parsedReserveId, {
      tipo,
      valor: parsedAmount,
      data,
      descricao: descricao.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} title="Movimentar reserva" description="Registre um depósito ou retirada na data escolhida." onClose={onClose}>
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Reserva
          <select
            value={reserveId}
            onChange={(event) => setReserveId(event.target.value)}
            required
            disabled={reservas.length === 0 || isSaving}
            className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          >
            {reservas.length === 0 ? (
              <option value="">Nenhuma reserva cadastrada</option>
            ) : (
              reservas.map((reserva) => (
                <option key={reserva.id} value={reserva.id}>
                  {reserva.observacoes || 'Reserva sem nome'} - {formatCurrency(Number(reserva.valor))}
                </option>
              ))
            )}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTipo('deposito')}
            className={[
              'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition',
              tipo === 'deposito'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700',
            ].join(' ')}
          >
            <ArrowDownToLine size={16} /> Adicionar
          </button>
          <button
            type="button"
            onClick={() => setTipo('retirada')}
            className={[
              'flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition',
              tipo === 'retirada'
                ? 'border-rose-500 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700',
            ].join(' ')}
          >
            <ArrowUpFromLine size={16} /> Retirar
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Valor
            <input
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={valor}
              onChange={(event) => setValor(event.target.value)}
              required
              disabled={isSaving}
              className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
            Data
            <input
              type="date"
              value={data}
              onChange={(event) => setData(event.target.value)}
              required
              disabled={isSaving}
              className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            />
          </label>
        </div>

        <label className="grid gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
          Descrição
          <input
            value={descricao}
            onChange={(event) => setDescricao(event.target.value)}
            disabled={isSaving}
            placeholder="Ex: Aporte mensal"
            className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-slate-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          />
        </label>

        {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" className="mr-auto" onClick={onManageReserves} disabled={isSaving}>Gerenciar reservas</Button>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>Cancelar</Button>
          <Button type="submit" disabled={isSaving || reservas.length === 0}>
            {isSaving ? 'Salvando...' : tipo === 'deposito' ? 'Adicionar valor' : 'Retirar valor'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
