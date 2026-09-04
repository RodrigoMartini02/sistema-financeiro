import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Briefcase, ChevronDown, ChevronUp, Tag, User, Pencil, X, AlertCircle } from 'lucide-react';
import { fetchContas, saveConta, deleteConta, updateFotoConta, reactivateConta } from '../../services/configService';
import { queryKeys } from '../../services/queryKeys';
import type { Conta } from '../../types/config';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, cardStyle } from '../../ui/dialogFormTokens';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { ToggleGroup } from '../../ui/form';
import { EmptyState } from '../../ui/EmptyState';
import { InfoBanner } from '../../ui/InfoBanner';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { GUIDE_LAYER_MODAL } from '../../context/FirstAccessGuideContext';
import { useConfirm } from '../../context/ConfirmContext';
import { AvatarUploadDialog } from '../../components/AvatarUploadDialog';

// Conta é considerada incompleta quando falta email, ou (se empresa) razão
// social/enquadramento, ou (se pessoa física) telefone/data de nascimento.
function isContaIncompleta(c: Conta): boolean {
  if (!c.email?.trim()) return true;
  if (c.tipo === 'empresa') {
    return !c.razao_social?.trim() || !c.enquadramento;
  }
  return !c.telefone?.trim() || !c.data_nascimento?.trim();
}

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

