// Linha digitavel de boleto bancario: os 47 digitos impressos abaixo do codigo
// de barras carregam valor e vencimento dentro deles.
//
// Ler daqui e mais confiavel que procurar "R$" e "vencimento" no texto por
// regex: o valor vem em centavos e o vencimento em dias desde uma data fixa,
// sem depender de como o boleto foi diagramado. E cada bloco traz digito
// verificador — leitura errada do OCR e recusada em vez de virar valor errado.
//
// Boleto de concessionaria (agua, luz, telefone) usa 48 digitos e outra regra
// de montagem; aqui ele e ignorado de proposito, para nao decodificar errado.

export interface BoletoInfo {
  /** Valor em reais, ou null quando o boleto nao traz valor definido. */
  valor: number | null;
  /** Vencimento em AAAA-MM-DD, ou null quando o boleto nao tem data. */
  vencimento: string | null;
  /** Os 44 digitos do codigo de barras, reconstruidos a partir da linha. */
  codigoBarras: string;
}

/** Data-base da Febraban: o fator de vencimento conta dias a partir daqui. */
const DATA_BASE = Date.UTC(1997, 9, 7);

/**
 * Modulo 10 — valida os campos 1 a 3 da linha digitavel.
 * Pesos alternam 2 e 1 da direita para a esquerda; resultado com dois digitos
 * e somado como digitos separados (18 vira 1+8).
 */
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

/**
 * Modulo 11 — valida o digito geral do codigo de barras (posicao 5).
 * Pesos de 2 a 9, ciclicos, da direita para a esquerda.
 */
function modulo11(bloco: string): number {
  let soma = 0;
  let peso = 2;

  for (let i = bloco.length - 1; i >= 0; i -= 1) {
    soma += Number(bloco[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }

  const resto = soma % 11;
  const digito = 11 - resto;
  // 0, 10 e 11 sao invalidos como DV geral e viram 1, por convencao da Febraban.
  return digito === 0 || digito > 9 ? 1 : digito;
}

/**
 * Converte o fator de vencimento em data.
 *
 * O fator e ciclico: chegou a 9999 em 21/02/2025 e reiniciou em 1000 no dia
 * seguinte, somando 9000 dias a data-base.
 *
 * Fator abaixo de 1000 nao existiu no primeiro ciclo (que comecou em 1000),
 * entao so pode ser do segundo. Na faixa 1000-9999 o valor e AMBIGUO e nao ha
 * como desfazer isso a partir da linha digitavel: o mesmo fator aponta para
 * duas datas separadas por 9000 dias, e so a data de emissao — que a linha nao
 * carrega — resolveria.
 *
 * O criterio adotado: vencimento anterior a 2015 e residuo historico, nao
 * boleto em circulacao, entao vale o ciclo novo. Isso erra para boleto antigo
 * de verdade, mas acerta o caso comum. Como o vencimento cai no card de
 * revisao antes de gravar, uma data estranha e visivel e corrigivel.
 */
const CORTE_CICLO = Date.UTC(2015, 0, 1);

function fatorParaData(fator: number): string | null {
  // Fator zero significa "sem vencimento definido" — boleto aceito a qualquer dia.
  if (fator === 0) return null;

  const candidato = DATA_BASE + fator * 86_400_000;
  const dias = candidato < CORTE_CICLO ? fator + 9000 : fator;
  const data = new Date(DATA_BASE + dias * 86_400_000);

  const ano = data.getUTCFullYear();
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(data.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * Decodifica uma linha digitavel de 47 digitos.
 *
 * A linha reorganiza os 44 digitos do codigo de barras em cinco campos; para
 * ler valor e vencimento e preciso desfazer essa reorganizacao. Devolve `null`
 * quando o tamanho nao bate ou quando algum digito verificador falha — nesse
 * caso o OCR provavelmente leu errado, e um valor errado seria pior que nenhum.
 */
export function decodeBoletoLine(digits: string): BoletoInfo | null {
  const linha = digits.replace(/\D/g, '');
  if (linha.length !== 47) return null;

  // Campos e seus digitos verificadores, conforme a Febraban.
  const campo1 = linha.slice(0, 9);
  const dv1 = Number(linha[9]);
  const campo2 = linha.slice(10, 20);
  const dv2 = Number(linha[20]);
  const campo3 = linha.slice(21, 31);
  const dv3 = Number(linha[31]);
  const dvGeral = Number(linha[32]);
  const fator = Number(linha.slice(33, 37));
  const valorCentavos = Number(linha.slice(37, 47));

  if (modulo10(campo1) !== dv1) return null;
  if (modulo10(campo2) !== dv2) return null;
  if (modulo10(campo3) !== dv3) return null;

  // Remonta o codigo de barras. A linha digitavel embaralha os 44 digitos: o
  // campo livre fica repartido entre os tres primeiros blocos, e fator e valor
  // migram para o fim da linha.
  const bancoMoeda = linha.slice(0, 4);
  const fatorValor = linha.slice(33, 47);
  const campoLivre = linha.slice(4, 9) + campo2 + campo3;
  const codigoBarras = `${bancoMoeda}${dvGeral}${fatorValor}${campoLivre}`;

  // O DV geral valida o codigo inteiro sem ele proprio.
  if (modulo11(`${bancoMoeda}${fatorValor}${campoLivre}`) !== dvGeral) return null;

  return {
    valor: valorCentavos > 0 ? valorCentavos / 100 : null,
    vencimento: fatorParaData(fator),
    codigoBarras,
  };
}

/**
 * Procura uma linha digitavel no texto do OCR e a decodifica.
 *
 * O boleto imprime a linha com pontos e espacos ("34191.79001 01043.510047
 * ..."), e o OCR costuma preservar essa formatacao. A busca varre sequencias de
 * digitos separados por pontuacao ate encontrar uma que passe na validacao.
 */
export function findBoletoLine(text: string): BoletoInfo | null {
  if (!text) return null;

  // Candidatos: trechos com digitos, pontos e espacos, longos o bastante para
  // conter 47 digitos.
  const candidatos = text.match(/[\d][\d.\s]{45,80}[\d]/g) ?? [];

  for (const candidato of candidatos) {
    const info = decodeBoletoLine(candidato);
    if (info) return info;
  }

  // Ultimo recurso: o OCR pode ter juntado tudo numa linha so, sem separadores
  // reconheciveis. Varre janelas de 47 digitos sobre a sequencia inteira.
  const somenteDigitos = text.replace(/\D/g, '');
  for (let inicio = 0; inicio + 47 <= somenteDigitos.length; inicio += 1) {
    const info = decodeBoletoLine(somenteDigitos.slice(inicio, inicio + 47));
    if (info) return info;
  }

  return null;
}
