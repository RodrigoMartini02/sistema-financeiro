import { and, asc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db/client';
import { accounts, users } from '../db/schema';
import { catalogoContas, catalogoProdutoImagens, catalogoProdutos, type CatalogoConta } from '../modules/catalogo/db/schema';
import { isUniqueViolation } from '../utils/dbErrors';
import { RequestInputError } from '../utils/requestInput';
import { reservedQuantities } from './orders';
import { availableQuantity } from './orderPricing';
import { buildProductPricing } from './productPricing';
import { listImagesByProduct, type ProductImageView } from './productImages';
import { parseStorefrontParam, slugify, withSlugSuffix, type StorefrontInput } from './storefrontInput';

/** Conta PJ já conferida (ver resolveCompanyAccount). */
interface CompanyAccount {
  id: number;
  ownerId: number;
}

/** Configuração da vitrine para a tela "Configurar vitrine". */
export interface StorefrontConfig {
  id: string;
  contaId: number;
  link: string;
  /** O que foi gravado; nulo usa `nomePadrao`. */
  nome: string | null;
  nomePadrao: string;
  descricao: string | null;
  whatsapp: string | null;
  /** O que foi gravado; nulo usa `logoPadrao`. */
  logo: string | null;
  logoPadrao: string | null;
  retiradaAtiva: boolean;
  retiradaEndereco: string | null;
  retiradaHorario: string | null;
  entregaAtiva: boolean;
  entregaTaxa: number | null;
  entregaDescricao: string | null;
  politicaTroca: string | null;
}

export interface PublicStorefront {
  id: string;
  contaId: number;
  ownerId: number;
  link: string | null;
  nome: string;
  descricao: string | null;
  whatsapp: string | null;
  logo: string | null;
  /** Retirada no local, quando a loja oferece. */
  retirada: { endereco: string; horario: string | null } | null;
  /** Entrega com taxa fixa, quando a loja oferece. */
  entrega: { taxa: number; descricao: string | null } | null;
  politicaTroca: string | null;
}

export interface PublicStorefrontProduct {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  valor: number;
  valorFinal: number;
  descontoPercentual: number | null;
  esgotado: boolean;
  imagens: ProductImageView[];
}

/** Tentativas de link livre (`loja`, `loja-2`...) antes de desistir. */
const MAX_SLUG_ATTEMPTS = 50;
/** Corrida entre duas primeiras leituras da mesma conta: a segunda relê a vitrine criada pela primeira. */
const MAX_CREATE_ATTEMPTS = 3;

interface AccountBranding {
  defaultName: string;
  defaultLogo: string | null;
}

/**
 * Nome e logo usados quando a vitrine não tem os seus: o nome fantasia (ou o
 * nome da conta) e, na PJ padrão do dono — a PJ do login —, o logo do acesso.
 */
function brandingOf(account: {
  name: string;
  tradeName: string | null;
  isDefault: boolean;
  type: string;
  ownerPhoto: string | null;
}): AccountBranding {
  const tradeName = account.tradeName?.trim();
  return {
    defaultName: tradeName || account.name,
    defaultLogo: account.isDefault && account.type === 'empresa' ? account.ownerPhoto : null,
  };
}

async function loadAccountBranding(accountId: number): Promise<AccountBranding> {
  const [account] = await db
    .select({
      name: accounts.name,
      tradeName: accounts.tradeName,
      isDefault: accounts.isDefault,
      type: accounts.type,
      ownerPhoto: users.photo,
    })
    .from(accounts)
    .innerJoin(users, eq(users.id, accounts.userId))
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!account) {
    throw new RequestInputError('Conta não encontrada', 404);
  }
  return brandingOf(account);
}

function toConfig(storefront: CatalogoConta, branding: AccountBranding): StorefrontConfig {
  return {
    id: storefront.id,
    contaId: storefront.contaId!,
    link: storefront.slug!,
    nome: storefront.nome,
    nomePadrao: branding.defaultName,
    descricao: storefront.descricao,
    whatsapp: storefront.whatsapp,
    logo: storefront.logo,
    logoPadrao: branding.defaultLogo,
    retiradaAtiva: storefront.retiradaAtiva,
    retiradaEndereco: storefront.retiradaEndereco,
    retiradaHorario: storefront.retiradaHorario,
    entregaAtiva: storefront.entregaAtiva,
    entregaTaxa: storefront.entregaTaxa === null ? null : Number(storefront.entregaTaxa),
    entregaDescricao: storefront.entregaDescricao,
    politicaTroca: storefront.politicaTroca,
  };
}

