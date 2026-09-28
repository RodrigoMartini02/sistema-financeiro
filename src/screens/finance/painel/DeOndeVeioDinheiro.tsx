import type { PainelData } from '../../../types/finance';
import { formatCurrency } from '../formatters';
import { CabecalhoCard, CardPainel, Secao } from './base';
import { corDaSituacao, useCoresGrafico } from './coresGrafico';
import { Pizza } from './graficos/Pizza';
import { TAMANHO_PIZZA_GRANDE, TAMANHO_PIZZA_MENOR, formatarPercentual, paraFatias, situacaoComprometimento } from './painelFormat';

/** De onde veio o dinheiro: receitas por classificação em destaque e, ao lado, o que se relaciona com elas. */
export function DeOndeVeioDinheiro({ dados }: { dados: PainelData }) {
  const cores = useCoresGrafico();
  const { receitas } = dados;
  const saiu = dados.resumo.saiu;
  const renda = receitas.rendaPrevista;
  const comprometimento = receitas.comprometimentoPrevisto;
  const situacao = situacaoComprometimento(comprometimento);

  return (
    <Secao titulo="De onde veio o dinheiro">
      <div className="grid gap-4 lg:grid-cols-2">
        <CardPainel>
          <CabecalhoCard titulo="Receitas por categoria" valor={formatCurrency(dados.resumo.entrou)} />
          <Pizza fatias={paraFatias(receitas.porClassificacao)} tamanhoMinimo={TAMANHO_PIZZA_GRANDE} vazio="Sem receitas no período." />
        </CardPainel>

        <div className="grid gap-4 sm:grid-cols-2">
          <CardPainel>
            <CabecalhoCard titulo="Projeções" valor={formatCurrency(receitas.aReceber.total)} />
            <Pizza
              fatias={paraFatias(receitas.aReceber.porClassificacao)}
              tamanhoMinimo={TAMANHO_PIZZA_MENOR}
              vazio={receitas.periodoEncerrado ? 'Período encerrado.' : 'Nada a receber.'}
            />
          </CardPainel>
          <CardPainel>
            <CabecalhoCard titulo="Renda fixa e extra" valor={formatCurrency(renda)} />
            <Pizza
              ordenar={false}
              fatias={[
                { nome: 'Renda fixa', valor: receitas.fixa },
                { nome: 'Renda extra', valor: receitas.variavel },
              ]}
              tamanhoMinimo={TAMANHO_PIZZA_MENOR}
              vazio="Sem renda no período."
            />
          </CardPainel>
          <CardPainel className="sm:col-span-2">
            <CabecalhoCard
              titulo="Comprometimento previsto"
              valor={comprometimento === null ? '—' : formatarPercentual(comprometimento)}
              tomValor={situacao.classe}
            />
            <Pizza
              ordenar={false}
              legendaAoLado
              tamanhoMinimo={TAMANHO_PIZZA_MENOR}
              vazio="Sem renda prevista."
              fatias={renda > 0 ? [
                {
                  nome: 'Já tem destino',
                  valor: Math.min(saiu, renda),
                  cor: corDaSituacao(situacao.tom, cores),
                  detalhes: [
                    ['Situação', situacao.rotulo],
                    ['Renda prevista', formatCurrency(renda)],
                    ...(saiu > renda ? [['Acima da renda', formatCurrency(saiu - renda)] as [string, string]] : []),
                  ],
                },
                { nome: 'Livre', valor: Math.max(0, renda - saiu), cor: cores.futuro },
              ] : []}
            />
          </CardPainel>
        </div>
      </div>
    </Secao>
  );
}
