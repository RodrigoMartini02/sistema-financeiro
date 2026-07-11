import { useState } from 'react';
import { Paperclip, Plus, RefreshCw, Ban, TrendingUp, Tag, Lock, LockOpen, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFinanceDashboard } from '../../hooks/useFinanceDashboard';
import { useAppContext } from '../../context/AppContext';
import { apiRequest, getActiveProfileId } from '../../services/apiClient';
import { queryKeys } from '../../services/queryKeys';
import type { Income, IncomeFormValues } from '../../types/finance';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { EmptyState, ErrorState } from '../../ui/states';
import { MonthSelector } from '../finance/MonthSelector';
import { IncomeDialog } from '../finance/IncomeDialog';
import { AttachmentPreviewDialog } from '../../ui/AttachmentPreviewDialog';
import { formatCurrency, formatDate } from '../finance/formatters';
import type { Attachment } from '../../types/finance';

const TIPO_COLORS: Record<string, string> = {
  salario:       'bg-green-100 text-green-700',
  freelance:     'bg-blue-100 text-blue-700',
  investimento:  'bg-purple-100 text-purple-700',
  aluguel:       'bg-amber-100 text-amber-700',
  comissao:      'bg-orange-100 text-orange-700',
  outros:        'bg-slate-100 text-slate-600',
};

