import type { PainelData } from '../../../types/finance';
import { formatCurrency } from '../formatters';
import { firstName } from '../memberColors';
import { CabecalhoCard, CardPainel, Secao } from './base';
import { useCoresGrafico } from './coresGrafico';
import { Barras } from './graficos/Barras';
import { Pizza } from './graficos/Pizza';
import { TAMANHO_PIZZA_MENOR, formatarComSinal } from './painelFormat';

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
    saldo: pessoa.receitas - pessoa.despesas,
  }));
  const totalReceitas = comCor.reduce((soma, pessoa) => soma + pessoa.receitas, 0);
  const totalDespesas = comCor.reduce((soma, pessoa) => soma + pessoa.despesas, 0);

  return (
    <Secao titulo="Quem trouxe e quem gastou">
      <div className="grid gap-4 lg:grid-cols-3">
        <CardPainel>
          <CabecalhoCard titulo="Receitas por pessoa" valor={formatCurrency(totalReceitas)} />
          <Pizza
            tamanhoMinimo={TAMANHO_PIZZA_MENOR}
            vazio="Sem receitas no período."
            fatias={comCor.map((pessoa) => ({ nome: pessoa.nomeCurto, valor: pessoa.receitas, cor: pessoa.cor }))}
          />
        </CardPainel>
        <CardPainel>
          <CabecalhoCard titulo="Despesas por pessoa" valor={formatCurrency(totalDespesas)} />
          <Pizza
            tamanhoMinimo={TAMANHO_PIZZA_MENOR}
            vazio="Sem despesas no período."
            fatias={comCor.map((pessoa) => ({ nome: pessoa.nomeCurto, valor: pessoa.despesas, cor: pessoa.cor }))}
          />
        </CardPainel>
        <CardPainel>
          <CabecalhoCard titulo="Saldo por pessoa" />
          <Barras
            altura={150}
            sinal
            formatar={formatarComSinal}
            series={[{ chave: 'saldo', rotulo: 'Saldo', cor: (valor) => (valor >= 0 ? cores.positivo : cores.negativo) }]}
            pontos={comCor.map((pessoa) => ({ rotulo: pessoa.nomeCurto, valores: { saldo: pessoa.saldo, entrou: pessoa.receitas, saiu: pessoa.despesas } }))}
            linhasExtras={(ponto) => [['Entrou', formatCurrency(ponto.valores.entrou!)], ['Saiu', formatCurrency(ponto.valores.saiu!)]]}
          />
          <ul className="m-0 grid list-none gap-1 p-0">
            {comCor.map((pessoa) => (
              <li key={pessoa.usuarioId} className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <span className="h-2 w-2 rounded-sm" style={{ background: pessoa.cor }} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-slate-700 dark:text-slate-200">{pessoa.nomeCurto}</span>
                  <span className="block text-[11.5px] tabular-nums text-slate-500 dark:text-slate-400">
                    Entrou {formatCurrency(pessoa.receitas)} · Saiu {formatCurrency(pessoa.despesas)}
                  </span>
                </span>
                <span className={`text-sm tabular-nums ${pessoa.saldo >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {formatarComSinal(pessoa.saldo)}
                </span>
              </li>
            ))}
          </ul>
        </CardPainel>
      </div>
    </Secao>
  );
}
