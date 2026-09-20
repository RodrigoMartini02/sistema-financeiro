import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Briefcase, ChevronDown, ChevronRight, ChevronUp, Tag, User, Pencil, AlertCircle, Plus, ShieldAlert, UserX } from 'lucide-react';
import { fetchContas, saveConta, deleteConta, updateFotoConta, reactivateConta } from '../../services/configService';
import {
  fetchMembros, createMembro, deactivateMembro, updateMembro, PendingExpensesError,
  type MembroListItem, type MembroCreateBody, type PendingExpense,
} from '../../services/membrosService';
import { queryKeys } from '../../services/queryKeys';
import type { Conta } from '../../types/config';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, saveButtonStyle, saveButtonDisabledStyle, dangerButtonStyle, dialogFooterStyle } from '../../ui/dialogFormTokens';
import { CFG, CFG_MONO_CLASS, cfgBadgeStyle, cfgDividerStyle, cfgRowStyle, cfgRowIndexStyle } from '../../ui/configTokens';
import { ConfigTabHeader } from '../../ui/ConfigTabHeader';
import { ConfigSwitch } from '../../ui/ConfigSwitch';
import { EmptyState } from '../../ui/EmptyState';
import { InfoBanner } from '../../ui/InfoBanner';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { GUIDE_LAYER_MODAL } from '../../context/FirstAccessGuideContext';
import { useConfirm } from '../../context/ConfirmContext';
import { AvatarUploadDialog } from '../../components/AvatarUploadDialog';
import { formatCPF, formatCNPJ, formatDocumento, formatDocumentoAuto } from '../../utils/document';
import { updateMe, updateFoto } from '../../services/usuariosService';

// Mesma tela e mesmo dado por trás (conta_membros) para os dois tipos de
// conta — só o termo exibido muda: PF fala em "membro" (da família), PJ em
// "colaborador" (da equipe). Movido de MembrosTab.tsx, hoje absorvida aqui.
export interface Termo { singular: string; artigo: string; }
export const TERMOS: Record<'pessoal' | 'empresa', Termo> = {
  pessoal: { singular: 'membro', artigo: 'o' },
  empresa: { singular: 'colaborador', artigo: 'o' },
};

// ─── Membros da conta (movido de MembrosTab.tsx) ──────────────────────────────

