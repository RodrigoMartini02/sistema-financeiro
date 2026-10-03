import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Check, MessageCircle, Search, Share2 } from 'lucide-react';
import {
  getPublicProductImageUrl, storefrontBasePath, storefrontPublicUrl, type PublicProduct,
} from '../../../services/storefrontService';
import { buildWhatsappUrl } from '../../../utils/storefrontCart';
import { matchesStorefrontFilter, storefrontCategories } from '../../../utils/storefrontCatalog';
import { StorefrontProductCard } from './StorefrontProductCard';
import { StorefrontProductSheet } from './StorefrontProductSheet';
import { CartButton, StoreLogo, StorefrontFooter, StorefrontMessage, usePublicStorefront } from './StorefrontLayout';
import { useStorefrontCart } from './useStorefrontCart';
import { shareLink } from './shareLink';

const PRODUCT_PARAM = 'produto';
const SKELETON_CARDS = 8;
const ADDED_TOAST_MS = 4000;

function setMetaDescription(content: string): void {
  document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', content);
}

/**
 * Vitrine pública de uma loja, pelo link amigável (/loja/<link>) ou pelo
 * código antigo (/catalogo/<código>). Produtos com busca, categorias, detalhe
 * com fotos e a sacola, que fecha a compra na vitrine (Mercado Pago da loja)
 * ou envia o pedido pelo WhatsApp dela.
 */
