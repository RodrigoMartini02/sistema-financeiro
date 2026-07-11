import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Briefcase, User, ChevronDown, ChevronUp, Tag } from 'lucide-react';
import { fetchPerfis, savePerfil, deletePerfil } from '../../services/configService';
import { queryKeys } from '../../services/queryKeys';
import type { Perfil, Enquadramento } from '../../types/config';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { Field, Input, ToggleRow, SectionDivider } from '../../ui/form';
import { ConfigListRow } from '../../ui/ConfigListRow';

// ─── Category preview data (mirrors backend presets) ─────────────────────────

const PREVIEW_CATEGORIAS: Record<string, { nome: string; total: number }[]> = {
  MEI: [
    { nome: 'Fornecedores', total: 3 },
    { nome: 'Despesas Operacionais', total: 4 },
    { nome: 'Tributação MEI', total: 2 },
    { nome: 'Marketing', total: 3 },
    { nome: 'Equipamentos', total: 2 },
    { nome: 'Pró-labore e Retiradas', total: 0 },
    { nome: 'Transporte', total: 2 },
  ],
  ME: [
    { nome: 'Fornecedores', total: 4 },
    { nome: 'Despesas Operacionais', total: 5 },
    { nome: 'Folha de Pagamento', total: 7 },
    { nome: 'Tributos e Impostos', total: 5 },
    { nome: 'Contabilidade', total: 3 },
    { nome: 'Marketing e Vendas', total: 4 },
    { nome: 'Tecnologia', total: 4 },
    { nome: 'Viagens e Deslocamentos', total: 4 },
    { nome: 'Equipamentos', total: 3 },
    { nome: 'Pró-labore e Retiradas', total: 0 },
  ],
  EPP: [
    { nome: 'Fornecedores', total: 4 },
    { nome: 'Despesas Operacionais', total: 5 },
    { nome: 'Folha de Pagamento', total: 7 },
    { nome: 'Tributos e Impostos', total: 5 },
    { nome: 'Contabilidade', total: 3 },
    { nome: 'Marketing e Vendas', total: 4 },
    { nome: 'Tecnologia', total: 4 },
    { nome: 'Viagens e Deslocamentos', total: 4 },
    { nome: 'Equipamentos', total: 3 },
    { nome: 'Pró-labore e Retiradas', total: 0 },
  ],
  SLU: [
    { nome: 'Fornecedores', total: 4 },
    { nome: 'Despesas Operacionais', total: 5 },
    { nome: 'Folha de Pagamento', total: 7 },
    { nome: 'Tributos e Impostos', total: 5 },
    { nome: 'Contabilidade', total: 3 },
    { nome: 'Marketing e Vendas', total: 4 },
    { nome: 'Tecnologia', total: 4 },
    { nome: 'Viagens e Deslocamentos', total: 4 },
    { nome: 'Equipamentos', total: 3 },
    { nome: 'Pró-labore e Retiradas', total: 0 },
  ],
  EIRELI: [
    { nome: 'Fornecedores', total: 4 },
    { nome: 'Despesas Operacionais', total: 5 },
    { nome: 'Folha de Pagamento', total: 7 },
    { nome: 'Tributos e Impostos', total: 5 },
    { nome: 'Contabilidade', total: 3 },
    { nome: 'Marketing e Vendas', total: 4 },
    { nome: 'Tecnologia', total: 4 },
    { nome: 'Viagens e Deslocamentos', total: 4 },
    { nome: 'Equipamentos', total: 3 },
    { nome: 'Pró-labore e Retiradas', total: 0 },
  ],
  LTDA: [
    { nome: 'Fornecedores', total: 5 },
    { nome: 'Despesas Operacionais', total: 6 },
    { nome: 'Folha de Pagamento', total: 8 },
    { nome: 'Tributos e Impostos', total: 7 },
    { nome: 'Contabilidade', total: 4 },
    { nome: 'Marketing e Vendas', total: 5 },
    { nome: 'Tecnologia', total: 5 },
    { nome: 'Viagens e Deslocamentos', total: 5 },
    { nome: 'Equipamentos e Imobilizado', total: 4 },
    { nome: 'Financeiro e Bancário', total: 5 },
    { nome: 'Jurídico e Compliance', total: 4 },
    { nome: 'RH e Benefícios', total: 5 },
    { nome: 'Distribuição de Resultados', total: 2 },
    { nome: 'Pró-labore e Retiradas', total: 0 },
  ],
  SA: [
    { nome: 'Fornecedores', total: 5 },
    { nome: 'Despesas Operacionais', total: 6 },
    { nome: 'Folha de Pagamento', total: 8 },
    { nome: 'Tributos e Impostos', total: 7 },
    { nome: 'Contabilidade', total: 4 },
    { nome: 'Marketing e Vendas', total: 5 },
    { nome: 'Tecnologia', total: 5 },
    { nome: 'Viagens e Deslocamentos', total: 5 },
    { nome: 'Equipamentos e Imobilizado', total: 4 },
    { nome: 'Financeiro e Bancário', total: 5 },
    { nome: 'Jurídico e Compliance', total: 4 },
    { nome: 'RH e Benefícios', total: 5 },
    { nome: 'Distribuição de Resultados', total: 2 },
    { nome: 'Pró-labore e Retiradas', total: 0 },
  ],
};

