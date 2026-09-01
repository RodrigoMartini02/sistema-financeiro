import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Save, CheckCircle2, Pencil, X } from 'lucide-react';
import { fetchMe, updateMe, updateFoto } from '../../services/usuariosService';
import { fetchPerfis, savePerfil } from '../../services/configService';
import { queryKeys } from '../../services/queryKeys';
import { Button } from '../../ui/button';
import { Field, Input, SectionDivider } from '../../ui/form';
import { FirstAccessGuideCard } from '../../components/FirstAccessGuideCard';
import { firstAccessGuideMessages } from '../../components/firstAccessGuideMessages';
import { useFirstAccessGuide } from '../../hooks/useFirstAccessGuide';
import { Z_GUIDE } from '../../ui/zIndex';
import { AvatarUploadDialog } from '../../components/AvatarUploadDialog';

const TYPE_BADGE: Record<string, string> = {
  master: 'bg-purple-100 text-purple-700',
  admin: 'bg-blue-100 text-blue-700',
  padrao: 'bg-slate-100 text-slate-600',
};

const STATUS_BADGE: Record<string, string> = {
  ativo: 'bg-green-100 text-green-700',
  inativo: 'bg-amber-100 text-amber-700',
  bloqueado: 'bg-red-100 text-red-700',
  cancelado: 'bg-slate-100 text-slate-500',
};

export function MinhaContaTab() {
  const qc = useQueryClient();
  const { data: user, isLoading } = useQuery({ queryKey: ['usuario-me'], queryFn: fetchMe });
  const { data: perfis } = useQuery({ queryKey: queryKeys.perfis, queryFn: fetchPerfis });
  const perfilEmpresa = perfis?.find((p) => p.tipo === 'empresa');

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [documento, setDocumento] = useState('');
  const [pais, setPais] = useState('');
  const [estado, setEstado] = useState('');
  const [cidade, setCidade] = useState('');
  const [nomeFantasia, setNomeFantasia] = useState('');

  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const saveGuide = useFirstAccessGuide('conta:salvar-v1');

  const fotoMut = useMutation({
    mutationFn: updateFoto,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuario-me'] });
      qc.invalidateQueries({ queryKey: queryKeys.session });
      setAvatarDialogOpen(false);
    },
  });

  useEffect(() => {
    if (user) {
      setNome(user.nome ?? '');
      setEmail(user.email ?? '');
      setDocumento(user.documento ?? '');
      setPais(user.pais ?? '');
      setEstado(user.estado ?? '');
      setCidade(user.cidade ?? '');
    }
  }, [user]);

  useEffect(() => {
    if (perfilEmpresa) {
      setNomeFantasia(perfilEmpresa.nome_fantasia ?? '');
    }
  }, [perfilEmpresa]);

  const isCnpj = documento.replace(/\D/g, '').length === 14;

  const updateMut = useMutation({ mutationFn: updateMe });
  const savePerfilMut = useMutation({ mutationFn: (v: Parameters<typeof savePerfil>[0]) => savePerfil(v, perfilEmpresa!.id) });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    try {
      await updateMut.mutateAsync({ nome, email, documento, pais, estado, cidade });

      if (perfilEmpresa) {
        await savePerfilMut.mutateAsync({
          tipo: 'empresa',
          nome: perfilEmpresa.nome,
          documento: perfilEmpresa.documento ?? undefined,
          razao_social: perfilEmpresa.razao_social ?? undefined,
          nome_fantasia: nomeFantasia,
          atividade: perfilEmpresa.atividade ?? undefined,
          enquadramento: perfilEmpresa.enquadramento ?? undefined,
        });
        qc.invalidateQueries({ queryKey: queryKeys.perfis });
      }

      qc.invalidateQueries({ queryKey: ['usuario-me'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setFormError((err as Error).message);
    }
  };

  if (isLoading) return <div className="py-12 text-center text-sm text-slate-400">Carregando perfil...</div>;
  if (!user) return <div className="py-12 text-center text-sm text-slate-400">Não foi possível carregar os dados do perfil.</div>;

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <form onSubmit={handleSubmit} className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* Info do usuário */}
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-brand-100">
              {user.foto ? (
                <img src={user.foto} alt="" className="h-full w-full object-cover" />
              ) : (
                <User size={26} className="text-brand-600" />
              )}
            </div>
            <button
              type="button"
              onClick={() => setAvatarDialogOpen(true)}
              aria-label="Alterar foto de perfil"
              className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white shadow-sm transition hover:bg-brand-700 dark:border-slate-800"
            >
              <Pencil size={11} />
            </button>
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-base font-bold text-slate-900">{user.nome}</p>
            <p className="truncate text-sm text-slate-500">{user.email}</p>
            <div className="mt-1 flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TYPE_BADGE[user.tipo] ?? TYPE_BADGE.padrao}`}>
                {user.tipo}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[user.status] ?? STATUS_BADGE.ativo}`}>
                {user.status}
              </span>
              {user.foto && (
                <button
                  type="button"
                  onClick={() => fotoMut.mutate(null)}
                  disabled={fotoMut.isPending}
                  className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-red-500"
                >
                  <X size={11} /> Remover foto
                </button>
              )}
            </div>
          </div>
        </div>

        <SectionDivider label="Dados da conta" />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome completo">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" required />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
          </Field>
          <Field label="Documento (CPF/CNPJ)">
            <Input value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="000.000.000-00" />
          </Field>
          {isCnpj && perfilEmpresa && (
            <Field label="Nome fantasia">
              <Input value={nomeFantasia} onChange={(e) => setNomeFantasia(e.target.value)} placeholder="Ex: ABC Stores" required />
            </Field>
          )}
          <Field label="País">
            <Input value={pais} onChange={(e) => setPais(e.target.value)} placeholder="Brasil" />
          </Field>
          <Field label="Estado">
            <Input value={estado} onChange={(e) => setEstado(e.target.value)} placeholder="SP" />
          </Field>
          <Field label="Cidade">
            <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Sua cidade" />
          </Field>
        </div>

        {formError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>
        )}

        <div className="relative flex items-center justify-end gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 size={15} /> Salvo com sucesso
            </span>
          )}
          <Button type="submit" icon={<Save size={15} />} disabled={updateMut.isPending || savePerfilMut.isPending}>
            Salvar
          </Button>
          {saveGuide.isVisible && (
            <FirstAccessGuideCard
              icon={Save}
              description={firstAccessGuideMessages.contaSalvar}
              align="right"
              floating
              placement="top"
              className={`absolute right-0 top-full ${Z_GUIDE} mt-3 w-[min(24rem,calc(100vw-2rem))]`}
              onDismiss={saveGuide.dismiss}
            />
          )}
        </div>
      </form>

      <AvatarUploadDialog
        open={avatarDialogOpen}
        onClose={() => setAvatarDialogOpen(false)}
        onConfirm={(dataUrl) => fotoMut.mutate(dataUrl)}
        isSaving={fotoMut.isPending}
      />
    </div>
  );
}
