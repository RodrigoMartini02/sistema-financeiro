import { useEffect } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Controller, useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, TriangleAlert } from 'lucide-react';
import { Button } from '../../ui/button';
import { Dialog } from '../../ui/dialog';
import { Field, Input, ToggleGroup, ToggleRow } from '../../ui/form';
import { getLocalTodayIso } from '../../utils/date';
import { useSaveContractSavedSearch } from '../hooks/useContractSearchMutations';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useDomainLists, useDomainLookups } from '../hooks/useDomainLists';
import { previewContractSavedSearch } from '../services/contractSearchesService';
import { tendersQueryKeys } from '../services/queryKeys';
import type { TendersApiError } from '../services/tendersApiError';
import type { ContractSavedSearch, ContractSearchCriteriaBody, ContractSearchPreview } from '../types';
import {
  MAX_SUPPLIERS,
  contractFormToBody,
  contractPreviewCriteria,
  contractSearchFormSchema,
  type ContractSearchFormValues,
} from '../utils/contractSearchForm';
import { TERMS_MODE_LABELS, formatCnpj } from '../utils/labels';
import { MAX_AGENCIES, MAX_MUNICIPALITIES, MAX_TERMS } from '../utils/savedSearchForm';
import { CheckList, StatePicker } from './ChoicePickers';
import { ExpiryBadge } from './ContractBadges';
import { LoadError, LoadingBlock } from './LoadStates';
import { MoneyField } from './MoneyField';
import { MunicipalityPicker } from './MunicipalityPicker';
import { noticePlace } from './NoticeCard';
import { errorMessage, joinWithAnd, parseCnpj, parseTerm } from './SavedSearchFormDialog';
import { TagInput } from './TagInput';

// Formulário da busca salva de contratos (plano .plans/licitacoes-contratos-a-vencer.md,
// Parte B), como o de editais: diálogo grande com prévia ao vivo. Serve para
// criar, editar e "Salvar esta busca" (Contratos a vencer).

const PREVIEW_DEBOUNCE_MS = 500;
const FORM_FIELDS = new Set<string>([
  'name',
  'terms',
  'termsMode',
  'excludedTerms',
  'states',
  'cityIbgeCodes',
  'agencyCnpjs',
  'categories',
  'supplierCnpjs',
  'minValue',
  'maxValue',
  'includeWithoutValue',
]);

export interface ContractSearchFormTarget {
  /** Busca em edição; sem ela, criação. */
  search?: ContractSavedSearch;
  initialValues: ContractSearchFormValues;
  /** O que a busca da tela tinha e fica de fora ("Salvar esta busca"). */
  leftOut?: string[];
}