const ENQUADRAMENTO_OPTIONS = [
  { value: 'MEI',    label: 'MEI',    description: 'Microempreendedor Individual' },
  { value: 'ME',     label: 'ME',     description: 'Microempresa' },
  { value: 'EPP',    label: 'EPP',    description: 'Empresa de Pequeno Porte' },
  { value: 'SLU',    label: 'SLU',    description: 'Sociedade Limitada Unipessoal' },
  { value: 'EIRELI', label: 'EIRELI', description: 'Empresa Individual de Resp. Limitada' },
  { value: 'LTDA',   label: 'LTDA',   description: 'Sociedade Limitada' },
  { value: 'SA',     label: 'SA',     description: 'Sociedade Anônima' },
];

const TIPO_OPTIONS = [
  { value: 'empresa', label: 'Empresa / CNPJ',  description: 'Pessoa jurídica com CNPJ' },
  { value: 'pessoal', label: 'Pessoa Física',    description: 'Finanças pessoais' },
];

const ENQUADRAMENTO_BADGE: Record<string, string> = {
  MEI:   'bg-green-100 text-green-700',
  ME:    'bg-blue-100 text-blue-700',
  EPP:   'bg-indigo-100 text-indigo-700',
  SLU:   'bg-violet-100 text-violet-700',
  EIRELI:'bg-purple-100 text-purple-700',
  LTDA:  'bg-amber-100 text-amber-700',
  SA:    'bg-orange-100 text-orange-700',
};

function CategoryPreview({ enquadramento }: { enquadramento: string }) {
  const [expanded, setExpanded] = useState(false);
  const cats = PREVIEW_CATEGORIAS[enquadramento];
  if (!cats) return null;

  const totalSubs = cats.reduce((s, c) => s + c.total, 0);
  const shown = expanded ? cats : cats.slice(0, 4);

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-emerald-800">
          {cats.length} categorias serão criadas automaticamente
        </p>
        <span className="rounded-full bg-emerald-200 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
          {totalSubs} subcategorias
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-1">
        {shown.map((c) => (
          <div key={c.nome} className="flex items-center gap-1.5 text-xs text-emerald-700">
            <Tag size={10} className="shrink-0 text-emerald-500" />
            <span className="truncate">{c.nome}</span>
            {c.total > 0 && (
              <span className="text-emerald-400">({c.total})</span>
            )}
          </div>
        ))}
      </div>
      {cats.length > 4 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-800"
        >
          {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {expanded ? 'Mostrar menos' : `Ver mais ${cats.length - 4} categorias`}
        </button>
      )}
    </div>
  );
}

