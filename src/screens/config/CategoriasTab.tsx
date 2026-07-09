import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { fetchCategorias, saveCategoria, deleteCategoria, toggleCategoria, setCategoriaFavorito, fetchCartoes } from '../../services/configService';
import { fetchIncomeTypes, saveIncomeType, deleteIncomeType, toggleIncomeType, type IncomeType } from '../../services/incomeTypesService';
import { queryKeys } from '../../services/queryKeys';
import type { Categoria, CategoriaFormValues } from '../../types/config';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { Field, Input, Select, SectionDivider, ToggleGroup } from '../../ui/form';
import { ConfigListRow } from '../../ui/ConfigListRow';

const FORMAS_OPTIONS = [
  { value: '',         label: '—' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix',      label: 'PIX' },
  { value: 'debito',   label: 'Débito' },
  { value: 'credito',  label: 'Crédito' },
  { value: 'boleto',   label: 'Boleto' },
  { value: 'ted',      label: 'TED' },
];

const COR_OPCOES = [
  { value: '#6366f1', label: 'Índigo' },
  { value: '#10b981', label: 'Verde' },
  { value: '#f59e0b', label: 'Âmbar' },
  { value: '#ef4444', label: 'Vermelho' },
  { value: '#8b5cf6', label: 'Violeta' },
  { value: '#06b6d4', label: 'Ciano' },
  { value: '#f97316', label: 'Laranja' },
  { value: '#84cc16', label: 'Lima' },
  { value: '#ec4899', label: 'Rosa' },
  { value: '#14b8a6', label: 'Teal' },
];

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

const TIPO_DESPESA_OPTIONS = [
  { value: 'opex', label: 'Operacional (OPEX)', description: 'Custos do dia a dia da operação' },
  { value: 'capex', label: 'Capital (CAPEX)', description: 'Investimentos em ativos' },
];

function CategoriaDialog({
  open, cat, pais, isSaving, error, onClose, onSave, onDelete, onToggle,
}: {
  open: boolean; cat?: Categoria; pais: Categoria[]; isSaving: boolean; error?: string;
  onClose: () => void;
  onSave: (v: CategoriaFormValues & { forma_favorita?: string; cartao_favorito_id?: number | null }) => void;
  onDelete?: () => void;
  onToggle?: () => void;
}) {
  const [cor, setCor] = useState(cat?.cor ?? COR_OPCOES[0].value);
  const [formaFav, setFormaFav] = useState(cat?.forma_favorita ?? '');
  const [tipoDespesa, setTipoDespesa] = useState<'opex' | 'capex'>(cat?.tipo_despesa ?? 'opex');
  const [parentIdSelecionado, setParentIdSelecionado] = useState<string>(cat?.parent_id ? String(cat.parent_id) : '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cartoes = useQuery({ queryKey: queryKeys.cartoes, queryFn: fetchCartoes });

  useEffect(() => {
    if (!open) { setConfirmDelete(false); return; }
    setTipoDespesa(cat?.tipo_despesa ?? 'opex');
    setParentIdSelecionado(cat?.parent_id ? String(cat.parent_id) : '');
  }, [open, cat]);

  const isRaiz = !parentIdSelecionado;

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const cartaoId = fd.get('cartao_favorito_id') ? Number(fd.get('cartao_favorito_id')) : null;
    const parentId = fd.get('parent_id') ? Number(fd.get('parent_id')) : null;
    onSave({
      nome: fd.get('nome') as string,
      cor,
      parent_id: parentId,
      forma_favorita: formaFav || undefined,
      cartao_favorito_id: cartaoId ?? undefined,
      tipo_despesa: isRaiz ? tipoDespesa : undefined,
    });
  };

  return (
    <Dialog open={open} title={cat ? 'Editar categoria' : 'Nova categoria'} onClose={onClose}>
      <form className="grid gap-5" onSubmit={handleSubmit}>
        <Field label="Nome da categoria">
          <Input name="nome" defaultValue={cat?.nome} placeholder="Ex: Alimentação" autoFocus required />
        </Field>

        <Field label="Categoria pai" hint="Opcional — deixe em branco para categoria raiz">
          <Select
            name="parent_id"
            defaultValue={cat?.parent_id ?? ''}
            onChange={(e) => setParentIdSelecionado(e.target.value)}
          >
            <option value="">Sem categoria pai (raiz)</option>
            {pais
              .filter((p) => p.id !== cat?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
          </Select>
        </Field>

        {isRaiz && (
          <>
            <SectionDivider label="Classificação" />
            <div className="grid grid-cols-2 gap-3">
              {TIPO_DESPESA_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTipoDespesa(opt.value as 'opex' | 'capex')}
                  className={[
                    'flex flex-col gap-0.5 rounded-xl border-2 px-4 py-3 text-left transition',
                    tipoDespesa === opt.value
                      ? 'border-brand-500 bg-brand-50 text-brand-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <span className="text-sm font-semibold">{opt.label}</span>
                  <span className={['text-xs', tipoDespesa === opt.value ? 'text-brand-600' : 'text-slate-400'].join(' ')}>
                    {opt.description}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <SectionDivider label="Cor" />

        <div className="flex flex-wrap gap-2.5">
          {COR_OPCOES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCor(c.value)}
              title={c.label}
              className={[
                'h-8 w-8 rounded-full transition-all',
                cor === c.value ? 'ring-2 ring-offset-2 ring-brand-600 scale-110' : 'hover:scale-105',
              ].join(' ')}
              style={{ background: c.value }}
            />
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
          <span className="h-3 w-3 rounded-full" style={{ background: cor }} />
          <span className="text-sm font-medium text-slate-700">Prévia da categoria</span>
        </div>

        <SectionDivider label="Padrões de pagamento" />

        <Field label="Forma favorita" hint="Padrão ao registrar despesa nesta categoria">
          <ToggleGroup value={formaFav} options={FORMAS_OPTIONS} onChange={setFormaFav} />
        </Field>

        <Field label="Cartão favorito" hint="Opcional">
          <Select name="cartao_favorito_id" defaultValue={cat?.cartao_favorito_id ?? ''}>
            <option value="">Sem cartão padrão</option>
            {(cartoes.data ?? []).filter((c) => c.ativo).map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </Select>
        </Field>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="flex items-center gap-2">
          {cat && (
            <div className="flex items-center gap-2">
              {onToggle && (
                <Button type="button" variant="ghost" onClick={onToggle}>
                  {cat.ativo ? 'Desativar' : 'Ativar'}
                </Button>
              )}
              {onDelete && (
                !confirmDelete ? (
                  <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)}>Excluir</Button>
                ) : (
                  <>
                    <span className="text-sm text-slate-600">Confirmar?</span>
                    <Button type="button" variant="danger" onClick={() => { onDelete(); setConfirmDelete(false); }}>Sim</Button>
                    <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Não</Button>
                  </>
                )
              )}
            </div>
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
  cat, index, isChild, colorScheme = 'brand', onEdit,
}: {
  cat: Categoria;
  index: number;
  isChild?: boolean;
  colorScheme?: 'red' | 'brand';
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasSubs = (cat.subcategorias?.length ?? 0) > 0;
  const s = CAT_SCHEME[colorScheme];

  const accentColor = cat.cor ?? '#94a3b8';
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
        <button
          type="button"
          onClick={onEdit}
          className={`group flex w-full items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition hover:shadow-md ${s.cardHover}`}
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
              <p className="text-xs text-slate-400">{dataCriado ?? '—'}</p>
            </div>
          </div>

          {hasSubs && !isChild ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setExpanded((o) => !o); }}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
            >
              {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          ) : (
            <ChevronRight size={15} className={`shrink-0 text-slate-300 transition group-hover:translate-x-0.5 ${s.chevron}`} />
          )}
        </button>
      </div>

      {!isChild && hasSubs && expanded && (
        <div className="grid gap-2 mt-1">
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

// ── Tipos de Receita ─────────────────────────────────────────────────────────

function IncomeTypeDialog({
  open, item, isSaving, error, onClose, onSave, onDelete, onToggle,
}: {
  open: boolean; item?: IncomeType; isSaving: boolean; error?: string;
  onClose: () => void; onSave: (nome: string) => void;
  onDelete?: () => void;
  onToggle?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { if (!open) setConfirmDelete(false); }, [open]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const nome = (new FormData(e.currentTarget).get('nome') as string ?? '').trim();
    if (nome) onSave(nome);
  };

  return (
    <Dialog open={open} title={item ? 'Editar tipo de receita' : 'Novo tipo de receita'} onClose={onClose}>
      <form className="grid gap-5" onSubmit={handleSubmit}>
        <Field label="Nome do tipo">
          <Input name="nome" defaultValue={item?.nome} placeholder="Ex: Serviços, Produtos, Comissão..." autoFocus required maxLength={100} />
        </Field>
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}
        <div className="flex items-center gap-2">
          {item && (
            <div className="flex items-center gap-2">
              {onToggle && (
                <Button type="button" variant="ghost" onClick={onToggle}>
                  {item.ativo ? 'Desativar' : 'Ativar'}
                </Button>
              )}
              {onDelete && (
                !confirmDelete ? (
                  <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)}>Excluir</Button>
                ) : (
                  <>
                    <span className="text-sm text-slate-600">Confirmar?</span>
                    <Button type="button" variant="danger" onClick={() => { onDelete(); setConfirmDelete(false); }}>Sim</Button>
                    <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Não</Button>
                  </>
                )
              )}
            </div>
          )}
          <div className="ml-auto">
            <Button type="submit" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

function IncomeTypesPanel() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: IncomeType }>({ open: false });

  const typesQ = useQuery({ queryKey: queryKeys.incomeTypes, queryFn: fetchIncomeTypes });
  const types = typesQ.data ?? [];

  const saveMut = useMutation({
    mutationFn: ({ nome, id }: { nome: string; id?: number }) => saveIncomeType(nome, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.incomeTypes }); setDialog({ open: false }); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteIncomeType,
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.incomeTypes }); setDialog({ open: false }); },
  });

  const toggleMut = useMutation({
    mutationFn: toggleIncomeType,
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.incomeTypes }); setDialog({ open: false }); },
  });

  return (
    <div className="grid gap-4 content-start rounded-2xl border border-green-100 bg-white p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
          <h3 className="text-sm font-semibold text-green-700">Receitas</h3>
          <span className="text-xs text-slate-400">
            {types.length} tipo{types.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDialog({ open: true })}
          className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-green-700"
        >
          <Plus size={14} />
          Novo tipo
        </button>
      </div>

      {typesQ.isLoading && <p className="py-4 text-center text-sm text-slate-400">Carregando...</p>}

      <div className="grid gap-2">
        {types.map((t, i) => (
          <ConfigListRow
            key={t.id}
            index={i}
            nome={t.nome}
            dataCriacao={t.criado_em}
            dataAtualizacao={t.atualizado_em}
            colorScheme="green"
            onClick={() => setDialog({ open: true, item: t })}
          />
        ))}
        {types.length === 0 && !typesQ.isLoading && (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
            Nenhum tipo cadastrado. Crie tipos para usar no form de receitas e comissões.
          </p>
        )}
      </div>

      <IncomeTypeDialog
        open={dialog.open}
        item={dialog.item}
        isSaving={saveMut.isPending}
        error={saveMut.error?.message}
        onClose={() => setDialog({ open: false })}
        onSave={(nome) => saveMut.mutate({ nome, id: dialog.item?.id })}
        onDelete={dialog.item ? () => deleteMut.mutate(dialog.item!.id) : undefined}
        onToggle={dialog.item ? () => toggleMut.mutate(dialog.item!.id) : undefined}
      />
    </div>
  );
}

