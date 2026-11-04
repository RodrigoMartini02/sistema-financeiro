import { useEffect, useRef, useState, type ReactNode } from 'react';

// O que os gráficos do Painel precisam e não depende da biblioteca de animação: a transição de valores, a legenda e o
// aviso de vazio. Fica separado de base.tsx (que importa o framer-motion) para os gráficos, usados também no app de
// Licitações, não levarem a biblioteca junto. base.tsx reexporta estes três.

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** O sistema pede para reduzir movimento (acompanha a mudança da preferência). */
function usePrefersReducedMotion(): boolean {
  const [reduzir, setReduzir] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const consulta = window.matchMedia('(prefers-reduced-motion: reduce)');
    const atualizar = () => setReduzir(consulta.matches);
    consulta.addEventListener('change', atualizar);
    return () => consulta.removeEventListener('change', atualizar);
  }, []);
  return reduzir;
}

/**
 * Transição de valores: a cada `chave` nova, `p` vai de 0 a 1 e `de` guarda o
 * valor anterior (null na primeira vez, quando o gráfico nasce do zero). Com
 * "reduzir movimento" ligado, `p` já nasce em 1.
 */
export function useTransicao<T>(alvo: T, chave: string, duracao = 700): { de: T | null; p: number } {
  const reduzir = usePrefersReducedMotion();
  const ultimo = useRef<T | null>(null);
  const [estado, setEstado] = useState<{ de: T | null; p: number }>({ de: null, p: reduzir ? 1 : 0 });

  useEffect(() => {
    const de = ultimo.current;
    ultimo.current = alvo;
    if (reduzir) {
      setEstado({ de, p: 1 });
      return undefined;
    }
    let quadro = 0;
    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / duracao);
      setEstado({ de, p: easeOut(t) });
      if (t < 1) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
    // `alvo` acompanha a `chave`; reagir só à chave evita reiniciar a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, reduzir, duracao]);

  return estado;
}

export function Legenda({ itens }: { itens: { cor: string; nome: string; padrao?: boolean }[] }) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-3.5 gap-y-1 p-0 text-[11.5px] text-slate-600 dark:text-slate-300">
      {itens.map((item) => (
        <li key={item.nome} className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 shrink-0 rounded-sm"
            style={item.padrao
              ? { background: `repeating-linear-gradient(45deg, ${item.cor} 0 1.5px, transparent 1.5px 3px)`, border: `1px solid ${item.cor}` }
              : { background: item.cor }}
            aria-hidden="true"
          />
          {item.nome}
        </li>
      ))}
    </ul>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="m-0 my-auto py-7 text-center text-[13px] text-slate-500 dark:text-slate-400">{children}</p>;
}
