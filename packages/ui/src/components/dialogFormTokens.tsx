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

/** Ação positiva em pill outline (mesmo padrão de dangerButtonStyle, em verde). */
export const successOutlineButtonStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  height: 30, padding: '0 14px', borderRadius: 999,
  border: `1px solid ${C.successBorder}`, background: '#fff',
  color: C.success, fontSize: 12.5, fontWeight: 600, lineHeight: 1,
  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background .13s ease',
};

/** Pill outline neutra para toggles (Lista/Calendário, Lançamentos/Planejamento). */
export const neutralOutlineButtonStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  height: 30, padding: '0 14px', borderRadius: 999,
  border: `1px solid ${C.primary}`, background: C.primarySoft,
  color: C.primaryDark, fontSize: 12.5, fontWeight: 600, lineHeight: 1,
  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background .13s ease',
};

export const neutralOutlineButtonOffStyle: CSSProperties = {
  ...neutralOutlineButtonStyle,
  border: `1px solid ${C.chipOffBorder}`, background: '#fff', color: C.chipOffText,
  fontWeight: 500,
};

/** Rodapé padrão dos modais. */
export const dialogFooterStyle: CSSProperties = {
  flex: 'none', display: 'flex', alignItems: 'center', gap: 10,
  borderTop: '1px solid #eef3f6', background: '#fcfdfe',
  padding: '12px var(--dialog-px)',
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
export function useMoneyInput(value: number | undefined, onChange: (v: number) => void) {
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

// ── Linha de chips em bloco (label + chips lado a lado, layout do mockup) ──

export const chipGroupLabelStyle: CSSProperties = {
  fontSize: 10.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: C.textFaint,
};

