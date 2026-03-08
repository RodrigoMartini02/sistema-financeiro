const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// ================================================================
// FUNÇÃO AUXILIAR - VERIFICAR MÊS FECHADO
// ================================================================

async function verificarMesFechado(usuarioId, mes, ano) {
    try {
        const result = await query(
            'SELECT fechado FROM meses WHERE usuario_id = $1 AND mes = $2 AND ano = $3',
            [usuarioId, mes, ano]
        );

        if (result.rows.length === 0) {
            return false; // Mês não existe na tabela = não está fechado
        }

        return result.rows[0].fechado === true;
    } catch (error) {
        console.error('Erro ao verificar mês fechado:', error);
        return false;
    }
}

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
        const valorNumerico = parseFloat(valor);

        // Verificar se o mês está fechado
        const mesFechado = await verificarMesFechado(req.usuario.id, mes, ano);
        if (mesFechado) {
            return res.status(400).json({
                success: false,
                message: 'Não é possível criar reservas em um mês fechado'
            });
        }

        // Verificar saldo disponível: saldoFinal do último mês fechado + receitas dos meses abertos - reservas acumuladas
        const saldoResult = await query(
            `WITH uf AS (
                SELECT ano, mes, saldo_final
                FROM meses
                WHERE usuario_id = $1 AND fechado = true
                  AND (ano < $2 OR (ano = $2 AND mes <= $3))
                ORDER BY ano DESC, mes DESC
                LIMIT 1
            )
            SELECT
                COALESCE((SELECT saldo_final FROM uf), 0)
                + COALESCE((
                    SELECT SUM(r.valor)
                    FROM receitas r
                    WHERE r.usuario_id = $1
                      AND r.descricao NOT ILIKE 'Saldo Anterior%'
                      AND (r.ano < $2 OR (r.ano = $2 AND r.mes <= $3))
                      AND NOT EXISTS (
                          SELECT 1 FROM meses m
                          WHERE m.usuario_id = $1 AND m.ano = r.ano AND m.mes = r.mes AND m.fechado = true
                      )
                      AND (
                          NOT EXISTS (SELECT 1 FROM uf)
                          OR r.ano > (SELECT ano FROM uf)
                          OR (r.ano = (SELECT ano FROM uf) AND r.mes > (SELECT mes FROM uf))
                      )
                ), 0)
                - COALESCE((
                    SELECT SUM(valor) FROM reservas
                    WHERE usuario_id = $1 AND (ano < $2 OR (ano = $2 AND mes <= $3))
                ), 0)
                AS saldo_disponivel`,
            [req.usuario.id, ano, mes]
        );

        const saldoAtual = parseFloat(saldoResult.rows[0].saldo_disponivel) || 0;

        if (saldoAtual < valorNumerico) {
            return res.status(400).json({
                success: false,
                message: `Saldo insuficiente para reserva. Disponível: R$ ${saldoAtual.toFixed(2)}`,
                saldoAtual: saldoAtual
            });
        }

        // Criar a reserva
        const result = await query(
            `INSERT INTO reservas (usuario_id, valor, mes, ano, data, observacoes)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [req.usuario.id, valorNumerico, mes, ano, data, observacoes || null]
        );

        // Registrar movimentação inicial de entrada
        // Usa a data da reserva para garantir que seja contabilizada no mês correto
        await query(
            `INSERT INTO movimentacoes_reservas (reserva_id, tipo, valor, observacoes, data_hora)
             VALUES ($1, 'entrada', $2, 'Criação da reserva', $3)`,
            [result.rows[0].id, valorNumerico, data]
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

// PUT - Atualizar nome da reserva (valor só pode ser alterado via movimentação)
router.put('/:id', authMiddleware, [
    body('observacoes').notEmpty().withMessage('Nome da reserva é obrigatório')
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
        const { observacoes } = req.body;

        const result = await query(
            `UPDATE reservas
             SET observacoes = $1
             WHERE id = $2 AND usuario_id = $3
             RETURNING *`,
            [observacoes, id, req.usuario.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Reserva não encontrada'
            });
        }

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

        // Buscar dados da reserva antes de excluir
        const reservaResult = await query(
            'SELECT * FROM reservas WHERE id = $1 AND usuario_id = $2',
            [id, req.usuario.id]
        );

        if (reservaResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Reserva não encontrada'
            });
        }

        const reserva = reservaResult.rows[0];

        // Verificar se o mês da reserva está fechado
        const mesFechado = await verificarMesFechado(req.usuario.id, reserva.mes, reserva.ano);
        if (mesFechado) {
            return res.status(400).json({
                success: false,
                message: 'Não é possível excluir reservas de um mês fechado'
            });
        }

        // Excluir a reserva
        await query(
            'DELETE FROM reservas WHERE id = $1 AND usuario_id = $2',
            [id, req.usuario.id]
        );

        res.json({
            success: true,
            message: 'Reserva excluída com sucesso',
            data: reserva
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
        
        const [result, totalResult] = await Promise.all([
            query(
                `SELECT * FROM reservas WHERE usuario_id = $1 ORDER BY ano DESC, mes DESC, data DESC LIMIT $2 OFFSET $3`,
                [req.usuario.id, parseInt(limite), offset]
            ),
            query(
                'SELECT COUNT(*) as total FROM reservas WHERE usuario_id = $1',
                [req.usuario.id]
            )
        ]);
        
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
// MOVIMENTAÇÕES DE RESERVAS
// ================================================================

// POST - Adicionar ou retirar valor de uma reserva
// A movimentação usa o mês/ano ATUAL enviado pelo frontend para validação de saldo
router.post('/:id/movimentar', authMiddleware, [
    body('tipo').isIn(['entrada', 'saida']).withMessage('Tipo deve ser entrada ou saida'),
    body('valor').isFloat({ min: 0.01 }).withMessage('Valor deve ser maior que zero'),
    body('mes').optional().isInt({ min: 0, max: 11 }).withMessage('Mês inválido'),
    body('ano').optional().isInt({ min: 2000 }).withMessage('Ano inválido'),
    body('observacoes').optional().isString()
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
        const { tipo, valor, observacoes } = req.body;

        // Usar mês/ano enviado pelo frontend (mês atual aberto) ou fallback para data atual
        const mesAtual = req.body.mes !== undefined ? parseInt(req.body.mes) : new Date().getMonth();
        const anoAtual = req.body.ano !== undefined ? parseInt(req.body.ano) : new Date().getFullYear();

        // Verificar se o mês está fechado
        const mesFechado = await verificarMesFechado(req.usuario.id, mesAtual, anoAtual);
        if (mesFechado) {
            return res.status(400).json({
                success: false,
                message: 'Não é possível movimentar reservas em um mês fechado'
            });
        }

        // Verificar se a reserva existe e pertence ao usuário
        const reservaResult = await query(
            'SELECT * FROM reservas WHERE id = $1 AND usuario_id = $2',
            [id, req.usuario.id]
        );

        if (reservaResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Reserva não encontrada'
            });
        }

        const reserva = reservaResult.rows[0];

        // Se for saída, verificar se há saldo suficiente na reserva
        if (tipo === 'saida') {
            const saldoReserva = parseFloat(reserva.valor);
            if (saldoReserva < parseFloat(valor)) {
                return res.status(400).json({
                    success: false,
                    message: `Saldo insuficiente na reserva. Disponível: R$ ${saldoReserva.toFixed(2)}`
                });
            }
        }

        // Se for entrada, verificar se há saldo disponível no mês ATUAL (não no mês original da reserva)
        if (tipo === 'entrada') {
            const verificacaoSaldo = await verificarSaldoDisponivel(
                req.usuario.id,
                mesAtual,    // Usa mês atual aberto
                anoAtual,    // Usa ano atual aberto
                parseFloat(valor)
            );

            if (!verificacaoSaldo.sucesso) {
                return res.status(400).json({
                    success: false,
                    message: verificacaoSaldo.mensagem,
                    saldoAtual: verificacaoSaldo.saldoAtual
                });
            }
        }

        // Criar data baseada no mês/ano atual para a movimentação
        // Isso garante que a movimentação seja contabilizada no mês correto
        const dataMovimentacao = new Date(anoAtual, mesAtual, 15); // Dia 15 do mês

        // Registrar a movimentação
        const movResult = await query(
            `INSERT INTO movimentacoes_reservas (reserva_id, tipo, valor, observacoes, data_hora)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [id, tipo, parseFloat(valor), observacoes || null, dataMovimentacao]
        );

        // Atualizar o valor da reserva
        const novoValor = tipo === 'entrada'
            ? parseFloat(reserva.valor) + parseFloat(valor)
            : parseFloat(reserva.valor) - parseFloat(valor);

        await query(
            'UPDATE reservas SET valor = $1 WHERE id = $2',
            [novoValor, id]
        );

        res.status(201).json({
            success: true,
            message: tipo === 'entrada' ? 'Valor adicionado com sucesso' : 'Valor retirado com sucesso',
            data: {
                movimentacao: movResult.rows[0],
                novoSaldo: novoValor
            }
        });

    } catch (error) {
        console.error('Erro ao movimentar reserva:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao processar movimentação'
        });
    }
});