export function StorefrontPage() {
  const { storefront: storefrontParam = '' } = useParams<{ storefront: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [storeShareFeedback, setStoreShareFeedback] = useState('');
  const [addedToast, setAddedToast] = useState<{ id: number; name: string } | null>(null);

  const storefrontQuery = usePublicStorefront(storefrontParam);
  const store = storefrontQuery.data?.loja;
  const products = useMemo(() => storefrontQuery.data?.produtos ?? [], [storefrontQuery.data]);
  const cart = useStorefrontCart(store?.id, products);

  const categories = useMemo(() => storefrontCategories(products), [products]);
  const visibleProducts = products.filter((product) => matchesStorefrontFilter(product, selectedCategory, search));
  // Compra pela vitrine ou, sem ela, pelo WhatsApp; sem nenhum dos dois, a vitrine é só catálogo.
  const canBuy = storefrontQuery.data?.checkout.online === true || Boolean(store?.whatsapp);
  const basePath = store ? storefrontBasePath(store) : null;

  // O link amigável vale enquanto não for trocado; o código (id) é o endereço estável das imagens.
  const storeUrl = store?.link ? storefrontPublicUrl(store.link) : window.location.href.split('?')[0]!;
  const imageUrlOf = (product: PublicProduct | undefined) => {
    const cover = product?.imagens[0];
    return store && cover ? getPublicProductImageUrl(store.id, cover.nomeArquivo) : null;
  };

  const openProductId = searchParams.get(PRODUCT_PARAM);
  const openProduct = openProductId ? products.find((product) => product.id === openProductId) : undefined;

  const openProductSheet = (productId: string) => setSearchParams({ [PRODUCT_PARAM]: productId });
  const closeProductSheet = () => setSearchParams({}, { replace: true });

  useEffect(() => {
    if (!store) return;
    document.title = `${store.nome} · Vitrine`;
    setMetaDescription(store.descricao ?? `Produtos de ${store.nome}`);
  }, [store]);

  useEffect(() => {
    if (!addedToast) return;
    const timer = setTimeout(() => setAddedToast(null), ADDED_TOAST_MS);
    return () => clearTimeout(timer);
  }, [addedToast]);

  const addToCart = (product: PublicProduct, quantity = 1) => {
    cart.add(product.id, quantity);
    setAddedToast({ id: Date.now(), name: product.nome });
  };

  const handleShareStore = async () => {
    if (!store) return;
    const result = await shareLink({ title: store.nome, url: storeUrl });
    if (result === 'copied') {
      setStoreShareFeedback('Link copiado');
      setTimeout(() => setStoreShareFeedback(''), 2000);
    }
  };

  if (storefrontQuery.isError || storefrontParam === '') {
    return <StorefrontMessage title="Loja não encontrada" description="Confira o link com quem o enviou." />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-5">
          <StoreLogo store={store} size="large" />
          <div className="min-w-0 flex-1">
            {store ? (
              <>
                <h1 className="truncate text-lg font-bold text-slate-900">{store.nome}</h1>
                {store.descricao && <p className="line-clamp-2 text-sm text-slate-500">{store.descricao}</p>}
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="h-5 w-40 animate-pulse rounded bg-slate-200" />
                <span className="h-4 w-56 animate-pulse rounded bg-slate-100" />
              </div>
            )}
          </div>
          {store && (
            <div className="flex flex-none items-center gap-2">
              <button
                type="button"
                onClick={() => void handleShareStore()}
                aria-label="Compartilhar a loja"
                title={storeShareFeedback || 'Compartilhar a loja'}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50"
              >
                <Share2 size={16} />
              </button>
              {store.whatsapp && (
                <a
                  href={buildWhatsappUrl(store.whatsapp)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-10 items-center gap-1.5 rounded-full bg-emerald-500 px-4 text-sm font-semibold text-white transition hover:bg-emerald-600"
                >
                  <MessageCircle size={16} />
                  <span className="hidden sm:inline">WhatsApp</span>
                </a>
              )}
              {canBuy && basePath && <CartButton to={`${basePath}/sacola`} count={cart.count} />}
            </div>
          )}
        </div>
        {storeShareFeedback && (
          <p className="mx-auto max-w-5xl px-4 pb-3 text-right text-xs font-medium text-emerald-600">{storeShareFeedback}</p>
        )}
      </header>

      <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3">
          <label className="relative block">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar produtos"
              aria-label="Buscar produtos"
              className="h-11 w-full rounded-full border border-slate-200 bg-white pl-9 pr-4 text-sm outline-none transition focus:border-brand-500"
            />
          </label>
          {categories.length > 0 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {[{ key: null, label: 'Todos' }, ...categories].map((category) => {
                const active = selectedCategory === category.key;
                return (
                  <button
                    key={category.key ?? 'todos'}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedCategory(category.key)}
                    className={`h-9 flex-none rounded-full px-4 text-sm font-semibold transition ${active
                      ? 'bg-brand-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}
                  >
                    {category.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4 pb-8 pt-5">
        {storefrontQuery.isLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {Array.from({ length: SKELETON_CARDS }, (_, position) => (
              <div key={position} className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <span className="aspect-square w-full animate-pulse bg-slate-100" />
                <span className="m-3 h-4 w-3/4 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        )}

        {!storefrontQuery.isLoading && products.length === 0 && (
          <p className="py-16 text-center text-sm text-slate-400">Nenhum produto disponível no momento.</p>
        )}
        {!storefrontQuery.isLoading && products.length > 0 && visibleProducts.length === 0 && (
          <p className="py-16 text-center text-sm text-slate-400">Nenhum produto encontrado.</p>
        )}

        {visibleProducts.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {visibleProducts.map((product) => (
              <StorefrontProductCard
                key={product.id}
                product={product}
                imageUrl={imageUrlOf(product)}
                canBuy={canBuy}
                onOpen={() => openProductSheet(product.id)}
                onAdd={() => addToCart(product)}
              />
            ))}
          </div>
        )}
      </main>

      <StorefrontFooter className="pb-8" />

      {store && openProduct && (
        <StorefrontProductSheet
          key={openProduct.id}
          product={openProduct}
          imageUrls={openProduct.imagens.map((image) => getPublicProductImageUrl(store.id, image.nomeArquivo))}
          canBuy={canBuy}
          shareUrl={`${storeUrl}?${PRODUCT_PARAM}=${openProduct.id}`}
          onClose={closeProductSheet}
          onAdd={(quantity) => {
            addToCart(openProduct, quantity);
            closeProductSheet();
          }}
        />
      )}

      {addedToast && basePath && (
        <div
          key={addedToast.id}
          role="status"
          className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-lg">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-emerald-500">
              <Check size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Adicionado à sacola</p>
              <p className="truncate text-xs text-slate-300">{addedToast.name}</p>
            </div>
            <Link
              to={`${basePath}/sacola`}
              className="flex h-9 flex-none items-center rounded-full bg-white px-4 text-xs font-bold text-slate-900 transition hover:bg-slate-100"
            >
              Ver sacola
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
