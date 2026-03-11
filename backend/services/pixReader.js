// ================================================================
// PIX READER - Decodifica QR Codes PIX de imagens
// Usa jsQR para leitura do QR e interpreta o payload PIX (EMV)
// ================================================================

const fs = require('fs');
const path = require('path');

/**
 * Lê QR Code de uma imagem
 * @param {string} imagePath - Caminho da imagem
 * @returns {string|null} Conteúdo do QR Code
 */
async function lerQRCode(imagePath) {
    try {
        const jsQR = require('jsqr');
        const Jimp = require('jimp');

        // Carrega e redimensiona com jimp (puro JS, sem binários nativos)
        const img = await Jimp.read(imagePath);
        img.resize(800, 800, Jimp.RESIZE_CONTAIN);

        const { width, height } = img.bitmap;
        // Jimp usa RGBA internamente
        const data = new Uint8ClampedArray(img.bitmap.data);

        const code = jsQR(data, width, height);
        return code ? code.data : null;
    } catch (err) {
        console.error('Erro ao ler QR Code:', err.message);
        return null;
    }
}

// ── PARSER DO PAYLOAD PIX EMV ────────────────────────────────────
/**
 * Parseia payload PIX no formato EMV QRCPS-MPM
 * Formato: TTLL...TTLL... onde TT=tag (2 dígitos), LL=tamanho (2 dígitos)
 */
function parsearPayloadPIX(payload) {
    const result = {};
    let pos = 0;

    while (pos < payload.length - 4) {
        const tag = payload.substring(pos, pos + 2);
        const len = parseInt(payload.substring(pos + 2, pos + 4));

        if (isNaN(len)) break;

        const val = payload.substring(pos + 4, pos + 4 + len);
        result[tag] = val;
        pos += 4 + len;
    }

    return result;
}

/**
 * Extrai informações do payload PIX
 */
function extrairInfoPIX(payload) {
    if (!payload) return null;

    const parsed = parsearPayloadPIX(payload);

    const info = {
        tipo: 'pix',
        payload_bruto: payload,
        chave_pix: null,
        nome_recebedor: null,
        cidade: null,
        valor: null,
        descricao: null,
        txid: null,
        instituicao: null,
    };

    // Tag 26 = Merchant Account Information (dados PIX)
    if (parsed['26']) {
        const tag26 = parsearPayloadPIX(parsed['26']);
        // Tag 01 dentro de 26 = chave PIX
        if (tag26['01']) info.chave_pix = tag26['01'];
        // Tag 02 = descrição/mensagem
        if (tag26['02']) info.descricao = tag26['02'];
    }

    // Tag 54 = valor
    if (parsed['54']) {
        const v = parseFloat(parsed['54']);
        if (!isNaN(v)) info.valor = v;
    }

    // Tag 59 = nome do recebedor
    if (parsed['59']) info.nome_recebedor = parsed['59'].trim();

    // Tag 60 = cidade
    if (parsed['60']) info.cidade = parsed['60'].trim();

    // Tag 62 = informações adicionais
    if (parsed['62']) {
        const tag62 = parsearPayloadPIX(parsed['62']);
        if (tag62['05']) info.txid = tag62['05'];
        if (tag62['08']) info.descricao = tag62['08'] || info.descricao;
    }

    // Define descrição da despesa
    if (!info.descricao && info.nome_recebedor) {
        info.descricao = `PIX para ${info.nome_recebedor}`;
    } else if (!info.descricao) {
        info.descricao = 'Pagamento via PIX';
    }

    // Identifica tipo de chave PIX
    if (info.chave_pix) {
        info.tipo_chave = identificarTipoChavePIX(info.chave_pix);
    }

    return info;
}

function identificarTipoChavePIX(chave) {
    if (!chave) return 'desconhecido';
    if (/^\+?55\d{10,11}$/.test(chave.replace(/\D/g, ''))) return 'telefone';
    if (/^\d{11}$/.test(chave.replace(/\D/g, ''))) return 'cpf';
    if (/^\d{14}$/.test(chave.replace(/\D/g, ''))) return 'cnpj';
    if (/^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(chave)) return 'email';
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chave)) return 'aleatoria';
    return 'desconhecido';
}

/**
 * Processa imagem e retorna dados PIX
 */
async function processarQRCodePIX(imagePath) {
    const payload = await lerQRCode(imagePath);

    if (!payload) {
        return {
            sucesso: false,
            erro: 'Nenhum QR Code encontrado na imagem.',
        };
    }

    // Verifica se é PIX (começa com 000201 - formato EMV)
    if (!payload.startsWith('000201') && !payload.includes('br.gov.bcb.pix')) {
        return {
            sucesso: false,
            erro: 'QR Code encontrado não é um PIX válido.',
            payload_bruto: payload,
        };
    }

    const info = extrairInfoPIX(payload);

    if (!info) {
        return {
            sucesso: false,
            erro: 'Não foi possível interpretar o payload PIX.',
            payload_bruto: payload,
        };
    }

    return {
        sucesso: true,
        ...info,
        // Dados já formatados para criar despesa
        despesa: {
            descricao: info.descricao,
            valor: info.valor,
            forma_pagamento: 'pix',
            data: new Date().toISOString().split('T')[0],
            vencimento: null,
            parcelas: 1,
            categoria: null, // será inferida pela categoryAI
        }
    };
}

/**
 * Processa texto PIX (string do QR Code já decodificado)
 */
function processarTextoPIX(payload) {
    if (!payload) return { sucesso: false, erro: 'Payload vazio.' };

    const info = extrairInfoPIX(payload);
    if (!info) return { sucesso: false, erro: 'Payload inválido.' };

    return {
        sucesso: true,
        ...info,
        despesa: {
            descricao: info.descricao,
            valor: info.valor,
            forma_pagamento: 'pix',
            data: new Date().toISOString().split('T')[0],
            vencimento: null,
            parcelas: 1,
        }
    };
}

module.exports = {
    processarQRCodePIX,
    processarTextoPIX,
    lerQRCode,
    extrairInfoPIX,
    parsearPayloadPIX,
};
