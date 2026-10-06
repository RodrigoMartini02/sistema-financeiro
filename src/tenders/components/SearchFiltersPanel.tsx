import { useEffect, useId, useState, type ReactNode } from 'react';
import { ToggleRow } from '../../ui/form';
import type { DomainLookups } from '../hooks/useDomainLists';
import { TRACKING_FILTERS, type DomainLists } from '../types';
import { TRACKING_FILTER_LABELS, formatCnpj } from '../utils/labels';
import { decimalToReais, reaisToDecimal } from '../utils/money';
import { MAX_AGENCIES, MAX_MUNICIPALITIES, VALUE_RANGE_MESSAGE } from '../utils/savedSearchForm';
import { formatIsoDate } from '../utils/dates';
import {
  CLOSING_SHORTCUT_DAYS,
  MIN_DAYS_TO_CLOSE,
  activeClosingShortcut,
  closingWithinDays,
  isValidCnpj,
  minimumClosingDate,
  normalizeCnpj,
  withFilters,
  type SearchState,
} from '../utils/searchFilters';
import { CheckList, StatePicker } from './ChoicePickers';
import { FilterDateField } from './FilterDateField';
import { LoadError, LoadingBlock } from './LoadStates';
import { MoneyField } from './MoneyField';
import { MunicipalityPicker } from './MunicipalityPicker';
import { TagInput } from './TagInput';

const DATE_ORDER_MESSAGE = 'A data inicial não pode ser depois da final.';

function FilterSection({ title, children, error }: { title: string; children: ReactNode; error?: string | null }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="grid grid-cols-1 gap-2">
      <h3 id={headingId} className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </h3>
      {children}
      {error && (
        <p role="alert" className="text-[11px] font-medium text-[#dc2626]">
          {error}
        </p>
      )}
    </section>
  );
}

interface SearchFiltersPanelProps {
  state: SearchState;
  onChange: (next: SearchState) => void;
  domains: {
    data: DomainLists | undefined;
    errorMessage: string | null;
    retry: () => void;
    retrying: boolean;
  };
  lookups: DomainLookups;
  todayIso: string;
}

/**
 * Filtros de Buscar (escopo, seção 9.4). Escolhas valem na hora; valores e
 * datas, ao sair do campo. Com busca salva, os critérios vêm dela e ficam
 * travados aqui.
 */
