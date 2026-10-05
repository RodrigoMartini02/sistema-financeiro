import type { CSSProperties, ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ClassificacaoReceita } from '../../types/config';
import type { Representante } from '../../services/representantesService';
import type { CatalogService } from '../../services/serviceCatalogService';
import { C, fieldInputStyle, labelStyle } from '../../ui/dialogFormTokens';
import { opcoesDeClassificacao } from '../../utils/classificacaoOpcoes';
import { CHARGE_LABELS, WITHHOLDING_LABELS, WITHHOLDING_TAXES, type ChargeKind } from '../../utils/contractDisplay';
import {
  MAX_DUE_DAY, emptyCommitment, emptyHourType, type ContractDraft, type DraftErrors, type InstallmentDraft,
} from '../../utils/contractForm';
import { DateCell } from '../finance/entry-dialog/DateCell';
import { MoneyCell } from '../finance/entry-dialog/MoneyCell';
import { checkboxStyle } from '../finance/entry-dialog/fieldStyles';
import { PendingAttachments } from './ContractAttachments';
import { errorBoxStyle, fieldErrorStyle, inputStyle, secondaryButtonStyle, sectionTitleStyle } from './clientStyles';

const FIELD_HEIGHT = 32;

export interface StepProps {
  draft: ContractDraft;
  errors: DraftErrors;
  onChange: (patch: Partial<ContractDraft>) => void;
  todayIso: string;
}

function Field({ label, required, error, hint, children }: {
  label: string; required?: boolean; error?: string; hint?: string; children: ReactNode;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <label style={labelStyle}>
        <span>{label}</span>
        {required && <span style={{ color: C.danger }}>*</span>}
      </label>
      {children}
      {error && <p role="alert" style={fieldErrorStyle}>{error}</p>}
      {!error && hint && <p style={{ margin: '4px 0 0', fontSize: 11, color: C.textMuted }}>{hint}</p>}
    </div>
  );
}

const textInputStyle = inputStyle;

/** Caixa de marcar com rótulo (sem prazo, implantado, cobranças). */
function Check({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: ReactNode }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: C.text, cursor: 'pointer' }}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={checkboxStyle(checked)}
      >
        {checked ? '✓' : ''}
      </button>
      {label}
    </label>
  );
}

const cardStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10, padding: '11px 12px', borderRadius: 12,
  border: `1px solid ${C.border}`, background: '#fff',
};

const removeButtonStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: FIELD_HEIGHT, flex: 'none',
  border: 'none', background: 'transparent', color: C.placeholder, cursor: 'pointer',
};

// ── 1. Vigência ───────────────────────────────────────────────────────────

export function TermStep({ draft, errors, onChange, todayIso }: StepProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="grid gap-2.5 sm:grid-cols-[180px_minmax(0,1fr)]">
        <Field label="Número do contrato">
          <input value={draft.number} onChange={(event) => onChange({ number: event.target.value })} maxLength={50} placeholder="Ex.: 12/2027" style={fieldInputStyle} />
        </Field>
        <Field label="Descrição">
          <input value={draft.description} onChange={(event) => onChange({ description: event.target.value })} maxLength={255} placeholder="Ex.: Sistema de gestão e suporte" style={fieldInputStyle} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[150px_150px_auto]">
        <Field label="Início" required error={errors.startDate}>
          <DateCell value={draft.startDate} onChange={(startDate) => onChange({ startDate })} todayIso={todayIso} label="Início" invalid={!!errors.startDate} height={FIELD_HEIGHT} />
        </Field>
        <Field label="Fim" error={errors.endDate}>
          <DateCell
            value={draft.openEnded ? '' : draft.endDate}
            onChange={(endDate) => onChange({ endDate, openEnded: false })}
            todayIso={todayIso}
            label="Fim"
            placeholder={draft.openEnded ? 'Sem prazo' : 'dd/mm/aaaa'}
            invalid={!!errors.endDate}
            height={FIELD_HEIGHT}
          />
        </Field>
        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 7 }}>
          <Check checked={draft.openEnded} onChange={(openEnded) => onChange({ openEnded, endDate: openEnded ? '' : draft.endDate })} label="Sem prazo" />
        </div>
      </div>
      {draft.openEnded && (
        <p style={{ margin: 0, fontSize: 11.5, color: C.textSoft }}>
          Sem prazo, o contrato mantém sempre 12 mensalidades previstas à frente.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[150px_minmax(0,1fr)]">
        <Field label="Vencimento" required error={errors.dueDay}>
          <select value={draft.dueDay} onChange={(event) => onChange({ dueDay: Number(event.target.value) })} style={fieldInputStyle} aria-label="Dia do vencimento">
            {Array.from({ length: MAX_DUE_DAY }, (_, index) => index + 1).map((day) => (
              <option key={day} value={day}>Dia {day}</option>
            ))}
          </select>
        </Field>
        <Field
          label="Data-base do reajuste"
          error={errors.readjustmentBaseDate}
          hint="Vazio: o início do contrato. A cada aniversário aparece o aviso de reajuste."
        >
          <DateCell
            value={draft.readjustmentBaseDate}
            onChange={(readjustmentBaseDate) => onChange({ readjustmentBaseDate })}
            todayIso={todayIso}
            label="Data-base do reajuste"
            placeholder={draft.startDate || 'dd/mm/aaaa'}
            invalid={!!errors.readjustmentBaseDate}
            height={FIELD_HEIGHT}
          />
        </Field>
      </div>
    </div>
  );
}

