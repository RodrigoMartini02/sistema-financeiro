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
            `SELECT * FROM reservas ${whereClause} ORDER BY data_criacao DESC`,
            params
        );
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Erro ao buscar reservas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar reservas'
        });
    }
});

router.post('/', authMiddleware, [
    body('valor').isFloat({ min: 0.01 }).withMessage('Valor deve ser maior que zero'),
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
        
        const { valor, mes, ano } = req.body;
        
        const result = await query(
            `INSERT INTO reservas (usuario_id, valor, mes, ano)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [req.usuario.id, parseFloat(valor), mes, ano]
        );
        
        res.status(201).json({
            success: true,
            message: 'Reserva criada com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao criar reserva:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao criar reserva'
        });
    }
});

router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await query(
            'DELETE FROM reservas WHERE id = $1 AND usuario_id = $2 RETURNING *',
            [id, req.usuario.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Reserva não encontrada'
            });
        }
        
        res.json({
            success: true,
            message: 'Reserva excluída com sucesso'
        });
        
    } catch (error) {
        console.error('Erro ao excluir reserva:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao excluir reserva'
        });
    }
});

module.exports = router;