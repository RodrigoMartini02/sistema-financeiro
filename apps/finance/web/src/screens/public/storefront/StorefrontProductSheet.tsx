import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Minus, Plus, Share2, ShoppingBag } from 'lucide-react';
import type { PublicProduct } from '../../../services/storefrontService';
import { MAX_ITEM_QUANTITY } from '../../../utils/storefrontCart';
import { StorefrontSheet } from './StorefrontSheet';
import { StorefrontPrice } from './StorefrontProductCard';
import { shareLink } from './shareLink';

/** Fotos que deslizam (com encaixe), pontos de posição e setas no computador. */
function ProductGallery({ name, imageUrls }: { name: string; imageUrls: string[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  if (imageUrls.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center bg-slate-100 text-slate-300">
        <ShoppingBag size={48} />
      </div>
    );
  }

  const scrollTo = (target: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: target * track.clientWidth, behavior: 'smooth' });
  };

  return (
    <div className="relative">
      <div
        ref={trackRef}
        className="flex aspect-square w-full snap-x snap-mandatory overflow-x-auto bg-slate-100 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(event) => {
          const track = event.currentTarget;
          setIndex(Math.round(track.scrollLeft / Math.max(1, track.clientWidth)));
        }}
      >
        {imageUrls.map((url, position) => (
          <img
            key={url}
            src={url}
            alt={`${name} — foto ${position + 1}`}
            className="h-full w-full flex-none snap-center object-cover"
            loading={position === 0 ? 'eager' : 'lazy'}
          />
        ))}
      </div>
      {imageUrls.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Foto anterior"
            onClick={() => scrollTo(Math.max(0, index - 1))}
            className="absolute left-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow sm:flex"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="Próxima foto"
            onClick={() => scrollTo(Math.min(imageUrls.length - 1, index + 1))}
            className="absolute right-2 top-1/2 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow sm:flex"
          >
            <ChevronRight size={18} />
          </button>
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
            {imageUrls.map((url, position) => (
              <button
                key={url}
                type="button"
                aria-label={`Ver foto ${position + 1}`}
                onClick={() => scrollTo(position)}
                className={`h-2 rounded-full transition-all ${position === index ? 'w-5 bg-white' : 'w-2 bg-white/60'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function StorefrontProductSheet({ product, imageUrls, canBuy, shareUrl, onClose, onAdd }: {
  product: PublicProduct;
  imageUrls: string[];
  canBuy: boolean;
  /** Link direto deste produto na vitrine. */
  shareUrl: string;
  onClose: () => void;
  onAdd: (quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [shareFeedback, setShareFeedback] = useState('');

  const handleShare = async () => {
    const result = await shareLink({ title: product.nome, url: shareUrl });
    if (result === 'copied') {
      setShareFeedback('Link copiado');
      setTimeout(() => setShareFeedback(''), 2000);
    }
  };

  const footer = canBuy && !product.esgotado ? (
    <div className="flex items-center gap-3">
      <div className="flex h-11 items-center rounded-full border border-slate-200">
        <button
          type="button"
          aria-label="Diminuir quantidade"
          onClick={() => setQuantity((current) => Math.max(1, current - 1))}
          className="flex h-11 w-11 items-center justify-center text-slate-600"
        >
          <Minus size={16} />
        </button>
        <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">{quantity}</span>
        <button
          type="button"
          aria-label="Aumentar quantidade"
          onClick={() => setQuantity((current) => Math.min(MAX_ITEM_QUANTITY, current + 1))}
          className="flex h-11 w-11 items-center justify-center text-slate-600"
        >
          <Plus size={16} />
        </button>
      </div>
      <button
        type="button"
        onClick={() => onAdd(quantity)}
        className="flex h-11 flex-1 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white transition hover:bg-brand-700"
      >
        Adicionar à sacola
      </button>
    </div>
  ) : undefined;

  return (
    <StorefrontSheet open title={product.nome} onClose={onClose} footer={footer}>
      <ProductGallery name={product.nome} imageUrls={imageUrls} />
      <div className="flex flex-col gap-3 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            {product.categoria && <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{product.categoria}</span>}
            <h3 className="text-lg font-semibold text-slate-900">{product.nome}</h3>
          </div>
          <button
            type="button"
            onClick={() => void handleShare()}
            className="flex h-9 flex-none items-center gap-1.5 rounded-full border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            <Share2 size={14} /> {shareFeedback || 'Compartilhar'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StorefrontPrice product={product} large />
          {product.descontoPercentual !== null && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">-{product.descontoPercentual}%</span>
          )}
        </div>
        {product.esgotado && (
          <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600">Esgotado no momento.</p>
        )}
        {product.descricao && <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{product.descricao}</p>}
      </div>
    </StorefrontSheet>
  );
}
