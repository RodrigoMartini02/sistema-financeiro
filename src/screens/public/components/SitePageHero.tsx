import { motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { HeroLogoDecor } from './HeroLogoDecor';
import homeHeroBg from '../../../../icons/home-hero-bg.png';

interface SitePageHeroProps {
  label: string;
  title: string;
  description?: string;
  tone?: 'dark' | 'light';
  scrollHintLabel?: string;
  scrollHintTargetId?: string;
}

const heroItem = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

function ScrollHint({ label, targetId, tone }: { label: string; targetId: string; tone: 'dark' | 'light' }) {
  const prefersReducedMotion = useReducedMotion();

  const handleClick = () => {
    document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.4 }}
      className={[
        'mt-10 flex items-center gap-2 text-[13px] font-semibold outline-none transition',
        tone === 'light' ? 'text-brand-700 hover:text-brand-600' : 'text-site-accent hover:text-site-accent/80',
      ].join(' ')}
    >
      {label}
      <motion.span
        animate={prefersReducedMotion ? undefined : { y: [0, 5, 0] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        className="flex"
      >
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </motion.span>
    </motion.button>
  );
}

export function SitePageHero({ label, title, description, tone = 'dark', scrollHintLabel, scrollHintTargetId }: SitePageHeroProps) {
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion ? undefined : heroItem;

  if (tone === 'light') {
    return (
      <section id="conteudo-principal" className="relative isolate overflow-hidden border-b border-cyan-100 bg-[#eef8f9]">
        <div className="pointer-events-none absolute inset-0 select-none overflow-hidden" aria-hidden="true">
          <div
            className="absolute inset-y-0 right-0 hidden w-[78%] bg-cover bg-[center_right] opacity-[0.52] lg:block"
            style={{
              backgroundImage: `url(${homeHeroBg})`,
              filter: 'brightness(1.05) saturate(1.14) contrast(1.06)',
            }}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#eef8f9_0%,#eef8f9_36%,rgba(238,248,249,0.86)_52%,rgba(238,248,249,0.28)_74%,rgba(238,248,249,0.18)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#eef8f9] to-transparent" />
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
          <motion.div
            initial="hidden"
            animate="visible"
            variants={variants}
            transition={{ duration: 0.6, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="mt-7 h-px w-[240px] bg-brand-600/45"
          />
          {scrollHintLabel && scrollHintTargetId && (
            <ScrollHint label={scrollHintLabel} targetId={scrollHintTargetId} tone="light" />
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
        <motion.div
          initial="hidden"
          animate="visible"
          variants={variants}
          transition={{ duration: 0.6, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
          className="mt-7 h-px w-[240px] bg-gradient-to-r from-site-accent via-[rgba(14,196,216,0.38)] to-transparent shadow-[0_0_18px_rgba(14,196,216,0.34)]"
        />
        {scrollHintLabel && scrollHintTargetId && (
          <ScrollHint label={scrollHintLabel} targetId={scrollHintTargetId} tone="dark" />
        )}
      </div>
    </section>
  );
}
