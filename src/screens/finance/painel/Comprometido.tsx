import type { PainelData } from '../../../types/finance';
import { BarrasSerieChart } from '../charts/BarrasSerieChart';
import { useCoresGrafico } from './coresGrafico';
import { CabecalhoCard, CardPainel, Legenda, Secao, Vazio } from './PainelLayout';
import { rotuloDoMes } from './painelFormat';

export function Comprometido({ meses }: { meses: PainelData['contasEmAberto']['comprometido'] }) {
  const cores = useCoresGrafico();
  const pontos = meses.map((mes) => ({
    rotulo: rotuloDoMes(mes.ano, mes.mes),
    parcelas: mes.parcelas,
    outras: mes.outras,
  }));
  const totalParcelas = meses.reduce((soma, mes) => soma + mes.parcelas, 0);
  const totalOutras = meses.reduce((soma, mes) => soma + mes.outras, 0);

  return (
    <Secao titulo="O que já está comprometido?">
      <CardPainel>
        <CabecalhoCard titulo="Contas a vencer nos próximos 6 meses" />
        {totalParcelas + totalOutras === 0 ? (
          <Vazio>Nada lançado para os próximos meses.</Vazio>
        ) : (
          <>
            <Legenda itens={[
              { cor: cores.categorias[0]!, nome: 'Parcelas' },
              { cor: cores.categorias[1]!, nome: 'Demais contas' },
            ]} />
            <BarrasSerieChart
              pontos={pontos}
              altura={190}
              series={[
                { chave: 'parcelas', rotulo: 'Parcelas', cor: cores.categorias[0]!, tipo: 'barra', pilha: 'comprometido' },
                { chave: 'outras', rotulo: 'Demais contas', cor: cores.categorias[1]!, tipo: 'barra', pilha: 'comprometido' },
              ]}
            />
          </>
        )}
      </CardPainel>
    </Secao>
  );
}
