import { and, eq, gte, inArray, isNotNull, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { tenderDocuments, tenderEnabledAccounts, tenderNotifications, tenderPeople, tenderUsersWithAccess } from '../db/schema';
import { DOCUMENT_TYPES, findDocumentType, type DocumentTypeId, type TenderNotificationType, type TenderRole } from '../domains';
import { documentRecencyOrder } from '../services/documentRecency';
import { DOCUMENT_WARNING_DAYS, calendarDaysBetween, expiryNoticeType } from '../services/documentStatus';
import type { TendersDb } from './database';
import { addCalendarDays } from './dates';

// Avisos de vencimento dos documentos do cofre (plano .plans/licitacoes-5-cofre-de-documentos.md): DOCUMENTO_VENCE_30D (de 8
// a 30 dias para vencer) e DOCUMENTO_VENCE_7D (de 0 a 7), um por documento e por pessoa, na etapa de lembretes de prazo da
// rotina diária. A referência é a validade (AAAA-MM-DD): o índice único (conta, pessoa, tipo, documento, referência) com ON
// CONFLICT DO NOTHING impede repetir numa segunda execução, e uma validade nova (a data foi editada) avisa de novo. Só os
// documentos vigentes avisam: nos tipos em que o novo substitui o anterior, o documento antigo não avisa que venceu depois
// da renovação. Documento vencido não gera aviso novo.
//
// Os destinatários saem da view licitacoes.usuario_com_acesso (o coletor roda com um usuário restrito, que não lê a identidade
// em `public`): o titular e os colaboradores ativos com acesso, para documento da empresa; só o titular, para documento de
// pessoa (dado pessoal de terceiros). Só contas com acesso valendo recebem (licitacoes.fn_conta_com_acesso).

const INSERT_BATCH_SIZE = 500;
const COMPANY_DOCUMENTS_LINK = '/documentacao';
const PEOPLE_DOCUMENTS_LINK = '/documentacao?aba=pessoas';

/** Os tipos em que vários documentos convivem: todos são vigentes, sem histórico. */
const COEXISTING_TYPE_IDS: DocumentTypeId[] = DOCUMENT_TYPES.filter((type) => !type.latestOnly).map((type) => type.id);

/** Contas com o módulo valendo: a mesma regra da trava de acesso. */
const accessibleAccount = alias(tenderEnabledAccounts, 'h');
const hasAccess = sql`licitacoes.fn_conta_com_acesso(${sql.identifier('h')})`;

/** O que a etapa fez, para `details.documents` da execução. */
export interface DocumentNoticeSummary {
  /** Documentos vigentes de contas com acesso que vencem nos próximos 30 dias. */
  expiring: number;
  /** Avisos criados (os repetidos não contam). */
  created: number;
}

interface ExpiringDocument {
  id: number;
  accountId: number;
  type: DocumentTypeId;
  personId: number | null;
  description: string | null;
  /** AAAA-MM-DD. */
  validUntil: string;
  personName: string | null;
}

/** AAAA-MM-DD → DD/MM/AAAA. */
function formatDay(day: string): string {
  const [year, month, date] = day.split('-');
  return `${date}/${month}/${year}`;
}

/** O texto e o destino do aviso de um documento (puro, para ter teste). */
export function documentNoticeContent(
  document: Pick<ExpiringDocument, 'type' | 'personId' | 'description' | 'validUntil' | 'personName'>,
): { title: string; message: string | null; link: string } {
  const entry = findDocumentType(document.type);
  // Nos tipos genéricos ("Outro documento"), a descrição é o nome do documento; nos outros, ela vai na mensagem.
  const usesDescriptionAsName = entry?.descriptionRequired === true && document.description !== null;
  const name = usesDescriptionAsName ? (document.description as string) : (entry?.name ?? 'Documento');
  const owner = document.personName === null ? '' : ` de ${document.personName}`;
  return {
    title: `${name}${owner} vence em ${formatDay(document.validUntil)}`,
    message: usesDescriptionAsName ? null : document.description,
    link: document.personId === null ? COMPANY_DOCUMENTS_LINK : PEOPLE_DOCUMENTS_LINK,
  };
}

/**
 * Os documentos vigentes que vencem de hoje (`today`, AAAA-MM-DD) até 30 dias adiante, de contas com acesso. Vigente: nos
 * tipos em que o novo substitui o anterior, o primeiro do tipo (e da pessoa) na ordem de documentRecencyOrder; nos outros,
 * todos. A ordem é calculada sobre todos os documentos do grupo, e só depois filtrada pela janela.
 */
async function readExpiringDocuments(db: TendersDb, today: string): Promise<ExpiringDocument[]> {
  // O `row_number() over (...)` é um fragmento `sql` porque o Drizzle não tem função de janela; o resto é Drizzle, com os valores
  // como parâmetros. A ordem do grupo é a de documentRecencyOrder, a mesma da lista do cofre.
  const ranked = db
    .select({
      id: tenderDocuments.id,
      accountId: tenderDocuments.accountId,
      type: tenderDocuments.type,
      personId: tenderDocuments.personId,
      description: tenderDocuments.description,
      validUntil: tenderDocuments.validUntil,
      rank: sql<number>`row_number() over (partition by ${tenderDocuments.accountId}, ${tenderDocuments.type}, ${tenderDocuments.personId} order by ${sql.join(documentRecencyOrder, sql`, `)})`.as('rank'),
    })
    .from(tenderDocuments)
    .innerJoin(accessibleAccount, eq(accessibleAccount.accountId, tenderDocuments.accountId))
    .where(hasAccess)
    .as('ranked');

  const rows = await db
    .select({
      id: ranked.id,
      accountId: ranked.accountId,
      type: ranked.type,
      personId: ranked.personId,
      description: ranked.description,
      validUntil: ranked.validUntil,
      personName: tenderPeople.name,
    })
    .from(ranked)
    .leftJoin(tenderPeople, and(eq(tenderPeople.id, ranked.personId), eq(tenderPeople.accountId, ranked.accountId)))
    .where(
      and(
        isNotNull(ranked.validUntil),
        gte(ranked.validUntil, today),
        lte(ranked.validUntil, addCalendarDays(today, DOCUMENT_WARNING_DAYS)),
        or(eq(ranked.rank, 1), inArray(ranked.type, COEXISTING_TYPE_IDS)),
      ),
    );
  return rows.flatMap((row) => (row.validUntil === null ? [] : [{ ...row, validUntil: row.validUntil }]));
}

/** Quem pode usar o módulo em cada uma das contas (o titular e os colaboradores com acesso). */
async function readAccountUsers(db: TendersDb, accountIds: number[]): Promise<Map<number, Array<{ userId: number; role: TenderRole }>>> {
  const rows = await db
    .select({ accountId: tenderUsersWithAccess.accountId, userId: tenderUsersWithAccess.userId, role: tenderUsersWithAccess.role })
    .from(tenderUsersWithAccess)
    .where(inArray(tenderUsersWithAccess.accountId, accountIds));
  const usersByAccount = new Map<number, Array<{ userId: number; role: TenderRole }>>();
  for (const row of rows) {
    usersByAccount.set(row.accountId, [...(usersByAccount.get(row.accountId) ?? []), { userId: row.userId, role: row.role }]);
  }
  return usersByAccount;
}

/**
 * DOCUMENTO_VENCE_30D e DOCUMENTO_VENCE_7D do dia `today` (AAAA-MM-DD, Brasília): para cada documento vigente que vence
 * nos próximos 30 dias, um aviso por pessoa que pode vê-lo. Roda na etapa de lembretes de prazo da rotina diária.
 */
export async function notifyExpiringDocuments(db: TendersDb, today: string): Promise<DocumentNoticeSummary> {
  const documents = await readExpiringDocuments(db, today);
  const summary: DocumentNoticeSummary = { expiring: documents.length, created: 0 };
  if (documents.length === 0) {
    return summary;
  }
  const usersByAccount = await readAccountUsers(db, [...new Set(documents.map((document) => document.accountId))]);

  const notifications: Array<typeof tenderNotifications.$inferInsert> = documents.flatMap((document) => {
    const type: TenderNotificationType | null = expiryNoticeType(calendarDaysBetween(today, document.validUntil));
    if (type === null) {
      return [];
    }
    const content = documentNoticeContent(document);
    // Documento de pessoa: só o titular. Documento da empresa: o titular e os colaboradores com acesso.
    const recipients = (usersByAccount.get(document.accountId) ?? []).filter((user) => document.personId === null || user.role === 'TITULAR');
    return recipients.map((user) => ({
      accountId: document.accountId,
      userId: user.userId,
      type,
      title: content.title,
      message: content.message,
      link: content.link,
      documentId: document.id,
      reference: document.validUntil,
    }));
  });

  for (let start = 0; start < notifications.length; start += INSERT_BATCH_SIZE) {
    const batch = notifications.slice(start, start + INSERT_BATCH_SIZE);
    const inserted = await db.insert(tenderNotifications).values(batch).onConflictDoNothing().returning({ id: tenderNotifications.id });
    summary.created += inserted.length;
  }
  return summary;
}
