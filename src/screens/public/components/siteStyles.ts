// Classes repetidas no site público, para as páginas falarem a mesma língua visual.

export const SITE_CONTAINER = 'mx-auto w-full max-w-[1240px] px-5 sm:px-8';

export const SITE_SECTION = 'py-16 sm:py-24';

export const SECTION_LABEL = 'text-[12px] font-semibold uppercase tracking-[0.22em] text-brand-700';

export const SECTION_TITLE = 'text-[clamp(28px,3vw,44px)] font-light leading-[1.12] tracking-[-0.01em] text-slate-950 text-balance';

export const SECTION_TEXT = 'text-[16px] leading-[1.75] text-slate-600';

const BUTTON_BASE =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-full border px-6 text-[15px] font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 motion-reduce:transition-none';

export const PRIMARY_BUTTON = `site-neon-light-button ${BUTTON_BASE}`;

export const SECONDARY_BUTTON = `site-neon-light-button-subtle ${BUTTON_BASE}`;

/** Botão claro sobre a faixa escura da chamada final. */
export const ON_DARK_BUTTON = `${BUTTON_BASE} border-white bg-white text-[#08343d] hover:bg-cyan-50 focus-visible:ring-offset-[#08343d]`;

export const ON_DARK_SECONDARY_BUTTON = `${BUTTON_BASE} border-white/40 text-white hover:border-white hover:bg-white/10 focus-visible:ring-offset-[#08343d]`;

export const TEXT_LINK =
  'site-neon-light-text-button inline-flex items-center gap-1.5 rounded-md text-[15px] font-semibold text-brand-700 outline-none focus-visible:ring-2 focus-visible:ring-brand-400';
