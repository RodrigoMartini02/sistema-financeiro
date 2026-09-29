import { useRef, useState } from 'react';
import type { Cartao } from '../../../types/config';
import type { PaymentMethod } from '../../../types/finance';
import type { CardLimit } from '../../../services/cardLimitsService';
import { C } from '../../../ui/dialogFormTokens';
import { FloatingPanel } from '../../../ui/FloatingPanel';
import { formatCurrency } from '../formatters';
import { cardForMethod, compatibleCards, selectedCard, usesCard } from './draftRules';
import type { ExpenseDraft } from './draftState';
import { INVALID_BORDER, SEPARATOR, chevronStyle, ellipsisStyle, selectStyle } from './fieldStyles';

export const PAYMENT_OPTIONS: ReadonlyArray<{ method: PaymentMethod; label: string; dot: string }> = [
  { method: 'pix', label: 'PIX', dot: '#1f9e8f' },
  { method: 'dinheiro', label: 'Dinheiro', dot: '#4a9a52' },
  { method: 'debito', label: 'Débito', dot: '#c7851d' },
  { method: 'credito', label: 'Crédito', dot: C.primary },
];

function optionOf(method: PaymentMethod) {
  return PAYMENT_OPTIONS.find((option) => option.method === method) ?? PAYMENT_OPTIONS[0]!;
}

/** "Limite disponível: R$ 2.914,40 · fecha dia 3, vence dia 10", só no crédito com limite. */
export function cardLimitText(draft: ExpenseDraft, cards: Cartao[], limits: CardLimit[]): string | null {
  if (draft.paymentMethod !== 'credito') return null;
  const card = selectedCard(draft, cards);
  if (!card) return null;
  const limit = limits.find((item) => item.id === card.id);
  if (!limit?.limite && !card.limite) return null;
  const available = limit ? limit.disponivel : Number(card.limite);
  const days = card.dia_fechamento && card.dia_vencimento
    ? ` · fecha dia ${card.dia_fechamento}, vence dia ${card.dia_vencimento}`
    : '';
  return `Limite disponível: ${formatCurrency(available)}${days}`;
}

export type PaymentChoice = Pick<ExpenseDraft, 'paymentMethod' | 'cardId' | 'paymentMethodTouched'>;

interface PaymentMethodPopoverProps {
  draft: ExpenseDraft;
  cards: Cartao[];
  cardLimits: CardLimit[];
  preferredCardIds: { debito: number | null; credito: number | null };
  /** Barra "Lançando em" (vale para as próximas) ou coluna "Pagamento" do lote. */
  variant: 'bar' | 'cell';
  cardInvalid: boolean;
  onChange: (choice: PaymentChoice) => void;
}

/** Forma de pagamento e cartão, com o limite do cartão de crédito. */
export function PaymentMethodPopover({ draft, cards, cardLimits, preferredCardIds, variant, cardInvalid, onChange }: PaymentMethodPopoverProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const option = optionOf(draft.paymentMethod);
  const card = selectedCard(draft, cards);
  const compatible = compatibleCards(cards, draft.paymentMethod);
  const limitText = cardLimitText(draft, cards, cardLimits);
  const label = `${option.label}${card ? ` · ${card.nome}` : ''}`;

  const chooseMethod = (method: PaymentMethod) => {
    const preferred = usesCard(method) ? preferredCardIds[method] : null;
    onChange({ paymentMethod: method, cardId: cardForMethod(cards, method, draft.cardId, preferred), paymentMethodTouched: true });
    if (!usesCard(method)) setOpen(false);
  };

  // Clicar no cartão escolhido desmarca; escolher um cartão fecha o painel.
  const chooseCard = (cardId: number) => {
    const deselect = draft.cardId === cardId;
    onChange({ paymentMethod: draft.paymentMethod, cardId: deselect ? null : cardId, paymentMethodTouched: true });
    if (!deselect) setOpen(false);
  };

  const trigger = variant === 'bar' ? (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setOpen((current) => !current)}
      title="Forma de pagamento usada nas próximas despesas"
      aria-haspopup="dialog"
      aria-expanded={open}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, height: 30, padding: '0 12px', borderRadius: 15, cursor: 'pointer',
        border: `1px solid ${cardInvalid ? INVALID_BORDER : C.primarySoftBorder}`, background: C.primarySoft,
        color: C.text, fontSize: 12, fontWeight: 600, maxWidth: '100%',
      }}
    >
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, background: option.dot, flex: 'none' }} />
      <span style={{ ...ellipsisStyle, flex: 'initial' }}>
        {option.label}
        {card && <span style={{ fontWeight: 400, color: C.textSoft }}> › {card.nome}</span>}
      </span>
      <span aria-hidden="true" style={{ ...chevronStyle, color: C.primary }}>▼</span>
    </button>
  ) : (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setOpen((current) => !current)}
      title={label}
      aria-label={`Pagamento: ${label}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      style={{ ...selectStyle({ invalid: cardInvalid }), gap: 7 }}
    >
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: 4, background: option.dot, flex: 'none' }} />
      <span style={ellipsisStyle}>
        {option.label}
        {card && <span style={{ color: C.textFaint }}> › {card.nome}</span>}
      </span>
      <span aria-hidden="true" style={chevronStyle}>▼</span>
    </button>
  );

  return (
    <>
      {trigger}
      <FloatingPanel open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} label="Forma de pagamento" width={320}>
        <div role="radiogroup" aria-label="Forma de pagamento" style={{ display: 'flex', gap: 2, padding: 2, background: SEPARATOR, borderRadius: 8 }}>
          {PAYMENT_OPTIONS.map((item) => {
            const active = item.method === draft.paymentMethod;
            return (
              <button
                key={item.method}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => chooseMethod(item.method)}
                style={{
                  flex: 1, height: 28, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  background: active ? '#fff' : 'transparent', color: active ? C.text : C.textSoft,
                  boxShadow: active ? '0 1px 2px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.04)' : 'none',
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {usesCard(draft.paymentMethod) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ fontSize: 11, fontWeight: 500, color: C.textSoft }}>Cartão</span>
            {compatible.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {compatible.map((item) => {
                  const active = item.id === draft.cardId;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => chooseCard(item.id)}
                      aria-pressed={active}
                      style={{
                        height: 28, padding: '0 11px', borderRadius: 14, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                        border: `1px solid ${active ? C.primary : cardInvalid ? INVALID_BORDER : C.borderInput}`,
                        background: active ? C.primarySoft : '#fff', color: active ? C.primaryDark : C.text,
                      }}
                    >
                      {item.nome}
                    </button>
                  );
                })}
              </div>
            ) : (
              <span style={{ fontSize: 12, color: C.textSoft }}>Nenhum cartão cadastrado</span>
            )}
            {limitText && <span style={{ fontSize: 12, color: C.textSoft }}>{limitText}</span>}
          </div>
        )}

        {variant === 'bar' && (
          <span style={{ fontSize: 11, color: C.textFaint, borderTop: `1px solid ${SEPARATOR}`, paddingTop: 9 }}>
            Continua selecionado para as próximas despesas.
          </span>
        )}
      </FloatingPanel>
    </>
  );
}
