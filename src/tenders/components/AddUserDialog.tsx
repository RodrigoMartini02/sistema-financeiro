import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Field, Input, PasswordInput } from '../../ui/form';
import { tendersQueryKeys } from '../services/queryKeys';
import { createTeamUser } from '../services/settingsService';
import type { TendersApiError } from '../services/tendersApiError';
import type { NewTeamUser, TeamChange } from '../types';

const MIN_PASSWORD_LENGTH = 8;

interface AddUserDialogProps {
  open: boolean;
  onClose: () => void;
  /** Aviso quando o valor da assinatura recorrente não pôde ser atualizado. */
  onWarning: (warning: string) => void;
}

/** Usuário novo do módulo (só o titular): login próprio, já com acesso a Licitações. */
export function AddUserDialog({ open, onClose, onWarning }: AddUserDialogProps) {
  const queryClient = useQueryClient();
  const [formKey, setFormKey] = useState(0);

  const create = useMutation<TeamChange, TendersApiError, NewTeamUser>({
    mutationFn: createTeamUser,
    onSuccess: (change) => {
      void queryClient.invalidateQueries({ queryKey: tendersQueryKeys.team });
      void queryClient.invalidateQueries({ queryKey: tendersQueryKeys.billingAll });
      void queryClient.invalidateQueries({ queryKey: tendersQueryKeys.access });
      if (change.warning) {
        onWarning(change.warning);
      }
      setFormKey((key) => key + 1);
      onClose();
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    create.mutate({
      nome: text('nome'),
      sobrenome: text('sobrenome') || undefined,
      email: text('email'),
      senha: String(form.get('senha') ?? ''),
      documento: text('documento') || undefined,
    });
  };

  return (
    <Dialog open={open} title="Adicionar usuário" description="Ele entra com o próprio e-mail e senha e usa Licitações nesta conta." onClose={onClose} size="sm">
      <form key={formKey} className="grid gap-3 p-4" onSubmit={handleSubmit}>
        <Field label="Nome" required><Input name="nome" aria-label="Nome" required maxLength={255} autoFocus /></Field>
        <Field label="Sobrenome"><Input name="sobrenome" aria-label="Sobrenome" maxLength={255} /></Field>
        <Field label="E-mail" required><Input name="email" aria-label="E-mail" type="email" required autoComplete="off" /></Field>
        <Field label="Senha" required hint={`Pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`}>
          <PasswordInput name="senha" aria-label="Senha" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" />
        </Field>
        <Field label="CPF" hint="Opcional. Sem CPF, ele entra pelo e-mail.">
          <Input name="documento" aria-label="CPF" inputMode="numeric" maxLength={14} />
        </Field>
        {create.error && (
          <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{create.error.message}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Salvando…' : 'Adicionar'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
