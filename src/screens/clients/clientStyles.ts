// Estilos da seção Clientes, sobre os tokens das Configurações (CFG, dentro de
// `.config-scope`) e dos modais (C). Um só desenho de botão: a pílula primária
// das Configurações e a pílula de contorno para as ações secundárias.
import type { CSSProperties } from 'react';
import { CFG, cfgBadgeStyle } from '../../ui/configTokens';
import { C, fieldInputStyle } from '../../ui/dialogFormTokens';
import { INVALID_BORDER } from '../finance/entry-dialog/fieldStyles';
import type { BadgeTone } from '../../utils/contractDisplay';

const TONE_COLORS: Record<BadgeTone, { background: string; color: string }> = {
  neutral: { background: CFG.chipBg, color: CFG.chipText },
  info: { background: CFG.primarySoft, color: CFG.primaryDark },
  success: { background: CFG.successBg, color: CFG.success },
  warn: { background: CFG.warnBg, color: CFG.warnText },
  danger: { background: CFG.dangerBg, color: CFG.danger },
};

export function toneBadgeStyle(tone: BadgeTone): CSSProperties {
  return { ...cfgBadgeStyle, ...TONE_COLORS[tone], whiteSpace: 'nowrap' };
}

/** Pílula de contorno das ações secundárias (Editar, Aditivo, Faturar...). */
export const secondaryButtonStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, height: 28, padding: '0 11px',
  borderRadius: 999, border: `1px solid ${CFG.border}`, background: CFG.surface,
  fontSize: 12, fontWeight: 600, color: CFG.textSoft, cursor: 'pointer', whiteSpace: 'nowrap',
};

/** Pílula de contorno vermelha (Excluir, Encerrar). */
export const dangerOutlineButtonStyle: CSSProperties = {
  ...secondaryButtonStyle, border: `1px solid ${CFG.dangerBorder}`, color: CFG.danger,
};

/** Botão de texto, sem moldura (Voltar, Ver contrato). */
export const linkButtonStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0, border: 'none', background: 'transparent',
  fontSize: 12, fontWeight: 600, color: CFG.primaryDark, cursor: 'pointer',
};

/** Título de bloco, em maiúsculas pequenas. */
export const sectionTitleStyle: CSSProperties = {
  margin: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: CFG.faint,
};

/** Cartão de bloco das páginas (cliente, contrato). */
export const panelStyle: CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', borderRadius: 14,
  border: `1px solid ${CFG.border}`, background: CFG.surface, boxShadow: CFG.shadowRow,
};

/** Linha "rótulo ... valor" dos blocos. */
export const detailRowStyle: CSSProperties = {
  display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '2px 12px',
  fontSize: 12.5, color: CFG.text,
};

export const detailLabelStyle: CSSProperties = { fontSize: 12, fontWeight: 500, color: CFG.muted };

export const mutedTextStyle: CSSProperties = { margin: 0, fontSize: 12, color: CFG.muted };

/** Abas da página (Contratos, Receitas, Dados) e da seção (Clientes, Catálogo). */
export function tabStyle(active: boolean): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px', borderRadius: 999,
    border: `1px solid ${active ? CFG.primary : CFG.border}`,
    background: active ? CFG.primarySoft : CFG.surface,
    color: active ? CFG.primaryDark : CFG.textSoft,
    fontSize: 12.5, fontWeight: active ? 700 : 600, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}

/** Linha de lista que quebra em duas no celular (nome em cima, detalhes embaixo). */
export const wrapRowStyle: CSSProperties = {
  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', width: '100%', minHeight: 44,
  padding: '8px 12px', borderRadius: 12, border: `1px solid ${CFG.border}`, background: CFG.surface,
  boxShadow: CFG.shadowRow, textAlign: 'left', cursor: 'pointer',
  transition: 'border-color .13s ease, background .13s ease',
};

export const rowTitleStyle: CSSProperties = {
  margin: 0, fontSize: 13, fontWeight: 600, color: CFG.text,
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

export const rowSubtitleStyle: CSSProperties = {
  margin: 0, fontSize: 11.5, color: CFG.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

/** Mensagem de erro do servidor dentro dos modais. */
export const errorBoxStyle: CSSProperties = {
  borderRadius: 10, border: `1px solid ${CFG.dangerBorder}`, background: CFG.dangerBg,
  padding: '8px 10px', fontSize: 11.5, color: CFG.danger,
};

/** Texto de erro embaixo do campo. */
export const fieldErrorStyle: CSSProperties = { margin: '4px 0 0', fontSize: 11, fontWeight: 500, color: '#b42318' };

/**
 * Campo dos modais, com a borda vermelha quando tem erro. Troca a borda
 * inteira: mexer só na cor sobre a borda completa confunde o React ao limpar o erro.
 */
export function inputStyle(invalid: boolean): CSSProperties {
  return { ...fieldInputStyle, border: `1px solid ${invalid ? INVALID_BORDER : C.borderInput}` };
}
