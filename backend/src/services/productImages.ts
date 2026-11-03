import { listAttachmentsByOwners } from './attachmentService';

/** A imagem de um produto como as telas recebem: o id é o do anexo e também o endereço da imagem na vitrine. */
export interface ProductImageView {
  id: string;
}

/** Imagens de vários produtos numa consulta só, agrupadas por produto e na ordem de exibição (a primeira é a capa). */
export async function listImagesByProduct(productIds: string[]): Promise<Map<string, ProductImageView[]>> {
  const attachmentsByProduct = await listAttachmentsByOwners({ type: 'product', ids: productIds });
  const imagesByProduct = new Map<string, ProductImageView[]>();
  for (const [productId, images] of attachmentsByProduct) {
    imagesByProduct.set(String(productId), images.map((image) => ({ id: image.id })));
  }
  return imagesByProduct;
}
