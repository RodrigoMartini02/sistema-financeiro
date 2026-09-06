import { useState, type ChangeEvent, type CSSProperties } from 'react';

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
  fontSize: 11, fontWeight: 600, color: C.textMuted,
  display: 'flex', alignItems: 'center', gap: 4, marginBottom: 5,
};

export const fieldInputStyle: CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', height: 32, borderRadius: 10,
  border: `1px solid ${C.borderInput}`, background: '#fff', padding: '0 9px',
  fontSize: 13, fontWeight: 500, color: C.text, outline: 'none',
};

export const smallInputStyle: CSSProperties = {
  width: 168, height: 32, boxSizing: 'border-box', borderRadius: 10,
  border: `1px solid ${C.borderInput}`, background: '#fff', padding: '0 9px',
  fontSize: 13, color: C.text, outline: 'none',
};

export const numericInputStyle: CSSProperties = {
  width: 72, height: 32, boxSizing: 'border-box', borderRadius: 10,
  border: `1px solid ${C.borderInput}`, background: '#fff', padding: '0 9px',
  fontSize: 13, fontWeight: 600, color: C.text, textAlign: 'center',
  fontVariantNumeric: 'tabular-nums', outline: 'none',
};

export const cardStyle: CSSProperties = {
  margin: '0 var(--dialog-px) 8px', padding: '11px 12px 12px', borderRadius: 12,
  border: `1px solid ${C.border}`, background: '#fff',
};

/**
 * Botão primário do rodapé dos modais (pill).
 * Antes este bloco era repetido inline em 23 pontos do app.
 */
export const saveButtonStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  height: 30, padding: '0 16px', border: 'none', borderRadius: 999,
  background: C.primary, color: '#fff', fontSize: 12.5, fontWeight: 600, lineHeight: 1,
  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background .13s ease',
};

export const saveButtonDisabledStyle: CSSProperties = {
  ...saveButtonStyle,
  background: '#e6edf1', color: '#a3b6c0', cursor: 'not-allowed',
};

/** Ação destrutiva do rodapé (outline, não vermelho sólido). */
export const dangerButtonStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  height: 30, padding: '0 14px', borderRadius: 999,
  border: `1px solid ${C.dangerBorder}`, background: '#fff',
  color: C.danger, fontSize: 12.5, fontWeight: 600, lineHeight: 1,
  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background .13s ease',
};

/** Rodapé padrão dos modais. */
export const dialogFooterStyle: CSSProperties = {
  flex: 'none', display: 'flex', alignItems: 'center', gap: 10,
  borderTop: '1px solid #eef3f6', background: '#fcfdfe',
  padding: '12px var(--dialog-px)',
};

export const panelStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10, background: C.panelBg,
  border: `1px solid ${C.panelBorder}`, borderRadius: 12, padding: '12px 14px', marginTop: 9,
};

export function chipStyle(active: boolean, opts?: { h?: number; r?: number; size?: number }): CSSProperties {
  const o = opts ?? {};
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer',
    height: o.h ?? 32, padding: '0 10px', borderRadius: o.r ?? 10, fontSize: o.size ?? 12.5,
    fontWeight: active ? 600 : 500, whiteSpace: 'nowrap',
    border: `1px solid ${active ? C.primary : C.chipOffBorder}`,
    background: active ? C.primary : '#fff',
    color: active ? '#fff' : C.chipOffText,
    transition: 'all .13s ease',
  };
}

// Moldura na mesma altura dos demais campos (32px), para não desalinhar a linha.
// A hierarquia do valor — que é o dado principal do lançamento — vem da fonte
// maior que a dos outros campos (15 vs 13), não de uma altura diferente.
// "R$" é um prefixo textual absoluto dentro do próprio input (sem container
// extra), para não duplicar a borda do campo.
const moneyInputStyle: CSSProperties = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', height: 32, borderRadius: 10,
  border: `1px solid ${C.borderInput}`, background: '#fff', padding: '0 9px 0 28px',
  fontSize: 15, fontWeight: 600, color: C.text, letterSpacing: '-0.01em',
  fontVariantNumeric: 'tabular-nums', outline: 'none',
};

