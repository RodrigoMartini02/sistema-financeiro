// ================================================================
// OCR SERVICE - Extrai texto de imagens e PDFs
// Usa Tesseract.js para imagens e pdf-parse para PDFs
// ================================================================

const path = require('path');
const fs = require('fs');

/**
 * Extrai texto de imagem usando Tesseract.js
 */
async function extrairTextoImagem(filePath) {
    try {
        const Tesseract = require('tesseract.js');
        const { data: { text } } = await Tesseract.recognize(filePath, 'por', {
            logger: () => {} // silencia logs do tesseract
        });
        return text;
    } catch (err) {
        console.error('Erro OCR imagem:', err.message);
        throw new Error('Não foi possível ler o texto da imagem.');
    }
}

/**
 * Extrai texto de PDF usando pdf-parse
 */
async function extrairTextoPDF(filePath) {
    try {
        const pdfParse = require('pdf-parse');
        const buffer = fs.readFileSync(filePath);
        const data = await pdfParse(buffer);
        return data.text;
    } catch (err) {
        console.error('Erro ao ler PDF:', err.message);
        throw new Error('Não foi possível ler o PDF.');
    }
}

/**
 * Pré-processa imagem para melhorar qualidade do OCR
 * (converte para escala de cinza, aumenta contraste)
 */
async function preprocessarImagem(inputPath, outputPath) {
    try {
        const Jimp = require('jimp');
        const img = await Jimp.read(inputPath);
        img.greyscale().contrast(0.2).normalize();
        await img.writeAsync(outputPath);
        return outputPath;
    } catch (err) {
        console.warn('Jimp não disponível, usando imagem original:', err.message);
        return inputPath;
    }
}

/**
 * Extrai informações financeiras de texto bruto
 * Identifica: valor, data, empresa, vencimento, CPF/CNPJ
 */
function extrairInfoFinanceira(texto) {
    const info = {
        valor: null,
        data: null,
        vencimento: null,
        empresa: null,
        descricao: null,
        tipo: null,
        cnpj: null,
        cpf: null,
        numero_documento: null,
    };

    if (!texto) return info;

    const lines = texto.split('\n').map(l => l.trim()).filter(Boolean);

    // ── VALOR ──────────────────────────────────────────────────
    const valorPatterns = [
        /(?:valor|total|pagamento|cobrado?|pagar)\s*:?\s*R?\$?\s*([\d.,]+)/i,
        /R\$\s*([\d.,]+)/i,
        /(?:^|\s)([\d]{1,4}[.,][\d]{2})(?:\s|$)/m,
    ];

    for (const pattern of valorPatterns) {
        const m = texto.match(pattern);
        if (m) {
            const v = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
            if (!isNaN(v) && v > 0 && v < 1000000) {
                info.valor = v;
                break;
            }
        }
    }

    // ── VENCIMENTO ─────────────────────────────────────────────
    const vencPatterns = [
        /(?:vencimento|vence|validade|prazo)\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
        /data\s+de?\s+vencimento\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
    ];

    for (const pattern of vencPatterns) {
        const m = texto.match(pattern);
        if (m) {
            info.vencimento = normalizarDataOCR(m[1]);
            break;
        }
    }

    // ── DATA ────────────────────────────────────────────────────
    const dataPatterns = [
        /(?:data|emissão|emissao|emitido)\s*:?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
        /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/,
    ];

    for (const pattern of dataPatterns) {
        const m = texto.match(pattern);
        if (m && !info.data) {
            info.data = normalizarDataOCR(m[1]);
            if (info.data) break;
        }
    }

    // ── EMPRESA / DESTINATÁRIO ─────────────────────────────────
    const empresaPatterns = [
        /(?:favorecido|beneficiário|beneficiario|destinatário|empresa|estabelecimento|cedente)\s*:?\s*([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s&.,]+)/im,
        /(?:pago\s+a|pgto\s+a|pagamento\s+a)\s*:?\s*([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s&.,]+)/im,
    ];

    for (const pattern of empresaPatterns) {
        const m = texto.match(pattern);
        if (m) {
            info.empresa = m[1].trim().substring(0, 100);
            break;
        }
    }

    // ── CNPJ ───────────────────────────────────────────────────
    const cnpjM = texto.match(/\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[\-\s]?\d{2}/);
    if (cnpjM) info.cnpj = cnpjM[0].replace(/\D/g, '');

    // ── CPF ────────────────────────────────────────────────────
    const cpfM = texto.match(/\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\s]?\d{2}(?!\d)/);
    if (cpfM) info.cpf = cpfM[0].replace(/\D/g, '');

    // ── TIPO DE DOCUMENTO ──────────────────────────────────────
    if (/boleto/i.test(texto)) info.tipo = 'boleto';
    else if (/nota\s+fiscal|nf-?e|nfs-?e/i.test(texto)) info.tipo = 'nota_fiscal';
    else if (/comprovante\s+(?:de\s+)?(?:pix|pagamento|transf)/i.test(texto)) info.tipo = 'comprovante';
    else if (/recibo/i.test(texto)) info.tipo = 'recibo';
    else info.tipo = 'documento';

    // ── DESCRIÇÃO INFERIDA ────────────────────────────────────
    if (info.empresa) {
        info.descricao = info.empresa;
    } else if (info.tipo === 'boleto') {
        info.descricao = 'Pagamento de boleto';
    } else {
        // Tenta extrair linha mais relevante
        const relevante = lines.find(l =>
            l.length > 5 && l.length < 80 &&
            !/^\d/.test(l) &&
            !/R\$/.test(l) &&
            !/cnpj|cpf/i.test(l)
        );
        info.descricao = relevante?.substring(0, 100) || 'Documento financeiro';
    }

    return info;
}

