import type { PainelData, RenegotiatedInvoice } from '../../../types/finance';
import { installmentsLabel, invoiceMonthLabel, installmentAmountsOf } from '../../../utils/cardInvoice';
import { formatCurrency } from '../formatters';
import { firstName } from '../memberColors';
import { CabecalhoCard, CardPainel, Legenda, Secao } from './base';
import { corDaPaleta, useCoresGrafico } from './coresGrafico';
import { Barras } from './graficos/Barras';
import { Pizza } from './graficos/Pizza';
import {
  TAMANHO_PIZZA_GRANDE, TAMANHO_PIZZA_MENOR, formatarPercentual, observacoesPorOutros, paraFatias, rotuloDoTrecho, rotuloForma, trechoFuturo, unidadeDaSerie,
} from './painelFormat';

const compras = (quantidade: number) => `${quantidade} compra${quantidade === 1 ? '' : 's'}`;

/** "Nubank — fatura de out/2026: R$ 430,00 foram para nov/2026" ou "…: parcelada em 3x de R$ 360,00 a partir de nov/2026". */
function avisoRenegociacao(fatura: RenegotiatedInvoice): string {
  const inicio = `${fatura.cardName} — fatura de ${invoiceMonthLabel(fatura.invoiceMonth)}`;
  const proximoMes = invoiceMonthLabel(fatura.firstDueDate.slice(0, 7));
  if (fatura.method === 'installments' && fatura.installmentCount) {
    const parcelas = installmentsLabel(installmentAmountsOf(fatura.carriedForward, fatura.installmentCount), formatCurrency);
    return `${inicio}: parcelada em ${parcelas} a partir de ${proximoMes}`;
  }
  return `${inicio}: ${formatCurrency(fatura.carriedForward)} foram para ${proximoMes}`;
}

