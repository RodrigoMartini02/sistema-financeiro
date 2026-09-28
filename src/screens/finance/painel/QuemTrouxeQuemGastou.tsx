import type { PainelData } from '../../../types/finance';
import { BarrasSerieChart } from '../charts/BarrasSerieChart';
import { firstName } from '../memberColors';
import { useCoresGrafico } from './coresGrafico';
import { CabecalhoCard, CardPainel, Legenda, Secao } from './PainelLayout';
import { PizzaPainel } from './PizzasPainel';

interface QuemTrouxeQuemGastouProps {
  pessoas: PainelData['porPessoa'];
  /** Cor de cada pessoa (usuario_id) — a mesma usada nas barras de Categorias. */
  coresPorPessoa: Map<number, string>;
}

export function QuemTrouxeQuemGastou({ pessoas, coresPorPessoa }: QuemTrouxeQuemGastouProps) {
  const cores = useCoresGrafico();
  const comCor = pessoas.map((pessoa) => ({
    ...pessoa,
    nomeCurto: firstName(pessoa.nome),
    cor: coresPorPessoa.get(pessoa.usuarioId) ?? cores.neutro,
  }));
  const totalReceitas = comCor.reduce((soma, pessoa) => soma + pessoa.receitas, 0);
  const totalDespesas = comCor.reduce((soma, pessoa) => soma + pessoa.despesas, 0);
  const fatias = (valor: (pessoa: typeof comCor[number]) => number) =>
    comCor.map((pessoa) => ({ nome: pessoa.nomeCurto, valor: valor(pessoa), cor: pessoa.cor }));

  return (
    <Secao titulo="Quem trouxe e quem gastou">
      <div className="grid gap-3 xl:grid-cols-3">
        <PizzaPainel
          titulo="Receitas por pessoa"
          fatias={fatias((pessoa) => pessoa.receitas)}
          total={totalReceitas}
          rotuloCentro="Entrou"
          textoVazio="Sem receitas no período."
        />
        <PizzaPainel
          titulo="Despesas por pessoa"
          fatias={fatias((pessoa) => pessoa.despesas)}
          total={totalDespesas}
          rotuloCentro="Saiu"
          textoVazio="Sem despesas no período."
        />
        <CardPainel>
          <CabecalhoCard titulo="Entrou × saiu por pessoa" />
          <Legenda itens={[{ cor: cores.receita, nome: 'Entrou' }, { cor: cores.despesa, nome: 'Saiu' }]} />
          <BarrasSerieChart
            pontos={comCor.map((pessoa) => ({ rotulo: pessoa.nomeCurto, entrou: pessoa.receitas, saiu: pessoa.despesas }))}
            altura={180}
            series={[
              { chave: 'entrou', rotulo: 'Entrou', cor: cores.receita, tipo: 'barra' },
              { chave: 'saiu', rotulo: 'Saiu', cor: cores.despesa, tipo: 'barra' },
            ]}
          />
        </CardPainel>
      </div>
    </Secao>
  );
}
