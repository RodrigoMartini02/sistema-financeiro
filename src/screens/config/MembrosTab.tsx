import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldAlert, UserX, ShieldCheck } from 'lucide-react';
import {
  fetchMembros, createMembro, deactivateMembro, PendingExpensesError,
  type MembroListItem, type MembroCreateBody, type PendingExpense,
} from '../../services/membrosService';
import {
  fetchMemberPermissions, updateMemberPermissions, PERMISSION_GROUPS,
  type PermissionFlag, type MemberPermissionsData,
} from '../../services/permissoesService';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, cardStyle } from '../../ui/dialogFormTokens';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { CFG, cfgBadgeStyle, cfgPrimaryButtonStyle } from '../../ui/configTokens';
import { ToggleRow } from '../../ui/form';
import { ListToolbar } from '../../ui/ListToolbar';
import { EmptyState } from '../../ui/EmptyState';
import { useConfirm } from '../../context/ConfirmContext';

// Mesma tela e mesmo dado por trás (conta_membros) para os dois tipos de
// conta — só o termo exibido muda: PF fala em "membro" (da família), PJ em
// "colaborador" (da equipe).
interface Termo { singular: string; artigo: string; }
const TERMOS: Record<'pessoal' | 'empresa', Termo> = {
  pessoal: { singular: 'membro', artigo: 'o' },
  empresa: { singular: 'colaborador', artigo: 'o' },
};

