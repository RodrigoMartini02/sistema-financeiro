import type { PainelData } from '../../../types/finance';
import { BarrasSerieChart } from '../charts/BarrasSerieChart';
import { formatCurrency } from '../formatters';
import { useCoresGrafico } from './coresGrafico';
import { CabecalhoCard, CardPainel, Legenda, RodapeCard, Secao, Vazio } from './PainelLayout';
import { rotuloDoMes } from './painelFormat';

const DESTAQUE = 'font-semibold text-slate-900 dark:text-white';

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
    <Secao titulo="O que já está comprometido?" detalhe="a partir de hoje">
      <CardPainel>
        <CabecalhoCard titulo="Contas a vencer nos próximos 6 meses" detalhe="ainda não pagas" />
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
            <RodapeCard>
              Parcelas <b className={DESTAQUE}>{formatCurrency(totalParcelas)}</b>
              {' · '}Demais contas já lançadas <b className={DESTAQUE}>{formatCurrency(totalOutras)}</b>
            </RodapeCard>
          </>
        )}
      </CardPainel>
    </Secao>
  );
}
