import { brasiliaDateTime } from '../collector/dates';

// Datas e horas da API do módulo: sempre em ISO 8601 com o fuso de Brasília
// (ex.: 2026-10-20T09:30:00-03:00). O Brasil não tem horário de verão desde
// 2019, e a base guarda no máximo 12 meses: o deslocamento é sempre -03:00.

const BRASILIA_OFFSET = '-03:00';

/**
 * Data e hora do banco (`timestamptz` lido como texto, ex.: 2026-10-20 09:30:00-03)
 * ou do PNCP sem fuso (ex.: 2026-10-20T09:30:00, já no horário de Brasília).
 */
export function toBrasiliaIso(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const text = value.trim().replace(' ', 'T');
  const hasOffset = /([+-]\d{2}(:?\d{2})?|Z)$/.test(text);
  if (!hasOffset) {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(text) ? `${text.slice(0, 19)}${BRASILIA_OFFSET}` : null;
  }
  const instant = new Date(text.replace(/([+-]\d{2})$/, '$1:00'));
  if (Number.isNaN(instant.getTime())) {
    return null;
  }
  return `${brasiliaDateTime(instant)}${BRASILIA_OFFSET}`;
}
