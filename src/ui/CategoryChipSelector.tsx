import { useState, useEffect } from 'react';
import { Check, Plus } from 'lucide-react';
import type { Categoria } from '../types/config';

interface Props {
  categories: Categoria[];
  value?: number;
  onChange: (id: number | undefined) => void;
  onCreateNew?: () => void;
  error?: string;
}

interface ParentNode {
  id: number;
  nome: string;
  children: { id: number; nome: string }[];
}

function buildTree(categories: Categoria[]): ParentNode[] {
  const active = categories.filter((c) => c.ativo);
  const byParent: Record<number, Categoria[]> = {};
  active.filter((c) => c.parent_id).forEach((c) => {
    byParent[c.parent_id!] = byParent[c.parent_id!] ?? [];
    byParent[c.parent_id!].push(c);
  });
  return active
    .filter((c) => !c.parent_id)
    .map((p) => ({
      id: p.id,
      nome: p.nome,
      children: (byParent[p.id] ?? []).map((s) => ({ id: s.id, nome: s.nome })),
    }));
}

const chipBase =
  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer select-none';
const chipOn =
  'border-brand-700 bg-brand-600 text-white shadow-sm';
const chipMuted =
  'border-brand-400 bg-brand-50 text-brand-700 shadow-sm dark:border-brand-600 dark:bg-brand-900/20 dark:text-brand-400';
const chipOff =
  'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:bg-slate-50 shadow-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:border-slate-500';

export function CategoryChipSelector({ categories, value, onChange, onCreateNew, error }: Props) {
  const tree = buildTree(categories);

  const resolveParent = (val: number | undefined): number | null => {
    if (!val) return null;
    if (tree.some((p) => p.id === val)) return val;
    return tree.find((p) => p.children.some((c) => c.id === val))?.id ?? null;
  };

  const [activeParentId, setActiveParentId] = useState<number | null>(() => resolveParent(value));

  useEffect(() => {
    setActiveParentId(resolveParent(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeParent = tree.find((p) => p.id === activeParentId);

  const handleParent = (parent: ParentNode) => {
    if (parent.children.length === 0) {
      const next = value === parent.id ? undefined : parent.id;
      onChange(next);
      setActiveParentId(next ? parent.id : null);
    } else {
      // Apenas abre/fecha o painel de subs; não altera a seleção
      setActiveParentId(activeParentId === parent.id ? null : parent.id);
    }
  };

  const handleSub = (subId: number) => {
    onChange(value === subId ? undefined : subId);
  };

  return (
    <div className={['grid gap-2', error ? 'rounded-xl ring-1 ring-red-400 p-1' : ''].join(' ')}>
      {/* Pais */}
      <div className="flex flex-wrap gap-2">
        {tree.map((parent) => {
          const isDirectlySelected = value === parent.id;
          const hasChildSelected   = parent.children.some((c) => c.id === value);
          const isActive           = activeParentId === parent.id;

          const style = isDirectlySelected
            ? chipOn
            : hasChildSelected
              ? chipMuted   // filho selecionado → suave, sem checkmark
              : isActive
                ? chipOn    // painel aberto, sem seleção → destaque normal
                : chipOff;

          return (
            <button
              key={parent.id}
              type="button"
              onClick={() => handleParent(parent)}
              className={[chipBase, style].join(' ')}
            >
              {isDirectlySelected && <Check size={11} strokeWidth={3} />}
              {parent.nome}
            </button>
          );
        })}
        {onCreateNew && (
          <button
            type="button"
            onClick={onCreateNew}
            className={[chipBase, 'border-dashed border-brand-300 text-brand-500 hover:bg-brand-50 dark:border-brand-700 dark:text-brand-400'].join(' ')}
          >
            <Plus size={11} /> Nova
          </button>
        )}
      </div>

      {/* Subs */}
      {activeParent && activeParent.children.length > 0 && (
        <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/40">
          {activeParent.children.map((sub) => {
            const isSelected = value === sub.id;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => handleSub(sub.id)}
                className={[chipBase, 'py-1 px-2.5 text-[11px]', isSelected ? chipOn : chipOff].join(' ')}
              >
                {isSelected && <Check size={10} strokeWidth={3} />}
                {sub.nome}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