function ContaDialog({
  open, conta, isSaving, error, onClose, onSave, onDelete, onSaveFoto,
}: {
  open: boolean; conta?: Conta;
  isSaving: boolean; error?: string;
  onClose: () => void;
  onSave: (v: { tipo: 'pessoal' | 'empresa'; nome: string; documento?: string; razao_social?: string; nome_fantasia?: string; atividade?: string; enquadramento?: string; telefone?: string; data_nascimento?: string; email?: string }) => void;
  onDelete?: () => void;
  onSaveFoto?: (dataUrl: string | null) => void;
}) {
  const [tipo, setTipo] = useState<'pessoal' | 'empresa'>(conta?.tipo ?? 'empresa');
  const [enquadramento, setEnquadramento] = useState<string>(conta?.enquadramento ?? '');
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const confirm = useConfirm();

  const isNew = !conta;
  const enquadramentoGuide = useFirstAccessGuide('contas:enquadramento-v1', {
    enabled: open && isNew && tipo === 'empresa',
    layer: GUIDE_LAYER_MODAL,
  });

  useEffect(() => {
    if (!open) return;
    setEnquadramento(conta?.enquadramento ?? '');
  }, [open, conta]);

  const handleDelete = async () => {
    if (!onDelete) return;
    const ok = await confirm({
      title: 'Arquivar conta',
      message: `Arquivar "${conta?.nome}"? Ela deixará de aparecer na lista de contas ativas.`,
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
      telefone: fd.get('telefone') as string || undefined,
      email: fd.get('email') as string || undefined,
      data_nascimento: tipo === 'pessoal' ? (fd.get('data_nascimento') as string || undefined) : undefined,
    });
  };

  return (
    <Dialog open={open} title={conta ? 'Editar conta' : 'Nova conta'} onClose={onClose} size="lg" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 -26px' }} onSubmit={handleSubmit}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>

          {onSaveFoto && (
            <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ display: 'flex', height: 56, width: 56, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: '50%', background: C.primarySoft }}>
                  {conta?.foto ? (
                    <img src={conta.foto} alt="" style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
                  ) : (
                    <User size={24} color={C.primary} />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setAvatarDialogOpen(true)}
                  aria-label="Alterar foto da conta"
                  style={{ position: 'absolute', bottom: -2, right: -2, display: 'flex', height: 22, width: 22, alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: '2px solid #fff', background: C.primary, color: '#fff', cursor: 'pointer' }}
                >
                  <Pencil size={10} />
                </button>
              </div>
              {conta?.foto && (
                <button
                  type="button"
                  onClick={() => onSaveFoto(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500, color: C.textMuted, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <X size={11} /> Remover foto
                </button>
              )}
              <AvatarUploadDialog
                open={avatarDialogOpen}
                onClose={() => setAvatarDialogOpen(false)}
                onConfirm={(dataUrl) => { onSaveFoto(dataUrl); setAvatarDialogOpen(false); }}
                isSaving={false}
              />
            </div>
          )}

          {!conta && (
            <div style={cardStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <label style={labelStyle}>TIPO DE CONTA</label>
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
                <input name="razao_social" defaultValue={conta?.razao_social ?? ''} placeholder="Ex: Empresa ABC Ltda." style={fieldInputStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <label style={labelStyle}><span>NOME FANTASIA</span><span style={{ color: C.primary }}>*</span></label>
                <input name="nome_fantasia" defaultValue={conta?.nome_fantasia ?? conta?.nome ?? ''} placeholder="Ex: ABC Stores" autoFocus required style={fieldInputStyle} />
              </div>
            </div>
          )}

          {tipo === 'pessoal' && (
            <div style={cardStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <label style={labelStyle}><span>NOME DA CONTA</span><span style={{ color: C.primary }}>*</span></label>
                <input name="nome" defaultValue={conta?.nome} placeholder="Ex: Pessoal" autoFocus required style={fieldInputStyle} />
              </div>
            </div>
          )}

          {tipo === 'empresa' && (
            <>
              <div style={cardStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <label style={labelStyle}><span>CNPJ</span>{!conta && <span style={{ color: C.primary }}>*</span>}</label>
                  <input name="documento" defaultValue={conta?.documento ?? ''} placeholder="00000000000000" maxLength={18} required={!conta} style={fieldInputStyle} />
                  <span style={{ fontSize: 12, color: C.textFaint }}>14 dígitos sem pontuação</span>
                </div>
              </div>

              <div style={{ ...cardStyle, position: 'relative' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <label style={labelStyle}>ENQUADRAMENTO</label>
                  <select
                    value={enquadramento}
                    onChange={(e) => setEnquadramento(e.target.value)}
                    style={fieldInputStyle}
                  >
                    <option value="">Selecione...</option>
                    {ENQUADRAMENTO_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} — {opt.description}
                      </option>
                    ))}
                  </select>
                  <span style={{ fontSize: 12, color: C.textFaint }}>
                    {isNew ? 'Cria categorias de despesas automaticamente (opcional)' : 'Tipo jurídico da empresa'}
                  </span>
                </div>
                {isNew && enquadramentoGuide.isVisible && (
                  <FirstAccessGuideCard
                    floating
                    placement="bottom"
                    className="w-[min(24rem,calc(100vw-2rem))]"
                    icon={Briefcase}
                    description={firstAccessGuideMessages.contasEnquadramento}
                    onDismiss={enquadramentoGuide.dismiss}
                    onSilenceAll={enquadramentoGuide.silenceAll}
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
            <div style={cardStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 15 }}>
                  <label style={{ ...labelStyle, height: 'auto' }}>CPF</label>
                  <span style={{ fontSize: 11, color: C.placeholder }}>opcional</span>
                </div>
                <input name="documento" defaultValue={conta?.documento ?? ''} placeholder="000.000.000-00" maxLength={14} style={fieldInputStyle} />
              </div>
            </div>
          )}

          <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 15 }}>
                <label style={{ ...labelStyle, height: 'auto' }}>TELEFONE</label>
                <span style={{ fontSize: 11, color: C.placeholder }}>opcional</span>
              </div>
              <input name="telefone" defaultValue={conta?.telefone ?? ''} placeholder="(00) 00000-0000" maxLength={20} style={fieldInputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 15 }}>
                <label style={{ ...labelStyle, height: 'auto' }}>E-MAIL</label>
                <span style={{ fontSize: 11, color: C.placeholder }}>opcional</span>
              </div>
              <input name="email" type="email" defaultValue={conta?.email ?? ''} placeholder="contato@email.com" style={fieldInputStyle} />
            </div>
          </div>

          {tipo === 'pessoal' && (
            <div style={cardStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 15 }}>
                  <label style={{ ...labelStyle, height: 'auto' }}>DATA DE NASCIMENTO</label>
                  <span style={{ fontSize: 11, color: C.placeholder }}>opcional</span>
                </div>
                <input name="data_nascimento" type="date" defaultValue={conta?.data_nascimento?.slice(0, 10) ?? ''} style={fieldInputStyle} />
              </div>
            </div>
          )}

          {error && (
            <div style={{ margin: '0 26px 14px', borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '10px 14px', fontSize: 13, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ flex: 'none', borderTop: '1px solid #eef3f6', background: '#fafcfd', padding: '14px 26px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          {conta && !conta.eh_padrao && onDelete && (
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

export function ContasTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Conta }>({ open: false });
  const [mutError, setMutError] = useState('');
  const [mostrarDesativados, setMostrarDesativados] = useState(false);

  const contasQuery = useQuery({
    queryKey: [...queryKeys.contas, mostrarDesativados],
    queryFn: () => fetchContas(mostrarDesativados),
  });
  const data = contasQuery.data ?? [];
  const createGuide = useFirstAccessGuide('perfis:novo-v1');

  const listaExibida = mostrarDesativados ? data.filter((c) => !c.ativo) : data.filter((c) => c.ativo);

  const saveMut = useMutation({
    mutationFn: ({ v, id }: { v: Parameters<typeof saveConta>[0]; id?: number }) => saveConta(v, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.contas }); setDialog({ open: false }); },
    onError: (e) => setMutError(e.message),
  });

  const fotoMut = useMutation({
    mutationFn: ({ id, foto }: { id: number; foto: string | null }) => updateFotoConta(id, foto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.contas });
      qc.invalidateQueries({ queryKey: queryKeys.session });
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteConta,
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.contas }); setDialog({ open: false }); },
    onError: (e) => setMutError(e.message),
  });

  const reactivateMut = useMutation({
    mutationFn: reactivateConta,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.contas }),
  });

  const handleSave = (v: Parameters<typeof saveConta>[0]) => {
    saveMut.mutate({ v, id: dialog.item?.id });
  };

  return (
    <div className="grid gap-3">
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <p className="text-sm text-slate-500">
            {listaExibida.length} conta(s) {mostrarDesativados ? 'desativada(s)' : 'ativa(s)'}
          </p>
          <ToggleGroup
            value={mostrarDesativados ? 'desativadas' : 'ativas'}
            options={[
              { value: 'ativas', label: 'Ativas' },
              { value: 'desativadas', label: 'Desativadas' },
            ]}
            onChange={(v) => setMostrarDesativados(v === 'desativadas')}
          />
        </div>
        <Button size="sm" icon={<Plus size={15} />} onClick={() => { setMutError(''); setDialog({ open: true }); }}>
          Nova conta
        </Button>
        {createGuide.isVisible && (
          <FirstAccessGuideCard
            icon={Briefcase}
            description={firstAccessGuideMessages.perfisNovo}
            align="right"
            floating
            placement="top"
            className="w-[min(24rem,calc(100vw-2rem))]"
            onDismiss={createGuide.dismiss}
            onSilenceAll={createGuide.silenceAll}
          />
        )}
      </div>

      <InfoBanner variant="warn">
        As contas separam os dados financeiros. Cada empresa ou conta pessoal tem suas próprias receitas, despesas e reservas.
      </InfoBanner>

      {contasQuery.isLoading && <p className="py-4 text-center text-sm text-slate-400">Carregando...</p>}

      <div className="grid gap-2">
        {listaExibida.map((c, i) => (
          <div key={c.id} className="relative">
            <ConfigListRow
              index={i}
              nome={c.nome}
              dataCriacao={c.data_criacao}
              foto={c.foto}
              onClick={() => { setMutError(''); setDialog({ open: true, item: c }); }}
            />
            <div className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
              {c.eh_padrao && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Conta Padrão</span>
              )}
              {isContaIncompleta(c) && (
                <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600">
                  <AlertCircle size={12} /> Conta incompleta
                </span>
              )}
              {!c.ativo && (
                <button
                  type="button"
                  className="pointer-events-auto rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                  onClick={(e) => { e.stopPropagation(); reactivateMut.mutate(c.id); }}
                >
                  Reativar
                </button>
              )}
            </div>
          </div>
        ))}
        {listaExibida.length === 0 && !contasQuery.isLoading && (
          <EmptyState title={mostrarDesativados ? 'Nenhuma conta desativada' : 'Nenhuma conta encontrada'} />
        )}
      </div>

      <ContaDialog
        key={dialog.item ? String(dialog.item.id) : 'new'}
        open={dialog.open}
        conta={dialog.item}
        isSaving={saveMut.isPending}
        error={mutError}
        onClose={() => setDialog({ open: false })}
        onSave={handleSave}
        onSaveFoto={dialog.item ? (dataUrl) => fotoMut.mutate({ id: (dialog.item as Conta).id, foto: dataUrl }) : undefined}
        onDelete={dialog.item ? () => deleteMut.mutate((dialog.item as Conta).id) : undefined}
      />
    </div>
  );
}
