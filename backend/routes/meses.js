const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// ================================================================
// GET /api/meses - Buscar todos os meses do usuário
// ================================================================
router.get('/', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            `SELECT ano, mes, fechado, saldo_final, data_fechamento
             FROM meses
             WHERE usuario_id = $1
             ORDER BY ano DESC, mes DESC`,
            [req.usuario.id]
        );

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Erro ao buscar meses:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar meses'
        });
    }
});

router.get('/:ano/:mes', authMiddleware, async (req, res) => {
    try {
        const { ano, mes } = req.params;
        
        const result = await query(
            `SELECT * FROM meses 
             WHERE usuario_id = $1 AND ano = $2 AND mes = $3`,
            [req.usuario.id, parseInt(ano), parseInt(mes)]
        );
        
        if (result.rows.length === 0) {
            return res.json({
                success: true,
                data: {
                    fechado: false,
                    saldo_anterior: 0,
                    saldo_final: 0
                }
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao buscar mês:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar dados do mês'
        });
    }
});

router.post('/:ano/:mes/fechar', authMiddleware, async (req, res) => {
    try {
        const { ano, mes } = req.params;
        const { saldo_final } = req.body;
        
        const existe = await query(
            'SELECT id FROM meses WHERE usuario_id = $1 AND ano = $2 AND mes = $3',
            [req.usuario.id, parseInt(ano), parseInt(mes)]
        );
        
        let result;
        
        if (existe.rows.length > 0) {
            result = await query(
                `UPDATE meses 
                 SET fechado = true, saldo_final = $1
                 WHERE usuario_id = $2 AND ano = $3 AND mes = $4
                 RETURNING *`,
                [parseFloat(saldo_final), req.usuario.id, parseInt(ano), parseInt(mes)]
            );
        } else {
            result = await query(
                `INSERT INTO meses (usuario_id, ano, mes, fechado, saldo_final, saldo_anterior)
                 VALUES ($1, $2, $3, true, $4, 0)
                 RETURNING *`,
                [req.usuario.id, parseInt(ano), parseInt(mes), parseFloat(saldo_final)]
            );
        }
        
        res.json({
            success: true,
            message: 'Mês fechado com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao fechar mês:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao fechar mês'
        });
    }
});

router.post('/:ano/:mes/reabrir', authMiddleware, async (req, res) => {
    try {
        const { ano, mes } = req.params;
        
        const result = await query(
            `UPDATE meses 
             SET fechado = false
             WHERE usuario_id = $1 AND ano = $2 AND mes = $3
             RETURNING *`,
            [req.usuario.id, parseInt(ano), parseInt(mes)]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Mês não encontrado'
            });
        }
        
        res.json({
            success: true,
            message: 'Mês reaberto com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao reabrir mês:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao reabrir mês'
        });
    }
});

router.get('/:ano/:mes/saldo', authMiddleware, async (req, res) => {
    try {
        const { ano, mes } = req.params;
        
        const receitas = await query(
            `SELECT COALESCE(SUM(valor), 0) as total 
             FROM receitas 
             WHERE usuario_id = $1 AND ano = $2 AND mes = $3`,
            [req.usuario.id, parseInt(ano), parseInt(mes)]
        );
        
        const despesas = await query(
            `SELECT COALESCE(SUM(valor), 0) as total 
             FROM despesas 
             WHERE usuario_id = $1 AND ano = $2 AND mes = $3`,
            [req.usuario.id, parseInt(ano), parseInt(mes)]
        );
        
        const mesAnterior = parseInt(mes) === 0 ? 11 : parseInt(mes) - 1;
        const anoAnterior = parseInt(mes) === 0 ? parseInt(ano) - 1 : parseInt(ano);
        
        const saldoAnterior = await query(
            `SELECT COALESCE(saldo_final, 0) as saldo 
             FROM meses 
             WHERE usuario_id = $1 AND ano = $2 AND mes = $3`,
            [req.usuario.id, anoAnterior, mesAnterior]
        );
        
        const totalReceitas = parseFloat(receitas.rows[0].total);
        const totalDespesas = parseFloat(despesas.rows[0].total);
        const saldoAnt = parseFloat(saldoAnterior.rows[0]?.saldo || 0);
        
        const saldoFinal = saldoAnt + totalReceitas - totalDespesas;
        
        res.json({
            success: true,
            data: {
                saldo_anterior: saldoAnt,
                receitas: totalReceitas,
                despesas: totalDespesas,
                saldo_final: saldoFinal
            }
        });
        
    } catch (error) {
        console.error('Erro ao calcular saldo:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao calcular saldo'
        });
    }
});

module.exports = router;