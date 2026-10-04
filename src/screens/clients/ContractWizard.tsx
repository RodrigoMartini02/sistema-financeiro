import { useMemo, useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAmendment, createContract, previewContract, updateContract, uploadContractAttachment,
  type ContractDetail, type ContractPreviewTarget,
} from '../../services/contractsService';
import { fetchClassificacoesReceita } from '../../services/incomeClassificationsService';
import { invalidateIncomeQueries, queryKeys } from '../../services/queryKeys';
import { fetchRepresentantes } from '../../services/representantesService';
import { fetchCatalogServices } from '../../services/serviceCatalogService';
import { Dialog } from '../../ui/dialog';
import { C, dialogFooterStyle, saveButtonDisabledStyle, saveButtonStyle } from '../../ui/dialogFormTokens';
import type { ClientType } from '../../utils/contractDisplay';
import {
  WIZARD_STEP_LABELS, contractRequestBody, draftFromContract, emptyContractDraft, firstInvalidStep, validateStep, wizardSteps,
  type ContractDraft, type DraftErrors, type WizardStep,
} from '../../utils/contractForm';
import { getLocalTodayIso } from '../../utils/date';
import { formatCurrency } from '../finance/formatters';
import { ChargesStep, OptionsStep, PublicEntityStep, TermStep } from './ContractWizardSteps';
import { errorBoxStyle, secondaryButtonStyle } from './clientStyles';

export type ContractWizardMode = 'create' | 'edit' | 'amendment';

interface ContractWizardProps {
  mode: ContractWizardMode;
  accountId: number;
  client: { id: number; name: string; type: ClientType };
  /** Contrato atual, na alteração e no aditivo. */
  contract?: ContractDetail;
  onClose: () => void;
  /** `failedAttachments`: arquivos que não subiram (o contrato já está salvo). */
  onSaved: (contract: ContractDetail, failedAttachments: string[]) => void;
}

const TITLES: Record<ContractWizardMode, string> = {
  create: 'Novo contrato',
  edit: 'Editar contrato',
  amendment: 'Aditivo do contrato',
};

const SAVE_LABELS: Record<ContractWizardMode, string> = {
  create: 'Salvar contrato',
  edit: 'Salvar alterações',
  amendment: 'Salvar aditivo',
};

function stepButtonStyle(state: 'done' | 'current' | 'next'): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px 4px 4px', borderRadius: 999,
    border: `1px solid ${state === 'current' ? C.primary : C.border}`,
    background: state === 'current' ? C.primarySoft : '#fff',
    color: state === 'next' ? C.textFaint : C.text,
    fontSize: 12, fontWeight: state === 'current' ? 700 : 600, cursor: state === 'next' ? 'default' : 'pointer', whiteSpace: 'nowrap',
  };
}

function stepNumberStyle(state: 'done' | 'current' | 'next'): CSSProperties {
  return {
    display: 'grid', placeItems: 'center', width: 20, height: 20, borderRadius: 999, fontSize: 11, fontWeight: 700,
    background: state === 'next' ? '#eef2f6' : C.primary, color: state === 'next' ? C.textFaint : '#fff',
  };
}

