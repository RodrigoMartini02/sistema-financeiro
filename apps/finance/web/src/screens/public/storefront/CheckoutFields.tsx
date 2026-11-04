import type { ElementType, ReactNode } from 'react';
import { Check } from 'lucide-react';
import {
  BRAZIL_STATES, formatCardExpiry, formatCardNumber, formatCep, formatCpf, formatPhone, onlyDigits,
  type CheckoutAddress, type CheckoutCard, type CheckoutErrors, type CheckoutIdentification,
} from '../../../utils/storefrontCheckout';

export type CepLookupStatus = 'idle' | 'loading' | 'not_found' | 'error';

const CEP_STATUS_MESSAGES: Record<Exclude<CepLookupStatus, 'idle'>, string> = {
  loading: 'Buscando o endereço…',
  not_found: 'CEP não encontrado. Preencha o endereço.',
  error: 'Não foi possível buscar o CEP. Preencha o endereço.',
};

export function inputClassName(error?: string): string {
  return `h-11 w-full rounded-xl border px-3 text-sm outline-none transition focus:border-brand-500 ${error
    ? 'border-red-300 bg-red-50/40'
    : 'border-slate-200 bg-white'}`;
}

export function Field({ label, error, hint, className = '', children }: {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {error
        ? <span className="text-xs font-medium text-red-600">{error}</span>
        : hint && <span className="text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

/** Opção em cartão (entrega e pagamento): escolha única, com o preço ou o detalhe à direita. */
export function OptionCard({ selected, icon: Icon, title, description, aside, onSelect }: {
  selected: boolean;
  icon: ElementType;
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${selected
        ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500'
        : 'border-slate-200 bg-white hover:border-slate-300'}`}
    >
      <span className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border ${selected
        ? 'border-brand-600 bg-brand-600 text-white'
        : 'border-slate-300 bg-white'}`}
      >
        {selected && <Check size={12} strokeWidth={3} />}
      </span>
      <Icon size={20} className="mt-0.5 flex-none text-slate-500" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold text-slate-900">{title}</span>
        {description && <span className="text-xs text-slate-500">{description}</span>}
      </span>
      {aside && <span className="flex-none text-sm font-semibold text-slate-900">{aside}</span>}
    </button>
  );
}

export function IdentificationFields({ value, errors, onChange }: {
  value: CheckoutIdentification;
  errors: CheckoutErrors<CheckoutIdentification>;
  onChange: (value: CheckoutIdentification) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nome completo" error={errors.nome} className="sm:col-span-2">
        <input
          value={value.nome}
          onChange={(event) => onChange({ ...value, nome: event.target.value.slice(0, 80) })}
          autoComplete="name"
          className={inputClassName(errors.nome)}
        />
      </Field>
      <Field label="E-mail" error={errors.email} hint="O comprovante do pagamento chega aqui.">
        <input
          type="email"
          value={value.email}
          onChange={(event) => onChange({ ...value, email: event.target.value.slice(0, 150) })}
          autoComplete="email"
          inputMode="email"
          className={inputClassName(errors.email)}
        />
      </Field>
      <Field label="Celular" error={errors.telefone}>
        <input
          value={value.telefone}
          onChange={(event) => onChange({ ...value, telefone: formatPhone(event.target.value) })}
          autoComplete="tel-national"
          inputMode="tel"
          placeholder="(00) 00000-0000"
          className={inputClassName(errors.telefone)}
        />
      </Field>
      <Field label="CPF" error={errors.cpf} hint="O Mercado Pago pede o CPF de quem paga.">
        <input
          value={value.cpf}
          onChange={(event) => onChange({ ...value, cpf: formatCpf(event.target.value) })}
          inputMode="numeric"
          placeholder="000.000.000-00"
          className={inputClassName(errors.cpf)}
        />
      </Field>
    </div>
  );
}

export function AddressFields({ value, errors, cepStatus, onChange, onCepChange }: {
  value: CheckoutAddress;
  errors: CheckoutErrors<CheckoutAddress>;
  cepStatus: CepLookupStatus;
  onChange: (value: CheckoutAddress) => void;
  onCepChange: (cep: string) => void;
}) {
  return (
    <div className="grid grid-cols-6 gap-3">
      <Field
        label="CEP"
        error={errors.cep}
        hint={cepStatus === 'idle' ? undefined : CEP_STATUS_MESSAGES[cepStatus]}
        className="col-span-6 sm:col-span-2"
      >
        <input
          value={value.cep}
          onChange={(event) => onCepChange(formatCep(event.target.value))}
          autoComplete="postal-code"
          inputMode="numeric"
          placeholder="00000-000"
          className={inputClassName(errors.cep)}
        />
      </Field>
      <Field label="Rua" error={errors.rua} className="col-span-6 sm:col-span-4">
        <input
          value={value.rua}
          onChange={(event) => onChange({ ...value, rua: event.target.value.slice(0, 150) })}
          autoComplete="address-line1"
          className={inputClassName(errors.rua)}
        />
      </Field>
      <Field label="Número" error={errors.numero} className="col-span-2">
        <input
          value={value.numero}
          onChange={(event) => onChange({ ...value, numero: event.target.value.slice(0, 20) })}
          inputMode="numeric"
          className={inputClassName(errors.numero)}
        />
      </Field>
      <Field label="Complemento (opcional)" className="col-span-4">
        <input
          value={value.complemento}
          onChange={(event) => onChange({ ...value, complemento: event.target.value.slice(0, 80) })}
          autoComplete="address-line2"
          placeholder="Apto, bloco, referência"
          className={inputClassName()}
        />
      </Field>
      <Field label="Bairro" error={errors.bairro} className="col-span-6 sm:col-span-2">
        <input
          value={value.bairro}
          onChange={(event) => onChange({ ...value, bairro: event.target.value.slice(0, 80) })}
          className={inputClassName(errors.bairro)}
        />
      </Field>
      <Field label="Cidade" error={errors.cidade} className="col-span-4 sm:col-span-3">
        <input
          value={value.cidade}
          onChange={(event) => onChange({ ...value, cidade: event.target.value.slice(0, 80) })}
          autoComplete="address-level2"
          className={inputClassName(errors.cidade)}
        />
      </Field>
      <Field label="UF" error={errors.uf} className="col-span-2 sm:col-span-1">
        <select
          value={value.uf}
          onChange={(event) => onChange({ ...value, uf: event.target.value })}
          autoComplete="address-level1"
          className={inputClassName(errors.uf)}
        >
          <option value="">—</option>
          {BRAZIL_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
        </select>
      </Field>
    </div>
  );
}

export function CardFields({ value, errors, onChange }: {
  value: CheckoutCard;
  errors: CheckoutErrors<CheckoutCard>;
  onChange: (value: CheckoutCard) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Número do cartão" error={errors.numero} className="col-span-2">
        <input
          value={value.numero}
          onChange={(event) => onChange({ ...value, numero: formatCardNumber(event.target.value) })}
          autoComplete="cc-number"
          inputMode="numeric"
          placeholder="0000 0000 0000 0000"
          className={inputClassName(errors.numero)}
        />
      </Field>
      <Field label="Nome impresso no cartão" error={errors.nome} className="col-span-2">
        <input
          value={value.nome}
          onChange={(event) => onChange({ ...value, nome: event.target.value.toUpperCase().slice(0, 80) })}
          autoComplete="cc-name"
          className={`${inputClassName(errors.nome)} uppercase`}
        />
      </Field>
      <Field label="Validade" error={errors.validade}>
        <input
          value={value.validade}
          onChange={(event) => onChange({ ...value, validade: formatCardExpiry(event.target.value) })}
          autoComplete="cc-exp"
          inputMode="numeric"
          placeholder="MM/AA"
          className={inputClassName(errors.validade)}
        />
      </Field>
      <Field label="CVV" error={errors.cvv}>
        <input
          type="password"
          value={value.cvv}
          onChange={(event) => onChange({ ...value, cvv: onlyDigits(event.target.value).slice(0, 4) })}
          autoComplete="cc-csc"
          inputMode="numeric"
          placeholder="•••"
          className={inputClassName(errors.cvv)}
        />
      </Field>
      <Field label="CPF do titular do cartão" error={errors.cpf} className="col-span-2">
        <input
          value={value.cpf}
          onChange={(event) => onChange({ ...value, cpf: formatCpf(event.target.value) })}
          inputMode="numeric"
          placeholder="000.000.000-00"
          className={inputClassName(errors.cpf)}
        />
      </Field>
    </div>
  );
}
