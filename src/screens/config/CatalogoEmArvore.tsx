import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronDown, Tag, FolderTree } from 'lucide-react';
import type { CategoriaFormValues, OpcaoCatalogo } from '../../types/config';
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
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { GUIDE_LAYER_MODAL } from '../../context/FirstAccessGuideContext';
import { useConfirm } from '../../context/ConfirmContext';
import { compararNomesCatalogo } from '../../utils/categorySuggestions';

// Catálogo em árvore das configurações (raiz + um nível de subcategoria,
// desativar em vez de excluir). Usado pelas categorias de despesa e pelas
// classificações de receita: muda só o serviço, a cor e os textos.

export interface ItemCatalogo extends OpcaoCatalogo {
  /** Preenchido nos itens padrão do sistema. */
  tipo?: string | null;
  data_criacao?: string | null;
}

/** Textos no feminino ("categoria", "classificação"), como os rótulos derivados. */
export interface TextosCatalogo {
  singular: string;
  plural: string;
  exemploNome: string;
  descricaoVazio: string;
  /** Onde o item deixa de aparecer ao desativar: "nas opções de categoria ao lançar receitas e despesas". */
  ondeSomeAoDesativar: string;
  tituloPadrao: string;
}

interface Guia {
  chave: string;
  mensagem: string;
}

export interface GuiasCatalogo {
  nova: Guia;
  sub: Guia;
  desativar: Guia;
}

/**
 * Campos extras do modal (controlados) e selo na linha, para catálogos que
 * guardam mais que o nome — as classificações de receita (fixa). Sem extensão
 * o catálogo é só nome, como nas categorias.
 */
export interface ExtensaoCatalogo<T, E> {
  /**
   * Valor inicial dos campos ao abrir o modal; `item` ausente = item novo.
   * `temSubcategorias`: o item tem subcategorias ativas (é só o nome do grupo).
   */
  estadoInicial: (item?: T, temSubcategorias?: boolean) => E;
  campos: (props: { item?: T; valor: E; alterar: (proximo: E) => void; temSubcategorias: boolean }) => ReactNode;
  selo?: (item: T) => ReactNode;
}

// ─── Modal ───────────────────────────────────────────────────────────────────

