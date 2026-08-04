import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronDown, ChevronRight, Tag } from 'lucide-react';
import { fetchCategorias, saveCategoria, toggleCategoria } from '../../services/configService';
import { queryKeys } from '../../services/queryKeys';
import type { Categoria, CategoriaFormValues } from '../../types/config';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { Field, Input, Select } from '../../ui/form';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';

type CategoriaKind = 'principal' | 'subcategoria';

const CAT_SCHEME = {
  red: {
    cardHover: 'hover:border-red-300',
    badge: 'group-hover:bg-red-50 group-hover:text-red-600',
    chevron: 'group-hover:text-red-400',
  },
  brand: {
    cardHover: 'hover:border-brand-300',
    badge: 'group-hover:bg-brand-50 group-hover:text-brand-600',
    chevron: 'group-hover:text-brand-400',
  },
};

function CategoriaDialog({
  open, cat, pais, initialParentId, isSaving, error, onClose, onSave, onToggle,
}: {
  open: boolean;
  cat?: Categoria;
  pais: Categoria[];
  initialParentId?: number;
  isSaving: boolean;
  error?: string;
  onClose: () => void;
  onSave: (v: CategoriaFormValues) => void;
  onToggle?: () => void;
}) {
  const categoryHasChildren = (cat?.subcategorias?.length ?? 0) > 0;
  const parentOptions = pais.filter((p) => p.ativo && p.id !== cat?.id);
  const canChooseSubcategory = !categoryHasChildren && parentOptions.length > 0;
  const isDirectSubcategoryCreation = !cat && !!initialParentId;

  const resolveInitialKind = (): CategoriaKind => {
    if (categoryHasChildren) return 'principal';
    if (cat?.parent_id || initialParentId) return 'subcategoria';
    return 'principal';
  };

  const resolveInitialParent = () => String(cat?.parent_id ?? initialParentId ?? '');

  const [tipoCategoria, setTipoCategoria] = useState<CategoriaKind>(resolveInitialKind);
  const [selectedParentId, setSelectedParentId] = useState(resolveInitialParent);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setLocalError(null);
      return;
    }

    setTipoCategoria(resolveInitialKind());
    setSelectedParentId(resolveInitialParent());
    setLocalError(null);
  }, [open, cat?.id, cat?.parent_id, categoryHasChildren, initialParentId]);

  const isSubcategory = tipoCategoria === 'subcategoria';
  const forcedPrincipalMessage = categoryHasChildren
    ? 'Esta categoria possui subcategorias. Para manter a estrutura, ela deve continuar como categoria principal.'
    : null;

  const handleKindChange = (kind: CategoriaKind) => {
    if (kind === 'subcategoria' && !canChooseSubcategory) return;

    setTipoCategoria(kind);
    setLocalError(null);
    if (kind === 'principal') {
      setSelectedParentId('');
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nome = String(fd.get('nome') ?? '').trim();

    if (isSubcategory && !selectedParentId) {
      setLocalError('Selecione uma categoria principal para vincular esta subcategoria.');
      return;
    }

    onSave({
      nome,
      parent_id: isSubcategory ? Number(selectedParentId) : null,
    });
  };

  const title = cat
    ? 'Editar categoria'
    : initialParentId
      ? 'Nova subcategoria'
      : 'Nova categoria';

  return (
    <Dialog open={open} title={title} onClose={onClose}>
      <form className="grid gap-5" onSubmit={handleSubmit}>
        <Field label="Nome da categoria">
          <Input
            key={`nome-${cat?.id ?? initialParentId ?? 'new'}-${open}`}
            name="nome"
            defaultValue={cat?.nome}
            placeholder="Ex: Alimentacao"
            autoFocus
            required
          />
        </Field>

        {!isDirectSubcategoryCreation && (
          <Field label="Tipo da categoria" hint={forcedPrincipalMessage ?? undefined}>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleKindChange('principal')}
                className={[
                  'rounded-2xl border px-4 py-3 text-left transition-all',
                  tipoCategoria === 'principal'
                    ? 'border-brand-600 bg-brand-50 text-brand-800 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:bg-slate-50',
                ].join(' ')}
              >
                <span className="block text-sm font-bold">Categoria principal</span>
                <span className="mt-0.5 block text-xs text-slate-400">Agrupa despesas e subcategorias.</span>
              </button>

              <button
                type="button"
                disabled={!canChooseSubcategory}
                onClick={() => handleKindChange('subcategoria')}
                className={[
                  'rounded-2xl border px-4 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-45',
                  tipoCategoria === 'subcategoria'
                    ? 'border-brand-600 bg-brand-50 text-brand-800 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 hover:bg-slate-50',
                ].join(' ')}
              >
                <span className="block text-sm font-bold">Subcategoria</span>
                <span className="mt-0.5 block text-xs text-slate-400">Fica vinculada a uma principal.</span>
              </button>
            </div>
          </Field>
        )}

        {isSubcategory && !isDirectSubcategoryCreation && (
          <Field label="Vincular a uma categoria principal" required>
            <Select
              name="parent_id"
              value={selectedParentId}
              onChange={(e) => { setSelectedParentId(e.target.value); setLocalError(null); }}
              required
            >
              <option value="">Selecione uma categoria principal</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </Select>
          </Field>
        )}

        {(error || localError) && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {localError ?? error}
          </div>
        )}

        <div className="flex items-center gap-2">
          {cat && onToggle && (
            <Button type="button" variant={cat.ativo ? 'danger' : 'ghost'} onClick={onToggle}>
              {cat.ativo ? 'Desativar' : 'Ativar'}
            </Button>
          )}
          <div className="ml-auto">
            <Button type="submit" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

