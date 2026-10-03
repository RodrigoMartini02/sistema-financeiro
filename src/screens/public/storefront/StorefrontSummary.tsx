import type { ReactNode } from 'react';
import { ShoppingBag } from 'lucide-react';
import { formatCurrency } from '../../finance/formatters';

function SummaryRow({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm text-slate-600">
      <span>{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Valores da compra, iguais na sacola, no checkout e no pedido: produtos pelo
 * preço final, entrega, total e quanto o cliente economiza nos descontos.
 */
export function PriceSummary({ itemCount, subtotal, savings, delivery, total }: {
  itemCount: number;
  subtotal: number;
  savings: number;
  /**
   * Taxa nula: forma ainda a escolher; zero aparece como grátis. Sem a linha
   * (pedido pelo WhatsApp), a entrega é combinada na conversa.
   */
  delivery?: { label: string; fee: number | null };
  total: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <SummaryRow label={`Produtos (${itemCount})`} value={formatCurrency(subtotal)} />
      {delivery && (
        <SummaryRow
          label={delivery.label}
          value={delivery.fee === null
            ? <span className="text-slate-400">a escolher</span>
            : delivery.fee === 0 ? <span className="font-semibold text-emerald-600">Grátis</span> : formatCurrency(delivery.fee)}
        />
      )}
      <div className="my-1 border-t border-slate-100" />
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-base font-semibold text-slate-900">Total</span>
        <span className="text-xl font-bold tabular-nums text-slate-900">{formatCurrency(total)}</span>
      </div>
      {savings > 0 && (
        <p className="rounded-lg bg-emerald-50 px-3 py-1.5 text-center text-xs font-semibold text-emerald-700">
          Você economiza {formatCurrency(savings)}
        </p>
      )}
    </div>
  );
}

/** Foto do produto na sacola, no checkout e no pedido; sem foto, o ícone. */
export function ProductThumb({ imageUrl, size }: { imageUrl: string | null; size: 'large' | 'small' }) {
  const box = size === 'large' ? 'h-20 w-20 sm:h-24 sm:w-24' : 'h-12 w-12';
  return (
    <span className={`${box} flex-none overflow-hidden rounded-xl border border-slate-100 bg-slate-100`}>
      {imageUrl
        ? <img src={imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        : <span className="flex h-full w-full items-center justify-center text-slate-300"><ShoppingBag size={size === 'large' ? 24 : 16} /></span>}
    </span>
  );
}