const moneyPrefixStyle: CSSProperties = {
  position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
  fontSize: 11.5, fontWeight: 600, color: C.textFaint, pointerEvents: 'none',
};

/**
 * Formata para exibição: 1234.5 → "1.234,50". Usado ao sair do campo e para
 * mostrar um valor que veio de fora (edição de um lançamento salvo).
 */
export function formatMoney(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Lê o que o usuário digitou. Aceita vírgula ou ponto como separador decimal e
 * ignora o separador de milhar, para que texto colado de outro lugar também
 * funcione. Retorna null quando não há número — o campo vazio precisa continuar
 * vazio em vez de virar zero.
 */
export function parseMoney(texto: string): number | null {
  const limpo = texto.replace(/[^\d.,]/g, '');
  if (!limpo) return null;
  // O último separador é o decimal; os anteriores são de milhar.
  const ultimoSep = Math.max(limpo.lastIndexOf(','), limpo.lastIndexOf('.'));
  const inteiros = (ultimoSep >= 0 ? limpo.slice(0, ultimoSep) : limpo).replace(/[.,]/g, '');
  const decimais = ultimoSep >= 0 ? limpo.slice(ultimoSep + 1).replace(/[.,]/g, '') : '';
  const numero = Number(`${inteiros || '0'}.${decimais.slice(0, 2) || '0'}`);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Campo de valor com digitação natural: "21" é vinte e um, não vinte e um
 * centavos. Antes cada dígito era tratado como centavo e empurrava o número da
 * direita para a esquerda, o que obrigava a digitar "2100" para obter 21,00.
 *
 * O texto digitado vive em estado próprio e só é reformatado ao sair do campo.
 * Reformatar a cada tecla jogava o cursor para o fim e impedia corrigir um
 * dígito no meio do número.
 */
function useMoneyInput(value: number | undefined, onChange: (v: number) => void) {
  const [texto, setTexto] = useState<string | null>(null);
  const emEdicao = texto !== null;

  // Enquanto o usuário digita, o que ele escreveu manda. Fora disso, mostra o
  // valor vindo de fora — inclusive quando outro campo o altera.
  const exibido = emEdicao ? texto : value != null && value > 0 ? formatMoney(value) : '';

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const bruto = e.target.value;
    setTexto(bruto);
    const numero = parseMoney(bruto);
    onChange(numero ?? 0);
  };

  const handleBlur = () => {
    const numero = parseMoney(texto ?? '');
    setTexto(null); // volta a espelhar o valor, já formatado
    if (numero != null) onChange(numero);
  };

  return { exibido, handleChange, handleBlur };
}

export function MoneyField({ value, onChange, autoFocus }: { value: number | undefined; onChange: (v: number) => void; autoFocus?: boolean }) {
  const { exibido, handleChange, handleBlur } = useMoneyInput(value, onChange);
  return (
    <div style={{ position: 'relative' }}>
      <span style={moneyPrefixStyle}>R$</span>
      <input
        type="text"
        inputMode="decimal"
        autoFocus={autoFocus}
        value={exibido}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="0,00"
        style={moneyInputStyle}
      />
    </div>
  );
}

export function MoneyFieldSmall({ value, onChange, autoFocus, disabled }: { value: number | undefined; onChange: (v: number) => void; autoFocus?: boolean; disabled?: boolean }) {
  const { exibido, handleChange, handleBlur } = useMoneyInput(value, onChange);
  return (
    <div style={{ position: 'relative' }}>
      <span style={moneyPrefixStyle}>R$</span>
      <input
        type="text"
        inputMode="decimal"
        autoFocus={autoFocus}
        disabled={disabled}
        value={exibido}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="0,00"
        style={{ ...moneyInputStyle, background: disabled ? C.panelBg : '#fff', opacity: disabled ? 0.6 : 1, cursor: disabled ? 'not-allowed' : 'text' }}
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

// Colunas: Descrição | Und | Qtde | Valor unitário | Calculado | remover
const VALUES_GRID_COLUMNS = 'minmax(0, 1.4fr) minmax(0, 0.6fr) minmax(0, 0.8fr) minmax(0, 1fr) minmax(0, 1.1fr) 22px';

export const valuesTableHeaderStyle: CSSProperties = {
  display: 'grid', gridTemplateColumns: VALUES_GRID_COLUMNS,
  alignItems: 'center', gap: 12, padding: '9px 16px', background: C.panelBg, borderBottom: `1px solid ${C.border}`,
};

export const valuesTableColLabelStyle: CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', color: C.placeholder, textAlign: 'right',
};

export const valuesRowStyle: CSSProperties = {
  display: 'grid', gridTemplateColumns: VALUES_GRID_COLUMNS,
  alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: `1px solid ${C.border}`,
};

export const valuesRowLastStyle: CSSProperties = { ...valuesRowStyle, borderBottom: 'none' };

export const valuesRowTitleStyle: CSSProperties = { fontSize: 13, fontWeight: 600, color: C.text };
export const valuesRowSubtitleStyle: CSSProperties = { fontSize: 10.5, color: C.placeholder };

export const valuesInlineFieldStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, height: 32, borderRadius: 9,
  border: `1px solid ${C.borderInput}`, background: '#fff', padding: '0 9px',
};

export const valuesInlineInputStyle: CSSProperties = {
  flex: 1, minWidth: 0, border: 'none', background: 'transparent', fontSize: 13.5, fontWeight: 600,
  color: C.text, textAlign: 'right', fontVariantNumeric: 'tabular-nums', outline: 'none', padding: 0,
};

// "R$" como prefixo textual absoluto dentro do próprio input, sem container
// extra — usado nas linhas de valor da tabela (Mensalidade/Implantação/Horas).
const valuesInlineMoneyInputStyle: CSSProperties = {
  ...valuesInlineFieldStyle, width: '100%', boxSizing: 'border-box', padding: '0 9px 0 26px',
  fontSize: 13.5, fontWeight: 600, color: C.text, textAlign: 'right', fontVariantNumeric: 'tabular-nums', outline: 'none',
};

const valuesInlineMoneyPrefixStyle: CSSProperties = {
  position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
  fontSize: 11, fontWeight: 700, color: C.placeholder, pointerEvents: 'none',
};

export function MoneyInlineField({ editValue, displayValue, editing, onChange, placeholder = '0,00' }: {
  editValue: string; displayValue: string; editing: boolean; onChange?: (v: string) => void; placeholder?: string;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <span style={valuesInlineMoneyPrefixStyle}>R$</span>
      {editing ? (
        <input type="number" min="0" step="0.01" value={editValue} onChange={(e) => onChange?.(e.target.value)} placeholder={placeholder} style={valuesInlineMoneyInputStyle} />
      ) : (
        <span style={{ ...valuesInlineMoneyInputStyle, display: 'block', border: 'none', background: 'transparent' }}>{displayValue || '—'}</span>
      )}
    </div>
  );
}

export const valuesComputedStyle: CSSProperties = {
  fontSize: 13.5, fontWeight: 700, color: C.textSoft, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
};

export const valuesRemoveButtonStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 999,
  border: 'none', background: 'transparent', color: C.placeholder, cursor: 'pointer', fontSize: 15, lineHeight: 1,
};

export const valuesAddRowButtonStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 12px', borderRadius: 9,
  border: `1.5px dashed ${C.chipOffBorder}`, background: 'transparent', color: C.textMuted,
  fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
};

// ── Linha de chips em bloco (label + chips lado a lado, layout do mockup) ──

export const chipGroupLabelStyle: CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.textFaint,
};