function CategoriaRow({
  cat, index, isChild, colorScheme = 'brand', onEdit, onCreateSubcategory,
}: {
  cat: Categoria;
  index: number;
  isChild?: boolean;
  colorScheme?: 'red' | 'brand';
  onEdit: (cat: Categoria) => void;
  onCreateSubcategory?: (cat: Categoria) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasSubs = (cat.subcategorias?.length ?? 0) > 0;
  const s = CAT_SCHEME[colorScheme];
  const dataCriado = cat.data_criacao
    ? new Date(cat.data_criacao).toLocaleDateString('pt-BR')
    : null;

  const nome = (
    <span className={!cat.ativo ? 'text-slate-400 line-through' : undefined}>
      {cat.nome}
      {hasSubs && !isChild && (
        <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-500">
          {cat.subcategorias!.length} sub
        </span>
      )}
    </span>
  );

  return (
    <>
      <div className={['relative', isChild ? 'ml-6' : '', !cat.ativo ? 'opacity-50' : ''].join(' ')}>
        <div className={`group flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:shadow-md ${isChild ? 'px-4 py-2' : 'px-5 py-4'} ${s.cardHover}`}>
          <button
            type="button"
            onClick={() => onEdit(cat)}
            className="flex min-w-0 flex-1 items-center gap-4 text-left"
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 font-mono text-sm font-semibold text-slate-500 transition ${s.badge}`}>
              {String(index + 1).padStart(2, '0')}
            </span>
            <div className="min-w-0 flex-1">
              <div className="lg:hidden">
                <p className="truncate text-sm font-semibold text-slate-900">{nome}</p>
                {dataCriado && <p className="mt-0.5 text-xs text-slate-400">Criado {dataCriado}</p>}
              </div>
              <div className="hidden lg:grid lg:grid-cols-[2fr_1fr] lg:items-center lg:gap-6">
                <p className="truncate text-sm font-semibold text-slate-900">{nome}</p>
                <p className="text-xs text-slate-400">{dataCriado ?? '-'}</p>
              </div>
            </div>
          </button>

          {!isChild && cat.ativo && onCreateSubcategory && (
            <button
              type="button"
              onClick={() => onCreateSubcategory(cat)}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-red-100 px-2.5 text-xs font-semibold text-red-600 transition hover:border-red-200 hover:bg-red-50"
            >
              <Plus size={12} />
              <span className="hidden sm:inline">Subcategoria</span>
              <span className="sm:hidden">Sub</span>
            </button>
          )}

          {hasSubs && !isChild ? (
            <button
              type="button"
              onClick={() => setExpanded((o) => !o)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : (
            <ChevronRight size={15} className={`shrink-0 text-slate-300 transition group-hover:translate-x-0.5 ${s.chevron}`} />
          )}
        </div>
      </div>

      {!isChild && hasSubs && expanded && (
        <div className="mt-1 grid gap-2">
          {cat.subcategorias!.map((sub, subIdx) => (
            <CategoriaRow
              key={sub.id}
              cat={sub}
              index={subIdx}
              isChild
              colorScheme={colorScheme}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </>
  );
}

export function CategoriasTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Categoria; parentId?: number }>({ open: false });
  const cats = useQuery({ queryKey: queryKeys.categorias, queryFn: fetchCategorias });
  const allCats = cats.data ?? [];
  const roots = allCats.filter((c) => !c.parent_id);
  const tree: Categoria[] = roots.map((root) => ({
    ...root,
    subcategorias: allCats.filter((c) => c.parent_id === root.id),
  }));

  const saveMut = useMutation({
    mutationFn: async ({ v, id }: { v: CategoriaFormValues; id?: number }) => saveCategoria(v, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categorias });
      setDialog({ open: false });
    },
  });

  const toggleMut = useMutation({
    mutationFn: toggleCategoria,
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.categorias }); setDialog({ open: false }); },
  });

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 content-start rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <h3 className="text-sm font-semibold text-red-700">Despesas</h3>
            <span className="text-xs text-slate-400">
              {roots.length} raiz{allCats.length > roots.length ? ` - ${allCats.length - roots.length} sub` : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDialog({ open: true })}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700"
          >
            <Plus size={14} />
            Nova categoria
          </button>
        </div>

        {cats.isLoading && <p className="py-4 text-center text-sm text-slate-400">Carregando...</p>}

        <div className="grid gap-2">
          {tree.map((c, i) => (
            <CategoriaRow
              key={c.id}
              cat={c}
              index={i}
              colorScheme="red"
              onEdit={(item) => setDialog({ open: true, item })}
              onCreateSubcategory={(item) => setDialog({ open: true, parentId: item.id })}
            />
          ))}
          {tree.length === 0 && !cats.isLoading && (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center shadow-sm">
              <p className="text-sm font-semibold text-slate-600">Nenhuma categoria cadastrada</p>
              <p className="mt-1 text-xs text-slate-400">Crie categorias para organizar despesas e relatorios.</p>
              <div className="mt-4">
                <Button icon={<Plus size={15} />} onClick={() => setDialog({ open: true })}>
                  Criar categoria
                </Button>
              </div>
            </div>
          )}
        </div>

        <CategoriaDialog
          open={dialog.open}
          cat={dialog.item}
          pais={roots}
          initialParentId={dialog.parentId}
          isSaving={saveMut.isPending}
          error={saveMut.error?.message}
          onClose={() => setDialog({ open: false })}
          onSave={(v) => saveMut.mutate({ v, id: dialog.item?.id })}
          onToggle={dialog.item ? () => toggleMut.mutate(dialog.item!.id) : undefined}
        />
      </div>
    </div>
  );
}
