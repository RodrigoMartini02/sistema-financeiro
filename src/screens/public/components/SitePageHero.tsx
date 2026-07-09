import { HeroLogoDecor } from './HeroLogoDecor';

interface SitePageHeroProps {
  label: string;
  title: string;
  description?: string;
}

export function SitePageHero({ label, title, description }: SitePageHeroProps) {
  return (
    <section className="relative overflow-hidden border-b border-[rgba(14,196,216,0.10)] bg-[#040E12]">
      <HeroLogoDecor />
      <div className="relative mx-auto max-w-[1800px] px-5 pb-14 pt-20 sm:px-8 xl:px-10 xl:pt-24">
        <p className="text-[11px] uppercase tracking-[0.38em] text-site-textMuted">{label}</p>
        <h1
          className="mt-6 text-[clamp(38px,3.6vw,64px)] font-light leading-[1.12] tracking-[0.02em] text-site-text text-balance"
          style={{ textShadow: '0 0 28px rgba(14,196,216,0.18)' }}
        >
          {title}
        </h1>
        {description && (
          <p className="mt-6 max-w-[640px] text-[clamp(16px,1.1vw,18px)] font-light leading-[1.72] text-site-textSub">
            {description}
          </p>
        )}
        <div className="mt-7 h-px w-[240px] bg-gradient-to-r from-site-accent via-[rgba(14,196,216,0.38)] to-transparent shadow-[0_0_18px_rgba(14,196,216,0.34)]" />
      </div>
    </section>
  );
}