/** Para onde foi o dinheiro: despesas por categoria em destaque, como foram pagas e as formas mês a mês. */
export function ComoDinheiroSaiu({ dados }: { dados: PainelData }) {
  const cores = useCoresGrafico();
  const total = dados.resumo.saiu;
  const { aVista, parcelado } = dados.aVistaParcelado;
  const { fixo, parcela, livre } = dados.tipoGasto;
  const totalCartoes = dados.cartoes.reduce((soma, cartao) => soma + cartao.gasto, 0);
  const renegociacoes = dados.renegotiatedInvoices ?? [];
  // O bloco aparece também quando só houve renegociação de fatura no período.
  const temCartoes = dados.cartoes.length > 0 || renegociacoes.length > 0;
  // A mesma cor para cada forma na pizza e nas barras por mês (ordem do maior valor).
  const formas = dados.formasPagamento.map((forma, indice) => ({ ...forma, nome: rotuloForma(forma.forma), cor: corDaPaleta(indice, cores) }));

  return (
    <Secao titulo="Para onde foi o dinheiro">
      <div className="grid gap-4 lg:grid-cols-2">
        <CardPainel>
          <CabecalhoCard titulo="Despesas por categoria" valor={formatCurrency(total)} />
          <Pizza
            fatias={paraFatias(dados.despesasPorCategoria).map((fatia, indice) => {
              const origem = dados.despesasPorCategoria[indice]!;
              return { ...fatia, observacoes: observacoesPorOutros(dados.categoriasPorOutros, [origem.id, ...origem.subcategorias.map((sub) => sub.id)], fatia.valor) };
            })}
            tamanhoMinimo={TAMANHO_PIZZA_GRANDE}
            vazio="Sem despesas no período."
          />
        </CardPainel>

        <div className="grid gap-4 sm:grid-cols-2">
          <CardPainel>
            <CabecalhoCard titulo="Forma de pagamento" valor={formatCurrency(total)} />
            <Pizza
              tamanhoMinimo={TAMANHO_PIZZA_MENOR}
              vazio="Sem despesas no período."
              fatias={formas.map((forma) => ({
                nome: forma.nome,
                valor: forma.valor,
                cor: forma.cor,
                detalhes: [
                  ['Compras', compras(forma.quantidade)],
                  ['Ticket médio', formatCurrency(forma.valor / forma.quantidade)],
                  ...(forma.juros > 0 ? [['Juros', formatCurrency(forma.juros)] as [string, string]] : []),
                ],
              }))}
            />
          </CardPainel>
          {temCartoes && (
            <CardPainel>
              <CabecalhoCard titulo="Cartões de crédito" valor={formatCurrency(totalCartoes)} />
              <Pizza
                tamanhoMinimo={TAMANHO_PIZZA_MENOR}
                vazio="Sem gastos no cartão."
                fatias={dados.cartoes.map((cartao) => {
                  // Quem usou aparece quando mais de uma pessoa gastou no cartão ou quando quem gastou não é o dono.
                  const usoCruzado = cartao.porPessoa.length > 1 || cartao.porPessoa.some((pessoa) => pessoa.usuarioId !== cartao.donoId);
                  return {
                    nome: cartao.dono ? `${cartao.nome} (${firstName(cartao.dono)})` : cartao.nome,
                    valor: cartao.gasto,
                    detalhes: [
                      ...(usoCruzado ? cartao.porPessoa.map((pessoa) => [firstName(pessoa.nome), formatCurrency(pessoa.gasto)] as [string, string]) : []),
                      ...(cartao.limite !== null && cartao.limite > 0 && cartao.usado !== null
                        ? [['Limite em uso', formatarPercentual((cartao.usado / cartao.limite) * 100)], ['Limite', formatCurrency(cartao.limite)]] as [string, string][]
                        : []),
                    ],
                  };
                })}
              />
              {renegociacoes.length > 0 && (
                <ul className="m-0 mt-3 flex list-none flex-col gap-1 border-t border-slate-100 p-0 pt-3 text-[12px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
                  {renegociacoes.map((fatura) => (
                    <li key={`${fatura.cardId}-${fatura.invoiceMonth}-${fatura.method}-${fatura.carriedForward}`}>
                      <span className="font-semibold text-slate-600 dark:text-slate-300">Renegociada · </span>
                      {avisoRenegociacao(fatura)}
                    </li>
                  ))}
                </ul>
              )}
            </CardPainel>
          )}
          <CardPainel>
            <CabecalhoCard titulo="À vista ou parcelado" valor={formatCurrency(total)} />
            <Pizza
              ordenar={false}
              tamanhoMinimo={TAMANHO_PIZZA_MENOR}
              vazio="Sem despesas no período."
              fatias={[{ nome: 'À vista', valor: aVista }, { nome: 'Parcelado', valor: parcelado }]}
            />
          </CardPainel>
          {/* Sem cartões, o último card ocupa as duas colunas. */}
          <CardPainel className={temCartoes ? '' : 'sm:col-span-2'}>
            <CabecalhoCard titulo="Tipo de gasto" valor={formatCurrency(total)} />
            <Pizza
              ordenar={false}
              legendaAoLado={!temCartoes}
              tamanhoMinimo={TAMANHO_PIZZA_MENOR}
              vazio="Sem despesas no período."
              fatias={[{ nome: 'Contas fixas', valor: fixo }, { nome: 'Parcelas', valor: parcela }, { nome: 'Dia a dia', valor: livre }]}
            />
          </CardPainel>
        </div>
      </div>

      {formas.length > 0 && (
        <CardPainel>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <h3 className="m-0 text-sm font-medium text-slate-900 dark:text-white">
              Formas de pagamento por {unidadeDaSerie(dados.serie.granularidade).singular}
            </h3>
            <Legenda itens={formas.map((forma) => ({ cor: forma.cor, nome: forma.nome }))} />
          </div>
          <Barras
            altura={230}
            empilhar
            mostrarParte
            series={formas.map((forma) => ({ chave: forma.forma, rotulo: forma.nome, cor: forma.cor }))}
            pontos={dados.serie.pontos.map((ponto) => ({
              rotulo: rotuloDoTrecho(ponto.inicio, ponto.fim, dados.serie.granularidade),
              futuro: trechoFuturo(ponto.inicio),
              valores: ponto.formas,
            }))}
            linhasExtras={(ponto) => [['Total', formatCurrency(Object.values(ponto.valores).reduce((soma, valor) => soma + valor, 0))]]}
          />
        </CardPainel>
      )}
    </Secao>
  );
}
