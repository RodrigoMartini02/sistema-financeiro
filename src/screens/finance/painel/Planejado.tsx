import { AlertTriangle } from 'lucide-react';
import { Badge } from '../../../ui/badge';
import type { PainelData } from '../../../types/finance';
import { formatCurrency } from '../formatters';
import { CabecalhoCard, CardPainel, Secao, Vazio } from './PainelLayout';

// Mesmos limites do Planejamento: a partir de 80% da meta pede atenção; acima de 100%, estourou.
const FAIXA_ATENCAO = 0.8;

function Situacao({ proporcao }: { proporcao: number }) {
  if (proporcao > 1) {
    return <Badge tone="expense"><AlertTriangle size={11} className="mr-1" aria-hidden="true" />acima da meta</Badge>;
  }
  if (proporcao >= FAIXA_ATENCAO) {
    return <Badge tone="warning">atenção</Badge>;
  }
  return null;
}

export function Planejado({ itens }: { itens: NonNullable<PainelData['planejado']> }) {
  const estouradas = itens.filter((item) => item.meta > 0 && item.gasto > item.meta).length;

  return (
    <Secao titulo="Estou dentro do planejado?">
      <CardPainel>
        <CabecalhoCard
          titulo="Metas por categoria"
          detalhe={`${estouradas > 0 ? `${estouradas} acima da meta · ` : ''}meta proporcional ao período`}
        />
        {itens.length === 0 ? (
          <Vazio>Nenhuma meta cadastrada. Defina metas no Planejamento.</Vazio>
        ) : (
          <ul className="m-0 grid list-none gap-x-6 gap-y-4 p-0 md:grid-cols-2">
            {itens.map((item) => {
              const proporcao = item.meta > 0 ? item.gasto / item.meta : 0;
              const corBarra = proporcao > 1 ? 'bg-rose-500' : proporcao >= FAIXA_ATENCAO ? 'bg-amber-500' : 'bg-emerald-600';
              return (
                <li key={item.categoriaId} className="flex flex-col gap-1.5">
                  <span className="flex flex-wrap items-center gap-2 text-[12.5px]">
                    <span className="font-medium text-slate-900 dark:text-white">{item.categoria}</span>
                    <Situacao proporcao={proporcao} />
                    <span className="ml-auto tabular-nums text-slate-500 dark:text-slate-400">
                      <b className="font-semibold text-slate-900 dark:text-white">{formatCurrency(item.gasto)}</b> de {formatCurrency(item.meta)}
                    </span>
                  </span>
                  <span className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700" aria-hidden="true">
                    <span className={`block h-1.5 rounded-full ${corBarra}`} style={{ width: `${Math.min(100, proporcao * 100)}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardPainel>
    </Secao>
  );
}
