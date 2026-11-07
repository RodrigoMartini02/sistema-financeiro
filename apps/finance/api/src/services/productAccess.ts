import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { catalogoProdutos, type CatalogoProduto } from '../modules/catalogo/db/schema';
import { canWriteToAccount } from '../utils/accountAccess';
import { RequestInputError } from '../utils/requestInput';
import { isUuid } from './catalogo';

const PRODUCT_NOT_FOUND_MESSAGE = 'Produto não encontrado';

/**
 * Produto pelo id, desde que a conta PJ dele seja do solicitante (dono ou
 * colaborador dela). Só o id não basta: com duas PJs do mesmo dono, o
 * colaborador de uma não mexe nos produtos da outra. Produto sem conta, de
 * conta alheia ou inexistente dão a mesma resposta.
 */
export async function findAccessibleProduct(productId: string | undefined, requesterId: number): Promise<CatalogoProduto> {
  const [product] = productId && isUuid(productId)
    ? await db.select().from(catalogoProdutos).where(eq(catalogoProdutos.id, productId)).limit(1)
    : [];
  if (!product || product.contaId === null || !(await canWriteToAccount(product.contaId, requesterId))) {
    throw new RequestInputError(PRODUCT_NOT_FOUND_MESSAGE, 404);
  }
  return product;
}