// ── 2. Cobranças ──────────────────────────────────────────────────────────

function InstallmentCard({ kind, label, description, value, errors, onChange, todayIso }: {
  kind: 'setup' | 'project';
  label: string;
  description: string;
  value: InstallmentDraft;
  errors: DraftErrors;
  onChange: (value: InstallmentDraft) => void;
  todayIso: string;
}) {
  return (
    <div style={cardStyle}>
      <Check checked={value.enabled} onChange={(enabled) => onChange({ ...value, enabled })} label={label} />
      {value.enabled ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[minmax(0,1fr)_110px_150px]">
          <Field label="Valor total" required error={errors[`${kind}.total`]}>
            <MoneyCell valueCents={value.totalCents} onChange={(totalCents) => onChange({ ...value, totalCents })} label={`${label}: valor total`} invalid={!!errors[`${kind}.total`]} height={FIELD_HEIGHT} />
          </Field>
          <Field label="Parcelas" required error={errors[`${kind}.installments`]}>
            <input
              value={value.installments}
              onChange={(event) => onChange({ ...value, installments: event.target.value.replace(/\D/g, '').slice(0, 3) })}
              inputMode="numeric"
              aria-label={`${label}: parcelas`}
              style={textInputStyle(!!errors[`${kind}.installments`])}
            />
          </Field>
          <Field label="1ª parcela" required error={errors[`${kind}.firstDate`]}>
            <DateCell value={value.firstDate} onChange={(firstDate) => onChange({ ...value, firstDate })} todayIso={todayIso} label={`${label}: primeira parcela`} invalid={!!errors[`${kind}.firstDate`]} height={FIELD_HEIGHT} />
          </Field>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 11.5, color: C.textMuted }}>{description}</p>
      )}
    </div>
  );
}

