import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@ui/components/button';
import { Dialog } from '@ui/components/dialog';
import { Field, Input } from '@ui/components/form';
import { formatCnpj as maskCnpj } from '@ui/utils/brazilDocuments';
import { useAddCompetitor, usePatchCompetitor } from '../hooks/useCompetitors';
import type { TendersApiError } from '../services/tendersApiError';
import type { Competitor } from '../types';
import {
  EMPTY_COMPETITOR_FORM,
  MAX_COMPETITOR_NICKNAME_LENGTH,
  competitorFormSchema,
  competitorFormToBody,
  competitorNicknameSchema,
  type CompetitorFormValues,
} from '../utils/competitors';
import { formatCnpj } from '../utils/labels';

// Diálogo de adicionar um concorrente (CNPJ e apelido opcional) ou de editar o apelido de um que já está na lista (o CNPJ
// não muda). Os erros do servidor (limite de 30, CNPJ recusado) aparecem no campo ou no rodapé.

export type CompetitorFormTarget = { mode: 'add' } | { mode: 'edit'; competitor: Competitor };

const FIELDS = new Set<string>(['cnpj', 'nickname']);

function serverFieldError(error: TendersApiError): { field: keyof CompetitorFormValues; message: string } | null {
  for (const fieldError of error.fieldErrors) {
    if (FIELDS.has(fieldError.field)) {
      return { field: fieldError.field as keyof CompetitorFormValues, message: fieldError.message };
    }
  }
  return null;
}

function AddForm({ onClose }: { onClose: () => void }) {
  const add = useAddCompetitor();
  const form = useForm<CompetitorFormValues>({ resolver: zodResolver(competitorFormSchema), defaultValues: EMPTY_COMPETITOR_FORM });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    add.mutate(competitorFormToBody(values), {
      onSuccess: onClose,
      onError: (error) => {
        const fieldError = serverFieldError(error);
        if (fieldError) form.setError(fieldError.field, { type: 'server', message: fieldError.message });
      },
    });
  });

  const cnpj = form.register('cnpj');
  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-1 gap-4 px-[var(--dialog-px)] py-4">
        <Field label="CNPJ do concorrente" required error={errors.cnpj?.message} hint="Com ou sem pontuação.">
          <Input
            {...cnpj}
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            placeholder="00.000.000/0000-00"
            aria-label="CNPJ do concorrente"
            onChange={(event) => {
              // A máscara acompanha a digitação.
              event.target.value = maskCnpj(event.target.value);
              void cnpj.onChange(event);
            }}
          />
        </Field>
        <Field label="Apelido" error={errors.nickname?.message} hint={`Opcional, até ${MAX_COMPETITOR_NICKNAME_LENGTH} caracteres. Sem apelido, o card mostra o nome da empresa.`}>
          <Input {...form.register('nickname')} aria-label="Apelido do concorrente" placeholder="Ex.: Concorrente do Sul" />
        </Field>
      </div>
      <Footer pending={add.isPending} error={add.error && !serverFieldError(add.error) ? add.error.message : null} submitLabel="Adicionar" onClose={onClose} />
    </form>
  );
}

function EditForm({ competitor, onClose }: { competitor: Competitor; onClose: () => void }) {
  const patch = usePatchCompetitor();
  const form = useForm<{ nickname: string }>({ resolver: zodResolver(competitorNicknameSchema), defaultValues: { nickname: competitor.nickname ?? '' } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    patch.mutate({ cnpj: competitor.cnpj, changes: { nickname: values.nickname.trim() } }, { onSuccess: onClose });
  });

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-1 gap-4 px-[var(--dialog-px)] py-4">
        <p className="text-xs text-slate-500 dark:text-slate-400">CNPJ {formatCnpj(competitor.cnpj)}</p>
        <Field label="Apelido" error={errors.nickname?.message} hint={`Em branco, o card volta a mostrar o nome da empresa. Até ${MAX_COMPETITOR_NICKNAME_LENGTH} caracteres.`}>
          <Input {...form.register('nickname')} aria-label="Apelido do concorrente" placeholder="Ex.: Concorrente do Sul" autoFocus />
        </Field>
      </div>
      <Footer pending={patch.isPending} error={patch.error?.message ?? null} submitLabel="Salvar" onClose={onClose} />
    </form>
  );
}

function Footer({ pending, error, submitLabel, onClose }: { pending: boolean; error: string | null; submitLabel: string; onClose: () => void }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[#eef2f6] px-[var(--dialog-px)] py-3 dark:border-slate-700">
      {error && (
        <p role="alert" className="mr-auto text-xs font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <Button type="button" variant="secondary" size="sm" onClick={onClose}>
        Cancelar
      </Button>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Salvando…' : submitLabel}
      </Button>
    </div>
  );
}

interface CompetitorFormDialogProps {
  target: CompetitorFormTarget | null;
  onClose: () => void;
}

export function CompetitorFormDialog({ target, onClose }: CompetitorFormDialogProps) {
  const editing = target?.mode === 'edit';
  return (
    <Dialog
      open={target !== null}
      title={editing ? 'Editar apelido' : 'Adicionar concorrente'}
      description={editing ? undefined : 'Acompanhe os contratos de um fornecedor e receba aviso no sino quando sair contrato novo.'}
      onClose={onClose}
      size="sm"
    >
      {target?.mode === 'add' && <AddForm onClose={onClose} />}
      {target?.mode === 'edit' && <EditForm key={target.competitor.cnpj} competitor={target.competitor} onClose={onClose} />}
    </Dialog>
  );
}
