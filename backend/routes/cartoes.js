const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            'SELECT * FROM cartoes WHERE usuario_id = $1 ORDER BY nome ASC',
            [req.usuario.id]
        );
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Erro ao buscar cartões:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar cartões'
        });
    }
});

router.put('/', authMiddleware, async (req, res) => {
    try {
        const { cartoes } = req.body;
        
        if (!Array.isArray(cartoes)) {
            return res.status(400).json({
                success: false,
                message: 'Dados inválidos'
            });
        }
        
        await query('DELETE FROM cartoes WHERE usuario_id = $1', [req.usuario.id]);
        
        const resultados = [];
        
        for (const cartao of cartoes) {
            const result = await query(
                `INSERT INTO cartoes (usuario_id, nome, limite, dia_fechamento, dia_vencimento, cor)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *`,
                [
                    req.usuario.id,
                    cartao.nome,
                    parseFloat(cartao.limite),
                    parseInt(cartao.dia_fechamento),
                    parseInt(cartao.dia_vencimento),
                    cartao.cor || '#3498db'
                ]
            );
            resultados.push(result.rows[0]);
        }
        
        res.json({
            success: true,
            message: 'Cartões atualizados com sucesso',
            data: resultados
        });
        
    } catch (error) {
        console.error('Erro ao atualizar cartões:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar cartões'
        });
    }
});

router.get('/uso', authMiddleware, async (req, res) => {
    try {
        const { mes, ano } = req.query;
        
        if (!mes || !ano) {
            return res.status(400).json({
                success: false,
                message: 'Mês e ano são obrigatórios'
            });
        }
        
        const result = await query(
            `SELECT cartao_id, SUM(valor) as total_usado
             FROM despesas
             WHERE usuario_id = $1 AND mes = $2 AND ano = $3 AND cartao_id IS NOT NULL
             GROUP BY cartao_id`,
            [req.usuario.id, parseInt(mes), parseInt(ano)]
        );
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Erro ao calcular uso dos cartões:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao calcular uso dos cartões'
        });
    }
});

module.exports = router;