// GET - Buscar todas as movimentações de todas as reservas do usuário
// IMPORTANTE: Esta rota deve vir ANTES de /:id/movimentacoes
router.get('/movimentacoes/todas', authMiddleware, async (req, res) => {
    try {
        const { limite = 50 } = req.query;

        // Buscar todas as movimentações com nome da reserva
        const result = await query(
            `SELECT mr.*, r.observacoes as nome_reserva
             FROM movimentacoes_reservas mr
             INNER JOIN reservas r ON mr.reserva_id = r.id
             WHERE r.usuario_id = $1
             ORDER BY mr.data_hora DESC
             LIMIT $2`,
            [req.usuario.id, parseInt(limite)]
        );

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Erro ao buscar movimentações:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar movimentações'
        });
    }
});

// GET - Buscar movimentações de uma reserva específica
router.get('/:id/movimentacoes', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar se a reserva pertence ao usuário
        const reservaResult = await query(
            'SELECT * FROM reservas WHERE id = $1 AND usuario_id = $2',
            [id, req.usuario.id]
        );

        if (reservaResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Reserva não encontrada'
            });
        }

        // Buscar movimentações
        const movResult = await query(
            `SELECT * FROM movimentacoes_reservas
             WHERE reserva_id = $1
             ORDER BY data_hora DESC`,
            [id]
        );

        res.json({
            success: true,
            data: movResult.rows
        });

    } catch (error) {
        console.error('Erro ao buscar movimentações:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar movimentações'
        });
    }
});

