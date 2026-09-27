import type { ReactNode } from 'react';
import { DonutChart } from '../charts/DonutChart';
import { formatCurrency } from '../formatters';
import { fatiasComOutras, useCoresGrafico, type CoresGrafico } from './coresGrafico';
import { CabecalhoCard, CardPainel, RodapeCard, Vazio } from './PainelLayout';
import { formatarPercentual } from './painelFormat';

// Pizzas do painel: com tabela ao lado (forma de pagamento, classificação) e
// simples com frase (à vista × parcelado, tipo de gasto, fixa × variável).

export const paraDonut = (fatias: { nome: string; valor: number; cor: string }[]) =>
  fatias.map((fatia) => ({ name: fatia.nome, value: fatia.valor, color: fatia.cor }));

/** Cor de cada linha da tabela: a mesma da fatia; linhas que caíram em "Outras" usam a cor dela. */
export function corDaLinha(cores: CoresGrafico, indice: number, quantidade: number): string {
  const limite = cores.categorias.length;
  if (quantidade <= limite || indice < limite - 1) return cores.categorias[indice]!;
  return cores.categorias[limite - 1]!;
}

export interface LinhaPizza {
  chave: string | number;
  nome: string;
  valor: number;
}

export interface ColunaPizza<L> {
  titulo: string;
  celula: (linha: L) => ReactNode;
  /** Classe da célula (cor, peso); alinhada à direita como as numéricas. */
  classe?: (linha: L) => string;
}

const CLASSE_CABECALHO = 'pb-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-400';

/** Pizza com tabela ao lado: nome com a cor da fatia, %, valor e colunas extras. */
export function PizzaComTabela<L extends LinhaPizza>({
  titulo, detalhe, className, textoVazio, rotuloCentro, total, tituloPrimeiraColuna, linhas, colunas = [], subitens, rodape,
}: {
  titulo: string;
  detalhe: string;
  className?: string;
  textoVazio: string;
  rotuloCentro: string;
  /** Base do percentual e valor do centro. */
  total: number;
  tituloPrimeiraColuna: string;
  linhas: L[];
  colunas?: ColunaPizza<L>[];
  /** Detalhe da linha em sublinhas (ex.: subcategorias da classificação). */
  subitens?: (linha: L) => Array<{ chave: string | number; nome: string; valor: number }>;
  rodape?: ReactNode;
}) {
  const cores = useCoresGrafico();
  const fatias = fatiasComOutras(linhas.map((linha) => ({ nome: linha.nome, valor: linha.valor })), cores);
  const percentualDe = (valor: number) => (total > 0 ? formatarPercentual((valor / total) * 100) : '—');

  return (
    <CardPainel className={className}>
      <CabecalhoCard titulo={titulo} detalhe={detalhe} />
      {linhas.length === 0 ? (
        <Vazio>{textoVazio}</Vazio>
      ) : (
        <>
          <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
            <DonutChart data={paraDonut(fatias)} centerLabel={rotuloCentro} centerValue={formatCurrency(total)} mostrarLegenda={false} />
            <div className="w-full min-w-0 overflow-x-auto">
              <table className={`w-full border-collapse text-[12.5px] tabular-nums ${colunas.length > 0 ? 'min-w-[360px]' : ''}`}>
                <thead>
                  <tr>
                    <th className={`${CLASSE_CABECALHO} text-left`}>{tituloPrimeiraColuna}</th>
                    <th className={CLASSE_CABECALHO}>%</th>
                    <th className={CLASSE_CABECALHO}>Valor</th>
                    {colunas.map((coluna) => <th key={coluna.titulo} className={CLASSE_CABECALHO}>{coluna.titulo}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((linha, indice) => (
                    <LinhaComSubitens
                      key={linha.chave}
                      linha={linha}
                      cor={corDaLinha(cores, indice, linhas.length)}
                      percentual={percentualDe(linha.valor)}
                      colunas={colunas}
                      subitens={subitens?.(linha) ?? []}
                      percentualDe={percentualDe}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {rodape && <RodapeCard>{rodape}</RodapeCard>}
        </>
      )}
    </CardPainel>
  );
}

function LinhaComSubitens<L extends LinhaPizza>({ linha, cor, percentual, colunas, subitens, percentualDe }: {
  linha: L;
  cor: string;
  percentual: string;
  colunas: ColunaPizza<L>[];
  subitens: Array<{ chave: string | number; nome: string; valor: number }>;
  percentualDe: (valor: number) => string;
}) {
  return (
    <>
      <tr className="border-t border-slate-100 dark:border-slate-700">
        <td className="py-2">
          <span className="inline-flex items-center gap-2 text-slate-900 dark:text-white">
            <span className="h-2 w-2 rounded-full" style={{ background: cor }} />
            {linha.nome}
          </span>
        </td>
        <td className="text-right text-slate-400">{percentual}</td>
        <td className="text-right font-semibold text-slate-900 dark:text-white">{formatCurrency(linha.valor)}</td>
        {colunas.map((coluna) => (
          <td key={coluna.titulo} className={`text-right ${coluna.classe?.(linha) ?? 'text-slate-600 dark:text-slate-300'}`}>
            {coluna.celula(linha)}
          </td>
        ))}
      </tr>
      {subitens.map((sub) => (
        <tr key={sub.chave} className="text-[11.5px]">
          <td className="py-1 pl-4 text-slate-500 dark:text-slate-400">{sub.nome}</td>
          <td className="text-right text-slate-400">{percentualDe(sub.valor)}</td>
          <td className="text-right text-slate-600 dark:text-slate-300">{formatCurrency(sub.valor)}</td>
          {colunas.map((coluna) => <td key={coluna.titulo} />)}
        </tr>
      ))}
    </>
  );
}

/** Pizza simples: as fatias com valor, o total no centro e uma frase de leitura. */
export function PizzaSimples({ titulo, detalhe, fatias, total, rotuloCentro, textoVazio, frase }: {
  titulo: string;
  detalhe: string;
  fatias: { nome: string; valor: number }[];
  total: number;
  rotuloCentro: string;
  textoVazio: ReactNode;
  frase: ReactNode;
}) {
  const cores = useCoresGrafico();
  const comValor = fatiasComOutras(fatias, cores).filter((fatia) => fatia.valor > 0);
  return (
    <CardPainel>
      <CabecalhoCard titulo={titulo} detalhe={detalhe} />
      {comValor.length === 0 ? (
        <Vazio>{textoVazio}</Vazio>
      ) : (
        <>
          <DonutChart data={paraDonut(comValor)} centerLabel={rotuloCentro} centerValue={formatCurrency(total)} />
          <RodapeCard>{frase}</RodapeCard>
        </>
      )}
    </CardPainel>
  );
}
