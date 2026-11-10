import { useState, type FormEvent, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Badge } from '@ui/components/badge';
import { Button } from '@ui/components/button';
import { IsoDateField } from '@ui/components/DateField';
import { Field, Input, Select, SectionDivider, inputBase } from '@ui/components/form';
import { InfoBanner } from '@ui/components/InfoBanner';
import { useConfirm } from '@ui/context/ConfirmContext';
import { BRAZIL_STATES, formatCep, formatPhone } from '@ui/utils/brazilDocuments';
import { useCompanyMutations, useCompanyProfile } from '../../hooks/useCompanyProfile';
import { useDomainLists } from '../../hooks/useDomainLists';
import type { CompanyProfile, CompanyUpdate, DomainLists } from '../../types';
import {
  buildCompanyUpdate,
  cnaeLabel,
  companyFormKey,
  companyFormValuesFrom,
  hasCompanyChanges,
  hasCompanyData,
  legalNatureLabel,
  lookupConfirmation,
  lookupDateText,
  registrationStatusView,
  validateCompanyForm,
  type CompanyFormErrors,
  type CompanyFormValues,
} from '../../utils/companyProfile';
import { formatCnpj } from '../../utils/labels';
import { optionsWithCurrent } from '../../utils/listOptions';
import { LoadError, LoadingBlock } from '../LoadStates';

// Perfil da empresa (item 1C, só o titular): os dados cadastrais da conta, que é a própria empresa. O titular busca os
// dados do CNPJ da conta (a consulta grava na hora) e ajusta o que quiser; situação cadastral, natureza jurídica e
// CNAEs são lidos da Receita e só mudam por uma consulta nova.

const CARD_CLASS = 'rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800';
const ERROR_CLASS = 'text-xs font-medium text-red-600 dark:text-red-400';

/** O que acabou de acontecer, para a mensagem de sucesso (some assim que a pessoa mexe nos campos). */
type Notice = 'saved' | 'looked-up';

export function CompanyProfileSection() {
  const profile = useCompanyProfile();
  const lists = useDomainLists();
  const { save, lookup } = useCompanyMutations();
  const [notice, setNotice] = useState<Notice | null>(null);

  if (profile.isPending) return <LoadingBlock label="Carregando o perfil da empresa…" />;
  if (profile.isError) {
    return <LoadError message={profile.error.message} onRetry={() => void profile.refetch()} retrying={profile.isFetching} />;
  }

  const handleSave = (changes: CompanyUpdate) => {
    setNotice(null);
    lookup.reset();
    save.mutate(changes, { onSuccess: () => setNotice('saved') });
  };
  const handleLookup = () => {
    setNotice(null);
    save.reset();
    lookup.mutate(undefined, { onSuccess: () => setNotice('looked-up') });
  };

  const company = profile.data.company;
  return (
    <CompanyProfileBody
      // Salvar ou consultar traz dados novos e o formulário recomeça deles; os campos não vazam de um estado para outro.
      key={companyFormKey(company)}
      company={company}
      lists={lists.data}
      saving={save.isPending}
      lookingUp={lookup.isPending}
      saveError={save.error?.message ?? null}
      lookupError={lookup.error?.message ?? null}
      notice={notice}
      onSave={handleSave}
      onLookup={handleLookup}
    />
  );
}

interface CompanyProfileBodyProps {
  company: CompanyProfile;
  lists: DomainLists | undefined;
  saving: boolean;
  lookingUp: boolean;
  saveError: string | null;
  lookupError: string | null;
  notice: Notice | null;
  onSave: (changes: CompanyUpdate) => void;
  onLookup: () => void;
}

