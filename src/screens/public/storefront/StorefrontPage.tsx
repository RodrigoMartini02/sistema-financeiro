import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, Search, Share2, ShoppingBag, Store } from 'lucide-react';
import {
  fetchPublicStorefront, getPublicProductImageUrl, storefrontPublicUrl, type PublicProduct,
} from '../../../services/storefrontService';
import { queryKeys } from '../../../services/queryKeys';
import { buildWhatsappUrl } from '../../../utils/storefrontCart';
import { matchesStorefrontFilter, storefrontCategories } from '../../../utils/storefrontCatalog';
import { formatCurrency } from '../../finance/formatters';
import { StorefrontProductCard } from './StorefrontProductCard';
import { StorefrontProductSheet } from './StorefrontProductSheet';
import { StorefrontCartSheet } from './StorefrontCartSheet';
import { useStorefrontCart } from './useStorefrontCart';
import { shareLink } from './shareLink';

const PRODUCT_PARAM = 'produto';
const SKELETON_CARDS = 8;

function setMetaDescription(content: string): void {
  document.head.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', content);
}

function StorefrontMessage({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-50 px-4 text-center">
      <Store size={36} className="text-slate-300" />
      <p className="text-base font-semibold text-slate-700">{title}</p>
      {description && <p className="text-sm text-slate-500">{description}</p>}
    </div>
  );
}

/**
 * Vitrine pública de uma loja, pelo link amigável (/loja/<link>) ou pelo
 * código antigo (/catalogo/<código>). Produtos com busca, categorias, detalhe
 * com fotos e uma sacola que envia o pedido pelo WhatsApp da loja.
 */
export function StorefrontPage() {
  const { storefront: storefrontParam = '' } = useParams<{ storefront: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [storeShareFeedback, setStoreShareFeedback] = useState('');

  const storefrontQuery = useQuery({
    queryKey: queryKeys.publicStorefront(storefrontParam),
    queryFn: () => fetchPublicStorefront(storefrontParam),
    enabled: storefrontParam !== '',
    retry: false,
  });
  const store = storefrontQuery.data?.loja;
  const products = useMemo(() => storefrontQuery.data?.produtos ?? [], [storefrontQuery.data]);
  const cart = useStorefrontCart(store?.id, products);

  const categories = useMemo(() => storefrontCategories(products), [products]);
  const visibleProducts = products.filter((product) => matchesStorefrontFilter(product, selectedCategory, search));
  const canBuy = Boolean(store?.whatsapp);

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
          <span className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-slate-400">
            {store?.logo ? <img src={store.logo} alt={`Logo de ${store.nome}`} className="h-full w-full object-cover" /> : <Store size={24} />}
          </span>
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
                onAdd={() => cart.add(product.id)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Com a barra da sacola fixa embaixo, o rodapé sobe para não ficar coberto. */}
      <footer className={`text-center text-xs text-slate-400 ${canBuy && cart.count > 0 ? 'pb-28' : 'pb-8'}`}>
        Feito com{' '}
        <a href="https://fin-gerence.com.br" target="_blank" rel="noreferrer" className="font-semibold text-slate-500 hover:text-brand-600">
          FINGERENCE
        </a>
      </footer>

      {canBuy && cart.count > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-20 px-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex h-14 w-full max-w-md items-center justify-between gap-3 rounded-full bg-slate-900 px-5 text-white shadow-lg transition hover:bg-slate-800"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingBag size={18} /> Ver sacola · {cart.count} {cart.count === 1 ? 'item' : 'itens'}
            </span>
            <span className="text-sm font-bold">{formatCurrency(cart.total)}</span>
          </button>
        </div>
      )}

      {store && openProduct && (
        <StorefrontProductSheet
          key={openProduct.id}
          product={openProduct}
          imageUrls={openProduct.imagens.map((image) => getPublicProductImageUrl(store.id, image.nomeArquivo))}
          canBuy={canBuy}
          shareUrl={`${storeUrl}?${PRODUCT_PARAM}=${openProduct.id}`}
          onClose={closeProductSheet}
          onAdd={(quantity) => {
            cart.add(openProduct.id, quantity);
            closeProductSheet();
          }}
        />
      )}

      {store?.whatsapp && (
        <StorefrontCartSheet
          open={cartOpen}
          storeName={store.nome}
          whatsapp={store.whatsapp}
          lines={cart.lines}
          total={cart.total}
          imageUrlOf={(productId) => imageUrlOf(products.find((product) => product.id === productId))}
          onClose={() => setCartOpen(false)}
          onSetQuantity={cart.setQuantity}
          onRemove={cart.remove}
          onClear={cart.clear}
        />
      )}
    </div>
  );
}