async function isSlugTaken(slug: string): Promise<boolean> {
  const [found] = await db.select({ id: catalogoContas.id }).from(catalogoContas).where(eq(catalogoContas.slug, slug)).limit(1);
  return found !== undefined;
}

/** Primeiro link livre a partir do nome: `minha-loja`, `minha-loja-2`... */
async function findFreeSlug(name: string): Promise<string> {
  const base = slugify(name);
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
    const candidate = withSlugSuffix(base, attempt);
    if (!(await isSlugTaken(candidate))) {
      return candidate;
    }
  }
  throw new Error(`No free storefront slug for "${base}"`);
}

/**
 * Vitrine da conta PJ, criada na primeira leitura com o link gerado do nome
 * fantasia. A vitrine migrada da 0065 nasce sem link e ganha um aqui.
 */
export async function getOrCreateStorefront(account: CompanyAccount): Promise<StorefrontConfig> {
  const branding = await loadAccountBranding(account.id);

  for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt += 1) {
    const [existing] = await db.select().from(catalogoContas).where(eq(catalogoContas.contaId, account.id)).limit(1);
    if (existing?.slug) {
      return toConfig(existing, branding);
    }

    try {
      const slug = await findFreeSlug(branding.defaultName);
      const [saved] = existing
        ? await db
          .update(catalogoContas)
          .set({ slug, updatedAt: new Date() })
          .where(eq(catalogoContas.id, existing.id))
          .returning()
        : await db
          .insert(catalogoContas)
          .values({ usuarioId: account.ownerId, contaId: account.id, slug })
          .returning();
      return toConfig(saved!, branding);
    } catch (error) {
      // Outra leitura criou a vitrine ou pegou o mesmo link: relê e tenta de novo.
      if (!isUniqueViolation(error) || attempt === MAX_CREATE_ATTEMPTS) {
        throw error;
      }
    }
  }
  throw new Error('Storefront creation did not converge');
}

export async function updateStorefront(account: CompanyAccount, input: StorefrontInput): Promise<StorefrontConfig> {
  await getOrCreateStorefront(account);
  const branding = await loadAccountBranding(account.id);

  try {
    const [updated] = await db
      .update(catalogoContas)
      .set({
        slug: input.slug,
        nome: input.name,
        descricao: input.description,
        whatsapp: input.whatsapp,
        logo: input.logo,
        retiradaAtiva: input.pickup.active,
        retiradaEndereco: input.pickup.address,
        retiradaHorario: input.pickup.hours,
        entregaAtiva: input.delivery.active,
        entregaTaxa: input.delivery.fee === null ? null : input.delivery.fee.toFixed(2),
        entregaDescricao: input.delivery.description,
        politicaTroca: input.exchangePolicy,
        updatedAt: new Date(),
      })
      .where(eq(catalogoContas.contaId, account.id))
      .returning();
    return toConfig(updated!, branding);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new RequestInputError('Esse link já está em uso', 409);
    }
    throw error;
  }
}

/**
 * Vitrine aberta ao público pelo link ou pelo código antigo. Só existe com a
 * conta PJ dona dela ativa; o resto (link inválido, vitrine antiga sem conta,
 * conta desativada) é "loja não encontrada".
 */
