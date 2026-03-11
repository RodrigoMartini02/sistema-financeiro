// ================================================================
// BOLETO PARSER - Interpreta linha digitável de boleto bancário
// Suporte ao padrão FEBRABAN (bancário e convênio)
// ================================================================

// Tabela de bancos brasileiros mais comuns
const BANCOS = {
    '001': 'Banco do Brasil',
    '003': 'Banco da Amazônia',
    '004': 'BNB',
    '007': 'BNDES',
    '033': 'Santander',
    '036': 'Banco BBI',
    '041': 'Banrisul',
    '047': 'Banese',
    '069': 'Crefisa',
    '077': 'Banco Inter',
    '084': 'Uniprime',
    '085': 'Coop Central',
    '097': 'Credisis',
    '099': 'Uniprime Central',
    '104': 'Caixa Econômica Federal',
    '133': 'Cresol',
    '136': 'Unicred',
    '197': 'Stone',
    '208': 'BTG Pactual',
    '212': 'Banco Original',
    '218': 'BS2',
    '237': 'Bradesco',
    '243': 'Banco Master',
    '260': 'Nu Pagamentos (Nubank)',
    '290': 'PagBank',
    '318': 'Banco BMG',
    '336': 'C6 Bank',
    '341': 'Itaú',
    '348': 'XP Investimentos',
    '356': 'Safra',
    '389': 'Banco Mercantil',
    '399': 'HSBC',
    '422': 'Safra',
    '456': 'Banco MUFG Brasil',
    '464': 'Banco Sumitomo',
    '473': 'Banco Caixa Geral',
    '477': 'Citibank',
    '479': 'ItauBank',
    '487': 'Deutsche Bank',
    '495': 'La Nacion',
    '505': 'Credireal',
    '600': 'Luso Brasileiro',
    '604': 'Industrial do Brasil',
    '610': 'VR Pagamentos',
    '611': 'Paulista',
    '612': 'Guanabara',
    '623': 'Panamericano',
    '626': 'C6 Consignado',
    '630': 'Intercap',
    '633': 'Rendimento',
    '634': 'Triangulo',
    '637': 'Sofisa',
    '641': 'Excel',
    '643': 'Pine',
    '652': 'Itaú Unibanco',
    '653': 'Indusval',
    '655': 'Votorantim',
    '707': 'Daycoval',
    '739': 'BNY',
    '741': 'Ribeirão Preto',
    '743': 'Semear',
    '745': 'Citibank',
    '746': 'Modal',
    '747': 'Rabobank',
    '748': 'Sicredi',
    '751': 'Scotia',
    '752': 'BNP Paribas',
    '753': 'NBC Bank',
    '755': 'Bank of America',
    '756': 'Bancoob (SICOOB)',
    '757': 'KEB Hana',
};

/**
 * Remove caracteres não numéricos e espaços extras
 */
function limparLinha(linha) {
    return String(linha || '').replace(/[\s\.\-]/g, '');
}

/**
 * Detecta se é boleto bancário (44 dígitos) ou de convênio/concessionária (47 dígitos)
 */
function detectarTipoBoleto(linha) {
    const limpa = limparLinha(linha);

    // Linha digitável tem 47 dígitos (bancário) ou 48 (convênio)
    // Código de barras tem 44 dígitos
    if (/^\d{47,48}$/.test(limpa)) return 'linha_digitavel';
    if (/^\d{44}$/.test(limpa)) return 'codigo_barras';

    // Formato com pontos: XXXXX.XXXXX XXXXX.XXXXXX XXXXX.XXXXXX X XXXXXXXXXXXXXXXXX
    if (/^\d{5}\.\d{5}\s\d{5}\.\d{6}\s\d{5}\.\d{6}\s\d\s\d{14}$/.test(linha.trim())) {
        return 'linha_digitavel_formatada';
    }

    return null;
}

/**
 * Converte linha digitável para código de barras
 */
function linhaParaCodigoBarras(linha) {
    const limpa = limparLinha(linha);

    if (limpa.length !== 47) return null;

    // Campos da linha digitável:
    // Campo 1: posições 1-9 (banco + moeda + nosso número início + dígito)
    // Campo 2: posições 10-19 (nosso número + dígito)
    // Campo 3: posições 21-30 (nosso número + dígito)
    // Campo 4: posição 31 (dígito verificador)
    // Campo 5: posições 32-47 (data vencimento + valor)

    const campo1 = limpa.substring(0, 9);
    const campo2 = limpa.substring(10, 20);
    const campo3 = limpa.substring(21, 31);
    const campo4 = limpa.substring(31, 32);
    const campo5 = limpa.substring(32, 47);

    // Remonta o código de barras
    const banco = campo1.substring(0, 3);
    const moeda = campo1.substring(3, 4);
    const livre1 = campo1.substring(4, 9);
    const livre2 = campo2.substring(0, 10);
    const livre3 = campo3.substring(0, 10);

    // Código de barras: banco(3) + moeda(1) + dígito(1) + vencimento(4) + valor(10) + livre(25)
    // O campo 5 contém: fator vencimento(4) + valor(10)
    const fatorVenc = campo5.substring(0, 4);
    const valorStr = campo5.substring(4, 14);

    return {
        banco,
        moeda,
        fatorVencimento: fatorVenc,
        valorStr,
        livreFormatado: livre1 + livre2 + livre3,
        codigoCompleto: banco + moeda + campo4 + fatorVenc + valorStr + livre1 + livre2.substring(0, 10) + livre3.substring(0, 10),
    };
}

