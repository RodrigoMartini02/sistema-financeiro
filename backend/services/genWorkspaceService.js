'use strict';

const { query } = require('../config/database');

async function getPersonalInstructions(usuarioId) {
    const r = await query('SELECT dados_financeiros FROM usuarios WHERE id = $1', [usuarioId]);
    return r.rows[0]?.dados_financeiros?.instrucoes_gen || '';
}

async function savePersonalInstructions(usuarioId, conteudo) {
    await query(
        `UPDATE usuarios
         SET dados_financeiros = COALESCE(dados_financeiros, '{}'::jsonb) || jsonb_build_object('instrucoes_gen', $1::text)
         WHERE id = $2`,
        [String(conteudo || '').trim(), usuarioId]
    );
}

async function userType(usuarioId) {
    const r = await query('SELECT tipo FROM usuarios WHERE id = $1', [usuarioId]);
    return r.rows[0]?.tipo || null;
}

async function saveServiceLetter(conteudo) {
    await query(
        `UPDATE usuarios
         SET dados_financeiros = COALESCE(dados_financeiros, '{}'::jsonb) || jsonb_build_object('carta_servicos', $1::text)
         WHERE tipo = 'master'`,
        [conteudo]
    );
}

async function listGoals(usuarioId) {
    const r = await query('SELECT dados_financeiros FROM usuarios WHERE id = $1', [usuarioId]);
    return r.rows[0]?.dados_financeiros?.metas || [];
}

async function saveGoals(usuarioId, metas) {
    await query(
        `UPDATE usuarios
         SET dados_financeiros = COALESCE(dados_financeiros, '{}'::jsonb) || jsonb_build_object('metas', $1::jsonb)
         WHERE id = $2`,
        [JSON.stringify(metas), usuarioId]
    );
}

async function listBudgets(usuarioId) {
    const r = await query('SELECT dados_financeiros FROM usuarios WHERE id = $1', [usuarioId]);
    return r.rows[0]?.dados_financeiros?.orcamentos || [];
}

async function saveBudgets(usuarioId, orcamentos) {
    await query(
        `UPDATE usuarios
         SET dados_financeiros = COALESCE(dados_financeiros, '{}'::jsonb) || jsonb_build_object('orcamentos', $1::jsonb)
         WHERE id = $2`,
        [JSON.stringify(orcamentos), usuarioId]
    );
}

module.exports = {
    getPersonalInstructions,
    savePersonalInstructions,
    userType,
    saveServiceLetter,
    listGoals,
    saveGoals,
    listBudgets,
    saveBudgets,
};
