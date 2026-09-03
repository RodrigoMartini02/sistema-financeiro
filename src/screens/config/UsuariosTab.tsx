import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, ChevronLeft, ChevronRight, ShieldAlert, UserCheck, UserX } from 'lucide-react';
import {
  fetchUsuarios, createUsuario, updateUsuarioStatus, deleteUsuario,
  type UsuarioListItem, type UsuarioCreateBody,
} from '../../services/usuariosService';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, cardStyle, chipStyle } from '../../ui/dialogFormTokens';
import { ToggleGroup } from '../../ui/form';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { GUIDE_LAYER_MODAL } from '../../context/FirstAccessGuideContext';
import { useConfirm } from '../../context/ConfirmContext';

const TIPO_ACESSO_OPTIONS = [
  { value: 'padrao', label: 'Padrão', description: 'Acesso básico ao sistema' },
  { value: 'admin',  label: 'Admin',  description: 'Gerencia usuários e configurações' },
  { value: 'master', label: 'Master', description: 'Acesso total ao sistema' },
];

function UsuarioDialog({
  open, usuario, isSaving, error, isMaster, onClose, onSave, onDelete, onToggleStatus,
}: {
  open: boolean; usuario?: UsuarioListItem; isSaving: boolean; error?: string;
  isMaster: boolean;
  onClose: () => void; onSave: (body: UsuarioCreateBody) => void;
  onDelete?: () => void;
  onToggleStatus?: (status: string) => void;
}) {
  const [tipoAcesso, setTipoAcesso] = useState(usuario?.tipo ?? 'padrao');
  const confirm = useConfirm();
  const desativarGuide = useFirstAccessGuide('usuarios:desativar-excluir-v1', {
    enabled: open && !!usuario && !!onToggleStatus,
    layer: GUIDE_LAYER_MODAL,
  });

  const handleDelete = async () => {
    if (!onDelete) return;
    const ok = await confirm({
      title: 'Excluir usuário',
      message: `Excluir "${usuario?.nome}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
    });
    if (ok) onDelete();
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    onSave({
      nome:      fd.get('nome') as string,
      email:     fd.get('email') as string,
      documento: fd.get('documento') as string,
      senha:     fd.get('senha') as string,
      tipo:      isMaster ? tipoAcesso : 'padrao',
      status:    'ativo',
    });
  };

  const isAtivo = usuario?.status === 'ativo';

  return (
    <Dialog open={open} title={usuario ? 'Editar usuário' : 'Novo usuário'} onClose={onClose} size="lg" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '0 -26px' }} onSubmit={handleSubmit}>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}><span>NOME COMPLETO</span><span style={{ color: C.primary }}>*</span></label>
              <input name="nome" defaultValue={usuario?.nome} placeholder="Nome do usuário" autoFocus required style={fieldInputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}><span>E-MAIL</span><span style={{ color: C.primary }}>*</span></label>
              <input name="email" type="email" defaultValue={usuario?.email} placeholder="usuario@email.com" required style={fieldInputStyle} />
            </div>
          </div>

          <div style={{ ...cardStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <label style={labelStyle}><span>DOCUMENTO (CPF/CNPJ)</span>{!usuario && <span style={{ color: C.primary }}>*</span>}</label>
              <input name="documento" defaultValue={usuario?.documento} placeholder="000.000.000-00" required={!usuario} style={fieldInputStyle} />
            </div>
            {!usuario && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <label style={labelStyle}><span>SENHA</span><span style={{ color: C.primary }}>*</span></label>
                <input name="senha" type="password" placeholder="••••••••" required minLength={6} style={fieldInputStyle} />
                <span style={{ fontSize: 12, color: C.textFaint }}>Mínimo 6 caracteres</span>
              </div>
            )}
          </div>

          {isMaster && (
            <div style={cardStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <label style={labelStyle}>PERMISSÃO DE ACESSO</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {TIPO_ACESSO_OPTIONS.map((opt) => (
                    <div key={opt.value} onClick={() => setTipoAcesso(opt.value)} title={opt.description} style={chipStyle(tipoAcesso === opt.value)}>
                      {opt.label}
                    </div>
                  ))}
                </div>
                <span style={{ fontSize: 12, color: C.textFaint }}>
                  {TIPO_ACESSO_OPTIONS.find((o) => o.value === tipoAcesso)?.description}
                </span>
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
          {usuario && (
            <div className="relative flex items-center gap-2">
              {onToggleStatus && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onToggleStatus(isAtivo ? 'inativo' : 'ativo')}
                >
                  {isAtivo ? <><UserX size={14} /> Desativar</> : <><UserCheck size={14} /> Ativar</>}
                </Button>
              )}
              {desativarGuide.isVisible && (
                <FirstAccessGuideCard
                  floating
                  placement="bottom"
                  className="w-[min(25rem,calc(100vw-2rem))]"
                  icon={UserX}
                  description={firstAccessGuideMessages.usuariosDesativarExcluir}
                  onDismiss={desativarGuide.dismiss}
                  onSilenceAll={desativarGuide.silenceAll}
                />
              )}
              {isMaster && onDelete && (
                <Button type="button" variant="danger" onClick={handleDelete}>Excluir</Button>
              )}
            </div>
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

interface Props { userTipo: string }

export function UsuariosTab({ userTipo }: Props) {
  const qc = useQueryClient();
  const isMaster = userTipo === 'master';

  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [tipo, setTipo]     = useState('todos');
  const [status, setStatus] = useState('todos');
  const [dialog, setDialog] = useState<{ open: boolean; item?: UsuarioListItem }>({ open: false });
  const [mutError, setMutError] = useState('');
  const filterGuide = useFirstAccessGuide('usuarios:filtros-v1');

  const qKey = ['usuarios-list', page, search, tipo, status];

  const listQuery = useQuery({
    queryKey: qKey,
    queryFn: () => fetchUsuarios({ page, limit: 10, search, tipo, status }),
    placeholderData: (prev) => prev,
  });

  const list = listQuery.data?.data ?? [];
  const pagination = listQuery.data?.pagination;

  const invalidate = useCallback(() => qc.invalidateQueries({ queryKey: ['usuarios-list'] }), [qc]);

  const createMut = useMutation({
    mutationFn: createUsuario,
    onSuccess: () => { invalidate(); setDialog({ open: false }); },
    onError: (e) => setMutError(e.message),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => updateUsuarioStatus(id, status),
    onSuccess: () => { invalidate(); setDialog({ open: false }); },
  });

  const deleteMut = useMutation({
    mutationFn: deleteUsuario,
    onSuccess: () => { invalidate(); setDialog({ open: false }); },
  });

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setPage(1);
  };

  return (
    <div className="grid gap-5">
      {/* Toolbar */}
      <div className="relative flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={handleSearch}
            placeholder="Buscar por nome, email ou documento..."
            className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          {filterGuide.isVisible && (
            <FirstAccessGuideCard
              icon={Search}
              description={firstAccessGuideMessages.usuariosFiltros}
              floating
              placement="bottom"
              className="w-[min(24rem,calc(100vw-2rem))]"
              onDismiss={filterGuide.dismiss}
              onSilenceAll={filterGuide.silenceAll}
            />
          )}
        </div>
        <ToggleGroup
          value={tipo}
          options={[
            { value: 'todos', label: 'Todos' },
            { value: 'padrao', label: 'Padrão' },
            { value: 'admin', label: 'Admin' },
            ...(isMaster ? [{ value: 'master', label: 'Master' }] : []),
          ]}
          onChange={(v) => { setTipo(v); setPage(1); }}
        />
        <ToggleGroup
          value={status}
          options={[
            { value: 'todos',    label: 'Todos' },
            { value: 'ativo',    label: 'Ativo' },
            { value: 'inativo',  label: 'Inativo' },
            { value: 'bloqueado', label: 'Bloqueado' },
          ]}
          onChange={(v) => { setStatus(v); setPage(1); }}
        />
        {isMaster && (
          <Button icon={<Plus size={16} />} onClick={() => { setMutError(''); setDialog({ open: true }); }}>
            Novo usuário
          </Button>
        )}
      </div>

      {/* List */}
      {listQuery.isLoading ? (
        <p className="py-10 text-center text-sm text-slate-400">Carregando usuários...</p>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white py-12 text-slate-400">
          <ShieldAlert size={32} strokeWidth={1.5} />
          <p className="text-sm">Nenhum usuário encontrado</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {list.map((u, i) => (
            <ConfigListRow
              key={u.id}
              index={(page - 1) * 10 + i}
              nome={u.nome}
              dataCriacao={u.data_cadastro}
              dataAtualizacao={u.data_atualizacao}
              onClick={() => { setMutError(''); setDialog({ open: true, item: u }); }}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.pages > 1 && (
        <div className="flex items-center justify-between px-1 py-1">
          <span className="text-xs text-slate-500">
            {pagination.total} usuário{pagination.total !== 1 ? 's' : ''} · página {pagination.page} de {pagination.pages}
          </span>
          <div className="flex gap-1">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 transition"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 transition"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      <UsuarioDialog
        open={dialog.open}
        usuario={dialog.item}
        isMaster={isMaster}
        isSaving={createMut.isPending}
        error={mutError}
        onClose={() => setDialog({ open: false })}
        onSave={(body) => createMut.mutate(body)}
        onDelete={dialog.item ? () => deleteMut.mutate(dialog.item!.id) : undefined}
        onToggleStatus={dialog.item ? (s) => statusMut.mutate({ id: dialog.item!.id, status: s }) : undefined}
      />
    </div>
  );
}
