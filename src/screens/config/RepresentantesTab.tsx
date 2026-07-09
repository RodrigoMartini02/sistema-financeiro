import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Percent, Check } from 'lucide-react';
import {
  fetchRepresentantes, saveRepresentante, deleteRepresentante,
  type Representante, type RepresentanteFormValues, type Comissao,
} from '../../services/representantesService';
import { fetchIncomeTypes, saveIncomeType } from '../../services/incomeTypesService';
import { queryKeys } from '../../services/queryKeys';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { Field, Input, Select, SectionDivider } from '../../ui/form';
import { ConfigListRow } from '../../ui/ConfigListRow';

function ComissaoRow({
  comissao,
  tiposReceita,
  onChange,
  onRemove,
  onCreateType,
}: {
  comissao: Comissao;
  tiposReceita: string[];
  onChange: (c: Comissao) => void;
  onRemove: () => void;
  onCreateType: (name: string) => Promise<string>;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const created = await onCreateType(name);
      onChange({ ...comissao, tipo_receita: created });
      setCreating(false);
      setNewName('');
    } finally {
      setSaving(false);
    }
  };

  const cancelCreate = () => { setCreating(false); setNewName(''); };

  if (creating) {
    return (
      <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 grid gap-2">
        <p className="text-xs font-semibold text-brand-700 uppercase tracking-wide">Criar tipo de receita</p>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleCreate(); }
              if (e.key === 'Escape') cancelCreate();
            }}
            placeholder="Ex: Mensalidade, Consultoria..."
            className="flex-1 rounded-lg border border-brand-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving || !newName.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-40 transition"
          >
            <Check size={13} />
            {saving ? 'Salvando...' : 'Criar'}
          </button>
          <button
            type="button"
            onClick={cancelCreate}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 transition"
          >
            Cancelar
          </button>
        </div>
        <p className="text-xs text-brand-600">O tipo será salvo e selecionado automaticamente nesta linha.</p>
      </div>
    );
  }

  const tipoAtual = comissao.tipo ?? 'mensal';

  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 gap-1">
        <Select
          value={comissao.tipo_receita}
          onChange={(e) => onChange({ ...comissao, tipo_receita: e.target.value })}
        >
          {tiposReceita.length === 0 && (
            <option value={comissao.tipo_receita}>{comissao.tipo_receita || '—'}</option>
          )}
          {tiposReceita.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <button
          type="button"
          onClick={() => setCreating(true)}
          title="Criar novo tipo de receita"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 text-slate-400 hover:border-brand-400 hover:text-brand-600 transition"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="flex overflow-hidden rounded-lg border border-slate-200">
        <button
          type="button"
          onClick={() => onChange({ ...comissao, tipo: 'mensal' })}
          className={`px-2.5 py-1.5 text-xs font-medium transition ${tipoAtual === 'mensal' ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
        >
          Mensal
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...comissao, tipo: 'unica' })}
          className={`border-l border-slate-200 px-2.5 py-1.5 text-xs font-medium transition ${tipoAtual === 'unica' ? 'bg-brand-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
        >
          Única
        </button>
      </div>
      <div className="relative w-28">
        <input
          type="number"
          min="0.01"
          max="100"
          step="0.01"
          value={comissao.percentual}
          onChange={(e) => onChange({ ...comissao, percentual: parseFloat(e.target.value) || 0 })}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-7 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          placeholder="0,00"
        />
        <Percent size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 transition"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function RepresentanteDialog({
  open, rep, tiposReceita, isSaving, error, onClose, onSave, onDelete,
}: {
  open: boolean; rep?: Representante; tiposReceita: string[]; isSaving: boolean; error?: string;
  onClose: () => void; onSave: (v: RepresentanteFormValues) => void;
  onDelete?: () => void;
}) {
  const qc = useQueryClient();
  const defaultTipo = tiposReceita[0] ?? '';
  const [comissoes, setComissoes] = useState<Comissao[]>(
    rep?.comissoes?.length ? rep.comissoes : [{ tipo_receita: defaultTipo, percentual: 5, tipo: 'mensal' }]
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const createTypeMut = useMutation({
    mutationFn: (nome: string) => saveIncomeType(nome),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.incomeTypes }),
  });

  const handleCreateType = async (nome: string): Promise<string> => {
    const created = await createTypeMut.mutateAsync(nome);
    return created.nome;
  };

  useEffect(() => { if (!open) setConfirmDelete(false); }, [open]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onSave({
      nome: fd.get('nome') as string,
      email: (fd.get('email') as string) || undefined,
      telefone: (fd.get('telefone') as string) || undefined,
      comissoes: comissoes.filter((c) => c.tipo_receita && c.percentual > 0),
    });
  };

  const addComissao = () =>
    setComissoes((prev) => [...prev, { tipo_receita: defaultTipo, percentual: 5, tipo: 'mensal' }]);

  const updateComissao = (i: number, c: Comissao) =>
    setComissoes((prev) => prev.map((x, idx) => (idx === i ? c : x)));

  const removeComissao = (i: number) =>
    setComissoes((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <Dialog open={open} title={rep ? 'Editar representante' : 'Novo representante'} onClose={onClose} size="lg">
      <form className="grid gap-5" onSubmit={handleSubmit}>
        <Field label="Nome completo">
          <Input name="nome" defaultValue={rep?.nome} placeholder="Ex: João Silva" autoFocus required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-mail" hint="Opcional">
            <Input name="email" type="email" defaultValue={rep?.email ?? ''} placeholder="joao@email.com" />
          </Field>
          <Field label="Telefone" hint="Opcional">
            <Input name="telefone" defaultValue={rep?.telefone ?? ''} placeholder="(11) 99999-9999" />
          </Field>
        </div>

        <SectionDivider label="Comissões por tipo de receita" />

        {tiposReceita.length === 0 && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Nenhum tipo de receita cadastrado. Use o botão <strong>+</strong> ao lado do seletor para criar um.
          </p>
        )}

        <div className="grid gap-2">
          <div className="grid grid-cols-[1fr_auto_112px_32px] gap-2 px-0.5">
            <p className="text-xs font-semibold text-slate-500">Tipo de receita</p>
            <p className="text-xs font-semibold text-slate-500">Frequência</p>
            <p className="text-xs font-semibold text-slate-500">Percentual</p>
            <span />
          </div>
          {comissoes.map((c, i) => (
            <ComissaoRow
              key={i}
              comissao={c}
              tiposReceita={tiposReceita}
              onChange={(updated) => updateComissao(i, updated)}
              onRemove={() => removeComissao(i)}
              onCreateType={handleCreateType}
            />
          ))}
          <button
            type="button"
            onClick={addComissao}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-600 transition"
          >
            <Plus size={14} />
            Adicionar comissão
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        )}

        <div className="flex items-center gap-2">
          {rep && onDelete && (
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
          <div className="ml-auto">
            <Button type="submit" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

export function RepresentantesTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Representante }>({ open: false });

  const reps = useQuery({ queryKey: queryKeys.representantes, queryFn: fetchRepresentantes });
  const incomeTypesQ = useQuery({ queryKey: queryKeys.incomeTypes, queryFn: fetchIncomeTypes });
  const data = reps.data ?? [];
  const tiposReceita = (incomeTypesQ.data ?? []).filter((t) => t.ativo).map((t) => t.nome);

  const saveMut = useMutation({
    mutationFn: ({ v, id }: { v: RepresentanteFormValues; id?: number }) => saveRepresentante(v, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.representantes }); setDialog({ open: false }); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteRepresentante,
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.representantes }); setDialog({ open: false }); },
  });

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{data.length} representante{data.length !== 1 ? 's' : ''} cadastrado{data.length !== 1 ? 's' : ''}</p>
        <Button icon={<Plus size={16} />} onClick={() => setDialog({ open: true })}>
          Novo representante
        </Button>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Representantes recebem comissão automática calculada sobre receitas por tipo. Configure os percentuais por categoria.
      </div>

      {reps.isLoading && <p className="py-4 text-center text-sm text-slate-400">Carregando...</p>}

      <div className="grid gap-2">
        {data.map((r, i) => (
          <ConfigListRow
            key={r.id}
            index={i}
            nome={r.nome}
            dataCriacao={r.data_criacao}
            dataAtualizacao={r.data_atualizacao}
            onClick={() => setDialog({ open: true, item: r })}
          />
        ))}
        {data.length === 0 && !reps.isLoading && (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">Nenhum representante cadastrado</p>
        )}
      </div>

      <RepresentanteDialog
        open={dialog.open}
        rep={dialog.item}
        tiposReceita={tiposReceita}
        isSaving={saveMut.isPending}
        error={saveMut.error?.message}
        onClose={() => setDialog({ open: false })}
        onSave={(v) => saveMut.mutate({ v, id: dialog.item?.id })}
        onDelete={dialog.item ? () => deleteMut.mutate(dialog.item!.id) : undefined}
      />
    </div>
  );
}
