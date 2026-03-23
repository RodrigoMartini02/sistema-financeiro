const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// ================================================================
// GET / — listar perfis ativos do usuário logado
// ================================================================
router.get('/', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            `SELECT id, usuario_id, tipo, nome, documento, razao_social, nome_fantasia, atividade, aporte_inicial, ativo, data_criacao
             FROM perfis
             WHERE usuario_id = $1 AND ativo = true
             ORDER BY tipo ASC, id ASC`,
            [req.usuario.id]
        );

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Erro ao buscar perfis:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar perfis'
        });
    }
});

// ================================================================
// POST / — criar nova empresa (tipo='empresa')
// ================================================================
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { nome, documento, razao_social, nome_fantasia, atividade, aporte_inicial } = req.body;

        if (!nome || nome.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Nome é obrigatório'
            });
        }

        // CNPJ obrigatório para empresa — deve ter 14 dígitos após limpar formatação
        const cnpjLimpo = (documento || '').replace(/\D/g, '');
        if (cnpjLimpo.length !== 14) {
            return res.status(400).json({
                success: false,
                message: 'CNPJ inválido. Informe os 14 dígitos.'
            });
        }

        const result = await query(
            `INSERT INTO perfis (usuario_id, tipo, nome, documento, razao_social, nome_fantasia, atividade, aporte_inicial)
             VALUES ($1, 'empresa', $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [req.usuario.id, nome.trim(), cnpjLimpo, razao_social || null, nome_fantasia || null, atividade || null, aporte_inicial || null]
        );

        res.status(201).json({
            success: true,
            message: 'Empresa criada com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Erro ao criar empresa:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao criar empresa'
        });
    }
});

// ================================================================
// PUT /:id — editar empresa (nome, documento)
// ================================================================
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, documento, razao_social, nome_fantasia, atividade, aporte_inicial } = req.body;

        if (!nome || nome.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Nome é obrigatório'
            });
        }

        const cnpjLimpo = (documento || '').replace(/\D/g, '');
        if (cnpjLimpo.length !== 14) {
            return res.status(400).json({
                success: false,
                message: 'CNPJ inválido. Informe os 14 dígitos.'
            });
        }

        // Verificar que pertence ao usuário e não é pessoal
        const perfilResult = await query(
            'SELECT id, tipo FROM perfis WHERE id = $1 AND usuario_id = $2',
            [id, req.usuario.id]
        );

        if (perfilResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Perfil não encontrado'
            });
        }

        if (perfilResult.rows[0].tipo === 'pessoal') {
            return res.status(400).json({
                success: false,
                message: 'Não é possível editar o perfil pessoal'
            });
        }

        const result = await query(
            `UPDATE perfis SET nome = $1, documento = $2, razao_social = $3, nome_fantasia = $4, atividade = $5, aporte_inicial = $6
             WHERE id = $7 AND usuario_id = $8
             RETURNING *`,
            [nome.trim(), cnpjLimpo, razao_social || null, nome_fantasia || null, atividade || null, aporte_inicial || null, id, req.usuario.id]
        );

        res.json({
            success: true,
            message: 'Empresa atualizada com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Erro ao atualizar empresa:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar empresa'
        });
    }
});

// ================================================================
// DELETE /:id — arquivar empresa (ativo = false)
// ================================================================
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const perfilResult = await query(
            'SELECT id, tipo FROM perfis WHERE id = $1 AND usuario_id = $2',
            [id, req.usuario.id]
        );

        if (perfilResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Perfil não encontrado'
            });
        }

        if (perfilResult.rows[0].tipo === 'pessoal') {
            return res.status(400).json({
                success: false,
                message: 'Não é possível arquivar o perfil pessoal'
            });
        }

        await query(
            'UPDATE perfis SET ativo = false WHERE id = $1 AND usuario_id = $2',
            [id, req.usuario.id]
        );

        res.json({
            success: true,
            message: 'Empresa arquivada com sucesso'
        });

    } catch (error) {
        console.error('Erro ao arquivar empresa:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao arquivar empresa'
        });
    }
});

module.exports = router;
