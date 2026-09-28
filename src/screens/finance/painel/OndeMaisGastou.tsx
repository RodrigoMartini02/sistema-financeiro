import type { PainelCategoria } from '../../../types/finance';
import { formatCurrency } from '../formatters';
import { firstName } from '../memberColors';
import { CabecalhoCard, CardPainel, Legenda, Secao } from './base';
import { useCoresGrafico } from './coresGrafico';
import { BarrasHorizontais, type LinhaHorizontal } from './graficos/BarrasHorizontais';

/** Categorias principais mostradas antes de "ver todas" (as subcategorias abrem sob cada uma). */
const CATEGORIAS_VISIVEIS = 5;

interface Segmento {
  usuarioId: number;
  nome: string;
  valor: number;
  cor: string;
}

interface CategoriaAgregada {
  chave: string;
  categoriaId: number | null;
  categoria: string;
  parentId: number | null;
  total: number;
  segmentos: Map<number, Segmento>;
}

interface OndeMaisGastouProps {
  porCategoria: PainelCategoria[];
  /** Cor de cada pessoa, por usuario_id — a mesma de "Quem trouxe e quem gastou". */
  coresPorPessoa: Map<number, string>;
  /** Divide as barras por pessoa só quando há mais de uma pessoa no filtro. */
  segmentarPorMembro: boolean;
}

/** Categorias da maior para a menor, com as subcategorias e, com várias pessoas, a parte de cada uma. */
export function OndeMaisGastou({ porCategoria, coresPorPessoa, segmentarPorMembro }: OndeMaisGastouProps) {
  const cores = useCoresGrafico();
  const linhasComGasto = porCategoria.filter((linha) => linha.total > 0);
  if (linhasComGasto.length === 0) return null;
  const total = linhasComGasto.reduce((soma, linha) => soma + linha.total, 0);

  const somarSegmento = (destino: Map<number, Segmento>, usuarioId: number | null, nome: string | null, valor: number) => {
    if (usuarioId === null) return;
    const atual = destino.get(usuarioId);
    if (atual) atual.valor += valor;
    else destino.set(usuarioId, { usuarioId, nome: firstName(nome ?? ''), valor, cor: coresPorPessoa.get(usuarioId) ?? cores.neutro });
  };

  // A API devolve uma linha por (categoria, autor): consolida por categoria guardando a parte de cada pessoa.
  const porChave = new Map<string, CategoriaAgregada>();
  for (const linha of linhasComGasto) {
    const chave = String(linha.categoriaId ?? linha.categoria);
    const agregada = porChave.get(chave) ?? {
      chave, categoriaId: linha.categoriaId, categoria: linha.categoria, parentId: linha.parentId, total: 0, segmentos: new Map(),
    };
    agregada.total += linha.total;
    somarSegmento(agregada.segmentos, linha.usuarioId, linha.autorNome, linha.total);
    porChave.set(chave, agregada);
  }
  const categorias = [...porChave.values()];

  // Uma subcategoria cujo pai não teve gasto próprio ainda aparece sob ele: a
  // raiz é quem não tem pai visível na lista, não quem teve gasto.
  const idsVisiveis = new Set(categorias.map((categoria) => categoria.categoriaId));
  const ehRaiz = (categoria: CategoriaAgregada) => categoria.parentId === null || !idsVisiveis.has(categoria.parentId);
  const segmentosDe = (mapa: Map<number, Segmento>) => (segmentarPorMembro
    ? [...mapa.values()].sort((a, b) => b.valor - a.valor).map((segmento) => ({ nome: segmento.nome, valor: segmento.valor, cor: segmento.cor }))
    : undefined);

  const linhas: LinhaHorizontal[] = categorias
    .filter(ehRaiz)
    .map((raiz) => {
      const filhos = categorias.filter((categoria) => categoria.parentId !== null && categoria.parentId === raiz.categoriaId);
      // O valor da principal é o gasto dela mais o das subcategorias (o gasto costuma estar nas subs).
      const segmentos = new Map<number, Segmento>();
      for (const segmento of [raiz, ...filhos].flatMap((categoria) => [...categoria.segmentos.values()])) {
        somarSegmento(segmentos, segmento.usuarioId, segmento.nome, segmento.valor);
      }
      const valor = raiz.total + filhos.reduce((soma, filho) => soma + filho.total, 0);
      return {
        id: raiz.chave,
        nome: raiz.categoria,
        valor,
        parte: (valor / total) * 100,
        segmentos: segmentosDe(segmentos),
        subs: filhos
          .sort((a, b) => b.total - a.total)
          .map((filho) => ({ id: filho.chave, nome: filho.categoria, valor: filho.total, parte: (filho.total / total) * 100, segmentos: segmentosDe(filho.segmentos) })),
      };
    })
    .sort((a, b) => b.valor - a.valor);

  const pessoasNaLegenda = segmentarPorMembro
    ? [...new Map(linhas.flatMap((linha) => linha.segmentos ?? []).map((segmento) => [segmento.nome, segmento])).values()]
    : [];

  return (
    <Secao titulo="Categorias">
      <CardPainel>
        <CabecalhoCard titulo="Onde mais gastou" valor={formatCurrency(total)} />
        <Legenda itens={segmentarPorMembro
          ? pessoasNaLegenda.map((segmento) => ({ cor: segmento.cor, nome: segmento.nome }))
          : [{ cor: cores.destaque, nome: 'Categoria' }, { cor: cores.destaqueSuave, nome: 'Subcategoria' }]}
        />
        <BarrasHorizontais linhas={linhas} modo="parte" limiteVisivel={CATEGORIAS_VISIVEIS} />
      </CardPainel>
    </Secao>
  );
}
