const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

router.get('/', authMiddleware, async (req, res) => {
    try {
        const { mes, ano, usuario_id } = req.query;

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

        const { perfil_id } = req.query;
        if (perfil_id) {
            paramCount++;
            whereClause += ` AND (r.perfil_id = $${paramCount} OR (r.perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis p WHERE p.id = $${paramCount} AND p.tipo = 'pessoal' AND p.usuario_id = r.usuario_id)))`;
            params.push(parseInt(perfil_id));
        }

        const result = await query(
            `SELECT r.*, rep.nome AS representante_nome
             FROM receitas r
             LEFT JOIN representantes rep ON rep.id = r.representante_id AND rep.usuario_id = r.usuario_id
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

        const { descricao, valor, data_recebimento, mes, ano, observacoes, anexos, perfil_id,
                cliente, tipo_receita, representante_id, valor_comissao } = req.body;

        // Converter anexos para JSON se existirem
        const anexosJson = anexos && Array.isArray(anexos) && anexos.length > 0 ? JSON.stringify(anexos) : null;

        const result = await query(
            `INSERT INTO receitas (usuario_id, descricao, valor, data_recebimento, mes, ano, observacoes, anexos, perfil_id,
                                   cliente, tipo_receita, representante_id, valor_comissao)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             RETURNING *`,
            [req.usuario.id, descricao, parseFloat(valor), data_recebimento, mes, ano, observacoes || null, anexosJson,
             perfil_id ? parseInt(perfil_id) : null,
             cliente || null, tipo_receita || null,
             representante_id ? parseInt(representante_id) : null,
             valor_comissao != null ? parseFloat(valor_comissao) : null]
        );

        // Auto-criar despesa de comissão sempre que houver representante vinculado
        if (representante_id) {
            const repResult = await query(
                `SELECT nome FROM representantes WHERE id = $1 AND usuario_id = $2`,
                [parseInt(representante_id), req.usuario.id]
            );

            if (repResult.rows.length > 0) {
                const repNome = repResult.rows[0].nome;

                // Buscar ou criar categoria "Comissão"
                let catResult = await query(
                    `SELECT id FROM categorias WHERE usuario_id = $1 AND LOWER(nome) = 'comissão' LIMIT 1`,
                    [req.usuario.id]
                );
                if (catResult.rows.length === 0) {
                    catResult = await query(
                        `INSERT INTO categorias (usuario_id, nome, cor, icone) VALUES ($1, 'Comissão', '#f59e0b', 'handshake') RETURNING id`,
                        [req.usuario.id]
                    );
                }
                const categoriaId = catResult.rows[0].id;

                // Obter próximo número para a despesa
                const numResult = await query(
                    `SELECT COALESCE(MAX(numero), 0) + 1 as proximo FROM despesas WHERE usuario_id = $1`,
                    [req.usuario.id]
                );
                const proximoNumero = numResult.rows[0].proximo;

                // Usar valor_comissao calculado ou 0 como placeholder (usuário define depois)
                const valorCom = (valor_comissao != null && parseFloat(valor_comissao) > 0)
                    ? parseFloat(valor_comissao)
                    : 0.01;

                await query(
                    `INSERT INTO despesas (usuario_id, descricao, valor_original, valor_final,
                        data_vencimento, mes, ano, categoria_id, forma_pagamento, pago,
                        recorrente, perfil_id, numero)
                     VALUES ($1, $2, $3, $3, $4, $5, $6, $7, 'dinheiro', false, false, $8, $9)`,
                    [req.usuario.id, `Comissão - ${repNome}`, valorCom,
                     data_recebimento, parseInt(mes), parseInt(ano), categoriaId,
                     perfil_id ? parseInt(perfil_id) : null, proximoNumero]
                );
            }
        }

        res.status(201).json({
            success: true,
            message: 'Receita cadastrada com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Erro detalhado ao criar receita:', error);
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
        const { descricao, valor, data_recebimento, observacoes, anexos, perfil_id,
                cliente, tipo_receita, representante_id, valor_comissao } = req.body;

        // Converter anexos para JSON se existirem
        const anexosJson = anexos && Array.isArray(anexos) && anexos.length > 0 ? JSON.stringify(anexos) : null;

        const result = await query(
            `UPDATE receitas
             SET descricao = $1, valor = $2, data_recebimento = $3, observacoes = $4, anexos = $5,
                 perfil_id = COALESCE($6, perfil_id),
                 cliente = $7, tipo_receita = $8, representante_id = $9, valor_comissao = $10
             WHERE id = $11 AND usuario_id = $12
             RETURNING *`,
            [descricao, parseFloat(valor), data_recebimento, observacoes, anexosJson,
             perfil_id ? parseInt(perfil_id) : null,
             cliente || null, tipo_receita || null,
             representante_id ? parseInt(representante_id) : null,
             valor_comissao != null ? parseFloat(valor_comissao) : null,
             id, req.usuario.id]
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

// ================================================================
// CANCELAR RECEITA
// ================================================================
router.put('/:id/cancelar', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // Buscar receita para verificar se tem representante vinculado
        const receitaResult = await query(
            `SELECT representante_id, mes, ano FROM receitas WHERE id = $1 AND usuario_id = $2`,
            [parseInt(id), req.usuario.id]
        );

        if (receitaResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Receita não encontrada' });
        }

        const receita = receitaResult.rows[0];

        // Cancelar a receita
        await query(
            `UPDATE receitas SET status = 'cancelada' WHERE id = $1 AND usuario_id = $2`,
            [parseInt(id), req.usuario.id]
        );

        // Se tinha representante, cancelar despesa de comissão associada
        if (receita.representante_id) {
            await query(
                `UPDATE despesas SET status = 'cancelada'
                 WHERE usuario_id = $1 AND mes = $2 AND ano = $3
                   AND descricao LIKE 'Comissão - %' AND status = 'ativa'`,
                [req.usuario.id, receita.mes, receita.ano]
            );
        }

        res.json({ success: true, message: 'Receita cancelada' });
    } catch (error) {
        console.error('Erro ao cancelar receita:', error);
        res.status(500).json({ success: false, message: 'Erro ao cancelar receita' });
    }
});

router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await query(
            'DELETE FROM receitas WHERE id = $1 AND usuario_id = $2 RETURNING *',
            [parseInt(id), req.usuario.id]
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
        console.error('❌ Erro ao excluir receita:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao excluir receita',
            error: error.message
        });
    }
});

module.exports = router;