import { eq } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { users } from '../db/identity';
import { RequestInputError } from '../utils/requestInput';
import type { ProfileUpdateInput } from './memberInput';

// Perfil do titular da conta (item 1A): nome, sobrenome, telefone e foto. E-mail, CPF e senha dele seguem pelos
// fluxos de acesso (login e recuperação de senha). O colaborador não tem tela de perfil nesta entrega.

/** O perfil como a API devolve: a chave da foto vira o link assinado (`photoUrl`) na rota. */
export interface ProfileView {
  userId: number;
  name: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  photoUrl: string | null;
}

export interface ProfileRecord extends Omit<ProfileView, 'photoUrl'> {
  photoKey: string | null;
}

export function toProfileView({ photoKey: _photoKey, ...record }: ProfileRecord, photoUrl: string | null): ProfileView {
  return { ...record, photoUrl };
}

export async function readProfile(db: TendersDb, userId: number): Promise<ProfileRecord> {
  const [profile] = await db
    .select({
      userId: users.id,
      name: users.name,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
      photoKey: users.photoKey,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!profile) {
    throw new RequestInputError('Usuário não encontrado', 404);
  }
  return profile;
}

/** Campo ausente mantém o valor gravado; sobrenome e telefone vazios limpam. */
export async function updateProfile(db: TendersDb, userId: number, input: ProfileUpdateInput): Promise<ProfileRecord> {
  const changes = {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.lastName === undefined ? {} : { lastName: input.lastName }),
    ...(input.phone === undefined ? {} : { phone: input.phone }),
  };
  if (Object.keys(changes).length > 0) {
    await db.update(users).set(changes).where(eq(users.id, userId));
  }
  return readProfile(db, userId);
}