// ── Tab principal ─────────────────────────────────────────────────────────────

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
    mutationFn: async ({
      v, id,
    }: {
      v: CategoriaFormValues & { forma_favorita?: string; cartao_favorito_id?: number | null };
      id?: number;
    }) => {
      const saved = await saveCategoria(v, id);
      if (saved?.id && (v.forma_favorita !== undefined || v.cartao_favorito_id !== undefined)) {
        await setCategoriaFavorito(saved.id, v.forma_favorita ?? null, v.cartao_favorito_id ?? null);
      }
      return saved;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categorias });
      setDialog({ open: false });
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteCategoria,
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.categorias }); setDialog({ open: false }); },
  });

  const toggleMut = useMutation({
    mutationFn: toggleCategoria,
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.categorias }); setDialog({ open: false }); },
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Coluna Despesas */}
      <div className="grid gap-4 content-start rounded-2xl border border-red-100 bg-white p-5 shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <h3 className="text-sm font-semibold text-red-700">Despesas</h3>
            <span className="text-xs text-slate-400">
              {roots.length} raiz{allCats.length > roots.length ? ` · ${allCats.length - roots.length} sub` : ''}
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
              onEdit={() => setDialog({ open: true, item: c })}
            />
          ))}
          {tree.length === 0 && !cats.isLoading && (
            <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
              Nenhuma categoria cadastrada
            </p>
          )}
        </div>

        <CategoriaDialog
          open={dialog.open}
          cat={dialog.item}
          pais={roots}
          isSaving={saveMut.isPending}
          error={saveMut.error?.message}
          onClose={() => setDialog({ open: false })}
          onSave={(v) => {
            const values = {
              ...v,
              parent_id: dialog.parentId ?? v.parent_id,
            } as CategoriaFormValues & { forma_favorita?: string; cartao_favorito_id?: number | null };
            saveMut.mutate({ v: values, id: dialog.item?.id });
          }}
          onDelete={dialog.item ? () => deleteMut.mutate(dialog.item!.id) : undefined}
          onToggle={dialog.item ? () => toggleMut.mutate(dialog.item!.id) : undefined}
        />
      </div>

      {/* Coluna Receitas */}
      <IncomeTypesPanel />
    </div>
  );
}
