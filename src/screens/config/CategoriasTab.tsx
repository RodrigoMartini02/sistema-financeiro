import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronDown, ChevronRight, Tag, FolderTree } from 'lucide-react';
import { fetchCategorias, saveCategoria, toggleCategoria } from '../../services/configService';
import { queryKeys } from '../../services/queryKeys';
import type { Categoria, CategoriaFormValues } from '../../types/config';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, cardStyle } from '../../ui/dialogFormTokens';
import {
  CFG, CFG_MONO_CLASS, cfgBadgeStyle, cfgPrimaryButtonStyle, cfgRowIndexStyle,
} from '../../ui/configTokens';
import { EmptyState } from '../../ui/EmptyState';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { GUIDE_LAYER_MODAL } from '../../context/FirstAccessGuideContext';
import { useConfirm } from '../../context/ConfirmContext';

const CAT_SCHEME = {
  red: { accent: '#dc2626' },
  brand: { accent: CFG.primary },
};

function CategoriaDialog({
  open, cat, initialParentId, isSaving, error, onClose, onSave, onToggle,
}: {
  open: boolean;
  cat?: Categoria;
  initialParentId?: number;
  isSaving: boolean;
  error?: string;
  onClose: () => void;
  onSave: (v: CategoriaFormValues) => void;
  onToggle?: () => void;
}) {
  const desativarGuide = useFirstAccessGuide('categorias:desativar-v1', {
    enabled: open && !!cat && cat.ativo,
    layer: GUIDE_LAYER_MODAL,
  });
  const confirm = useConfirm();

  const handleToggle = async () => {
    if (!onToggle || !cat) return;
    const ok = await confirm({
      title: cat.ativo ? 'Desativar categoria' : 'Ativar categoria',
      message: cat.ativo
        ? `Desativar "${cat.nome}"? Ela deixará de aparecer nas opções de categoria ao lançar receitas e despesas.`
        : `Ativar "${cat.nome}" novamente?`,
      confirmLabel: cat.ativo ? 'Desativar' : 'Ativar',
      variant: cat.ativo ? 'danger' : 'default',
    });
    if (ok) onToggle();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nome = String(fd.get('nome') ?? '').trim();

    onSave(cat
      ? { nome }
      : { nome, parent_id: initialParentId ?? null });
  };

  const title = cat
    ? 'Editar categoria'
    : initialParentId
      ? 'Nova subcategoria'
      : 'Nova categoria';

  return (
    <Dialog open={open} title={title} onClose={onClose} scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 -26px' }} onSubmit={handleSubmit}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}><span>NOME DA CATEGORIA</span><span style={{ color: C.primary }}>*</span></label>
              <input
                key={`nome-${cat?.id ?? initialParentId ?? 'new'}-${open}`}
                name="nome"
                defaultValue={cat?.nome}
                placeholder="Ex: Alimentação"
                autoFocus
                required
                style={fieldInputStyle}
              />
            </div>
          </div>

          {error && (
            <div style={{ margin: '0 26px 14px', borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '10px 14px', fontSize: 13, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ flex: 'none', borderTop: '1px solid #eef3f6', background: '#fafcfd', padding: '14px 26px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          {cat && onToggle && (
            <div className="relative">
              <Button type="button" variant={cat.ativo ? 'danger' : 'ghost'} onClick={handleToggle}>
                {cat.ativo ? 'Desativar' : 'Ativar'}
              </Button>
              {cat.ativo && desativarGuide.isVisible && (
                <FirstAccessGuideCard
                  floating
                  placement="bottom"
                  className="w-[min(24rem,calc(100vw-2rem))]"
                  icon={Tag}
                  description={firstAccessGuideMessages.categoriasDesativar}
                  onDismiss={desativarGuide.dismiss}
                  onSilenceAll={desativarGuide.silenceAll}
                />
              )}
            </div>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <button
              type="submit"
              disabled={isSaving}
              style={{
                padding: '12px 22px', borderRadius: 11, fontSize: 14, fontWeight: 700,
                border: 'none', transition: 'all .15s ease', cursor: isSaving ? 'not-allowed' : 'pointer',
                ...(isSaving
                  ? { background: '#e6edf1', color: '#a3b6c0', boxShadow: 'none' }
                  : { background: C.primary, color: '#fff', boxShadow: '0 6px 16px -6px rgba(8,145,178,0.75)' }),
              }}
            >
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

function CategoriaRow({
  cat, index, isChild, colorScheme = 'brand', onEdit, onCreateSubcategory, subcategoryGuide,
}: {
  cat: Categoria;
  index: number;
  isChild?: boolean;
  colorScheme?: 'red' | 'brand';
  onEdit: (cat: Categoria) => void;
  onCreateSubcategory?: (cat: Categoria) => void;
  subcategoryGuide?: { description: string; onDismiss: () => void };
}) {
  const [expanded, setExpanded] = useState(true);
  const hasSubs = (cat.subcategorias?.length ?? 0) > 0;
  const s = CAT_SCHEME[colorScheme];
  const dataCriado = cat.data_criacao
    ? new Date(cat.data_criacao).toLocaleDateString('pt-BR')
    : null;

  return (
    <>
      <div
        className="relative"
        style={{ marginLeft: isChild ? 22 : 0, opacity: cat.ativo ? 1 : 0.5 }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            minHeight: isChild ? 34 : 38, padding: '0 10px', borderRadius: 12,
            border: `1px solid ${CFG.border}`,
            background: isChild ? CFG.surfaceAlt : CFG.surface,
            boxShadow: CFG.shadowRow,
            transition: 'border-color .13s ease, background .13s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = s.accent; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = CFG.border; }}
        >
          <button
            type="button"
            onClick={() => onEdit(cat)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1,
              border: 'none', background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer',
            }}
          >
            <span className={CFG_MONO_CLASS} style={cfgRowIndexStyle}>
              {String(index + 1).padStart(2, '0')}
            </span>
            <span
              style={{
                minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 6,
                fontSize: isChild ? 12.5 : 13, fontWeight: isChild ? 500 : 600,
                color: isChild ? CFG.textSoft : CFG.text,
                textDecoration: cat.ativo ? 'none' : 'line-through',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.nome}</span>
              {hasSubs && !isChild && (
                <span style={cfgBadgeStyle}>{cat.subcategorias!.length} sub</span>
              )}
            </span>
            <span style={{ flex: 'none', fontSize: 11.5, fontWeight: 500, color: CFG.muted }}>
              {dataCriado ?? '—'}
            </span>
          </button>

          {!isChild && cat.ativo && onCreateSubcategory && (
            <button
              type="button"
              onClick={() => onCreateSubcategory(cat)}
              style={{
                flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
                fontSize: 11.5, fontWeight: 600, color: CFG.primaryDark,
              }}
            >
              <Plus size={11} strokeWidth={2.8} />
              <span className="hidden sm:inline">Subcategoria</span>
              <span className="sm:hidden">Sub</span>
            </button>
          )}

          {hasSubs && !isChild ? (
            <button
              type="button"
              onClick={() => setExpanded((o) => !o)}
              aria-label={expanded ? 'Recolher subcategorias' : 'Expandir subcategorias'}
              style={{
                flex: 'none', display: 'grid', placeItems: 'center', width: 16, height: 16,
                border: 'none', background: 'transparent', borderRadius: 8,
                color: CFG.faint, cursor: 'pointer',
              }}
            >
              {expanded ? <ChevronDown size={13} strokeWidth={2.2} /> : <ChevronRight size={13} strokeWidth={2.2} />}
            </button>
          ) : (
            <ChevronRight size={13} strokeWidth={2.2} style={{ flex: 'none', color: CFG.muted }} />
          )}
        </div>

        {subcategoryGuide && (
          <FirstAccessGuideCard
            floating
            placement="top"
            align="right"
            className="w-[min(22rem,calc(100vw-2rem))]"
            icon={FolderTree}
            description={subcategoryGuide.description}
            onDismiss={subcategoryGuide.onDismiss}
          />
        )}
      </div>

      {!isChild && hasSubs && expanded && (
        <div className="mt-1.5 grid gap-1.5">
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
  const guideNovaCategoria = useFirstAccessGuide('categorias:nova-v1');
  const guideSubcategoria = useFirstAccessGuide('categorias:sub-v1');
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
    <div className="grid gap-2.5">
      <div className="flex items-center gap-2.5">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: '#b91c1c' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#dc2626' }} />
          Despesas
        </span>
        <span style={{ fontSize: 11.5, fontWeight: 500, color: CFG.muted }}>
          {roots.length} raiz{allCats.length > roots.length ? ` · ${allCats.length - roots.length} sub` : ''}
        </span>
        <div style={{ flex: 1 }} />
        <div className="relative">
          <button type="button" style={cfgPrimaryButtonStyle} onClick={() => setDialog({ open: true })}>
            <Plus size={12} strokeWidth={2.6} />
            Nova categoria
          </button>

          {guideNovaCategoria.isVisible && (
            <FirstAccessGuideCard
              floating
              placement="top"
              align="right"
              className="w-[min(25rem,calc(100vw-2rem))]"
              icon={Tag}
              description={firstAccessGuideMessages.categoriasNova}
              onDismiss={guideNovaCategoria.dismiss}
              onSilenceAll={guideNovaCategoria.silenceAll}
            />
          )}
        </div>
      </div>

      {cats.isLoading && (
        <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>Carregando...</p>
      )}

      <div className="grid gap-1.5">
        {tree.map((c, i) => (
          <CategoriaRow
            key={c.id}
            cat={c}
            index={i}
            colorScheme="red"
            onEdit={(item) => setDialog({ open: true, item })}
            onCreateSubcategory={(item) => setDialog({ open: true, parentId: item.id })}
            subcategoryGuide={i === 0 && guideSubcategoria.isVisible
              ? { description: firstAccessGuideMessages.categoriasSub, onDismiss: guideSubcategoria.dismiss }
              : undefined}
          />
        ))}
        {tree.length === 0 && !cats.isLoading && (
          <EmptyState
            icon={Tag}
            title="Nenhuma categoria cadastrada"
            description="Crie categorias para organizar despesas e relatórios."
            action={
              <Button size="sm" icon={<Plus size={14} />} onClick={() => setDialog({ open: true })}>
                Criar categoria
              </Button>
            }
          />
        )}
      </div>

      <CategoriaDialog
        open={dialog.open}
        cat={dialog.item}
        initialParentId={dialog.parentId}
        isSaving={saveMut.isPending}
        error={saveMut.error?.message}
        onClose={() => setDialog({ open: false })}
        onSave={(v) => saveMut.mutate({ v, id: dialog.item?.id })}
        onToggle={dialog.item ? () => toggleMut.mutate(dialog.item!.id) : undefined}
      />
    </div>
  );
}
