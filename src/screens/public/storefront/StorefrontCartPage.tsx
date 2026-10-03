import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Lock, MessageCircle, Minus, Plus, ShoppingBag } from 'lucide-react';
import {
  getPublicProductImageUrl, storefrontBasePath, type PublicCheckout, type PublicProduct, type PublicStore,
} from '../../../services/storefrontService';
import {
  MAX_CUSTOMER_NAME_LENGTH, MAX_ITEM_QUANTITY, MAX_ORDER_NOTE_LENGTH,
  buildOrderMessage, buildWhatsappUrl, type CartLine,
} from '../../../utils/storefrontCart';
import { formatCurrency } from '../../finance/formatters';
import { StorefrontFooter, StorefrontMessage, StorefrontTopBar, usePublicStorefront } from './StorefrontLayout';
import { PriceSummary, ProductThumb } from './StorefrontSummary';
import { useStorefrontCart } from './useStorefrontCart';

/** Entrega no resumo da sacola: com uma forma só, ela já entra no total; com as duas, fica a escolher. */
function deliveryPreview(checkout: PublicCheckout): { label: string; fee: number | null } {
  if (checkout.retirada && checkout.entrega) return { label: 'Entrega ou retirada', fee: null };
  if (checkout.entrega) return { label: 'Entrega', fee: checkout.entrega.taxa };
  return { label: 'Retirada na loja', fee: 0 };
}

function QuantityStepper({ name, quantity, onChange }: { name: string; quantity: number; onChange: (quantity: number) => void }) {
  return (
    <div className="flex h-9 items-center rounded-full border border-slate-200 bg-white">
      <button
        type="button"
        aria-label={`Diminuir ${name}`}
        disabled={quantity <= 1}
        onClick={() => onChange(quantity - 1)}
        className="flex h-9 w-9 items-center justify-center text-slate-600 disabled:opacity-30"
      >
        <Minus size={14} />
      </button>
      <span className="w-7 text-center text-sm font-semibold tabular-nums" aria-live="polite">{quantity}</span>
      <button
        type="button"
        aria-label={`Aumentar ${name}`}
        disabled={quantity >= MAX_ITEM_QUANTITY}
        onClick={() => onChange(quantity + 1)}
        className="flex h-9 w-9 items-center justify-center text-slate-600 disabled:opacity-30"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

function CartItemCard({ line, product, imageUrl, productPath, onSetQuantity, onRemove }: {
  line: CartLine;
  product: PublicProduct | undefined;
  imageUrl: string | null;
  productPath: string;
  onSetQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const hasDiscount = line.product.valorFinal < line.product.valor;
  return (
    <li className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:gap-4 sm:p-4">
      <Link to={productPath} aria-label={`Ver ${line.product.nome}`}>
        <ProductThumb imageUrl={imageUrl} size="large" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <Link to={productPath} className="line-clamp-2 text-sm font-semibold text-slate-900 hover:text-brand-700">
            {line.product.nome}
          </Link>
          <span className="hidden flex-none text-base font-bold tabular-nums text-slate-900 sm:block">{formatCurrency(line.subtotal)}</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
          {hasDiscount && <span className="text-slate-400 line-through">{formatCurrency(line.product.valor)}</span>}
          <span className="font-semibold text-slate-700">{formatCurrency(line.product.valorFinal)}</span>
          {hasDiscount && product?.descontoPercentual != null && (
            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 font-bold text-emerald-700">-{product.descontoPercentual}%</span>
          )}
          <span className="text-slate-400">cada</span>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-3">
            <QuantityStepper name={line.product.nome} quantity={line.quantity} onChange={onSetQuantity} />
            <button type="button" onClick={onRemove} className="text-xs font-semibold text-slate-500 transition hover:text-red-600">
              Excluir
            </button>
          </div>
          <span className="text-base font-bold tabular-nums text-slate-900 sm:hidden">{formatCurrency(line.subtotal)}</span>
        </div>
      </div>
    </li>
  );
}

/** Sem compra pela vitrine: nome e observação, e o pedido abre pronto no WhatsApp da loja. */
function WhatsappOrderForm({ store, whatsapp, lines, total, onClear }: {
  store: PublicStore;
  whatsapp: string;
  lines: CartLine[];
  total: number;
  onClear: () => void;
}) {
  const [customerName, setCustomerName] = useState('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <MessageCircle size={20} />
        </span>
        <p className="text-sm font-semibold text-slate-900">Pedido aberto no WhatsApp</p>
        <p className="text-xs text-slate-500">Envie a mensagem para a loja confirmar o pedido, a entrega e o pagamento.</p>
        <div className="mt-2 flex w-full flex-col gap-2">
          <button
            type="button"
            onClick={onClear}
            className="h-11 rounded-full bg-brand-600 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Limpar sacola
          </button>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="h-11 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Voltar à sacola
          </button>
        </div>
      </div>
    );
  }

  const orderUrl = customerName.trim() !== ''
    ? buildWhatsappUrl(whatsapp, buildOrderMessage({ storeName: store.nome, lines, total, customerName, note }))
    : null;

  return (
    <div className="flex flex-col gap-3 pt-2">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-slate-600">Seu nome *</span>
        <input
          value={customerName}
          onChange={(event) => setCustomerName(event.target.value.slice(0, MAX_CUSTOMER_NAME_LENGTH))}
          autoComplete="name"
          placeholder="Como a loja vai te chamar"
          className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-brand-500"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-slate-600">Observação</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, MAX_ORDER_NOTE_LENGTH))}
          rows={2}
          placeholder="Ex: tamanho, cor, melhor horário"
          className="resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none transition focus:border-brand-500"
        />
      </label>
      {orderUrl ? (
        <a
          href={orderUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() => setSent(true)}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-emerald-500 text-sm font-semibold text-white transition hover:bg-emerald-600"
        >
          <MessageCircle size={18} /> Enviar pedido pelo WhatsApp
        </a>
      ) : (
        <button type="button" disabled className="flex h-12 cursor-not-allowed items-center justify-center gap-2 rounded-full bg-slate-200 text-sm font-semibold text-slate-500">
          <MessageCircle size={18} /> Informe seu nome para enviar
        </button>
      )}
      <p className="text-center text-xs text-slate-400">A entrega e o pagamento são combinados com a loja na conversa.</p>
    </div>
  );
}

