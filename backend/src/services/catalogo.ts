const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids do catálogo (produto, imagem, código da vitrine) são UUID; fora disso, nem consulta o banco. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
