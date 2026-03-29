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
        const { mes, ano, perfil_id } = req.query;

        let whereClause = 'WHERE usuario_id = $1';
        let params = [req.usuario.id];
        let paramCount = 1;

        if (mes !== undefined && ano !== undefined) {
            whereClause += ` AND mes = $${++paramCount} AND ano = $${++paramCount}`;
            params.push(parseInt(mes), parseInt(ano));
        } else if (ano !== undefined) {
            whereClause += ` AND ano = $${++paramCount}`;
            params.push(parseInt(ano));
        }

        if (perfil_id) {
            whereClause += ` AND (perfil_id = $${++paramCount} OR (perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis p WHERE p.id = $${paramCount} AND p.tipo = 'pessoal' AND p.usuario_id = $1)))`;
            params.push(parseInt(perfil_id));
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
    body('valor').isFloat({ min: 0 }).withMessage('Valor deve ser maior ou igual a zero'),
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

        const { valor, mes, ano, data, observacoes, tipo_reserva, objetivo_valor, objetivo_atingido, data_objetivo, perfil_id } = req.body;
        const valorNumerico = parseFloat(valor);

        // Reservas normais devem ter valor > 0; objetivos começam com valor = 0
        if (tipo_reserva !== 'objetivo' && valorNumerico < 0.01) {
            return res.status(400).json({
                success: false,
                message: 'Valor deve ser maior que zero para reservas normais'
            });
        }

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

        if (tipo_reserva !== 'objetivo' && saldoAtual < valorNumerico) {
            return res.status(400).json({
                success: false,
                message: `Saldo insuficiente para reserva. Disponível: R$ ${saldoAtual.toFixed(2)}`,
                saldoAtual: saldoAtual
            });
        }

        // Criar a reserva
        const tipoReserva = tipo_reserva || 'normal';
        const objValor = objetivo_valor ? parseFloat(objetivo_valor) : null;
        const dataObj = data_objetivo || null;
        const perfilIdReserva = perfil_id ? parseInt(perfil_id) : null;
        const result = await query(
            `INSERT INTO reservas (usuario_id, valor, mes, ano, data, observacoes, tipo_reserva, objetivo_valor, objetivo_atingido, data_objetivo, perfil_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING *`,
            [req.usuario.id, valorNumerico, mes, ano, data, observacoes || null, tipoReserva, objValor, false, dataObj, perfilIdReserva]
        );

        // Registrar movimentação inicial de entrada apenas se valor > 0
        if (valorNumerico > 0) {
            await query(
                `INSERT INTO movimentacoes_reservas (reserva_id, tipo, valor, observacoes, data_hora)
                 VALUES ($1, 'entrada', $2, 'Criação da reserva', $3)`,
                [result.rows[0].id, valorNumerico, data]
            );
        }

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

// PUT - Atualizar reserva (nome + campos de objetivo)
router.put('/:id', authMiddleware, [
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
        const { observacoes, tipo_reserva, objetivo_valor, objetivo_atingido, data_objetivo } = req.body;

        // Build dynamic update
        const setClauses = [];
        const params = [];
        let paramIdx = 1;

        if (observacoes !== undefined) { setClauses.push(`observacoes = $${paramIdx++}`); params.push(observacoes); }
        if (tipo_reserva !== undefined) { setClauses.push(`tipo_reserva = $${paramIdx++}`); params.push(tipo_reserva); }
        if (objetivo_valor !== undefined) { setClauses.push(`objetivo_valor = $${paramIdx++}`); params.push(objetivo_valor !== null ? parseFloat(objetivo_valor) : null); }
        if (objetivo_atingido !== undefined) { setClauses.push(`objetivo_atingido = $${paramIdx++}`); params.push(!!objetivo_atingido); }
        if (data_objetivo !== undefined) { setClauses.push(`data_objetivo = $${paramIdx++}`); params.push(data_objetivo || null); }

        if (setClauses.length === 0) {
            return res.status(400).json({ success: false, message: 'Nenhum campo para atualizar' });
        }

        params.push(id, req.usuario.id);

        const result = await query(
            `UPDATE reservas SET ${setClauses.join(', ')} WHERE id = $${paramIdx++} AND usuario_id = $${paramIdx} RETURNING *`,
            params
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

// GET - Buscar somente objetivos (tipo_reserva='objetivo') com campo progresso calculado
router.get('/objetivos', authMiddleware, async (req, res) => {
    try {
        const { perfil_id } = req.query;
        const params = [req.usuario.id];
        let perfilFilter = '';
        if (perfil_id) {
            perfilFilter = ` AND (perfil_id = $2 OR (perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis p WHERE p.id = $2 AND p.tipo = 'pessoal' AND p.usuario_id = $1)))`;
            params.push(parseInt(perfil_id));
        }
        const result = await query(
            `SELECT *,
                CASE WHEN objetivo_valor > 0 THEN ROUND((valor / objetivo_valor * 100)::numeric, 1) ELSE 0 END AS progresso
             FROM reservas
             WHERE usuario_id = $1 AND tipo_reserva = 'objetivo'${perfilFilter}
             ORDER BY objetivo_atingido ASC, data_objetivo ASC NULLS LAST, id DESC`,
            params
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Erro ao buscar objetivos:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar objetivos' });
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
        const { limite = 20, offset = 0, perfil_id } = req.query;

        let perfilFilter = '';
        const params = [req.usuario.id];
        if (perfil_id) {
            perfilFilter = ` AND (r.perfil_id = $2 OR (r.perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis p WHERE p.id = $2 AND p.tipo = 'pessoal' AND p.usuario_id = $1)))`;
            params.push(parseInt(perfil_id));
        }

        const limiteParam = params.push(parseInt(limite)) && params.length;
        const offsetParam = params.push(parseInt(offset)) && params.length;

        const result = await query(
            `SELECT mr.*, r.observacoes as nome_reserva
             FROM movimentacoes_reservas mr
             INNER JOIN reservas r ON mr.reserva_id = r.id
             WHERE r.usuario_id = $1${perfilFilter}
             ORDER BY mr.data_hora ASC
             LIMIT $${limiteParam} OFFSET $${offsetParam}`,
            params
        );

        const totalParams = [req.usuario.id];
        if (perfil_id) totalParams.push(parseInt(perfil_id));
        const total = await query(
            `SELECT COUNT(*) FROM movimentacoes_reservas mr
             INNER JOIN reservas r ON mr.reserva_id = r.id
             WHERE r.usuario_id = $1${perfilFilter}`,
            totalParams
        );

        res.json({
            success: true,
            data: result.rows,
            total: parseInt(total.rows[0].count),
            offset: parseInt(offset),
            limite: parseInt(limite)
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