import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Save, CheckCircle2 } from 'lucide-react';
import { fetchMe, updateMe } from '../../services/usuariosService';
import { Button } from '../../ui/button';
import { Field, Input } from '../../ui/form';

type PasswordStrength = { label: string; color: string; percent: number } | null;

function evaluateStrength(senha: string): PasswordStrength {
  if (senha.length === 0) return null;
  if (senha.length < 8) return { label: 'Fraca', color: '#f97316', percent: 33 };
  const hasDigitOrSpecial = /[0-9]/.test(senha) || /[^A-Za-z0-9]/.test(senha);
  if (hasDigitOrSpecial) return { label: 'Forte', color: '#16a34a', percent: 100 };
  return { label: 'Média', color: '#eab308', percent: 66 };
}

export function SecurityTab() {
  const qc = useQueryClient();
  const { data: user } = useQuery({ queryKey: ['usuario-me'], queryFn: fetchMe });
  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [senhaConfirm, setSenhaConfirm] = useState('');
  const [currentPasswordError, setCurrentPasswordError] = useState('');
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState(false);

  const updateMut = useMutation({ mutationFn: updateMe });

  const strength = evaluateStrength(senhaNova);
  const confirmMismatch = senhaConfirm.length > 0 && senhaNova !== senhaConfirm;
  const canSubmit = senhaAtual.length > 0 && senhaNova.length >= 8 && senhaNova === senhaConfirm;

  const reset = () => {
    setSenhaAtual('');
    setSenhaNova('');
    setSenhaConfirm('');
    setCurrentPasswordError('');
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setCurrentPasswordError('');
    if (!user || !canSubmit) return;

    try {
      await updateMut.mutateAsync({
        nome: user.nome, email: user.email, documento: user.documento,
        pais: user.pais ?? undefined, estado: user.estado ?? undefined, cidade: user.cidade ?? undefined,
        senha_atual: senhaAtual, nova_senha: senhaNova,
      });
      qc.invalidateQueries({ queryKey: ['usuario-me'] });
      reset();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      const message = (err as Error).message;
      if (/senha atual|current password/i.test(message)) {
        setCurrentPasswordError(message);
      } else {
        setFormError(message);
      }
    }
  };

  return (
    <div className="grid gap-6">
      <form onSubmit={handleSubmit} className="grid gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/40">
            <KeyRound size={18} className="text-brand-600 dark:text-brand-300" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Alterar senha</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Você continuará conectado neste dispositivo</p>
          </div>
        </div>

        <Field label="Senha atual" error={currentPasswordError}>
          <Input
            type="password"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </Field>

        <Field label="Nova senha" hint="Mínimo 8 caracteres">
          <Input
            type="password"
            value={senhaNova}
            onChange={(e) => setSenhaNova(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </Field>
        {strength && (
          <div className="-mt-3 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${strength.percent}%`, background: strength.color }}
              />
            </div>
            <span className="text-xs font-semibold" style={{ color: strength.color }}>{strength.label}</span>
          </div>
        )}

        <Field label="Confirmar nova senha" error={confirmMismatch ? 'As senhas não conferem.' : undefined}>
          <Input
            type="password"
            value={senhaConfirm}
            onChange={(e) => setSenhaConfirm(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            className={confirmMismatch ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : ''}
          />
        </Field>

        {formError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {formError}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 size={15} /> Senha alterada com sucesso
            </span>
          )}
          <Button type="submit" icon={<Save size={15} />} disabled={!canSubmit || updateMut.isPending}>
            {updateMut.isPending ? 'Salvando...' : 'Alterar senha'}
          </Button>
        </div>
      </form>
    </div>
  );
}
