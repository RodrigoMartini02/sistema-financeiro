// Leitura do nome das listas de uma conta PJ (setores, cargos), com as
// mensagens em português. Sem acesso ao banco.
import { RequestInputError } from '../utils/requestInput';

/** setores.nome e cargos.nome: varchar(100). */
export const MAX_ACCOUNT_CATALOG_NAME_LENGTH = 100;

/** Como a lista se chama nas mensagens ("setor", "cargo"). */
export interface AccountCatalogLabels {
  singular: string;
}

export function readAccountCatalogName(value: unknown, labels: AccountCatalogLabels): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) {
    throw new RequestInputError(`Informe o nome do ${labels.singular}`);
  }
  if (name.length > MAX_ACCOUNT_CATALOG_NAME_LENGTH) {
    throw new RequestInputError(`Nome do ${labels.singular}: até ${MAX_ACCOUNT_CATALOG_NAME_LENGTH} caracteres`);
  }
  return name;
}
