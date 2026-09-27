import { Card } from '../../../ui/card';
import type { PainelData } from '../../../types/finance';
import { formatCurrency } from '../formatters';
import { CabecalhoCard, Secao, Vazio } from './PainelLayout';

// Mesmos limites do Planejamento: a partir de 80% da meta pede atenção; acima de 100%, estourou.
const FAIXA_ATENCAO = 0.8;

interface PlanejadoProps {
  itens: NonNullable<PainelData['planejado']>;
}

export function Planejado({ itens }: PlanejadoProps) {
  const estouradas = itens.filter((item) => item.meta > 0 && item.gasto > item.meta).length;

  return (
    <Secao titulo="Estou dentro do planejado?">
      <Card className="flex flex-col gap-4 rounded-2xl p-[18px_22px]">
        <CabecalhoCard
          titulo="Metas por categoria"
          detalhe={estouradas > 0 ? `${estouradas} acima da meta` : 'meta proporcional ao período'}
        />
        {itens.length === 0 ? (
          <Vazio>Nenhuma meta cadastrada. Defina metas no Planejamento.</Vazio>
        ) : (
          <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
            {itens.map((item) => {
              const proporcao = item.meta > 0 ? item.gasto / item.meta : 0;
              const cor = proporcao > 1 ? '#ef4444' : proporcao >= FAIXA_ATENCAO ? '#f59e0b' : '#10b981';
              return (
                <li key={item.categoriaId} className="flex flex-col gap-1.5">
                  <span className="flex items-baseline justify-between gap-2 text-[12px]">
                    <span className="truncate font-semibold text-[#0f2b38] dark:text-slate-100">{item.categoria}</span>
                    <span className="shrink-0 tabular-nums text-[#5f7885] dark:text-slate-400">
                      <b className="text-[#0f2b38] dark:text-white">{formatCurrency(item.gasto)}</b> de {formatCurrency(item.meta)}
                    </span>
                  </span>
                  <span className="h-2 rounded bg-[#eef4f7] dark:bg-slate-700" aria-hidden="true">
                    <span className="block h-2 rounded" style={{ width: `${Math.min(100, proporcao * 100)}%`, background: cor }} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </Secao>
  );
}
