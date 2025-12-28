const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

router.get('/', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            'SELECT * FROM categorias WHERE usuario_id = $1 ORDER BY nome ASC',
            [req.usuario.id]
        );
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Erro ao buscar categorias:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar categorias'
        });
    }
});

router.post('/', authMiddleware, [
    body('nome').notEmpty().withMessage('Nome é obrigatório'),
    body('cor').notEmpty().withMessage('Cor é obrigatória')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        
        const { nome, cor, icone } = req.body;
        
        const result = await query(
            `INSERT INTO categorias (usuario_id, nome, cor, icone)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [req.usuario.id, nome, cor, icone || null]
        );
        
        res.status(201).json({
            success: true,
            message: 'Categoria criada com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao criar categoria:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao criar categoria'
        });
    }
});

router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, cor, icone } = req.body;
        
        const result = await query(
            `UPDATE categorias 
             SET nome = $1, cor = $2, icone = $3
             WHERE id = $4 AND usuario_id = $5
             RETURNING *`,
            [nome, cor, icone, id, req.usuario.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Categoria não encontrada'
            });
        }
        
        res.json({
            success: true,
            message: 'Categoria atualizada com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao atualizar categoria:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar categoria'
        });
    }
});

router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await query(
            'DELETE FROM categorias WHERE id = $1 AND usuario_id = $2 RETURNING *',
            [id, req.usuario.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Categoria não encontrada'
            });
        }
        
        res.json({
            success: true,
            message: 'Categoria excluída com sucesso'
        });
        
    } catch (error) {
        console.error('Erro ao excluir categoria:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao excluir categoria'
        });
    }
});

module.exports = router;