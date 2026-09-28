import type { PainelData, PainelFatia } from '../../../types/finance';
import { formatCurrency } from '../formatters';
import { MovementMetricCard } from '../MovementMetricCard';
import { Secao } from './PainelLayout';
import { FAIXAS_COMPROMETIMENTO, formatarPercentual, situacaoComprometimento } from './painelFormat';
import { PizzaPainel, type FatiaPizza } from './PizzasPainel';

/** Fatia pela classificação/categoria principal; as subcategorias vão para o detalhe. */
const paraFatias = (fatias: PainelFatia[]): FatiaPizza[] =>
  fatias.map((fatia) => ({
    nome: fatia.nome,
    valor: fatia.valor,
    detalhes: fatia.subcategorias.map((sub) => `${sub.nome}: ${formatCurrency(sub.valor)}`),
  }));

/** De onde veio e para onde foi: receitas e despesas por categoria, o que vai entrar e quanto dele já tem destino. */
export function DeOndeVeioDinheiro({ dados }: { dados: PainelData }) {
  const { receitas } = dados;
  const comprometimento = receitas.comprometimentoPrevisto;
  const situacao = situacaoComprometimento(comprometimento);

  return (
    <Secao titulo="De onde veio e para onde foi">
      <div className="grid gap-3 md:grid-cols-2">
        <PizzaPainel
          titulo="Receitas por classificação"
          fatias={paraFatias(receitas.porClassificacao)}
          total={dados.resumo.entrou}
          rotuloCentro="Entrou"
          textoVazio="Sem receitas no período."
        />
        <PizzaPainel
          titulo="Despesas por categoria"
          fatias={paraFatias(dados.despesasPorCategoria)}
          total={dados.resumo.saiu}
          rotuloCentro="Saiu"
          textoVazio="Sem despesas no período."
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <PizzaPainel
          titulo="Projeções"
          fatias={paraFatias(receitas.aReceber.porClassificacao)}
          total={receitas.aReceber.total}
          rotuloCentro="A receber"
          textoVazio={receitas.periodoEncerrado ? 'Período encerrado.' : 'Nada a receber.'}
        />
        {/* Mesmo card do topo, sobre a renda prevista (o que entrou + o que vai entrar). */}
        <div className="self-start">
          <MovementMetricCard
            label="Comprometimento previsto"
            value={comprometimento === null ? '—' : formatarPercentual(comprometimento)}
            tone={situacao.tom}
            faixas={comprometimento === null ? undefined : { valor: comprometimento, limites: FAIXAS_COMPROMETIMENTO }}
            note={comprometimento === null ? 'Sem renda prevista' : situacao.rotulo}
          />
        </div>
        <PizzaPainel
          titulo="Fixa × variável"
          fatias={[{ nome: 'Fixa', valor: receitas.fixa }, { nome: 'Variável', valor: receitas.variavel }]}
          total={receitas.rendaPrevista}
          rotuloCentro="Renda"
          textoVazio="Sem renda no período."
        />
      </div>
    </Secao>
  );
}
