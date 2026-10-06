import { Clock } from 'lucide-react';
import { useNow } from '../hooks/useNow';
import { countdownFor, type CountdownTone } from '../utils/countdown';
import { formatIsoDateTime } from '../utils/dates';
import { Pill, type PillTone } from './Pill';

const TONE_TO_PILL: Record<CountdownTone, PillTone> = {
  normal: 'neutral',
  warning: 'warning',
  danger: 'danger',
  closed: 'muted',
  none: 'muted',
};

/** Contagem regressiva do prazo de proposta (âmbar < 7 dias, vermelho < 2). */
export function CountdownBadge({ closesAt }: { closesAt: string | null }) {
  const now = useNow();
  const countdown = countdownFor(closesAt, now);
  const title = closesAt ? `Encerramento: ${formatIsoDateTime(closesAt)}` : undefined;
  return (
    <Pill tone={TONE_TO_PILL[countdown.tone]} title={title} icon={<Clock size={11} aria-hidden="true" />}>
      {countdown.label}
    </Pill>
  );
}
