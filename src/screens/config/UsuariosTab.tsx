import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ChevronLeft, ChevronRight, ShieldAlert, UserCheck, UserX } from 'lucide-react';
import {
  fetchUsuarios, createUsuario, updateUsuarioStatus, deleteUsuario,
  type UsuarioListItem, type UsuarioCreateBody,
} from '../../services/usuariosService';
import { Dialog } from '../../ui/dialog';
import { C, labelStyle, fieldInputStyle, dialogFooterStyle, saveButtonStyle, saveButtonDisabledStyle, dangerButtonStyle } from '../../ui/dialogFormTokens';
import { ToggleGroup } from '../../ui/form';
import { ConfigListRow } from '../../ui/ConfigListRow';
import { CFG, CFG_MONO_CLASS, cfgPrimaryButtonStyle } from '../../ui/configTokens';
import { ListToolbar } from '../../ui/ListToolbar';
import { EmptyState } from '../../ui/EmptyState';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { GUIDE_LAYER_MODAL } from '../../context/FirstAccessGuideContext';
import { useConfirm } from '../../context/ConfirmContext';
import { formatDocumentoAuto } from '../../utils/document';

const TIPO_ACESSO_OPTIONS = [
  { value: 'padrao', label: 'Padrão', description: 'Acesso básico ao sistema' },
  { value: 'gestor', label: 'Gestor', description: 'Dono de conta' },
  { value: 'admin',  label: 'Admin',  description: 'Acesso total à plataforma' },
];

