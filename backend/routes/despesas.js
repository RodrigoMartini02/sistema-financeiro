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
            `SELECT * FROM despesas ${whereClause} ORDER BY data_vencimento ASC`,
            params
        );
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Erro ao buscar despesas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar despesas'
        });
    }
});

router.post('/', authMiddleware, [
    body('descricao').notEmpty().withMessage('Descrição é obrigatória'),
    body('valor').isFloat({ min: 0.01 }).withMessage('Valor deve ser maior que zero'),
    body('data_vencimento').isISO8601().withMessage('Data inválida'),
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
        
        const { 
            descricao, valor, data_vencimento, data_compra, data_pagamento,
            mes, ano, categoria_id, cartao_id, forma_pagamento,
            parcelado, numero_parcelas, parcela_atual, observacoes, pago
        } = req.body;
        
        const result = await query(
            `INSERT INTO despesas (
                usuario_id, descricao, valor, data_vencimento, data_compra, data_pagamento,
                mes, ano, categoria_id, cartao_id, forma_pagamento,
                parcelado, numero_parcelas, parcela_atual, observacoes, pago
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING *`,
            [
                req.usuario.id, descricao, parseFloat(valor), data_vencimento, 
                data_compra || null, data_pagamento || null, mes, ano,
                categoria_id || null, cartao_id || null, forma_pagamento || 'dinheiro',
                parcelado || false, numero_parcelas || null, parcela_atual || null,
                observacoes || null, pago || false
            ]
        );
        
        res.status(201).json({
            success: true,
            message: 'Despesa cadastrada com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao criar despesa:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao criar despesa'
        });
    }
});

router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            descricao, valor, data_vencimento, data_compra, data_pagamento,
            categoria_id, cartao_id, forma_pagamento, observacoes, pago
        } = req.body;
        
        const result = await query(
            `UPDATE despesas 
             SET descricao = $1, valor = $2, data_vencimento = $3, data_compra = $4,
                 data_pagamento = $5, categoria_id = $6, cartao_id = $7,
                 forma_pagamento = $8, observacoes = $9, pago = $10
             WHERE id = $11 AND usuario_id = $12
             RETURNING *`,
            [
                descricao, parseFloat(valor), data_vencimento, data_compra,
                data_pagamento, categoria_id, cartao_id, forma_pagamento,
                observacoes, pago, id, req.usuario.id
            ]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Despesa não encontrada'
            });
        }
        
        res.json({
            success: true,
            message: 'Despesa atualizada com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao atualizar despesa:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar despesa'
        });
    }
});

router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await query(
            'DELETE FROM despesas WHERE id = $1 AND usuario_id = $2 RETURNING *',
            [id, req.usuario.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Despesa não encontrada'
            });
        }
        
        res.json({
            success: true,
            message: 'Despesa excluída com sucesso'
        });
        
    } catch (error) {
        console.error('Erro ao excluir despesa:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao excluir despesa'
        });
    }
});

router.post('/:id/pagar', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { data_pagamento } = req.body;
        
        const result = await query(
            `UPDATE despesas 
             SET pago = true, data_pagamento = $1
             WHERE id = $2 AND usuario_id = $3
             RETURNING *`,
            [data_pagamento || new Date().toISOString().split('T')[0], id, req.usuario.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Despesa não encontrada'
            });
        }
        
        res.json({
            success: true,
            message: 'Despesa marcada como paga',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao marcar despesa como paga:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao processar pagamento'
        });
    }
});

module.exports = router;