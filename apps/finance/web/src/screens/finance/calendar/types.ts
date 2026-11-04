import type { CalendarItemKind, CalendarItemStatus } from './calendarStatus';

export interface CalendarItem {
  kind: CalendarItemKind;
  id: number;
  title: string;
  date: string;       // YYYY-MM-DD
  time?: string | null;
  value?: number;
  status: CalendarItemStatus | null;
}
