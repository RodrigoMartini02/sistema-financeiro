import type { ReactNode } from 'react';

type InfoBannerVariant = 'info' | 'warn' | 'success';

interface InfoBannerProps {
  variant?: InfoBannerVariant;
  children: ReactNode;
}

const VARIANT_STYLES: Record<InfoBannerVariant, string> = {
  info: 'border-brand-100 bg-brand-50 text-brand-800',
  warn: 'border-amber-100 bg-amber-50 text-amber-800',
  success: 'border-emerald-100 bg-emerald-50 text-emerald-800',
};

export function InfoBanner({ variant = 'info', children }: InfoBannerProps) {
  return (
    <div className={['rounded-xl border px-4 py-2.5 text-sm', VARIANT_STYLES[variant]].join(' ')}>
      {children}
    </div>
  );
}