function ItemDialog<T extends ItemCatalogo, E>({
  open, item, initialParentId, temSubcategorias, isSaving, error, textos, guiaDesativar, extensao, onClose, onSave, onToggle,
}: {
  open: boolean;
  item?: T;
  initialParentId?: number;
  temSubcategorias: boolean;
  isSaving: boolean;
  error?: string;
  textos: TextosCatalogo;
  guiaDesativar?: Guia;
  extensao?: ExtensaoCatalogo<T, E>;
  onClose: () => void;
  onSave: (v: CategoriaFormValues, extras?: E) => void;
  onToggle?: () => void;
}) {
  const [extras, setExtras] = useState<E | undefined>(() => extensao?.estadoInicial(item, temSubcategorias));
  // Reabrir o modal (ou trocar de item) recomeça dos valores do item.
  useEffect(() => {
    if (open) setExtras(extensao?.estadoInicial(item, temSubcategorias));
  }, [open, item?.id, initialParentId, temSubcategorias]); // eslint-disable-line react-hooks/exhaustive-deps

  const desativarGuide = useFirstAccessGuide(guiaDesativar?.chave ?? 'catalogo:sem-guia', {
    enabled: !!guiaDesativar && open && !!item && item.ativo,
    layer: GUIDE_LAYER_MODAL,
  });
  const confirm = useConfirm();

  const handleToggle = async () => {
    if (!onToggle || !item) return;
    const ok = await confirm({
      title: item.ativo ? `Desativar ${textos.singular}` : `Ativar ${textos.singular}`,
      message: item.ativo
        ? `Desativar "${item.nome}"? Ela deixará de aparecer ${textos.ondeSomeAoDesativar}.`
        : `Ativar "${item.nome}" novamente?`,
      confirmLabel: item.ativo ? 'Desativar' : 'Ativar',
      variant: item.ativo ? 'danger' : 'default',
    });
    if (ok) onToggle();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nome = String(fd.get('nome') ?? '').trim();
    onSave(item ? { nome } : { nome, parent_id: initialParentId ?? null }, extras);
  };

  const title = item
    ? `Editar ${textos.singular}`
    : initialParentId
      ? 'Nova subcategoria'
      : `Nova ${textos.singular}`;

  return (
    <Dialog open={open} title={title} onClose={onClose} size="md" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={handleSubmit}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={labelStyle}><span>Nome da {textos.singular}</span><span style={{ color: C.danger }}>*</span></label>
            <input
              key={`nome-${item?.id ?? initialParentId ?? 'new'}-${open}`}
              name="nome"
              defaultValue={item?.nome}
              placeholder={textos.exemploNome}
              autoFocus
              required
              style={fieldInputStyle}
            />
          </div>

          {extensao && extras !== undefined && extensao.campos({ item, valor: extras, alterar: setExtras, temSubcategorias })}

          {error && (
            <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        <div style={dialogFooterStyle}>
          {/* Ação destrutiva só na edição de registro existente. */}
          {item && onToggle && (
            <div className="relative">
              <button type="button" style={dangerButtonStyle} onClick={handleToggle}>
                {item.ativo ? 'Desativar' : 'Ativar'}
              </button>
              {item.ativo && guiaDesativar && desativarGuide.isVisible && (
                <FirstAccessGuideCard
                  floating
                  placement="bottom"
                  className="w-[min(24rem,calc(100vw-2rem))]"
                  icon={Tag}
                  description={guiaDesativar.mensagem}
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

// Larguras fixas das ações à direita: linha sem "Adicionar" ou sem o botão de
// subcategorias reserva o mesmo espaço, para a data ficar alinhada na lista.
const LARGURA_ADICIONAR = 'w-[80px]';
const LARGURA_SUBCATEGORIAS = 'w-[76px] sm:w-[140px]';

function ItemRow<T extends ItemCatalogo>({
  item, index, parentIndex, quantidadeSubs, expanded, destaque, tituloPadrao, selo, onToggleExpand, onEdit, onCreateSubcategory, subcategoryGuide,
}: {
  item: T;
  selo?: (item: T) => ReactNode;
  /** Índice hierárquico já formatado: "01" na raiz, "1.1" na subcategoria. */
  index: string;
  parentIndex?: string;
  quantidadeSubs: number;
  expanded?: boolean;
  destaque: string;
  tituloPadrao: string;
  onToggleExpand?: () => void;
  onEdit: (item: T) => void;
  onCreateSubcategory?: (item: T) => void;
  subcategoryGuide?: { description: string; onDismiss: () => void };
}) {
  const isChild = parentIndex !== undefined;
  const hasSubs = quantidadeSubs > 0;
  const dataCriado = item.data_criacao
    ? new Date(item.data_criacao).toLocaleDateString('pt-BR')
    : null;

  return (
    <div className="relative" style={{ marginLeft: isChild ? 22 : 0 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          minHeight: isChild ? 38 : 44, padding: '0 12px', borderRadius: 12,
          border: `1px solid ${CFG.border}`,
          background: isChild ? CFG.surfaceAlt : CFG.surface,
          boxShadow: CFG.shadowRow,
          transition: 'border-color .13s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = destaque; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = CFG.border; }}
      >
        <button
          type="button"
          onClick={() => onEdit(item)}
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
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.nome}</span>
            {item.tipo != null && (
              <span style={cfgBadgeStyle} title={tituloPadrao}>P</span>
            )}
            {selo?.(item)}
          </span>
          <span style={{ flex: 'none', fontSize: 11.5, fontWeight: 500, color: CFG.muted }}>
            {dataCriado ?? '—'}
          </span>
        </button>

        {/* Só a raiz cria subcategoria; stopPropagation evita abrir o modal dela. */}
        <span className={`flex flex-none justify-end ${LARGURA_ADICIONAR}`}>
          {!isChild && item.ativo && onCreateSubcategory && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCreateSubcategory(item); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
                fontSize: 11.5, fontWeight: 600, color: CFG.primaryDark,
              }}
            >
              <Plus size={11} strokeWidth={2.8} />
              Adicionar
            </button>
          )}
        </span>

        {/* Botão com texto (não só uma seta) para abrir as subcategorias: área de clique grande. */}
        <span className={`flex flex-none justify-end ${LARGURA_SUBCATEGORIAS}`}>
          {hasSubs && !isChild && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }}
              aria-expanded={expanded}
              className="transition-colors hover:bg-slate-100 dark:hover:bg-slate-700"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, height: 28, padding: '0 8px',
                border: `1px solid ${CFG.border}`, borderRadius: 8, background: 'transparent',
                cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 11.5, fontWeight: 600, color: CFG.textSoft,
              }}
            >
              <span className="hidden sm:inline">{quantidadeSubs} {quantidadeSubs === 1 ? 'subcategoria' : 'subcategorias'}</span>
              <span className="sm:hidden">{quantidadeSubs} sub</span>
              <ChevronDown
                size={13}
                strokeWidth={2.2}
                style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .13s ease' }}
              />
            </button>
          )}
        </span>
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

interface CatalogoEmArvoreProps<T extends ItemCatalogo, E> {
  queryKey: readonly unknown[];
  /** Prefixo invalidado ao salvar: todas as variantes por conta, não só a ativa. */
  invalidarPrefixo: readonly unknown[];
  carregar: () => Promise<T[]>;
  salvar: (values: CategoriaFormValues, id?: number, extras?: E) => Promise<unknown>;
  alternar: (id: number) => Promise<void>;
  /** Cor da borda ao passar o mouse na linha. */
  destaque: string;
  textos: TextosCatalogo;
  guias?: GuiasCatalogo;
  extensao?: ExtensaoCatalogo<T, E>;
}

export function CatalogoEmArvore<T extends ItemCatalogo, E = undefined>({
  queryKey, invalidarPrefixo, carregar, salvar, alternar, destaque, textos, guias, extensao,
}: CatalogoEmArvoreProps<T, E>) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: T; parentId?: number }>({ open: false });
  const [mostrarDesativadas, setMostrarDesativadas] = useState(false);
  // Itens iniciam colapsados: guarda quem foi expandido (não quem foi
  // fechado), já que a árvore só existe depois do fetch e o default precisa
  // ser "fechado" sem depender de um efeito para popular os ids das raízes.
  const [expanded, setExpanded] = useState<number[]>([]);

  const guideNova = useFirstAccessGuide(guias?.nova.chave ?? 'catalogo:sem-guia', { enabled: !!guias });
  const guideSub = useFirstAccessGuide(guias?.sub.chave ?? 'catalogo:sem-guia', { enabled: !!guias });

  const itensQ = useQuery({ queryKey, queryFn: carregar });
  const todos = itensQ.data ?? [];

  // O backend devolve ativos e inativos; o filtro é aplicado aqui. Uma raiz
  // aparece se ela própria bate com o filtro, e suas subcategorias são
  // filtradas pelo mesmo critério.
  const visiveis = todos.filter((c) => (mostrarDesativadas ? !c.ativo : c.ativo));
  // Ordem A→Z com "Outros" no fim, em cada nível.
  const porNome = (a: T, b: T) => compararNomesCatalogo(a.nome, b.nome);
  const tree = visiveis
    .filter((c) => !c.parent_id)
    .sort(porNome)
    .map((root) => ({ root, subs: visiveis.filter((c) => c.parent_id === root.id).sort(porNome) }));
  const totalSubs = tree.reduce((n, r) => n + r.subs.length, 0);

  const saveMut = useMutation({
    mutationFn: async ({ v, id, extras }: { v: CategoriaFormValues; id?: number; extras?: E }) => salvar(v, id, extras),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invalidarPrefixo });
      setDialog({ open: false });
    },
  });

  const toggleMut = useMutation({
    mutationFn: alternar,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: invalidarPrefixo });
      setDialog({ open: false });
    },
  });

  const toggleExpand = (id: number) =>
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const estado = mostrarDesativadas ? 'desativada' : 'ativa';
  const quantidade = tree.length;
  const contagem = `${quantidade} ${quantidade === 1 ? textos.singular : textos.plural} ${estado}${quantidade === 1 ? '' : 's'}`;

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
        actionLabel={`Nova ${textos.singular}`}
        onAction={() => setDialog({ open: true })}
      >
        {guias && guideNova.isVisible && (
          <FirstAccessGuideCard
            floating
            placement="top"
            align="right"
            className="w-[min(25rem,calc(100vw-2rem))]"
            icon={Tag}
            description={guias.nova.mensagem}
            onDismiss={guideNova.dismiss}
            onSilenceAll={guideNova.silenceAll}
          />
        )}
      </ConfigTabHeader>

      {itensQ.isLoading && (
        <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>Carregando...</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {tree.map(({ root, subs }, i) => {
          const rootIndex = String(i + 1).padStart(2, '0');
          const isExpanded = expanded.includes(root.id);
          return (
            <div key={root.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <ItemRow
                item={root}
                index={rootIndex}
                quantidadeSubs={subs.length}
                expanded={isExpanded}
                destaque={destaque}
                tituloPadrao={textos.tituloPadrao}
                selo={extensao?.selo}
                onToggleExpand={() => toggleExpand(root.id)}
                onEdit={(item) => setDialog({ open: true, item })}
                onCreateSubcategory={(item) => setDialog({ open: true, parentId: item.id })}
                subcategoryGuide={guias && i === 0 && guideSub.isVisible
                  ? { description: guias.sub.mensagem, onDismiss: guideSub.dismiss }
                  : undefined}
              />
              {isExpanded && subs.map((sub, j) => (
                <ItemRow
                  key={sub.id}
                  item={sub}
                  index={`${i + 1}.${j + 1}`}
                  parentIndex={rootIndex}
                  quantidadeSubs={0}
                  destaque={destaque}
                  tituloPadrao={textos.tituloPadrao}
                  selo={extensao?.selo}
                  onEdit={(item) => setDialog({ open: true, item })}
                />
              ))}
            </div>
          );
        })}

        {tree.length === 0 && !itensQ.isLoading && (
          <EmptyState
            icon={Tag}
            title={mostrarDesativadas ? `Nenhuma ${textos.singular} desativada` : `Nenhuma ${textos.singular} cadastrada`}
            description={mostrarDesativadas ? undefined : textos.descricaoVazio}
          />
        )}
      </div>

      <ItemDialog
        open={dialog.open}
        item={dialog.item}
        initialParentId={dialog.parentId}
        temSubcategorias={!!dialog.item && todos.some((c) => c.parent_id === dialog.item!.id && c.ativo)}
        isSaving={saveMut.isPending}
        error={saveMut.error?.message}
        textos={textos}
        guiaDesativar={guias?.desativar}
        extensao={extensao}
        onClose={() => setDialog({ open: false })}
        onSave={(v, extras) => saveMut.mutate({ v, id: dialog.item?.id, extras })}
        onToggle={dialog.item ? () => toggleMut.mutate(dialog.item!.id) : undefined}
      />
    </div>
  );
}
