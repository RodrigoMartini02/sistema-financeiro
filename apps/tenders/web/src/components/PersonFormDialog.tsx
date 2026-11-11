import { useState, type FormEvent } from 'react';
import { Button } from '@ui/components/button';
import { Dialog } from '@ui/components/dialog';
import { Checkbox, Field, Input } from '@ui/components/form';
import { InfoBanner } from '@ui/components/InfoBanner';
import { formatCpf, formatPhone } from '@ui/utils/brazilDocuments';
import { useCreateVaultPerson, useUpdateVaultPerson } from '../hooks/useVault';
import type { VaultPerson } from '../types';
import {
  EMPTY_PERSON_FORM,
  MAX_PERSON_EMAIL_LENGTH,
  MAX_PERSON_JOB_TITLE_LENGTH,
  MAX_PERSON_NAME_LENGTH,
  MAX_PERSON_PHONE_LENGTH,
  buildNewPerson,
  buildPersonChanges,
  personFormFrom,
  validatePersonForm,
  type PersonFormErrors,
  type PersonFormValues,
} from '../utils/vault';

// Cadastrar ou editar uma pessoa ligada à empresa (sócio, representante legal, procurador, responsável técnico). Só o titular
// a vê. O CPF é único na conta; a API confere de novo tudo o que aqui se confere e responde "já existe" se o CPF repetir.

export type PersonFormTarget = { mode: 'create' } | { mode: 'edit'; person: VaultPerson };

interface PersonFormDialogProps {
  target: PersonFormTarget | null;
  /** Os papéis da lista padrão (`GET /domains`). */
  roles: ReadonlyArray<{ id: string; name: string }>;
  onClose: () => void;
}

export function PersonFormDialog({ target, roles, onClose }: PersonFormDialogProps) {
  const editing = target?.mode === 'edit';
  return (
    <Dialog
      open={target !== null}
      title={editing ? `Editar ${target.person.name}` : 'Cadastrar pessoa'}
      description={editing ? undefined : 'Sócios, representantes legais, procuradores e responsáveis técnicos que a empresa usa nas licitações.'}
      onClose={onClose}
      size="card"
    >
      {target && <PersonForm key={target.mode === 'edit' ? target.person.id : 'new'} target={target} roles={roles} onClose={onClose} />}
    </Dialog>
  );
}

function PersonForm({ target, roles, onClose }: { target: PersonFormTarget; roles: PersonFormDialogProps['roles']; onClose: () => void }) {
  const create = useCreateVaultPerson();
  const update = useUpdateVaultPerson();
  const [values, setValues] = useState<PersonFormValues>(() => (target.mode === 'edit' ? personFormFrom(target.person, formatCpf) : EMPTY_PERSON_FORM));
  const [errors, setErrors] = useState<PersonFormErrors>({});
  const saving = create.isPending || update.isPending;
  const submitError = (create.error ?? update.error)?.message ?? null;

  const setField = <K extends keyof PersonFormValues>(field: K, value: PersonFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const toggleRole = (roleId: string, checked: boolean) => {
    setValues((current) => ({
      ...current,
      roles: checked ? [...current.roles, roleId] : current.roles.filter((role) => role !== roleId),
    }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validatePersonForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (target.mode === 'edit') {
      update.mutate({ id: target.person.id, changes: buildPersonChanges(values) }, { onSuccess: onClose });
      return;
    }
    create.mutate(buildNewPerson(values), { onSuccess: onClose });
  };

  return (
    <form className="grid gap-3.5" onSubmit={handleSubmit} noValidate>
      <InfoBanner variant="info">
        Guarde só dados de pessoas que a empresa pode guardar para as licitações dela. Só o titular da conta vê as pessoas e os documentos delas.
      </InfoBanner>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome" required error={errors.name}>
          <Input aria-label="Nome" value={values.name} onChange={(event) => setField('name', event.target.value)} maxLength={MAX_PERSON_NAME_LENGTH} autoFocus />
        </Field>
        <Field label="CPF" required error={errors.cpf}>
          <Input
            aria-label="CPF"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={values.cpf}
            onChange={(event) => setField('cpf', formatCpf(event.target.value))}
            maxLength={14}
            autoComplete="off"
          />
        </Field>
        <Field label="Cargo" hint="Opcional.">
          <Input
            aria-label="Cargo"
            value={values.jobTitle}
            onChange={(event) => setField('jobTitle', event.target.value)}
            maxLength={MAX_PERSON_JOB_TITLE_LENGTH}
            placeholder="Ex.: Diretora comercial"
          />
        </Field>
        <Field label="Telefone" hint="Opcional.">
          <Input
            aria-label="Telefone"
            inputMode="tel"
            placeholder="(00) 00000-0000"
            value={values.phone}
            onChange={(event) => setField('phone', formatPhone(event.target.value))}
            maxLength={MAX_PERSON_PHONE_LENGTH}
          />
        </Field>
      </div>
      <Field label="E-mail" error={errors.email} hint="Opcional.">
        <Input
          aria-label="E-mail"
          type="email"
          value={values.email}
          onChange={(event) => setField('email', event.target.value)}
          maxLength={MAX_PERSON_EMAIL_LENGTH}
          autoComplete="off"
        />
      </Field>

      <Field label="Papéis na empresa" required error={errors.roles}>
        <div role="group" aria-label="Papéis na empresa" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {roles.map((role) => (
            <Checkbox key={role.id} label={role.name} checked={values.roles.includes(role.id)} onChange={(checked) => toggleRole(role.id, checked)} />
          ))}
        </div>
      </Field>

      {submitError && (
        <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
          {submitError}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? 'Salvando…' : target.mode === 'create' ? 'Cadastrar' : 'Salvar'}
        </Button>
      </div>
    </form>
  );
}
