import { SITUATION_PUBLISHED_ID, type NoticeListItem } from '../types';
import { Pill } from './Pill';

type BadgeSource = Pick<NoticeListItem, 'modalityName' | 'isPriceRegistration' | 'situationId' | 'situationName'>;

/** Modalidade, SRP e situação; a situação só quando não é "Divulgada no PNCP". */
export function NoticeBadges({ notice }: { notice: BadgeSource }) {
  const showSituation = notice.situationName && notice.situationId !== SITUATION_PUBLISHED_ID;
  return (
    <>
      {notice.modalityName && <Pill>{notice.modalityName}</Pill>}
      {notice.isPriceRegistration && (
        <Pill tone="brand" title="Sistema de Registro de Preços">
          SRP
        </Pill>
      )}
      {showSituation && <Pill tone="warning">{notice.situationName}</Pill>}
    </>
  );
}
