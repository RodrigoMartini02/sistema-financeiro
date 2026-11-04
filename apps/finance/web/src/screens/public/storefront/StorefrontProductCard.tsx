import { useEffect, useState } from 'react';
import { Check, Plus, ShoppingBag } from 'lucide-react';
import type { PublicProduct } from '../../../services/storefrontService';
import { formatCurrency } from '../../finance/formatters';

const ADDED_FEEDBACK_MS = 1200;

/** Selo de desconto e preço riscado, iguais no card e no detalhe. */
export function StorefrontPrice({ product, large = false }: { product: PublicProduct; large?: boolean }) {
  const hasDiscount = product.valorFinal < product.valor;
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      {hasDiscount && (
        <span className={`${large ? 'text-sm' : 'text-xs'} text-slate-400 line-through`}>{formatCurrency(product.valor)}</span>
      )}
      <span className={`${large ? 'text-2xl' : 'text-base'} font-bold text-slate-900`}>{formatCurrency(product.valorFinal)}</span>
    </div>
  );
}

export function StorefrontProductCard({ product, imageUrl, canBuy, onOpen, onAdd }: {
  product: PublicProduct;
  imageUrl: string | null;
  /** Sem compra pela vitrine nem WhatsApp, a vitrine é só catálogo. */
  canBuy: boolean;
  onOpen: () => void;
  onAdd: () => void;
}) {
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    if (!justAdded) return;
    const timer = setTimeout(() => setJustAdded(false), ADDED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [justAdded]);

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ver ${product.nome}`}
        className="relative block aspect-square w-full bg-slate-100"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={product.nome}
            loading="lazy"
            className={`h-full w-full object-cover ${product.esgotado ? 'grayscale' : ''}`}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-slate-300">
            <ShoppingBag size={32} />
          </span>
        )}
        {product.descontoPercentual !== null && !product.esgotado && (
          <span className="absolute left-2 top-2 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">
            -{product.descontoPercentual}%
          </span>
        )}
        {product.esgotado && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/50">
            <span className="rounded-full bg-slate-900/80 px-3 py-1 text-xs font-semibold text-white">Esgotado</span>
          </span>
        )}
      </button>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <button type="button" onClick={onOpen} className="text-left">
          <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{product.nome}</h3>
        </button>
        <StorefrontPrice product={product} />
        {canBuy && !product.esgotado && (
          <button
            type="button"
            onClick={() => {
              onAdd();
              setJustAdded(true);
            }}
            className="mt-auto flex h-9 items-center justify-center gap-1.5 rounded-full bg-brand-600 text-xs font-semibold text-white transition hover:bg-brand-700"
          >
            {justAdded ? <><Check size={14} /> Adicionado</> : <><Plus size={14} /> Adicionar</>}
          </button>
        )}
      </div>
    </article>
  );
}
