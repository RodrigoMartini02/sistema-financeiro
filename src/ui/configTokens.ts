import type { CSSProperties } from 'react';

/**
 * Tokens visuais da tela de Configurações.
 *
 * São referências a CSS custom properties declaradas em `.config-scope`
 * (src/styles/globals.css), e não valores literais, por dois motivos:
 *
 * 1. Modo escuro funciona via CSS (`.dark .config-scope`), sem duplicar
 *    objetos de token nem depender do estado de tema em JS.
 * 2. O escopo fica restrito: fora de `.config-scope` as variáveis não
 *    existem, então os componentes compartilhados (Dialog, EmptyState)
 *    continuam neutros quando usados noutras telas.
 *
 * A cor primária coincide com `C.primary`/`C.primaryDark` de
 * dialogFormTokens.tsx e com `brand-600`/`brand-700` do Tailwind.
 */
export const CFG = {
  text: 'var(--cfg-text)',
  textSoft: 'var(--cfg-text-soft)',
  muted: 'var(--cfg-muted)',
  faint: 'var(--cfg-faint)',

  surface: 'var(--cfg-surface)',
  surfaceAlt: 'var(--cfg-surface-alt)',
  surfaceSunken: 'var(--cfg-surface-sunken)',

  border: 'var(--cfg-border)',
  borderSoft: 'var(--cfg-border-soft)',
  borderInput: 'var(--cfg-border-input)',

  primary: 'var(--cfg-primary)',
  primaryDark: 'var(--cfg-primary-dark)',
  primarySoft: 'var(--cfg-primary-soft)',

  chipBg: 'var(--cfg-chip-bg)',
  chipText: 'var(--cfg-chip-text)',

  warnBg: 'var(--cfg-warn-bg)',
  warnBorder: 'var(--cfg-warn-border)',
  warnText: 'var(--cfg-warn-text)',

  danger: 'var(--cfg-danger)',
  dangerBorder: 'var(--cfg-danger-border)',
  dangerBg: 'var(--cfg-danger-bg)',

  success: 'var(--cfg-success)',
  successBg: 'var(--cfg-success-bg)',

  shadowRow: 'var(--cfg-shadow-row)',
} as const;

/** Classe aplicada ao container raiz de Configurações. */
export const CONFIG_SCOPE_CLASS = 'config-scope';

/** Classe utilitária para números/identificadores em JetBrains Mono. */
export const CFG_MONO_CLASS = 'cfg-mono';

/* ── Estilos compartilhados entre as telas de Configurações ─────────────── */

/** Linha de lista compacta (38–40px), modelo "cards separados". */
export const cfgRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  minHeight: 40,
  padding: '0 12px',
  borderRadius: 12,
  border: `1px solid ${CFG.border}`,
  background: CFG.surface,
  boxShadow: CFG.shadowRow,
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'border-color .13s ease, box-shadow .13s ease, background .13s ease',
};

/** Índice numérico da linha (01, 02, ...). */
export const cfgRowIndexStyle: CSSProperties = {
  flex: 'none',
  width: 20,
  fontSize: 10.5,
  fontWeight: 500,
  color: CFG.faint,
};

/** Badge neutro (ex.: "Padrão", "3 sub"). */
export const cfgBadgeStyle: CSSProperties = {
  flex: 'none',
  borderRadius: 7,
  padding: '3px 5px',
  fontSize: 10,
  fontWeight: 600,
  lineHeight: 1,
  background: CFG.chipBg,
  color: CFG.chipText,
};

/** Cabeçalho de grupo da navegação lateral. */
export const cfgNavGroupLabelStyle: CSSProperties = {
  padding: '10px 8px 4px',
  fontSize: 9.5,
  fontWeight: 700,
  lineHeight: 1,
  letterSpacing: '0.09em',
  textTransform: 'uppercase',
  color: CFG.faint,
};

/** Botão primário em pill (ação principal da tela). */
export const cfgPrimaryButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  height: 30,
  padding: '0 13px',
  border: 'none',
  borderRadius: 999,
  background: CFG.primary,
  color: '#fff',
  fontSize: 12.5,
  fontWeight: 600,
  lineHeight: 1,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

/** Botão quadrado de ação secundária, alinhado à altura do campo (32px). */
export const cfgIconButtonStyle: CSSProperties = {
  display: 'flex',
  flexShrink: 0,
  alignItems: 'center',
  justifyContent: 'center',
  height: 32,
  width: 32,
  borderRadius: 10,
  border: `1px solid ${CFG.borderInput}`,
  background: 'transparent',
  color: CFG.muted,
  cursor: 'pointer',
};

/** Rótulo de campo de formulário. */
export const cfgLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  marginBottom: 5,
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1,
  color: CFG.muted,
};

/** Campo de entrada. */
export const cfgInputStyle: CSSProperties = {
  width: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  height: 32,
  padding: '0 9px',
  borderRadius: 10,
  border: `1px solid ${CFG.borderInput}`,
  background: CFG.surface,
  fontSize: 13,
  fontWeight: 500,
  color: CFG.text,
  outline: 'none',
};
