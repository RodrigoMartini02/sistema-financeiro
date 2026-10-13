import { useEffect, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { SITE_MEDIA } from './siteMedia';
import { SITE_CONTAINER } from './siteStyles';

// Vídeo só em telas de 768 px ou mais: no celular fica a imagem, para economizar dados.
const WIDE_SCREEN_QUERY = '(min-width: 768px)';

function useWideScreen(): boolean {
  const [isWide, setIsWide] = useState(() => window.matchMedia(WIDE_SCREEN_QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(WIDE_SCREEN_QUERY);
    const update = () => setIsWide(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return isWide;
}

const ENTRANCE = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

interface HeroVideoProps {
  title: string;
  description: string;
  /** Botões abaixo do texto (estilos ON_DARK_*). */
  children: ReactNode;
}

/**
 * Topo da Início em tela cheia: o vídeo em loop ao fundo, sem som, e a frase em
 * branco sobre um degradê escuro. No celular e para quem pede "reduzir
 * movimento", a imagem de capa.
 */
export function HeroVideo({ title, description, children }: HeroVideoProps) {
  const prefersReducedMotion = useReducedMotion();
  const isWideScreen = useWideScreen();
  const showVideo = isWideScreen && !prefersReducedMotion;
  const variants = prefersReducedMotion ? undefined : ENTRANCE;

  return (
    <section className="relative isolate overflow-hidden bg-[#06232c]">
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        {showVideo ? (
          <video
            className="h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster={SITE_MEDIA.heroPoster}
          >
            <source src={SITE_MEDIA.heroVideo} type="video/mp4" />
          </video>
        ) : (
          <img src={SITE_MEDIA.heroPoster} alt="" className="h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,22,29,0.9)_0%,rgba(4,22,29,0.7)_45%,rgba(4,22,29,0.3)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(4,22,29,0.65)_0%,transparent_45%)]" />
      </div>

      <div className={`${SITE_CONTAINER} flex min-h-[560px] flex-col justify-end pb-16 pt-24 sm:min-h-[640px] sm:pb-20 lg:min-h-[700px]`}>
        <motion.h1
          initial="hidden"
          animate="visible"
          variants={variants}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-[880px] text-[clamp(40px,6vw,84px)] font-light leading-[1.02] tracking-[-0.03em] text-white text-balance"
        >
          {title}
        </motion.h1>
        <motion.p
          initial="hidden"
          animate="visible"
          variants={variants}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 max-w-[620px] text-[18px] leading-[1.7] text-white/80"
        >
          {description}
        </motion.p>
        <motion.div
          initial="hidden"
          animate="visible"
          variants={variants}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-9 flex flex-wrap gap-3"
        >
          {children}
        </motion.div>
      </div>
    </section>
  );
}
