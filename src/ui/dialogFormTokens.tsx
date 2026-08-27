import type { CSSProperties } from 'react';

// ── Paleta e tokens visuais aprovados (origem: ExpenseDialog/IncomeDialog) ──
export const C = {
  border: '#e6eef3',
  borderInput: '#dbe6ec',
  cardBg: '#fbfdfe',
  panelBg: '#f2f9fb',
  panelBorder: '#dcebf1',
  primary: '#0891b2',
  primaryDark: '#0e7490',
  primarySoft: '#e6f7fa',
  primarySoftBorder: '#b9e6ef',
  text: '#0f2b38',
  textSoft: '#6c8593',
  textMuted: '#7b93a1',
  textFaint: '#8ba3b0',
  placeholder: '#9db0bb',
  chipOffBorder: '#e0e9ee',
  chipOffText: '#416275',
  danger: '#b42318',
  dangerBg: '#fef3f2',
  dangerBorder: '#fbd5d1',
  success: '#067647',
  successBg: '#ecfdf3',
  successBorder: '#b7e4c7',
  warn: '#8a6d1f',
  warnBg: '#fdf6e3',
  warnBorder: '#f0e0b0',
};

export const labelStyle: CSSProperties = {
  fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.09em', color: C.textFaint,
  textTransform: 'uppercase', height: 15, display: 'flex', alignItems: 'center', gap: 4,
};

export const fieldInputStyle: CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', height: 54, borderRadius: 12,
  border: `1.5px solid ${C.borderInput}`, background: '#fff', padding: '0 14px',
  fontSize: 17, fontWeight: 500, color: C.text, outline: 'none',
};

export const smallInputStyle: CSSProperties = {
  width: 168, height: 42, boxSizing: 'border-box', borderRadius: 10,
  border: `1.5px solid ${C.borderInput}`, background: '#fff', padding: '0 12px',
  fontSize: 14, color: C.text, outline: 'none',
};

export const numericInputStyle: CSSProperties = {
  width: 76, height: 42, boxSizing: 'border-box', borderRadius: 10,
  border: `1.5px solid ${C.borderInput}`, background: '#fff', padding: '0 12px',
  fontSize: 17, fontWeight: 700, color: C.text, textAlign: 'center',
  fontVariantNumeric: 'tabular-nums', outline: 'none',
};

export const cardStyle: CSSProperties = {
  margin: '0 var(--dialog-px) 10px', padding: '13px 14px 14px', borderRadius: 14,
  border: `1px solid ${C.border}`, background: C.cardBg,
};

export const panelStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10, background: C.panelBg,
  border: `1px solid ${C.panelBorder}`, borderRadius: 12, padding: '12px 14px', marginTop: 9,
};

export function chipStyle(active: boolean, opts?: { h?: number; r?: number; size?: number }): CSSProperties {
  const o = opts ?? {};
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer',
    height: o.h ?? 42, padding: '0 10px', borderRadius: o.r ?? 10, fontSize: o.size ?? 13,
    fontWeight: active ? 600 : 500, whiteSpace: 'nowrap',
    border: `1.5px solid ${active ? C.primary : C.chipOffBorder}`,
    background: active ? C.primary : '#fff',
    color: active ? '#fff' : C.chipOffText,
    boxShadow: active ? '0 2px 8px -2px rgba(8,145,178,0.5)' : 'none',
    transition: 'all .13s ease',
  };
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function digitsOnly(value: string): number {
  const digits = value.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

export function MoneyField({ value, onChange, autoFocus }: { value: number | undefined; onChange: (v: number) => void; autoFocus?: boolean }) {
  const cents = value ? Math.round(value * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 54, borderRadius: 12, border: `1.5px solid ${C.borderInput}`, background: '#fff', padding: '0 14px' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.textFaint }}>R$</span>
      <input
        type="text"
        inputMode="numeric"
        autoFocus={autoFocus}
        value={cents > 0 ? formatCents(cents) : ''}
        onChange={(e) => onChange(digitsOnly(e.target.value) / 100)}
        placeholder="0,00"
        style={{
          flex: 1, width: '100%', minWidth: 0, border: 'none', background: 'transparent',
          fontSize: 26, fontWeight: 700, color: C.text, letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums', outline: 'none',
        }}
      />
    </div>
  );
}

export function MoneyFieldSmall({ value, onChange, autoFocus, disabled }: { value: number | undefined; onChange: (v: number) => void; autoFocus?: boolean; disabled?: boolean }) {
  const cents = value ? Math.round(value * 100) : 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, height: 54, borderRadius: 12,
      border: `1.5px solid ${C.borderInput}`, background: disabled ? C.panelBg : '#fff', padding: '0 14px',
      opacity: disabled ? 0.6 : 1,
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.textFaint }}>R$</span>
      <input
        type="text"
        inputMode="numeric"
        autoFocus={autoFocus}
        disabled={disabled}
        value={cents > 0 ? formatCents(cents) : ''}
        onChange={(e) => onChange(digitsOnly(e.target.value) / 100)}
        placeholder="0,00"
        style={{
          flex: 1, width: '100%', minWidth: 0, border: 'none', background: 'transparent',
          fontSize: 26, fontWeight: 700, color: C.text, letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums', outline: 'none',
          cursor: disabled ? 'not-allowed' : 'text',
        }}
      />
    </div>
  );
}

// ── Tabela de valores (rótulo + valor + quantidade/parcelas + total calculado) ──
// Usada em blocos como Mensalidade/Implantação/Hora presencial/Hora remoto.

export const valuesTableCardStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 0, borderRadius: 14,
  border: `1px solid ${C.border}`, background: '#fff', overflow: 'hidden',
};

export const valuesTableHeaderStyle: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.1fr)',
  alignItems: 'center', gap: 16, padding: '9px 16px', background: C.panelBg, borderBottom: `1px solid ${C.border}`,
};

export const valuesTableColLabelStyle: CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', color: C.placeholder, textAlign: 'right',
};

export const valuesRowStyle: CSSProperties = {
  display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.1fr)',
  alignItems: 'center', gap: 16, padding: '10px 16px', borderBottom: `1px solid ${C.border}`,
};

export const valuesRowLastStyle: CSSProperties = { ...valuesRowStyle, borderBottom: 'none' };

export const valuesRowTitleStyle: CSSProperties = { fontSize: 13, fontWeight: 600, color: C.text };
export const valuesRowSubtitleStyle: CSSProperties = { fontSize: 10.5, color: C.placeholder };

export const valuesInlineFieldStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, height: 38, borderRadius: 9,
  border: `1.5px solid ${C.borderInput}`, background: '#fff', padding: '0 11px',
};

export const valuesInlineInputStyle: CSSProperties = {
  flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontSize: 13.5, fontWeight: 600,
  color: C.text, textAlign: 'right', fontVariantNumeric: 'tabular-nums', outline: 'none', padding: 0,
};

export const valuesComputedStyle: CSSProperties = {
  fontSize: 13.5, fontWeight: 700, color: C.textSoft, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
};

// ── Linha de chips em bloco (label + chips lado a lado, layout do mockup) ──

export const chipGroupLabelStyle: CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.textFaint,
};

export const chipRowStyle: CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap' };
