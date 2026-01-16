const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// ================================================================
// RESERVAS - CRUD COMPLETO
// ================================================================

// GET - Buscar reservas por mês/ano ou todas
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { mes, ano } = req.query;
        
        let whereClause = 'WHERE usuario_id = $1';
        let params = [req.usuario.id];
        
        if (mes !== undefined && ano !== undefined) {
            whereClause += ' AND mes = $2 AND ano = $3';
            params.push(parseInt(mes), parseInt(ano));
        } else if (ano !== undefined) {
            whereClause += ' AND ano = $2';
            params.push(parseInt(ano));
        }
        
        const result = await query(
            `SELECT * FROM reservas ${whereClause} ORDER BY data DESC, id DESC`,
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

// POST - Criar nova reserva
router.post('/', authMiddleware, [
    body('valor').isFloat({ min: 0.01 }).withMessage('Valor deve ser maior que zero'),
    body('mes').isInt({ min: 0, max: 11 }).withMessage('Mês inválido'),
    body('ano').isInt({ min: 2000 }).withMessage('Ano inválido'),
    body('data').isISO8601().withMessage('Data inválida')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        
        const { valor, mes, ano, data, observacoes } = req.body;
        
        // Verificar se há saldo disponível para reservar
        const verificacaoSaldo = await verificarSaldoDisponivel(req.usuario.id, mes, ano, valor);
        
        if (!verificacaoSaldo.sucesso) {
            return res.status(400).json({
                success: false,
                message: verificacaoSaldo.mensagem,
                saldoDisponivel: verificacaoSaldo.saldoDisponivel
            });
        }
        
        const result = await query(
            `INSERT INTO reservas (usuario_id, valor, mes, ano, data, observacoes)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [req.usuario.id, parseFloat(valor), mes, ano, data, observacoes || null]
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

// PUT - Atualizar reserva existente
router.put('/:id', authMiddleware, [
    body('valor').isFloat({ min: 0.01 }).withMessage('Valor deve ser maior que zero'),
    body('data').optional().isISO8601().withMessage('Data inválida')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }
        
        const { id } = req.params;
        const { valor, data, observacoes } = req.body;
        
        // Buscar reserva atual para validação
        const reservaAtual = await query(
            'SELECT * FROM reservas WHERE id = $1 AND usuario_id = $2',
            [id, req.usuario.id]
        );
        
        if (reservaAtual.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Reserva não encontrada'
            });
        }
        
        const reserva = reservaAtual.rows[0];
        const diferencaValor = parseFloat(valor) - parseFloat(reserva.valor);
        
        // Se aumentou o valor, verificar se há saldo disponível
        if (diferencaValor > 0) {
            const verificacaoSaldo = await verificarSaldoDisponivel(
                req.usuario.id, 
                reserva.mes, 
                reserva.ano, 
                diferencaValor
            );
            
            if (!verificacaoSaldo.sucesso) {
                return res.status(400).json({
                    success: false,
                    message: verificacaoSaldo.mensagem,
                    saldoDisponivel: verificacaoSaldo.saldoDisponivel
                });
            }
        }
        
        const result = await query(
            `UPDATE reservas 
             SET valor = $1, data = COALESCE($2, data), observacoes = $3
             WHERE id = $4 AND usuario_id = $5
             RETURNING *`,
            [parseFloat(valor), data, observacoes, id, req.usuario.id]
        );
        
        res.json({
            success: true,
            message: 'Reserva atualizada com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao atualizar reserva:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar reserva'
        });
    }
});

// DELETE - Excluir reserva
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
            message: 'Reserva excluída com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao excluir reserva:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao excluir reserva'
        });
    }
});

// ================================================================
// ROTAS ADICIONAIS PARA RELATÓRIOS
// ================================================================

// GET - Total de reservas por ano
router.get('/total/:ano', authMiddleware, async (req, res) => {
    try {
        const { ano } = req.params;
        
        const result = await query(
            `SELECT 
                mes,
                COALESCE(SUM(valor), 0) as total,
                COUNT(*) as quantidade
             FROM reservas 
             WHERE usuario_id = $1 AND ano = $2
             GROUP BY mes
             ORDER BY mes`,
            [req.usuario.id, parseInt(ano)]
        );
        
        // Criar array com todos os meses (0-11)
        const resumoPorMes = [];
        for (let i = 0; i < 12; i++) {
            const dadosMes = result.rows.find(row => row.mes === i);
            resumoPorMes.push({
                mes: i,
                total: dadosMes ? parseFloat(dadosMes.total) : 0,
                quantidade: dadosMes ? parseInt(dadosMes.quantidade) : 0
            });
        }
        
        const totalAno = resumoPorMes.reduce((sum, mes) => sum + mes.total, 0);
        
        res.json({
            success: true,
            ano: parseInt(ano),
            totalAno,
            meses: resumoPorMes
        });
        
    } catch (error) {
        console.error('Erro ao buscar total de reservas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao calcular total de reservas'
        });
    }
});

// GET - Histórico completo de reservas
router.get('/historico', authMiddleware, async (req, res) => {
    try {
        const { limite = 50, pagina = 1 } = req.query;
        const offset = (parseInt(pagina) - 1) * parseInt(limite);
        
        const result = await query(
            `SELECT * FROM reservas 
             WHERE usuario_id = $1 
             ORDER BY ano DESC, mes DESC, data DESC
             LIMIT $2 OFFSET $3`,
            [req.usuario.id, parseInt(limite), offset]
        );
        
        const totalResult = await query(
            'SELECT COUNT(*) as total FROM reservas WHERE usuario_id = $1',
            [req.usuario.id]
        );
        
        const total = parseInt(totalResult.rows[0].total);
        const totalPaginas = Math.ceil(total / parseInt(limite));
        
        res.json({
            success: true,
            data: result.rows,
            paginacao: {
                paginaAtual: parseInt(pagina),
                totalPaginas,
                totalRegistros: total,
                limite: parseInt(limite)
            }
        });
        
    } catch (error) {
        console.error('Erro ao buscar histórico de reservas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar histórico de reservas'
        });
    }
});

// ================================================================
// FUNÇÃO AUXILIAR PARA VERIFICAR SALDO
// ================================================================

async function verificarSaldoDisponivel(usuarioId, mes, ano, valorReserva) {
    try {
        // Receitas do mês atual
        const receitasResult = await query(
            `SELECT COALESCE(SUM(valor), 0) as total
             FROM receitas
             WHERE usuario_id = $1 AND mes = $2 AND ano = $3`,
            [usuarioId, mes, ano]
        );

        // Despesas do mês atual (apenas não pagas comprometem o saldo)
        const despesasResult = await query(
            `SELECT COALESCE(SUM(CASE WHEN pago = true THEN COALESCE(valor_pago, valor) ELSE valor END), 0) as total
             FROM despesas
             WHERE usuario_id = $1 AND mes = $2 AND ano = $3`,
            [usuarioId, mes, ano]
        );

        // Reservas já feitas no mês atual
        const reservasResult = await query(
            `SELECT COALESCE(SUM(valor), 0) as total
             FROM reservas
             WHERE usuario_id = $1 AND mes = $2 AND ano = $3`,
            [usuarioId, mes, ano]
        );

        // Buscar saldo anterior do mês fechado (se existir)
        let mesAnterior = mes - 1;
        let anoAnterior = ano;
        if (mesAnterior < 0) {
            mesAnterior = 11;
            anoAnterior = ano - 1;
        }

        const saldoAnteriorResult = await query(
            `SELECT saldo_final
             FROM meses
             WHERE usuario_id = $1 AND mes = $2 AND ano = $3 AND fechado = true`,
            [usuarioId, mesAnterior, anoAnterior]
        );

        const saldoAnterior = saldoAnteriorResult.rows.length > 0
            ? parseFloat(saldoAnteriorResult.rows[0].saldo_final) || 0
            : 0;

        const totalReceitas = parseFloat(receitasResult.rows[0].total);
        const totalDespesas = parseFloat(despesasResult.rows[0].total);
        const totalReservas = parseFloat(reservasResult.rows[0].total);

        // Saldo atual do mês = saldo anterior + receitas - despesas - reservas já feitas
        const saldoDisponivel = saldoAnterior + totalReceitas - totalDespesas - totalReservas;

        if (saldoDisponivel < valorReserva) {
            return {
                sucesso: false,
                mensagem: `Saldo insuficiente para reserva. Disponível: ${saldoDisponivel.toFixed(2)}`,
                saldoDisponivel: saldoDisponivel
            };
        }

        return {
            sucesso: true,
            saldoDisponivel: saldoDisponivel
        };

    } catch (error) {
        console.error('Erro ao verificar saldo disponível:', error);
        return {
            sucesso: false,
            mensagem: 'Erro ao verificar saldo disponível'
        };
    }
}

module.exports = router;