import { asc, inArray } from 'drizzle-orm';
import { db } from '../db/client';
import { catalogoProdutoImagens } from '../modules/catalogo/db/schema';

export interface ProductImageView {
  id: string;
  produtoId: string;
  nomeArquivo: string;
  ordem: number;
}

/** Imagens de vários produtos numa consulta só, agrupadas por produto e na ordem de exibição. */
export async function listImagesByProduct(productIds: string[]): Promise<Map<string, ProductImageView[]>> {
  const imagesByProduct = new Map<string, ProductImageView[]>();
  if (productIds.length === 0) {
    return imagesByProduct;
  }

  const images = await db
    .select({
      id: catalogoProdutoImagens.id,
      produtoId: catalogoProdutoImagens.produtoId,
      nomeArquivo: catalogoProdutoImagens.nomeArquivo,
      ordem: catalogoProdutoImagens.ordem,
    })
    .from(catalogoProdutoImagens)
    .where(inArray(catalogoProdutoImagens.produtoId, productIds))
    .orderBy(asc(catalogoProdutoImagens.ordem), asc(catalogoProdutoImagens.createdAt));

  for (const image of images) {
    const list = imagesByProduct.get(image.produtoId) ?? [];
    list.push(image);
    imagesByProduct.set(image.produtoId, list);
  }
  return imagesByProduct;
}
