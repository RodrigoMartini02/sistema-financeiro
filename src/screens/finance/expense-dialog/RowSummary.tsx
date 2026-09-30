import type { CSSProperties } from 'react';
import { C } from '../../../ui/dialogFormTokens';
import type { DraftSummary, StatusTone, SummaryStatus } from './draftRules';

const TONE_COLORS: Record<StatusTone, [background: string, text: string]> = {
  success: [C.successBg, C.success],
  warning: [C.warnBg, C.warn],
  danger: ['#fff7ed', '#b45309'],
  info: [C.primarySoft, C.primaryDark],
  neutral: ['#f1f5f9', C.chipOffText],
};

const STATUS_TONE: Record<SummaryStatus, StatusTone> = {
  Pago: 'success',
  Agendado: 'neutral',
  'Entra na fatura': 'info',
  'Com vencidas': 'danger',
  'Em andamento': 'info',
};

function pillStyle(tone: StatusTone): CSSProperties {
  const [background, color] = TONE_COLORS[tone];
  return {
    display: 'inline-flex', alignItems: 'center', height: 20, padding: '0 8px', borderRadius: 10,
    fontSize: 11, fontWeight: 500, background, color, whiteSpace: 'nowrap',
  };
}

interface RowSummaryProps {
  summary: DraftSummary | null;
  categorySuggestion: { name: string } | null;
  onAcceptCategory: () => void;
  lastAmount: string | null;
  duplicate: string | null;
  help: string;
  /** A linha de entrada tem o resumo mais perto dos campos. */
  compactTop: boolean;
}

/** Linha sob a despesa ativa: situação, vencimento, total, avisos, sugestão de categoria e ajuda. */
export function RowSummary({ summary, categorySuggestion, onAcceptCategory, lastAmount, duplicate, help, compactTop }: RowSummaryProps) {
  return (
    <div
      aria-live="polite"
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 12px', minHeight: 28,
        padding: compactTop ? '8px 8px 2px' : '0 8px 10px', fontSize: 12, color: C.textSoft,
      }}
    >
      {summary ? (
        <>
          <span style={pillStyle(STATUS_TONE[summary.status])}>{summary.status}</span>
          <span>{summary.dueText}</span>
          <span style={{ color: C.text, fontVariantNumeric: 'tabular-nums' }}>{summary.totalText}</span>
          {summary.badges.map((badge) => <span key={badge.text} style={pillStyle(badge.tone)}>{badge.text}</span>)}
        </>
      ) : (
        <span style={{ color: C.placeholder }}>Preencha descrição e valor para ver vencimento e total.</span>
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
