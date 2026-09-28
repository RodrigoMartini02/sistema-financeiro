import type { PainelData } from '../../../types/finance';
import { CardPainel, Legenda, Secao, Vazio } from './base';
import { useCoresGrafico } from './coresGrafico';
import { BarrasHorizontais, type LinhaHorizontal } from './graficos/BarrasHorizontais';

type ItemPlanejado = NonNullable<PainelData['planejado']>[number];

const paraLinha = (item: ItemPlanejado): LinhaHorizontal => ({
  id: String(item.categoriaId),
  nome: item.categoria,
  valor: item.gasto,
  meta: item.meta,
});

/** Metas por categoria; as subcategorias com meta abrem sob a categoria principal. */
export function Planejado({ itens }: { itens: NonNullable<PainelData['planejado']> }) {
  const cores = useCoresGrafico();
  const ids = new Set(itens.map((item) => item.categoriaId));
  const ehRaiz = (item: ItemPlanejado) => item.parentId === null || !ids.has(item.parentId);
  const linhas = itens
    .filter(ehRaiz)
    .map((raiz) => ({
      ...paraLinha(raiz),
      subs: itens.filter((item) => item.parentId === raiz.categoriaId).sort((a, b) => b.gasto - a.gasto).map(paraLinha),
    }))
    .sort((a, b) => b.valor - a.valor);

  return (
    <Secao titulo="Estou dentro do planejado?">
      <CardPainel>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <h3 className="m-0 text-sm font-medium text-slate-900 dark:text-white">Metas por categoria</h3>
          <Legenda itens={[
            { cor: cores.destaque, nome: 'Dentro da meta' },
            { cor: cores.negativo, nome: 'Acima da meta' },
          ]} />
        </div>
        {linhas.length === 0
          ? <Vazio>Nenhuma meta cadastrada. Defina metas no Planejamento.</Vazio>
          : <BarrasHorizontais linhas={linhas} modo="meta" />}
      </CardPainel>
    </Secao>
  );
}
