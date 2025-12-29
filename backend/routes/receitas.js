const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// ================================================================
// ROTAS ORIGINAIS (mantidas)
// ================================================================

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

// ================================================================
// NOVAS ROTAS EXPANDIDAS
// ================================================================

// Rota para calcular saldo anterior
router.get('/saldo-anterior', authMiddleware, async (req, res) => {
    try {
        const { mes, ano } = req.query;
        
        if (!mes || !ano) {
            return res.status(400).json({
                success: false,
                message: 'Mês e ano são obrigatórios'
            });
        }
        
        let mesAnterior = parseInt(mes) - 1;
        let anoAnterior = parseInt(ano);
        
        if (mesAnterior < 0) {
            mesAnterior = 11;
            anoAnterior = anoAnterior - 1;
        }
        
        // Buscar receitas do mês anterior
        const receitasResult = await query(
            `SELECT COALESCE(SUM(valor), 0) as total_receitas 
             FROM receitas 
             WHERE usuario_id = $1 AND mes = $2 AND ano = $3`,
            [req.usuario.id, mesAnterior, anoAnterior]
        );
        
        // Buscar despesas do mês anterior
        const despesasResult = await query(
            `SELECT COALESCE(SUM(valor), 0) as total_despesas 
             FROM despesas 
             WHERE usuario_id = $1 AND mes = $2 AND ano = $3`,
            [req.usuario.id, mesAnterior, anoAnterior]
        );
        
        // Buscar reservas do mês anterior
        const reservasResult = await query(
            `SELECT COALESCE(SUM(valor), 0) as total_reservas 
             FROM reservas 
             WHERE usuario_id = $1 AND mes = $2 AND ano = $3`,
            [req.usuario.id, mesAnterior, anoAnterior]
        );
        
        const totalReceitas = parseFloat(receitasResult.rows[0].total_receitas);
        const totalDespesas = parseFloat(despesasResult.rows[0].total_despesas);
        const totalReservas = parseFloat(reservasResult.rows[0].total_reservas);
        
        const saldoAnterior = totalReceitas - totalDespesas - totalReservas;
        
        res.json({
            success: true,
            saldo: saldoAnterior,
            detalhes: {
                receitas: totalReceitas,
                despesas: totalDespesas,
                reservas: totalReservas,
                mes: mesAnterior,
                ano: anoAnterior
            }
        });
        
    } catch (error) {
        console.error('Erro ao calcular saldo anterior:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao calcular saldo anterior'
        });
    }
});

// Rota para resumo financeiro (para reservas)
router.get('/resumo', authMiddleware, async (req, res) => {
    try {
        const { mes, ano } = req.query;
        
        if (!mes || !ano) {
            return res.status(400).json({
                success: false,
                message: 'Mês e ano são obrigatórios'
            });
        }
        
        const mesInt = parseInt(mes);
        const anoInt = parseInt(ano);
        
        // Total de receitas do mês atual
        const receitasAtualResult = await query(
            `SELECT COALESCE(SUM(valor), 0) as total 
             FROM receitas 
             WHERE usuario_id = $1 AND mes = $2 AND ano = $3`,
            [req.usuario.id, mesInt, anoInt]
        );
        
        // Saldo anterior
        let mesAnterior = mesInt - 1;
        let anoAnterior = anoInt;
        
        if (mesAnterior < 0) {
            mesAnterior = 11;
            anoAnterior = anoAnterior - 1;
        }
        
        const saldoAnteriorResult = await query(
            `SELECT 
                COALESCE(SUM(r.valor), 0) as receitas_anterior,
                COALESCE((SELECT SUM(d.valor) FROM despesas d WHERE d.usuario_id = $1 AND d.mes = $2 AND d.ano = $3), 0) as despesas_anterior,
                COALESCE((SELECT SUM(res.valor) FROM reservas res WHERE res.usuario_id = $1 AND res.mes = $2 AND res.ano = $3), 0) as reservas_anterior
             FROM receitas r 
             WHERE r.usuario_id = $1 AND r.mes = $2 AND r.ano = $3`,
            [req.usuario.id, mesAnterior, anoAnterior]
        );
        
        const saldoAnterior = parseFloat(saldoAnteriorResult.rows[0].receitas_anterior) - 
                             parseFloat(saldoAnteriorResult.rows[0].despesas_anterior) - 
                             parseFloat(saldoAnteriorResult.rows[0].reservas_anterior);
        
        // Despesas do mês atual
        const despesasAtualResult = await query(
            `SELECT COALESCE(SUM(valor), 0) as total 
             FROM despesas 
             WHERE usuario_id = $1 AND mes = $2 AND ano = $3`,
            [req.usuario.id, mesInt, anoInt]
        );
        
        // Reservas do mês atual
        const reservasAtualResult = await query(
            `SELECT COALESCE(SUM(valor), 0) as total 
             FROM reservas 
             WHERE usuario_id = $1 AND mes = $2 AND ano = $3`,
            [req.usuario.id, mesInt, anoInt]
        );
        
        // Total de reservas acumuladas
        const reservasTotalResult = await query(
            `SELECT COALESCE(SUM(valor), 0) as total 
             FROM reservas 
             WHERE usuario_id = $1`,
            [req.usuario.id]
        );
        
        const totalReceitas = parseFloat(receitasAtualResult.rows[0].total) + saldoAnterior;
        const totalDespesas = parseFloat(despesasAtualResult.rows[0].total);
        const totalReservas = parseFloat(reservasAtualResult.rows[0].total);
        const totalAcumulado = parseFloat(reservasTotalResult.rows[0].total);
        
        const disponivelParaReservar = Math.max(0, totalReceitas - totalDespesas - totalReservas);
        
        res.json({
            success: true,
            totalReceitas,
            totalReservas,
            disponivelParaReservar,
            totalAcumulado,
            saldoAnterior,
            detalhes: {
                mes: mesInt,
                ano: anoInt,
                receitasMes: parseFloat(receitasAtualResult.rows[0].total),
                despesasMes: totalDespesas,
                reservasMes: totalReservas
            }
        });
        
    } catch (error) {
        console.error('Erro ao calcular resumo:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao calcular resumo financeiro'
        });
    }
});

module.exports = router;