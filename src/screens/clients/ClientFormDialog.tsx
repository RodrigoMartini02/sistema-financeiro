import { useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useConfirm } from '../../context/ConfirmContext';
import {
  DUPLICATE_DOCUMENT_MESSAGE, createClient, deleteClient, setClientActive, updateClient,
  type Client, type ClientFormValues,
} from '../../services/clientsService';
import { fetchAddressByCep } from '../../services/cepService';
import { Dialog } from '../../ui/dialog';
import {
  C, chipStyle, dangerButtonStyle, dialogFooterStyle, fieldInputStyle, labelStyle, saveButtonDisabledStyle, saveButtonStyle,
  successOutlineButtonStyle,
} from '../../ui/dialogFormTokens';
import { CFG_MONO_CLASS } from '../../ui/configTokens';
import {
  BRAZIL_STATES, formatCep, formatCnpj, formatCpf, formatPhone, isValidCnpj, isValidCpf, onlyDigits,
} from '../../utils/brazilDocuments';
import { CLIENT_TYPES, CLIENT_TYPE_LABELS, GOVERNMENT_SPHERES, SPHERE_LABELS, type ClientType } from '../../utils/contractDisplay';
import { errorBoxStyle, fieldErrorStyle, sectionTitleStyle } from './clientStyles';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = Partial<Record<keyof ClientFormValues, string>>;

const NAME_LABELS: Record<ClientType, { label: string; placeholder: string }> = {
  pessoa_fisica: { label: 'Nome completo', placeholder: 'Ex.: Maria Souza' },
  empresa: { label: 'Razão social ou nome fantasia', placeholder: 'Ex.: Acme Sistemas Ltda' },
  orgao_publico: { label: 'Nome do órgão', placeholder: 'Ex.: Prefeitura de Campinas' },
};

function initialValues(client?: Client): ClientFormValues {
  return {
    type: client?.type ?? 'empresa',
    name: client?.name ?? '',
    document: client ? (client.type === 'pessoa_fisica' ? formatCpf(client.document) : formatCnpj(client.document)) : '',
    sphere: client?.sphere ?? null,
    agency: client?.agency ?? '',
    contactName: client?.contactName ?? '',
    contactEmail: client?.contactEmail ?? '',
    contactPhone: client?.contactPhone ? formatPhone(client.contactPhone) : '',
    zipCode: client?.zipCode ? formatCep(client.zipCode) : '',
    street: client?.street ?? '',
    number: client?.number ?? '',
    complement: client?.complement ?? '',
    district: client?.district ?? '',
    city: client?.city ?? '',
    state: client?.state ?? '',
  };
}

/** As mesmas regras do servidor (backend/src/services/clientInput.ts), campo a campo. */
function validate(values: ClientFormValues): FieldErrors {
  const errors: FieldErrors = {};
  if (values.name.trim().length < 2) errors.name = 'Informe o nome';
  const documentLabel = values.type === 'pessoa_fisica' ? 'CPF' : 'CNPJ';
  if (!onlyDigits(values.document)) {
    errors.document = `Informe o ${documentLabel}`;
  } else if (values.type === 'pessoa_fisica' ? !isValidCpf(values.document) : !isValidCnpj(values.document)) {
    errors.document = `${documentLabel} inválido`;
  }
  if (values.type === 'orgao_publico') {
    if (!values.sphere) errors.sphere = 'Informe a esfera: municipal, estadual ou federal';
    if (values.agency.trim().length < 2) errors.agency = 'Informe o órgão ou secretaria';
  }
  if (values.contactEmail.trim() && !EMAIL_PATTERN.test(values.contactEmail.trim())) errors.contactEmail = 'E-mail inválido';
  const phone = onlyDigits(values.contactPhone);
  if (phone && phone.length !== 10 && phone.length !== 11) errors.contactPhone = 'Telefone inválido: informe o DDD e o número';
  const zipCode = onlyDigits(values.zipCode);
  if (zipCode && zipCode.length !== 8) errors.zipCode = 'CEP inválido';
  return errors;
}

/** O que vai para a API: documento, telefone e CEP só com dígitos; fora do órgão público, sem esfera e órgão. */
function requestValues(values: ClientFormValues): ClientFormValues {
  const publicEntity = values.type === 'orgao_publico';
  return {
    ...values,
    document: onlyDigits(values.document),
    contactPhone: onlyDigits(values.contactPhone),
    zipCode: onlyDigits(values.zipCode),
    sphere: publicEntity ? values.sphere : null,
    agency: publicEntity ? values.agency : '',
  };
}

function Field({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: ReactNode;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={labelStyle}>
        <span>{label}</span>
        {required && <span style={{ color: C.danger }}>*</span>}
      </label>
      {children}
      {error && <p role="alert" style={fieldErrorStyle}>{error}</p>}
    </div>
  );
}

