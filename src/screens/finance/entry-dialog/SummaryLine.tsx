import type { CSSProperties } from 'react';
import { C } from '../../../ui/dialogFormTokens';
import { isoToShortBrDate } from '../../../utils/date';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export interface SummaryBadge {
  text: string;
  tone: StatusTone;
}

/** Situação, datas e total do lançamento, mais os avisos em pílulas. */
export interface SummaryContent {
  status: { text: string; tone: StatusTone };
  detail: string;
  total: string;
  badges: SummaryBadge[];
}

const TONE_COLORS: Record<StatusTone, [background: string, text: string]> = {
  success: [C.successBg, C.success],
  warning: [C.warnBg, C.warn],
  danger: ['#fff7ed', '#b45309'],
  info: [C.primarySoft, C.primaryDark],
  neutral: ['#f1f5f9', C.chipOffText],
};

function pillStyle(tone: StatusTone): CSSProperties {
  const [background, color] = TONE_COLORS[tone];
  return {
    display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 10,
    fontSize: 11, fontWeight: 500, background, color, whiteSpace: 'nowrap',
  };
}

interface SummaryLineProps {
  content: SummaryContent | null;
  /** Texto enquanto faltam os dados para o resumo. */
  placeholder: string;
  categorySuggestion: { name: string } | null;
  onAcceptCategory: () => void;
  lastAmount: string | null;
  duplicate: string | null;
  help: string;
  /** A linha de entrada tem o resumo mais perto dos campos. */
  compactTop: boolean;
}

/** Aviso de lançamento igual cadastrado nos últimos 7 dias (a data vem do servidor). */
export function duplicateText(createdAtIso: string): string {
  return `Você já lançou isso em ${isoToShortBrDate(createdAtIso)} — é outra?`;
}

/** Linha sob o lançamento ativo: situação, datas, total, avisos, sugestão de categoria e ajuda. */
export function SummaryLine({
  content, placeholder, categorySuggestion, onAcceptCategory, lastAmount, duplicate, help, compactTop,
}: SummaryLineProps) {
  return (
    <div
      aria-live="polite"
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px', minHeight: 28,
        padding: compactTop ? '8px 8px 2px' : '0 8px 10px', fontSize: 12, color: C.textSoft,
      }}
    >
      {content ? (
        <>
          <span style={pillStyle(content.status.tone)}>{content.status.text}</span>
          <span>{content.detail}</span>
          <span style={{ color: C.text, fontVariantNumeric: 'tabular-nums' }}>{content.total}</span>
          {content.badges.map((badge) => <span key={badge.text} style={pillStyle(badge.tone)}>{badge.text}</span>)}
        </>
      ) : (
        <span style={{ color: C.placeholder }}>{placeholder}</span>
      )}
      {categorySuggestion && (
        <button
          type="button"
          onClick={onAcceptCategory}
          style={{ border: 'none', background: 'transparent', padding: 0, fontSize: 12, color: C.primary, cursor: 'pointer' }}
        >
          Sugerida: <b style={{ fontWeight: 600 }}>{categorySuggestion.name}</b> · Tab aceita
        </button>
      )}
      {duplicate ? <span style={{ color: C.warn }}>{duplicate}</span> : lastAmount && <span>{lastAmount}</span>}
      <span className="hidden lg:inline" style={{ marginLeft: 'auto', flex: 'none', whiteSpace: 'nowrap', color: C.textFaint }}>{help}</span>
    </div>
  );
}
