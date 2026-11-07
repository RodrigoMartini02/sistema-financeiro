const UNIQUE_VIOLATION = '23505';

/** Violação de índice único do Postgres, com ou sem o invólucro do Drizzle. */
export function isUniqueViolation(error: unknown): boolean {
  const hasCode = (value: unknown) =>
    typeof value === 'object' && value !== null && (value as { code?: unknown }).code === UNIQUE_VIOLATION;
  return hasCode(error) || (typeof error === 'object' && error !== null && hasCode((error as { cause?: unknown }).cause));
}