function NovoMembroDialog({
  open, isSaving, error, termo, onClose, onSave,
}: {
  open: boolean; isSaving: boolean; error?: string; termo: Termo;
  onClose: () => void; onSave: (body: MembroCreateBody) => void;
}) {
  // Controlado para aplicar a máscara; o campo aceita CPF ou CNPJ.
  const [documento, setDocumento] = useState('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const doc = documento.trim();
    onSave({
      nome:      fd.get('nome') as string,
      email:     fd.get('email') as string,
      senha:     fd.get('senha') as string,
      ...(doc ? { documento: doc } : {}),
    });
  };

  return (
    <Dialog open={open} title={`Novo ${termo.singular}`} onClose={onClose} size="md" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={handleSubmit}>
        {/* Altura fixa: o modal não muda de tamanho conforme o conteúdo. */}
        <div style={{ flex: 1, minHeight: 0, height: 190, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}><span>Nome completo</span><span style={{ color: C.danger }}>*</span></label>
              <input name="nome" placeholder={`Nome do ${termo.singular}`} autoFocus required style={fieldInputStyle} />
            </div>
            <div>
              <label style={labelStyle}><span>E-mail</span><span style={{ color: C.danger }}>*</span></label>
              <input name="email" type="email" placeholder={`${termo.singular}@email.com`} required style={fieldInputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>CPF / CNPJ</label>
              <input
                name="documento"
                value={documento}
                onChange={(e) => setDocumento(formatDocumentoAuto(e.target.value))}
                placeholder="000.000.000-00"
                inputMode="numeric"
                maxLength={18}
                className={CFG_MONO_CLASS}
                style={fieldInputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}><span>Senha</span><span style={{ color: C.danger }}>*</span></label>
              <input name="senha" type="password" placeholder="••••••••" required minLength={6} style={fieldInputStyle} />
            </div>
          </div>

          <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: CFG.muted }}>
            Documento é opcional — deixe em branco se {termo.artigo} {termo.singular} não tiver CPF (ex.: menor de idade). Senha com mínimo de 6 caracteres.
          </p>

          {error && (
            <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        <div style={dialogFooterStyle}>
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

function TransferirPendenciasDialog({
  open, membro, pendencias, outrosMembros, isSaving, error, termo, onClose, onConfirm,
}: {
  open: boolean; membro?: MembroListItem; pendencias: PendingExpense[]; outrosMembros: MembroListItem[];
  isSaving: boolean; error?: string; termo: Termo;
  onClose: () => void; onConfirm: (transferirParaUsuarioId: number) => void;
}) {
  const [destino, setDestino] = useState<string>('gestor');

  const handleConfirm = () => {
    onConfirm(destino === 'gestor' ? -1 : parseInt(destino, 10));
  };

  return (
    <Dialog open={open} title={`Desativar "${membro?.nome}"`} onClose={onClose} size="sm" scrollBody={false}>
      <div style={{ flex: 1, minHeight: 0, maxHeight: 320, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: CFG.muted }}>
          Este {termo.singular} tem {pendencias.length} lançamento(s) parcelado(s) ou recorrente(s) ainda em aberto.
          Escolha para quem essas pendências futuras devem ser transferidas antes de desativar.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 140, overflowY: 'auto' }}>
          {pendencias.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                minHeight: 34, padding: '0 12px', borderRadius: 12,
                border: `1px solid ${CFG.border}`, background: CFG.surface,
                fontSize: 12.5, fontWeight: 500, color: CFG.text,
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</span>
              <span style={cfgBadgeStyle}>{p.recurring ? 'Recorrente' : 'Parcelada'}</span>
            </div>
          ))}
        </div>

        <div>
          <label style={labelStyle}>Transferir para</label>
          <select value={destino} onChange={(e) => setDestino(e.target.value)} style={fieldInputStyle}>
            <option value="gestor">Eu (gestor da conta)</option>
            {outrosMembros.map((m) => (
              <option key={m.usuario_id} value={String(m.usuario_id)}>{m.nome}</option>
            ))}
          </select>
        </div>

        {error && (
          <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
            {error}
          </div>
        )}
      </div>

      {/* Aqui o "Cancelar" permanece: é uma confirmação destrutiva com escolha
          de destino, não um formulário comum. */}
      <div style={{ ...dialogFooterStyle, justifyContent: 'flex-end' }}>
        <button type="button" style={{ ...dangerButtonStyle, border: 'none', color: C.textMuted }} onClick={onClose}>
          Cancelar
        </button>
        {/* Confirmação destrutiva mantém preenchimento sólido: precisa se
            distinguir com clareza antes de o usuário confirmar. */}
        <button
          type="button"
          disabled={isSaving}
          onClick={handleConfirm}
          style={{
            ...saveButtonStyle,
            background: C.danger,
            cursor: isSaving ? 'not-allowed' : 'pointer',
            opacity: isSaving ? 0.5 : 1,
          }}
        >
          {isSaving ? 'Desativando...' : 'Confirmar e desativar'}
        </button>
      </div>
    </Dialog>
  );
}

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
  onSave: (v: { tipo: 'pessoal' | 'empresa'; nome: string; documento?: string; razao_social?: string; nome_fantasia?: string; atividade?: string; enquadramento?: string; telefone?: string; data_nascimento?: string; email?: string; novaSenha?: string }) => void;
  onDelete?: () => void;
  onSaveFoto?: (dataUrl: string | null) => void;
}) {
  const [tipo, setTipo] = useState<'pessoal' | 'empresa'>(conta?.tipo ?? 'empresa');
  const [enquadramento, setEnquadramento] = useState<string>(conta?.enquadramento ?? '');
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  // Documento é controlado para aplicar a máscara a cada tecla. O backend
  // limpa a pontuação ao salvar (accounts.ts), então enviar formatado é seguro.
  const [documento, setDocumento] = useState(() =>
    formatDocumento(conta?.documento ?? '', conta?.tipo ?? 'empresa'),
  );
  const confirm = useConfirm();

  const isNew = !conta;
  const enquadramentoGuide = useFirstAccessGuide('contas:enquadramento-v1', {
    enabled: open && isNew && tipo === 'empresa',
    layer: GUIDE_LAYER_MODAL,
  });

  useEffect(() => {
    if (!open) return;
    setEnquadramento(conta?.enquadramento ?? '');
    setDocumento(formatDocumento(conta?.documento ?? '', conta?.tipo ?? 'empresa'));
  }, [open, conta]);

  // Trocar PF↔PJ no cadastro novo reformata o que já foi digitado (CPF tem 11
  // dígitos, CNPJ 14 — o excedente é descartado pelo próprio formatador).
  const handleTipoChange = (novoTipo: 'pessoal' | 'empresa') => {
    setTipo(novoTipo);
    setDocumento((atual) => formatDocumento(atual, novoTipo));
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    const ok = await confirm({
      title: 'Desativar conta',
      message: `Desativar "${conta?.nome}"? Ela deixará de aparecer na lista de contas ativas.`,
      confirmLabel: 'Desativar',
    });
    if (ok) onDelete();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const nomeFantasia = tipo === 'empresa' ? (fd.get('nome_fantasia') as string || '') : '';
    const razaoSocial = tipo === 'empresa' ? (fd.get('razao_social') as string || '') : '';
    const novaSenha = (fd.get('nova_senha') as string || '').trim();
    onSave({
      tipo,
      nome: tipo === 'empresa' ? (nomeFantasia || razaoSocial || 'Empresa') : (fd.get('nome') as string),
      documento: documento.trim() || undefined,
      razao_social: tipo === 'empresa' ? (razaoSocial || undefined) : undefined,
      nome_fantasia: tipo === 'empresa' ? (nomeFantasia || undefined) : undefined,
      atividade: tipo === 'empresa' ? (fd.get('atividade') as string || undefined) : undefined,
      enquadramento: tipo === 'empresa' && enquadramento ? enquadramento : undefined,
      telefone: fd.get('telefone') as string || undefined,
      email: fd.get('email') as string || undefined,
      data_nascimento: tipo === 'pessoal' ? (fd.get('data_nascimento') as string || undefined) : undefined,
      ...(novaSenha ? { novaSenha } : {}),
    });
  };

  return (
    <Dialog open={open} title={conta ? 'Editar conta' : 'Nova conta'} onClose={onClose} size="md" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={handleSubmit}>
        {/* Altura fixa: PF e PJ têm campos diferentes (e a criação PJ ainda
            mostra o preview de categorias), mas o modal não deve mudar de
            tamanho ao alternar o tipo. */}
        <div style={{ flex: 1, minHeight: 0, height: 284, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {onSaveFoto && (
            <>
              {/* O avatar é o controle de upload — sem botão separado. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={() => setAvatarDialogOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAvatarDialogOpen(true); }
                  }}
                  aria-label="Enviar logo da conta"
                  style={{ position: 'relative', width: 54, height: 54, flex: 'none', cursor: 'pointer' }}
                >
                  <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', background: C.primarySoft, display: 'grid', placeItems: 'center', color: C.primaryDark }}>
                    {conta?.foto
                      ? <img src={conta.foto} alt="" style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
                      : <User size={22} />}
                  </span>
                  <span style={{ position: 'absolute', right: -2, bottom: -2, width: 21, height: 21, borderRadius: '50%', background: C.primary, border: '2px solid #fff', display: 'grid', placeItems: 'center', color: '#fff' }}>
                    <Pencil size={10} />
                  </span>
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.2, color: C.text }}>Logo da conta</span>
                  <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.3, color: C.textMuted }}>
                    Toque no avatar para enviar · PNG ou SVG, até 1 MB
                  </span>
                </div>
              </div>
              <AvatarUploadDialog
                open={avatarDialogOpen}
                onClose={() => setAvatarDialogOpen(false)}
                onConfirm={(dataUrl) => { onSaveFoto(dataUrl); setAvatarDialogOpen(false); }}
                isSaving={false}
              />
              <div style={cfgDividerStyle} />
            </>
          )}

          {!conta && (
            <div>
              <label style={labelStyle}>Tipo de conta</label>
              <ConfigSwitch
                alwaysOn
                checked={tipo === 'pessoal'}
                onChange={(pf) => handleTipoChange(pf ? 'pessoal' : 'empresa')}
                label={tipo === 'pessoal' ? 'Pessoa Física' : 'Pessoa Jurídica'}
              />
            </div>
          )}

          {tipo === 'empresa' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Razão social</label>
                <input name="razao_social" defaultValue={conta?.razao_social ?? ''} placeholder="Ex: Empresa ABC Ltda." style={fieldInputStyle} />
              </div>
              <div>
                <label style={labelStyle}><span>Nome fantasia</span><span style={{ color: C.danger }}>*</span></label>
                <input name="nome_fantasia" defaultValue={conta?.nome_fantasia ?? conta?.nome ?? ''} placeholder="Ex: ABC Stores" autoFocus required style={fieldInputStyle} />
              </div>
            </div>
          )}

          {tipo === 'pessoal' && (
            <div>
              <label style={labelStyle}><span>Nome da conta</span><span style={{ color: C.danger }}>*</span></label>
              <input name="nome" defaultValue={conta?.nome} placeholder="Ex: Pessoal" autoFocus required style={fieldInputStyle} />
            </div>
          )}

          {tipo === 'empresa' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, position: 'relative' }}>
                <div>
                  <label style={labelStyle}><span>CNPJ</span>{!conta && <span style={{ color: C.danger }}>*</span>}</label>
                  <input
                    name="documento"
                    value={documento}
                    onChange={(e) => setDocumento(formatCNPJ(e.target.value))}
                    placeholder="00.000.000/0000-00"
                    inputMode="numeric"
                    maxLength={18}
                    required={!conta}
                    className={CFG_MONO_CLASS}
                    style={fieldInputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Enquadramento</label>
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

              {isNew && enquadramento && <CategoryPreview enquadramento={enquadramento} />}
            </>
          )}

          {tipo === 'pessoal' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>CPF</label>
                <input
                  name="documento"
                  value={documento}
                  onChange={(e) => setDocumento(formatCPF(e.target.value))}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  maxLength={14}
                  className={CFG_MONO_CLASS}
                  style={fieldInputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Data de nascimento</label>
                <input name="data_nascimento" type="date" defaultValue={conta?.data_nascimento?.slice(0, 10) ?? ''} style={fieldInputStyle} />
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Telefone</label>
              <input name="telefone" defaultValue={conta?.telefone ?? ''} placeholder="(00) 00000-0000" maxLength={20} style={fieldInputStyle} />
            </div>
            <div>
              <label style={labelStyle}>E-mail</label>
              <input name="email" type="email" defaultValue={conta?.email ?? ''} placeholder="contato@email.com" style={fieldInputStyle} />
            </div>
          </div>

          {/* Senha do usuário logado (não da conta) — só ao editar, nunca ao
              criar uma conta nova. Campo único: preenchido vira a nova senha,
              vazio não muda nada. */}
          {conta && (
            <div>
              <label style={labelStyle}>Nova senha</label>
              <input
                name="nova_senha"
                type="password"
                placeholder="••••••••"
                minLength={8}
                autoComplete="new-password"
                style={fieldInputStyle}
              />
              <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 500, color: CFG.muted }}>
                Deixe em branco para manter a senha atual. Mínimo 8 caracteres.
              </p>
            </div>
          )}

          {error && (
            <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        <div style={dialogFooterStyle}>
          {conta && !conta.eh_padrao && onDelete && (
            <button type="button" style={dangerButtonStyle} onClick={handleDelete}>Desativar</button>
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

// ─── Editar usuário (a si mesmo, ou — se gestor — outro membro) ───────────────

function EditarUsuarioDialog({
  open, membro, isSelf, isSaving, error, onClose, onSave, onSaveFoto,
}: {
  open: boolean; membro?: MembroListItem; isSelf: boolean;
  isSaving: boolean; error?: string;
  onClose: () => void;
  onSave: (input: {
    nome: string; novaSenha?: string; email?: string; documento?: string;
    telefone?: string; data_nascimento?: string;
  }) => void;
  onSaveFoto: (dataUrl: string | null) => void;
}) {
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  // Documento é controlado para aplicar a máscara a cada tecla, mesmo padrão
  // de ContaDialog — membro é sempre pessoa física, então sempre CPF.
  const [documento, setDocumento] = useState(() => formatCPF(membro?.documento ?? ''));

  useEffect(() => {
    if (!open) return;
    setDocumento(formatCPF(membro?.documento ?? ''));
  }, [open, membro]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const novaSenha = String(fd.get('nova_senha') ?? '').trim();
    onSave({
      nome: String(fd.get('nome') ?? '').trim(),
      email: (fd.get('email') as string) || undefined,
      documento: documento.trim() || undefined,
      telefone: (fd.get('telefone') as string) || undefined,
      data_nascimento: (fd.get('data_nascimento') as string) || undefined,
      ...(novaSenha ? { novaSenha } : {}),
    });
  };

  return (
    <Dialog open={open} title={isSelf ? 'Meus dados' : `Editar ${membro?.nome ?? ''}`} onClose={onClose} size="xs" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={handleSubmit}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* O avatar é o controle de upload — sem botão separado, mesmo padrão de ContaDialog. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              role="button"
              tabIndex={0}
              onClick={() => setAvatarDialogOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAvatarDialogOpen(true); }
              }}
              aria-label="Enviar foto de perfil"
              style={{ position: 'relative', width: 54, height: 54, flex: 'none', cursor: 'pointer' }}
            >
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', background: C.primarySoft, display: 'grid', placeItems: 'center', color: C.primaryDark }}>
                <User size={22} />
              </span>
              <span style={{ position: 'absolute', right: -2, bottom: -2, width: 21, height: 21, borderRadius: '50%', background: C.primary, border: '2px solid #fff', display: 'grid', placeItems: 'center', color: '#fff' }}>
                <Pencil size={10} />
              </span>
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.2, color: C.text }}>Foto de perfil</span>
              <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.3, color: C.textMuted }}>
                Toque no avatar para enviar · PNG ou SVG, até 1 MB
              </span>
            </div>
          </div>
          <AvatarUploadDialog
            open={avatarDialogOpen}
            onClose={() => setAvatarDialogOpen(false)}
            onConfirm={(dataUrl) => { onSaveFoto(dataUrl); setAvatarDialogOpen(false); }}
            isSaving={false}
          />
          <div style={cfgDividerStyle} />

          <div>
            <label style={labelStyle}><span>Nome completo</span><span style={{ color: C.danger }}>*</span></label>
            <input
              key={membro?.usuario_id}
              name="nome"
              defaultValue={membro?.nome}
              placeholder={isSelf ? 'Seu nome' : 'Nome completo'}
              autoFocus
              required
              style={fieldInputStyle}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>CPF</label>
              <input
                name="documento"
                value={documento}
                onChange={(e) => setDocumento(formatCPF(e.target.value))}
                placeholder="000.000.000-00"
                inputMode="numeric"
                maxLength={14}
                className={CFG_MONO_CLASS}
                style={fieldInputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Data de nascimento</label>
              <input
                key={`nasc-${membro?.usuario_id}`}
                name="data_nascimento"
                type="date"
                defaultValue={membro?.data_nascimento?.slice(0, 10) ?? ''}
                style={fieldInputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Telefone</label>
              <input
                key={`tel-${membro?.usuario_id}`}
                name="telefone"
                defaultValue={membro?.telefone ?? ''}
                placeholder="(00) 00000-0000"
                maxLength={20}
                style={fieldInputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>E-mail</label>
              <input
                key={`email-${membro?.usuario_id}`}
                name="email"
                type="email"
                defaultValue={membro?.email ?? ''}
                placeholder="contato@email.com"
                style={fieldInputStyle}
              />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Nova senha</label>
            <input
              key={`senha-${membro?.usuario_id}`}
              name="nova_senha"
              type="password"
              placeholder="••••••••"
              minLength={8}
              autoComplete="new-password"
              style={fieldInputStyle}
            />
            <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 500, color: CFG.muted }}>
              Deixe em branco para manter a senha atual. Mínimo 8 caracteres.
            </p>
          </div>

          {error && (
            <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        <div style={dialogFooterStyle}>
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

// ─── Membros de uma conta específica (expandido dentro da linha da conta) ────

function MembrosDaConta({
  conta, isGestor, meId, openNovoMembro, onNovoMembroHandled,
}: {
  conta: Conta; isGestor: boolean; meId?: number;
  /** Abre o dialog de criação vindo do botão "+ Membro" na própria linha da conta. */
  openNovoMembro?: boolean;
  onNovoMembroHandled?: () => void;
}) {
  const termo = TERMOS[conta.tipo];
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [novoDialogOpen, setNovoDialogOpen] = useState(false);
  const [mutError, setMutError] = useState('');
  const [pendingDialog, setPendingDialog] = useState<{ membro: MembroListItem; pendencias: PendingExpense[] } | null>(null);
  // Membro sendo editado no dialog: eu mesmo (qualquer usuário) ou, se
  // gestor, qualquer outro membro da conta.
  const [editandoMembro, setEditandoMembro] = useState<MembroListItem | null>(null);

  // Botão "+ Membro" vive na linha da conta (fora deste componente, que só
  // existe depois de expandida) — mesmo padrão de "+ Subcategoria" em
  // CategoriasTab. openNovoMembro chega como sinal de fora para abrir aqui.
  useEffect(() => {
    if (openNovoMembro) {
      setMutError('');
      setNovoDialogOpen(true);
      onNovoMembroHandled?.();
    }
  }, [openNovoMembro]);

  const listQuery = useQuery({
    queryKey: queryKeys.membros(conta.id),
    queryFn: () => fetchMembros(conta.id),
  });
  const list = listQuery.data ?? [];
  const eu = list.find((m) => m.usuario_id === meId);

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.membros(conta.id) });

  const createMut = useMutation({
    mutationFn: (body: MembroCreateBody) => createMembro(body, conta.id),
    onSuccess: () => { invalidate(); setNovoDialogOpen(false); setMutError(''); },
    onError: (e: Error) => setMutError(e.message),
  });

  const deactivateMut = useMutation({
    mutationFn: ({ usuarioId, transferirPara }: { usuarioId: number; transferirPara?: number }) =>
      deactivateMembro(usuarioId, transferirPara, conta.id),
    onSuccess: () => { invalidate(); setPendingDialog(null); setMutError(''); },
    onError: (e: Error) => setMutError(e.message),
  });

  const editandoSouEu = editandoMembro?.usuario_id === meId;

  // Editando a si mesmo: endpoints já seguros por design, sempre operam
  // sobre o usuário do token. Gestor editando outro membro: rota
  // administrativa nova, nunca exige a senha atual do membro.
  const editarUsuarioMut = useMutation({
    mutationFn: async (input: {
      nome: string; novaSenha?: string; email?: string; documento?: string;
      telefone?: string; data_nascimento?: string;
    }): Promise<void> => {
      if (editandoSouEu) {
        await updateMe({
          nome: input.nome, nova_senha: input.novaSenha, email: input.email,
          documento: input.documento, telefone: input.telefone, data_nascimento: input.data_nascimento,
        });
      } else {
        await updateMembro(editandoMembro!.usuario_id, input, conta.id);
      }
    },
    onSuccess: () => { invalidate(); setEditandoMembro(null); setMutError(''); },
    onError: (e: Error) => setMutError(e.message),
  });
  const fotoMut = useMutation({
    mutationFn: (foto: string | null) =>
      editandoSouEu
        ? updateFoto(foto)
        : updateMembro(editandoMembro!.usuario_id, { nome: editandoMembro!.nome, foto }, conta.id).then(() => undefined),
    onSuccess: () => invalidate(),
    onError: (e: Error) => setMutError(e.message),
  });

  const handleDeactivate = async (membro: MembroListItem) => {
    const ok = await confirm({
      title: `Desativar ${termo.singular}`,
      message: `Desativar "${membro.nome}"? O login dele será bloqueado e os dados ficam ocultos, mas preservados.`,
      confirmLabel: 'Desativar',
    });
    if (!ok) return;

    setMutError('');
    try {
      await deactivateMembro(membro.usuario_id, undefined, conta.id);
      invalidate();
    } catch (e) {
      if (e instanceof PendingExpensesError) {
        setPendingDialog({ membro, pendencias: e.pending });
        return;
      }
      setMutError((e as Error).message);
    }
  };

  const handleConfirmTransfer = (transferirPara: number) => {
    if (!pendingDialog) return;
    const usuarioId = pendingDialog.membro.usuario_id;
    deactivateMut.mutate({ usuarioId, transferirPara: transferirPara === -1 ? undefined : transferirPara });
  };

  const outrosMembros = pendingDialog
    ? list.filter((m) => m.usuario_id !== pendingDialog.membro.usuario_id && m.membro_status === 'ativo')
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '2px 0 2px 22px' }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: CFG.faint }}>
        {list.length} {termo.singular}{list.length === 1 ? '' : 's'}
      </span>

      {listQuery.isLoading ? (
        <p style={{ padding: '12px 0', textAlign: 'center', fontSize: 12, color: CFG.muted }}>
          Carregando {termo.singular}s...
        </p>
      ) : list.length === 0 ? (
        <EmptyState icon={ShieldAlert} title={`Nenhum ${termo.singular} vinculado ainda`} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {list.map((m) => {
            // Todo mundo clica em si mesmo para editar os próprios dados;
            // gestor também pode clicar em qualquer outro membro para editar
            // nome, foto e definir uma nova senha.
            const souEu = m.usuario_id === meId;
            const clicavel = souEu || isGestor;
            return (
              <div
                key={m.membro_id}
                role={clicavel ? 'button' : undefined}
                tabIndex={clicavel ? 0 : undefined}
                onClick={clicavel ? () => { setMutError(''); setEditandoMembro(m); } : undefined}
                onKeyDown={clicavel ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMutError(''); setEditandoMembro(m); }
                } : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, minHeight: 34, padding: '0 12px',
                  borderRadius: 12, border: `1px solid ${CFG.border}`, background: CFG.surfaceAlt,
                  cursor: clicavel ? 'pointer' : 'default',
                }}
              >
                <span style={{ minWidth: 0, flex: 1, fontSize: 12.5, fontWeight: 500, color: CFG.textSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.nome}{souEu && <span style={{ color: CFG.faint, fontWeight: 400 }}> (você)</span>}
                </span>
                <span style={{ flex: 'none', fontSize: 11, color: CFG.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                  {m.email}
                </span>
                {m.membro_status === 'ativo' ? (
                  isGestor && !souEu && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); handleDeactivate(m); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); handleDeactivate(m); }
                      }}
                      title={`Desativar ${termo.singular}`}
                      style={{
                        flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, fontWeight: 600, color: CFG.danger, cursor: 'pointer',
                      }}
                    >
                      <UserX size={11} /> Desativar
                    </span>
                  )
                ) : (
                  <span style={cfgBadgeStyle}>Inativo</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {mutError && !pendingDialog && !novoDialogOpen && !editandoMembro && (
        <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
          {mutError}
        </div>
      )}

      {isGestor && (
        <NovoMembroDialog
          open={novoDialogOpen}
          isSaving={createMut.isPending}
          error={mutError}
          termo={termo}
          onClose={() => setNovoDialogOpen(false)}
          onSave={(body) => createMut.mutate(body)}
        />
      )}

      <EditarUsuarioDialog
        open={!!editandoMembro}
        membro={editandoMembro ?? eu}
        isSelf={editandoSouEu}
        isSaving={editarUsuarioMut.isPending}
        error={mutError}
        onClose={() => setEditandoMembro(null)}
        onSave={(input) => editarUsuarioMut.mutate(input)}
        onSaveFoto={(dataUrl) => fotoMut.mutate(dataUrl)}
      />

      {pendingDialog && (
        <TransferirPendenciasDialog
          open={!!pendingDialog}
          membro={pendingDialog.membro}
          pendencias={pendingDialog.pendencias}
          outrosMembros={outrosMembros}
          isSaving={deactivateMut.isPending}
          error={mutError}
          termo={termo}
          onClose={() => setPendingDialog(null)}
          onConfirm={handleConfirmTransfer}
        />
      )}
    </div>
  );
}

// ─── Tab ─────────────────────────────────────────────────────────────────────

interface ContasTabProps {
  /** Gestor/admin edita contas e gerencia membros; membro só edita a si mesmo. */
  isGestor: boolean;
  meId?: number;
  /** Nome atual do usuário logado — exigido por PUT /usuarios/me ao trocar a própria senha. */
  meNome?: string;
}

export function ContasTab({ isGestor, meId, meNome }: ContasTabProps) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; item?: Conta }>({ open: false });
  const [mutError, setMutError] = useState('');
  const [mostrarDesativados, setMostrarDesativados] = useState(false);
  const [expanded, setExpanded] = useState<number[]>([]);
  // Conta cujo "+ Membro" foi clicado na linha — abre o dialog de criação
  // dentro de MembrosDaConta e garante que a conta esteja expandida, mesmo
  // padrão de "+ Subcategoria" em CategoriasTab.
  const [novoMembroContaId, setNovoMembroContaId] = useState<number | null>(null);

  const contasQuery = useQuery({
    queryKey: [...queryKeys.contas, mostrarDesativados],
    queryFn: () => fetchContas(mostrarDesativados),
  });
  const data = contasQuery.data ?? [];

  const toggleExpand = (id: number) =>
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const handleCreateMembroClick = (contaId: number) => {
    setExpanded((prev) => (prev.includes(contaId) ? prev : [...prev, contaId]));
    setNovoMembroContaId(contaId);
  };
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

  // Senha é do usuário logado (gestor), não da conta — vai por uma chamada
  // separada (updateMe), fora do payload de saveConta.
  const senhaMut = useMutation({
    mutationFn: (novaSenha: string) => updateMe({ nome: meNome ?? '', nova_senha: novaSenha }),
    onError: (e: Error) => setMutError(e.message),
  });

  const handleSave = ({ novaSenha, ...v }: Parameters<typeof saveConta>[0] & { novaSenha?: string }) => {
    saveMut.mutate({ v, id: dialog.item?.id });
    if (novaSenha) senhaMut.mutate(novaSenha);
  };

  return (
    <div className="grid gap-2.5">
      <ConfigTabHeader
        filters={
          <ConfigSwitch
            checked={mostrarDesativados}
            onChange={setMostrarDesativados}
            label={`${listaExibida.length} conta${listaExibida.length === 1 ? '' : 's'} ${mostrarDesativados ? 'desativada' : 'ativa'}${listaExibida.length === 1 ? '' : 's'}`}
          />
        }
        actionLabel={isGestor ? 'Nova conta' : undefined}
        onAction={() => { setMutError(''); setDialog({ open: true }); }}
      >
        {isGestor && createGuide.isVisible && (
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
        Cada conta separa receitas e despesas de uma empresa ou pessoa.
      </InfoBanner>

      {contasQuery.isLoading && (
        <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>Carregando...</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {listaExibida.map((c, i) => {
          const isExpanded = expanded.includes(c.id);
          return (
            <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={cfgRowStyle}>
                <button
                  type="button"
                  onClick={() => {
                    // Membro nunca edita a conta do gestor — ela é só o caminho
                    // até a lista de membros, então o clique no corpo expande
                    // em vez de abrir o dialog de edição.
                    if (isGestor) { setMutError(''); setDialog({ open: true, item: c }); }
                    else toggleExpand(c.id);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1,
                    border: 'none', background: 'transparent', padding: 0, textAlign: 'left', cursor: 'pointer',
                  }}
                >
                  <span className={CFG_MONO_CLASS} style={cfgRowIndexStyle}>{String(i + 1).padStart(2, '0')}</span>
                  {c.foto && (
                    <img src={c.foto} alt="" style={{ flex: 'none', height: 26, width: 26, borderRadius: '50%', objectFit: 'cover' }} />
                  )}
                  <span style={{ minWidth: 0, flex: 1, fontSize: 13, fontWeight: 600, color: CFG.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.nome}
                  </span>
                  {c.eh_padrao && <span style={cfgBadgeStyle}>Padrão</span>}
                  {isContaIncompleta(c) && (
                    <span style={{
                      flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 11, fontWeight: 600, color: CFG.warnText,
                    }}>
                      <AlertCircle size={11} /> Incompleta
                    </span>
                  )}
                  {!c.ativo && isGestor && (
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
                  <span style={{ flex: 'none', fontSize: 11.5, fontWeight: 500, color: CFG.muted }}>
                    {c.data_criacao ? new Date(c.data_criacao).toLocaleDateString('pt-BR') : '—'}
                  </span>
                </button>

                {/* Mesmo padrão de "+ Subcategoria" em CategoriasTab: ação de
                    criar direto na linha, sem precisar expandir primeiro. */}
                {c.ativo && isGestor && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleCreateMembroClick(c.id); }}
                    style={{
                      flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                      border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
                      fontSize: 11.5, fontWeight: 600, color: CFG.primaryDark,
                    }}
                  >
                    <Plus size={11} strokeWidth={2.8} />
                    <span className="hidden sm:inline">{TERMOS[c.tipo].singular.charAt(0).toUpperCase() + TERMOS[c.tipo].singular.slice(1)}</span>
                    <span className="sm:hidden">Novo</span>
                  </button>
                )}

                {c.ativo && (
                  <button
                    type="button"
                    onClick={() => toggleExpand(c.id)}
                    aria-label={isExpanded ? `Recolher ${TERMOS[c.tipo].singular}s` : `Expandir ${TERMOS[c.tipo].singular}s`}
                    style={{
                      flex: 'none', display: 'grid', placeItems: 'center', width: 20, height: 20,
                      border: 'none', background: 'transparent', borderRadius: 8,
                      color: CFG.faint, cursor: 'pointer',
                    }}
                  >
                    <ChevronRight
                      size={13}
                      strokeWidth={2.2}
                      style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform .13s ease' }}
                    />
                  </button>
                )}
              </div>

              {isExpanded && c.ativo && (
                <MembrosDaConta
                  conta={c}
                  isGestor={isGestor}
                  meId={meId}
                  openNovoMembro={novoMembroContaId === c.id}
                  onNovoMembroHandled={() => setNovoMembroContaId(null)}
                />
              )}
            </div>
          );
        })}
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
