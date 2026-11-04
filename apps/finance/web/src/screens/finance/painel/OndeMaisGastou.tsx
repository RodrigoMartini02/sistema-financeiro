import type { PainelCategoria, PainelData } from '../../../types/finance';
import { agruparCategoriasPorRaiz, type CategoriaConsolidada } from '../../../utils/painelCategorias';
import { formatCurrency } from '../formatters';
import { firstName } from '../memberColors';
import { CabecalhoCard, CardPainel, Legenda, Secao } from './base';
import { useCoresGrafico } from './coresGrafico';
import { BarrasHorizontais, type LinhaHorizontal } from './graficos/BarrasHorizontais';
import { observacoesPorOutros } from './painelFormat';

/** Categorias principais mostradas antes de "ver todas" (as subcategorias abrem sob cada uma). */
const CATEGORIAS_VISIVEIS = 5;

interface Segmento {
  usuarioId: number;
  nome: string;
  valor: number;
  cor: string;
}

interface OndeMaisGastouProps {
  porCategoria: PainelCategoria[];
  /** Compras cadastradas por outra pessoa no cartão de quem paga (vão como nota pequena no detalhe). */
  porOutros: PainelData['categoriasPorOutros'];
  /** Cor de cada pessoa, por usuario_id — a mesma de "Quem trouxe e quem gastou". */
  coresPorPessoa: Map<number, string>;
  /** Divide as barras por pessoa só quando há mais de uma pessoa no filtro. */
  segmentarPorMembro: boolean;
}

/** Categorias da maior para a menor, com as subcategorias e, com várias pessoas, a parte de cada uma. */
export function OndeMaisGastou({ porCategoria, porOutros, coresPorPessoa, segmentarPorMembro }: OndeMaisGastouProps) {
  const cores = useCoresGrafico();
  const linhasComGasto = porCategoria.filter((linha) => linha.total + (linha.forecast ?? 0) > 0);
  if (linhasComGasto.length === 0) return null;
  const total = linhasComGasto.reduce((soma, linha) => soma + linha.total + (linha.forecast ?? 0), 0);

  const somarSegmento = (destino: Map<number, Segmento>, usuarioId: number, nome: string | null, valor: number) => {
    const atual = destino.get(usuarioId);
    if (atual) atual.valor += valor;
    else destino.set(usuarioId, { usuarioId, nome: firstName(nome ?? ''), valor, cor: coresPorPessoa.get(usuarioId) ?? cores.neutro });
  };
  const segmentosDe = (categorias: CategoriaConsolidada[]) => {
    if (!segmentarPorMembro) return undefined;
    const porPessoa = new Map<number, Segmento>();
    for (const pessoa of categorias.flatMap((categoria) => [...categoria.pessoas.values()])) {
      somarSegmento(porPessoa, pessoa.usuarioId, pessoa.nome, pessoa.valor);
    }
    return [...porPessoa.values()].sort((a, b) => b.valor - a.valor).map((segmento) => ({ nome: segmento.nome, valor: segmento.valor, cor: segmento.cor }));
  };

  // A principal soma o gasto dela mais o das subcategorias (em conta pessoal o gasto está nas subs).
  const linhas: LinhaHorizontal[] = agruparCategoriasPorRaiz(linhasComGasto)
    .map((raiz) => {
      const subs = [...raiz.subs].sort((a, b) => b.total - a.total);
      const valor = (raiz.proprio?.total ?? 0) + subs.reduce((soma, sub) => soma + sub.total, 0);
      const forecast = (raiz.proprio?.forecast ?? 0) + subs.reduce((sum, sub) => sum + (sub.forecast ?? 0), 0);
      return {
        id: raiz.chave,
        nome: raiz.nome,
        valor,
        forecast,
        parte: ((valor + forecast) / total) * 100,
        segmentos: segmentosDe([...(raiz.proprio ? [raiz.proprio] : []), ...subs]),
        observacoes: observacoesPorOutros(porOutros, [raiz.categoriaId, ...subs.map((sub) => sub.categoriaId)], valor),
        subs: subs.map((sub) => ({
          id: sub.chave, nome: sub.categoria, valor: sub.total, forecast: sub.forecast, parte: ((sub.total + (sub.forecast ?? 0)) / total) * 100,
          segmentos: segmentosDe([sub]), observacoes: observacoesPorOutros(porOutros, [sub.categoriaId], sub.total),
        })),
      };
    })
    .sort((a, b) => b.valor + b.forecast - a.valor - a.forecast);

  const pessoasNaLegenda = segmentarPorMembro
    ? [...new Map(linhas.flatMap((linha) => linha.segmentos ?? []).map((segmento) => [segmento.nome, segmento])).values()]
    : [];

  return (
    <Secao titulo="Categorias">
      <CardPainel>
        <CabecalhoCard titulo="Onde mais gastou" valor={formatCurrency(total)} />
        <Legenda itens={[
          ...(segmentarPorMembro
            ? pessoasNaLegenda.map((segmento) => ({ cor: segmento.cor, nome: segmento.nome }))
            : [{ cor: cores.destaque, nome: 'Categoria' }, { cor: cores.destaqueSuave, nome: 'Subcategoria' }]),
          ...(linhasComGasto.some(row => (row.forecast ?? 0) > 0) ? [{ cor: cores.destaque, nome: 'Previsão · hachurada' }] : []),
        ]}
        />
        <BarrasHorizontais linhas={linhas} modo="parte" limiteVisivel={CATEGORIAS_VISIVEIS} />
      </CardPainel>
    </Secao>
  );
}
