import { useState, type ReactNode } from 'react';
import { Paperclip, Plus, Ban, Tag, Clock, CheckCircle, AlertCircle, FileCheck, Building2, Search, Pencil, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFinanceDashboard } from '../../hooks/useFinanceDashboard';
import { apiRequest } from '../../services/apiClient';
import { queryKeys, invalidateFinanceQueries } from '../../services/queryKeys';
import type { Income, IncomeFormValues } from '../../types/finance';
import { getContratosFaturamento, faturarContrato, type ContratoFaturamento } from '../../services/financeService';
import { Button } from '../../ui/button';
import { Card } from '../../ui/card';
import { EmptyState, ErrorState } from '../../ui/states';
import { IncomeDialog } from '../finance/IncomeDialog';
import { AttachmentPreviewDialog } from '../../ui/AttachmentPreviewDialog';
import { formatCurrency, formatDate } from '../finance/formatters';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { useConfirm } from '../../context/ConfirmContext';
import type { Attachment } from '../../types/finance';
import { getLocalTodayIso } from '../../utils/date';
import { IncomeCard, tipoBadge } from './IncomeCard';

const MONTH_NAMES_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function statusFaturamentoBadge(item: ContratoFaturamento, mes: number, ano: number) {
  const hoje = new Date();
  const mesAtual = hoje.getMonth() + 1;
  const anoAtual = hoje.getFullYear();
  const isPast = ano < anoAtual || (ano === anoAtual && mes < mesAtual);

  if (item.receitaStatus === 'ativa') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700"><CheckCircle size={10} /> Recebido</span>;
  }
  if (item.receitaStatus === 'faturada') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700"><FileCheck size={10} /> Faturado</span>;
  }
  if (isPast) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-600"><AlertCircle size={10} /> Em atraso</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700"><Clock size={10} /> Pendente</span>;
}

interface ReceitasScreenProps {
  month: number;
  year: number;
  toolbarStart?: ReactNode;
}

