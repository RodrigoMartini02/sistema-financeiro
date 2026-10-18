import { CalendarClock } from 'lucide-react';
import type { ContractListItem } from '../types';
import { daysUntilExpiry, expiryLabel } from '../utils/contractFilters';
import { formatIsoDate } from '../utils/dates';
import { Pill, type PillTone } from './Pill';

// Selos do contrato: tipo (contrato, empenho...), categoria, "Prorrogado"
// (vencimento diferente do fim original) e "Vencido" (nos favoritos e com
// "Incluir encerrados"), e o tempo até o vencimento.

/** Vermelho até 30 dias, âmbar até 90, cinza depois disso e apagado quando já venceu. */
function expiryTone(days: number): PillTone {
  if (days < 0) return 'muted';
  if (days <= 30) return 'danger';
  if (days <= 90) return 'warning';
  return 'neutral';
}

/** "Vence em 45 dias", com a cor da proximidade do vencimento; sem vencimento, "Sem data de fim". */
export function ExpiryBadge({ expiresOn, todayIso }: { expiresOn: string | null; todayIso: string }) {
  const icon = <CalendarClock size={11} aria-hidden="true" />;
  if (expiresOn === null) {
    return (
      <Pill tone="muted" title="O contrato não informa a data de fim da vigência." icon={icon}>
        {expiryLabel(null, todayIso)}
      </Pill>
    );
  }
  const days = daysUntilExpiry(expiresOn, todayIso);
  return (
    <Pill tone={expiryTone(days)} title={`Vencimento: ${formatIsoDate(expiresOn)}`} icon={icon}>
      {expiryLabel(expiresOn, todayIso)}
    </Pill>
  );
}

type BadgeSource = Pick<ContractListItem, 'categoryName' | 'contractTypeName' | 'isExtended' | 'expiresOn'>;

export function ContractBadges({ contract, todayIso }: { contract: BadgeSource; todayIso: string }) {
  const expired = contract.expiresOn !== null && daysUntilExpiry(contract.expiresOn, todayIso) < 0;
  return (
    <>
      {contract.contractTypeName && <Pill>{contract.contractTypeName}</Pill>}
      {contract.categoryName && <Pill>{contract.categoryName}</Pill>}
      {contract.isExtended && (
        <Pill tone="brand" title="O vencimento mudou por um aditivo de prazo ou por uma rescisão.">
          Prorrogado
        </Pill>
      )}
      {expired && <Pill tone="muted">Vencido</Pill>}
    </>
  );
}
