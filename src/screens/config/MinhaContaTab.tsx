import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Lock, Save, CheckCircle2 } from 'lucide-react';
import { fetchMe, updateMe } from '../../services/usuariosService';
import { Button } from '../../ui/button';
import { Field, Input } from '../../ui/form';

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

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [saved, setSaved] = useState(false);

  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [senhaConfirm, setSenhaConfirm] = useState('');
  const [senhaError, setSenhaError] = useState('');
  const [senhaSaved, setSenhaSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setNome(user.nome ?? '');
      setEmail(user.email ?? '');
    }
  }, [user]);

  const updateMut = useMutation({
    mutationFn: updateMe,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['usuario-me'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const handleSavePerfil = (e: React.FormEvent) => {
    e.preventDefault();
    updateMut.mutate({ nome, email });
  };

  const handleSaveSenha = (e: React.FormEvent) => {
    e.preventDefault();
    setSenhaError('');
    if (senhaNova !== senhaConfirm) { setSenhaError('As senhas não coincidem'); return; }
    if (senhaNova.length < 8) { setSenhaError('A nova senha deve ter pelo menos 8 caracteres'); return; }
    updateMut.mutate(
      { nome, email, senha_atual: senhaAtual, nova_senha: senhaNova },
      {
        onSuccess: () => {
          setSenhaAtual(''); setSenhaNova(''); setSenhaConfirm('');
          setSenhaSaved(true);
          setTimeout(() => setSenhaSaved(false), 2500);
        },
        onError: (err) => setSenhaError(err.message),
      }
    );
  };

  if (isLoading) return <div className="py-12 text-center text-sm text-slate-400">Carregando perfil...</div>;
  if (!user) return <div className="py-12 text-center text-sm text-slate-400">Não foi possível carregar os dados do perfil.</div>;

  return (
    <div className="grid max-w-2xl gap-8">
      {/* Info do usuário */}
      <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 shrink-0">
          <User size={26} className="text-brand-600" />
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
          </div>
        </div>
        {user.documento && (
          <p className="hidden sm:block text-xs font-mono text-slate-400">{user.documento}</p>
        )}
      </div>

      {/* Dados pessoais */}
      <form onSubmit={handleSavePerfil} className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <User size={18} className="text-brand-600" />
          <h3 className="text-sm font-bold text-slate-900">Dados pessoais</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome completo">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome" required />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" />
          </Field>
        </div>

        {updateMut.error && !updateMut.variables?.senha_atual && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{updateMut.error.message}</div>
        )}

        <div className="flex items-center justify-end gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 size={15} /> Salvo com sucesso
            </span>
          )}
          <Button type="submit" icon={<Save size={15} />} disabled={updateMut.isPending}>
            Salvar dados
          </Button>
        </div>
      </form>

      {/* Trocar senha */}
      <form onSubmit={handleSaveSenha} className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-brand-600" />
          <h3 className="text-sm font-bold text-slate-900">Alterar senha</h3>
        </div>

        <Field label="Senha atual">
          <Input type="password" value={senhaAtual} onChange={(e) => setSenhaAtual(e.target.value)} placeholder="••••••••" required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nova senha" hint="Mínimo 8 caracteres">
            <Input type="password" value={senhaNova} onChange={(e) => setSenhaNova(e.target.value)} placeholder="••••••••" required />
          </Field>
          <Field label="Confirmar senha">
            <Input type="password" value={senhaConfirm} onChange={(e) => setSenhaConfirm(e.target.value)} placeholder="••••••••" required />
          </Field>
        </div>

        {senhaError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{senhaError}</div>
        )}

        <div className="flex items-center justify-end gap-3">
          {senhaSaved && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 size={15} /> Senha alterada!
            </span>
          )}
          <Button type="submit" icon={<Lock size={15} />} disabled={updateMut.isPending}>
            Alterar senha
          </Button>
        </div>
      </form>
    </div>
  );
}
