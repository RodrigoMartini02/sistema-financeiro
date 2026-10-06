import { useEffect } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Controller, useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { Field, Input, ToggleGroup, ToggleRow } from '../../ui/form';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useDomainLists, useDomainLookups } from '../hooks/useDomainLists';
import { useSaveSavedSearch } from '../hooks/useSavedSearchMutations';
import { tendersQueryKeys } from '../services/queryKeys';
import { previewSavedSearch } from '../services/savedSearchesService';
import type { TendersApiError } from '../services/tendersApiError';
import type { SavedSearch, SavedSearchCriteriaBody, SavedSearchPreview } from '../types';
import { TERMS_MODE_LABELS, formatCnpj } from '../utils/labels';
import {
  MAX_AGENCIES,
  MAX_MUNICIPALITIES,
  MAX_TERM_LENGTH,
  MAX_TERMS,
  MIN_TERM_LENGTH,
  formToBody,
  normalizeTerm,
  previewCriteria,
  savedSearchFormSchema,
  type SavedSearchFormValues,
} from '../utils/savedSearchForm';
import { isValidCnpj, normalizeCnpj } from '../utils/searchFilters';
import { CheckList, StatePicker } from './ChoicePickers';
import { CountdownBadge } from './CountdownBadge';
import { LoadError, LoadingBlock } from './LoadStates';
import { MoneyField } from './MoneyField';
import { MunicipalityPicker } from './MunicipalityPicker';
import { noticePlace } from './NoticeCard';
import { TagInput, type TagParseResult } from './TagInput';

// Formulário da busca salva (escopo, seção 9.4): diálogo grande com prévia ao
// vivo. Serve para criar, editar e "Salvar esta busca" (Buscar).

const PREVIEW_DEBOUNCE_MS = 500;
const FORM_FIELDS = new Set<string>([
  'name',
  'terms',
  'termsMode',
  'excludedTerms',
  'states',
  'cityIbgeCodes',
  'agencyCnpjs',
  'modalities',
  'minValue',
  'maxValue',
  'includeWithoutValue',
  'priceRegistration',
]);

const PRICE_REGISTRATION_OPTIONS = [
  { value: 'any', label: 'Indiferente' },
  { value: 'yes', label: 'Só SRP' },
  { value: 'no', label: 'Sem SRP' },
];

export interface SavedSearchFormTarget {
  /** Busca em edição; sem ela, criação. */
  search?: SavedSearch;
  initialValues: SavedSearchFormValues;
  /** O que a busca da tela tinha e fica de fora ("Salvar esta busca"). */
  leftOut?: string[];
}

function parseTerm(text: string): TagParseResult {
  const term = normalizeTerm(text);
  return term.length >= MIN_TERM_LENGTH && term.length <= MAX_TERM_LENGTH
    ? { value: term }
    : { error: `Cada termo precisa ter de ${MIN_TERM_LENGTH} a ${MAX_TERM_LENGTH} caracteres.` };
}

function parseCnpj(text: string): TagParseResult {
  const digits = normalizeCnpj(text);
  return isValidCnpj(digits) ? { value: digits } : { error: 'Informe o CNPJ com 14 dígitos.' };
}

/** Mensagem do campo, também de listas (erro num item). */
function errorMessage(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as Record<string, unknown>;
  if (typeof record['message'] === 'string' && record['message']) return record['message'];
  for (const value of Object.values(record)) {
    const nested = errorMessage(value);
    if (nested) return nested;
  }
  return undefined;
}

