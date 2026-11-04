import { motion, useReducedMotion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}

const baseVariants = (y: number): Variants => ({
  hidden: { opacity: 0, y },
  visible: { opacity: 1, y: 0 },
});

export function ScrollReveal({ children, className, delay = 0, y = 24 }: ScrollRevealProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={prefersReducedMotion ? undefined : baseVariants(y)}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
