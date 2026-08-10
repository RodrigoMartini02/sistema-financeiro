import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFinanceDashboard } from '../../../hooks/useFinanceDashboard';
import { fetchAppointments, saveAppointment } from '../../../services/appointmentsService';
import { queryKeys } from '../../../services/queryKeys';
import { ErrorState, LoadingState } from '../../../ui/states';
import { ExpenseDialog } from '../ExpenseDialog';
import { IncomeDialog } from '../IncomeDialog';
import { AppointmentDialog } from '../AppointmentDialog';
import { AgendaView } from './AgendaView';
import { CalendarLegend } from './CalendarLegend';
import type { CalendarSubView } from './CalendarSubViewToggle';
import { DayView } from './DayView';
import { MonthGrid } from './MonthGrid';
import { WeekGrid } from './WeekGrid';
import type { CalendarItemKind } from './calendarStatus';
import { getExpenseStatus, getIncomeStatus } from './calendarStatus';
import type { CalendarItem } from './types';

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfWeek(d: Date): Date {
  const result = new Date(d);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function formatWeekLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  return `${fmt(weekStart)} – ${fmt(weekEnd)}`;
}

function formatDayHeaderLabel(d: Date): string {
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

interface Props {
  month: number; // 0-11
  year: number;
  subView: CalendarSubView;
}

interface DialogState {
  kind: CalendarItemKind;
  presetDate: string;
  id?: number;
}

export function CalendarView({ month, year, subView }: Props) {
  const qc = useQueryClient();
  const finance = useFinanceDashboard(month, year);
  const appointmentsQuery = useQuery({
    queryKey: queryKeys.appointments(month, year),
    queryFn: () => fetchAppointments(month, year),
  });

  const [dialog, setDialog] = useState<DialogState | null>(null);

  // Data de referência para as sub-visões Semana/Dia/Agenda — acompanha o mês/ano
  // selecionado no cabeçalho, mas navega de forma independente dentro dele.
  const [refDate, setRefDate] = useState(() => {
    const today = new Date();
    return today.getFullYear() === year && today.getMonth() === month ? today : new Date(year, month, 1);
  });

  useEffect(() => {
    setRefDate((prev) => {
      if (prev.getFullYear() === year && prev.getMonth() === month) return prev;
      const today = new Date();
      return today.getFullYear() === year && today.getMonth() === month ? today : new Date(year, month, 1);
    });
  }, [month, year]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    const push = (date: string, item: CalendarItem) => {
      const list = map.get(date) ?? [];
      list.push(item);
      map.set(date, list);
    };

    for (const expense of finance.dashboard.data?.expenses ?? []) {
      push(expense.dataVencimento, {
        kind: 'despesa', id: expense.id, title: expense.descricao,
        date: expense.dataVencimento, value: expense.valorFinal,
        status: getExpenseStatus(expense),
      });
    }
    for (const income of finance.dashboard.data?.incomes ?? []) {
      if (income.status === 'cancelada') continue;
      push(income.data, {
        kind: 'receita', id: income.id, title: income.descricao,
        date: income.data, value: income.valor,
        status: getIncomeStatus(income),
      });
    }
    for (const appointment of appointmentsQuery.data ?? []) {
      push(appointment.data, {
        kind: 'compromisso', id: appointment.id, title: appointment.titulo,
        date: appointment.data, time: appointment.hora, status: null,
      });
    }
    return map;
  }, [finance.dashboard.data, appointmentsQuery.data]);

  const isLoading = finance.dashboard.isLoading || appointmentsQuery.isLoading;
  const isError = finance.dashboard.isError || appointmentsQuery.isError;

  if (isLoading) return <LoadingState title="Carregando calendário..." />;
  if (isError) return <ErrorState title="Não foi possível carregar o calendário" />;

  const handleCreateClick = (date: string, kind: CalendarItemKind) => {
    setDialog({ kind, presetDate: date });
  };

  const handleItemClick = (item: CalendarItem) => {
    setDialog({ kind: item.kind, presetDate: item.date, id: item.id });
  };

  const editingExpense = dialog?.kind === 'despesa' && dialog.id
    ? finance.dashboard.data?.expenses.find((e) => e.id === dialog.id)
    : undefined;
  const editingIncome = dialog?.kind === 'receita' && dialog.id
    ? finance.dashboard.data?.incomes.find((i) => i.id === dialog.id)
    : undefined;
  const editingAppointment = dialog?.kind === 'compromisso' && dialog.id
    ? appointmentsQuery.data?.find((a) => a.id === dialog.id)
    : undefined;

  const weekStart = startOfWeek(refDate);
  const refIso = toIso(refDate);

  const goPrev = () => {
    const next = new Date(refDate);
    if (subView === 'semana') next.setDate(next.getDate() - 7);
    else next.setDate(next.getDate() - 1);
    setRefDate(next);
  };
  const goNext = () => {
    const next = new Date(refDate);
    if (subView === 'semana') next.setDate(next.getDate() + 7);
    else next.setDate(next.getDate() + 1);
    setRefDate(next);
  };
  const goToday = () => setRefDate(new Date());

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="shrink-0">
        <CalendarLegend />
      </div>

      {(subView === 'semana' || subView === 'dia') && (
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-900">
            <button type="button" onClick={goPrev} className="flex h-8 w-8 items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
              <ChevronLeft size={15} />
            </button>
            <span className="min-w-[168px] px-1 text-center text-[13px] font-semibold capitalize text-slate-900 dark:text-white">
              {subView === 'semana' ? formatWeekLabel(weekStart) : formatDayHeaderLabel(refDate)}
            </span>
            <button type="button" onClick={goNext} className="flex h-8 w-8 items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
              <ChevronRight size={15} />
            </button>
          </div>
          <button type="button" onClick={goToday} className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
            Hoje
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {subView === 'mes' && (
          <MonthGrid
            month={month}
            year={year}
            itemsByDay={itemsByDay}
            onCreateClick={handleCreateClick}
            onItemClick={handleItemClick}
          />
        )}

        {subView === 'semana' && (
          <WeekGrid
            weekStart={weekStart}
            itemsByDay={itemsByDay}
            onCreateClick={handleCreateClick}
            onItemClick={handleItemClick}
          />
        )}

        {subView === 'dia' && (
          <DayView
            date={refIso}
            items={itemsByDay.get(refIso) ?? []}
            onCreateClick={handleCreateClick}
            onItemClick={handleItemClick}
          />
        )}

        {subView === 'agenda' && (
          <AgendaView itemsByDay={itemsByDay} onItemClick={handleItemClick} />
        )}
      </div>

      <ExpenseDialog
        open={dialog?.kind === 'despesa'}
        month={month}
        year={year}
        expense={editingExpense}
        presetDate={dialog?.presetDate}
        isSaving={finance.saveExpense.isPending}
        error={finance.saveExpense.error?.message}
        onClose={() => setDialog(null)}
        onSave={async (items) => {
          for (const item of items) await finance.saveExpense.mutateAsync({ values: item, id: dialog?.id });
          setDialog(null);
        }}
      />

      <IncomeDialog
        open={dialog?.kind === 'receita'}
        month={month}
        year={year}
        income={editingIncome}
        presetDate={dialog?.presetDate}
        isSaving={finance.saveIncome.isPending}
        error={finance.saveIncome.error?.message}
        onClose={() => setDialog(null)}
        onSave={async (values) => {
          await finance.saveIncome.mutateAsync({ values, id: dialog?.id });
          setDialog(null);
        }}
      />

      <AppointmentDialog
        open={dialog?.kind === 'compromisso'}
        appointment={editingAppointment}
        presetDate={dialog?.presetDate}
        isSaving={false}
        onClose={() => setDialog(null)}
        onSave={async (values) => {
          await saveAppointment(values, dialog?.id);
          void qc.invalidateQueries({ queryKey: queryKeys.appointments(month, year) });
          setDialog(null);
        }}
      />
    </div>
  );
}