function NovoMembroDialog({
  open, isSaving, error, termo, onClose, onSave,
}: {
  open: boolean; isSaving: boolean; error?: string; termo: Termo;
  onClose: () => void; onSave: (body: MembroCreateBody) => void;
}) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const documento = (fd.get('documento') as string)?.trim();
    onSave({
      nome:      fd.get('nome') as string,
      email:     fd.get('email') as string,
      senha:     fd.get('senha') as string,
      ...(documento ? { documento } : {}),
    });
  };

  return (
    <Dialog open={open} title={`Novo ${termo.singular}`} onClose={onClose} size="lg" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 -26px' }} onSubmit={handleSubmit}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}><span>NOME COMPLETO</span><span style={{ color: C.primary }}>*</span></label>
              <input name="nome" placeholder={`Nome do ${termo.singular}`} autoFocus required style={fieldInputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}><span>E-MAIL</span><span style={{ color: C.primary }}>*</span></label>
              <input name="email" type="email" placeholder={`${termo.singular}@email.com`} required style={fieldInputStyle} />
            </div>
          </div>

          <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}><span>DOCUMENTO (CPF/CNPJ)</span></label>
              <input name="documento" placeholder="000.000.000-00 (opcional)" style={fieldInputStyle} />
              <span style={{ fontSize: 12, color: C.textFaint }}>Opcional — deixe em branco se {termo.artigo} {termo.singular} não tiver CPF (ex.: menor de idade)</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}><span>SENHA</span><span style={{ color: C.primary }}>*</span></label>
              <input name="senha" type="password" placeholder="••••••••" required minLength={6} style={fieldInputStyle} />
              <span style={{ fontSize: 12, color: C.textFaint }}>Mínimo 6 caracteres</span>
            </div>
          </div>

          {error && (
            <div style={{ margin: '0 26px 14px', borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '10px 14px', fontSize: 13, color: C.danger }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ flex: 'none', borderTop: '1px solid #eef3f6', background: '#fafcfd', padding: '14px 26px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
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

function PermissoesDialog({ open, membro, contaTipo, onClose }: { open: boolean; membro?: MembroListItem; contaTipo: 'pessoal' | 'empresa'; onClose: () => void }) {
  const qc = useQueryClient();
  const [error, setError] = useState('');

  const permissionsQuery = useQuery({
    queryKey: ['membro-permissoes', membro?.usuario_id],
    queryFn: () => fetchMemberPermissions(membro!.usuario_id),
    enabled: open && !!membro,
  });

  const toggleMut = useMutation({
    mutationFn: ({ flag, value }: { flag: PermissionFlag; value: boolean }) =>
      updateMemberPermissions(membro!.usuario_id, { [flag]: value }),
    onSuccess: (data) => {
      qc.setQueryData(['membro-permissoes', membro?.usuario_id], data);
      setError('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const permissions: MemberPermissionsData | undefined = permissionsQuery.data;
  const visibleGroups = PERMISSION_GROUPS.filter((g) => g.id !== 'comercial' || contaTipo === 'empresa');

  return (
    <Dialog open={open} title={`Permissões de "${membro?.nome}"`} onClose={onClose} size="lg">
      <div style={{ padding: '0 26px 20px' }}>
        <p style={{ fontSize: 13, color: C.textFaint, marginBottom: 14 }}>
          Por padrão, este membro não acessa nenhuma tela. Libere abaixo o que ele pode usar.
        </p>

        {permissionsQuery.isLoading ? (
          <p style={{ fontSize: 13, color: C.textFaint, textAlign: 'center', padding: '20px 0' }}>Carregando permissões...</p>
        ) : permissions ? (
          <div className="grid gap-4">
            {visibleGroups.map((group) => (
              <div key={group.id} className="grid gap-2">
                <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.textFaint }}>
                  {group.label} · {group.items.length} permiss{group.items.length !== 1 ? 'ões' : 'ão'}
                </p>
                {group.items.map(({ flag, label }) => (
                  <ToggleRow
                    key={flag}
                    label={label}
                    checked={permissions[flag]}
                    disabled={toggleMut.isPending}
                    onChange={() => toggleMut.mutate({ flag, value: !permissions[flag] })}
                  />
                ))}
              </div>
            ))}
          </div>
        ) : null}

        {error && (
          <div style={{ marginTop: 14, borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '10px 14px', fontSize: 13, color: C.danger }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ flex: 'none', borderTop: '1px solid #eef3f6', background: '#fafcfd', padding: '14px 26px 16px', display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={onClose}>Fechar</Button>
      </div>
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
    <Dialog open={open} title={`Desativar "${membro?.nome}"`} onClose={onClose} size="lg" scrollBody={false}>
      <div style={{ padding: '0 26px 20px' }}>
        <p style={{ fontSize: 13, color: C.textFaint, marginBottom: 14 }}>
          Este {termo.singular} tem {pendencias.length} lançamento(s) parcelado(s) ou recorrente(s) ainda em aberto.
          Escolha para quem essas pendências futuras devem ser transferidas antes de desativar.
        </p>

        <div style={{ ...cardStyle, marginBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
            {pendencias.map((p) => (
              <div key={p.id} style={{ fontSize: 13, color: C.text, display: 'flex', justifyContent: 'space-between' }}>
                <span>{p.description}</span>
                <span style={{ color: C.textFaint }}>{p.recurring ? 'Recorrente' : 'Parcelada'}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={labelStyle}>TRANSFERIR PARA</label>
          <select value={destino} onChange={(e) => setDestino(e.target.value)} style={fieldInputStyle}>
            <option value="gestor">Eu (gestor da conta)</option>
            {outrosMembros.map((m) => (
              <option key={m.usuario_id} value={String(m.usuario_id)}>{m.nome}</option>
            ))}
          </select>
        </div>

        {error && (
          <div style={{ marginTop: 14, borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '10px 14px', fontSize: 13, color: C.danger }}>
            {error}
          </div>
        )}
      </div>

      <div style={{ flex: 'none', borderTop: '1px solid #eef3f6', background: '#fafcfd', padding: '14px 26px 16px', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button variant="danger" disabled={isSaving} onClick={handleConfirm}>
          {isSaving ? 'Desativando...' : 'Confirmar e desativar'}
        </Button>
      </div>
    </Dialog>
  );
}

export function MembrosTab({ contaTipo = 'pessoal' }: { contaTipo?: 'pessoal' | 'empresa' }) {
  const termo = TERMOS[contaTipo];
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [novoDialogOpen, setNovoDialogOpen] = useState(false);
  const [mutError, setMutError] = useState('');
  const [pendingDialog, setPendingDialog] = useState<{ membro: MembroListItem; pendencias: PendingExpense[] } | null>(null);
  const [permissoesMembro, setPermissoesMembro] = useState<MembroListItem | null>(null);

  const listQuery = useQuery({ queryKey: ['membros-list'], queryFn: fetchMembros });
  const list = (listQuery.data ?? []).filter((m) =>
    !search.trim() || m.nome.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase()),
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ['membros-list'] });

  const createMut = useMutation({
    mutationFn: createMembro,
    onSuccess: () => { invalidate(); setNovoDialogOpen(false); setMutError(''); },
    onError: (e: Error) => setMutError(e.message),
  });

  const deactivateMut = useMutation({
    mutationFn: ({ usuarioId, transferirPara }: { usuarioId: number; transferirPara?: number }) =>
      deactivateMembro(usuarioId, transferirPara),
    onSuccess: () => { invalidate(); setPendingDialog(null); setMutError(''); },
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
      await deactivateMembro(membro.usuario_id);
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
    <div className="grid gap-3">
      <ListToolbar
        search={{ value: search, onChange: setSearch, placeholder: 'Buscar por nome ou email...' }}
        action={
          <button
            type="button"
            style={cfgPrimaryButtonStyle}
            onClick={() => { setMutError(''); setNovoDialogOpen(true); }}
          >
            <Plus size={12} strokeWidth={2.6} />
            Novo {termo.singular}
          </button>
        }
      />

      {listQuery.isLoading ? (
        <p style={{ padding: '32px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>
          Carregando {termo.singular}s...
        </p>
      ) : list.length === 0 ? (
        <EmptyState icon={ShieldAlert} title={`Nenhum ${termo.singular} vinculado ainda`} />
      ) : (
        <div className="grid gap-1.5">
          {list.map((m, i) => (
            <ConfigListRow
              key={m.membro_id}
              index={i}
              nome={m.nome}
              dataCriacao={m.vinculado_em}
              onClick={() => {}}
              badges={
                m.membro_status === 'ativo' ? (
                  <>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); setPermissoesMembro(m); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          setPermissoesMembro(m);
                        }
                      }}
                      title="Configurar permissões"
                      style={{
                        flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11.5, fontWeight: 600, color: CFG.chipText, cursor: 'pointer',
                      }}
                    >
                      <ShieldCheck size={12} /> Permissões
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); handleDeactivate(m); }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeactivate(m);
                        }
                      }}
                      title={`Desativar ${termo.singular}`}
                      style={{
                        flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11.5, fontWeight: 600, color: CFG.danger, cursor: 'pointer',
                      }}
                    >
                      <UserX size={12} /> Desativar
                    </span>
                  </>
                ) : (
                  <span style={cfgBadgeStyle}>Inativo</span>
                )
              }
            />
          ))}
        </div>
      )}

      {mutError && (
        <div style={{ borderRadius: 10, border: `1px solid ${C.dangerBorder}`, background: C.dangerBg, padding: '10px 14px', fontSize: 13, color: C.danger }}>
          {mutError}
        </div>
      )}

      <NovoMembroDialog
        open={novoDialogOpen}
        isSaving={createMut.isPending}
        error={mutError}
        termo={termo}
        onClose={() => setNovoDialogOpen(false)}
        onSave={(body) => createMut.mutate(body)}
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

      {permissoesMembro && (
        <PermissoesDialog
          open={!!permissoesMembro}
          membro={permissoesMembro}
          contaTipo={contaTipo}
          onClose={() => setPermissoesMembro(null)}
        />
      )}
    </div>
  );
}
