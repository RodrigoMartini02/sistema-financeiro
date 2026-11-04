import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, Save } from 'lucide-react';
import { updatePassword } from '../../services/usuariosService';
import { Dialog } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Field, Input } from '../../ui/form';

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

export function ChangePasswordModal({ open, onClose }: ChangePasswordModalProps) {
  const [senhaNova, setSenhaNova] = useState('');
  const [formError, setFormError] = useState('');

  const updateMut = useMutation({ mutationFn: updatePassword });

  const reset = () => {
    setSenhaNova('');
    setFormError('');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (senhaNova.length < 8) { setFormError('A nova senha deve ter pelo menos 8 caracteres'); return; }

    try {
      await updateMut.mutateAsync(senhaNova);
      reset();
      onClose();
    } catch (err) {
      setFormError((err as Error).message);
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

        <Field label="Nova senha" hint="Mínimo 8 caracteres">
          <Input
            type="password"
            value={senhaNova}
            onChange={(e) => setSenhaNova(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </Field>

        {formError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <Button type="button" variant="secondary" onClick={handleClose}>Fechar</Button>
          <Button type="submit" icon={<Save size={15} />} disabled={updateMut.isPending}>
            Alterar senha
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