export async function findPublicStorefront(param: string): Promise<PublicStorefront | null> {
  const parsed = parseStorefrontParam(param);
  if (!parsed) {
    return null;
  }

  // As duas tabelas se chamam "contas" (catalogo.contas e a conta financeira):
  // sem o apelido, o Postgres acusa referência ambígua no join.
  const storefronts = alias(catalogoContas, 'vitrine');
  const [row] = await db
    .select({
      id: storefronts.id,
      contaId: accounts.id,
      ownerId: accounts.userId,
      slug: storefronts.slug,
      nome: storefronts.nome,
      descricao: storefronts.descricao,
      whatsapp: storefronts.whatsapp,
      logo: storefronts.logo,
      retiradaAtiva: storefronts.retiradaAtiva,
      retiradaEndereco: storefronts.retiradaEndereco,
      retiradaHorario: storefronts.retiradaHorario,
      entregaAtiva: storefronts.entregaAtiva,
      entregaTaxa: storefronts.entregaTaxa,
      entregaDescricao: storefronts.entregaDescricao,
      politicaTroca: storefronts.politicaTroca,
      accountName: accounts.name,
      tradeName: accounts.tradeName,
      isDefault: accounts.isDefault,
      type: accounts.type,
      active: accounts.active,
      ownerPhoto: users.photo,
    })
    .from(storefronts)
    .innerJoin(accounts, eq(accounts.id, storefronts.contaId))
    .innerJoin(users, eq(users.id, accounts.userId))
    .where(parsed.kind === 'id' ? eq(storefronts.id, parsed.id) : eq(storefronts.slug, parsed.slug))
    .limit(1);

  if (!row || row.type !== 'empresa' || row.active === false) {
    return null;
  }

  const branding = brandingOf({ ...row, name: row.accountName });
  return {
    id: row.id,
    contaId: row.contaId,
    ownerId: row.ownerId,
    link: row.slug,
    nome: row.nome ?? branding.defaultName,
    descricao: row.descricao,
    whatsapp: row.whatsapp,
    logo: row.logo ?? branding.defaultLogo,
    retirada: row.retiradaAtiva && row.retiradaEndereco
      ? { endereco: row.retiradaEndereco, horario: row.retiradaHorario }
      : null,
    entrega: row.entregaAtiva && row.entregaTaxa !== null
      ? { taxa: Number(row.entregaTaxa), descricao: row.entregaDescricao }
      : null,
    politicaTroca: row.politicaTroca,
  };
}

/**
 * Produtos ativos da conta da vitrine, por nome. A quantidade em estoque é
 * lida só para saber se o produto esgotou — descontado o que está separado em
 * pedidos pendentes — e nunca sai daqui.
 */
export async function listPublicProducts(storefront: PublicStorefront): Promise<PublicStorefrontProduct[]> {
  const products = await db
    .select({
      id: catalogoProdutos.id,
      nome: catalogoProdutos.nome,
      descricao: catalogoProdutos.descricao,
      categoria: catalogoProdutos.categoria,
      valor: catalogoProdutos.valor,
      descontoTipo: catalogoProdutos.descontoTipo,
      descontoValor: catalogoProdutos.descontoValor,
      controlaEstoque: catalogoProdutos.controlaEstoque,
      quantidadeEstoque: catalogoProdutos.quantidadeEstoque,
    })
    .from(catalogoProdutos)
    .where(and(
      eq(catalogoProdutos.contaId, storefront.contaId),
      eq(catalogoProdutos.usuarioId, storefront.ownerId),
      eq(catalogoProdutos.ativo, true),
    ))
    .orderBy(asc(catalogoProdutos.nome), asc(catalogoProdutos.id));

  const productIds = products.map((product) => product.id);
  const [imagesByProduct, reserved] = await Promise.all([
    listImagesByProduct(productIds),
    reservedQuantities(db, productIds.filter((id) => products.find((product) => product.id === id)?.controlaEstoque)),
  ]);

  return products.map((product) => ({
    id: product.id,
    nome: product.nome,
    descricao: product.descricao,
    categoria: product.categoria,
    valor: Number(product.valor),
    ...buildProductPricing(product),
    esgotado: availableQuantity(Number(product.quantidadeEstoque), reserved.get(product.id) ?? 0, product.controlaEstoque) === 0,
    imagens: imagesByProduct.get(product.id) ?? [],
  }));
}

/** A imagem só sai pela vitrine quando é de um produto ativo da conta dela. */
export async function isPublicProductImage(storefront: PublicStorefront, fileName: string): Promise<boolean> {
  const [image] = await db
    .select({ id: catalogoProdutoImagens.id })
    .from(catalogoProdutoImagens)
    .innerJoin(catalogoProdutos, eq(catalogoProdutos.id, catalogoProdutoImagens.produtoId))
    .where(and(
      eq(catalogoProdutoImagens.nomeArquivo, fileName),
      eq(catalogoProdutos.contaId, storefront.contaId),
      eq(catalogoProdutos.usuarioId, storefront.ownerId),
      eq(catalogoProdutos.ativo, true),
    ))
    .limit(1);
  return image !== undefined;
}