export function ChargesStep({ draft, errors, onChange, todayIso }: StepProps) {
  const updateHourType = (index: number, patch: Partial<ContractDraft['hourTypes'][number]>) => {
    onChange({ hourTypes: draft.hourTypes.map((hourType, position) => (position === index ? { ...hourType, ...patch } : hourType)) });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={cardStyle}>
        <Check checked={draft.monthly.enabled} onChange={(enabled) => onChange({ monthly: { ...draft.monthly, enabled } })} label="Mensalidade" />
        {draft.monthly.enabled ? (
          <div className="grid gap-2.5 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-end">
            <Field label="Valor do mês" required error={errors['monthly.amount']}>
              <MoneyCell
                valueCents={draft.monthly.amountCents}
                onChange={(amountCents) => onChange({ monthly: { ...draft.monthly, amountCents } })}
                label="Mensalidade"
                invalid={!!errors['monthly.amount']}
                height={FIELD_HEIGHT}
              />
            </Field>
            <p style={{ margin: '0 0 8px', fontSize: 11.5, color: C.textMuted }}>Uma receita por mês da vigência, no dia do vencimento.</p>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 11.5, color: C.textMuted }}>Valor fixo cobrado todo mês.</p>
        )}
      </div>

      <InstallmentCard
        kind="setup"
        label="Implantação ou taxa única"
        description="Valor total dividido em parcelas mensais iguais."
        value={draft.setup}
        errors={errors}
        onChange={(setup) => onChange({ setup })}
        todayIso={todayIso}
      />
      <InstallmentCard
        kind="project"
        label="Projeto"
        description="Valor total do projeto em parcelas mensais iguais."
        value={draft.project}
        errors={errors}
        onChange={(project) => onChange({ project })}
        todayIso={todayIso}
      />

      <div style={cardStyle}>
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: C.text }}>Banco de horas</p>
        {draft.hourTypes.length === 0 && (
          <p style={{ margin: 0, fontSize: 11.5, color: C.textMuted }}>
            Tipos de hora com valor e quantidade. A receita lançada com horas desconta o saldo.
          </p>
        )}
        {draft.hourTypes.map((hourType, index) => (
          <div key={hourType.key} className="grid grid-cols-[minmax(0,1fr)_32px] gap-2 sm:grid-cols-[minmax(0,1fr)_150px_120px_32px] sm:items-start">
            <Field label="Tipo de hora" required error={errors[`hourTypes.${index}.name`]}>
              <input
                value={hourType.name}
                onChange={(event) => updateHourType(index, { name: event.target.value })}
                maxLength={60}
                placeholder="Ex.: Suporte remoto"
                style={textInputStyle(!!errors[`hourTypes.${index}.name`])}
              />
            </Field>
            <div className="order-last col-span-2 grid grid-cols-2 gap-2 sm:order-none sm:col-span-2">
              <Field label="Valor da hora" required error={errors[`hourTypes.${index}.hourlyRate`]}>
                <MoneyCell
                  valueCents={hourType.hourlyRateCents}
                  onChange={(hourlyRateCents) => updateHourType(index, { hourlyRateCents })}
                  label="Valor da hora"
                  invalid={!!errors[`hourTypes.${index}.hourlyRate`]}
                  height={FIELD_HEIGHT}
                />
              </Field>
              <Field
                label="Quantidade (h)"
                required
                error={errors[`hourTypes.${index}.quantity`]}
                hint={hourType.used > 0 ? `${hourType.used.toLocaleString('pt-BR')} h já lançadas` : undefined}
              >
                <input
                  value={hourType.quantity}
                  onChange={(event) => updateHourType(index, { quantity: event.target.value.replace(/[^\d,.]/g, '') })}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Quantidade de horas"
                  style={textInputStyle(!!errors[`hourTypes.${index}.quantity`])}
                />
              </Field>
            </div>
            <button
              type="button"
              aria-label={`Tirar ${hourType.name || 'tipo de hora'}`}
              onClick={() => onChange({ hourTypes: draft.hourTypes.filter((_, position) => position !== index) })}
              style={{ ...removeButtonStyle, marginTop: 16 }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <div>
          <button type="button" style={secondaryButtonStyle} onClick={() => onChange({ hourTypes: [...draft.hourTypes, emptyHourType()] })}>
            <Plus size={12} /> Tipo de hora
          </button>
        </div>
      </div>

      {errors.charges && <div role="alert" style={errorBoxStyle}>{errors.charges}</div>}
    </div>
  );
}

// ── 3. Órgão público ──────────────────────────────────────────────────────

export function PublicEntityStep({ draft, errors, onChange, todayIso }: StepProps) {
  const currentYear = Number(todayIso.slice(0, 4));
  const updateCommitment = (index: number, patch: Partial<ContractDraft['commitments'][number]>) => {
    onChange({ commitments: draft.commitments.map((commitment, position) => (position === index ? { ...commitment, ...patch } : commitment)) });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Processo">
          <input value={draft.process} onChange={(event) => onChange({ process: event.target.value })} maxLength={100} placeholder="Ex.: 123/2026" style={fieldInputStyle} />
        </Field>
        <Field label="Modalidade">
          <input value={draft.modality} onChange={(event) => onChange({ modality: event.target.value })} maxLength={100} placeholder="Ex.: Pregão eletrônico" style={fieldInputStyle} />
        </Field>
      </div>

      <p style={sectionTitleStyle}>Retenções na fonte</p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {WITHHOLDING_TAXES.map((tax) => (
          <Field key={tax} label={`${WITHHOLDING_LABELS[tax]} (%)`} error={errors[`withholdings.${tax}`]}>
            <input
              value={draft.withholdings[tax]}
              onChange={(event) => onChange({ withholdings: { ...draft.withholdings, [tax]: event.target.value.replace(/[^\d,.]/g, '') } })}
              inputMode="decimal"
              placeholder="0,00"
              aria-label={`Retenção de ${WITHHOLDING_LABELS[tax]}`}
              style={textInputStyle(!!errors[`withholdings.${tax}`])}
            />
          </Field>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: 11.5, color: C.textSoft }}>
        Valem para todas as receitas do contrato, inclusive as de horas. Campo vazio é sem retenção. A receita mostra o bruto, as retenções e o líquido, que é o que entra.
      </p>

      <p style={sectionTitleStyle}>Empenhos</p>
      {draft.commitments.length === 0 && (
        <p style={{ margin: 0, fontSize: 11.5, color: C.textMuted }}>
          Um por ano. Faturar acima do saldo do empenho só avisa, não bloqueia.
        </p>
      )}
      {draft.commitments.map((commitment, index) => (
        <div key={commitment.key} className="grid grid-cols-[90px_minmax(0,1fr)_32px] gap-2 sm:grid-cols-[90px_minmax(0,1fr)_180px_32px] sm:items-start">
          <Field label="Ano" required error={errors[`commitments.${index}.year`]}>
            <input
              value={commitment.year}
              onChange={(event) => updateCommitment(index, { year: event.target.value.replace(/\D/g, '').slice(0, 4) })}
              inputMode="numeric"
              aria-label="Ano do empenho"
              style={textInputStyle(!!errors[`commitments.${index}.year`])}
            />
          </Field>
          <Field label="Número" required error={errors[`commitments.${index}.number`]}>
            <input
              value={commitment.number}
              onChange={(event) => updateCommitment(index, { number: event.target.value })}
              maxLength={50}
              placeholder="Ex.: 2027NE000123"
              aria-label="Número do empenho"
              style={textInputStyle(!!errors[`commitments.${index}.number`])}
            />
          </Field>
          <div className="order-last col-span-3 sm:order-none sm:col-span-1">
            <Field label="Valor" required error={errors[`commitments.${index}.amount`]}>
              <MoneyCell
                valueCents={commitment.amountCents}
                onChange={(amountCents) => updateCommitment(index, { amountCents })}
                label="Valor do empenho"
                invalid={!!errors[`commitments.${index}.amount`]}
                height={FIELD_HEIGHT}
              />
            </Field>
          </div>
          <button
            type="button"
            aria-label="Tirar empenho"
            onClick={() => onChange({ commitments: draft.commitments.filter((_, position) => position !== index) })}
            style={{ ...removeButtonStyle, marginTop: 16 }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <div>
        <button
          type="button"
          style={secondaryButtonStyle}
          onClick={() => {
            const lastYear = draft.commitments.reduce((year, commitment) => Math.max(year, Number(commitment.year) || 0), 0);
            onChange({ commitments: [...draft.commitments, emptyCommitment(lastYear ? lastYear + 1 : currentYear)] });
          }}
        >
          <Plus size={12} /> Empenho
        </button>
      </div>
    </div>
  );
}

// ── 4. Mais opções ────────────────────────────────────────────────────────

export interface OptionsData {
  representatives: Representante[];
  currentRepresentative: { id: number; name: string } | null;
  classifications: ClassificacaoReceita[];
  services: CatalogService[];
}

const CLASSIFICATION_FIELDS: Array<{ kind: ChargeKind; field: 'monthlyClassificationId' | 'setupClassificationId' | 'projectClassificationId' }> = [
  { kind: 'mensalidade', field: 'monthlyClassificationId' },
  { kind: 'implantacao', field: 'setupClassificationId' },
  { kind: 'projeto', field: 'projectClassificationId' },
];

export function OptionsStep({ draft, onChange, data, files, onFilesChange, showAttachments }: StepProps & {
  data: OptionsData;
  files: File[];
  onFilesChange: (files: File[]) => void;
  showAttachments: boolean;
}) {
  // Raiz com subcategorias é só o nome do grupo: não se escolhe.
  const groups = new Set(data.classifications.filter((item) => item.ativo && item.parent_id !== null).map((item) => item.parent_id));
  const classificationOptions = opcoesDeClassificacao(data.classifications).filter((option) => !groups.has(option.id));
  const enabled: Record<ChargeKind, boolean> = {
    mensalidade: draft.monthly.enabled,
    implantacao: draft.setup.enabled,
    projeto: draft.project.enabled,
  };
  const representatives = data.representatives.map((representative) => ({ id: representative.id, name: representative.nome }));
  if (data.currentRepresentative && !representatives.some((representative) => representative.id === data.currentRepresentative!.id)) {
    representatives.push(data.currentRepresentative);
  }
  // Serviço desativado continua no contrato que já o lista.
  const services = data.services.filter((service) => service.active || draft.services.some((item) => item.serviceId === service.id));

  const toggleService = (serviceId: number, checked: boolean) => {
    onChange({
      services: checked
        ? [...draft.services, { serviceId, deployed: false }]
        : draft.services.filter((item) => item.serviceId !== serviceId),
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="Representante" hint="As receitas do contrato levam o representante; a comissão sai quando a receita é recebida.">
        <select
          value={draft.representativeId ?? ''}
          onChange={(event) => onChange({ representativeId: event.target.value ? Number(event.target.value) : null })}
          style={fieldInputStyle}
        >
          <option value="">Sem representante</option>
          {representatives.map((representative) => (
            <option key={representative.id} value={representative.id}>{representative.name}</option>
          ))}
        </select>
      </Field>

      {CLASSIFICATION_FIELDS.some(({ kind }) => enabled[kind]) && (
        <>
          <p style={sectionTitleStyle}>Categorias das receitas</p>
          <div className="grid gap-2.5 sm:grid-cols-3">
            {CLASSIFICATION_FIELDS.filter(({ kind }) => enabled[kind]).map(({ kind, field }) => (
              <Field key={kind} label={CHARGE_LABELS[kind]}>
                <select
                  value={draft[field] ?? ''}
                  onChange={(event) => {
                    const patch: Partial<ContractDraft> = {};
                    patch[field] = event.target.value ? Number(event.target.value) : null;
                    onChange(patch);
                  }}
                  style={fieldInputStyle}
                >
                  <option value="">Padrão: Contratos › {CHARGE_LABELS[kind]}</option>
                  {classificationOptions.map((option) => <option key={option.id} value={option.id}>{option.rotulo}</option>)}
                </select>
              </Field>
            ))}
          </div>
        </>
      )}

      <p style={sectionTitleStyle}>Serviços</p>
      {services.length === 0 ? (
        <p style={{ margin: 0, fontSize: 11.5, color: C.textMuted }}>Nenhum serviço no catálogo. Cadastre em Clientes › Catálogo de serviços.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {services.map((service) => {
            const selected = draft.services.find((item) => item.serviceId === service.id);
            return (
              <div key={service.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px' }}>
                <Check checked={!!selected} onChange={(checked) => toggleService(service.id, checked)} label={service.name} />
                {selected && (
                  <Check
                    checked={selected.deployed}
                    onChange={(deployed) => onChange({
                      services: draft.services.map((item) => (item.serviceId === service.id ? { ...item, deployed } : item)),
                    })}
                    label={<span style={{ fontWeight: 500, color: C.textSoft }}>Implantado</span>}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <Field label="Observações">
        <textarea
          value={draft.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          maxLength={2000}
          rows={3}
          style={{ ...fieldInputStyle, height: 'auto', padding: '7px 9px', resize: 'vertical' }}
        />
      </Field>

      {showAttachments && (
        <>
          <p style={sectionTitleStyle}>Anexos</p>
          <PendingAttachments files={files} onChange={onFilesChange} />
        </>
      )}
    </div>
  );
}
