import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, ChevronLeft, ChevronRight, ShieldAlert, UserCheck, UserX } from 'lucide-react';
import {
  fetchUsuarios, createUsuario, updateUsuarioStatus, deleteUsuario,
  type UsuarioListItem, type UsuarioCreateBody,
} from '../../services/usuariosService';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { Field, Input, ToggleRow, ToggleGroup, SectionDivider } from '../../ui/form';
import { ConfigListRow } from '../../ui/ConfigListRow';

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
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { if (!open) setConfirmDelete(false); }, [open]);

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
    <Dialog open={open} title={usuario ? 'Editar usuário' : 'Novo usuário'} onClose={onClose} size="lg">
      <form className="grid gap-5" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome completo">
            <Input name="nome" defaultValue={usuario?.nome} placeholder="Nome do usuário" autoFocus required />
          </Field>
          <Field label="E-mail">
            <Input name="email" type="email" defaultValue={usuario?.email} placeholder="usuario@email.com" required />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Documento (CPF/CNPJ)">
            <Input name="documento" defaultValue={usuario?.documento} placeholder="000.000.000-00" required={!usuario} />
          </Field>
          {!usuario && (
            <Field label="Senha" hint="Mínimo 6 caracteres">
              <Input name="senha" type="password" placeholder="••••••••" required minLength={6} />
            </Field>
          )}
        </div>

        {isMaster && (
          <>
            <SectionDivider label="Permissão de acesso" />
            <div className="grid gap-2">
              {TIPO_ACESSO_OPTIONS.map((opt) => (
                <ToggleRow
                  key={opt.value}
                  label={opt.label}
                  description={opt.description}
                  checked={tipoAcesso === opt.value}
                  onChange={() => setTipoAcesso(opt.value)}
                />
              ))}
            </div>
          </>
        )}

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="flex items-center gap-2">
          {usuario && (
            <div className="flex items-center gap-2">
              {onToggleStatus && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onToggleStatus(isAtivo ? 'inativo' : 'ativo')}
                >
                  {isAtivo ? <><UserX size={14} /> Desativar</> : <><UserCheck size={14} /> Ativar</>}
                </Button>
              )}
              {isMaster && onDelete && (
                !confirmDelete ? (
                  <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)}>Excluir</Button>
                ) : (
                  <>
                    <span className="text-sm text-slate-600">Confirmar?</span>
                    <Button type="button" variant="danger" onClick={() => { onDelete(); setConfirmDelete(false); }}>Sim</Button>
                    <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>Não</Button>
                  </>
                )
              )}
            </div>
          )}
          <div className="ml-auto">
            <Button type="submit" disabled={isSaving}>{isSaving ? 'Salvando...' : 'Salvar'}</Button>
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
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            value={search}
            onChange={handleSearch}
            placeholder="Buscar por nome, email ou documento..."
            className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
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
