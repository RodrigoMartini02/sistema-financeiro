// Contas novas de Licitações: a empresa que se cadastra (titular, com o teste de 15 dias) e o admin da plataforma
// (criado pelo terminal, com cortesia). Os dois nascem iguais: um usuário, a conta da empresa como padrão e o
// módulo habilitado, tudo ou nada numa transação.
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { accounts, users } from '../db/identity';
import { isUniqueViolation } from '../utils/dbErrors';
import { RequestInputError } from '../utils/requestInput';
import { companyAccountColumns, type CompanyAccountInput } from './companyAccountInput';
import { findOwnLoginWithDocument } from './documentConflicts';
import { startTenderTrial } from './subscription';
import { setAccountCourtesy } from './team';

const PASSWORD_HASH_ROUNDS = 10;
const EMAIL_IN_USE = 'Este e-mail já está cadastrado';
const DOCUMENT_IN_USE = 'Este CNPJ já está cadastrado';
const EMAIL_OR_DOCUMENT_IN_USE = 'Este e-mail ou CNPJ já está cadastrado';

export interface CompanyOwnerInput {
  email: string;
  password: string;
  company: CompanyAccountInput;
}

type OwnerUser = Pick<typeof users.$inferSelect, 'id' | 'name' | 'lastName' | 'email' | 'document' | 'type' | 'status'>;

export interface CreatedCompanyOwner {
  user: OwnerUser;
  accountId: number;
}

interface NewCompanyOwner extends CompanyOwnerInput {
  type: 'titular' | 'admin';
  /** Como o módulo começa na conta: teste de 15 dias ou cortesia. */
  moduleAccess: 'trial' | 'courtesy';
}

async function createCompanyOwner(db: TendersDb, input: NewCompanyOwner, now: Date): Promise<CreatedCompanyOwner> {
  const email = input.email.toLowerCase();

  const [emailInUse] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (emailInUse) {
    throw new RequestInputError(EMAIL_IN_USE);
  }
  // Só outro acesso próprio impede: um login de colaborador com o mesmo documento é outro login, criado por um titular.
  if (await findOwnLoginWithDocument(db, input.company.document)) {
    throw new RequestInputError(DOCUMENT_IN_USE);
  }

  const passwordHash = await bcrypt.hash(input.password, PASSWORD_HASH_ROUNDS);

  try {
    return await db.transaction(async (transaction) => {
      // O login da empresa é a própria empresa: leva o nome dela e nenhum dado de pessoa.
      const [user] = await transaction
        .insert(users)
        .values({
          name: input.company.displayName,
          email,
          document: input.company.document,
          password: passwordHash,
          type: input.type,
          status: 'ativo',
        })
        .returning({
          id: users.id,
          name: users.name,
          lastName: users.lastName,
          email: users.email,
          document: users.document,
          type: users.type,
          status: users.status,
        });
      if (!user) {
        throw new Error('Insert of the company owner returned no row');
      }

      const [account] = await transaction
        .insert(accounts)
        .values({ userId: user.id, ...companyAccountColumns(input.company), active: true, isDefault: true })
        .returning({ id: accounts.id });
      if (!account) {
        throw new Error('Insert of the company account returned no row');
      }

      if (input.moduleAccess === 'trial') {
        await startTenderTrial(transaction, account.id, user.id, now);
      } else {
        await setAccountCourtesy(transaction, user.id, account.id, true, now);
      }

      return { user, accountId: account.id };
    });
  } catch (error) {
    // Dois cadastros iguais ao mesmo tempo passam pelas conferências acima; o índice único barra o segundo.
    if (isUniqueViolation(error)) {
      throw new RequestInputError(EMAIL_OR_DOCUMENT_IN_USE);
    }
    throw error;
  }
}

/** Cadastro pelo site: titular da empresa, com o teste de 15 dias do módulo. O tipo nunca vem do pedido. */
export function registerCompany(db: TendersDb, input: CompanyOwnerInput, now: Date): Promise<CreatedCompanyOwner> {
  return createCompanyOwner(db, { ...input, type: 'titular', moduleAccess: 'trial' }, now);
}

/** Admin da plataforma (primeiro acesso, pelo terminal): a empresa dele entra com cortesia, sem prazo. */
export function createAdminAccount(db: TendersDb, input: CompanyOwnerInput, now: Date): Promise<CreatedCompanyOwner> {
  return createCompanyOwner(db, { ...input, type: 'admin', moduleAccess: 'courtesy' }, now);
}
