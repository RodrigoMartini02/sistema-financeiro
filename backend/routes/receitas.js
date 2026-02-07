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
        const { mes, ano, usuario_id } = req.query;

        // ✅ MASTER pode ver dados de qualquer usuário
        let whereClause = '';
        let params = [];
        let paramCount = 0;

        if (usuario_id && req.usuario.tipo === 'master') {
            // Master consultando dados de outro usuário
            paramCount++;
            whereClause = `WHERE r.usuario_id = $${paramCount}`;
            params.push(parseInt(usuario_id));
        } else {
            // Usuário comum vê apenas seus dados
            paramCount++;
            whereClause = `WHERE r.usuario_id = $${paramCount}`;
            params.push(req.usuario.id);
        }

        if (mes !== undefined && ano !== undefined) {
            whereClause += ` AND r.mes = $${paramCount + 1} AND r.ano = $${paramCount + 2}`;
            params.push(parseInt(mes), parseInt(ano));
            paramCount += 2;
        }

        const result = await query(
            `SELECT r.*
             FROM receitas r
             ${whereClause}
             ORDER BY r.data_recebimento DESC`,
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
            console.error('❌ Erros de validação na receita:', errors.array());
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const { descricao, valor, data_recebimento, mes, ano, observacoes, anexos } = req.body;

        console.log('📝 Criando receita:', {
            descricao, valor, data_recebimento, mes, ano,
            usuario_id: req.usuario.id
        });

        // Converter anexos para JSON se existirem
        const anexosJson = anexos && Array.isArray(anexos) && anexos.length > 0 ? JSON.stringify(anexos) : null;

        const result = await query(
            `INSERT INTO receitas (usuario_id, descricao, valor, data_recebimento, mes, ano, observacoes, anexos)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [req.usuario.id, descricao, parseFloat(valor), data_recebimento, mes, ano, observacoes || null, anexosJson]
        );

        console.log('✅ Receita criada com sucesso:', result.rows[0].id);

        res.status(201).json({
            success: true,
            message: 'Receita cadastrada com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Erro detalhado ao criar receita:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Erro ao criar receita',
            error: error.message,
            detalhes: error.detail || error.hint
        });
    }
});

router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { descricao, valor, data_recebimento, observacoes, anexos } = req.body;

        // Converter anexos para JSON se existirem
        const anexosJson = anexos && Array.isArray(anexos) && anexos.length > 0 ? JSON.stringify(anexos) : null;

        const result = await query(
            `UPDATE receitas
             SET descricao = $1, valor = $2, data_recebimento = $3, observacoes = $4, anexos = $5
             WHERE id = $6 AND usuario_id = $7
             RETURNING *`,
            [descricao, parseFloat(valor), data_recebimento, observacoes, anexosJson, id, req.usuario.id]
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

        console.log('🗑️ Tentando excluir receita:', { id, usuario_id: req.usuario.id, tipo_id: typeof id });

        const result = await query(
            'DELETE FROM receitas WHERE id = $1 AND usuario_id = $2 RETURNING *',
            [parseInt(id), req.usuario.id]
        );

        console.log('✅ Resultado da exclusão:', { rows: result.rows.length, deletada: result.rows[0] });

        if (result.rows.length === 0) {
            console.warn('⚠️ Receita não encontrada para exclusão');
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
        console.error('❌ Erro ao excluir receita:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao excluir receita',
            error: error.message
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
        
        // Uma única query para receitas, despesas e reservas do mês anterior
        const result = await query(
            `SELECT
                (SELECT COALESCE(SUM(valor), 0) FROM receitas
                 WHERE usuario_id = $1 AND mes = $2 AND ano = $3) as total_receitas,
                (SELECT COALESCE(SUM(valor), 0) FROM despesas
                 WHERE usuario_id = $1 AND mes = $2 AND ano = $3) as total_despesas,
                (SELECT COALESCE(SUM(valor), 0) FROM reservas
                 WHERE usuario_id = $1 AND mes = $2 AND ano = $3) as total_reservas`,
            [req.usuario.id, mesAnterior, anoAnterior]
        );

        const totalReceitas = parseFloat(result.rows[0].total_receitas);
        const totalDespesas = parseFloat(result.rows[0].total_despesas);
        const totalReservas = parseFloat(result.rows[0].total_reservas);
        
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
        
        // Saldo anterior
        let mesAnterior = mesInt - 1;
        let anoAnterior = anoInt;

        if (mesAnterior < 0) {
            mesAnterior = 11;
            anoAnterior = anoAnterior - 1;
        }

        // Uma única query para todos os totais
        const resumoResult = await query(
            `SELECT
                (SELECT COALESCE(SUM(valor), 0) FROM receitas
                 WHERE usuario_id = $1 AND mes = $2 AND ano = $3) as receitas_mes,
                (SELECT COALESCE(SUM(valor), 0) FROM despesas
                 WHERE usuario_id = $1 AND mes = $2 AND ano = $3) as despesas_mes,
                (SELECT COALESCE(SUM(valor), 0) FROM reservas
                 WHERE usuario_id = $1 AND mes = $2 AND ano = $3) as reservas_mes,
                (SELECT COALESCE(SUM(valor), 0) FROM receitas
                 WHERE usuario_id = $1 AND mes = $4 AND ano = $5) as receitas_anterior,
                (SELECT COALESCE(SUM(valor), 0) FROM despesas
                 WHERE usuario_id = $1 AND mes = $4 AND ano = $5) as despesas_anterior,
                (SELECT COALESCE(SUM(valor), 0) FROM reservas
                 WHERE usuario_id = $1 AND mes = $4 AND ano = $5) as reservas_anterior,
                (SELECT COALESCE(SUM(valor), 0) FROM reservas
                 WHERE usuario_id = $1) as reservas_total`,
            [req.usuario.id, mesInt, anoInt, mesAnterior, anoAnterior]
        );

        const row = resumoResult.rows[0];
        const saldoAnterior = parseFloat(row.receitas_anterior) -
                             parseFloat(row.despesas_anterior) -
                             parseFloat(row.reservas_anterior);

        const totalReceitas = parseFloat(row.receitas_mes) + saldoAnterior;
        const totalDespesas = parseFloat(row.despesas_mes);
        const totalReservas = parseFloat(row.reservas_mes);
        const totalAcumulado = parseFloat(row.reservas_total);
        
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
                receitasMes: parseFloat(row.receitas_mes),
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