function normalizarDataOCR(str) {
    if (!str) return null;
    // Normaliza separadores
    const normalizado = str.replace(/[\-\.]/g, '/').trim();
    const m = normalizado.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!m) return null;

    let [, dia, mes, ano] = m;
    if (ano.length === 2) ano = `20${ano}`;

    return `${ano}-${mes.padStart(2,'0')}-${dia.padStart(2,'0')}`;
}

/**
 * Processa arquivo financeiro (imagem ou PDF)
 * @param {string} filePath - Caminho do arquivo
 * @param {string} mimeType - MIME type do arquivo
 * @returns {Object} Informações extraídas
 */
async function processarArquivo(filePath, mimeType) {
    let textoExtraido = '';

    try {
        if (mimeType === 'application/pdf') {
            textoExtraido = await extrairTextoPDF(filePath);
        } else if (mimeType.startsWith('image/')) {
            // Pré-processa imagem para melhor OCR
            const dir = path.dirname(filePath);
            const nome = path.basename(filePath, path.extname(filePath));
            const processadoPath = path.join(dir, `${nome}_proc.png`);

            const imagemFinal = await preprocessarImagem(filePath, processadoPath);
            textoExtraido = await extrairTextoImagem(imagemFinal);

            // Remove arquivo temporário
            if (imagemFinal !== filePath && fs.existsSync(imagemFinal)) {
                fs.unlinkSync(imagemFinal);
            }
        } else {
            throw new Error(`Tipo de arquivo não suportado: ${mimeType}`);
        }

        const info = extrairInfoFinanceira(textoExtraido);
        info.texto_bruto = textoExtraido.substring(0, 2000);

        return { sucesso: true, ...info };

    } catch (err) {
        return {
            sucesso: false,
            erro: err.message,
            texto_bruto: textoExtraido,
            descricao: 'Documento financeiro',
            valor: null,
            data: null,
            vencimento: null,
            empresa: null,
        };
    }
}

module.exports = {
    processarArquivo,
    extrairTextoImagem,
    extrairTextoPDF,
    extrairInfoFinanceira,
};
