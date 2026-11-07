import { inArray } from 'drizzle-orm';
import type { TendersDb } from '../collector/database';
import { PURCHASE_CONTROL_NUMBER } from '../contractStore/layout';
import { tenderNotices } from '../db/schema';

// A ligação das licitações vencidas (conjunto `vencedores` do armazém) com o resto do sistema: o edital no banco, quando
// ele ainda existe (os editais saem 12 meses depois de encerrados), e o endereço da compra na fonte oficial. Usado pela
// página do CNPJ (services/cnpjPage.ts) e pelo comando `winners-lookup` (collector/winnersLookup.ts).

/** Endereço da compra pelo número de controle (CNPJ do órgão, ano e sequencial sem zeros à esquerda). */
export function purchaseLink(purchaseControlNumber: string): string {
  const match = PURCHASE_CONTROL_NUMBER.exec(purchaseControlNumber);
  return match ? `https://pncp.gov.br/app/editais/${match[1]}/${match[3]}/${match[2]}` : '';
}

/** O edital de uma licitação vencida, como está no banco. */
export interface WinnerNotice {
  id: number;
  /** A fonte de resultados não traz o nome do órgão; o edital traz. */
  agencyName: string | null;
}

/** Os editais que existem no banco, por número de controle da compra, numa consulta só. */
export async function findNotices(db: TendersDb, controlNumbers: readonly string[]): Promise<Map<string, WinnerNotice>> {
  if (controlNumbers.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({ id: tenderNotices.id, controlNumber: tenderNotices.pncpControlNumber, agencyName: tenderNotices.agencyName })
    .from(tenderNotices)
    .where(inArray(tenderNotices.pncpControlNumber, [...controlNumbers]));
  return new Map(rows.map((row) => [row.controlNumber, { id: row.id, agencyName: row.agencyName }]));
}