function tipoBadge(tipo?: string | null) {
  if (!tipo) return null;
  const cls = TIPO_COLORS[tipo.toLowerCase()] ?? 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${cls}`}>
      {tipo}
    </span>
  );
}

export function ReceitasScreen() {
  const { month, year, setMonth, setYear } = useAppContext();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Income }>({ open: false });
  const [anexosDialog, setAnexosDialog] = useState<{ open: boolean; title: string; anexos: Attachment[] }>({ open: false, title: '', anexos: [] });
  const [busca, setBusca] = useState('');

  const qc = useQueryClient();
  const finance = useFinanceDashboard(month, year);
  const allItems = finance.dashboard.data?.incomes ?? [];

  const cancelarReceita = useMutation({
    mutationFn: (id: number) => apiRequest<void>(`/receitas/${id}/cancelar`, { method: 'PUT' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dashboard(month, year) }),
  });

  const receberReceita = useMutation({
    mutationFn: (id: number) => apiRequest<void>(`/receitas/${id}/receber`, { method: 'PUT' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dashboard(month, year) }),
  });

  const hoje = new Date().toISOString().split('T')[0]!;

  const mesStatusQuery = useQuery({
    queryKey: queryKeys.mesStatus(year, month),
    queryFn: async () => {
      const pid = getActiveProfileId();
      const q = pid ? `?perfil_id=${pid}` : '';
      const all = await apiRequest<{ ano: number; mes: number; fechado: boolean }[]>(`/meses${q}`);
      return all.find((m) => m.ano === year && m.mes === month)?.fechado ?? false;
    },
  });
  const mesFechado = mesStatusQuery.data === true;

  const fecharMut = useMutation({
    mutationFn: async () => {
      const pid = getActiveProfileId();
      const body = pid ? { perfil_id: pid } : {};
      await apiRequest<void>(`/meses/${year}/${month}/fechar`, { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.mesStatus(year, month) }),
  });

  const reabrirMut = useMutation({
    mutationFn: async () => {
      const pid = getActiveProfileId();
      const body = pid ? { perfil_id: pid } : {};
      await apiRequest<void>(`/meses/${year}/${month}/reabrir`, { method: 'POST', body: JSON.stringify(body) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.mesStatus(year, month) }),
  });

  const items = busca.trim()
    ? allItems.filter((i) =>
        i.descricao.toLowerCase().includes(busca.toLowerCase()) ||
        (i.cliente ?? '').toLowerCase().includes(busca.toLowerCase()) ||
        (i.tipoReceita ?? '').toLowerCase().includes(busca.toLowerCase())
      )
    : allItems;

  const ativas = allItems.filter((i) => i.status === 'ativa');
  const previstas = allItems.filter((i) => i.status === 'prevista');
  const atrasadas = previstas.filter((i) => i.data < hoje);
  const total = ativas.reduce((s, i) => s + i.valor, 0);
  const totalPrevisto = previstas.reduce((s, i) => s + i.valor, 0);
  const media = ativas.length > 0 ? total / ativas.length : 0;

  const handleSave = async (values: IncomeFormValues) => {
    await finance.saveIncome.mutateAsync({ values, id: dialog.item?.id });
    setDialog({ open: false });
  };

  return (
    <>
      <div className="grid gap-4">
        {/* Header + Month selector */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-bold text-slate-950 dark:text-white">Receitas</h2>
            <div className="flex gap-2">
              <Button variant="secondary" icon={<RefreshCw size={15} />} onClick={() => finance.dashboard.refetch()}>
                Atualizar
              </Button>
              <Button
                variant="secondary"
                icon={mesFechado ? <LockOpen size={15} /> : <Lock size={15} />}
                onClick={() => mesFechado ? reabrirMut.mutate() : fecharMut.mutate()}
                disabled={fecharMut.isPending || reabrirMut.isPending}
              >
                {mesFechado ? 'Reabrir mês' : 'Fechar mês'}
              </Button>
              <Button icon={<Plus size={15} />} onClick={() => setDialog({ open: true })}>
                Nova receita
              </Button>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900">
            <MonthSelector month={month} year={year} onMonthChange={setMonth} onYearChange={setYear} />
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={15} className="text-green-500" />
              <p className="text-xs font-semibold uppercase text-slate-500">Recebido</p>
            </div>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(total)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{ativas.length} lançamento{ativas.length !== 1 ? 's' : ''}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={15} className="text-blue-500" />
              <p className="text-xs font-semibold uppercase text-slate-500">Previsto</p>
            </div>
            <p className="text-2xl font-bold text-blue-700">{formatCurrency(totalPrevisto)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{previstas.length} prevista{previstas.length !== 1 ? 's' : ''}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={15} className="text-red-500" />
              <p className="text-xs font-semibold uppercase text-slate-500">Em atraso</p>
            </div>
            <p className="text-2xl font-bold text-red-600">{atrasadas.length}</p>
            <p className="text-xs text-slate-400 mt-0.5">{formatCurrency(atrasadas.reduce((s, i) => s + i.valor, 0))}</p>
          </Card>
          <Card className="p-4 hidden sm:block">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle size={15} className="text-slate-400" />
              <p className="text-xs font-semibold uppercase text-slate-500">Média recebida</p>
            </div>
            <p className="text-2xl font-bold text-slate-950">{formatCurrency(media)}</p>
          </Card>
        </div>

        {finance.dashboard.error && (
          <ErrorState title="Erro ao carregar receitas" description={finance.dashboard.error.message} />
        )}

        {/* Table */}
        <Card>
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-bold text-slate-800 shrink-0">
              Lançamentos <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">{allItems.length}</span>
            </h3>
            <input
              type="search"
              placeholder="Buscar receita..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full max-w-xs rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200"
            />
          </div>

          {finance.dashboard.isLoading ? (
            <EmptyState title="Carregando" description="Buscando receitas do mês." />
          ) : items.length === 0 ? (
            <EmptyState
              title={busca ? 'Nenhum resultado' : 'Nenhuma receita'}
              description={busca ? 'Tente outro termo de busca.' : 'Cadastre uma receita para este mês.'}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[540px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-left">
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Data</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Descrição</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Cliente / Representante</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Tipo</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 text-right">Comissão</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 text-right">Valor</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 text-center">Anexos</th>
                    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const isPrevista = item.status === 'prevista';
                    const isAtrasada = isPrevista && item.data < hoje;
                    return (
                    <tr key={item.id} className={`group hover:bg-slate-50 transition-colors${item.status === 'cancelada' ? ' opacity-50' : ''}${isPrevista ? ' border-l-2 border-blue-300 bg-blue-50/30' : ''}${isAtrasada ? ' border-l-2 border-red-300 bg-red-50/30' : ''}`}>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {formatDate(item.data)}
                        {item.status === 'cancelada' && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">Cancelada</span>
                        )}
                        {isPrevista && !isAtrasada && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">
                            <Clock size={9} /> Prevista
                          </span>
                        )}
                        {isAtrasada && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-600">
                            <AlertCircle size={9} /> Em atraso
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 truncate max-w-[180px]">{item.descricao}</p>
                        {item.observacoes && (
                          <p className="text-[11px] text-slate-400 truncate max-w-[180px]">{item.observacoes}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                        {item.representanteNome ? (
                          <span className="flex items-center gap-1">
                            <Tag size={11} className="text-blue-400 shrink-0" />
                            <span className="text-blue-700 font-medium">{item.representanteNome}</span>
                          </span>
                        ) : item.cliente ? (
                          <span className="flex items-center gap-1">
                            <Tag size={11} className="text-slate-400 shrink-0" />
                            {item.cliente}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {tipoBadge(item.tipoReceita) ?? <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {item.valorComissao && item.valorComissao > 0
                          ? <span className="font-semibold text-amber-600">{formatCurrency(item.valorComissao)}</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-green-700 whitespace-nowrap">
                        {formatCurrency(item.valor)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {(item.anexos?.length ?? 0) > 0 ? (
                          <button
                            onClick={() => setAnexosDialog({ open: true, title: item.descricao, anexos: item.anexos! })}
                            title={`${item.anexos!.length} anexo(s)`}
                            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-brand-100 hover:text-brand-700 transition"
                          >
                            <Paperclip size={10} />
                            {item.anexos!.length}
                          </button>
                        ) : (
                          <span className="text-slate-200 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {isPrevista ? (
                            <button
                              onClick={() => {
                                if (confirm(`Confirmar recebimento de "${item.descricao}"?`)) receberReceita.mutate(item.id);
                              }}
                              disabled={receberReceita.isPending}
                              title="Confirmar recebimento"
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-green-50 hover:text-green-600 disabled:opacity-30 transition"
                            >
                              <CheckCircle size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                if (item.status === 'cancelada') return;
                                if (confirm(`Cancelar "${item.descricao}"?`)) cancelarReceita.mutate(item.id);
                              }}
                              disabled={item.status === 'cancelada' || cancelarReceita.isPending}
                              title={item.status === 'cancelada' ? 'Já cancelada' : 'Cancelar'}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 transition"
                            >
                              <Ban size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td colSpan={5} className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">
                      Total ({ativas.filter(i => items.includes(i)).length} lançamento{ativas.filter(i => items.includes(i)).length !== 1 ? 's' : ''})
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-green-700 text-sm whitespace-nowrap">
                      {formatCurrency(items.filter(i => i.status !== 'cancelada').reduce((s, i) => s + i.valor, 0))}
                    </td>
                    <td />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      </div>

      <IncomeDialog
        open={dialog.open} income={dialog.item}
        month={month} year={year}
        isSaving={finance.saveIncome.isPending} error={finance.saveIncome.error?.message}
        onClose={() => setDialog({ open: false })}
        onSave={handleSave}
      />
      <AttachmentPreviewDialog
        open={anexosDialog.open}
        title={anexosDialog.title}
        anexos={anexosDialog.anexos}
        onClose={() => setAnexosDialog({ open: false, title: '', anexos: [] })}
      />
    </>
  );
}
