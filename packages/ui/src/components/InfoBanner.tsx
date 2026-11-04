import type { ReactNode } from 'react';

type InfoBannerVariant = 'info' | 'warn' | 'success';

interface InfoBannerProps {
  variant?: InfoBannerVariant;
  children: ReactNode;
}

// Os fallbacks das custom properties mantêm o visual atual fora de
// `.config-scope` (onde as variáveis --cfg-* não existem).
const VARIANT_STYLES: Record<InfoBannerVariant, { bg: string; border: string; text: string }> = {
  info: {
    bg: 'var(--cfg-primary-soft, #ecfeff)',
    border: 'var(--cfg-primary-soft, #cffafe)',
    text: 'var(--cfg-primary-dark, #0e7490)',
  },
  warn: {
    bg: 'var(--cfg-warn-bg, #fffbeb)',
    border: 'var(--cfg-warn-border, #fde68a)',
    text: 'var(--cfg-warn-text, #92400e)',
  },
  success: {
    bg: 'var(--cfg-success-bg, #ecfdf5)',
    border: 'var(--cfg-success-bg, #a7f3d0)',
    text: 'var(--cfg-success, #047857)',
  },
};

export function InfoBanner({ variant = 'info', children }: InfoBannerProps) {
  const s = VARIANT_STYLES[variant];
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        borderRadius: 10, border: `1px solid ${s.border}`, background: s.bg,
        padding: '7px 9px', fontSize: 11.5, fontWeight: 500, lineHeight: 1.4, color: s.text,
      }}
    >
      {children}
    </div>
  );
}
