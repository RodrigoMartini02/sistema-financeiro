import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Briefcase, User, ChevronDown, ChevronUp, Tag } from 'lucide-react';
import { fetchPerfis, savePerfil, deletePerfil } from '../../services/configService';
import { queryKeys } from '../../services/queryKeys';
import type { Perfil, Enquadramento } from '../../types/config';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, cardStyle } from '../../ui/dialogFormTokens';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { useConfirm } from '../../context/ConfirmContext';

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

// ─── Linha de opção selecionável (estilo do padrão aprovado) ─────────────────

function OptionRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: () => void }) {
  return (
    <div
      onClick={onChange}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer',
        borderRadius: 10, border: `1.5px solid ${checked ? C.primary : C.borderInput}`,
        background: checked ? C.primarySoft : '#fff', padding: '10px 12px', transition: 'all .13s ease',
      }}
    >
      <div>
        <p style={{ fontSize: 13.5, fontWeight: 600, color: checked ? C.primaryDark : C.text, margin: 0 }}>{label}</p>
        <p style={{ fontSize: 12, color: checked ? C.primaryDark : C.textMuted, margin: 0 }}>{description}</p>
      </div>
      <span
        style={{
          width: 18, height: 18, borderRadius: '50%', border: `2px solid ${checked ? C.primary : C.chipOffBorder}`,
          background: checked ? C.primary : 'transparent', flexShrink: 0,
        }}
      />
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
  const confirm = useConfirm();
  const enquadramentoGuide = useFirstAccessGuide('perfis:enquadramento-v1');

  const isNew = !perfil;

  useEffect(() => {
    if (!open) return;
    setEnquadramento(perfil?.enquadramento ?? '');
  }, [open, perfil]);

  const handleDelete = async () => {
    if (!onDelete) return;
    const ok = await confirm({
      title: 'Arquivar perfil',
      message: `Arquivar "${perfil?.nome}"? Ele deixará de aparecer na lista de perfis ativos.`,
      confirmLabel: 'Arquivar',
    });
    if (ok) onDelete();
  };

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
    <Dialog open={open} title={perfil ? 'Editar perfil' : 'Novo perfil'} onClose={onClose} size="lg" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 -26px' }} onSubmit={handleSubmit}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>

          {!perfil && (
            <div style={cardStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <label style={labelStyle}>TIPO DE PERFIL</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {TIPO_OPTIONS.map((opt) => (
                    <div
                      key={opt.value}
                      onClick={() => setTipo(opt.value as 'pessoal' | 'empresa')}
                      style={{
                        display: 'flex', flexDirection: 'column', gap: 3, cursor: 'pointer',
                        borderRadius: 12, border: `1.5px solid ${tipo === opt.value ? C.primary : C.borderInput}`,
                        background: tipo === opt.value ? C.primarySoft : '#fff', padding: '10px 14px', transition: 'all .13s ease',
                      }}
                    >
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: tipo === opt.value ? C.primaryDark : C.text }}>{opt.label}</span>
                      <span style={{ fontSize: 12, color: tipo === opt.value ? C.primaryDark : C.textMuted }}>{opt.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tipo === 'empresa' && (
            <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 15 }}>
                  <label style={{ ...labelStyle, height: 'auto' }}>RAZÃO SOCIAL</label>
                  <span style={{ fontSize: 11, color: C.placeholder }}>opcional</span>
                </div>
                <input name="razao_social" defaultValue={perfil?.razao_social ?? ''} placeholder="Ex: Empresa ABC Ltda." style={fieldInputStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <label style={labelStyle}><span>NOME FANTASIA</span><span style={{ color: C.primary }}>*</span></label>
                <input name="nome_fantasia" defaultValue={perfil?.nome_fantasia ?? perfil?.nome ?? ''} placeholder="Ex: ABC Stores" autoFocus required style={fieldInputStyle} />
              </div>
            </div>
          )}

          {tipo === 'pessoal' && (
            <div style={cardStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <label style={labelStyle}><span>NOME DO PERFIL</span><span style={{ color: C.primary }}>*</span></label>
                <input name="nome" defaultValue={perfil?.nome} placeholder="Ex: Pessoal" autoFocus required style={fieldInputStyle} />
              </div>
            </div>
          )}

          {tipo === 'empresa' && (
            <>
              <div style={cardStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <label style={labelStyle}><span>CNPJ</span>{!perfil && <span style={{ color: C.primary }}>*</span>}</label>
                  <input name="documento" defaultValue={perfil?.documento ?? ''} placeholder="00000000000000" maxLength={18} required={!perfil} style={fieldInputStyle} />
                  <span style={{ fontSize: 12, color: C.textFaint }}>14 dígitos sem pontuação</span>
                </div>
              </div>

              <div style={{ ...cardStyle, position: 'relative' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <label style={labelStyle}>ENQUADRAMENTO</label>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {ENQUADRAMENTO_OPTIONS.map((opt) => (
                      <OptionRow
                        key={opt.value}
                        label={opt.label}
                        description={opt.description}
                        checked={enquadramento === opt.value}
                        onChange={() => setEnquadramento((prev) => prev === opt.value ? '' : opt.value)}
                      />
                    ))}
                  </div>
                  <span style={{ fontSize: 12, color: C.textFaint }}>
                    {isNew ? 'Cria categorias de despesas automaticamente (opcional)' : 'Tipo jurídico da empresa'}
                  </span>
                </div>
                {isNew && enquadramentoGuide.isVisible && (
                  <FirstAccessGuideCard
                    floating
                    placement="bottom"
                    className="absolute left-0 top-full z-[45] mt-3 w-[min(24rem,calc(100vw-2rem))]"
                    icon={Briefcase}
                    description={firstAccessGuideMessages.perfisEnquadramento}
                    onDismiss={enquadramentoGuide.dismiss}
                  />
                )}
              </div>

              {isNew && enquadramento && (
                <div style={{ margin: '0 26px 10px' }}>
                  <CategoryPreview enquadramento={enquadramento} />
                </div>
              )}
            </>
          )}

          {tipo === 'pessoal' && (
            <>
              <div style={cardStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 15 }}>
                    <label style={{ ...labelStyle, height: 'auto' }}>CPF</label>
                    <span style={{ fontSize: 11, color: C.placeholder }}>opcional</span>
                  </div>
                  <input name="documento" defaultValue={perfil?.documento ?? ''} placeholder="000.000.000-00" maxLength={14} style={fieldInputStyle} />
                </div>
              </div>
              <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 15 }}>
                    <label style={{ ...labelStyle, height: 'auto' }}>TELEFONE</label>
                    <span style={{ fontSize: 11, color: C.placeholder }}>opcional</span>
                  </div>
                  <input name="telefone" defaultValue={perfil?.telefone ?? ''} placeholder="(00) 00000-0000" maxLength={20} style={fieldInputStyle} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 15 }}>
                    <label style={{ ...labelStyle, height: 'auto' }}>DATA DE NASCIMENTO</label>
                    <span style={{ fontSize: 11, color: C.placeholder }}>opcional</span>
                  </div>
                  <input name="data_nascimento" type="date" defaultValue={perfil?.data_nascimento?.slice(0, 10) ?? ''} style={fieldInputStyle} />
                </div>
              </div>
              <div style={cardStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 15 }}>
                    <label style={{ ...labelStyle, height: 'auto' }}>E-MAIL DO PERFIL</label>
                    <span style={{ fontSize: 11, color: C.placeholder }}>opcional</span>
                  </div>
                  <input name="email" type="email" defaultValue={perfil?.email ?? ''} placeholder="contato@email.com" style={fieldInputStyle} />
                </div>
              </div>
            </>
          )}

          {error && (
            <div style={{ margin: '0 26px 14px', borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '10px 14px', fontSize: 13, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ flex: 'none', borderTop: '1px solid #eef3f6', background: '#fafcfd', padding: '14px 26px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          {perfil && onDelete && (
            <Button type="button" variant="danger" onClick={handleDelete}>Arquivar</Button>
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

// ─── Tab ─────────────────────────────────────────────────────────────────────

export function PerfisTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Perfil }>({ open: false });
  const [mutError, setMutError] = useState('');

  const perfis = useQuery({ queryKey: queryKeys.perfis, queryFn: fetchPerfis });
  const data = perfis.data ?? [];
  const createGuide = useFirstAccessGuide('perfis:novo-v1');

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
      <div className="relative flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {data.length} perfil/perfis ativo(s)
        </p>
        <Button icon={<Plus size={16} />} onClick={() => { setMutError(''); setDialog({ open: true }); }}>
          Novo perfil
        </Button>
        {createGuide.isVisible && (
          <FirstAccessGuideCard
            icon={Briefcase}
            description={firstAccessGuideMessages.perfisNovo}
            align="right"
            floating
            placement="top"
            className="absolute right-0 top-full z-[45] mt-3 w-[min(24rem,calc(100vw-2rem))]"
            onDismiss={createGuide.dismiss}
          />
        )}
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
