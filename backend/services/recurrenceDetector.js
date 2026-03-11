// ================================================================
// RECURRENCE DETECTOR - Detecta padrões de despesas recorrentes
// Analisa histórico do usuário e sugere criação de recorrências
// ================================================================

const { query } = require('../config/database');

/**
 * Busca despesas dos últimos N meses para análise
 */
async function buscarHistoricoDespesas(usuarioId, meses = 4) {
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = hoje.getMonth(); // 0-11

    // Calcula período de análise
    const inicio = new Date(hoje);
    inicio.setMonth(inicio.getMonth() - meses);

    try {
        const result = await query(
            `SELECT
                id, descricao, valor, mes, ano,
                EXTRACT(DAY FROM data_vencimento) as dia_vencimento,
                categoria_id, forma_pagamento, recorrente,
                grupo_parcelamento_id
             FROM despesas
             WHERE usuario_id = $1
               AND (ano > $2 OR (ano = $2 AND mes >= $3))
               AND recorrente = false
               AND grupo_parcelamento_id IS NULL
             ORDER BY descricao, ano, mes`,
            [usuarioId, inicio.getFullYear(), inicio.getMonth()]
        );

        return result.rows;
    } catch (err) {
        console.error('Erro ao buscar histórico:', err.message);
        return [];
    }
}

/**
 * Normaliza descrição para comparação
 */
function normalizarDescricao(descricao) {
    return String(descricao || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Calcula similaridade entre duas strings (Jaccard)
 */
function calcularSimilaridade(a, b) {
    const wordsA = new Set(a.split(' '));
    const wordsB = new Set(b.split(' '));

    const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
    const union = new Set([...wordsA, ...wordsB]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
}

/**
 * Agrupa despesas por similaridade de descrição
 */
function agruparPorDescricao(despesas) {
    const grupos = {};

    for (const despesa of despesas) {
        const desc = normalizarDescricao(despesa.descricao);
        let encontrado = false;

        for (const [chave, grupo] of Object.entries(grupos)) {
            const similaridade = calcularSimilaridade(desc, chave);
            if (similaridade >= 0.6) {
                grupo.push(despesa);
                encontrado = true;
                break;
            }
        }

        if (!encontrado) {
            grupos[desc] = [despesa];
        }
    }

    return grupos;
}

/**
 * Analisa um grupo de despesas para detectar recorrência
 */
function analisarGrupo(descricao, despesas) {
    if (despesas.length < 2) return null;

    // Organiza por mês/ano
    const porMes = {};
    for (const d of despesas) {
        const chave = `${d.ano}-${String(d.mes).padStart(2,'0')}`;
        if (!porMes[chave]) porMes[chave] = [];
        porMes[chave].push(d);
    }

    const mesesComDespesa = Object.keys(porMes).sort();

    if (mesesComDespesa.length < 2) return null;

    // Verifica se aparece todo mês (ou quase)
    const totalMesesTotais = mesesComDespesa.length;

    // Calcula valor médio e desvio
    const valores = despesas.map(d => parseFloat(d.valor));
    const valorMedio = valores.reduce((s, v) => s + v, 0) / valores.length;
    const desvio = Math.sqrt(
        valores.map(v => Math.pow(v - valorMedio, 2))
            .reduce((s, v) => s + v, 0) / valores.length
    );
    const coefVariacao = valorMedio > 0 ? desvio / valorMedio : 1;

    // Dia de vencimento mais comum
    const diasVencimento = despesas
        .map(d => parseInt(d.dia_vencimento))
        .filter(d => d >= 1 && d <= 31);
    const diaMap = {};
    for (const dia of diasVencimento) {
        diaMap[dia] = (diaMap[dia] || 0) + 1;
    }
    const diaMaisComum = Object.entries(diaMap)
        .sort(([, a], [, b]) => b - a)[0]?.[0];

    // Score de recorrência (0-100)
    let score = 0;

    // Frequência mensal
    score += Math.min(totalMesesTotais / 4, 1) * 40;

    // Consistência de valor (valor similar todo mês)
    if (coefVariacao < 0.05) score += 30; // muito consistente
    else if (coefVariacao < 0.15) score += 20;
    else if (coefVariacao < 0.30) score += 10;

    // Dia de vencimento consistente
    const maxFreqDia = Math.max(...Object.values(diaMap));
    if (maxFreqDia / diasVencimento.length >= 0.8) score += 30;
    else if (maxFreqDia / diasVencimento.length >= 0.6) score += 15;

    if (score < 50) return null;

    return {
        descricao: despesas[0].descricao,
        valor_medio: parseFloat(valorMedio.toFixed(2)),
        valor_variacao: parseFloat(coefVariacao.toFixed(3)),
        dia_vencimento: diaMaisComum ? parseInt(diaMaisComum) : null,
        frequencia: 'mensal',
        meses_detectados: totalMesesTotais,
        score,
        categoria_id: despesas[0].categoria_id,
        forma_pagamento: despesas[0].forma_pagamento,
        confianca: score >= 80 ? 'alta' : score >= 60 ? 'media' : 'baixa',
    };
}

/**
 * Detecta despesas recorrentes no histórico do usuário
 * @param {number} usuarioId
 * @returns {Array} Lista de sugestões de recorrência
 */
async function detectarRecorrencias(usuarioId) {
    const despesas = await buscarHistoricoDespesas(usuarioId, 5);

    if (despesas.length === 0) return [];

    const grupos = agruparPorDescricao(despesas);
    const sugestoes = [];

    for (const [desc, grupo] of Object.entries(grupos)) {
        const analise = analisarGrupo(desc, grupo);
        if (analise) {
            sugestoes.push(analise);
        }
    }

    // Ordena por score decrescente
    return sugestoes.sort((a, b) => b.score - a.score);
}

/**
 * Salva uma recorrência sugerida/confirmada
 */
async function salvarRecorrencia(usuarioId, recorrencia) {
    try {
        await query(
            `INSERT INTO recorrencias_ia
                (usuario_id, descricao, valor, dia_vencimento, frequencia,
                 categoria_id, forma_pagamento, ativa)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true)
             ON CONFLICT (usuario_id, descricao) DO UPDATE SET
                valor = EXCLUDED.valor,
                dia_vencimento = EXCLUDED.dia_vencimento,
                ativa = true`,
            [
                usuarioId,
                recorrencia.descricao,
                recorrencia.valor_medio,
                recorrencia.dia_vencimento,
                recorrencia.frequencia || 'mensal',
                recorrencia.categoria_id,
                recorrencia.forma_pagamento || 'dinheiro',
            ]
        );
        return true;
    } catch (err) {
        console.error('Erro ao salvar recorrência:', err.message);
        return false;
    }
}

/**
 * Busca recorrências ativas do usuário
 */
async function buscarRecorrencias(usuarioId) {
    try {
        const result = await query(
            `SELECT r.*, c.nome as categoria_nome
             FROM recorrencias_ia r
             LEFT JOIN categorias c ON r.categoria_id = c.id
             WHERE r.usuario_id = $1 AND r.ativa = true
             ORDER BY r.dia_vencimento`,
            [usuarioId]
        );
        return result.rows;
    } catch {
        return [];
    }
}

module.exports = {
    detectarRecorrencias,
    salvarRecorrencia,
    buscarRecorrencias,
    agruparPorDescricao,
    analisarGrupo,
};