function inputStyle(invalid: boolean): CSSProperties {
  return invalid ? { ...fieldInputStyle, borderColor: '#fca5a5' } : fieldInputStyle;
}

interface ClientFormDialogProps {
  open: boolean;
  accountId: number;
  /** Ausente: cliente novo. */
  client?: Client;
  onClose: () => void;
  /** Depois de gravar, desativar, reativar ou excluir (cliente nulo quando excluído). */
  onSaved: (client: Client | null) => void;
}

/**
 * Cadastro de cliente: o tipo define os campos (CPF; CNPJ; ou CNPJ, esfera e
 * órgão). Contato e endereço são opcionais. Numa falha ao salvar, o que foi
 * digitado continua no formulário.
 */
export function ClientFormDialog({ open, accountId, client, onClose, onSaved }: ClientFormDialogProps) {
  const confirm = useConfirm();
  const [values, setValues] = useState<ClientFormValues>(() => initialValues(client));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState('');
  const [cepLoading, setCepLoading] = useState(false);

  const set = <K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const handleError = (error: Error) => {
    if (error.message === DUPLICATE_DOCUMENT_MESSAGE) {
      setErrors((current) => ({ ...current, document: error.message }));
      setServerError('');
      return;
    }
    setServerError(error.message);
  };

  const saveMutation = useMutation({
    mutationFn: (payload: ClientFormValues) => (client ? updateClient(client.id, payload) : createClient(accountId, payload)),
    onSuccess: (saved) => onSaved(saved),
    onError: handleError,
  });
  const activeMutation = useMutation({
    mutationFn: (active: boolean) => setClientActive(client!.id, active),
    onSuccess: (saved) => onSaved(saved),
    onError: handleError,
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteClient(client!.id),
    onSuccess: () => onSaved(null),
    onError: handleError,
  });
  const busy = saveMutation.isPending || activeMutation.isPending || deleteMutation.isPending;

  const changeType = (type: ClientType) => {
    setValues((current) => ({
      ...current,
      type,
      document: type === 'pessoa_fisica' ? formatCpf(current.document) : formatCnpj(current.document),
    }));
    setErrors({});
  };

  const lookupCep = async (zipCode: string) => {
    if (onlyDigits(zipCode).length !== 8) return;
    setCepLoading(true);
    try {
      const address = await fetchAddressByCep(zipCode);
      if (address) {
        setValues((current) => ({
          ...current,
          street: current.street || address.rua,
          district: current.district || address.bairro,
          city: current.city || address.cidade,
          state: current.state || address.uf,
        }));
      }
    } catch {
      // Sem a busca, a pessoa preenche o endereço à mão.
    } finally {
      setCepLoading(false);
    }
  };

  const submit = () => {
    const found = validate(values);
    setErrors(found);
    setServerError('');
    if (Object.keys(found).length === 0) {
      saveMutation.mutate(requestValues(values));
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Excluir cliente',
      message: `Excluir "${client?.name}"? Só dá para excluir cliente sem contratos e sem receitas.`,
      confirmLabel: 'Excluir',
    });
    if (ok) deleteMutation.mutate();
  };

  const toggleActive = async () => {
    if (!client) return;
    if (client.active) {
      const ok = await confirm({
        title: 'Desativar cliente',
        message: `"${client.name}" sai da lista e não pode ser escolhido em contrato ou receita nova. Os contratos e as receitas continuam.`,
        confirmLabel: 'Desativar',
      });
      if (!ok) return;
    }
    activeMutation.mutate(!client.active);
  };

  const isCpf = values.type === 'pessoa_fisica';
  const nameLabel = NAME_LABELS[values.type];

  return (
    <Dialog open={open} title={client ? 'Editar cliente' : 'Novo cliente'} onClose={onClose} size="card" scrollBody={false}>
      <form
        style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
        onSubmit={(event) => { event.preventDefault(); submit(); }}
        noValidate
      >
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px var(--dialog-px)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div role="radiogroup" aria-label="Tipo do cliente" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CLIENT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={values.type === type}
                onClick={() => changeType(type)}
                style={chipStyle(values.type === type, { r: 999 })}
              >
                {CLIENT_TYPE_LABELS[type]}
              </button>
            ))}
          </div>

          <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_190px]">
            <Field label={nameLabel.label} required error={errors.name}>
              <input
                value={values.name}
                onChange={(event) => set('name', event.target.value)}
                placeholder={nameLabel.placeholder}
                maxLength={150}
                autoFocus
                style={inputStyle(!!errors.name)}
              />
            </Field>
            <Field label={isCpf ? 'CPF' : 'CNPJ'} required error={errors.document}>
              <input
                value={values.document}
                onChange={(event) => set('document', isCpf ? formatCpf(event.target.value) : formatCnpj(event.target.value))}
                placeholder={isCpf ? '000.000.000-00' : '00.000.000/0000-00'}
                inputMode="numeric"
                className={CFG_MONO_CLASS}
                style={inputStyle(!!errors.document)}
              />
            </Field>
          </div>

          {values.type === 'orgao_publico' && (
            <div className="grid gap-2.5 sm:grid-cols-[auto_minmax(0,1fr)]">
              <Field label="Esfera" required error={errors.sphere}>
                <div role="radiogroup" aria-label="Esfera" style={{ display: 'flex', gap: 6 }}>
                  {GOVERNMENT_SPHERES.map((sphere) => (
                    <button
                      key={sphere}
                      type="button"
                      role="radio"
                      aria-checked={values.sphere === sphere}
                      onClick={() => set('sphere', sphere)}
                      style={chipStyle(values.sphere === sphere)}
                    >
                      {SPHERE_LABELS[sphere]}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Órgão ou secretaria" required error={errors.agency}>
                <input
                  value={values.agency}
                  onChange={(event) => set('agency', event.target.value)}
                  placeholder="Ex.: Secretaria de Saúde"
                  maxLength={150}
                  style={inputStyle(!!errors.agency)}
                />
              </Field>
            </div>
          )}

          <p style={sectionTitleStyle}>Contato (opcional)</p>
          <div className="grid gap-2.5 sm:grid-cols-3">
            <Field label="Nome do contato">
              <input value={values.contactName} onChange={(event) => set('contactName', event.target.value)} maxLength={100} style={fieldInputStyle} />
            </Field>
            <Field label="E-mail" error={errors.contactEmail}>
              <input
                type="email"
                value={values.contactEmail}
                onChange={(event) => set('contactEmail', event.target.value)}
                maxLength={150}
                style={inputStyle(!!errors.contactEmail)}
              />
            </Field>
            <Field label="Telefone" error={errors.contactPhone}>
              <input
                value={values.contactPhone}
                onChange={(event) => set('contactPhone', formatPhone(event.target.value))}
                placeholder="(00) 00000-0000"
                inputMode="tel"
                style={inputStyle(!!errors.contactPhone)}
              />
            </Field>
          </div>

          <p style={sectionTitleStyle}>Endereço (opcional)</p>
          <div className="grid gap-2.5 grid-cols-[110px_minmax(0,1fr)] sm:grid-cols-[110px_minmax(0,1fr)_90px]">
            <Field label={cepLoading ? 'CEP (buscando...)' : 'CEP'} error={errors.zipCode}>
              <input
                value={values.zipCode}
                onChange={(event) => {
                  const zipCode = formatCep(event.target.value);
                  set('zipCode', zipCode);
                  void lookupCep(zipCode);
                }}
                placeholder="00000-000"
                inputMode="numeric"
                style={inputStyle(!!errors.zipCode)}
              />
            </Field>
            <Field label="Rua">
              <input value={values.street} onChange={(event) => set('street', event.target.value)} maxLength={150} style={fieldInputStyle} />
            </Field>
            <Field label="Número">
              <input value={values.number} onChange={(event) => set('number', event.target.value)} maxLength={20} style={fieldInputStyle} />
            </Field>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_76px]">
            <Field label="Complemento">
              <input value={values.complement} onChange={(event) => set('complement', event.target.value)} maxLength={80} style={fieldInputStyle} />
            </Field>
            <Field label="Bairro">
              <input value={values.district} onChange={(event) => set('district', event.target.value)} maxLength={80} style={fieldInputStyle} />
            </Field>
            <Field label="Cidade">
              <input value={values.city} onChange={(event) => set('city', event.target.value)} maxLength={80} style={fieldInputStyle} />
            </Field>
            <Field label="UF">
              <select value={values.state} onChange={(event) => set('state', event.target.value)} style={fieldInputStyle}>
                <option value="">—</option>
                {BRAZIL_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
              </select>
            </Field>
          </div>

          {client && !client.active && (
            <p style={{ margin: 0, fontSize: 11.5, color: C.warn }}>
              Cliente desativado: não aparece para contrato ou receita nova até ser reativado.
            </p>
          )}
          {serverError && <div role="alert" style={errorBoxStyle}>{serverError}</div>}
        </div>

        <div style={{ ...dialogFooterStyle, flexWrap: 'wrap' }}>
          {client && (
            <>
              <button type="button" style={dangerButtonStyle} onClick={() => void remove()} disabled={busy}>Excluir</button>
              <button
                type="button"
                style={client.active ? dangerButtonStyle : successOutlineButtonStyle}
                onClick={() => void toggleActive()}
                disabled={busy}
              >
                {client.active ? 'Desativar' : 'Reativar'}
              </button>
            </>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <button type="submit" disabled={busy} style={busy ? saveButtonDisabledStyle : saveButtonStyle}>
              {saveMutation.isPending ? 'Salvando...' : client ? 'Salvar' : 'Cadastrar cliente'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
