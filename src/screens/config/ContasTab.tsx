import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Briefcase, ChevronDown, ChevronUp, Tag, User, Pencil, X, AlertCircle } from 'lucide-react';
import { fetchContas, saveConta, deleteConta, updateFotoConta, reactivateConta } from '../../services/configService';
import { queryKeys } from '../../services/queryKeys';
import type { Conta } from '../../types/config';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, cardStyle, saveButtonStyle, saveButtonDisabledStyle, dangerButtonStyle } from '../../ui/dialogFormTokens';
import { CFG, cfgBadgeStyle } from '../../ui/configTokens';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { ConfigTabHeader } from '../../ui/ConfigTabHeader';
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
    <div style={{
      borderRadius: 10, border: `1px solid ${C.successBorder}`, background: C.successBg,
      padding: '9px 11px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <p style={{ margin: 0, fontSize: 11.5, fontWeight: 600, color: C.success }}>
          {cats.length} categorias serão criadas automaticamente
        </p>
        <span style={{
          flex: 'none', borderRadius: 999, padding: '3px 6px',
          fontSize: 10, fontWeight: 700, background: '#fff', color: C.success,
        }}>
          {totalSubs} subcategorias
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, marginTop: 8 }}>
        {shown.map((c) => (
          <div key={c.nome} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.success }}>
            <Tag size={9} style={{ flex: 'none', opacity: 0.7 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nome}</span>
            {c.total > 0 && <span style={{ opacity: 0.6 }}>({c.total})</span>}
          </div>
        ))}
      </div>
      {cats.length > 4 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, marginTop: 7,
            border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
            fontSize: 11, fontWeight: 600, color: C.success,
          }}
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
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
            <button type="button" style={dangerButtonStyle} onClick={handleDelete}>Arquivar</button>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <button
              type="submit"
              disabled={isSaving}
              style={isSaving ? saveButtonDisabledStyle : saveButtonStyle}
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
    <div className="grid gap-2.5">
      <ConfigTabHeader
        countLabel={`${listaExibida.length} conta(s) ${mostrarDesativados ? 'desativada(s)' : 'ativa(s)'}`}
        filters={
          <ToggleGroup
            value={mostrarDesativados ? 'desativadas' : 'ativas'}
            options={[
              { value: 'ativas', label: 'Ativas' },
              { value: 'desativadas', label: 'Desativadas' },
            ]}
            onChange={(v) => setMostrarDesativados(v === 'desativadas')}
          />
        }
        actionLabel="Nova conta"
        onAction={() => { setMutError(''); setDialog({ open: true }); }}
      >
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
      </ConfigTabHeader>

      <InfoBanner variant="warn">
        <AlertCircle size={13} style={{ flex: 'none' }} />
        Cada conta separa receitas, despesas e reservas de uma empresa ou pessoa.
      </InfoBanner>

      {contasQuery.isLoading && (
        <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>Carregando...</p>
      )}

      <div className="grid gap-1.5">
        {listaExibida.map((c, i) => (
          <ConfigListRow
            key={c.id}
            index={i}
            nome={c.nome}
            dataCriacao={c.data_criacao}
            foto={c.foto}
            onClick={() => { setMutError(''); setDialog({ open: true, item: c }); }}
            badges={
              <>
                {c.eh_padrao && <span style={cfgBadgeStyle}>Padrão</span>}
                {isContaIncompleta(c) && (
                  <span style={{
                    flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, fontWeight: 600, color: CFG.warnText,
                  }}>
                    <AlertCircle size={11} /> Incompleta
                  </span>
                )}
                {!c.ativo && (
                  <span
                    role="button"
                    tabIndex={0}
                    style={{
                      flex: 'none', borderRadius: 999, padding: '3px 8px', fontSize: 11, fontWeight: 600,
                      border: `1px solid ${CFG.successBg}`, background: CFG.successBg, color: CFG.success,
                      cursor: 'pointer',
                    }}
                    onClick={(e) => { e.stopPropagation(); reactivateMut.mutate(c.id); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        reactivateMut.mutate(c.id);
                      }
                    }}
                  >
                    Reativar
                  </span>
                )}
              </>
            }
          />
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
