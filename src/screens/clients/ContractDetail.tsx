import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, FileSignature, Pencil, TrendingUp } from 'lucide-react';
import { useConfirm } from '../../context/ConfirmContext';
import {
  applyReadjustment, closeContract, deleteContract, dismissReadjustment, fetchContract, invoiceContractIncome,
  type ContractDetail as Contract, type ContractIncome,
} from '../../services/contractsService';
import { invalidateIncomeQueries, queryKeys } from '../../services/queryKeys';
import { Dialog } from '../../ui/dialog';
import { C, dialogFooterStyle, labelStyle, saveButtonDisabledStyle, saveButtonStyle } from '../../ui/dialogFormTokens';
import { InfoBanner } from '../../ui/InfoBanner';
import { CFG } from '../../ui/configTokens';
import {
  CHARGE_LABELS, CONTRACT_STATUS_LABELS, WITHHOLDING_LABELS, WITHHOLDING_TAXES, expiryLabel, formatHours, formatPercent,
  incomeStatusView, installmentsLabel, termLabel,
} from '../../utils/contractDisplay';
import { parseDecimal } from '../../utils/contractForm';
import { getLocalTodayIso, isoToBrDate } from '../../utils/date';
import { formatCurrency } from '../finance/formatters';
import { ContractAttachments } from './ContractAttachments';
import { ContractWizard, type ContractWizardMode } from './ContractWizard';
import {
  dangerOutlineButtonStyle, detailLabelStyle, detailRowStyle, errorBoxStyle, fieldErrorStyle, inputStyle, linkButtonStyle,
  mutedTextStyle, panelStyle, secondaryButtonStyle, sectionTitleStyle, stackStyle, toneBadgeStyle,
} from './clientStyles';

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <p style={sectionTitleStyle}>{title}</p>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={detailRowStyle}>
      <span style={detailLabelStyle}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{children}</span>
    </div>
  );
}

