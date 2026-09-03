import { motion, useReducedMotion } from 'framer-motion';
import { HeroLogoDecor } from './HeroLogoDecor';
import homeHeroBg from '../../../../icons/home-hero-bg.png';

interface SitePageHeroProps {
  label: string;
  title: string;
  description?: string;
  tone?: 'dark' | 'light';
}

const heroItem = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export function SitePageHero({ label, title, description, tone = 'dark' }: SitePageHeroProps) {
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion ? undefined : heroItem;

  if (tone === 'light') {
    return (
      <section id="conteudo-principal" className="relative isolate overflow-hidden bg-[#f8fbfb]">
        <div className="pointer-events-none absolute inset-0 select-none overflow-hidden" aria-hidden="true">
          <div className="absolute inset-0 hidden lg:block">
            <div
              className="absolute inset-0 bg-cover bg-[center_right] opacity-95"
              style={{
                backgroundImage: `url(${homeHeroBg})`,
                filter: 'brightness(1.02) saturate(1.1) contrast(1.04)',
              }}
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,#f8fbfb_0%,#f8fbfb_30%,rgba(248,251,251,0.85)_42%,rgba(248,251,251,0.55)_54%,rgba(248,251,251,0.25)_64%,transparent_76%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,251,251,0.4)_0%,transparent_18%,transparent_82%,rgba(248,251,251,0.3)_100%)]" />
          </div>
        </div>
        <div className="relative mx-auto max-w-[1800px] px-5 pb-16 pt-20 sm:px-8 xl:px-10 xl:pt-24">
          <motion.p
            initial="hidden"
            animate="visible"
            variants={variants}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-700"
          >
            {label}
          </motion.p>
          <motion.h1
            initial="hidden"
            animate="visible"
            variants={variants}
            transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 max-w-[820px] text-[clamp(38px,3.4vw,62px)] font-light leading-[1.08] tracking-[0.02em] text-slate-950 text-balance"
          >
            {title}
          </motion.h1>
          {description && (
            <motion.p
              initial="hidden"
              animate="visible"
              variants={variants}
              transition={{ duration: 0.6, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="mt-6 max-w-[680px] text-[clamp(16px,1.1vw,18px)] font-light leading-[1.75] text-slate-600"
            >
              {description}
            </motion.p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section id="conteudo-principal" className="relative isolate overflow-hidden border-b border-[rgba(14,196,216,0.10)] bg-[#040E12]">
      <HeroLogoDecor />
      <div className="relative mx-auto max-w-[1800px] px-5 pb-14 pt-20 sm:px-8 xl:px-10 xl:pt-24">
        <motion.p
          initial="hidden"
          animate="visible"
          variants={variants}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-[11px] uppercase tracking-[0.38em] text-site-textMuted"
        >
          {label}
        </motion.p>
        <motion.h1
          initial="hidden"
          animate="visible"
          variants={variants}
          transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 text-[clamp(38px,3.6vw,64px)] font-light leading-[1.12] tracking-[0.02em] text-site-text text-balance"
          style={{ textShadow: '0 0 28px rgba(14,196,216,0.18)' }}
        >
          {title}
        </motion.h1>
        {description && (
          <motion.p
            initial="hidden"
            animate="visible"
            variants={variants}
            transition={{ duration: 0.6, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 max-w-[640px] text-[clamp(16px,1.1vw,18px)] font-light leading-[1.72] text-site-textSub"
          >
            {description}
          </motion.p>
        )}
      </div>
    </section>
  );
}
