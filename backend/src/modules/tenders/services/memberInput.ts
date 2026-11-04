// Leitura do cadastro de colaborador pelo titular (POST /api/tenders/team), com as mensagens em português. Sem
// acesso ao banco: a validade do documento pelo tipo da conta e a unicidade do e-mail e do documento são conferidas
// em accountMemberCreation. Cópia enxuta do `services/memberInput.ts` de Finanças (os dois backends são
// independentes): sem edição de membro nem cargo, setor e admissão (voltam no item 1A, com as listas de Licitações).
import { RequestInputError, readRecord } from '../utils/requestInput';

const MIN_MEMBER_PASSWORD_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface NewMemberInput {
  name: string;
  lastName: string | null;
  /** Em minúsculas. */
  email: string;
  password: string;
  /** Só os dígitos; null quando não veio (o documento é opcional). */
  document: string | null;
  telefone: string | null;
  dataNascimento: string | null;
}

function readName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) {
    throw new RequestInputError('Informe o nome');
  }
  return name;
}

function readEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email)) {
    throw new RequestInputError('Informe um e-mail válido');
  }
  return email;
}

function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function documentDigits(value: string): string {
  return value.replace(/[^\d]+/g, '');
}

export function readNewMemberInput(body: unknown): NewMemberInput {
  const record = readRecord(body, 'Pedido inválido');
  const password = record['senha'];
  if (typeof password !== 'string' || password.length < MIN_MEMBER_PASSWORD_LENGTH) {
    throw new RequestInputError(`A senha precisa ter pelo menos ${MIN_MEMBER_PASSWORD_LENGTH} caracteres`);
  }

  const document = readText(record['documento']);
  return {
    name: readName(record['nome']),
    lastName: readText(record['sobrenome']),
    email: readEmail(record['email']),
    password,
    document: document === null ? null : documentDigits(document),
    telefone: readText(record['telefone']),
    dataNascimento: readText(record['data_nascimento']),
  };
}
