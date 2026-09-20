import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog } from '../../ui/dialog';
import { C } from '../../ui/dialogFormTokens';
import { EmptyState } from '../../ui/EmptyState';
import { useConfirm } from '../../context/ConfirmContext';
import { fetchExpenseGroup } from '../../services/financeService';
import { queryKeys } from '../../services/queryKeys';
import { formatCurrency, formatDate } from '../finance/formatters';
import type { Expense } from '../../types/finance';
import { StatusBadge } from './DespesasScreen';

interface DeleteInstallmentDialogProps {
  open: boolean;
  expense: Expense | null;
  isLoading?: boolean;
  onClose: () => void;
  /** ids das parcelas selecionadas para exclusão. */
  onDeleteSelected: (ids: number[]) => void;
}

export function DeleteInstallmentDialog({
  open, expense, isLoading = false, onClose, onDeleteSelected,
}: DeleteInstallmentDialogProps) {
  const grupoId = expense?.grupoParcelamentoId ?? null;
  const confirm = useConfirm();
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());

  const groupQuery = useQuery({
    queryKey: queryKeys.expenseGroup(grupoId ?? -1),
    queryFn: () => fetchExpenseGroup(grupoId!),
    enabled: open && grupoId != null,
  });

  // Reinicia a seleção sempre que o dialog abre para um grupo diferente —
  // por padrão, só a parcela clicada já vem marcada.
  useEffect(() => {
    if (!open || !expense) return;
    setSelecionadas(new Set([expense.id]));
  }, [open, expense?.id]);

  if (!expense) return null;

  const parcelas = groupQuery.data ?? [];
  const todasSelecionadas = parcelas.length > 0 && selecionadas.size === parcelas.length;

  const toggleItem = (id: number) => {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelecionadas(todasSelecionadas ? new Set() : new Set(parcelas.map((p) => p.id)));
  };

  const handleConfirmDelete = async () => {
    const ids = [...selecionadas];
    if (ids.length === 0) return;

    const incluiPaga = parcelas.some((p) => ids.includes(p.id) && p.pago);
    const ok = await confirm({
      title: 'Excluir parcelas',
      message: ids.length === parcelas.length
        ? `Excluir todas as ${parcelas.length} parcelas de "${expense.descricao}"? Esta ação não pode ser desfeita.`
        : `Excluir ${ids.length} parcela${ids.length === 1 ? '' : 's'} de "${expense.descricao}"?${incluiPaga ? ' A seleção inclui parcela(s) já paga(s).' : ''} Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
    });
    if (ok) onDeleteSelected(ids);
  };

  return (
    <Dialog open={open} title="Excluir despesa parcelada" onClose={onClose} size="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: '0 26px', fontSize: 13.5, color: C.textSoft }}>
          {`"${expense.descricao}" faz parte de um parcelamento. Selecione as parcelas que deseja excluir.`}
        </p>

        <div style={{ margin: '0 26px', maxHeight: 340, overflowY: 'auto', border: `1px solid ${C.borderInput}`, borderRadius: 12 }}>
          {groupQuery.isLoading ? (
            <p style={{ padding: 20, textAlign: 'center', fontSize: 13, color: C.textSoft }}>Carregando parcelas...</p>
          ) : groupQuery.isError ? (
            <div style={{ padding: 12 }}>
              <EmptyState title="Não foi possível carregar" description="Tente fechar e abrir novamente." />
            </div>
          ) : parcelas.length === 0 ? (
            <div style={{ padding: 12 }}>
              <EmptyState title="Nenhuma parcela encontrada" description="" />
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.borderInput}` }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', width: 32 }}>
                    <input type="checkbox" checked={todasSelecionadas} onChange={toggleSelectAll} aria-label="Selecionar todas as parcelas" />
                  </th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: C.textSoft, fontWeight: 600 }}>Parcela</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: C.textSoft, fontWeight: 600 }}>Vencimento</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', color: C.textSoft, fontWeight: 600 }}>Valor</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', color: C.textSoft, fontWeight: 600 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {parcelas.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => toggleItem(p.id)}
                    style={{ borderBottom: `1px solid ${C.borderInput}`, cursor: 'pointer' }}
                  >
                    <td style={{ padding: '8px 10px' }}>
                      <input
                        type="checkbox"
                        checked={selecionadas.has(p.id)}
                        onChange={() => toggleItem(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Selecionar parcela ${p.parcela ?? p.id}`}
                      />
                    </td>
                    <td style={{ padding: '8px 10px', color: C.text }}>{p.parcela ?? '—'}</td>
                    <td style={{ padding: '8px 10px', color: C.textSoft }}>{formatDate(p.dataVencimento)}</td>
                    <td style={{ padding: '8px 10px', textAlign: 'right', color: C.text }}>{formatCurrency(p.valorFinal)}</td>
                    <td style={{ padding: '8px 10px' }}><StatusBadge item={p} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ margin: '0 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 12.5, color: C.textSoft }}>
            {selecionadas.size} de {parcelas.length} parcela{parcelas.length === 1 ? '' : 's'} selecionada{selecionadas.size === 1 ? '' : 's'}
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              style={{ padding: '10px 18px', borderRadius: 11, fontSize: 13.5, fontWeight: 600, border: `1px solid ${C.borderInput}`, background: '#fff', color: C.textSoft, cursor: isLoading ? 'not-allowed' : 'pointer', opacity: isLoading ? 0.5 : 1 }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={isLoading || selecionadas.size === 0 || groupQuery.isLoading}
              style={{
                padding: '10px 18px', borderRadius: 11, fontSize: 13.5, fontWeight: 700,
                border: 'none', background: C.danger, color: '#fff',
                cursor: (isLoading || selecionadas.size === 0) ? 'not-allowed' : 'pointer',
                opacity: (isLoading || selecionadas.size === 0) ? 0.5 : 1,
              }}
            >
              {isLoading ? 'Excluindo...' : `Excluir selecionadas (${selecionadas.size})`}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
