import { useRef, useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { IncomeHourType } from '../../../types/finance';
import { C, chipStyle } from '../../../ui/dialogFormTokens';
import { FloatingPanel } from '../../../ui/FloatingPanel';
import { formatCurrency } from '../formatters';
import { formatCents } from '../entry-dialog/cents';
import { INVALID_BORDER, SEPARATOR, fieldStyle } from '../entry-dialog/fieldStyles';
import {
  billableHoursInfo, calculatedAmountCents, commissionPreview, contractPrefill, hourRate, productSaleInfo,
  type IncomeRuleContext,
} from './draftRules';
import type { IncomeDraft, IncomeDraftPatch } from './draftState';

const HOUR_TYPES: ReadonlyArray<{ type: IncomeHourType; label: string }> = [
  { type: 'presencial', label: 'Presencial' },
  { type: 'remoto', label: 'Remoto' },
];

const sectionTitleStyle = { fontSize: 12, fontWeight: 600, color: C.text };
const smallChip = (active: boolean) => chipStyle(active, { h: 26, r: 13, size: 12 });

interface IncomeDetailsPopoverProps {
  draft: IncomeDraft;
  context: IncomeRuleContext;
  /** Na edição só o representante muda: produto e horas valem só na criação. */
  isEdit: boolean;
  invalid: boolean;
  onUpdate: (patch: IncomeDraftPatch) => void;
  /** Dica de primeiro acesso ancorada no botão (linha de entrada). */
  guide?: ReactNode;
}

/** "⋯" da receita na conta PJ: representante com a comissão, produto vendido e horas a faturar. */
export function IncomeDetailsPopover({ draft, context, isEdit, invalid, onUpdate, guide }: IncomeDetailsPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const filled = draft.representativeId !== null || draft.productId !== null || draft.contractId !== null;
  const commission = commissionPreview(draft, context);
  const sale = productSaleInfo(draft, context);
  const hours = billableHoursInfo(draft, context);

  // Produto e horas preenchem o valor; ele continua editável depois.
  const updateAndRecalculate = (change: Partial<IncomeDraft>) => onUpdate((current) => {
    const next = { ...current, ...change };
    const amountCents = calculatedAmountCents(next, context);
    return amountCents ? { ...change, amountCents } : change;
  });

  const chooseContract = (contractId: number | null) => onUpdate((current) => {
    const contract = context.contracts.find((item) => item.id === contractId);
    return { contractId, hourType: null, hours: null, ...(contract ? contractPrefill(current, contract) : {}) };
  });

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        title="Representante, produto vendido e horas a faturar"
        aria-label="Representante, produto vendido e horas a faturar"
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, padding: 0, borderRadius: 8,
          border: `1px solid ${invalid ? INVALID_BORDER : filled ? C.primarySoftBorder : C.borderInput}`,
          background: filled ? C.primarySoft : '#fff', color: filled ? C.primaryDark : C.textSoft, cursor: 'pointer',
        }}
      >
        <MoreHorizontal size={15} />
      </button>
      {guide}

      <FloatingPanel open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} label="Detalhes da receita" width={360} align="end">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={sectionTitleStyle}>Representante</span>
          {context.representatives.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button type="button" onClick={() => onUpdate({ representativeId: null })} style={smallChip(draft.representativeId === null)}>
                Nenhum
              </button>
              {context.representatives.map((representative) => (
                <button
                  key={representative.id}
                  type="button"
                  onClick={() => onUpdate({ representativeId: representative.id })}
                  style={smallChip(draft.representativeId === representative.id)}
                >
                  {representative.nome}
                </button>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: 12, color: C.textFaint }}>Nenhum representante cadastrado</span>
          )}
          {commission.kind === 'rule' && (
            <span style={{ fontSize: 12, color: C.textSoft }}>
              {commission.representativeName} recebe {formatCents(commission.amountCents)} ·{' '}
              {commission.percent.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% ·{' '}
              {commission.type === 'unica' ? 'única (só nesta receita)' : 'mensal (em cada mês repetido)'}
            </span>
          )}
          {commission.kind === 'missing' && (
            <span style={{ fontSize: 12, color: C.warn }}>Nenhuma comissão configurada para esta categoria.</span>
          )}
        </div>

        {!isEdit && context.products.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10, borderTop: `1px solid ${SEPARATOR}` }}>
            <span style={sectionTitleStyle}>Produto vendido</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 90px', gap: 6 }}>
              <select
                value={draft.productId ?? ''}
                onChange={(event) => updateAndRecalculate({
                  productId: event.target.value || null,
                  soldQuantity: event.target.value ? draft.soldQuantity : null,
                })}
                aria-label="Produto vendido"
                style={fieldStyle()}
              >
                <option value="">Nenhum (lançamento avulso)</option>
                {context.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.nome} — {formatCurrency(Number(product.valor))} · {Number(product.quantidadeEstoque)} em estoque
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0.001"
                step="0.001"
                value={draft.soldQuantity ?? ''}
                onChange={(event) => updateAndRecalculate({ soldQuantity: event.target.value !== '' ? Number(event.target.value) : null })}
                disabled={!draft.productId}
                placeholder="Qtd."
                aria-label="Quantidade vendida"
                style={fieldStyle({ disabled: !draft.productId })}
              />
            </div>
            {sale && (
              <span style={{ fontSize: 12, color: sale.insufficient ? C.danger : C.textSoft }}>
                {sale.insufficient
                  ? `Estoque insuficiente: há ${sale.stock} disponível.`
                  : `Baixa ${sale.quantity} do estoque · restam ${sale.remaining}. O valor pode ser ajustado.`}
              </span>
            )}
          </div>
        )}

        {!isEdit && context.contracts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10, borderTop: `1px solid ${SEPARATOR}` }}>
            <span style={sectionTitleStyle}>Horas a faturar</span>
            <select
              value={draft.contractId ?? ''}
              onChange={(event) => chooseContract(event.target.value ? Number(event.target.value) : null)}
              aria-label="Contrato"
              style={fieldStyle()}
            >
              <option value="">Nenhum contrato</option>
              {context.contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.cliente_nome}{contract.numero ? ` — ${contract.numero}` : ''}
                </option>
              ))}
            </select>
            {hours && (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                  {HOUR_TYPES.filter(({ type }) => hourRate(hours.contract, type) !== null).map(({ type, label }) => (
                    <button key={type} type="button" onClick={() => updateAndRecalculate({ hourType: type })} style={smallChip(draft.hourType === type)}>
                      {label}
                    </button>
                  ))}
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={draft.hours ?? ''}
                    onChange={(event) => updateAndRecalculate({ hours: event.target.value !== '' ? Number(event.target.value) : null })}
                    disabled={!draft.hourType}
                    placeholder="Horas"
                    aria-label="Quantidade de horas"
                    style={{ ...fieldStyle({ disabled: !draft.hourType }), width: 80 }}
                  />
                </div>
                {draft.hourType && (
                  <span style={{ fontSize: 12, color: C.textSoft }}>
                    {hours.rate !== null ? `${formatCurrency(hours.rate)}/h` : 'Sem valor por hora'}
                    {hours.balance !== null ? ` · saldo ${hours.balance}h` : ''}
                    {hours.totalCents !== null ? ` · ${formatCents(hours.totalCents)}` : ''}
                  </span>
                )}
              </>
            )}
          </div>
        )}
      </FloatingPanel>
    </div>
  );
}
