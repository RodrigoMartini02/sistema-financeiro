import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Save } from 'lucide-react';
import { fetchMe, updateMe } from '../../services/usuariosService';
import { Dialog } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Field, Input } from '../../ui/form';

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const qc = useQueryClient();
  const { data: user } = useQuery({ queryKey: ['usuario-me'], queryFn: fetchMe, enabled: open });
  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [senhaConfirm, setSenhaConfirm] = useState('');
  const [formError, setFormError] = useState('');
  const [currentPasswordError, setCurrentPasswordError] = useState('');

  const updateMut = useMutation({ mutationFn: updateMe });

  const reset = () => {
    setSenhaAtual('');
    setSenhaNova('');
    setSenhaConfirm('');
    setFormError('');
    setCurrentPasswordError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setCurrentPasswordError('');

    if (!senhaAtual) { setFormError('Informe a senha atual'); return; }
    if (senhaNova.length < 8) { setFormError('A nova senha deve ter pelo menos 8 caracteres'); return; }
    if (senhaNova !== senhaConfirm) { setFormError('As senhas não coincidem'); return; }
    if (!user) { setFormError('Não foi possível carregar os dados da conta'); return; }

    try {
      await updateMut.mutateAsync({
        nome: user.nome, email: user.email, documento: user.documento,
        pais: user.pais ?? undefined, estado: user.estado ?? undefined, cidade: user.cidade ?? undefined,
        senha_atual: senhaAtual, nova_senha: senhaNova,
      });
      qc.invalidateQueries({ queryKey: ['usuario-me'] });
      reset();
      onClose();
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
    <Dialog open={open} onClose={handleClose} title="Redefinir senha" description="Você continuará conectado neste dispositivo">
      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="flex items-center gap-3 pb-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100">
            <KeyRound size={18} className="text-brand-600" />
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
        <Field label="Confirmar nova senha">
          <Input
            type="password"
            value={senhaConfirm}
            onChange={(e) => setSenhaConfirm(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </Field>

        {formError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={handleClose}>Fechar</Button>
          <Button type="submit" icon={<Save size={15} />} disabled={updateMut.isPending || !user}>
            Alterar senha
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
