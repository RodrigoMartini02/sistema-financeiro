import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronRight, Tag, FolderTree } from 'lucide-react';
import { fetchCategorias, saveCategoria, toggleCategoria } from '../../services/configService';
import { queryKeys } from '../../services/queryKeys';
import type { Categoria, CategoriaFormValues } from '../../types/config';
import { Dialog } from '../../ui/dialog';
import {
  C, labelStyle, fieldInputStyle, saveButtonStyle, saveButtonDisabledStyle,
  dangerButtonStyle, dialogFooterStyle,
} from '../../ui/dialogFormTokens';
import { CFG, CFG_MONO_CLASS, cfgBadgeStyle, cfgRowIndexStyle } from '../../ui/configTokens';
import { ConfigTabHeader } from '../../ui/ConfigTabHeader';
import { ConfigSwitch } from '../../ui/ConfigSwitch';
import { EmptyState } from '../../ui/EmptyState';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { GUIDE_LAYER_MODAL } from '../../context/FirstAccessGuideContext';
import { useConfirm } from '../../context/ConfirmContext';

const ACCENT = '#dc2626'; // categorias representam despesas

// ─── Modal ───────────────────────────────────────────────────────────────────

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
    onSave(cat ? { nome } : { nome, parent_id: initialParentId ?? null });
  };

  const title = cat
    ? 'Editar categoria'
    : initialParentId
      ? 'Nova subcategoria'
      : 'Nova categoria';

  return (
    <Dialog open={open} title={title} onClose={onClose} size="xs" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={handleSubmit}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}><span>Nome da categoria</span><span style={{ color: C.danger }}>*</span></label>
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

          {error && (
            <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        <div style={dialogFooterStyle}>
          {/* Ação destrutiva só na edição de registro existente. */}
          {cat && onToggle && (
            <div className="relative">
              <button type="button" style={dangerButtonStyle} onClick={handleToggle}>
                {cat.ativo ? 'Desativar' : 'Ativar'}
              </button>
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
            <button type="submit" disabled={isSaving} style={isSaving ? saveButtonDisabledStyle : saveButtonStyle}>
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

// ─── Linha ───────────────────────────────────────────────────────────────────

function CategoriaRow({
  cat, index, parentIndex, expanded, onToggleExpand, onEdit, onCreateSubcategory, subcategoryGuide,
}: {
  cat: Categoria;
  /** Índice hierárquico já formatado: "01" na raiz, "1.1" na subcategoria. */
  index: string;
  parentIndex?: string;
  expanded?: boolean;
  onToggleExpand?: () => void;
  onEdit: (cat: Categoria) => void;
  onCreateSubcategory?: (cat: Categoria) => void;
  subcategoryGuide?: { description: string; onDismiss: () => void };
}) {
  const isChild = parentIndex !== undefined;
  const hasSubs = (cat.subcategorias?.length ?? 0) > 0;
  const dataCriado = cat.data_criacao
    ? new Date(cat.data_criacao).toLocaleDateString('pt-BR')
    : null;

  return (
    <div className="relative" style={{ marginLeft: isChild ? 22 : 0 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          minHeight: isChild ? 34 : 38, padding: '0 12px', borderRadius: 12,
          border: `1px solid ${CFG.border}`,
          background: isChild ? CFG.surfaceAlt : CFG.surface,
          boxShadow: CFG.shadowRow,
          transition: 'border-color .13s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = ACCENT; }}
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
          <span className={CFG_MONO_CLASS} style={cfgRowIndexStyle}>{index}</span>
          <span
            style={{
              minWidth: 0, flex: 1, display: 'flex', alignItems: 'center', gap: 6,
              fontSize: isChild ? 12.5 : 13, fontWeight: isChild ? 500 : 600,
              color: isChild ? CFG.textSoft : CFG.text,
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

        {/* Só a raiz cria subcategoria; stopPropagation evita abrir o modal dela. */}
        {!isChild && cat.ativo && onCreateSubcategory && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCreateSubcategory(cat); }}
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
            onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }}
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
          <ChevronRight size={13} strokeWidth={2.2} style={{ flex: 'none', color: '#94a3b8' }} />
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
  );
}

// ─── Tela ────────────────────────────────────────────────────────────────────

export function CategoriasTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Categoria; parentId?: number }>({ open: false });
  const [mostrarDesativadas, setMostrarDesativadas] = useState(false);
  const [collapsed, setCollapsed] = useState<number[]>([]);

  const guideNovaCategoria = useFirstAccessGuide('categorias:nova-v1');
  const guideSubcategoria = useFirstAccessGuide('categorias:sub-v1');

  const cats = useQuery({ queryKey: queryKeys.categorias, queryFn: fetchCategorias });
  const allCats = cats.data ?? [];

  // O backend devolve ativas e inativas; o filtro é aplicado aqui. Uma raiz
  // aparece se ela própria bate com o filtro, e suas subcategorias são
  // filtradas pelo mesmo critério.
  const visiveis = allCats.filter((c) => (mostrarDesativadas ? !c.ativo : c.ativo));
  const roots = visiveis.filter((c) => !c.parent_id);
  const tree: Categoria[] = roots.map((root) => ({
    ...root,
    subcategorias: visiveis.filter((c) => c.parent_id === root.id),
  }));
  const totalSubs = tree.reduce((n, r) => n + (r.subcategorias?.length ?? 0), 0);

  const saveMut = useMutation({
    mutationFn: async ({ v, id }: { v: CategoriaFormValues; id?: number }) => saveCategoria(v, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categorias });
      setDialog({ open: false });
    },
  });

  const toggleMut = useMutation({
    mutationFn: toggleCategoria,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categorias });
      setDialog({ open: false });
    },
  });

  const toggleExpand = (id: number) =>
    setCollapsed((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const estado = mostrarDesativadas ? 'desativada' : 'ativa';
  const contagem = `${roots.length} categoria${roots.length === 1 ? '' : 's'} ${estado}${roots.length === 1 ? '' : 's'}`;

  return (
    <div className="grid gap-2.5">
      <ConfigTabHeader
        filters={
          <ConfigSwitch
            checked={mostrarDesativadas}
            onChange={setMostrarDesativadas}
            label={totalSubs > 0 ? `${contagem} · ${totalSubs} sub` : contagem}
          />
        }
        actionLabel="Nova categoria"
        onAction={() => setDialog({ open: true })}
      >
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
      </ConfigTabHeader>

      {cats.isLoading && (
        <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>Carregando...</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {tree.map((root, i) => {
          const rootIndex = String(i + 1).padStart(2, '0');
          const expanded = !collapsed.includes(root.id);
          return (
            <div key={root.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <CategoriaRow
                cat={root}
                index={rootIndex}
                expanded={expanded}
                onToggleExpand={() => toggleExpand(root.id)}
                onEdit={(item) => setDialog({ open: true, item })}
                onCreateSubcategory={(item) => setDialog({ open: true, parentId: item.id })}
                subcategoryGuide={i === 0 && guideSubcategoria.isVisible
                  ? { description: firstAccessGuideMessages.categoriasSub, onDismiss: guideSubcategoria.dismiss }
                  : undefined}
              />
              {expanded && root.subcategorias?.map((sub, j) => (
                <CategoriaRow
                  key={sub.id}
                  cat={sub}
                  index={`${i + 1}.${j + 1}`}
                  parentIndex={rootIndex}
                  onEdit={(item) => setDialog({ open: true, item })}
                />
              ))}
            </div>
          );
        })}

        {tree.length === 0 && !cats.isLoading && (
          <EmptyState
            icon={Tag}
            title={mostrarDesativadas ? 'Nenhuma categoria desativada' : 'Nenhuma categoria cadastrada'}
            description={mostrarDesativadas ? undefined : 'Crie categorias para organizar despesas e relatórios.'}
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
