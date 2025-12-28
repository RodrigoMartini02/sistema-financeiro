const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

router.get('/', authMiddleware, async (req, res) => {
    try {
        const { mes, ano } = req.query;
        
        let whereClause = 'WHERE usuario_id = $1';
        let params = [req.usuario.id];
        
        if (mes !== undefined && ano !== undefined) {
            whereClause += ' AND mes = $2 AND ano = $3';
            params.push(parseInt(mes), parseInt(ano));
        }
        
        const result = await query(
            `SELECT * FROM receitas ${whereClause} ORDER BY data_recebimento DESC`,
            params
        );
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Erro ao buscar receitas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar receitas'
        });
    }
});

router.post('/', authMiddleware, [
    body('descricao').notEmpty().withMessage('Descrição é obrigatória'),
    body('valor').isFloat({ min: 0.01 }).withMessage('Valor deve ser maior que zero'),
    body('data_recebimento').isISO8601().withMessage('Data inválida'),
    body('mes').isInt({ min: 0, max: 11 }).withMessage('Mês inválido'),
    body('ano').isInt({ min: 2000 }).withMessage('Ano inválido')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        
        const { descricao, valor, data_recebimento, mes, ano, observacoes } = req.body;
        
        const result = await query(
            `INSERT INTO receitas (usuario_id, descricao, valor, data_recebimento, mes, ano, observacoes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [req.usuario.id, descricao, parseFloat(valor), data_recebimento, mes, ano, observacoes || null]
        );
        
        res.status(201).json({
            success: true,
            message: 'Receita cadastrada com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao criar receita:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao criar receita'
        });
    }
});

router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { descricao, valor, data_recebimento, observacoes } = req.body;
        
        const result = await query(
            `UPDATE receitas 
             SET descricao = $1, valor = $2, data_recebimento = $3, observacoes = $4
             WHERE id = $5 AND usuario_id = $6
             RETURNING *`,
            [descricao, parseFloat(valor), data_recebimento, observacoes, id, req.usuario.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Receita não encontrada'
            });
        }
        
        res.json({
            success: true,
            message: 'Receita atualizada com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao atualizar receita:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar receita'
        });
    }
});

router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await query(
            'DELETE FROM receitas WHERE id = $1 AND usuario_id = $2 RETURNING *',
            [id, req.usuario.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Receita não encontrada'
            });
        }
        
        res.json({
            success: true,
            message: 'Receita excluída com sucesso'
        });
        
    } catch (error) {
        console.error('Erro ao excluir receita:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao excluir receita'
        });
    }
});

module.exports = router;