export function ReceitasScreen({ month, year, toolbarStart }: ReceitasScreenProps) {
  const [dialog, setDialog] = useState<{ open: boolean; item?: Income }>({ open: false });
  const [anexosDialog, setAnexosDialog] = useState<{ open: boolean; title: string; anexos: Attachment[] }>({ open: false, title: '', anexos: [] });
  const [busca, setBusca] = useState('');

  const qc = useQueryClient();
  const confirm = useConfirm();
  const finance = useFinanceDashboard(month, year);
  const allItems = finance.dashboard.data?.incomes ?? [];
  const isEmpresa = localStorage.getItem('contaAtivaTipo') === 'empresa';

  const cancelarReceita = useMutation({
    mutationFn: (id: number) => apiRequest<void>(`/receitas/${id}/cancelar`, { method: 'PUT' }),
    onSuccess: () => invalidateFinanceQueries(qc, month, year),
  });

  const receberReceita = useMutation({
    mutationFn: (id: number) => apiRequest<void>(`/receitas/${id}/receber`, { method: 'PUT' }),
    onSuccess: () => {
      invalidateFinanceQueries(qc, month, year);
      void qc.invalidateQueries({ queryKey: queryKeys.contratosStatusFaturamento(month, year) });
    },
  });

  const handleConfirmarRecebimento = async (item: Income) => {
    const ok = await confirm({
      title: 'Confirmar recebimento',
      message: `Confirmar recebimento de "${item.descricao}"?`,
      confirmLabel: 'Confirmar',
      variant: 'default',
    });
    if (ok) receberReceita.mutate(item.id);
  };

  const handleCancelarReceita = async (item: Income) => {
    if (item.status === 'cancelada') return;
    const ok = await confirm({
      title: 'Cancelar receita',
      message: `Cancelar "${item.descricao}"?`,
      confirmLabel: 'Cancelar receita',
    });
    if (ok) cancelarReceita.mutate(item.id);
  };

  const handleExcluirReceita = async (item: Income) => {
    const ok = await confirm({
      title: 'Excluir receita',
      message: `Excluir "${item.descricao}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir receita',
    });
    if (ok) finance.deleteIncome.mutate(item.id);
  };

  const contratosQ = useQuery({
    queryKey: queryKeys.contratosStatusFaturamento(month, year),
    queryFn: () => getContratosFaturamento(month + 1, year),
    enabled: isEmpresa,
  });
  const searchGuide = useFirstAccessGuide('receitas:busca-v1', {
    enabled: !finance.dashboard.isLoading && allItems.length > 0,
  });
  const contratosGuide = useFirstAccessGuide('receitas:contratos-faturamento-v1', {
    enabled: isEmpresa && (contratosQ.data?.length ?? 0) > 0,
  });

  const faturarMut = useMutation({
    mutationFn: (contratoId: number) => faturarContrato(contratoId, month + 1, year),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.contratosStatusFaturamento(month, year) });
      invalidateFinanceQueries(qc, month, year);
    },
  });

  const receberContratoMut = useMutation({
    mutationFn: (receitaId: number) => apiRequest<void>(`/receitas/${receitaId}/receber`, { method: 'PUT' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.contratosStatusFaturamento(month, year) });
      invalidateFinanceQueries(qc, month, year);
    },
  });

  const hoje = getLocalTodayIso();

  const items = busca.trim()
    ? allItems.filter((i) =>
        i.descricao.toLowerCase().includes(busca.toLowerCase()) ||
        (i.cliente ?? '').toLowerCase().includes(busca.toLowerCase()) ||
        (i.tipoReceita ?? '').toLowerCase().includes(busca.toLowerCase())
      )
    : allItems;

  const handleSave = async (values: IncomeFormValues) => {
    await finance.saveIncome.mutateAsync({ values, id: dialog.item?.id });
    setDialog({ open: false });
  };

  return (
    <>
      <div className="grid gap-4">
        {finance.dashboard.error && (
          <ErrorState title="Erro ao carregar receitas" description={finance.dashboard.error.message} />
        )}

        {/* Contratos ? Faturamento */}
        {(contratosQ.data?.length ?? 0) > 0 && (
          <Card allowOverflow>
            <div className="relative flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <Building2 size={15} className="text-slate-500" />
              <h3 className="text-sm font-bold text-slate-800">
                Contratos — Faturamento{' '}
                <span className="font-normal text-slate-400">{MONTH_NAMES_SHORT[month]}/{year}</span>
              </h3>
              {contratosGuide.isVisible && (
                <FirstAccessGuideCard
                  floating
                  placement="bottom"
                  className="w-[min(25rem,calc(100vw-2rem))]"
                  icon={Building2}
                  description={firstAccessGuideMessages.receitasContratosFaturamento}
                  onDismiss={contratosGuide.dismiss}
                />
              )}
            </div>
            <div className="divide-y divide-slate-100">
              {contratosQ.data!.map((item) => {
                const isPendente = item.receitaStatus === null || item.receitaStatus === 'prevista';
                const isFaturado = item.receitaStatus === 'faturada';
                const isRecebido = item.receitaStatus === 'ativa';
                return (
                  <div key={item.contratoId} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-900 truncate">{item.clienteNome}</p>
                      {item.contratoDescricao && (
                        <p className="text-[11px] text-slate-400 truncate">{item.contratoDescricao}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-sm font-bold text-slate-700">{formatCurrency(item.valorMensal)}</span>
                      {statusFaturamentoBadge(item, month + 1, year)}
                      {(isPendente) && (
                        <button
                          onClick={() => faturarMut.mutate(item.contratoId)}
                          disabled={faturarMut.isPending}
                          className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-40 transition"
                        >
                          Faturar
                        </button>
                      )}
                      {isFaturado && item.receitaId && (
                        <button
                          onClick={() => receberContratoMut.mutate(item.receitaId!)}
                          disabled={receberContratoMut.isPending}
                          className="rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700 hover:bg-green-100 disabled:opacity-40 transition"
                        >
                          Recebido
                        </button>
                      )}
                      {isRecebido && (
                        <span className="text-[11px] text-slate-300">✓</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Table */}
        <Card allowOverflow>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
            {toolbarStart && <div className="flex min-w-0 flex-wrap items-center gap-2">{toolbarStart}</div>}
            <div className="relative w-full max-w-xs">
              <input
                type="search"
                placeholder="Buscar receita..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-200"
              />
              {searchGuide.isVisible && !finance.dashboard.isLoading && allItems.length > 0 && (
                <FirstAccessGuideCard
                  icon={Search}
                  description={firstAccessGuideMessages.receitasBusca}
                  align="right"
                  floating
                  placement="top"
                  className="w-[min(24rem,calc(100vw-2rem))]"
                  onDismiss={searchGuide.dismiss}
                />
              )}
            </div>
          </div>

          {finance.dashboard.isLoading ? (
            <EmptyState title="Carregando" description="Buscando receitas do mês." />
          ) : items.length === 0 ? (
            busca ? (
              <EmptyState title="Nenhum resultado" description="Tente outro termo de busca." />
            ) : (
              <div className="grid justify-items-center gap-3 py-8">
                <EmptyState
                  title="Nenhuma receita"
                  description="Cadastre sua primeira receita para começar a acompanhar entradas e saldo do mês."
                />
                <Button icon={<Plus size={15} />} onClick={() => setDialog({ open: true })}>
                  Nova receita
                </Button>
              </div>
            )
          ) : (
            <>
              {/* Cards — mobile only */}
              <div className="divide-y divide-slate-100 dark:divide-slate-700 md:hidden">
                {items.map((item) => (
                  <IncomeCard
                    key={item.id}
                    item={item}
                    hoje={hoje}
                    onConfirmRecebimento={() => handleConfirmarRecebimento(item)}
                    onCancel={() => handleCancelarReceita(item)}
                    onOpenAttachments={() => setAnexosDialog({ open: true, title: item.descricao, anexos: item.anexos! })}
                    onEdit={() => setDialog({ open: true, item })}
                    onDelete={() => handleExcluirReceita(item)}
                  />
                ))}
              </div>

              {/* Table — desktop only */}
              <div className="hidden overflow-x-auto md:block">
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
                          <button
                            onClick={() => setDialog({ open: true, item })}
                            title="Editar"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
                          >
                            <Pencil size={14} />
                          </button>
                          {isPrevista ? (
                            <button
                              onClick={() => handleConfirmarRecebimento(item)}
                              disabled={receberReceita.isPending}
                              title="Confirmar recebimento"
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-green-50 hover:text-green-600 disabled:opacity-30 transition"
                            >
                              <CheckCircle size={14} />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleCancelarReceita(item)}
                              disabled={item.status === 'cancelada' || cancelarReceita.isPending}
                              title={item.status === 'cancelada' ? 'Já cancelada' : 'Cancelar'}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 transition"
                            >
                              <Ban size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => handleExcluirReceita(item)}
                            title="Excluir"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50">
                    <td colSpan={5} className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">
                      {(() => { const n = items.filter(i => i.status === 'ativa').length; return `Total (${n} lançamento${n !== 1 ? 's' : ''})`; })()}
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
            </>
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
