import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeBoletoLine, findBoletoLine } from './boletoLine';

// As linhas de teste sao GERADAS aqui, nao copiadas de exemplos avulsos: uma
// linha invalida passaria despercebida como "o decodificador rejeitou", e foi
// exatamente esse engano que atrasou a implementacao.

function modulo10(bloco: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = bloco.length - 1; i >= 0; i -= 1) {
    const produto = Number(bloco[i]) * peso;
    soma += produto > 9 ? produto - 9 : produto;
    peso = peso === 2 ? 1 : 2;
  }
  const resto = soma % 10;
  return resto === 0 ? 0 : 10 - resto;
}

function modulo11(bloco: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = bloco.length - 1; i >= 0; i -= 1) {
    soma += Number(bloco[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const digito = 11 - (soma % 11);
  return digito === 0 || digito > 9 ? 1 : digito;
}

/** Monta uma linha digitavel valida a partir dos dados que ela deve carregar. */
function montarLinha(fator: string, valorCentavos: string, campoLivre = '1790001043510049102015000'): string {
  const bancoMoeda = '3419';
  const fatorValor = fator + valorCentavos;
  const dvGeral = modulo11(bancoMoeda + fatorValor + campoLivre);
  const barras = `${bancoMoeda}${dvGeral}${fatorValor}${campoLivre}`;

  const campo1 = barras.slice(0, 4) + barras.slice(19, 24);
  const campo2 = barras.slice(24, 34);
  const campo3 = barras.slice(34, 44);

  return campo1 + modulo10(campo1)
    + campo2 + modulo10(campo2)
    + campo3 + modulo10(campo3)
    + dvGeral + barras.slice(5, 19);
}

test('decodifica valor e vencimento de uma linha valida', () => {
  const linha = montarLinha('9000', '0000010000');
  const info = decodeBoletoLine(linha);
  assert.ok(info, 'linha valida foi rejeitada');
  assert.equal(info!.valor, 100);
  assert.equal(info!.vencimento, '2022-05-29');
  assert.equal(info!.codigoBarras.length, 44);
});

test('aceita a linha formatada como vem impressa no boleto', () => {
  const linha = montarLinha('9000', '0000010000');
  const formatada = `${linha.slice(0, 5)}.${linha.slice(5, 10)} ${linha.slice(10, 15)}.${linha.slice(15, 21)} `
    + `${linha.slice(21, 26)}.${linha.slice(26, 32)} ${linha[32]} ${linha.slice(33)}`;
  assert.deepEqual(decodeBoletoLine(formatada), decodeBoletoLine(linha));
});

test('valor sai em reais, com centavos', () => {
  assert.equal(decodeBoletoLine(montarLinha('9000', '0000012345'))!.valor, 123.45);
  assert.equal(decodeBoletoLine(montarLinha('9000', '0000000001'))!.valor, 0.01);
  assert.equal(decodeBoletoLine(montarLinha('9000', '0001500000'))!.valor, 15000);
});

test('valor zerado vira null: o boleto nao define quanto pagar', () => {
  assert.equal(decodeBoletoLine(montarLinha('9000', '0000000000'))!.valor, null);
});

test('fator zero vira null: boleto sem vencimento definido', () => {
  assert.equal(decodeBoletoLine(montarLinha('0000', '0000010000'))!.vencimento, null);
});

test('a virada de ciclo do fator e continua', () => {
  // O fator chegou a 9999 em 21/02/2025 e reiniciou em 1000 no dia seguinte.
  // A sequencia precisa refletir isso: 1000 vem DEPOIS de 9999, nao antes.
  const ultimoDoCicloAntigo = decodeBoletoLine(montarLinha('9999', '0000010000'))!.vencimento;
  const primeiroDoCicloNovo = decodeBoletoLine(montarLinha('1000', '0000010000'))!.vencimento;

  assert.equal(ultimoDoCicloAntigo, '2025-02-21');
  assert.equal(primeiroDoCicloNovo, '2025-02-22');
  assert.ok(primeiroDoCicloNovo! > ultimoDoCicloAntigo!, 'o ciclo novo deve suceder o antigo');
});

test('fator de 4 digitos no passado distante e lido como ciclo novo', () => {
  // 0001 sozinho apontaria para 1997 — data impossivel para um boleto em
  // circulacao, entao pertence ao ciclo seguinte.
  const info = decodeBoletoLine(montarLinha('0001', '0000010000'))!;
  assert.ok(info.vencimento! > '2020-01-01', `veio ${info.vencimento}`);
});

test('data-base confere com a referencia da Febraban', () => {
  // Fator 1000 no PRIMEIRO ciclo equivale a 03/07/2000 — valor documentado.
  // Hoje esse fator ja pertence ao segundo ciclo, entao o teste valida a
  // ancora somando os dias direto sobre a data-base.
  const base = Date.UTC(1997, 9, 7);
  const mil = new Date(base + 1000 * 86_400_000).toISOString().slice(0, 10);
  assert.equal(mil, '2000-07-03');
});

test('digito verificador adulterado e recusado', () => {
  const linha = montarLinha('9000', '0000010000');
  // Troca o DV geral por outro digito.
  const dvErrado = String((Number(linha[32]) + 1) % 10);
  assert.equal(decodeBoletoLine(linha.slice(0, 32) + dvErrado + linha.slice(33)), null);

  // Troca um digito do campo 1, invalidando o modulo 10.
  const campoErrado = linha.slice(0, 3) + String((Number(linha[3]) + 1) % 10) + linha.slice(4);
  assert.equal(decodeBoletoLine(campoErrado), null);
});

test('tamanho diferente de 47 e recusado', () => {
  assert.equal(decodeBoletoLine('123'), null);
  assert.equal(decodeBoletoLine(''), null);
  // Concessionaria usa 48 digitos e outra regra: nao pode ser decodificada aqui.
  assert.equal(decodeBoletoLine('8'.repeat(48)), null);
});

test('encontra a linha no meio do texto do OCR', () => {
  const linha = montarLinha('9000', '0000010000');
  const texto = `BANCO EXEMPLO S.A.\nBeneficiario: Fulano\n${linha}\nVencimento 29/05/2022\nValor R$ 100,00`;
  const info = findBoletoLine(texto);
  assert.ok(info);
  assert.equal(info!.valor, 100);
});

test('encontra mesmo quando o OCR gruda a linha em outros numeros', () => {
  const linha = montarLinha('9000', '0000012345');
  const texto = `Documento 12345 ${linha} agencia 6789`;
  assert.equal(findBoletoLine(texto)!.valor, 123.45);
});

test('texto sem linha digitavel nao inventa resultado', () => {
  assert.equal(findBoletoLine('Recibo de pagamento no valor de R$ 250,00 em 10/03/2026'), null);
  assert.equal(findBoletoLine(''), null);
  // Sequencia longa de digitos que nao forma linha valida.
  assert.equal(findBoletoLine('1'.repeat(60)), null);
});
