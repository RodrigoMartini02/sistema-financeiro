import { DonutChart } from '../charts/DonutChart';
import { formatCurrency } from '../formatters';
import { fatiasComOutras, useCoresGrafico } from './coresGrafico';
import { CabecalhoCard, CardPainel, Vazio } from './PainelLayout';

export interface FatiaPizza {
  nome: string;
  valor: number;
  /** Linhas extras do detalhe no hover/toque. */
  detalhes?: string[];
  /** Cor fixa (ex.: a da pessoa); sem ela, a fatia usa a paleta por posição. */
  cor?: string;
}

const NOME_OUTRAS = 'Outras';

/**
 * Pizza padrão do painel: só o título, o total no centro, a legenda com os
 * nomes e o detalhe no hover/toque. Acima de 4 fatias, as menores viram
 * "Outras", que mostra no detalhe quem ela agrupa.
 */
export function PizzaPainel({ titulo, fatias, total, rotuloCentro, textoVazio, className }: {
  titulo: string;
  fatias: FatiaPizza[];
  total: number;
  rotuloCentro: string;
  textoVazio: string;
  className?: string;
}) {
  const cores = useCoresGrafico();
  const comValor = fatias.filter((fatia) => fatia.valor > 0);
  const limite = cores.categorias.length;
  const coresFixas = comValor.length > 0 && comValor.every((fatia) => fatia.cor);

  const dados = coresFixas
    ? comValor.map((fatia) => ({ name: fatia.nome, value: fatia.valor, color: fatia.cor!, detalhes: fatia.detalhes }))
    : (() => {
      const ordenadas = comValor.length > limite ? [...comValor].sort((a, b) => b.valor - a.valor) : comValor;
      const agrupadas = ordenadas.slice(limite - 1);
      return fatiasComOutras(ordenadas, cores).map((fatia) => ({
        name: fatia.nome,
        value: fatia.valor,
        color: fatia.cor,
        detalhes: 'detalhes' in fatia && fatia.detalhes
          ? fatia.detalhes
          : fatia.nome === NOME_OUTRAS && ordenadas.length > limite
            ? agrupadas.map((item) => `${item.nome}: ${formatCurrency(item.valor)}`)
            : undefined,
      }));
    })();

  return (
    <CardPainel className={className}>
      <CabecalhoCard titulo={titulo} />
      {dados.length === 0
        ? <Vazio>{textoVazio}</Vazio>
        : <DonutChart data={dados} centerLabel={rotuloCentro} centerValue={formatCurrency(total)} />}
    </CardPainel>
  );
}
