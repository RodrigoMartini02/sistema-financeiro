const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authenticate } = require('../middleware/auth');

// ================================================================
// LISTAR ANOS DO USUÁRIO
// ================================================================
router.get('/', authenticate, async (req, res) => {
    try {
        const result = await query(
            'SELECT DISTINCT ano FROM anos WHERE usuario_id = $1 ORDER BY ano DESC',
            [req.usuario.id]
        );

        res.json({
            success: true,
            data: result.rows.map(row => parseInt(row.ano))
        });

    } catch (error) {
        console.error('❌ Erro ao listar anos:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao listar anos',
            error: error.message
        });
    }
});

// ================================================================
// CRIAR ANO
// ================================================================
router.post('/', authenticate, async (req, res) => {
    try {
        const { ano } = req.body;

        if (!ano || ano < 2000 || ano > 2100) {
            return res.status(400).json({
                success: false,
                message: 'Ano inválido'
            });
        }

        // Verificar se ano já existe
        const existente = await query(
            'SELECT id FROM anos WHERE usuario_id = $1 AND ano = $2',
            [req.usuario.id, ano]
        );

        if (existente.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Ano já existe'
            });
        }

        // Criar ano
        const result = await query(
            'INSERT INTO anos (usuario_id, ano) VALUES ($1, $2) RETURNING *',
            [req.usuario.id, ano]
        );

        res.status(201).json({
            success: true,
            message: 'Ano criado com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Erro ao criar ano:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao criar ano',
            error: error.message
        });
    }
});

// ================================================================
// EXCLUIR ANO
// ================================================================
router.delete('/:ano', authenticate, async (req, res) => {
    try {
        const ano = parseInt(req.params.ano);

        if (!ano || ano < 2000 || ano > 2100) {
            return res.status(400).json({
                success: false,
                message: 'Ano inválido'
            });
        }

        // Excluir receitas do ano
        await query(
            'DELETE FROM receitas WHERE usuario_id = $1 AND ano = $2',
            [req.usuario.id, ano]
        );

        // Excluir despesas do ano
        await query(
            'DELETE FROM despesas WHERE usuario_id = $1 AND ano = $2',
            [req.usuario.id, ano]
        );

        // Excluir ano
        await query(
            'DELETE FROM anos WHERE usuario_id = $1 AND ano = $2',
            [req.usuario.id, ano]
        );

        res.json({
            success: true,
            message: 'Ano excluído com sucesso'
        });

    } catch (error) {
        console.error('❌ Erro ao excluir ano:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao excluir ano',
            error: error.message
        });
    }
});

module.exports = router;