/** Reajuste: o percentual do índice do período, com duas casas (0,00% não muda os valores). */
function ReadjustmentDialog({ contract, onClose, onDone }: { contract: Contract; onClose: () => void; onDone: () => void }) {
  const [percent, setPercent] = useState('');
  const [error, setError] = useState('');
  const mutation = useMutation({ mutationFn: (value: number) => applyReadjustment(contract.id, value), onSuccess: onDone });
  const preview = (() => {
    const value = parseDecimal(percent);
    if (value === null || contract.monthlyFee === null) return null;
    return Math.round(contract.monthlyFee * (100 + value)) / 100;
  })();

  const submit = () => {
    const value = parseDecimal(percent);
    if (value === null || value < 0 || value > 100 || Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) {
      setError('Informe o percentual, de 0,00 a 100,00');
      return;
    }
    mutation.mutate(value);
  };

  return (
    <Dialog open title="Aplicar reajuste" description={`Aniversário em ${isoToBrDate(contract.readjustment.anniversary)}`} onClose={onClose} size="sm" scrollBody={false}>
      <form style={{ display: 'flex', flexDirection: 'column' }} onSubmit={(event) => { event.preventDefault(); submit(); }} noValidate>
        <div style={{ padding: '12px var(--dialog-px)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <label style={labelStyle}><span>Percentual do reajuste (%)</span><span style={{ color: C.danger }}>*</span></label>
            <input
              value={percent}
              onChange={(event) => { setPercent(event.target.value.replace(/[^\d,.]/g, '')); setError(''); }}
              inputMode="decimal"
              placeholder="Ex.: 4,62"
              autoFocus
              style={inputStyle(!!error)}
            />
            {error && <p role="alert" style={fieldErrorStyle}>{error}</p>}
          </div>
          <p style={{ margin: 0, fontSize: 11.5, color: C.textSoft }}>
            Muda a mensalidade e o valor da hora das receitas previstas a partir deste mês. As parcelas, as faturadas e as recebidas não mudam.
          </p>
          {preview !== null && (
            <p style={{ margin: 0, fontSize: 12.5, color: C.text }}>
              Mensalidade: {formatCurrency(contract.monthlyFee!)} → <strong>{formatCurrency(preview)}</strong>
            </p>
          )}
          {mutation.isError && <div role="alert" style={errorBoxStyle}>{mutation.error.message}</div>}
        </div>
        <div style={dialogFooterStyle}>
          <div style={{ marginLeft: 'auto' }}>
            <button type="submit" disabled={mutation.isPending} style={mutation.isPending ? saveButtonDisabledStyle : saveButtonStyle}>
              {mutation.isPending ? 'Aplicando...' : 'Aplicar reajuste'}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

function IncomeRow({ income, todayIso, onInvoice, invoicing }: {
  income: ContractIncome;
  todayIso: string;
  onInvoice: (income: ContractIncome) => void;
  invoicing: boolean;
}) {
  const status = incomeStatusView(income.status, income.dueDate, todayIso);
  const cancelled = income.status === 'cancelada';
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', padding: '7px 0', borderTop: `1px solid ${CFG.borderSoft}` }}>
      <span style={{ flex: 'none', width: 78, fontSize: 12, fontVariantNumeric: 'tabular-nums', color: CFG.textSoft }}>
        {isoToBrDate(income.dueDate)}
      </span>
      <span style={{
        flex: '1 1 160px', minWidth: 0, fontSize: 12.5, color: cancelled ? CFG.muted : CFG.text,
        textDecoration: cancelled ? 'line-through' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {income.description}
        {income.hours && <span style={{ color: CFG.muted }}> · {formatHours(income.hours.hours)} {income.hours.hourTypeName}</span>}
      </span>
      <span style={{ flex: 'none', textAlign: 'right', fontSize: 12.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
        {formatCurrency(income.amount)}
        {income.grossAmount !== null && (
          <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: CFG.muted }}>bruto {formatCurrency(income.grossAmount)}</span>
        )}
      </span>
      <span style={toneBadgeStyle(status.tone)}>{status.label}</span>
      {income.status === 'prevista' && (
        <button type="button" style={secondaryButtonStyle} disabled={invoicing} onClick={() => onInvoice(income)}>
          Faturar
        </button>
      )}
    </div>
  );
}

interface ContractDetailProps {
  contractId: number;
  accountId: number;
  backLabel: string;
  onBack: () => void;
  /** Outro contrato da cadeia de aditivos (o anterior ou o novo). */
  onOpenContract: (contractId: number) => void;
}

/**
 * Ficha do contrato: situação e vigência, cobranças, banco de horas, órgão
 * público (retenções e empenhos com saldo), serviços, reajuste disponível,
 * receitas com "Faturar" e anexos. Editar, aditivo, encerrar e excluir
 * conforme a situação.
 */
export function ContractDetail({ contractId, accountId, backLabel, onBack, onOpenContract }: ContractDetailProps) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const todayIso = getLocalTodayIso();
  const [wizard, setWizard] = useState<ContractWizardMode | null>(null);
  const [readjusting, setReadjusting] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'warn' | 'success'; text: string } | null>(null);
  const [actionError, setActionError] = useState('');

  const contractQuery = useQuery({ queryKey: queryKeys.contract(contractId), queryFn: () => fetchContract(contractId) });
  const refresh = () => invalidateIncomeQueries(qc);
  const fail = (error: Error) => setActionError(error.message);

  const closeMutation = useMutation({ mutationFn: () => closeContract(contractId), onSuccess: refresh, onError: fail });
  const deleteMutation = useMutation({
    mutationFn: () => deleteContract(contractId),
    onSuccess: () => { refresh(); onBack(); },
    onError: fail,
  });
  const dismissMutation = useMutation({ mutationFn: () => dismissReadjustment(contractId), onSuccess: refresh, onError: fail });
  const invoiceMutation = useMutation({
    mutationFn: (income: ContractIncome) => invoiceContractIncome(income.id),
    onSuccess: (result, income) => {
      refresh();
      setNotice(result.warning
        ? { tone: 'warn', text: `${income.description}: faturada. ${result.warning}.` }
        : { tone: 'success', text: `${income.description}: faturada.` });
    },
    onError: fail,
  });

  if (contractQuery.isLoading) {
    return <p style={{ padding: '16px 0', textAlign: 'center', fontSize: 12.5, color: CFG.muted }}>Carregando o contrato...</p>;
  }
  if (contractQuery.isError || !contractQuery.data) {
    return (
      <div style={stackStyle(10)}>
        <button type="button" style={linkButtonStyle} onClick={onBack}><ArrowLeft size={13} /> {backLabel}</button>
        <div role="alert" style={errorBoxStyle}>
          {contractQuery.error?.message ?? 'Não foi possível carregar o contrato.'}{' '}
          <button type="button" onClick={() => void contractQuery.refetch()} style={{ ...linkButtonStyle, color: 'inherit', textDecoration: 'underline' }}>
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  const contract = contractQuery.data;
  const active = contract.status === 'ativo';
  const expiry = active ? expiryLabel(contract.endDate, todayIso) : null;
  const readjustable = active && (contract.monthlyFee !== null || contract.hourTypes.length > 0);

  const askClose = async () => {
    setActionError('');
    const ok = await confirm({
      title: 'Encerrar contrato',
      message: 'As receitas previstas a partir do próximo mês serão canceladas. As faturadas, as recebidas e a do mês atual continuam.',
      confirmLabel: 'Encerrar',
    });
    if (ok) closeMutation.mutate();
  };

  const askDelete = async () => {
    setActionError('');
    const ok = await confirm({
      title: 'Excluir contrato',
      message: 'O contrato, as receitas previstas dele e os anexos serão apagados. Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
    });
    if (ok) deleteMutation.mutate();
  };

  const askDismiss = async () => {
    setActionError('');
    const ok = await confirm({
      title: 'Dispensar reajuste',
      message: 'O aviso some até o próximo aniversário do contrato. Os valores não mudam.',
      confirmLabel: 'Dispensar',
      variant: 'default',
    });
    if (ok) dismissMutation.mutate();
  };

  return (
    <div style={stackStyle(10)}>
      <div>
        <button type="button" style={linkButtonStyle} onClick={onBack}><ArrowLeft size={13} /> {backLabel}</button>
      </div>

      <section style={panelStyle}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <FileSignature size={16} style={{ color: CFG.primary }} />
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: CFG.text }}>
            {contract.number ? `Contrato ${contract.number}` : 'Contrato sem número'}
          </h2>
          {contract.amendmentNumber > 0 && <span style={toneBadgeStyle('neutral')}>Aditivo nº {contract.amendmentNumber}</span>}
          <span style={toneBadgeStyle(active ? 'success' : 'neutral')}>{CONTRACT_STATUS_LABELS[contract.status]}</span>
          {expiry && <span style={toneBadgeStyle(contract.expiringSoon ? 'warn' : 'neutral')}>{expiry}</span>}
        </div>
        {contract.description && <p style={{ margin: 0, fontSize: 12.5, color: CFG.textSoft }}>{contract.description}</p>}
        <p style={mutedTextStyle}>
          <CalendarClock size={12} style={{ verticalAlign: '-2px' }} /> {termLabel(contract.startDate, contract.endDate)} · vencimento dia {contract.dueDay}
          {contract.closedAt && ` · encerrado em ${isoToBrDate(contract.closedAt)}`}
          {contract.representative && ` · representante ${contract.representative.name}`}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {active && (
            <>
              <button type="button" style={secondaryButtonStyle} onClick={() => setWizard('edit')}><Pencil size={12} /> Editar</button>
              <button type="button" style={secondaryButtonStyle} onClick={() => setWizard('amendment')}>Aditivo</button>
              <button type="button" style={dangerOutlineButtonStyle} onClick={() => void askClose()} disabled={closeMutation.isPending}>Encerrar</button>
            </>
          )}
          {contract.canDelete && (
            <button type="button" style={dangerOutlineButtonStyle} onClick={() => void askDelete()} disabled={deleteMutation.isPending}>Excluir</button>
          )}
          {contract.previousContractId !== null && (
            <button type="button" style={linkButtonStyle} onClick={() => onOpenContract(contract.previousContractId!)}>Ver contrato anterior</button>
          )}
          {contract.nextContractId !== null && (
            <button type="button" style={linkButtonStyle} onClick={() => onOpenContract(contract.nextContractId!)}>Ver aditivo</button>
          )}
        </div>
        {actionError && <div role="alert" style={errorBoxStyle}>{actionError}</div>}
      </section>

      {readjustable && contract.readjustment.available && (
        <InfoBanner variant="warn">
          <TrendingUp size={14} style={{ flex: 'none' }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            Reajuste disponível desde {isoToBrDate(contract.readjustment.anniversary)}: aplique o índice do período ou dispense.
          </span>
          <button type="button" style={secondaryButtonStyle} onClick={() => setReadjusting(true)}>Aplicar</button>
          <button type="button" style={secondaryButtonStyle} onClick={() => void askDismiss()} disabled={dismissMutation.isPending}>Dispensar</button>
        </InfoBanner>
      )}
      {notice && (
        <InfoBanner variant={notice.tone}>
          <span role="status" style={{ flex: 1, minWidth: 0 }}>{notice.text}</span>
          <button type="button" style={secondaryButtonStyle} onClick={() => setNotice(null)}>Fechar</button>
        </InfoBanner>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 lg:grid-cols-2">
        <Panel title="Cobranças">
          {contract.monthlyFee !== null && (
            <Row label={CHARGE_LABELS.mensalidade}>
              {formatCurrency(contract.monthlyFee)}/mês
              {contract.monthlyNet !== null && contract.monthlyNet !== contract.monthlyFee && (
                <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: CFG.muted }}>líquido {formatCurrency(contract.monthlyNet)}</span>
              )}
            </Row>
          )}
          {contract.setupFee && (
            <Row label={CHARGE_LABELS.implantacao}>
              {formatCurrency(contract.setupFee.amount)}
              <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: CFG.muted }}>{installmentsLabel(contract.setupFee)}</span>
            </Row>
          )}
          {contract.projectFee && (
            <Row label={CHARGE_LABELS.projeto}>
              {formatCurrency(contract.projectFee.amount)}
              <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: CFG.muted }}>{installmentsLabel(contract.projectFee)}</span>
            </Row>
          )}
          {contract.monthlyFee === null && !contract.setupFee && !contract.projectFee && (
            <p style={mutedTextStyle}>Só banco de horas.</p>
          )}
        </Panel>

        {contract.hourTypes.length > 0 && (
          <Panel title="Banco de horas">
            {contract.hourTypes.map((hourType) => (
              <Row key={hourType.id} label={`${hourType.name} · ${formatCurrency(hourType.hourlyRate)}/h`}>
                saldo {formatHours(hourType.balance)}
                <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: CFG.muted }}>
                  {formatHours(hourType.used)} de {formatHours(hourType.quantity)} lançadas
                </span>
              </Row>
            ))}
          </Panel>
        )}

        {contract.publicEntity && (
          <Panel title="Órgão público">
            {(contract.publicEntity.process || contract.publicEntity.modality) && (
              <Row label="Processo e modalidade">
                {[contract.publicEntity.process, contract.publicEntity.modality].filter(Boolean).join(' · ')}
              </Row>
            )}
            <Row label="Retenções">
              {WITHHOLDING_TAXES.filter((tax) => (contract.publicEntity!.withholdings[tax] ?? 0) > 0)
                .map((tax) => `${WITHHOLDING_LABELS[tax]} ${formatPercent(contract.publicEntity!.withholdings[tax]!)}`)
                .join(' · ') || 'Nenhuma'}
            </Row>
            {contract.publicEntity.commitments.length === 0 && <p style={mutedTextStyle}>Nenhum empenho cadastrado.</p>}
            {contract.publicEntity.commitments.map((commitment) => (
              <Row key={commitment.year} label={`Empenho ${commitment.year} · ${commitment.number}`}>
                <span style={{ color: commitment.balance < 0 ? CFG.danger : undefined }}>saldo {formatCurrency(commitment.balance)}</span>
                <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: CFG.muted }}>de {formatCurrency(commitment.amount)}</span>
              </Row>
            ))}
          </Panel>
        )}

        {contract.services.length > 0 && (
          <Panel title="Serviços">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {contract.services.map((service) => (
                <span key={service.serviceId} style={toneBadgeStyle(service.deployed ? 'success' : 'neutral')}>
                  {service.name}{service.deployed ? ' · implantado' : ''}
                </span>
              ))}
            </div>
          </Panel>
        )}
      </div>

      <Panel title={`Receitas (${contract.incomes.length})`}>
        {contract.incomes.length === 0 ? (
          <p style={mutedTextStyle}>Nenhuma receita ainda.</p>
        ) : (
          <div>
            {contract.incomes.map((income) => (
              <IncomeRow
                key={income.id}
                income={income}
                todayIso={todayIso}
                invoicing={invoiceMutation.isPending}
                onInvoice={(item) => { setActionError(''); setNotice(null); invoiceMutation.mutate(item); }}
              />
            ))}
          </div>
        )}
      </Panel>

      {contract.notes && (
        <Panel title="Observações">
          <p style={{ margin: 0, fontSize: 12.5, color: CFG.text, whiteSpace: 'pre-wrap' }}>{contract.notes}</p>
        </Panel>
      )}

      <section style={panelStyle}>
        <ContractAttachments contractId={contract.id} attachments={contract.attachments} />
      </section>

      {wizard && (
        <ContractWizard
          mode={wizard}
          accountId={accountId}
          client={contract.client}
          contract={contract}
          onClose={() => setWizard(null)}
          onSaved={(saved, failed) => {
            setWizard(null);
            if (failed.length > 0) {
              setNotice({ tone: 'warn', text: `Contrato salvo, mas estes anexos não subiram: ${failed.join(', ')}. Envie de novo em Anexos.` });
            }
            if (saved.id !== contract.id) onOpenContract(saved.id);
          }}
        />
      )}
      {readjusting && (
        <ReadjustmentDialog
          contract={contract}
          onClose={() => setReadjusting(false)}
          onDone={() => { setReadjusting(false); refresh(); }}
        />
      )}
    </div>
  );
}
