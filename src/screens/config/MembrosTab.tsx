import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, ShieldAlert, UserX, ShieldCheck } from 'lucide-react';
import {
  fetchMembros, createMembro, deactivateMembro, PendingExpensesError,
  type MembroListItem, type MembroCreateBody, type PendingExpense,
} from '../../services/membrosService';
import {
  fetchMemberPermissions, updateMemberPermissions, PERMISSION_LABELS,
  type PermissionFlag, type MemberPermissionsData,
} from '../../services/permissoesService';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, cardStyle } from '../../ui/dialogFormTokens';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { ToggleRow } from '../../ui/form';
import { useConfirm } from '../../context/ConfirmContext';

function NovoMembroDialog({
  open, isSaving, error, onClose, onSave,
}: {
  open: boolean; isSaving: boolean; error?: string;
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
    <Dialog open={open} title="Novo membro" onClose={onClose} size="lg" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 -26px' }} onSubmit={handleSubmit}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}><span>NOME COMPLETO</span><span style={{ color: C.primary }}>*</span></label>
              <input name="nome" placeholder="Nome do membro" autoFocus required style={fieldInputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}><span>E-MAIL</span><span style={{ color: C.primary }}>*</span></label>
              <input name="email" type="email" placeholder="membro@email.com" required style={fieldInputStyle} />
            </div>
          </div>

          <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}><span>DOCUMENTO (CPF/CNPJ)</span></label>
              <input name="documento" placeholder="000.000.000-00 (opcional)" style={fieldInputStyle} />
              <span style={{ fontSize: 12, color: C.textFaint }}>Opcional — deixe em branco se o membro não tiver CPF (ex.: menor de idade)</span>
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

const PERMISSION_ORDER: PermissionFlag[] = [
  'viewOthersEntries', 'editOthersEntries', 'deleteOthersEntries',
  'viewAggregateSummary', 'manageCategories', 'manageCards', 'accessOtherMembersData',
];

function PermissoesDialog({ open, membro, onClose }: { open: boolean; membro?: MembroListItem; onClose: () => void }) {
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

  return (
    <Dialog open={open} title={`Permissões de "${membro?.nome}"`} onClose={onClose} size="lg">
      <div style={{ padding: '0 26px 20px' }}>
        <p style={{ fontSize: 13, color: C.textFaint, marginBottom: 14 }}>
          Por padrão, este membro só vê e gerencia os próprios lançamentos. Libere abaixo o que ele pode acessar da conta compartilhada.
        </p>

        {permissionsQuery.isLoading ? (
          <p style={{ fontSize: 13, color: C.textFaint, textAlign: 'center', padding: '20px 0' }}>Carregando permissões...</p>
        ) : permissions ? (
          <div className="grid gap-2">
            {PERMISSION_ORDER.map((flag) => (
              <ToggleRow
                key={flag}
                label={PERMISSION_LABELS[flag].label}
                description={PERMISSION_LABELS[flag].description}
                checked={permissions[flag]}
                disabled={toggleMut.isPending}
                onChange={() => toggleMut.mutate({ flag, value: !permissions[flag] })}
              />
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
  open, membro, pendencias, outrosMembros, isSaving, error, onClose, onConfirm,
}: {
  open: boolean; membro?: MembroListItem; pendencias: PendingExpense[]; outrosMembros: MembroListItem[];
  isSaving: boolean; error?: string;
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
          Este membro tem {pendencias.length} lançamento(s) parcelado(s) ou recorrente(s) ainda em aberto.
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

export function MembrosTab() {
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
      title: 'Desativar membro',
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
    <div className="grid gap-5">
      <div className="relative flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou email..."
            className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <Button icon={<Plus size={16} />} onClick={() => { setMutError(''); setNovoDialogOpen(true); }}>
          Novo membro
        </Button>
      </div>

      {listQuery.isLoading ? (
        <p className="py-10 text-center text-sm text-slate-400">Carregando membros...</p>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white py-12 text-slate-400">
          <ShieldAlert size={32} strokeWidth={1.5} />
          <p className="text-sm">Nenhum membro vinculado ainda</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {list.map((m, i) => (
            <div key={m.membro_id} className="flex items-center gap-2">
              <div className="flex-1">
                <ConfigListRow
                  index={i}
                  nome={m.nome}
                  dataCriacao={m.vinculado_em}
                  onClick={() => {}}
                />
              </div>
              {m.membro_status === 'ativo' && (
                <>
                  <button
                    type="button"
                    onClick={() => setPermissoesMembro(m)}
                    className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition"
                    title="Configurar permissões"
                  >
                    <ShieldCheck size={13} /> Permissões
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeactivate(m)}
                    className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-red-600 hover:bg-red-50 transition"
                    title="Desativar membro"
                  >
                    <UserX size={13} /> Desativar
                  </button>
                </>
              )}
              {m.membro_status === 'inativo' && (
                <span className="text-xs text-slate-400 pr-2">Inativo</span>
              )}
            </div>
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
          onClose={() => setPendingDialog(null)}
          onConfirm={handleConfirmTransfer}
        />
      )}

      {permissoesMembro && (
        <PermissoesDialog
          open={!!permissoesMembro}
          membro={permissoesMembro}
          onClose={() => setPermissoesMembro(null)}
        />
      )}
    </div>
  );
}
