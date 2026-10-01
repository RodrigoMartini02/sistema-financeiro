import { useState, useEffect, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Briefcase, ChevronRight, User, Pencil, AlertCircle, Plus, ShieldAlert, UserX } from 'lucide-react';
import {
  fetchContas, saveConta, deleteConta, reactivateConta,
  type CompanyAccountSaveValues, type ContaSaveValues, type PersonalAccountSaveValues,
} from '../../services/configService';
import {
  fetchMembros, createMembro, deactivateMembro, updateMembro, PendingExpensesError,
  type MembroListItem, type MembroCreateBody, type PendingExpense,
} from '../../services/membrosService';
import { queryKeys } from '../../services/queryKeys';
import type { Conta, Enquadramento } from '../../types/config';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, saveButtonStyle, saveButtonDisabledStyle, dangerButtonStyle, dialogFooterStyle, MoneyField } from '../../ui/dialogFormTokens';
import { CFG, CFG_MONO_CLASS, cfgBadgeStyle, cfgDividerStyle, cfgRowStyle, cfgRowIndexStyle } from '../../ui/configTokens';
import { ConfigTabHeader } from '../../ui/ConfigTabHeader';
import { ConfigSwitch } from '../../ui/ConfigSwitch';
import { EmptyState } from '../../ui/EmptyState';
import { InfoBanner } from '../../ui/InfoBanner';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { useConfirm } from '../../context/ConfirmContext';
import { AvatarUploadDialog } from '../../components/AvatarUploadDialog';
import { ENQUADRAMENTO_OPTIONS, isValidCnpj } from '../../utils/companyAccount';
import { formatCPF, formatCNPJ, formatDocumento, formatDocumentoAuto } from '../../utils/document';
import { updateMe, updateFoto, type UsuarioMe } from '../../services/usuariosService';

// Mesma tela e mesmo dado por trás (conta_membros) para os dois tipos de
// conta — só o termo exibido muda: PF fala em "membro" (da família), PJ em
// "colaborador" (da equipe). Movido de MembrosTab.tsx, hoje absorvida aqui.
// Fonte única do rótulo — qualquer tela que precise dizer "Membros" ou
// "Colaboradores" usa TERMOS[tipo].plural, nunca um literal hardcoded.
export interface Termo { singular: string; plural: string; artigo: string; }
export const TERMOS: Record<'pessoal' | 'empresa', Termo> = {
  pessoal: { singular: 'membro', plural: 'Membros', artigo: 'o' },
  empresa: { singular: 'colaborador', plural: 'Colaboradores', artigo: 'o' },
};

// ─── Membros da conta (movido de MembrosTab.tsx) ──────────────────────────────