function UsuarioDialog({
  open, usuario, isSaving, error, isAdmin, onClose, onSave, onDelete, onToggleStatus,
}: {
  open: boolean; usuario?: UsuarioListItem; isSaving: boolean; error?: string;
  isAdmin: boolean;
  onClose: () => void; onSave: (body: UsuarioCreateBody) => void;
  onDelete?: () => void;
  onToggleStatus?: (status: string) => void;
}) {
  const [tipoAcesso, setTipoAcesso] = useState(usuario?.tipo ?? 'padrao');
  // Controlado para aplicar a máscara; o campo aceita CPF ou CNPJ.
  const [documento, setDocumento] = useState(() => formatDocumentoAuto(usuario?.documento ?? ''));
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
      documento,
      senha:     fd.get('senha') as string,
      tipo:      isAdmin ? tipoAcesso : 'padrao',
      status:    'ativo',
    });
  };

  const isAtivo = usuario?.status === 'ativo';

  return (
    <Dialog open={open} title={usuario ? 'Editar usuário' : 'Novo usuário'} onClose={onClose} size="lg" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }} onSubmit={handleSubmit}>
        {/* Altura fixa: o campo Senha só existe na criação, mas o modal não
            deve mudar de tamanho entre criar e editar. */}
        <div style={{ flex: 1, minHeight: 0, height: 232, overflowY: 'auto', overflowX: 'hidden', padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}><span>Nome completo</span><span style={{ color: C.danger }}>*</span></label>
              <input name="nome" defaultValue={usuario?.nome} placeholder="Nome do usuário" autoFocus required style={fieldInputStyle} />
            </div>
            <div>
              <label style={labelStyle}><span>E-mail</span><span style={{ color: C.danger }}>*</span></label>
              <input name="email" type="email" defaultValue={usuario?.email} placeholder="usuario@email.com" required style={fieldInputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}><span>CPF / CNPJ</span>{!usuario && <span style={{ color: C.danger }}>*</span>}</label>
              <input
                name="documento"
                value={documento}
                onChange={(e) => setDocumento(formatDocumentoAuto(e.target.value))}
                placeholder="000.000.000-00"
                inputMode="numeric"
                maxLength={18}
                required={!usuario}
                className={CFG_MONO_CLASS}
                style={fieldInputStyle}
              />
            </div>
            {!usuario && (
              <div>
                <label style={labelStyle}><span>Senha</span><span style={{ color: C.danger }}>*</span></label>
                <input name="senha" type="password" placeholder="••••••••" required minLength={6} style={fieldInputStyle} />
              </div>
            )}
          </div>

          {isAdmin && (
            <div>
              <label style={labelStyle}>Permissão de acesso</label>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${TIPO_ACESSO_OPTIONS.length}, 1fr)`, gap: 3, padding: 3, borderRadius: 999, background: CFG.chipBg }}>
                {TIPO_ACESSO_OPTIONS.map((opt) => {
                  const active = tipoAcesso === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setTipoAcesso(opt.value)}
                      title={opt.description}
                      style={{
                        height: 26, border: 'none', borderRadius: 999,
                        background: active ? CFG.primary : 'transparent',
                        color: active ? '#fff' : CFG.chipText,
                        fontSize: 11.5, fontWeight: 600, lineHeight: 1, cursor: 'pointer',
                        transition: 'background .13s ease, color .13s ease',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p style={{ margin: '5px 0 0', fontSize: 11, fontWeight: 500, color: CFG.muted }}>
                {TIPO_ACESSO_OPTIONS.find((o) => o.value === tipoAcesso)?.description}
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
          {usuario && (
            <div className="relative flex items-center gap-2">
              {onToggleStatus && (
                <button
                  type="button"
                  style={dangerButtonStyle}
                  onClick={() => onToggleStatus(isAtivo ? 'inativo' : 'ativo')}
                >
                  {isAtivo ? <><UserX size={12} /> Desativar</> : <><UserCheck size={12} /> Ativar</>}
                </button>
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
              {isAdmin && onDelete && (
                <button type="button" style={dangerButtonStyle} onClick={handleDelete}>Excluir</button>
              )}
            </div>
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

interface Props { userTipo: string }

export function UsuariosTab({ userTipo }: Props) {
  const qc = useQueryClient();
  const isAdmin = userTipo === 'admin';

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

  return (
    <div className="grid gap-3">
      {/* Toolbar */}
      <div className="relative flex flex-col gap-2">
        <ListToolbar
          search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); }, placeholder: 'Buscar por nome, email ou documento...' }}
          action={isAdmin && (
            <button
              type="button"
              style={cfgPrimaryButtonStyle}
              onClick={() => { setMutError(''); setDialog({ open: true }); }}
            >
              <Plus size={12} strokeWidth={2.6} />
              Novo usuário
            </button>
          )}
        />
        {filterGuide.isVisible && (
          <FirstAccessGuideCard
            icon={ShieldAlert}
            description={firstAccessGuideMessages.usuariosFiltros}
            floating
            placement="bottom"
            className="w-[min(24rem,calc(100vw-2rem))]"
            onDismiss={filterGuide.dismiss}
            onSilenceAll={filterGuide.silenceAll}
          />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            value={tipo}
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'padrao', label: 'Padrão' },
              { value: 'gestor', label: 'Gestor' },
              ...(isAdmin ? [{ value: 'admin', label: 'Admin' }] : []),
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
        </div>
      </div>

      {/* List */}
      {listQuery.isLoading ? (
        <p style={{ padding: '32px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>
          Carregando usuários...
        </p>
      ) : list.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="Nenhum usuário encontrado" />
      ) : (
        <div className="grid gap-1.5">
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
          <span style={{ fontSize: 11.5, fontWeight: 500, color: CFG.muted }}>
            {pagination.total} usuário{pagination.total !== 1 ? 's' : ''} · página {pagination.page} de {pagination.pages}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              aria-label="Página anterior"
              style={{
                display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 8,
                border: 'none', background: 'transparent', color: CFG.muted,
                cursor: page <= 1 ? 'not-allowed' : 'pointer', opacity: page <= 1 ? 0.3 : 1,
              }}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Próxima página"
              style={{
                display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 8,
                border: 'none', background: 'transparent', color: CFG.muted,
                cursor: page >= pagination.pages ? 'not-allowed' : 'pointer',
                opacity: page >= pagination.pages ? 0.3 : 1,
              }}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      <UsuarioDialog
        open={dialog.open}
        usuario={dialog.item}
        isAdmin={isAdmin}
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
