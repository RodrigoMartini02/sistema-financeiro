import { sql, type SQL } from 'drizzle-orm';
import { tenderDocuments } from '../db/schema';

/**
 * Do mais recente para o mais antigo dentro de um tipo de documento (e de uma pessoa): a emissão mais nova e, no empate ou
 * sem emissão, o último enviado. Nos tipos em que o documento novo substitui o anterior (`latestOnly` do catálogo), o
 * primeiro de cada grupo nessa ordem é o vigente e os outros são histórico. A lista do cofre (vaultDocuments.ts) e os avisos
 * de vencimento (collector/documentNotifications.ts) usam esta mesma ordem, para a tela e o sino nunca discordarem.
 */
export const documentRecencyOrder: SQL[] = [sql`${tenderDocuments.issuedOn} desc nulls last`, sql`${tenderDocuments.id} desc`];
