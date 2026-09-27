import { Card } from '../../../ui/card';
import type { PainelData } from '../../../types/finance';
import { BarrasMensaisChart } from '../charts/BarrasMensaisChart';
import { formatCurrency } from '../formatters';
import { CabecalhoCard, RodapeCard, Secao, Vazio } from './PainelLayout';
import { rotuloDoPonto } from './painelFormat';

interface ComprometidoProps {
  meses: PainelData['contasEmAberto']['comprometido'];
}

export function Comprometido({ meses }: ComprometidoProps) {
  const pontos = meses.map((mes) => ({
    rotulo: rotuloDoPonto(mes.ano, mes.mes),
    parcelas: mes.parcelas,
    outras: mes.outras,
  }));
  const totalParcelas = meses.reduce((soma, mes) => soma + mes.parcelas, 0);
  const totalOutras = meses.reduce((soma, mes) => soma + mes.outras, 0);

  return (
    <Secao titulo="O que já está comprometido?" detalhe="a partir de hoje">
      <Card className="flex flex-col gap-4 rounded-2xl p-[18px_22px]">
        <CabecalhoCard titulo="Contas a vencer nos próximos 6 meses" detalhe="ainda não pagas" />
        {totalParcelas + totalOutras === 0 ? (
          <Vazio>Nada lançado para os próximos meses.</Vazio>
        ) : (
          <>
            <BarrasMensaisChart
              pontos={pontos}
              altura={200}
              series={[
                { chave: 'parcelas', rotulo: 'Parcelas', cor: '#6366f1', tipo: 'barra', pilha: 'comprometido' },
                { chave: 'outras', rotulo: 'Demais contas', cor: '#a5b4fc', tipo: 'barra', pilha: 'comprometido' },
              ]}
            />
            <RodapeCard>
              Parcelas <b className="text-[#0f2b38] dark:text-slate-100">{formatCurrency(totalParcelas)}</b>
              {' · '}Demais contas já lançadas <b className="text-[#0f2b38] dark:text-slate-100">{formatCurrency(totalOutras)}</b>
            </RodapeCard>
          </>
        )}
      </Card>
    </Secao>
  );
}
