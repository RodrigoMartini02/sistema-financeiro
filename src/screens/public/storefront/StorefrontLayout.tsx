import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Lock, ShoppingBag, Store } from 'lucide-react';
import { fetchPublicStorefront, type PublicStore } from '../../../services/storefrontService';
import { queryKeys } from '../../../services/queryKeys';

/**
 * Loja, checkout e produtos pelo endereço da vitrine. Cada página da vitrine
 * busca de novo ao abrir (esgotados e separados mudam), mas mostra na hora o
 * que já veio da página anterior.
 */
export function usePublicStorefront(storefront: string) {
  return useQuery({
    queryKey: queryKeys.publicStorefront(storefront),
    queryFn: () => fetchPublicStorefront(storefront),
    enabled: storefront !== '',
    retry: false,
  });
}

export function StorefrontMessage({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-50 px-4 text-center">
      <Store size={36} className="text-slate-300" />
      <p className="text-base font-semibold text-slate-700">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function StoreLogo({ store, size }: { store: PublicStore | undefined; size: 'large' | 'small' }) {
  const box = size === 'large' ? 'h-14 w-14' : 'h-9 w-9';
  return (
    <span className={`flex ${box} flex-none items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-slate-400`}>
      {store?.logo
        ? <img src={store.logo} alt={`Logo de ${store.nome}`} className="h-full w-full object-cover" />
        : <Store size={size === 'large' ? 24 : 16} />}
    </span>
  );
}

/** Sacola com a quantidade de itens, no topo das páginas da vitrine. */
export function CartButton({ to, count }: { to: string; count: number }) {
  const label = count === 0 ? 'Sacola vazia' : `Sacola com ${count} ${count === 1 ? 'item' : 'itens'}`;
  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      className="relative flex h-10 w-10 flex-none items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
    >
      <ShoppingBag size={18} />
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1 text-[11px] font-bold tabular-nums text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

export function SecureCheckoutBadge() {
  return (
    <span className="flex flex-none items-center gap-1.5 text-xs font-semibold text-emerald-700">
      <Lock size={14} /> Compra segura
    </span>
  );
}

/** Topo da sacola, do checkout e do pedido: a loja leva de volta à vitrine. */
export function StorefrontTopBar({ store, basePath, right }: {
  store: PublicStore | undefined;
  basePath: string | null;
  right?: ReactNode;
}) {
  const identity = (
    <>
      <StoreLogo store={store} size="small" />
      {store
        ? <span className="truncate text-base font-bold text-slate-900">{store.nome}</span>
        : <span className="h-5 w-32 animate-pulse rounded bg-slate-200" />}
    </>
  );
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        {basePath
          ? <Link to={basePath} className="flex min-w-0 flex-1 items-center gap-3">{identity}</Link>
          : <div className="flex min-w-0 flex-1 items-center gap-3">{identity}</div>}
        {right}
      </div>
    </header>
  );
}

export function StorefrontFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`pt-2 text-center text-xs text-slate-400 ${className}`}>
      Feito com{' '}
      <a href="https://fin-gerence.com.br" target="_blank" rel="noreferrer" className="font-semibold text-slate-500 hover:text-brand-600">
        FINGERENCE
      </a>
    </footer>
  );
}