export function SearchFiltersPanel({ state, onChange, domains, lookups, todayIso }: SearchFiltersPanelProps) {
  const update = (changes: Partial<Omit<SearchState, 'page'>>) => onChange(withFilters(state, changes));
  const locked = state.savedSearchId !== null;

  const [minDraft, setMinDraft] = useState<number | null>(() => decimalToReais(state.minValue));
  const [maxDraft, setMaxDraft] = useState<number | null>(() => decimalToReais(state.maxValue));
  const [publishedError, setPublishedError] = useState<string | null>(null);
  const [closingError, setClosingError] = useState<string | null>(null);

  // Filtro trocado de fora (chip, Limpar tudo): os rascunhos acompanham.
  useEffect(() => setMinDraft(decimalToReais(state.minValue)), [state.minValue]);
  useEffect(() => setMaxDraft(decimalToReais(state.maxValue)), [state.maxValue]);
  useEffect(() => setPublishedError(null), [state.publishedFrom, state.publishedTo]);
  useEffect(() => setClosingError(null), [state.closingFrom, state.closingTo]);

  const valueError = minDraft !== null && maxDraft !== null && minDraft > maxDraft ? VALUE_RANGE_MESSAGE : null;
  const hasValueRange = state.minValue !== null || state.maxValue !== null;

  const commitValues = () => {
    if (valueError) return;
    const minValue = reaisToDecimal(minDraft);
    const maxValue = reaisToDecimal(maxDraft);
    if (minValue === state.minValue && maxValue === state.maxValue) return;
    const keepsRange = minValue !== null || maxValue !== null;
    update({ minValue, maxValue, includeWithoutValue: keepsRange && state.includeWithoutValue });
  };

  const commitPublished = (publishedFrom: string | null, publishedTo: string | null) => {
    if (publishedFrom && publishedTo && publishedFrom > publishedTo) {
      setPublishedError(DATE_ORDER_MESSAGE);
      return;
    }
    update({ publishedFrom, publishedTo });
  };

  const commitClosing = (closingFrom: string | null, closingTo: string | null) => {
    if (closingFrom && closingTo && closingFrom > closingTo) {
      setClosingError(DATE_ORDER_MESSAGE);
      return;
    }
    update({ closingFrom, closingTo });
  };

  const shortcut = activeClosingShortcut(state, todayIso);
  const domainLists = domains.data;

  return (
    <div className="grid grid-cols-1 gap-5">
      {locked && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
          Termos, local, modalidade, valor e órgão vêm da busca salva. Para mudar, edite a busca em Buscas salvas ou saia dela
          pelo chip acima dos resultados.
        </p>
      )}

      {domains.errorMessage ? (
        <LoadError title="Listas indisponíveis" message={domains.errorMessage} onRetry={domains.retry} retrying={domains.retrying} />
      ) : !domainLists ? (
        <LoadingBlock label="Carregando listas…" />
      ) : (
        <>
          <FilterSection title="UF">
            <StatePicker
              label="UF"
              states={domainLists.states}
              selected={state.states}
              onChange={(states) => update({ states })}
              disabled={locked}
            />
          </FilterSection>

          <FilterSection title="Município">
            <MunicipalityPicker
              label="Município"
              municipalities={domainLists.municipalities}
              selected={state.municipalityCodes}
              onChange={(municipalityCodes) => update({ municipalityCodes })}
              nameOf={lookups.municipalityName}
              maxItems={MAX_MUNICIPALITIES}
              disabled={locked}
            />
          </FilterSection>

          <FilterSection title="Modalidade">
            <CheckList
              label="Modalidade"
              options={domainLists.modalities.map((modality) => ({ value: modality.id, label: modality.name }))}
              selected={state.modalities}
              onChange={(modalities) => update({ modalities })}
              disabled={locked}
            />
          </FilterSection>
        </>
      )}

      <FilterSection title="Valor estimado" error={valueError}>
        <div className="grid grid-cols-2 gap-2">
          <MoneyField label="Valor mínimo" value={minDraft} onChange={setMinDraft} onBlur={commitValues} invalid={Boolean(valueError)} disabled={locked} />
          <MoneyField label="Valor máximo" value={maxDraft} onChange={setMaxDraft} onBlur={commitValues} invalid={Boolean(valueError)} disabled={locked} />
        </div>
        <ToggleRow
          label="Incluir editais sem valor"
          description={hasValueRange ? 'Os que não informam o valor também entram.' : 'Vale quando há valor mínimo ou máximo.'}
          checked={hasValueRange && state.includeWithoutValue}
          disabled={locked || !hasValueRange}
          onChange={() => update({ includeWithoutValue: !state.includeWithoutValue })}
        />
      </FilterSection>

      <FilterSection title="Publicação" error={publishedError}>
        <div className="grid grid-cols-2 gap-2">
          <FilterDateField label="Publicação: de" value={state.publishedFrom} onCommit={(iso) => commitPublished(iso, state.publishedTo)} />
          <FilterDateField label="Publicação: até" value={state.publishedTo} onCommit={(iso) => commitPublished(state.publishedFrom, iso)} />
        </div>
      </FilterSection>

      <FilterSection title="Encerramento" error={closingError}>
        <div className="grid grid-cols-2 gap-2">
          <FilterDateField label="Encerramento: de" value={state.closingFrom} onCommit={(iso) => commitClosing(iso, state.closingTo)} />
          <FilterDateField label="Encerramento: até" value={state.closingTo} onCommit={(iso) => commitClosing(state.closingFrom, iso)} />
        </div>
        <div role="group" aria-label="Encerramento nos próximos dias" className="flex flex-wrap gap-1.5">
          {CLOSING_SHORTCUT_DAYS.map((days) => {
            const active = shortcut === days;
            return (
              <button
                key={days}
                type="button"
                aria-pressed={active}
                onClick={() => update(active ? { closingFrom: null, closingTo: null } : closingWithinDays(days, todayIso))}
                className={[
                  'h-8 rounded-full border px-3 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
                  active
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
                ].join(' ')}
              >
                Próximos {days} dias
              </button>
            );
          })}
        </div>
        <ToggleRow
          label="Só editais abertos"
          description="Recebendo propostas agora."
          checked={state.openOnly}
          onChange={() => update({ openOnly: !state.openOnly })}
        />
        <ToggleRow
          label={`Incluir os que encerram em menos de ${MIN_DAYS_TO_CLOSE} dias`}
          description={
            state.openOnly
              ? `Sem esta opção, aparecem os que encerram a partir de ${formatIsoDate(minimumClosingDate(todayIso))}.`
              : 'Vale com "Só editais abertos" ligado.'
          }
          checked={state.includeClosingSoon}
          disabled={!state.openOnly}
          onChange={() => update({ includeClosingSoon: !state.includeClosingSoon })}
        />
      </FilterSection>

      <FilterSection title="Acompanhamento">
        <CheckList
          label="Acompanhamento"
          options={TRACKING_FILTERS.map((status) => ({ value: status, label: TRACKING_FILTER_LABELS[status] }))}
          selected={state.trackingStatuses}
          onChange={(trackingStatuses) => update({ trackingStatuses })}
        />
        <ToggleRow
          label="Ocultar descartados"
          description="Marcar Descartado acima mostra os descartados."
          checked={state.hideDiscarded}
          onChange={() => update({ hideDiscarded: !state.hideDiscarded })}
        />
      </FilterSection>

      <FilterSection title="Órgão (CNPJ)">
        <TagInput
          label="CNPJ do órgão"
          values={state.agencyCnpjs}
          onChange={(agencyCnpjs) => update({ agencyCnpjs })}
          parse={(text) => {
            const digits = normalizeCnpj(text);
            return isValidCnpj(digits) ? { value: digits } : { error: 'Informe o CNPJ com 14 dígitos.' };
          }}
          format={formatCnpj}
          placeholder="00.000.000/0000-00 e Enter"
          maxItems={MAX_AGENCIES}
          maxItemsMessage={`Até ${MAX_AGENCIES} órgãos.`}
          disabled={locked}
        />
      </FilterSection>
    </div>
  );
}
