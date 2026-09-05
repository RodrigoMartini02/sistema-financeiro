import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronRight, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BudgetOverviewItem, BudgetTargetMode } from '../../types/budget';
import { deleteBudgetTarget, fetchBudgetOverview, saveBudgetTarget } from '../../services/budgetService';
import { queryKeys } from '../../services/queryKeys';
import { Card } from '../../ui/card';
import { Dialog } from '../../ui/dialog';
import {
  C, labelStyle, fieldInputStyle, dialogFooterStyle,
  saveButtonStyle, saveButtonDisabledStyle,
} from '../../ui/dialogFormTokens';
import {
  CFG, CFG_MONO_CLASS, CONFIG_SCOPE_CLASS, cfgBadgeStyle, cfgRowIndexStyle,
} from '../../ui/configTokens';
import { budgetPercentage, formatCurrency } from './formatters';

interface BudgetPanelProps {
  month: number;
  year: number;
  toolbarStart?: ReactNode;
}

/** Raiz com suas subcategorias já agrupadas, no mesmo formato de CategoriasTab. */
interface BudgetTreeNode {
  root: BudgetOverviewItem;
  children: BudgetOverviewItem[];
}

function statusLabel(item: BudgetOverviewItem): string {
  if (!item.targetAmount) return 'Sem meta';
  return `${budgetPercentage(item).toFixed(0)}% da meta`;
}

function statusBadgeStyle(item: BudgetOverviewItem) {
  const palette = item.status === 'over'
    ? { background: CFG.dangerBg, color: CFG.danger }
    : item.status === 'attention'
      ? { background: CFG.warnBg, color: CFG.warnText }
      : item.status === 'healthy'
        ? { background: CFG.successBg, color: CFG.success }
        : { background: CFG.chipBg, color: CFG.chipText };
  return { ...cfgBadgeStyle, ...palette };
}

// ─── Linha da listagem ────────────────────────────────────────────────────────

