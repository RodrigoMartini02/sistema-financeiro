import type { PainelData, PainelFatiaClassificacao } from '../../../types/finance';
import { formatCurrency } from '../formatters';
import { MovementMetricCard } from '../MovementMetricCard';
import { Secao } from './PainelLayout';
import { FAIXAS_COMPROMETIMENTO, formatarPercentual, situacaoComprometimento } from './painelFormat';
import { PizzaComTabela, PizzaSimples } from './PizzasPainel';

type LinhaClassificacao = PainelFatiaClassificacao & { chave: string | number };

const paraLinhas = (fatias: PainelFatiaClassificacao[]): LinhaClassificacao[] =>
  fatias.map((fatia) => ({ ...fatia, chave: fatia.classificacaoId ?? 'sem-classificacao' }));

const subitens = (linha: LinhaClassificacao) =>
  linha.subcategorias.map((sub) => ({ chave: sub.classificacaoId, nome: sub.nome, valor: sub.valor }));

function fraseEntrou(fatias: PainelFatiaClassificacao[], total: number): string {
  const maior = fatias[0];
  if (!maior || total <= 0) return '';
  if (maior.classificacaoId === null) return 'A maior parte do que entrou está sem classificação: classifique as receitas para ver de onde vem o dinheiro.';
  return `${maior.nome} responde por ${formatarPercentual((maior.valor / total) * 100)} do que entrou.`;
}

function vazioProjecoes(receitas: PainelData['receitas']): string {
  if (receitas.periodoEncerrado) return 'Período encerrado: não há o que projetar.';
  if (!receitas.temFixa) return 'Marque uma classificação como fixa em Configurações › Classificação de receitas para ver a projeção.';
  return 'Nada a receber no período.';
}

/**
 * De onde veio o dinheiro: o recebido e o que ainda vai entrar por
 * classificação, quanto da renda prevista as despesas já consomem e quanto
 * dela é fixa. Segue o período e o filtro de pessoas do painel.
 */
export function DeOndeVeioDinheiro({ dados }: { dados: PainelData }) {
  const { receitas } = dados;
  const entrou = dados.resumo.entrou;
  const comprometimento = receitas.comprometimentoPrevisto;
  const situacao = situacaoComprometimento(comprometimento);

  return (
    <Secao titulo="De onde veio o dinheiro">
      <div className="grid gap-3 lg:grid-cols-5">
        <PizzaComTabela<LinhaClassificacao>
          titulo="Entrou por classificação"
          detalhe="o que foi recebido"
          className="lg:col-span-3"
          textoVazio="Sem receitas recebidas no período."
          rotuloCentro="Entrou"
          total={entrou}
          tituloPrimeiraColuna="Classificação"
          linhas={paraLinhas(receitas.porClassificacao)}
          subitens={subitens}
          rodape={fraseEntrou(receitas.porClassificacao, entrou)}
        />
        <div className="lg:col-span-2">
          <PizzaSimples
            titulo="Projeções"
            detalhe="o que ainda vai entrar"
            fatias={receitas.aReceber.porClassificacao.map((fatia) => ({ nome: fatia.nome, valor: fatia.valor }))}
            total={receitas.aReceber.total}
            rotuloCentro="A receber"
            textoVazio={vazioProjecoes(receitas)}
            frase="Receitas previstas do período e as fixas dos meses que ainda não têm receita lançada."
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {/* Mesmo card do topo; o daqui soma o que ainda vai entrar à renda. */}
        <div className="self-start">
          <MovementMetricCard
            label="Comprometimento previsto"
            value={comprometimento === null ? '—' : formatarPercentual(comprometimento)}
            tone={situacao.tom}
            faixas={comprometimento === null ? undefined : { valor: comprometimento, limites: FAIXAS_COMPROMETIMENTO }}
            note={comprometimento === null
              ? 'Sem renda prevista no período'
              : (
                <>
                  <span className={`font-semibold ${situacao.classe}`}>{situacao.rotulo}</span>
                  {' · da renda prevista'}
                  {receitas.aReceber.total > 0 && <> · inclui {formatCurrency(receitas.aReceber.total)} a receber</>}
                </>
              )}
          />
        </div>
        <div className="md:col-span-2">
          <PizzaSimples
            titulo="Fixa × variável"
            detalhe="o que é garantido"
            fatias={[{ nome: 'Fixa', valor: receitas.fixa }, { nome: 'Variável', valor: receitas.variavel }]}
            total={receitas.rendaPrevista}
            rotuloCentro="Renda prevista"
            textoVazio="Sem renda prevista no período."
            frase={receitas.fixasConsomem !== null
              ? `Suas despesas fixas e parcelas consomem ${formatarPercentual(receitas.fixasConsomem)} da renda fixa.`
              : receitas.temFixa
                ? 'Sem renda fixa prevista no período.'
                : 'Marque as classificações fixas para ver quanto da renda é garantida.'}
          />
        </div>
      </div>
    </Secao>
  );
}