/** Mês e ano da competência: "02/2027". */
function monthYear(iso: string): string {
  return `${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

function PreviewStep({ target, draft, publicEntity, mode, startDate }: {
  target: ContractPreviewTarget;
  draft: ContractDraft;
  publicEntity: boolean;
  mode: ContractWizardMode;
  startDate: string;
}) {
  const body = useMemo(() => contractRequestBody(draft, publicEntity), [draft, publicEntity]);
  const previewQuery = useQuery({
    queryKey: queryKeys.contractPreview(target, body),
    queryFn: () => previewContract(target, body),
    retry: false,
  });

  if (previewQuery.isLoading) {
    return <p style={{ margin: 0, fontSize: 12.5, color: C.textSoft }}>Calculando as receitas...</p>;
  }
  if (previewQuery.isError) {
    return <div role="alert" style={errorBoxStyle}>{previewQuery.error.message}</div>;
  }
  const preview = previewQuery.data!;
  const count = preview.incomes.length;
  const withholdings = preview.incomes.some((income) => income.withholdings !== null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 12.5, color: C.text }}>
        <strong>{count} receita{count === 1 ? '' : 's'} prevista{count === 1 ? '' : 's'}</strong>
        <span>Total {formatCurrency(preview.totalGross)}</span>
        {withholdings && <span>Líquido {formatCurrency(preview.totalNet)}</span>}
      </div>
      {mode === 'edit' && preview.replacedCount > 0 && (
        <p style={{ margin: 0, fontSize: 11.5, color: C.textSoft }}>
          As {preview.replacedCount} receitas previstas a partir deste mês serão refeitas com estes valores. As faturadas, as recebidas e as de meses anteriores não mudam.
        </p>
      )}
      {mode === 'amendment' && (
        <p style={{ margin: 0, fontSize: 11.5, color: C.textSoft }}>
          O contrato atual será encerrado{preview.replacedCount > 0 ? `, e as ${preview.replacedCount} receitas previstas dele a partir de ${monthYear(startDate)} serão canceladas` : ''}. Os meses já faturados ou recebidos não se repetem.
        </p>
      )}
      {count === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: C.textMuted }}>
          Nenhuma receita prevista nova. O banco de horas é lançado nas receitas, conforme o uso.
        </p>
      ) : (
        <div style={{ overflowX: 'auto', borderRadius: 10, border: `1px solid ${C.border}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: C.text }}>
            <thead>
              <tr style={{ background: C.panelBg, color: C.textSoft, textAlign: 'left' }}>
                <th style={{ padding: '7px 10px', fontWeight: 600 }}>Vencimento</th>
                <th style={{ padding: '7px 10px', fontWeight: 600 }}>Descrição</th>
                <th style={{ padding: '7px 10px', fontWeight: 600, textAlign: 'right' }}>{withholdings ? 'Bruto' : 'Valor'}</th>
                {withholdings && <th style={{ padding: '7px 10px', fontWeight: 600, textAlign: 'right' }}>Líquido</th>}
              </tr>
            </thead>
            <tbody>
              {preview.incomes.map((income) => (
                <tr key={`${income.chargeKind}-${income.competence}`} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td style={{ padding: '6px 10px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {income.dueDate.slice(8, 10)}/{income.dueDate.slice(5, 7)}/{income.dueDate.slice(0, 4)}
                  </td>
                  <td style={{ padding: '6px 10px', minWidth: 180 }}>{income.description}</td>
                  <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(income.grossAmount)}
                  </td>
                  {withholdings && (
                    <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {formatCurrency(income.amount)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Contrato em etapas (novo, alteração e aditivo): vigência, cobranças, órgão
 * público (só nele), mais opções e a prévia das receitas, calculada no
 * servidor com a mesma conta da gravação. Numa falha ao salvar, a mensagem
 * aparece e o que foi digitado fica.
 */
export function ContractWizard({ mode, accountId, client, contract, onClose, onSaved }: ContractWizardProps) {
  const qc = useQueryClient();
  const todayIso = getLocalTodayIso();
  const publicEntity = client.type === 'orgao_publico';
  const steps = wizardSteps(publicEntity);
  const [draft, setDraft] = useState<ContractDraft>(() => (
    contract && mode !== 'create' ? draftFromContract(contract, mode, todayIso) : emptyContractDraft(todayIso)
  ));
  const [stepIndex, setStepIndex] = useState(0);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [files, setFiles] = useState<File[]>([]);
  const step: WizardStep = steps[stepIndex]!;

  const target: ContractPreviewTarget = mode === 'create'
    ? { mode: 'create', accountId, clientId: client.id }
    : { mode: mode === 'edit' ? 'update' : 'amendment', contractId: contract!.id };

  const representativesQuery = useQuery({ queryKey: queryKeys.representantes, queryFn: () => fetchRepresentantes() });
  const classificationsQuery = useQuery({
    queryKey: queryKeys.classificacoesReceita(accountId),
    queryFn: () => fetchClassificacoesReceita(accountId),
  });
  const servicesQuery = useQuery({
    queryKey: queryKeys.serviceCatalog(accountId, true),
    queryFn: () => fetchCatalogServices(accountId, true),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = contractRequestBody(draft, publicEntity);
      const saved = mode === 'create'
        ? await createContract(accountId, client.id, body)
        : mode === 'edit'
          ? await updateContract(contract!.id, body)
          : await createAmendment(contract!.id, body);
      const failed: string[] = [];
      for (const file of files) {
        try {
          await uploadContractAttachment(saved.id, file);
        } catch {
          failed.push(file.name);
        }
      }
      return { saved, failed };
    },
    onSuccess: ({ saved, failed }) => {
      invalidateIncomeQueries(qc);
      onSaved(saved, failed);
    },
  });

  const change = (patch: Partial<ContractDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setErrors({});
  };

  const goTo = (index: number) => {
    // Para a frente, só passando pela conferência das etapas do caminho.
    if (index > stepIndex) {
      for (let position = stepIndex; position < index; position += 1) {
        const found = validateStep(steps[position]!, draft);
        if (Object.keys(found).length > 0) {
          setStepIndex(position);
          setErrors(found);
          return;
        }
      }
    }
    setErrors({});
    setStepIndex(index);
  };

  const save = () => {
    const invalid = firstInvalidStep(steps, draft);
    if (invalid) {
      setStepIndex(steps.indexOf(invalid));
      setErrors(validateStep(invalid, draft));
      return;
    }
    saveMutation.mutate();
  };

  const optionsData = {
    representatives: representativesQuery.data ?? [],
    // Representante desativado continua no contrato que já o tem.
    currentRepresentative: contract?.representative ?? null,
    classifications: classificationsQuery.data ?? [],
    services: servicesQuery.data ?? [],
  };
  const isLast = stepIndex === steps.length - 1;

  return (
    <Dialog open title={TITLES[mode]} description={client.name} onClose={onClose} size="lg" scrollBody={false} fullHeight>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <nav aria-label="Etapas do contrato" style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px var(--dialog-px)', borderBottom: `1px solid ${C.border}` }}>
          {steps.map((item, index) => {
            const state = index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'next';
            return (
              <button
                key={item}
                type="button"
                aria-current={state === 'current' ? 'step' : undefined}
                onClick={() => goTo(index)}
                style={stepButtonStyle(state)}
              >
                <span style={stepNumberStyle(state)}>{index + 1}</span>
                {WIZARD_STEP_LABELS[item]}
              </button>
            );
          })}
        </nav>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px var(--dialog-px)' }}>
          {step === 'term' && <TermStep draft={draft} errors={errors} onChange={change} todayIso={todayIso} />}
          {step === 'charges' && <ChargesStep draft={draft} errors={errors} onChange={change} todayIso={todayIso} />}
          {step === 'public' && <PublicEntityStep draft={draft} errors={errors} onChange={change} todayIso={todayIso} />}
          {step === 'options' && (
            <OptionsStep
              draft={draft}
              errors={errors}
              onChange={change}
              todayIso={todayIso}
              data={optionsData}
              files={files}
              onFilesChange={setFiles}
              showAttachments
            />
          )}
          {step === 'preview' && (
            <PreviewStep target={target} draft={draft} publicEntity={publicEntity} mode={mode} startDate={contractRequestBody(draft, publicEntity).startDate} />
          )}
          {saveMutation.isError && (
            <div role="alert" style={{ ...errorBoxStyle, marginTop: 12 }}>{saveMutation.error.message}</div>
          )}
        </div>

        <div style={dialogFooterStyle}>
          {stepIndex > 0 && (
            <button type="button" style={secondaryButtonStyle} onClick={() => goTo(stepIndex - 1)} disabled={saveMutation.isPending}>
              Voltar
            </button>
          )}
          <div style={{ marginLeft: 'auto' }}>
            {isLast ? (
              <button
                type="button"
                onClick={save}
                disabled={saveMutation.isPending}
                style={saveMutation.isPending ? saveButtonDisabledStyle : saveButtonStyle}
              >
                {saveMutation.isPending ? 'Salvando...' : SAVE_LABELS[mode]}
              </button>
            ) : (
              <button type="button" onClick={() => goTo(stepIndex + 1)} style={saveButtonStyle}>
                {stepIndex === steps.length - 2 ? 'Ver prévia' : 'Próximo'}
              </button>
            )}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
