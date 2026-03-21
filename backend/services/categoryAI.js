// ================================================================
// CATEGORY AI - Classificação automática de categorias
// Aprende com o histórico do usuário
// ================================================================

const { query } = require('../config/database');
const { CATEGORIAS_KEYWORDS, inferirCategoria } = require('../utils/expenseNormalizer');

/**
 * Extrai regras de categoria de um texto de carta/instruções.
 * Detecta padrões como: "Palavras como 'X', 'Y' devem ser classificadas como categoria NomeCategoria"
 */
function extrairRegrasCategoriaDoTexto(texto) {
    if (!texto) return [];
    const regras = [];
    const patterns = [
        /palavras?\s+como\s+([\s\S]+?)\s+deve[nm]?\s+ser\s+classificad[ao]s?\s+como\s+categor[ií]a\s+([\w\sÀ-ÿ]+?)(?:\.|,|$|\n)/gi,
        /classifique\s+([\s\S]+?)\s+como\s+(?:categor[ií]a\s+)?([\w\sÀ-ÿ]+?)(?:\.|,|$|\n)/gi,
        /([\s\S]+?)\s+s[ãa]o\s+(?:da\s+)?categor[ií]a\s+([\w\sÀ-ÿ]+?)(?:\.|,|$|\n)/gi,
        /([\s\S]+?)\s+deve[nm]?\s+ser\s+(?:da\s+)?categor[ií]a\s+([\w\sÀ-ÿ]+?)(?:\.|,|$|\n)/gi,
    ];
    for (const pattern of patterns) {
        let m;
        while ((m = pattern.exec(texto)) !== null) {
            const palavrasRaw = m[1];
            const categoria = m[2].trim().replace(/\s+/g, ' ');
            const palavras = [];
            const quotedMatches = [...palavrasRaw.matchAll(/['"""''`]([^'"""''`]+)['"""''`]/g)];
            for (const qm of quotedMatches) palavras.push(qm[1].toLowerCase().trim());
            if (palavras.length === 0) {
                for (const p of palavrasRaw.split(/,|\s+e\s+/i)) {
                    const limpo = p.replace(/['"""''`]/g, '').trim().toLowerCase();
                    if (limpo.length > 1) palavras.push(limpo);
                }
            }
            if (palavras.length > 0 && categoria.length > 1) regras.push({ palavras, categoria });
        }
    }
    return regras;
}

/**
 * Busca o aprendizado de categorias do usuário no banco
 */
async function buscarAprendizado(usuarioId) {
    try {
        const result = await query(
            `SELECT texto, categoria, COUNT(*) as freq
             FROM aprendizado_categoria
             WHERE usuario_id = $1
             GROUP BY texto, categoria
             ORDER BY freq DESC`,
            [usuarioId]
        );
        return result.rows;
    } catch {
        return [];
    }
}

/**
 * Salva aprendizado: usuário mapeou texto X para categoria Y
 */
async function salvarAprendizado(usuarioId, texto, categoria) {
    if (!usuarioId || !texto || !categoria) return;

    try {
        await query(
            `INSERT INTO aprendizado_categoria (usuario_id, texto, categoria)
             VALUES ($1, $2, $3)`,
            [usuarioId, texto.toLowerCase().trim().substring(0, 100), categoria]
        );
    } catch (err) {
        console.error('Erro ao salvar aprendizado:', err.message);
    }
}

/**
 * Classifica categoria usando histórico do usuário + heurísticas
 * @param {string} descricao - Descrição da despesa
 * @param {number} usuarioId - ID do usuário
 * @param {string[]} categoriasDisponiveis - Categorias cadastradas pelo usuário
 * @returns {string} Categoria sugerida
 */
async function classificarCategoria(descricao, usuarioId, categoriasDisponiveis = [], instrucoesTexto = '') {
    if (!descricao) return 'Outros';
    const lower = descricao.toLowerCase();

    // 1. Verificar aprendizado do usuário (prioridade máxima)
    if (usuarioId) {
        const aprendizado = await buscarAprendizado(usuarioId);

        // Busca exata primeiro
        const exato = aprendizado.find(a => lower === a.texto);
        if (exato) return exato.categoria;

        // Busca parcial (a descrição contém o texto aprendido ou vice-versa)
        for (const item of aprendizado) {
            if (lower.includes(item.texto) || item.texto.includes(lower)) {
                return item.categoria;
            }
        }
    }

    // 2. Regras da carta de serviços / instruções personalizadas
    if (instrucoesTexto) {
        const regras = extrairRegrasCategoriaDoTexto(instrucoesTexto);
        for (const regra of regras) {
            if (regra.palavras.some(p => lower.includes(p))) {
                return regra.categoria;
            }
        }
    }

    // 3. Heurísticas por keywords
    const categoriaHeuristica = inferirCategoria(descricao);

    // 3. Se a categoria inferida existe nas disponíveis, usa ela
    if (categoriasDisponiveis.length > 0) {
        const match = categoriasDisponiveis.find(
            c => c.toLowerCase() === categoriaHeuristica.toLowerCase()
        );
        if (match) return match;

        // Tenta encontrar categoria mais próxima
        const proximidade = categoriasDisponiveis.find(c =>
            c.toLowerCase().includes(categoriaHeuristica.toLowerCase()) ||
            categoriaHeuristica.toLowerCase().includes(c.toLowerCase())
        );
        if (proximidade) return proximidade;

        // Retorna a primeira disponível se não encontrar nada
        const outros = categoriasDisponiveis.find(c => /outros/i.test(c));
        return outros || categoriasDisponiveis[0] || categoriaHeuristica;
    }

    return categoriaHeuristica;
}

/**
 * Sugere múltiplas categorias com scores
 */
function sugerirCategorias(descricao) {
    if (!descricao) return [];
    const lower = descricao.toLowerCase();
    const scores = {};

    for (const [categoria, keywords] of Object.entries(CATEGORIAS_KEYWORDS)) {
        let score = 0;
        for (const kw of keywords) {
            if (lower.includes(kw)) {
                score += kw.length; // palavras maiores têm mais peso
            }
        }
        if (score > 0) scores[categoria] = score;
    }

    return Object.entries(scores)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([cat, score]) => ({ categoria: cat, confianca: score }));
}

/**
 * Detecta e atualiza categorias favoritas
 * (categoria mais usada por forma de pagamento)
 */
async function atualizarCategoriasPopulares(usuarioId) {
    if (!usuarioId) return;
    try {
        const result = await query(
            `SELECT categoria_id, forma_pagamento, COUNT(*) as total
             FROM despesas
             WHERE usuario_id = $1 AND categoria_id IS NOT NULL
             GROUP BY categoria_id, forma_pagamento
             ORDER BY total DESC
             LIMIT 10`,
            [usuarioId]
        );
        return result.rows;
    } catch {
        return [];
    }
}

module.exports = {
    classificarCategoria,
    sugerirCategorias,
    salvarAprendizado,
    buscarAprendizado,
    atualizarCategoriasPopulares,
};
