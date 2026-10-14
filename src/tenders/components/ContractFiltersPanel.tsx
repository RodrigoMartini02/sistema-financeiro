import { useEffect, useState } from 'react';
import { Select, ToggleRow, inputBase } from '../../ui/form';
import type { DomainLookups } from '../hooks/useDomainLists';
import type { DomainLists } from '../types';
import {
  EXPIRY_SHORTCUT_DAYS,
  activeExpiryShortcut,
  contractYearOptions,
  expiryWithinDays,
  withContractFilters,
  type ContractSearchState,
} from '../utils/contractFilters';
import { MAX_SUPPLIERS } from '../utils/contractSearchForm';
import { formatCnpj } from '../utils/labels';
import { decimalToReais, reaisToDecimal } from '../utils/money';
import { MAX_AGENCIES, MAX_MUNICIPALITIES, VALUE_RANGE_MESSAGE } from '../utils/savedSearchForm';
import { MAX_NUMBER_LENGTH, isValidNumberSearch } from '../utils/searchFilters';
import { CheckList, StatePicker } from './ChoicePickers';
import { FilterDateField } from './FilterDateField';
import { LoadError, LoadingBlock } from './LoadStates';
import { MoneyField } from './MoneyField';
import { MunicipalityPicker } from './MunicipalityPicker';
import { parseCnpj } from './SavedSearchFormDialog';
import { DATE_ORDER_MESSAGE, FilterSection, NUMBER_MESSAGE } from './SearchFiltersPanel';
import { TagInput } from './TagInput';

