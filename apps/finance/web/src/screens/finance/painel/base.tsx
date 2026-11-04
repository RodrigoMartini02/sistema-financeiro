import type { ReactNode } from 'react';
import { motion, type Variants } from 'framer-motion';
import { useTransicao } from './graficoBase';

// Os gráficos usam useTransicao, Legenda e Vazio sem passar por aqui (graficoBase.tsx não importa o framer-motion);
// os três continuam saindo deste módulo para as telas do Painel.
export { Legenda, useTransicao, Vazio } from './graficoBase';

// ---------------------------------------------------------------------------
// Animação
// ---------------------------------------------------------------------------

/** Container do painel: os cards entram em sequência na primeira carga. */
export const ENTRADA_PAINEL: Variants = {
  oculto: {},
  visivel: { transition: { staggerChildren: 0.045 } },
};

const ENTRADA_CARD: Variants = {
  oculto: { opacity: 0.35, y: 10 },
  visivel: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.2, 0.7, 0.2, 1] } },
};

/** Número que conta até o valor novo. */
export function NumeroAnimado({ valor, formatar }: { valor: number; formatar: (valor: number) => string }) {
  const { de, p } = useTransicao(valor, String(valor));
  const atual = (de ?? 0) + (valor - (de ?? 0)) * p;
  return <>{formatar(atual)}</>;
}

// ---------------------------------------------------------------------------
// Estrutura
// ---------------------------------------------------------------------------

export function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="grid gap-3.5">
      <h2 className="m-0 text-[17px] font-medium text-slate-900 [text-wrap:balance] dark:text-white">{titulo}</h2>
      {children}
    </section>
  );
}

/** Card do painel: entra com o painel, sobe um pouco no hover. */
export function CardPainel({ children, className = '', escuro = false }: { children: ReactNode; className?: string; escuro?: boolean }) {
  const cor = escuro
    ? 'border-[#0D2E3C] bg-[#0D2E3C] text-white dark:border-[#0f3a4b] dark:bg-[#0f3a4b]'
    : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800';
  return (
    <motion.article
      variants={ENTRADA_CARD}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.25 }}
      className={`flex min-w-0 flex-col gap-3 rounded-[14px] border px-[18px] py-4 shadow-sm transition-shadow hover:shadow-[0_14px_30px_-14px_rgba(13,46,60,0.28)] ${cor} ${className}`}
    >
      {children}
    </motion.article>
  );
}

/** Título à esquerda e valor principal à direita, na mesma linha. */
export function CabecalhoCard({ titulo, valor, tomValor = 'text-slate-900 dark:text-white' }: { titulo: ReactNode; valor?: ReactNode; tomValor?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h3 className="m-0 text-sm font-medium text-slate-900 dark:text-white">{titulo}</h3>
      {valor !== undefined && <span className={`whitespace-nowrap text-lg font-medium tabular-nums ${tomValor}`}>{valor}</span>}
    </div>
  );
}

/** Rótulo pequeno em caixa alta (cards do topo, totais). */
export function Rotulo({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`text-[11.5px] font-medium uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400 ${className}`}>{children}</span>;
}

/** Card de indicador: rótulo, valor em destaque e uma nota (Painel e Relatórios). */
export function Indicador({ rotulo, valor, nota, tom = 'text-slate-900 dark:text-white' }: { rotulo: string; valor: ReactNode; nota: ReactNode; tom?: string }) {
  return (
    <CardPainel className="gap-2.5">
      <Rotulo>{rotulo}</Rotulo>
      <span className={`text-[22px] font-medium tabular-nums tracking-tight ${tom}`}>{valor}</span>
      <span className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-slate-500 dark:text-slate-400">{nota}</span>
    </CardPainel>
  );
}

/** Totais em linha (rótulo pequeno em cima, valor embaixo). */
export function Totais({ itens }: { itens: { rotulo: string; valor: ReactNode; tom?: string }[] }) {
  return (
    <dl className="m-0 flex flex-wrap gap-x-7 gap-y-2.5">
      {itens.map((item) => (
        <div key={item.rotulo} className="grid gap-0.5">
          <dt><Rotulo>{item.rotulo}</Rotulo></dt>
          <dd className={`m-0 text-base font-medium tabular-nums ${item.tom ?? 'text-slate-900 dark:text-white'}`}>{item.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------------------------------------------------------------------------
// Carregando
// ---------------------------------------------------------------------------

function Bloco({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[14px] bg-slate-200/70 motion-reduce:animate-none dark:bg-slate-700/60 ${className}`} />;
}

/** Contorno dos cards enquanto o painel carrega pela primeira vez. */
export function EsqueletoPainel() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Carregando o painel">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Bloco className="h-[250px] bg-[#0D2E3C]/30" />
        <div className="grid grid-cols-2 gap-4">
          <Bloco className="h-[117px]" /><Bloco className="h-[117px]" /><Bloco className="h-[117px]" /><Bloco className="h-[117px]" />
        </div>
      </div>
      <Bloco className="h-[280px]" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco className="h-[420px]" />
        <div className="grid grid-cols-2 gap-4"><Bloco className="h-[202px]" /><Bloco className="h-[202px]" /><Bloco className="col-span-2 h-[202px]" /></div>
      </div>
    </div>
  );
}