// ================================================================
// FUNÇÃO AUXILIAR PARA VERIFICAR SALDO
// ================================================================

async function verificarSaldoDisponivel(usuarioId, mes, ano, valorReserva) {
    try {
        const result = await query(
            `WITH uf AS (
                SELECT ano, mes, saldo_final
                FROM meses
                WHERE usuario_id = $1 AND fechado = true
                  AND (ano < $2 OR (ano = $2 AND mes <= $3))
                ORDER BY ano DESC, mes DESC
                LIMIT 1
            )
            SELECT
                COALESCE((SELECT saldo_final FROM uf), 0)
                + COALESCE((
                    SELECT SUM(r.valor)
                    FROM receitas r
                    WHERE r.usuario_id = $1
                      AND r.descricao NOT ILIKE 'Saldo Anterior%'
                      AND (r.ano < $2 OR (r.ano = $2 AND r.mes <= $3))
                      AND NOT EXISTS (
                          SELECT 1 FROM meses m
                          WHERE m.usuario_id = $1 AND m.ano = r.ano AND m.mes = r.mes AND m.fechado = true
                      )
                      AND (
                          NOT EXISTS (SELECT 1 FROM uf)
                          OR r.ano > (SELECT ano FROM uf)
                          OR (r.ano = (SELECT ano FROM uf) AND r.mes > (SELECT mes FROM uf))
                      )
                ), 0)
                - COALESCE((
                    SELECT SUM(valor) FROM reservas
                    WHERE usuario_id = $1 AND (ano < $2 OR (ano = $2 AND mes <= $3))
                ), 0)
                AS saldo_disponivel`,
            [usuarioId, ano, mes]
        );

        const saldoAtual = parseFloat(result.rows[0].saldo_disponivel) || 0;

        if (saldoAtual < valorReserva) {
            return {
                sucesso: false,
                mensagem: `Saldo insuficiente para reserva. Disponível: ${saldoAtual.toFixed(2)}`,
                saldoAtual: saldoAtual
            };
        }

        return {
            sucesso: true,
            saldoAtual: saldoAtual
        };

    } catch (error) {
        console.error('Erro ao verificar saldo:', error);
        return {
            sucesso: false,
            mensagem: 'Erro ao verificar saldo'
        };
    }
}

module.exports = router;