import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import sharp from 'sharp';
import { accounts, attachments, catalogoProdutos, users } from '../db/schema';
import { createMemoryStorage } from '../modules/tenders/objectStorageTestSupport';
import { assertLocalDatabase, databaseTestsSkipReason } from './financeDbTestSupport';
import type { PublicStorefront } from './storefront';

async function loadServices() {
  const [client, images, storefront, attachmentService] = await Promise.all([
    import('../db/client.js'), import('./productImages.js'), import('./storefront.js'), import('./attachmentService.js'),
  ]);
  return { client, images, storefront, attachmentService };
}
let services: Awaited<ReturnType<typeof loadServices>>;

interface Shop {
  userId: number;
  accountId: number;
  activeProductId: string;
  inactiveProductId: string;
}

function storefrontOf(shop: Shop): PublicStorefront {
  return {
    id: randomUUID(), contaId: shop.accountId, ownerId: shop.userId, link: 'loja-de-teste', nome: 'Loja de teste',
    descricao: null, whatsapp: null, logo: null, retirada: null, entrega: null, politicaTroca: null,
  };
}

/** Duas lojas sem relação, cada uma com um produto ativo e um desativado; apaga tudo o que criou no fim. */
async function withShops(work: (mine: Shop, other: Shop) => Promise<void>): Promise<void> {
  const { db } = services.client;
  const userIds: number[] = [];
  async function createShop(): Promise<Shop> {
    const [user] = await db
      .insert(users)
      .values({ name: 'Teste imagens', email: `product-images-${randomUUID()}@example.test`, password: 'teste' })
      .returning({ id: users.id });
    const userId = user!.id;
    userIds.push(userId);
    const [account] = await db.insert(accounts).values({ userId, name: 'Loja', type: 'empresa', isDefault: true }).returning();
    const [active] = await db
      .insert(catalogoProdutos)
      .values({ usuarioId: userId, contaId: account!.id, nome: 'Camiseta', valor: '50.00', ativo: true })
      .returning({ id: catalogoProdutos.id });
    const [inactive] = await db
      .insert(catalogoProdutos)
      .values({ usuarioId: userId, contaId: account!.id, nome: 'Boné', valor: '30.00', ativo: false })
      .returning({ id: catalogoProdutos.id });
    return { userId, accountId: account!.id, activeProductId: active!.id, inactiveProductId: inactive!.id };
  }
  try {
    await work(await createShop(), await createShop());
  } finally {
    if (userIds.length) {
      await db.delete(attachments).where(inArray(attachments.uploadedBy, userIds));
      await db.delete(catalogoProdutos).where(inArray(catalogoProdutos.usuarioId, userIds));
      await db.delete(accounts).where(inArray(accounts.userId, userIds));
      await db.delete(users).where(inArray(users.id, userIds));
    }
  }
}

describe('imagens do produto pelos anexos (banco local)', { skip: databaseTestsSkipReason }, () => {
  before(async () => {
    assertLocalDatabase();
    services = await loadServices();
  });
  after(async () => {
    await services.client.pool.end();
  });

  async function sendImage(userId: number, productId: string, name: string) {
    const content = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#445566' } }).png().toBuffer();
    return services.attachmentService.saveAttachment(memory.storage, {
      uploadedBy: userId, ownerType: 'product', owner: { type: 'product', id: productId }, file: { originalName: name, content },
    });
  }
  let memory = createMemoryStorage();

  test('lista as imagens de vários produtos de uma vez, na ordem de envio, só com o id', async () => {
    memory = createMemoryStorage();
    await withShops(async (mine) => {
      const first = await sendImage(mine.userId, mine.activeProductId, 'frente.png');
      const second = await sendImage(mine.userId, mine.activeProductId, 'costas.png');
      const other = await sendImage(mine.userId, mine.inactiveProductId, 'bone.png');

      const images = await services.images.listImagesByProduct([mine.activeProductId, mine.inactiveProductId, randomUUID()]);
      assert.deepEqual(images.get(mine.activeProductId), [{ id: first.id }, { id: second.id }]);
      assert.deepEqual(images.get(mine.inactiveProductId), [{ id: other.id }]);
      assert.equal(images.size, 2, 'produto sem imagem não aparece no mapa');
      assert.equal((await services.images.listImagesByProduct([])).size, 0);
    });
  });

  test('a vitrine só entrega imagem de produto ativo da conta dela', async () => {
    memory = createMemoryStorage();
    await withShops(async (mine, other) => {
      const active = await sendImage(mine.userId, mine.activeProductId, 'frente.png');
      const inactive = await sendImage(mine.userId, mine.inactiveProductId, 'bone.png');
      const foreign = await sendImage(other.userId, other.activeProductId, 'alheia.png');
      const { findPublicProductImage } = services.storefront;

      assert.deepEqual(await findPublicProductImage(storefrontOf(mine), active.id), {
        storageKey: `anexos/${active.id}`, contentType: 'image/webp',
      });
      assert.equal(await findPublicProductImage(storefrontOf(mine), inactive.id), null, 'produto desativado sai da vitrine');
      assert.equal(await findPublicProductImage(storefrontOf(mine), foreign.id), null, 'imagem de outra loja');
      assert.equal(await findPublicProductImage(storefrontOf(other), active.id), null, 'a loja alheia não serve a minha imagem');
      assert.equal(await findPublicProductImage(storefrontOf(mine), 'frente.webp'), null, 'o nome do arquivo antigo não vale mais');
      assert.equal(await findPublicProductImage(storefrontOf(mine), randomUUID()), null);

      // Um anexo de lançamento (sem produto) nunca sai pela vitrine, mesmo com o id certo.
      const pending = await services.attachmentService.saveAttachment(memory.storage, {
        uploadedBy: mine.userId, ownerType: 'expense', file: { originalName: 'nota.pdf', content: Buffer.from('%PDF-1.7\n') },
      });
      assert.equal(await findPublicProductImage(storefrontOf(mine), pending.id), null);

      await services.client.db.update(catalogoProdutos).set({ ativo: true }).where(eq(catalogoProdutos.id, mine.inactiveProductId));
      assert.deepEqual(await findPublicProductImage(storefrontOf(mine), inactive.id), {
        storageKey: `anexos/${inactive.id}`, contentType: 'image/webp',
      });
    });
  });
});