/**
 * Sacola em página própria, no padrão dos marketplaces: itens com foto, preço
 * "de/por", quantidade e excluir; o resumo fica ao lado no computador, e no
 * celular o total e o botão ficam fixos embaixo. Com a compra pela vitrine,
 * segue para o checkout; sem ela, o pedido vai pelo WhatsApp da loja.
 */
export function StorefrontCartPage() {
  const { storefront: storefrontParam = '' } = useParams<{ storefront: string }>();
  const navigate = useNavigate();
  const storefrontQuery = usePublicStorefront(storefrontParam);
  const data = storefrontQuery.data;
  const store = data?.loja;
  const products = useMemo(() => data?.produtos ?? [], [data]);
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const cart = useStorefrontCart(store?.id, products);
  const basePath = store ? storefrontBasePath(store) : null;

  useEffect(() => {
    if (store) document.title = `Sacola · ${store.nome}`;
  }, [store]);

  if (storefrontQuery.isError || storefrontParam === '') {
    return <StorefrontMessage title="Loja não encontrada" description="Confira o link com quem o enviou." />;
  }

  const online = data?.checkout.online === true;
  const delivery = data && online ? deliveryPreview(data.checkout) : undefined;
  const total = cart.total + (delivery?.fee ?? 0);
  const hasItems = cart.lines.length > 0;
  const goToCheckout = () => {
    if (basePath) navigate(`${basePath}/checkout`);
  };

  const imageUrlOf = (productId: string) => {
    const cover = productsById.get(productId)?.imagens[0];
    return store && cover ? getPublicProductImageUrl(store.id, cover.nomeArquivo) : null;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <StorefrontTopBar store={store} basePath={basePath} />

      <main className="mx-auto max-w-5xl px-4 pb-10 pt-5">
        {basePath && (
          <Link to={basePath} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
            <ArrowLeft size={16} /> Continuar comprando
          </Link>
        )}
        <h1 className="mt-3 text-xl font-bold text-slate-900">
          Sacola
          {cart.count > 0 && (
            <span className="text-base font-medium text-slate-500">
              {' '}
              ({cart.count} {cart.count === 1 ? 'item' : 'itens'})
            </span>
          )}
        </h1>

        {storefrontQuery.isLoading && (
          <div className="mt-4 flex flex-col gap-3">
            {[0, 1].map((position) => (
              <div key={position} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <span className="h-20 w-20 animate-pulse rounded-xl bg-slate-100" />
                <span className="h-4 w-1/2 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        )}

        {data && !hasItems && (
          <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center">
            <ShoppingBag size={36} className="text-slate-300" />
            <p className="text-base font-semibold text-slate-700">Sua sacola está vazia</p>
            <p className="text-sm text-slate-500">Escolha os produtos na vitrine e eles aparecem aqui.</p>
            {basePath && (
              <Link to={basePath} className="mt-2 flex h-11 items-center rounded-full bg-brand-600 px-6 text-sm font-semibold text-white transition hover:bg-brand-700">
                Ver produtos
              </Link>
            )}
          </div>
        )}

        {data && store && basePath && hasItems && (
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
            <ul className="flex flex-col gap-3">
              {cart.lines.map((line) => (
                <CartItemCard
                  key={line.product.id}
                  line={line}
                  product={productsById.get(line.product.id)}
                  imageUrl={imageUrlOf(line.product.id)}
                  productPath={`${basePath}?produto=${line.product.id}`}
                  onSetQuantity={(quantity) => cart.setQuantity(line.product.id, quantity)}
                  onRemove={() => cart.remove(line.product.id)}
                />
              ))}
            </ul>

            <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-4">
              <h2 className="mb-3 text-base font-semibold text-slate-900">Resumo da compra</h2>
              <PriceSummary itemCount={cart.count} subtotal={cart.total} savings={cart.savings} delivery={delivery} total={total} />
              {online ? (
                <div className="mt-4 hidden flex-col gap-2 lg:flex">
                  <button
                    type="button"
                    onClick={goToCheckout}
                    className="flex h-12 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white transition hover:bg-brand-700"
                  >
                    Continuar para o pagamento
                  </button>
                  <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                    <Lock size={12} /> Pix ou cartão, pelo Mercado Pago
                  </p>
                </div>
              ) : store.whatsapp ? (
                <div className="mt-4 border-t border-slate-100 pt-3">
                  <WhatsappOrderForm store={store} whatsapp={store.whatsapp} lines={cart.lines} total={cart.total} onClear={cart.clear} />
                </div>
              ) : (
                <p className="mt-4 rounded-xl bg-slate-100 px-3 py-2 text-center text-sm text-slate-600">
                  Esta loja não recebe pedidos pela vitrine no momento.
                </p>
              )}
            </aside>
          </div>
        )}
      </main>

      <StorefrontFooter className={online && hasItems ? 'pb-28 lg:pb-8' : 'pb-8'} />

      {online && hasItems && (
        <div
          className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white px-4 pt-3 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] lg:hidden"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500">Total</p>
              <p className="text-lg font-bold tabular-nums text-slate-900">{formatCurrency(total)}</p>
            </div>
            <button
              type="button"
              onClick={goToCheckout}
              className="h-12 flex-none rounded-full bg-brand-600 px-6 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Continuar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
