import { useState, type FormEvent } from 'react';
import { Button } from '@ui/components/button';
import { IsoDateField } from '@ui/components/DateField';
import { Dialog } from '@ui/components/dialog';
import { Field, Input, PasswordInput, Select, inputBase } from '@ui/components/form';
import { formatCpf, formatPhone } from '@ui/utils/brazilDocuments';
import { useTeamUserMutations } from '../../hooks/useTeam';
import type { DomainLists, TeamMember } from '../../types';
import {
  EMPTY_TEAM_USER_FORM,
  MIN_PASSWORD_LENGTH,
  buildNewTeamUser,
  buildTeamUserUpdate,
  formValuesFromMember,
  fullName,
  validateTeamUserForm,
  type TeamUserFormErrors,
  type TeamUserFormValues,
} from '../../utils/teamMembers';
import { PhotoControl } from './PhotoControl';

/** Cadastro de usuário novo ou edição do colaborador; fechado: null. */
export type MemberFormTarget = { kind: 'new' } | { kind: 'edit'; member: TeamMember };

interface MemberFormDialogProps {
  target: MemberFormTarget | null;
  lists: DomainLists | undefined;
  onClose: () => void;
  /** Aviso quando o valor da assinatura recorrente não pôde ser atualizado. */
  onWarning: (warning: string) => void;
}

/**
 * Formulário de usuário do módulo (só o titular), no modelo do de Finanças: foto, dados, dados de trabalho (cargo,
 * setor e admissão, das listas padrão) e senha. O usuário é só de Licitações: nada é criado em Finanças.
 */
export function MemberFormDialog({ target, lists, onClose, onWarning }: MemberFormDialogProps) {
  const title = target?.kind === 'edit' ? `Editar ${fullName(target.member)}` : 'Adicionar usuário';
  const description = target?.kind === 'new' ? 'Ele entra com o próprio e-mail e senha e usa Licitações nesta conta.' : undefined;

  return (
    <Dialog open={target !== null} title={title} description={description} onClose={onClose} size="card">
      {target && (
        <MemberForm
          // O formulário nasce de novo a cada abertura e a cada usuário: o estado dos campos não vaza de um para outro.
          key={target.kind === 'edit' ? target.member.userId : 'new'}
          member={target.kind === 'edit' ? target.member : null}
          lists={lists}
          onClose={onClose}
          onWarning={onWarning}
        />
      )}
    </Dialog>
  );
}

type NamedList = ReadonlyArray<{ id: string; name: string }>;

/** A lista padrão mais o valor atual, que fica visível mesmo se a lista ainda carrega ou o código saiu dela. */
function optionsWithCurrent(list: NamedList | undefined, current: string): NamedList {
  const items = list ?? [];
  return current !== '' && !items.some((item) => item.id === current) ? [...items, { id: current, name: current }] : items;
}

interface MemberFormProps {
  member: TeamMember | null;
  lists: DomainLists | undefined;
  onClose: () => void;
  onWarning: (warning: string) => void;
}

function MemberForm({ member, lists, onClose, onWarning }: MemberFormProps) {
  const { create, update, uploadPhoto, removePhoto } = useTeamUserMutations();
  const mode = member ? 'edit' : 'create';
  const [values, setValues] = useState<TeamUserFormValues>(() =>
    member ? formValuesFromMember(member, formatCpf) : EMPTY_TEAM_USER_FORM,
  );
  const [errors, setErrors] = useState<TeamUserFormErrors>({});

  const saving = create.isPending || update.isPending;
  const submitError = (create.error ?? update.error)?.message ?? null;
  const photoError = (uploadPhoto.error ?? removePhoto.error)?.message ?? null;

  const setField = <K extends keyof TeamUserFormValues>(field: K, value: TeamUserFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateTeamUserForm(values, mode);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }
    if (member) {
      update.mutate({ userId: member.userId, changes: buildTeamUserUpdate(values) }, { onSuccess: onClose });
      return;
    }
    create.mutate(buildNewTeamUser(values), {
      onSuccess: (change) => {
        if (change.warning) {
          onWarning(change.warning);
        }
        onClose();
      },
    });
  };

  return (
    <form className="grid gap-3.5" onSubmit={handleSubmit} noValidate>
      {member && (
        <PhotoControl
          name={fullName(member)}
          photoUrl={member.photoUrl}
          onUpload={(image) => uploadPhoto.mutate({ userId: member.userId, image })}
          onRemove={() => removePhoto.mutate(member.userId)}
          busy={uploadPhoto.isPending || removePhoto.isPending}
          error={photoError}
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nome" required error={errors.name}>
          <Input aria-label="Nome" value={values.name} onChange={(event) => setField('name', event.target.value)} maxLength={255} autoFocus />
        </Field>
        <Field label="Sobrenome">
          <Input aria-label="Sobrenome" value={values.lastName} onChange={(event) => setField('lastName', event.target.value)} maxLength={255} />
        </Field>
        <Field label="E-mail" required error={errors.email}>
          <Input
            aria-label="E-mail"
            type="email"
            value={values.email}
            onChange={(event) => setField('email', event.target.value)}
            maxLength={255}
            autoComplete="off"
          />
        </Field>
        <Field label="CPF" error={errors.document} hint={mode === 'create' ? 'Opcional. Sem CPF, ele entra pelo e-mail.' : undefined}>
          <Input
            aria-label="CPF"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={values.document}
            onChange={(event) => setField('document', formatCpf(event.target.value))}
            maxLength={14}
          />
        </Field>
        <Field label="Telefone">
          <Input
            aria-label="Telefone"
            inputMode="tel"
            placeholder="(00) 00000-0000"
            value={values.phone}
            onChange={(event) => setField('phone', formatPhone(event.target.value))}
            maxLength={20}
          />
        </Field>
        <Field label="Data de admissão">
          <IsoDateField
            label="Data de admissão"
            value={values.admissionDate}
            onChange={(iso) => setField('admissionDate', iso)}
            inputClassName={inputBase}
            height={32}
          />
        </Field>
        <Field label="Cargo">
          <Select aria-label="Cargo" value={values.jobTitle} onChange={(event) => setField('jobTitle', event.target.value)}>
            <option value="">Sem cargo</option>
            {optionsWithCurrent(lists?.memberJobTitles, values.jobTitle).map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Setor">
          <Select aria-label="Setor" value={values.sector} onChange={(event) => setField('sector', event.target.value)}>
            <option value="">Sem setor</option>
            {optionsWithCurrent(lists?.memberSectors, values.sector).map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label={mode === 'create' ? 'Senha' : 'Nova senha'}
        required={mode === 'create'}
        error={errors.password}
        hint={
          mode === 'create'
            ? `Pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`
            : `Deixe em branco para manter a senha atual. Mínimo de ${MIN_PASSWORD_LENGTH} caracteres.`
        }
      >
        <PasswordInput
          aria-label={mode === 'create' ? 'Senha' : 'Nova senha'}
          value={values.password}
          onChange={(event) => setField('password', event.target.value)}
          autoComplete="new-password"
        />
      </Field>

      {submitError && (
        <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">{submitError}</p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Salvando…' : mode === 'create' ? 'Adicionar' : 'Salvar'}</Button>
      </div>
    </form>
  );
}