function NovoMembroDialog({
  open, isSaving, error, termo, accountType, onClose, onSave,
}: {
  open: boolean; isSaving: boolean; error?: string; termo: Termo;
  accountType: Conta['tipo'];
  onClose: () => void; onSave: (body: MembroCreateBody) => void;
}) {
  // Controlado para aplicar a máscara. O colaborador da empresa é pessoa:
  // só CPF. O membro da família aceita CPF ou CNPJ.
  const [documento, setDocumento] = useState('');
  const onlyCpf = accountType === 'empresa';

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const doc = documento.trim();
    onSave({
      nome:      fd.get('nome') as string,
      sobrenome: (fd.get('sobrenome') as string) || undefined,
      email:     fd.get('email') as string,
      senha:     fd.get('senha') as string,
      telefone:  (fd.get('telefone') as string) || undefined,
      data_nascimento: (fd.get('data_nascimento') as string) || undefined,
      ...(doc ? { documento: doc } : {}),
    });
  };

  return (
    <Dialog open={open} title={`Novo ${termo.singular}`} onClose={onClose} size="card" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={handleSubmit}>
        {/* Altura fixa: o modal não muda de tamanho conforme o conteúdo. */}
        <div style={{ flex: 1, minHeight: 0, height: 400, overflowY: 'auto', overflowX: 'hidden', padding: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}><span>Nome</span><span style={{ color: C.danger }}>*</span></label>
              <input name="nome" placeholder={`Nome d${termo.artigo} ${termo.singular}`} autoFocus required style={fieldInputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Sobrenome</label>
              <input name="sobrenome" placeholder="Sobrenome" style={fieldInputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}><span>E-mail</span><span style={{ color: C.danger }}>*</span></label>
              <input name="email" type="email" placeholder={`${termo.singular}@email.com`} required style={fieldInputStyle} />
            </div>
            <div>
              <label style={labelStyle}>{onlyCpf ? 'CPF' : 'CPF / CNPJ'}</label>
              <input
                name="documento"
                value={documento}
                onChange={(e) => setDocumento(onlyCpf ? formatCPF(e.target.value) : formatDocumentoAuto(e.target.value))}
                placeholder="000.000.000-00"
                inputMode="numeric"
                maxLength={onlyCpf ? 14 : 18}
                className={CFG_MONO_CLASS}
                style={fieldInputStyle}
              />
            </div>
          </div>

          {/* Telefone e nascimento são do membro da família; o colaborador da
              empresa não tem esses campos. */}
          {accountType === 'pessoal' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Telefone</label>
                <input name="telefone" placeholder="(00) 00000-0000" maxLength={20} style={fieldInputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Data de nascimento</label>
                <input name="data_nascimento" type="date" style={fieldInputStyle} />
              </div>
            </div>
          )}

          <div>
            <label style={labelStyle}><span>Senha</span><span style={{ color: C.danger }}>*</span></label>
            <input name="senha" type="password" placeholder="••••••••" required minLength={8} style={fieldInputStyle} />
          </div>

          <p style={{ margin: 0, fontSize: 11, fontWeight: 500, color: CFG.muted }}>
            {onlyCpf
              ? 'CPF é opcional. Senha com mínimo de 8 caracteres.'
              : `Documento é opcional — deixe em branco se ${termo.artigo} ${termo.singular} não tiver CPF (ex.: menor de idade). Senha com mínimo de 8 caracteres.`}
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

// Conta PJ incompleta: sem razão social, o único campo obrigatório da empresa
// que o cadastro antigo deixava vazio.
function isContaIncompleta(c: Conta): boolean {
  return c.tipo === 'empresa' && !c.razao_social?.trim();
}

// ─── Dialog ──────────────────────────────────────────────────────────────────

/** Na conta pessoal padrão, o formulário entrega também os dados da pessoa (PUT /users/me). */
type ContaDialogValues =
  | CompanyAccountSaveValues
  | (PersonalAccountSaveValues & {
    novaSenha?: string; meNome?: string; meSobrenome?: string; meEmail?: string;
    meDocumento?: string; meTelefone?: string; meDataNascimento?: string;
  });

function initialBalanceOf(conta?: Conta): number | undefined {
  return conta?.aporte_inicial != null ? Number(conta.aporte_inicial) : undefined;
}

function ContaDialog({
  open, conta, me, isSaving, error, onClose, onSave, onDelete, onSaveMeFoto,
}: {
  open: boolean; conta?: Conta;
  /** Só ao editar a Conta Padrão. Na PF, os dados pessoais do titular; na PJ,
   *  que é o login, o e-mail e o logo do acesso. Editados no mesmo formulário. */
  me?: UsuarioMe;
  isSaving: boolean; error?: string;
  onClose: () => void;
  onSave: (v: ContaDialogValues) => void;
  onDelete?: () => void;
  onSaveMeFoto?: (dataUrl: string | null) => void;
}) {
  // Sem toggle no create: só PJ pode ser criada por aqui (PF adicional não
  // existe mais — o fluxo correto para "mais uma pessoa" é Novo membro).
  // Editar uma conta PF pré-existente continua possível, herdando o tipo dela.
  const tipo = conta?.tipo ?? 'empresa';
  // A PJ padrão do titular é o login: o acesso (e-mail, senha e logo) é o da empresa.
  const isLoginCompany = tipo === 'empresa' && !!conta?.eh_padrao && !!me;
  const [enquadramento, setEnquadramento] = useState<Enquadramento | ''>(conta?.enquadramento ?? '');
  const [saldoInicial, setSaldoInicial] = useState<number | undefined>(() => initialBalanceOf(conta));
  // Documento é controlado para aplicar a máscara a cada tecla. O backend
  // limpa a pontuação ao salvar (accounts.ts), então enviar formatado é seguro.
  const [documento, setDocumento] = useState(() =>
    formatDocumento(conta?.documento ?? '', conta?.tipo ?? 'empresa'),
  );
  // Documento PESSOAL do titular (CPF) — separado do documento da conta
  // (que so existe em conta PJ). So relevante quando `me` está presente.
  const [meDocumento, setMeDocumento] = useState(() => formatCPF(me?.documento ?? ''));
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  // Erro conferido aqui antes de enviar (CNPJ); o do servidor chega por `error`.
  const [formError, setFormError] = useState('');
  const confirm = useConfirm();

  useEffect(() => {
    if (!open) return;
    setMeDocumento(formatCPF(me?.documento ?? ''));
  }, [open, me]);

  useEffect(() => {
    if (!open) return;
    setEnquadramento(conta?.enquadramento ?? '');
    setSaldoInicial(initialBalanceOf(conta));
    setDocumento(formatDocumento(conta?.documento ?? '', conta?.tipo ?? 'empresa'));
    setFormError('');
  }, [open, conta]);

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
    const novaSenha = (fd.get('nova_senha') as string || '').trim();

    if (tipo === 'empresa') {
      if (!isValidCnpj(documento)) {
        setFormError('CNPJ inválido');
        return;
      }
      setFormError('');
      onSave({
        tipo,
        documento,
        razao_social: (fd.get('razao_social') as string || '').trim(),
        nome_fantasia: (fd.get('nome_fantasia') as string || '').trim() || undefined,
        enquadramento: enquadramento || undefined,
        data_abertura: (fd.get('data_abertura') as string) || undefined,
        aporte_inicial: saldoInicial || null,
        ...(isLoginCompany ? {
          email: (fd.get('email') as string || '').trim(),
          ...(novaSenha ? { nova_senha: novaSenha } : {}),
        } : {}),
      });
      return;
    }

    // Conta pessoal nunca teve (nem pode ter) um nome proprio, diferente do
    // titular: toda conta tipo='pessoal' e sempre a conta padrao dele. O
    // nome exibido em listas/seletor e sempre derivado de Nome+Sobrenome,
    // igual PJ ja deriva da empresa — nunca digitado a parte.
    const nomePessoal = [fd.get('me_nome') as string, fd.get('me_sobrenome') as string]
      .filter(Boolean).join(' ').trim();
    onSave({
      tipo,
      nome: nomePessoal,
      documento: documento.trim() || undefined,
      ...(me ? {
        meNome: (fd.get('me_nome') as string || '').trim(),
        meSobrenome: (fd.get('me_sobrenome') as string || '').trim() || undefined,
        meEmail: (fd.get('me_email') as string || '').trim() || undefined,
        meDocumento: meDocumento.trim() || undefined,
        meTelefone: (fd.get('me_telefone') as string || '').trim() || undefined,
        meDataNascimento: (fd.get('me_data_nascimento') as string || '').trim() || undefined,
      } : {}),
      ...(novaSenha ? { novaSenha } : {}),
    });
  };

  // O avatar é o controle de upload da foto (PF) ou do logo (PJ do login).
  const photoHeader = (title: string, hint: string, ariaLabel: string, emptyIcon: ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span
        role="button"
        tabIndex={0}
        onClick={() => setAvatarDialogOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAvatarDialogOpen(true); }
        }}
        aria-label={ariaLabel}
        style={{ position: 'relative', width: 54, height: 54, flex: 'none', cursor: 'pointer' }}
      >
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', background: C.primarySoft, display: 'grid', placeItems: 'center', color: C.primaryDark }}>
          {me?.foto
            ? <img src={me.foto} alt="" style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
            : emptyIcon}
        </span>
        <span style={{ position: 'absolute', right: -2, bottom: -2, width: 21, height: 21, borderRadius: '50%', background: C.primary, border: '2px solid #fff', display: 'grid', placeItems: 'center', color: '#fff' }}>
          <Pencil size={10} />
        </span>
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.2, color: C.text }}>{title}</span>
        <span style={{ fontSize: 11.5, fontWeight: 500, lineHeight: 1.3, color: C.textMuted }}>{hint}</span>
      </div>
    </div>
  );

  const shownError = formError || error;

  return (
    <Dialog open={open} title={conta ? 'Editar conta' : 'Nova conta'} onClose={onClose} size="card" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={handleSubmit}>
        {/* Altura fixa: o overflow do container absorve a diferença entre os
            tipos de conta. Cresce quando há os dados pessoais do titular (PF
            padrão) ou o bloco "Acesso" (PJ que é o login). */}
        <div style={{ flex: 1, minHeight: 0, height: tipo === 'pessoal' && me ? 620 : isLoginCompany ? 470 : 340, overflowY: 'auto', overflowX: 'hidden', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {me && tipo === 'pessoal' && (
            <>
              {/* Meus dados: identidade do titular como pessoa, sempre em
                  cima — a conta em si vem depois. Mesmo formulário, uma
                  submissão só, duas chamadas internas (usuarios + contas). */}
              {photoHeader('Meus dados', 'Toque no avatar para enviar sua foto · PNG ou SVG, até 1 MB', 'Enviar foto de perfil', <User size={22} />)}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}><span>Nome</span><span style={{ color: C.danger }}>*</span></label>
                  <input name="me_nome" defaultValue={me.nome} placeholder="Seu nome" required style={fieldInputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Sobrenome</label>
                  <input name="me_sobrenome" defaultValue={me.sobrenome ?? ''} placeholder="Sobrenome" style={fieldInputStyle} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>CPF</label>
                  <input
                    name="me_documento"
                    value={meDocumento}
                    onChange={(e) => setMeDocumento(formatCPF(e.target.value))}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    maxLength={14}
                    className={CFG_MONO_CLASS}
                    style={fieldInputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Data de nascimento</label>
                  <input name="me_data_nascimento" type="date" defaultValue={me.data_nascimento?.slice(0, 10) ?? ''} style={fieldInputStyle} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Telefone</label>
                  <input name="me_telefone" defaultValue={me.telefone ?? ''} placeholder="(00) 00000-0000" maxLength={20} style={fieldInputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>E-mail</label>
                  <input name="me_email" type="email" defaultValue={me.email} placeholder="voce@email.com" style={fieldInputStyle} />
                </div>
              </div>

              <div style={cfgDividerStyle} />
            </>
          )}

          {tipo === 'empresa' && (
            <>
              {/* Bloco da empresa: os mesmos campos na Nova conta, no Editar e
                  no cadastro pelo site. */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}><span>Razão social</span><span style={{ color: C.danger }}>*</span></label>
                  <input name="razao_social" defaultValue={conta?.razao_social ?? ''} placeholder="Ex: Empresa ABC Ltda." autoFocus required maxLength={150} style={fieldInputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Nome fantasia</label>
                  <input name="nome_fantasia" defaultValue={conta?.nome_fantasia ?? ''} placeholder="Ex: ABC Stores" maxLength={150} style={fieldInputStyle} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}><span>CNPJ</span><span style={{ color: C.danger }}>*</span></label>
                  <input
                    name="documento"
                    value={documento}
                    onChange={(e) => setDocumento(formatCNPJ(e.target.value))}
                    placeholder="00.000.000/0000-00"
                    inputMode="numeric"
                    maxLength={18}
                    required
                    className={CFG_MONO_CLASS}
                    style={fieldInputStyle}
                  />
                  {isLoginCompany && (
                    <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 500, color: CFG.muted }}>
                      Também é o documento de acesso (login).
                    </p>
                  )}
                </div>
                <div>
                  <label style={labelStyle}>Enquadramento</label>
                  <select
                    value={enquadramento}
                    onChange={(e) => setEnquadramento(e.target.value as Enquadramento | '')}
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
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>Data de abertura</label>
                  <input
                    name="data_abertura"
                    type="date"
                    defaultValue={conta?.data_abertura?.slice(0, 10) ?? ''}
                    style={fieldInputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Saldo inicial</label>
                  <MoneyField value={saldoInicial} onChange={setSaldoInicial} />
                </div>
              </div>
            </>
          )}

          {isLoginCompany && me && (
            <>
              <div style={cfgDividerStyle} />

              {/* Acesso: o login da PJ é a própria empresa. Salvo junto com a
                  empresa, no mesmo pedido; o logo vai na hora, como a foto. */}
              {photoHeader('Acesso', 'Toque no logo para enviar · PNG ou SVG, até 1 MB', 'Enviar logo da empresa', <Briefcase size={22} />)}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}><span>E-mail</span><span style={{ color: C.danger }}>*</span></label>
                  <input name="email" type="email" defaultValue={me.email} placeholder="contato@empresa.com" required style={fieldInputStyle} />
                </div>
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
                </div>
              </div>
              <p style={{ margin: '-6px 0 0', fontSize: 11, fontWeight: 500, color: CFG.muted }}>
                Deixe a senha em branco para manter a atual. Mínimo 8 caracteres.
              </p>
            </>
          )}

          {tipo === 'pessoal' && (
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
          )}

          {/* Senha do usuário logado (não da conta) — só ao editar, nunca ao
              criar uma conta nova. Campo único: preenchido vira a nova senha,
              vazio não muda nada. */}
          {conta && tipo === 'pessoal' && (
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

          {me && (
            <AvatarUploadDialog
              open={avatarDialogOpen}
              onClose={() => setAvatarDialogOpen(false)}
              onConfirm={(dataUrl) => { onSaveMeFoto?.(dataUrl); setAvatarDialogOpen(false); }}
              isSaving={false}
            />
          )}

          {shownError && (
            <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '8px 10px', fontSize: 11.5, color: C.danger }}>
              {shownError}
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
  open, membro, isSelf, accountType, isSaving, error, onClose, onSave, onSaveFoto,
}: {
  open: boolean; membro?: MembroListItem; isSelf: boolean;
  accountType: Conta['tipo'];
  isSaving: boolean; error?: string;
  onClose: () => void;
  onSave: (input: {
    nome: string; sobrenome?: string; novaSenha?: string; email?: string; documento?: string;
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

  // Telefone e nascimento são do membro da família; o colaborador da empresa
  // não tem esses campos.
  const showPersonalContact = accountType === 'pessoal';

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const novaSenha = String(fd.get('nova_senha') ?? '').trim();
    onSave({
      nome: String(fd.get('nome') ?? '').trim(),
      sobrenome: (fd.get('sobrenome') as string) || undefined,
      email: (fd.get('email') as string) || undefined,
      documento: documento.trim() || undefined,
      // Sem os campos na tela, reenvia o que já estava gravado: o PUT
      // /users/me (editar a si mesmo) grava o perfil inteiro e apagaria.
      telefone: showPersonalContact
        ? (fd.get('telefone') as string) || undefined
        : membro?.telefone ?? undefined,
      data_nascimento: showPersonalContact
        ? (fd.get('data_nascimento') as string) || undefined
        : membro?.data_nascimento?.slice(0, 10) ?? undefined,
      ...(novaSenha ? { novaSenha } : {}),
    });
  };

  const emailField = (
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
  );

  return (
    <Dialog open={open} title={isSelf ? 'Meus dados' : `Editar ${membro?.nome ?? ''}`} onClose={onClose} size="card" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={handleSubmit}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>
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
                {membro?.foto
                  ? <img src={membro.foto} alt="" style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
                  : <User size={22} />}
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}><span>Nome</span><span style={{ color: C.danger }}>*</span></label>
              <input
                key={membro?.usuario_id}
                name="nome"
                defaultValue={membro?.nome}
                placeholder={isSelf ? 'Seu nome' : 'Nome'}
                autoFocus
                required
                style={fieldInputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Sobrenome</label>
              <input
                key={`sobrenome-${membro?.usuario_id}`}
                name="sobrenome"
                defaultValue={membro?.sobrenome ?? ''}
                placeholder="Sobrenome"
                style={fieldInputStyle}
              />
            </div>
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
            {showPersonalContact ? (
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
            ) : emailField}
          </div>

          {showPersonalContact && (
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
              {emailField}
            </div>
          )}

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
      nome: string; sobrenome?: string; novaSenha?: string; email?: string; documento?: string;
      telefone?: string; data_nascimento?: string;
    }): Promise<void> => {
      if (editandoSouEu) {
        await updateMe({
          nome: input.nome, sobrenome: input.sobrenome, nova_senha: input.novaSenha, email: input.email,
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
        : updateMembro(editandoMembro!.usuario_id, { nome: editandoMembro!.nome, sobrenome: editandoMembro!.sobrenome ?? undefined, foto }, conta.id).then(() => undefined),
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
        {list.length} {list.length === 1 ? termo.singular : termo.plural.toLowerCase()}
      </span>

      {listQuery.isLoading ? (
        <p style={{ padding: '12px 0', textAlign: 'center', fontSize: 12, color: CFG.muted }}>
          Carregando {termo.plural.toLowerCase()}...
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
          accountType={conta.tipo}
          onClose={() => setNovoDialogOpen(false)}
          onSave={(body) => createMut.mutate(body)}
        />
      )}

      <EditarUsuarioDialog
        open={!!editandoMembro}
        membro={editandoMembro ?? eu}
        isSelf={editandoSouEu}
        accountType={conta.tipo}
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
  /** Dados pessoais do usuário logado (titular). Editar a Conta Padrão edita
   *  também esses dados, num único formulário. */
  me?: UsuarioMe;
}

export function ContasTab({ isGestor, meId, me }: ContasTabProps) {
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
    mutationFn: ({ v, id }: { v: ContaSaveValues; id?: number; isLoginCompany?: boolean }) => saveConta(v, id),
    onSuccess: (_conta, { isLoginCompany }) => {
      qc.invalidateQueries({ queryKey: queryKeys.contas });
      // Na PJ que é o login, o mesmo pedido mudou nome, CNPJ, e-mail e senha do acesso.
      if (isLoginCompany) {
        qc.invalidateQueries({ queryKey: queryKeys.session });
        qc.invalidateQueries({ queryKey: ['usuario-me'] });
      }
      setDialog({ open: false });
    },
    onError: (e) => setMutError(e.message),
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

  // Dados pessoais do titular (nome/sobrenome/CPF/nascimento/telefone/email/
  // senha) vivem em `usuarios`, nao em `contas` — vao por uma chamada
  // separada (updateMe), fora do payload de saveConta. So dispara quando a
  // conta editada e a Conta Padrao PF (a que nasceu no cadastro do proprio
  // titular). Na PJ padrao, o acesso vai no mesmo pedido da conta.
  const meMut = useMutation({
    mutationFn: (input: Parameters<typeof updateMe>[0]) => updateMe(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuario-me'] }),
    onError: (e: Error) => setMutError(e.message),
  });

  const meFotoMut = useMutation({
    mutationFn: (foto: string | null) => updateFoto(foto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['usuario-me'] }),
    onError: (e: Error) => setMutError(e.message),
  });

  const handleSave = (values: ContaDialogValues) => {
    if (values.tipo === 'empresa') {
      saveMut.mutate({ v: values, id: dialog.item?.id, isLoginCompany: !!dialog.item?.eh_padrao });
      return;
    }
    const { novaSenha, meNome, meSobrenome, meEmail, meDocumento, meTelefone, meDataNascimento, ...v } = values;
    saveMut.mutate({ v, id: dialog.item?.id });
    if (meNome) {
      meMut.mutate({
        nome: meNome, sobrenome: meSobrenome, email: meEmail, documento: meDocumento,
        telefone: meTelefone, data_nascimento: meDataNascimento,
        ...(novaSenha ? { nova_senha: novaSenha } : {}),
      });
    }
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
                    aria-label={`${isExpanded ? 'Recolher' : 'Expandir'} ${TERMOS[c.tipo].plural.toLowerCase()}`}
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
        me={dialog.item?.eh_padrao ? me : undefined}
        isSaving={saveMut.isPending || meMut.isPending}
        error={mutError}
        onClose={() => setDialog({ open: false })}
        onSave={handleSave}
        onDelete={dialog.item ? () => deleteMut.mutate((dialog.item as Conta).id) : undefined}
        onSaveMeFoto={dialog.item?.eh_padrao ? (foto) => meFotoMut.mutate(foto) : undefined}
      />
    </div>
  );
}
