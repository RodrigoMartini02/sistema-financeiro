import { Card } from '../../../ui/card';
import type { PainelData, PainelPeriodo } from '../../../types/finance';
import { BarrasMensaisChart } from '../charts/BarrasMensaisChart';
import { formatCurrency } from '../formatters';
import { CabecalhoCard, RodapeCard, Vazio } from './PainelLayout';
import { rotuloDoMesFinal, rotuloDoPonto } from './painelFormat';

interface ReceitaDespesaMensalProps {
  serie: PainelData['serie'];
  periodo: PainelPeriodo;
}

export function ReceitaDespesaMensal({ serie, periodo }: ReceitaDespesaMensalProps) {
  const periodoDentroDeUmMes = periodo.de.slice(0, 7) === periodo.ate.slice(0, 7);
  const pontos = serie.pontos.map((ponto) => ({
    rotulo: rotuloDoPonto(ponto.ano, ponto.mes),
    receitas: ponto.receitas,
    despesas: ponto.despesas,
    resultado: ponto.receitas - ponto.despesas,
  }));
  const comMovimento = pontos.filter((ponto) => ponto.receitas > 0 || ponto.despesas > 0);
  const unidade = serie.granularidade === 'ano' ? 'ano' : 'mês';

  const melhor = comMovimento.reduce<typeof pontos[number] | null>((atual, ponto) => (!atual || ponto.receitas > atual.receitas ? ponto : atual), null);
  const maiorGasto = comMovimento.reduce<typeof pontos[number] | null>((atual, ponto) => (!atual || ponto.despesas > atual.despesas ? ponto : atual), null);
  const noVermelho = comMovimento.filter((ponto) => ponto.resultado < 0).length;

  return (
    <Card className="flex flex-col gap-4 rounded-2xl p-[18px_22px]">
      <CabecalhoCard
        titulo="Receita × despesa"
        detalhe={periodoDentroDeUmMes ? 'últimos 12 meses' : `por ${unidade} do período`}
      />
      {comMovimento.length === 0 ? (
        <Vazio>Sem lançamentos no período.</Vazio>
      ) : (
        <>
          <BarrasMensaisChart
            pontos={pontos}
            destaque={periodoDentroDeUmMes ? rotuloDoMesFinal(periodo) : undefined}
            series={[
              { chave: 'receitas', rotulo: 'Receitas', cor: '#10b981', tipo: 'barra' },
              { chave: 'despesas', rotulo: 'Despesas', cor: '#ef4444', tipo: 'barra' },
              { chave: 'resultado', rotulo: 'Resultado', cor: '#6366f1', tipo: 'linha' },
            ]}
          />
          <RodapeCard>
            {melhor && <>Melhor {unidade} <b className="text-[#0f2b38] dark:text-slate-100">{melhor.rotulo} · {formatCurrency(melhor.receitas)}</b> · </>}
            {maiorGasto && <>Maior gasto <b className="text-[#0f2b38] dark:text-slate-100">{maiorGasto.rotulo} · {formatCurrency(maiorGasto.despesas)}</b> · </>}
            <b className={noVermelho > 0 ? 'text-[#b42318] dark:text-rose-300' : 'text-[#067647] dark:text-emerald-300'}>
              {noVermelho === 0 ? `Nenhum ${unidade} no vermelho` : `${noVermelho} ${unidade === 'mês' ? (noVermelho === 1 ? 'mês' : 'meses') : (noVermelho === 1 ? 'ano' : 'anos')} no vermelho`}
            </b>
          </RodapeCard>
        </>
      )}
    </Card>
  );
}
