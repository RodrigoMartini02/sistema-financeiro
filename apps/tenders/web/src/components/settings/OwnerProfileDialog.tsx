import { useState, type FormEvent } from 'react';
import { Button } from '@ui/components/button';
import { Dialog } from '@ui/components/dialog';
import { Field, Input } from '@ui/components/form';
import { formatPhone } from '@ui/utils/brazilDocuments';
import { useOwnerProfileMutations } from '../../hooks/useOwnerProfile';
import type { OwnerProfile } from '../../types';
import {
  buildOwnerProfileUpdate,
  fullName,
  ownerFormValuesFrom,
  validateOwnerForm,
  type OwnerFormValues,
} from '../../utils/teamMembers';
import { PhotoControl } from './PhotoControl';

interface OwnerProfileDialogProps {
  /** Perfil do titular; fechado: null. */
  profile: OwnerProfile | null;
  onClose: () => void;
}

/**
 * "Meus dados" do titular: nome, sobrenome, telefone e foto. O e-mail e a senha do acesso seguem pelo login e pela
 * recuperação de senha, e não mudam aqui.
 */
export function OwnerProfileDialog({ profile, onClose }: OwnerProfileDialogProps) {
  return (
    <Dialog open={profile !== null} title="Meus dados" onClose={onClose} size="sm">
      {profile && <OwnerProfileForm key={profile.userId} profile={profile} onClose={onClose} />}
    </Dialog>
  );
}

function OwnerProfileForm({ profile, onClose }: { profile: OwnerProfile; onClose: () => void }) {
  const { update, uploadPhoto, removePhoto } = useOwnerProfileMutations();
  const [values, setValues] = useState<OwnerFormValues>(() => ownerFormValuesFrom(profile));
  const [nameError, setNameError] = useState<string | undefined>();

  const photoBusy = uploadPhoto.isPending || removePhoto.isPending;
  const photoError = (uploadPhoto.error ?? removePhoto.error)?.message ?? null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateOwnerForm(values);
    setNameError(found.name);
    if (found.name) {
      return;
    }
    update.mutate(buildOwnerProfileUpdate(values), { onSuccess: onClose });
  };

  return (
    <form className="grid gap-3.5" onSubmit={handleSubmit} noValidate>
      <PhotoControl
        name={fullName(profile)}
        photoUrl={profile.photoUrl}
        onUpload={(image) => uploadPhoto.mutate(image)}
        onRemove={() => removePhoto.mutate()}
        busy={photoBusy}
        error={photoError}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome" required error={nameError}>
          <Input
            aria-label="Nome"
            value={values.name}
            onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
            maxLength={255}
            autoFocus
          />
        </Field>
        <Field label="Sobrenome">
          <Input
            aria-label="Sobrenome"
            value={values.lastName}
            onChange={(event) => setValues((current) => ({ ...current, lastName: event.target.value }))}
            maxLength={255}
          />
        </Field>
      </div>
      <Field label="Telefone">
        <Input
          aria-label="Telefone"
          inputMode="tel"
          placeholder="(00) 00000-0000"
          value={values.phone}
          onChange={(event) => setValues((current) => ({ ...current, phone: formatPhone(event.target.value) }))}
          maxLength={20}
        />
      </Field>
      <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
        O e-mail ({profile.email}) e a senha do seu acesso não mudam por aqui.
      </p>
      {update.error && (
        <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{update.error.message}</p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={update.isPending}>{update.isPending ? 'Salvando…' : 'Salvar'}</Button>
      </div>
    </form>
  );
}
