import type { CSSProperties } from 'react';
import { C } from '../../../ui/dialogFormTokens';

export const INVALID_BORDER = '#fca5a5';
export const SEPARATOR = '#eef2f6';
export const DISABLED_BACKGROUND = '#f1f5f9';
/** Parcela com valor ajustado à mão. */
export const ADJUSTED_BORDER = '#67e8f9';

/**
 * Grade da linha no desktop (a partir de 1024px). As colunas encolhem até o
 * mínimo em telas menores que o modal cheio (1240px); abaixo de 1024px os campos
 * ficam empilhados em duas colunas.
 */
export const ENTRY_GRID_CLASS = 'lg:grid-cols-[minmax(110px,1fr)_minmax(100px,150px)_minmax(80px,100px)_minmax(96px,128px)_minmax(80px,84px)_minmax(80px,84px)_minmax(110px,121px)_minmax(76px,96px)_28px_28px]';
/** Lote e edição: com a coluna "Pagamento" depois da categoria. */
export const BATCH_GRID_CLASS = 'lg:grid-cols-[minmax(100px,1fr)_minmax(100px,150px)_minmax(96px,140px)_minmax(80px,100px)_minmax(96px,128px)_minmax(80px,84px)_minmax(80px,84px)_minmax(110px,121px)_minmax(76px,96px)_28px_28px]';

/** Anel de foco das caixas que têm um campo dentro (valor em R$). */
export const FOCUS_WITHIN_CLASS = 'focus-within:!border-[#0891b2] focus-within:shadow-[0_0_0_3px_rgba(8,145,178,0.12)]';

interface FieldStyleOptions {
  invalid?: boolean;
  disabled?: boolean;
  adjusted?: boolean;
  height?: number;
}

/** Caixa dos campos da grade: 28px, borda fina e cantos de 8px. */
export function fieldStyle({ invalid = false, disabled = false, adjusted = false, height = 28 }: FieldStyleOptions = {}): CSSProperties {
  return {
    width: '100%', minWidth: 0, height, padding: '0 8px', boxSizing: 'border-box',
    border: `1px solid ${invalid ? INVALID_BORDER : adjusted ? ADJUSTED_BORDER : C.borderInput}`,
    borderRadius: 8, background: disabled ? DISABLED_BACKGROUND : adjusted ? C.primarySoft : '#fff',
    fontSize: 12, color: C.text, outline: 'none', fontVariantNumeric: 'tabular-nums',
  };
}

/** Botão que abre um popover, no mesmo tamanho dos campos. */
export function selectStyle(options: FieldStyleOptions = {}): CSSProperties {
  return {
    ...fieldStyle(options),
    display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', textAlign: 'left',
  };
}

export const ellipsisStyle: CSSProperties = {
  flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

export const chevronStyle: CSSProperties = { fontSize: 8, color: C.textFaint };

/** Caixa de marcar (pago). */
export function checkboxStyle(checked: boolean): CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', width: 18, height: 18, padding: 0,
    border: `1.5px solid ${checked ? C.primary : '#cbd5e1'}`, borderRadius: 5,
    background: checked ? C.primary : '#fff', color: '#fff', fontSize: 11, lineHeight: 1, cursor: 'pointer',
  };
}

export const linkButtonStyle: CSSProperties = {
  border: 'none', background: 'transparent', padding: 0, color: C.primary, fontSize: 12, fontWeight: 500, cursor: 'pointer',
};