function joinWithAnd(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

function PreviewPanel({ criteria }: { criteria: SavedSearchCriteriaBody | null }) {
  const key = criteria ? JSON.stringify(criteria) : null;
  const debouncedKey = useDebouncedValue(key, PREVIEW_DEBOUNCE_MS);
  const preview = useQuery<SavedSearchPreview, TendersApiError>({
    queryKey: tendersQueryKeys.savedSearchPreview(debouncedKey ?? ''),
    queryFn: () => previewSavedSearch(JSON.parse(debouncedKey ?? '{}') as SavedSearchCriteriaBody),
    enabled: debouncedKey !== null,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    retry: false,
  });
  const waiting = key !== debouncedKey || preview.isFetching;

  let body;
  if (key === null) {
    body = <p className="text-xs text-slate-500 dark:text-slate-400">Informe ao menos um critério válido para ver quantos editais abertos batem.</p>;
  } else if (preview.isError) {
    body = <LoadError title="Prévia indisponível" message={preview.error.message} onRetry={() => void preview.refetch()} retrying={preview.isFetching} />;
  } else if (!preview.data) {
    body = <LoadingBlock label="Calculando…" />;
  } else {
    const { count, items } = preview.data;
    body = (
      <div className={waiting ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {count === 1 ? '1 edital aberto bate com esta busca' : `${count.toLocaleString('pt-BR')} editais abertos batem com esta busca`}
        </p>
        {items.length > 0 && (
          <ul className="mt-2 grid grid-cols-1 gap-2">
            {items.map((notice) => (
              <li key={notice.id} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-800">
                <p className="line-clamp-2 text-xs font-semibold text-slate-800 dark:text-slate-100">{notice.procurementObject}</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{noticePlace(notice)}</p>
                <div className="mt-1">
                  <CountdownBadge closesAt={notice.proposalClosesAt} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <aside aria-label="Prévia" aria-live="polite" className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Prévia</h3>
        {waiting && key !== null && <Loader2 size={14} className="animate-spin text-brand-600" aria-label="Atualizando a prévia" />}
      </div>
      {body}
    </aside>
  );
}

interface SavedSearchFormProps {
  target: SavedSearchFormTarget;
  onClose: () => void;
  onSaved?: (search: SavedSearch) => void;
}

function SavedSearchForm({ target, onClose, onSaved }: SavedSearchFormProps) {
  const domains = useDomainLists();
  const lookups = useDomainLookups();
  const save = useSaveSavedSearch();
  const form = useForm<SavedSearchFormValues>({
    resolver: zodResolver(savedSearchFormSchema),
    defaultValues: target.initialValues,
  });
  const values = form.watch();
  const { errors, isSubmitted } = form.formState;

  // Depois da primeira tentativa, confere tudo a cada mudança: as regras que
  // cruzam campos (critério, mínimo e máximo) também se atualizam.
  useEffect(() => {
    if (!isSubmitted) return undefined;
    const subscription = form.watch(() => void form.trigger());
    return () => subscription.unsubscribe();
  }, [form, isSubmitted]);

  const applyServerErrors = (error: TendersApiError) => {
    for (const fieldError of error.fieldErrors) {
      const field = fieldError.field.split(/[.[]/)[0] ?? '';
      if (FORM_FIELDS.has(field)) {
        form.setError(field as keyof SavedSearchFormValues, { type: 'server', message: fieldError.message });
      }
    }
  };

  const onSubmit = form.handleSubmit((data) => {
    save.mutate(
      { id: target.search?.id, body: formToBody(data) },
      {
        onSuccess: (saved) => {
          onSaved?.(saved);
          onClose();
        },
        onError: applyServerErrors,
      },
    );
  });

  const fieldError = (name: keyof FieldErrors<SavedSearchFormValues>) => errorMessage(errors[name]);
  const hasValueRange = (values.minValue ?? 0) > 0 || (values.maxValue ?? 0) > 0;
  const leftOut = target.leftOut ?? [];

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-[var(--dialog-px)] py-4">
        {leftOut.length > 0 && (
          <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <TriangleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />
            <span>
              Ficam de fora da busca salva: {joinWithAnd(leftOut)}. A busca salva sempre considera só os editais abertos.
            </span>
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="grid grid-cols-1 content-start gap-4">
            <Field label="Nome" required error={fieldError('name')}>
              <Input {...form.register('name')} aria-label="Nome da busca" placeholder="Ex.: Software de gestão em SP" autoFocus />
            </Field>

            <Field label="Termos" error={fieldError('terms')} hint="Enter ou vírgula acrescenta. Cada termo pode ser uma frase, como licença de uso.">
              <Controller
                control={form.control}
                name="terms"
                render={({ field }) => (
                  <TagInput
                    label="Termos"
                    values={field.value}
                    onChange={field.onChange}
                    parse={parseTerm}
                    placeholder="Ex.: software, sistema de gestão"
                    maxItems={MAX_TERMS}
                    maxItemsMessage={`Até ${MAX_TERMS} termos.`}
                    commaSeparates
                    invalid={Boolean(fieldError('terms'))}
                  />
                )}
              />
            </Field>

            <Field label="Os termos valem como">
              <Controller
                control={form.control}
                name="termsMode"
                render={({ field }) => (
                  <div>
                    <ToggleGroup
                      value={field.value}
                      onChange={(value) => field.onChange(value === 'E' ? 'E' : 'OU')}
                      options={[
                        { value: 'OU', label: TERMS_MODE_LABELS.OU },
                        { value: 'E', label: TERMS_MODE_LABELS.E },
                      ]}
                    />
                  </div>
                )}
              />
            </Field>

            <Field label="Termos de exclusão" error={fieldError('excludedTerms')} hint="Edital com algum destes termos fica de fora.">
              <Controller
                control={form.control}
                name="excludedTerms"
                render={({ field }) => (
                  <TagInput
                    label="Termos de exclusão"
                    values={field.value}
                    onChange={field.onChange}
                    parse={parseTerm}
                    placeholder="Ex.: obra, combustível"
                    maxItems={MAX_TERMS}
                    maxItemsMessage={`Até ${MAX_TERMS} termos de exclusão.`}
                    commaSeparates
                    invalid={Boolean(fieldError('excludedTerms'))}
                  />
                )}
              />
            </Field>

            {domains.isError ? (
              <LoadError title="Listas indisponíveis" message={domains.error.message} onRetry={() => void domains.refetch()} retrying={domains.isFetching} />
            ) : !domains.data ? (
              <LoadingBlock label="Carregando listas…" />
            ) : (
              <>
                <Field label="UF" error={fieldError('states')}>
                  <Controller
                    control={form.control}
                    name="states"
                    render={({ field }) => (
                      <StatePicker label="UF" states={domains.data.states} selected={field.value} onChange={field.onChange} />
                    )}
                  />
                </Field>

                <Field label="Municípios" error={fieldError('cityIbgeCodes')}>
                  <Controller
                    control={form.control}
                    name="cityIbgeCodes"
                    render={({ field }) => (
                      <MunicipalityPicker
                        label="Municípios"
                        municipalities={domains.data.municipalities}
                        selected={field.value}
                        onChange={field.onChange}
                        nameOf={lookups.municipalityName}
                        maxItems={MAX_MUNICIPALITIES}
                      />
                    )}
                  />
                </Field>

                <Field label="Modalidades" error={fieldError('modalities')}>
                  <Controller
                    control={form.control}
                    name="modalities"
                    render={({ field }) => (
                      <CheckList
                        label="Modalidades"
                        options={domains.data.modalities.map((modality) => ({ value: modality.id, label: modality.name }))}
                        selected={field.value}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </Field>
              </>
            )}

            <Field label="Órgãos (CNPJ)" error={fieldError('agencyCnpjs')}>
              <Controller
                control={form.control}
                name="agencyCnpjs"
                render={({ field }) => (
                  <TagInput
                    label="Órgãos (CNPJ)"
                    values={field.value}
                    onChange={field.onChange}
                    parse={parseCnpj}
                    format={formatCnpj}
                    placeholder="00.000.000/0000-00 e Enter"
                    maxItems={MAX_AGENCIES}
                    maxItemsMessage={`Até ${MAX_AGENCIES} órgãos.`}
                    invalid={Boolean(fieldError('agencyCnpjs'))}
                  />
                )}
              />
            </Field>

            <div className="grid grid-cols-1 gap-2">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Valor mínimo" error={fieldError('minValue')}>
                  <Controller
                    control={form.control}
                    name="minValue"
                    render={({ field }) => (
                      <MoneyField label="Valor mínimo" value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={Boolean(fieldError('minValue'))} />
                    )}
                  />
                </Field>
                <Field label="Valor máximo" error={fieldError('maxValue')}>
                  <Controller
                    control={form.control}
                    name="maxValue"
                    render={({ field }) => (
                      <MoneyField label="Valor máximo" value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={Boolean(fieldError('maxValue'))} />
                    )}
                  />
                </Field>
              </div>
              <Controller
                control={form.control}
                name="includeWithoutValue"
                render={({ field }) => (
                  <ToggleRow
                    label="Incluir editais sem valor"
                    description={hasValueRange ? 'Os que não informam o valor também entram.' : 'Vale quando há valor mínimo ou máximo.'}
                    checked={hasValueRange && field.value}
                    disabled={!hasValueRange}
                    onChange={() => field.onChange(!field.value)}
                  />
                )}
              />
            </div>

            <Field label="Registro de preços (SRP)">
              <Controller
                control={form.control}
                name="priceRegistration"
                render={({ field }) => (
                  <div>
                    <ToggleGroup
                      value={field.value}
                      onChange={(value) => field.onChange(value === 'yes' || value === 'no' ? value : 'any')}
                      options={PRICE_REGISTRATION_OPTIONS}
                    />
                  </div>
                )}
              />
            </Field>
          </div>

          <div className="lg:sticky lg:top-0 lg:self-start">
            <PreviewPanel criteria={previewCriteria(values)} />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[#eef2f6] px-[var(--dialog-px)] py-3 dark:border-slate-700">
        {save.error && (
          <p role="alert" className="mr-auto text-xs font-medium text-red-600 dark:text-red-400">
            {save.error.message}
          </p>
        )}
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? 'Salvando…' : 'Salvar busca'}
        </Button>
      </div>
    </form>
  );
}

interface SavedSearchFormDialogProps {
  target: SavedSearchFormTarget | null;
  onClose: () => void;
  onSaved?: (search: SavedSearch) => void;
}

export function SavedSearchFormDialog({ target, onClose, onSaved }: SavedSearchFormDialogProps) {
  return (
    <Dialog
      open={target !== null}
      title={target?.search ? 'Editar busca salva' : 'Nova busca salva'}
      description="Os editais abertos que batem aparecem em Buscas salvas e, com Notificar ligado, no sino."
      onClose={onClose}
      size="xl"
      scrollBody={false}
      fullHeight
    >
      {target && <SavedSearchForm key={target.search?.id ?? 'nova'} target={target} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}