// ─── Dialog ──────────────────────────────────────────────────────────────────

function PerfilDialog({
  open, perfil, isSaving, error, onClose, onSave, onDelete,
}: {
  open: boolean; perfil?: Perfil; isSaving: boolean; error?: string;
  onClose: () => void;
  onSave: (v: { tipo: 'pessoal' | 'empresa'; nome: string; documento?: string; razao_social?: string; nome_fantasia?: string; atividade?: string; enquadramento?: string; telefone?: string; data_nascimento?: string; email?: string }) => void;
  onDelete?: () => void;
}) {
  const [tipo, setTipo] = useState<'pessoal' | 'empresa'>(perfil?.tipo ?? 'empresa');
  const [enquadramento, setEnquadramento] = useState<string>(perfil?.enquadramento ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isNew = !perfil;

  useEffect(() => {
    if (!open) {
      setConfirmDelete(false);
      return;
    }
    setEnquadramento(perfil?.enquadramento ?? '');
  }, [open, perfil]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nomeFantasia = tipo === 'empresa' ? (fd.get('nome_fantasia') as string || '') : '';
    const razaoSocial = tipo === 'empresa' ? (fd.get('razao_social') as string || '') : '';
    onSave({
      tipo,
      nome: tipo === 'empresa' ? (nomeFantasia || razaoSocial || 'Empresa') : (fd.get('nome') as string),
      documento: fd.get('documento') as string || undefined,
      razao_social: tipo === 'empresa' ? (razaoSocial || undefined) : undefined,
      nome_fantasia: tipo === 'empresa' ? (nomeFantasia || undefined) : undefined,
      atividade: tipo === 'empresa' ? (fd.get('atividade') as string || undefined) : undefined,
      enquadramento: tipo === 'empresa' && enquadramento ? enquadramento : undefined,
      telefone: tipo === 'pessoal' ? (fd.get('telefone') as string || undefined) : undefined,
      data_nascimento: tipo === 'pessoal' ? (fd.get('data_nascimento') as string || undefined) : undefined,
      email: tipo === 'pessoal' ? (fd.get('email') as string || undefined) : undefined,
    });
  };

  return (
    <Dialog open={open} title={perfil ? 'Editar perfil' : 'Novo perfil'} onClose={onClose} size="lg">
      <form className="grid gap-5" onSubmit={handleSubmit}>
        {!perfil && (
          <Field label="Tipo de perfil">
            <div className="grid grid-cols-2 gap-3">
              {TIPO_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTipo(opt.value as 'pessoal' | 'empresa')}
                  className={[
                    'flex flex-col gap-1 rounded-xl border-2 px-4 py-3 text-left transition',
                    tipo === opt.value
                      ? 'border-brand-500 bg-brand-50 text-brand-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                  ].join(' ')}
                >
                  <span className="text-sm font-semibold">{opt.label}</span>
                  <span className={['text-xs', tipo === opt.value ? 'text-brand-600' : 'text-slate-400'].join(' ')}>{opt.description}</span>
                </button>
              ))}
            </div>
          </Field>
        )}

        {tipo === 'empresa' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Razão social" hint="Opcional">
              <Input name="razao_social" defaultValue={perfil?.razao_social ?? ''} placeholder="Ex: Empresa ABC Ltda." />
            </Field>
            <Field label="Nome fantasia">
              <Input name="nome_fantasia" defaultValue={perfil?.nome_fantasia ?? perfil?.nome ?? ''} placeholder="Ex: ABC Stores" autoFocus required />
            </Field>
          </div>
        )}

        {tipo === 'pessoal' && (
          <Field label="Nome do perfil">
            <Input name="nome" defaultValue={perfil?.nome} placeholder="Ex: Pessoal" autoFocus required />
          </Field>
        )}

        {tipo === 'empresa' && (
          <>
            <Field label="CNPJ" hint="14 dígitos sem pontuação">
              <Input name="documento" defaultValue={perfil?.documento ?? ''} placeholder="00000000000000" maxLength={18} required={!perfil} />
            </Field>

            <Field label="Enquadramento" hint={isNew ? 'Cria categorias de despesas automaticamente (opcional)' : 'Tipo jurídico da empresa'}>
              <div className="grid gap-2">
                {ENQUADRAMENTO_OPTIONS.map((opt) => (
                  <ToggleRow
                    key={opt.value}
                    label={opt.label}
                    description={opt.description}
                    checked={enquadramento === opt.value}
                    onChange={() => setEnquadramento((prev) => prev === opt.value ? '' : opt.value)}
                  />
                ))}
              </div>
            </Field>

            {isNew && enquadramento && (
              <CategoryPreview enquadramento={enquadramento} />
            )}

          </>
        )}

        {tipo === 'pessoal' && (
          <>
            <Field label="CPF" hint="Opcional">
              <Input name="documento" defaultValue={perfil?.documento ?? ''} placeholder="000.000.000-00" maxLength={14} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Telefone" hint="Opcional">
                <Input name="telefone" defaultValue={perfil?.telefone ?? ''} placeholder="(00) 00000-0000" maxLength={20} />
              </Field>
              <Field label="Data de nascimento" hint="Opcional">
                <Input name="data_nascimento" type="date" defaultValue={perfil?.data_nascimento?.slice(0, 10) ?? ''} />
              </Field>
            </div>
            <Field label="E-mail do perfil" hint="Opcional">
              <Input name="email" type="email" defaultValue={perfil?.email ?? ''} placeholder="contato@email.com" />
            </Field>
          </>
        )}

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="flex items-center gap-2">
          {perfil && onDelete && (
            !confirmDelete ? (
              <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)}>Arquivar</Button>
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

// ─── Tab ─────────────────────────────────────────────────────────────────────

export function PerfisTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Perfil }>({ open: false });
  const [mutError, setMutError] = useState('');

  const perfis = useQuery({ queryKey: queryKeys.perfis, queryFn: fetchPerfis });
  const data = perfis.data ?? [];

  const saveMut = useMutation({
    mutationFn: ({ v, id }: { v: Parameters<typeof savePerfil>[0]; id?: number }) => savePerfil(v, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.perfis }); setDialog({ open: false }); },
    onError: (e) => setMutError(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: deletePerfil,
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.perfis }); setDialog({ open: false }); },
  });

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {data.length} perfil/perfis ativo(s)
        </p>
        <Button icon={<Plus size={16} />} onClick={() => { setMutError(''); setDialog({ open: true }); }}>
          Novo perfil
        </Button>
      </div>

      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Os perfis separam os dados financeiros. Cada empresa ou perfil pessoal tem suas próprias receitas, despesas e reservas.
      </div>

      {perfis.isLoading && <p className="py-4 text-center text-sm text-slate-400">Carregando...</p>}

      <div className="grid gap-2">
        {data.map((p, i) => (
          <ConfigListRow
            key={p.id}
            index={i}
            nome={p.nome}
            dataCriacao={p.data_criacao}
            onClick={() => { setMutError(''); setDialog({ open: true, item: p }); }}
          />
        ))}
        {data.length === 0 && !perfis.isLoading && (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">Nenhum perfil adicional. Apenas o perfil padrão está ativo.</p>
        )}
      </div>

      <PerfilDialog
        open={dialog.open} perfil={dialog.item}
        isSaving={saveMut.isPending} error={mutError}
        onClose={() => setDialog({ open: false })}
        onSave={(v) => saveMut.mutate({ v: v as Parameters<typeof savePerfil>[0], id: dialog.item?.id })}
        onDelete={dialog.item ? () => deleteMut.mutate(dialog.item!.id) : undefined}
      />
    </div>
  );
}