function BudgetRow({
  item, index, isChild, expanded, onToggleExpand, subCount, onEditTarget, onRemoveTarget, isRemoving,
}: {
  item: BudgetOverviewItem;
  /** Índice hierárquico já formatado: "01" na raiz, "1.1" na subcategoria. */
  index: string;
  isChild: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  subCount: number;
  /** Só a raiz recebe meta — o total dela já soma as subcategorias. */
  onEditTarget?: () => void;
  onRemoveTarget?: () => void;
  isRemoving: boolean;
}) {
  const hasSubs = subCount > 0;

  return (
    <div style={{ marginLeft: isChild ? 22 : 0 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          minHeight: isChild ? 34 : 38, padding: '0 12px', borderRadius: 12,
          border: `1px solid ${CFG.border}`,
          background: isChild ? CFG.surfaceAlt : CFG.surface,
          boxShadow: CFG.shadowRow,
          transition: 'border-color .13s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = CFG.primary; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = CFG.border; }}
      >
        <span className={CFG_MONO_CLASS} style={cfgRowIndexStyle}>{index}</span>

        <span
          style={{
            minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 6,
            fontSize: isChild ? 12.5 : 13, fontWeight: isChild ? 500 : 600,
            color: isChild ? CFG.textSoft : CFG.text,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.categoryName}
          </span>
          {hasSubs && <span style={cfgBadgeStyle}>{subCount} sub</span>}
        </span>

        <span
          className={CFG_MONO_CLASS}
          style={{ flex: 'none', fontSize: 11.5, fontWeight: 600, color: CFG.textSoft }}
        >
          {formatCurrency(item.projectedAmount)}
        </span>

        {item.targetAmount ? (
          <span style={statusBadgeStyle(item)}>
            {formatCurrency(item.targetAmount)} · {statusLabel(item)}
          </span>
        ) : !isChild ? (
          <span style={{ flex: 'none', fontSize: 11, fontWeight: 500, color: CFG.faint }}>Sem meta</span>
        ) : null}

        {onEditTarget && (
          <button
            type="button"
            onClick={onEditTarget}
            aria-label={`${item.mode ? 'Editar' : 'Definir'} meta para ${item.categoryName}`}
            title={item.mode ? 'Editar meta' : 'Definir meta'}
            style={{
              flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
              border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
              fontSize: 11.5, fontWeight: 600, color: CFG.primaryDark,
            }}
          >
            {item.mode ? <Pencil size={11} strokeWidth={2.6} /> : <Plus size={11} strokeWidth={2.8} />}
            <span className="hidden sm:inline">{item.mode ? 'Editar' : 'Meta'}</span>
          </button>
        )}

        {onRemoveTarget && item.mode && (
          <button
            type="button"
            onClick={onRemoveTarget}
            disabled={isRemoving}
            aria-label={`Remover meta de ${item.categoryName}`}
            title="Remover meta"
            style={{
              flex: 'none', display: 'grid', placeItems: 'center', width: 16, height: 16,
              border: 'none', background: 'transparent', padding: 0,
              color: CFG.faint, cursor: isRemoving ? 'not-allowed' : 'pointer',
              opacity: isRemoving ? 0.5 : 1,
            }}
          >
            <Trash2 size={12} />
          </button>
        )}

        {hasSubs ? (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={expanded ? 'Recolher subcategorias' : 'Expandir subcategorias'}
            style={{
              flex: 'none', display: 'grid', placeItems: 'center', width: 16, height: 16,
              border: 'none', background: 'transparent', borderRadius: 8,
              color: CFG.faint, cursor: 'pointer',
            }}
          >
            <ChevronRight
              size={13}
              strokeWidth={2.2}
              style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .13s ease' }}
            />
          </button>
        ) : (
          <span style={{ flex: 'none', width: 16 }} />
        )}
      </div>
    </div>
  );
}

// ─── Modal de meta ────────────────────────────────────────────────────────────

function MetaDialog({
  item, isSaving, error, onClose, onSave,
}: {
  item: BudgetOverviewItem;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (mode: BudgetTargetMode, targetValue: number) => void;
}) {
  const [mode, setMode] = useState<BudgetTargetMode>(item.mode ?? 'amount');
  const [targetValue, setTargetValue] = useState(
    item.targetValue?.toString() ?? item.suggestedAmount?.toFixed(2) ?? '',
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = Number(targetValue.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setLocalError('Informe uma meta maior que zero.');
      return;
    }
    setLocalError(null);
    onSave(mode, parsed);
  };

  const mensagem = localError ?? error;

  return (
    <Dialog open title={`Meta: ${item.categoryName}`} onClose={onClose} size="sm" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={submit}>
        {/* Altura fixa: o modal não muda de tamanho entre os dois modos. */}
        <div style={{ flex: 1, minHeight: 0, height: 148, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 120px', gap: 10 }}>
            <div>
              <label style={labelStyle}>Tipo de meta</label>
              <select
                value={mode}
                onChange={(event) => setMode(event.target.value as BudgetTargetMode)}
                style={fieldInputStyle}
              >
                <option value="amount">Valor mensal (R$)</option>
                <option value="income_percent">Percentual da receita</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>
                <span>{mode === 'income_percent' ? 'Percentual' : 'Valor'}</span>
                <span style={{ color: C.danger }}>*</span>
              </label>
              <input
                type="number"
                min="0"
                max={mode === 'income_percent' ? 100 : undefined}
                step="0.01"
                value={targetValue}
                onChange={(event) => setTargetValue(event.target.value)}
                placeholder={mode === 'income_percent' ? '15' : '800,00'}
                autoFocus
                style={fieldInputStyle}
              />
            </div>
          </div>

          {item.suggestedAmount !== null && !item.mode && (
            <p style={{ margin: 0, fontSize: 11.5, fontWeight: 500, color: CFG.muted }}>
              Média dos três meses anteriores: {formatCurrency(item.suggestedAmount)}.
            </p>
          )}

          <p style={{ margin: 0, fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: CFG.muted }}>
            A meta considera também os gastos das subcategorias desta categoria.
          </p>

          {mensagem && (
            <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
              {mensagem}
            </div>
          )}
        </div>

        <div style={{ ...dialogFooterStyle, justifyContent: 'flex-end' }}>
          <button type="submit" disabled={isSaving} style={isSaving ? saveButtonDisabledStyle : saveButtonStyle}>
            {isSaving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Painel ───────────────────────────────────────────────────────────────────

export function BudgetPanel({ month, year, toolbarStart }: BudgetPanelProps) {
  const queryClient = useQueryClient();
  const overviewQuery = useQuery({
    queryKey: queryKeys.budgetOverview(month, year),
    queryFn: () => fetchBudgetOverview(month, year),
    staleTime: 30_000,
  });
  const overview = overviewQuery.data;
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState<number[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedItem = useMemo(
    () => overview?.items.find((item) => item.categoryId === editingCategoryId) ?? null,
    [editingCategoryId, overview?.items],
  );

  useEffect(() => {
    if (selectedItem) setFormError(null);
  }, [selectedItem]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.budgetOverview(month, year) });
  const saveMutation = useMutation({
    mutationFn: saveBudgetTarget,
    onSuccess: async () => {
      await invalidate();
      setEditingCategoryId(null);
    },
    onError: (error) => setFormError(error instanceof Error ? error.message : 'Não foi possível salvar a meta.'),
  });
  const removeMutation = useMutation({
    mutationFn: deleteBudgetTarget,
    onSuccess: invalidate,
  });

  // Um único nível de aninhamento, como em CategoriasTab. A ordenação por valor
  // projetado vem do backend e é preservada dentro de cada nível.
  const tree = useMemo<BudgetTreeNode[]>(() => {
    if (!overview) return [];
    const visibleIds = new Set(overview.items.map((item) => item.categoryId));
    // Uma subcategoria ativa cujo pai foi desativado não tem onde ser
    // pendurada; sem este tratamento ela sumiria da tela, embora suas despesas
    // continuem somando no total do período.
    const roots = overview.items.filter(
      (item) => item.parentId === null || !visibleIds.has(item.parentId),
    );
    return roots.map((root) => ({
      root,
      children: overview.items.filter((item) => item.parentId === root.categoryId),
    }));
  }, [overview]);

  if (overviewQuery.isLoading) {
    return (
      <Card className="p-5">
        {toolbarStart && <div className="mb-4">{toolbarStart}</div>}
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando planejamento...</p>
      </Card>
    );
  }
  if (overviewQuery.error || !overview) {
    return (
      <Card className="p-5">
        {toolbarStart && <div className="mb-4">{toolbarStart}</div>}
        <p className="text-sm text-rose-600 dark:text-rose-300">Não foi possível carregar o planejamento deste período.</p>
      </Card>
    );
  }
  if (overview.accountType === 'empresa') {
    return (
      <Card className="p-5">
        {toolbarStart && <div className="mb-4">{toolbarStart}</div>}
        <div className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"><Target size={17} /></span>
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">Planejamento pessoal</p>
            <p className="mt-1">Metas de orçamento por categoria ficam disponíveis apenas na conta pessoal.</p>
          </div>
        </div>
      </Card>
    );
  }

  const alertItems = overview.items.filter((item) => item.status === 'attention' || item.status === 'over');
  const toggleExpand = (id: number) =>
    setCollapsed((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const totalSubs = tree.reduce((n, node) => n + node.children.length, 0);

  return (
    // Os componentes usam as variáveis --cfg-*, que só existem dentro deste
    // escopo; sem ele as cores não resolvem fora do drawer de Configurações.
    <Card className="p-5">
      <div className={CONFIG_SCOPE_CLASS}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {toolbarStart && <div className="mb-3">{toolbarStart}</div>}
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: CFG.text }}>Planejamento de orçamento</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11.5, fontWeight: 500, color: CFG.muted }}>
              {tree.length} categoria{tree.length === 1 ? '' : 's'}
              {totalSubs > 0 ? ` · ${totalSubs} sub` : ''}
            </p>
          </div>
          <div style={{ textAlign: 'right', fontSize: 11.5, fontWeight: 500, color: CFG.muted }}>
            <p style={{ margin: 0 }}>
              Receitas: <strong style={{ color: CFG.textSoft }}>{formatCurrency(overview.incomeTotal)}</strong>
            </p>
            <p style={{ margin: '4px 0 0' }}>
              Despesas previstas: <strong style={{ color: CFG.textSoft }}>{formatCurrency(overview.projectedTotal)}</strong>
            </p>
          </div>
        </div>

        {alertItems.length > 0 && (
          <div className="mt-4" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {alertItems.map((item) => (
              <div
                key={item.categoryId}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, padding: '7px 10px',
                  fontSize: 11.5, fontWeight: 500,
                  border: `1px solid ${item.status === 'over' ? CFG.dangerBorder : CFG.warnBorder}`,
                  background: item.status === 'over' ? CFG.dangerBg : CFG.warnBg,
                  color: item.status === 'over' ? CFG.danger : CFG.warnText,
                }}
              >
                <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                <span><strong>{item.categoryName}</strong> está em {statusLabel(item)}.</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tree.map((node, i) => {
            const rootIndex = String(i + 1).padStart(2, '0');
            const expanded = !collapsed.includes(node.root.categoryId);
            return (
              <div key={node.root.categoryId} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <BudgetRow
                  item={node.root}
                  index={rootIndex}
                  isChild={false}
                  expanded={expanded}
                  onToggleExpand={() => toggleExpand(node.root.categoryId)}
                  subCount={node.children.length}
                  // Órfã (pai desativado) aparece como raiz para não sumir da
                  // tela, mas segue sendo subcategoria para o backend, que só
                  // aceita meta na raiz — então não oferece a ação.
                  onEditTarget={node.root.parentId === null
                    ? () => setEditingCategoryId(node.root.categoryId)
                    : undefined}
                  onRemoveTarget={node.root.parentId === null
                    ? () => removeMutation.mutate(node.root.categoryId)
                    : undefined}
                  isRemoving={removeMutation.isPending}
                />
                {expanded && node.children.map((child, j) => (
                  <BudgetRow
                    key={child.categoryId}
                    item={child}
                    index={`${i + 1}.${j + 1}`}
                    isChild
                    subCount={0}
                    isRemoving={false}
                  />
                ))}
              </div>
            );
          })}

          {tree.length === 0 && (
            <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>
              Nenhuma categoria cadastrada para planejar.
            </p>
          )}
        </div>

        {selectedItem && (
          <MetaDialog
            item={selectedItem}
            isSaving={saveMutation.isPending}
            error={formError}
            onClose={() => setEditingCategoryId(null)}
            onSave={(mode, targetValue) =>
              saveMutation.mutate({ categoryId: selectedItem.categoryId, mode, targetValue })}
          />
        )}
      </div>
    </Card>
  );
}