/**
 * Calcula data de vencimento a partir do fator
 * Fator 0000 = sem vencimento
 * Data base: 07/10/1997
 */
function calcularVencimento(fatorVencimento) {
    const fator = parseInt(fatorVencimento);
    if (!fator || fator === 0) return null;

    const dataBase = new Date('1997-10-07');
    dataBase.setDate(dataBase.getDate() + fator);

    const ano = dataBase.getFullYear();
    const mes = String(dataBase.getMonth() + 1).padStart(2, '0');
    const dia = String(dataBase.getDate()).padStart(2, '0');

    return `${ano}-${mes}-${dia}`;
}

/**
 * Extrai valor do boleto
 */
function extrairValor(valorStr) {
    const v = parseInt(valorStr);
    if (isNaN(v) || v === 0) return null;
    return v / 100; // Os 2 últimos dígitos são centavos
}

/**
 * Parseia linha digitável completa
 * @param {string} linha - Linha digitável do boleto
 * @returns {Object} Informações extraídas
 */
function parsearBoleto(linha) {
    if (!linha) {
        return { sucesso: false, erro: 'Linha digitável não informada.' };
    }

    const tipo = detectarTipoBoleto(linha);

    if (!tipo) {
        return {
            sucesso: false,
            erro: 'Formato de boleto não reconhecido. Informe a linha digitável com 47 dígitos.',
            linha_recebida: linha.trim()
        };
    }

    const limpa = limparLinha(linha);

    try {
        // Para linha digitável bancária (47 dígitos)
        if (tipo === 'linha_digitavel' || tipo === 'linha_digitavel_formatada') {
            const dados = linhaParaCodigoBarras(limpa);

            if (!dados) {
                return { sucesso: false, erro: 'Não foi possível decodificar a linha digitável.' };
            }

            const banco = dados.banco;
            const nomeBanco = BANCOS[banco] || `Banco ${banco}`;
            const vencimento = calcularVencimento(dados.fatorVencimento);
            const valor = extrairValor(dados.valorStr);

            return {
                sucesso: true,
                tipo: 'boleto_bancario',
                banco_codigo: banco,
                banco_nome: nomeBanco,
                valor,
                vencimento,
                linha_digitavel: formatarLinhaDigitavel(limpa),
                linha_limpa: limpa,
                // Dados para criar despesa
                despesa: {
                    descricao: `Boleto ${nomeBanco}`,
                    valor,
                    forma_pagamento: 'boleto',
                    vencimento,
                    data: new Date().toISOString().split('T')[0],
                    parcelas: 1,
                    categoria: 'Finanças',
                }
            };
        }

        return { sucesso: false, erro: 'Tipo de boleto não suportado.' };

    } catch (err) {
        return { sucesso: false, erro: `Erro ao processar boleto: ${err.message}` };
    }
}

/**
 * Formata linha digitável no padrão visual: XXXXX.XXXXX XXXXX.XXXXXX XXXXX.XXXXXX X XXXXXXXXXXXXXXXXX
 */
function formatarLinhaDigitavel(limpa) {
    if (limpa.length !== 47) return limpa;
    return `${limpa.substring(0,5)}.${limpa.substring(5,10)} ` +
           `${limpa.substring(10,15)}.${limpa.substring(15,21)} ` +
           `${limpa.substring(21,26)}.${limpa.substring(26,32)} ` +
           `${limpa.substring(32,33)} ` +
           `${limpa.substring(33,47)}`;
}

/**
 * Extrai linha digitável de texto (OCR ou digitado pelo usuário)
 */
function encontrarLinhaDigitavel(texto) {
    if (!texto) return null;

    // Remove espaços e formatação, busca sequências numéricas longas
    const semEspacos = texto.replace(/\s+/g, '');

    // Padrão: 47 dígitos contínuos
    const match47 = semEspacos.match(/\d{47}/);
    if (match47) return match47[0];

    // Padrão: com pontos e espaços
    const matchFormatado = texto.match(
        /\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14}/
    );
    if (matchFormatado) return limparLinha(matchFormatado[0]);

    return null;
}

module.exports = {
    parsearBoleto,
    encontrarLinhaDigitavel,
    detectarTipoBoleto,
    formatarLinhaDigitavel,
    calcularVencimento,
    BANCOS,
};
