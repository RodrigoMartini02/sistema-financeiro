// Leitura do cadastro da empresa (POST /api/tenders/auth/register): razão social, nome fantasia, CNPJ e data de
// abertura. Sem acesso ao banco: a unicidade do CNPJ e do e-mail é conferida na rota. Cópia enxuta do
// `services/companyAccountInput.ts` de Finanças (os dois backends são independentes), sem o enquadramento: em
// Licitações porte e tipo jurídico são campos separados do perfil da empresa, preenchidos pela consulta do CNPJ. Um
// `enquadramento` que um site antigo ainda mande é ignorado.
import type { accounts } from '../db/identity';
import { isValidCnpj } from '../middleware/validation';
import { RequestInputError, readOptionalIsoDate, readOptionalText, readRecord } from '../utils/requestInput';

/** razao_social e nome_fantasia: varchar(150). */
const MAX_COMPANY_NAME_LENGTH = 150;
/** contas.nome: varchar(100). */
const MAX_ACCOUNT_NAME_LENGTH = 100;

export interface CompanyAccountInput {
  legalName: string;
  tradeName: string | null;
  /** CNPJ só com os dígitos. */
  document: string;
  openingDate: string | null;
  /** Nome da conta: nome fantasia ou, sem ele, razão social. */
  displayName: string;
}

type CompanyAccountColumns = Pick<
  typeof accounts.$inferInsert,
  'name' | 'document' | 'legalName' | 'tradeName' | 'openingDate'
>;

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function readLegalName(value: unknown): string {
  const legalName = typeof value === 'string' ? value.trim() : '';
  if (!legalName) {
    throw new RequestInputError('Informe a razão social');
  }
  if (legalName.length > MAX_COMPANY_NAME_LENGTH) {
    throw new RequestInputError(`Razão social: até ${MAX_COMPANY_NAME_LENGTH} caracteres`);
  }
  return legalName;
}

function readCnpj(value: unknown): string {
  if (isBlank(value)) {
    throw new RequestInputError('Informe o CNPJ');
  }
  if (typeof value !== 'string' || !isValidCnpj(value)) {
    throw new RequestInputError('CNPJ inválido');
  }
  return value.replace(/\D/g, '');
}

/** Corpo do cadastro da empresa (POST /auth/register). */
export function readCompanyAccountInput(body: unknown): CompanyAccountInput {
  const record = readRecord(body, 'Pedido inválido');
  const legalName = readLegalName(record['razao_social']);
  const tradeName = readOptionalText(record['nome_fantasia'], 'Nome fantasia', MAX_COMPANY_NAME_LENGTH);
  const openingDate = record['data_abertura'];
  return {
    legalName,
    tradeName,
    document: readCnpj(record['documento']),
    openingDate: readOptionalIsoDate(openingDate === '' ? null : openingDate, 'Data de abertura inválida'),
    // contas.nome guarda até 100 caracteres; os nomes completos ficam em razao_social e nome_fantasia.
    displayName: (tradeName ?? legalName).slice(0, MAX_ACCOUNT_NAME_LENGTH),
  };
}

/** Colunas de `contas` com o bloco da empresa. */
export function companyAccountColumns(input: CompanyAccountInput): CompanyAccountColumns {
  return {
    name: input.displayName,
    document: input.document,
    legalName: input.legalName,
    tradeName: input.tradeName,
    openingDate: input.openingDate,
  };
}