interface ContractFiltersPanelProps {
  state: ContractSearchState;
  onChange: (next: ContractSearchState) => void;
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
 * Filtros de "Contratos a vencer", como os de Buscar: escolhas valem na hora;
 * valores, datas e número, ao sair do campo. Com busca salva, os critérios vêm
 * dela e ficam travados aqui.
 */
export function ContractFiltersPanel({ state, onChange, domains, lookups, todayIso }: ContractFiltersPanelProps) {
  const update = (changes: Partial<Omit<ContractSearchState, 'page'>>) => onChange(withContractFilters(state, changes));
  const locked = state.savedSearchId !== null;

  const [minDraft, setMinDraft] = useState<number | null>(() => decimalToReais(state.minValue));
  const [maxDraft, setMaxDraft] = useState<number | null>(() => decimalToReais(state.maxValue));
  const [publishedError, setPublishedError] = useState<string | null>(null);
  const [expiryError, setExpiryError] = useState<string | null>(null);
  const [numberDraft, setNumberDraft] = useState(state.number);
  const [numberError, setNumberError] = useState<string | null>(null);

  // Filtro trocado de fora (chip, Limpar tudo): os rascunhos acompanham.
  useEffect(() => setMinDraft(decimalToReais(state.minValue)), [state.minValue]);
  useEffect(() => setMaxDraft(decimalToReais(state.maxValue)), [state.maxValue]);
  useEffect(() => setPublishedError(null), [state.publishedFrom, state.publishedTo]);
  useEffect(() => setExpiryError(null), [state.expiryFrom, state.expiryTo]);
  useEffect(() => {
    setNumberDraft(state.number);
    setNumberError(null);
  }, [state.number]);

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

  const commitExpiry = (expiryFrom: string | null, expiryTo: string | null) => {
    if (expiryFrom && expiryTo && expiryFrom > expiryTo) {
      setExpiryError(DATE_ORDER_MESSAGE);
      return;
    }
    update({ expiryFrom, expiryTo });
  };

  // O número vale ao sair do campo ou com Enter; vazio tira o filtro.
  const commitNumber = () => {
    const number = numberDraft.trim();
    if (number !== '' && !isValidNumberSearch(number)) {
      setNumberError(NUMBER_MESSAGE);
      return;
    }
    setNumberError(null);
    if (number !== state.number) update({ number });
  };

  const shortcut = activeExpiryShortcut(state, todayIso);
  const domainLists = domains.data;

  return (
    <div className="grid grid-cols-1 gap-5">
      <FilterSection title="Vencimento" error={expiryError}>
        <div role="group" aria-label="Vencimento nos próximos dias" className="flex flex-wrap gap-1.5">
          {EXPIRY_SHORTCUT_DAYS.map((days) => {
            const active = shortcut === days;
            return (
              <button
                key={days}
                type="button"
                aria-pressed={active}
                onClick={() => update(active ? { expiryFrom: null, expiryTo: null } : expiryWithinDays(days, todayIso))}
                className={[
                  'h-8 rounded-full border px-3 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
                  active
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300',
                ].join(' ')}
              >
                Até {days} dias
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <FilterDateField label="Vencimento: de" value={state.expiryFrom} onCommit={(iso) => commitExpiry(iso, state.expiryTo)} />
          <FilterDateField label="Vencimento: até" value={state.expiryTo} onCommit={(iso) => commitExpiry(state.expiryFrom, iso)} />
        </div>
        <ToggleRow
          label="Só favoritos"
          description="Os contratos que você marcou com o coração, inclusive os vencidos."
          checked={state.favoritesOnly}
          onChange={() => update({ favoritesOnly: !state.favoritesOnly })}
        />
      </FilterSection>

      <FilterSection title="Número e ano" error={numberError}>
        <input
          type="text"
          aria-label="Número do contrato, processo ou controle PNCP"
          aria-invalid={Boolean(numberError) || undefined}
          value={numberDraft}
          maxLength={MAX_NUMBER_LENGTH}
          onChange={(event) => setNumberDraft(event.target.value)}
          onBlur={commitNumber}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          placeholder="Número, processo ou controle PNCP"
          className={`${inputBase} ${numberError ? '!border-red-400' : ''}`}
        />
        <Select
          aria-label="Ano do contrato"
          value={state.contractYear === null ? '' : String(state.contractYear)}
          onChange={(event) => update({ contractYear: event.target.value ? Number(event.target.value) : null })}
        >
          <option value="">Qualquer ano</option>
          {contractYearOptions(todayIso, state.contractYear).map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </Select>
      </FilterSection>

      {locked && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
          Termos, local, categoria, valor, órgão e fornecedor vêm da busca salva. Para mudar, edite a busca em Buscas salvas ou saia
          dela pelo chip acima dos resultados.
        </p>
      )}

      {domains.errorMessage ? (
        <LoadError title="Listas indisponíveis" message={domains.errorMessage} onRetry={domains.retry} retrying={domains.retrying} />
      ) : !domainLists ? (
        <LoadingBlock label="Carregando listas…" />
      ) : (
        <>
          <FilterSection title="UF">
            <StatePicker label="UF" states={domainLists.states} selected={state.states} onChange={(states) => update({ states })} disabled={locked} />
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

          <FilterSection title="Categoria">
            <CheckList
              label="Categoria"
              options={domainLists.contractCategories.map((category) => ({ value: category.id, label: category.name }))}
              selected={state.categories}
              onChange={(categories) => update({ categories })}
              disabled={locked}
            />
          </FilterSection>
        </>
      )}

      <FilterSection title="Valor global" error={valueError}>
        <div className="grid grid-cols-2 gap-2">
          <MoneyField label="Valor mínimo" value={minDraft} onChange={setMinDraft} onBlur={commitValues} invalid={Boolean(valueError)} disabled={locked} />
          <MoneyField label="Valor máximo" value={maxDraft} onChange={setMaxDraft} onBlur={commitValues} invalid={Boolean(valueError)} disabled={locked} />
        </div>
        <ToggleRow
          label="Incluir contratos sem valor"
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

      <FilterSection title="Órgão (CNPJ)">
        <TagInput
          label="CNPJ do órgão"
          values={state.agencyCnpjs}
          onChange={(agencyCnpjs) => update({ agencyCnpjs })}
          parse={parseCnpj}
          format={formatCnpj}
          placeholder="00.000.000/0000-00 e Enter"
          maxItems={MAX_AGENCIES}
          maxItemsMessage={`Até ${MAX_AGENCIES} órgãos.`}
          disabled={locked}
        />
      </FilterSection>

      <FilterSection title="Fornecedor (CNPJ)">
        <TagInput
          label="CNPJ do fornecedor"
          values={state.supplierCnpjs}
          onChange={(supplierCnpjs) => update({ supplierCnpjs })}
          parse={parseCnpj}
          format={formatCnpj}
          placeholder="00.000.000/0000-00 e Enter"
          maxItems={MAX_SUPPLIERS}
          maxItemsMessage={`Até ${MAX_SUPPLIERS} fornecedores.`}
          disabled={locked}
        />
      </FilterSection>
    </div>
  );
}