function CompanyProfileBody({
  company, lists, saving, lookingUp, saveError, lookupError, notice, onSave, onLookup,
}: CompanyProfileBodyProps) {
  const confirm = useConfirm();
  const [initial] = useState<CompanyFormValues>(() => companyFormValuesFrom(company));
  const [values, setValues] = useState<CompanyFormValues>(initial);
  const [errors, setErrors] = useState<CompanyFormErrors>({});
  // A mensagem de sucesso vale para os dados que acabaram de chegar: some assim que a pessoa mexe num campo.
  const [noticeVisible, setNoticeVisible] = useState(true);

  const changed = hasCompanyChanges(values, initial);
  const busy = saving || lookingUp;
  const lookedUp = lookupDateText(company.lookedUpAt);

  const setField = <K extends keyof CompanyFormValues>(field: K, value: CompanyFormValues[K]) => {
    setNoticeVisible(false);
    setValues((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateCompanyForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }
    onSave(buildCompanyUpdate(values, initial));
  };

  const handleLookup = async () => {
    // Por cima de dados que já existem (ou de alterações ainda não salvas), a pessoa confirma antes.
    if (hasCompanyData(company) || changed) {
      const confirmed = await confirm(lookupConfirmation(company.document, changed));
      if (!confirmed) return;
    }
    onLookup();
  };

  const discard = () => {
    setValues(initial);
    setErrors({});
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 text-sm text-slate-600 dark:text-slate-300">
          <p>Os dados cadastrais da empresa desta conta. Busque pelo CNPJ para preencher com o que a Receita informa e ajuste o que precisar.</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {company.document ? (
              <>CNPJ <span className="font-semibold text-slate-700 dark:text-slate-200">{formatCnpj(company.document)}</span></>
            ) : (
              'Esta conta não tem CNPJ cadastrado.'
            )}
            {lookedUp && <> · {lookedUp}</>}
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          icon={<Search size={15} aria-hidden="true" />}
          disabled={busy || !company.document}
          onClick={() => void handleLookup()}
        >
          {lookingUp ? 'Consultando…' : 'Buscar dados do CNPJ'}
        </Button>
      </div>

      {company.lookedUpAt === null && !lookupError && (
        <InfoBanner>
          Ainda não buscamos os dados deste CNPJ. Clique em “Buscar dados do CNPJ” para preencher porte, tipo jurídico,
          endereço e atividades.
        </InfoBanner>
      )}
      {lookupError && <p role="alert" className={ERROR_CLASS}>{lookupError}</p>}
      {notice === 'looked-up' && noticeVisible && (
        <div role="status"><InfoBanner variant="success">Dados atualizados com a consulta do CNPJ.</InfoBanner></div>
      )}

      <ReceitaFacts company={company} />

      <form className="grid gap-3.5" onSubmit={handleSubmit} noValidate>
        <SectionDivider label="Dados da empresa" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Razão social" required error={errors.legalName}>
            <Input
              aria-label="Razão social"
              value={values.legalName}
              onChange={(event) => setField('legalName', event.target.value)}
              maxLength={150}
            />
          </Field>
          <Field label="Nome fantasia" hint="É o nome da conta no app; sem ele, vale a razão social.">
            <Input
              aria-label="Nome fantasia"
              value={values.tradeName}
              onChange={(event) => setField('tradeName', event.target.value)}
              maxLength={150}
            />
          </Field>
          <Field label="Porte">
            <Select aria-label="Porte" value={values.size} onChange={(event) => setField('size', event.target.value)}>
              <option value="">Não informado</option>
              {optionsWithCurrent(lists?.companySizes, values.size).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tipo jurídico">
            <Select aria-label="Tipo jurídico" value={values.legalType} onChange={(event) => setField('legalType', event.target.value)}>
              <option value="">Não informado</option>
              {optionsWithCurrent(lists?.legalTypes, values.legalType).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Data de abertura">
            <IsoDateField
              label="Data de abertura"
              value={values.openingDate}
              onChange={(iso) => setField('openingDate', iso)}
              inputClassName={inputBase}
              height={32}
            />
          </Field>
        </div>

        <SectionDivider label="Endereço" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="CEP" error={errors.zipCode}>
            <Input
              aria-label="CEP"
              inputMode="numeric"
              placeholder="00000-000"
              value={values.zipCode}
              onChange={(event) => setField('zipCode', formatCep(event.target.value))}
              maxLength={9}
            />
          </Field>
          <Field label="Logradouro">
            <Input aria-label="Logradouro" value={values.street} onChange={(event) => setField('street', event.target.value)} maxLength={200} />
          </Field>
          <Field label="Número">
            <Input aria-label="Número" value={values.number} onChange={(event) => setField('number', event.target.value)} maxLength={20} />
          </Field>
          <Field label="Complemento">
            <Input aria-label="Complemento" value={values.complement} onChange={(event) => setField('complement', event.target.value)} maxLength={200} />
          </Field>
          <Field label="Bairro">
            <Input aria-label="Bairro" value={values.district} onChange={(event) => setField('district', event.target.value)} maxLength={100} />
          </Field>
          <Field label="Cidade">
            <Input aria-label="Cidade" value={values.city} onChange={(event) => setField('city', event.target.value)} maxLength={100} />
          </Field>
          <Field label="UF">
            <Select aria-label="UF" value={values.state} onChange={(event) => setField('state', event.target.value)}>
              <option value="">Sem UF</option>
              {optionsWithCurrent(BRAZIL_STATES.map((state) => ({ id: state, name: state })), values.state).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </Select>
          </Field>
        </div>

        <SectionDivider label="Contato" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <Field label="E-mail" error={errors.email}>
            <Input
              aria-label="E-mail"
              type="email"
              value={values.email}
              onChange={(event) => setField('email', event.target.value)}
              maxLength={255}
              autoComplete="off"
            />
          </Field>
        </div>

        {saveError && <p role="alert" className={ERROR_CLASS}>{saveError}</p>}
        {notice === 'saved' && noticeVisible && (
          <p role="status" className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Dados salvos.</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={!changed || busy} onClick={discard}>Descartar alterações</Button>
          <Button type="submit" disabled={!changed || busy}>{saving ? 'Salvando…' : 'Salvar'}</Button>
        </div>
      </form>
    </div>
  );
}

function Fact({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800 dark:text-slate-100">{children}</dd>
    </div>
  );
}

/** Situação cadastral, natureza jurídica e CNAEs: lidos da Receita, só leitura. Sem nenhum deles, o bloco não aparece. */
function ReceitaFacts({ company }: { company: CompanyProfile }) {
  const status = company.registrationStatus ? registrationStatusView(company.registrationStatus) : null;
  const nature = legalNatureLabel(company.legalNature);
  if (!status && !nature && !company.mainCnae && company.secondaryCnaes.length === 0) {
    return null;
  }

  return (
    <section aria-label="Dados da Receita" className={`${CARD_CLASS} grid gap-3`}>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
        {status && (
          <Fact label="Situação cadastral">
            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge tone={status.tone}>{status.label}</Badge>
              {status.since && <span className="text-xs text-slate-500 dark:text-slate-400">{status.since}</span>}
            </span>
          </Fact>
        )}
        {nature && <Fact label="Natureza jurídica">{nature}</Fact>}
        {company.mainCnae && <Fact label="Atividade principal (CNAE)" wide>{cnaeLabel(company.mainCnae)}</Fact>}
      </dl>
      {company.secondaryCnaes.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer select-none text-xs font-semibold text-brand-700 dark:text-brand-300">
            Atividades secundárias ({company.secondaryCnaes.length})
          </summary>
          <ul className="mt-2 grid gap-1 text-slate-700 dark:text-slate-200">
            {company.secondaryCnaes.map((cnae) => (
              <li key={cnae.code}>{cnaeLabel(cnae)}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Vêm da Receita e só mudam quando você busca os dados do CNPJ de novo.
      </p>
    </section>
  );
}