function PreviewPanel({ criteria }: { criteria: ContractSearchCriteriaBody | null }) {
  const key = criteria ? JSON.stringify(criteria) : null;
  const debouncedKey = useDebouncedValue(key, PREVIEW_DEBOUNCE_MS);
  const preview = useQuery<ContractSearchPreview, TendersApiError>({
    queryKey: tendersQueryKeys.contractSearchPreview(debouncedKey ?? ''),
    queryFn: () => previewContractSavedSearch(JSON.parse(debouncedKey ?? '{}') as ContractSearchCriteriaBody),
    enabled: debouncedKey !== null,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    retry: false,
  });
  const waiting = key !== debouncedKey || preview.isFetching;
  const todayIso = getLocalTodayIso();

  let body;
  if (key === null) {
    body = <p className="text-xs text-slate-500 dark:text-slate-400">Informe ao menos um critério válido para ver quantos contratos vigentes batem.</p>;
  } else if (preview.isError) {
    body = <LoadError title="Prévia indisponível" message={preview.error.message} onRetry={() => void preview.refetch()} retrying={preview.isFetching} />;
  } else if (!preview.data) {
    body = <LoadingBlock label="Calculando…" />;
  } else {
    const { count, items } = preview.data;
    body = (
      <div className={waiting ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {count === 1 ? '1 contrato vigente bate com esta busca' : `${count.toLocaleString('pt-BR')} contratos vigentes batem com esta busca`}
        </p>
        {items.length > 0 && (
          <ul className="mt-2 grid grid-cols-1 gap-2">
            {items.map((contract) => (
              <li key={contract.id} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-800">
                <p className="line-clamp-2 text-xs font-semibold text-slate-800 dark:text-slate-100">{contract.contractObject}</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{noticePlace(contract)}</p>
                <div className="mt-1">
                  <ExpiryBadge expiresOn={contract.expiresOn} todayIso={todayIso} />
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

interface ContractSearchFormProps {
  target: ContractSearchFormTarget;
  onClose: () => void;
  onSaved?: (search: ContractSavedSearch) => void;
}

function ContractSearchForm({ target, onClose, onSaved }: ContractSearchFormProps) {
  const domains = useDomainLists();
  const lookups = useDomainLookups();
  const save = useSaveContractSavedSearch();
  const form = useForm<ContractSearchFormValues>({
    resolver: zodResolver(contractSearchFormSchema),
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
        form.setError(field as keyof ContractSearchFormValues, { type: 'server', message: fieldError.message });
      }
    }
  };

  const onSubmit = form.handleSubmit((data) => {
    save.mutate(
      { id: target.search?.id, body: contractFormToBody(data) },
      {
        onSuccess: (saved) => {
          onSaved?.(saved);
          onClose();
        },
        onError: applyServerErrors,
      },
    );
  });

  const fieldError = (name: keyof FieldErrors<ContractSearchFormValues>) => errorMessage(errors[name]);
  const hasValueRange = (values.minValue ?? 0) > 0 || (values.maxValue ?? 0) > 0;
  const leftOut = target.leftOut ?? [];

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-[var(--dialog-px)] py-4">
        {leftOut.length > 0 && (
          <p className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            <TriangleAlert size={14} className="mt-px shrink-0" aria-hidden="true" />
            <span>
              Ficam de fora da busca salva: {joinWithAnd(leftOut)}. A busca salva sempre considera só os contratos vigentes.
            </span>
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="grid grid-cols-1 content-start gap-4">
            <Field label="Nome" required error={fieldError('name')}>
              <Input {...form.register('name')} aria-label="Nome da busca" placeholder="Ex.: Limpeza em prefeituras de SP" autoFocus />
            </Field>

            <Field label="Termos" error={fieldError('terms')} hint="Enter ou vírgula acrescenta. Cada termo pode ser uma frase, como coleta de lixo.">
              <Controller
                control={form.control}
                name="terms"
                render={({ field }) => (
                  <TagInput
                    label="Termos"
                    values={field.value}
                    onChange={field.onChange}
                    parse={parseTerm}
                    placeholder="Ex.: limpeza, vigilância"
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

            <Field label="Termos de exclusão" error={fieldError('excludedTerms')} hint="Contrato com algum destes termos fica de fora.">
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
                    render={({ field }) => <StatePicker label="UF" states={domains.data.states} selected={field.value} onChange={field.onChange} />}
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

                <Field label="Categorias" error={fieldError('categories')}>
                  <Controller
                    control={form.control}
                    name="categories"
                    render={({ field }) => (
                      <CheckList
                        label="Categorias"
                        options={domains.data.contractCategories.map((category) => ({ value: category.id, label: category.name }))}
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

            <Field label="Fornecedores (CNPJ)" error={fieldError('supplierCnpjs')}>
              <Controller
                control={form.control}
                name="supplierCnpjs"
                render={({ field }) => (
                  <TagInput
                    label="Fornecedores (CNPJ)"
                    values={field.value}
                    onChange={field.onChange}
                    parse={parseCnpj}
                    format={formatCnpj}
                    placeholder="00.000.000/0000-00 e Enter"
                    maxItems={MAX_SUPPLIERS}
                    maxItemsMessage={`Até ${MAX_SUPPLIERS} fornecedores.`}
                    invalid={Boolean(fieldError('supplierCnpjs'))}
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
                    label="Incluir contratos sem valor"
                    description={hasValueRange ? 'Os que não informam o valor também entram.' : 'Vale quando há valor mínimo ou máximo.'}
                    checked={hasValueRange && field.value}
                    disabled={!hasValueRange}
                    onChange={() => field.onChange(!field.value)}
                  />
                )}
              />
            </div>
          </div>

          <div className="lg:sticky lg:top-0 lg:self-start">
            <PreviewPanel criteria={contractPreviewCriteria(values)} />
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

interface ContractSearchFormDialogProps {
  target: ContractSearchFormTarget | null;
  onClose: () => void;
  onSaved?: (search: ContractSavedSearch) => void;
}

export function ContractSearchFormDialog({ target, onClose, onSaved }: ContractSearchFormDialogProps) {
  return (
    <Dialog
      open={target !== null}
      title={target?.search ? 'Editar busca salva de contratos' : 'Nova busca salva de contratos'}
      description="Os contratos vigentes que batem aparecem em Buscas salvas e, com Notificar ligado, o sino avisa 90 e 30 dias antes do vencimento."
      onClose={onClose}
      size="xl"
      scrollBody={false}
      fullHeight
    >
      {target && <ContractSearchForm key={target.search?.id ?? 'nova'} target={target} onClose={onClose} onSaved={onSaved} />}
    </Dialog>
  );
}
