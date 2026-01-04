const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, async (req, res) => {
    try {
        const { usuario_id } = req.query;

        // ✅ MASTER pode ver cartões de qualquer usuário
        let targetUserId;
        if (usuario_id && req.usuario.tipo === 'master') {
            targetUserId = parseInt(usuario_id);
        } else {
            targetUserId = req.usuario.id;
        }

        const queryText = `
            SELECT
                c.id,
                c.nome,
                c.limite,
                c.dia_fechamento,
                c.dia_vencimento,
                c.cor,
                c.ativo,
                c.numero_cartao,
                c.data_criacao,
                c.data_atualizacao,
                u.nome as usuario_nome
            FROM cartoes c
            LEFT JOIN usuarios u ON c.usuario_id = u.id
            WHERE c.usuario_id = $1
            ORDER BY c.numero_cartao ASC NULLS LAST, c.id ASC
        `;

        const result = await query(queryText, [targetUserId]);

        res.json({
            success: true,
            message: 'Cartões carregados com sucesso',
            data: result.rows
        });

    } catch (error) {
        console.error('Erro ao buscar cartões:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const cartaoId = parseInt(req.params.id);
        
        if (isNaN(cartaoId)) {
            return res.status(400).json({
                success: false,
                message: 'ID do cartão deve ser um número válido'
            });
        }
        
        const queryText = `
            SELECT id, nome, limite, dia_fechamento, dia_vencimento, cor, ativo, data_criacao, data_atualizacao
            FROM cartoes 
            WHERE id = $1 AND usuario_id = $2
        `;
        
        const result = await query(queryText, [cartaoId, req.usuario_id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Cartão não encontrado'
            });
        }
        
        res.json({
            success: true,
            message: 'Cartão encontrado',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao buscar cartão:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

router.put('/', async (req, res) => {
    try {
        const { cartoes } = req.body;
        
        if (!Array.isArray(cartoes)) {
            return res.status(400).json({
                success: false,
                message: 'Dados de cartões inválidos. Esperado array de cartões.'
            });
        }
        
        if (cartoes.length > 3) {
            return res.status(400).json({
                success: false,
                message: 'Máximo de 3 cartões permitidos'
            });
        }
        
        for (let i = 0; i < cartoes.length; i++) {
            const cartao = cartoes[i];
            
            if (!cartao.nome || cartao.nome.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: `Cartão ${i + 1}: Nome é obrigatório`
                });
            }
            
            if (cartao.nome.length > 255) {
                return res.status(400).json({
                    success: false,
                    message: `Cartão ${i + 1}: Nome deve ter no máximo 255 caracteres`
                });
            }
            
            if (!cartao.limite || cartao.limite <= 0) {
                return res.status(400).json({
                    success: false,
                    message: `Cartão ${i + 1}: Limite deve ser maior que zero`
                });
            }
            
            if (cartao.limite > 999999.99) {
                return res.status(400).json({
                    success: false,
                    message: `Cartão ${i + 1}: Limite máximo é R$ 999.999,99`
                });
            }
            
            if (!cartao.dia_fechamento || cartao.dia_fechamento < 1 || cartao.dia_fechamento > 31) {
                return res.status(400).json({
                    success: false,
                    message: `Cartão ${i + 1}: Dia de fechamento deve ser entre 1 e 31`
                });
            }
            
            if (!cartao.dia_vencimento || cartao.dia_vencimento < 1 || cartao.dia_vencimento > 31) {
                return res.status(400).json({
                    success: false,
                    message: `Cartão ${i + 1}: Dia de vencimento deve ser entre 1 e 31`
                });
            }
        }
        
        // Usar transação manual
        await query('BEGIN');
        
        try {
            await query('DELETE FROM cartoes WHERE usuario_id = $1', [req.usuario_id]);
            
            const cartoesInseridos = [];
            
            for (let i = 0; i < cartoes.length; i++) {
                const cartao = cartoes[i];

                const insertQuery = `
                    INSERT INTO cartoes (usuario_id, nome, limite, dia_fechamento, dia_vencimento, cor, ativo, numero_cartao)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING id, nome, limite, dia_fechamento, dia_vencimento, cor, ativo, numero_cartao, data_criacao, data_atualizacao
                `;

                const values = [
                    req.usuario_id,
                    cartao.nome.trim(),
                    parseFloat(cartao.limite),
                    parseInt(cartao.dia_fechamento),
                    parseInt(cartao.dia_vencimento),
                    cartao.cor || '#3498db',
                    true,
                    cartao.numero_cartao || (i + 1)
                ];

                const result = await query(insertQuery, values);
                cartoesInseridos.push(result.rows[0]);
            }
            
            await query('COMMIT');
            
            res.json({
                success: true,
                message: 'Cartões salvos com sucesso',
                data: cartoesInseridos
            });
            
        } catch (error) {
            await query('ROLLBACK');
            throw error;
        }
        
    } catch (error) {
        console.error('Erro ao salvar cartões:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

router.post('/', async (req, res) => {
    try {
        const { nome, limite, dia_fechamento, dia_vencimento, cor } = req.body;
        
        if (!nome || nome.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Nome do cartão é obrigatório'
            });
        }
        
        if (nome.length > 255) {
            return res.status(400).json({
                success: false,
                message: 'Nome do cartão deve ter no máximo 255 caracteres'
            });
        }
        
        if (!limite || limite <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Limite deve ser maior que zero'
            });
        }
        
        if (limite > 999999.99) {
            return res.status(400).json({
                success: false,
                message: 'Limite máximo é R$ 999.999,99'
            });
        }
        
        const contarCartoes = await query(
            'SELECT COUNT(*) as total FROM cartoes WHERE usuario_id = $1',
            [req.usuario_id]
        );
        
        if (parseInt(contarCartoes.rows[0].total) >= 3) {
            return res.status(400).json({
                success: false,
                message: 'Máximo de 3 cartões permitidos por usuário'
            });
        }
        
        const verificarExistente = `
            SELECT id FROM cartoes 
            WHERE usuario_id = $1 AND LOWER(nome) = LOWER($2)
        `;
        
        const existente = await query(verificarExistente, [req.usuario_id, nome.trim()]);
        
        if (existente.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Já existe um cartão com este nome'
            });
        }
        
        const queryText = `
            INSERT INTO cartoes (usuario_id, nome, limite, dia_fechamento, dia_vencimento, cor, ativo)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, nome, limite, dia_fechamento, dia_vencimento, cor, ativo, data_criacao, data_atualizacao
        `;
        
        const values = [
            req.usuario_id,
            nome.trim(),
            parseFloat(limite),
            parseInt(dia_fechamento) || 1,
            parseInt(dia_vencimento) || 1,
            cor || '#3498db',
            true
        ];
        
        const result = await query(queryText, values);
        
        res.status(201).json({
            success: true,
            message: 'Cartão criado com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao criar cartão:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const cartaoId = parseInt(req.params.id);
        const { nome, limite, dia_fechamento, dia_vencimento, cor, ativo } = req.body;
        
        if (isNaN(cartaoId)) {
            return res.status(400).json({
                success: false,
                message: 'ID do cartão deve ser um número válido'
            });
        }
        
        if (!nome || nome.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Nome do cartão é obrigatório'
            });
        }
        
        if (nome.length > 255) {
            return res.status(400).json({
                success: false,
                message: 'Nome do cartão deve ter no máximo 255 caracteres'
            });
        }
        
        if (!limite || limite <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Limite deve ser maior que zero'
            });
        }
        
        const verificarExistencia = `
            SELECT id FROM cartoes 
            WHERE id = $1 AND usuario_id = $2
        `;
        
        const existeCartao = await query(verificarExistencia, [cartaoId, req.usuario_id]);
        
        if (existeCartao.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Cartão não encontrado'
            });
        }
        
        const verificarNomeDuplicado = `
            SELECT id FROM cartoes 
            WHERE usuario_id = $1 AND LOWER(nome) = LOWER($2) AND id != $3
        `;
        
        const nomeDuplicado = await query(verificarNomeDuplicado, [req.usuario_id, nome.trim(), cartaoId]);
        
        if (nomeDuplicado.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Já existe um cartão com este nome'
            });
        }
        
        const queryText = `
            UPDATE cartoes 
            SET nome = $1, limite = $2, dia_fechamento = $3, dia_vencimento = $4, cor = $5, ativo = $6, data_atualizacao = CURRENT_TIMESTAMP
            WHERE id = $7 AND usuario_id = $8
            RETURNING id, nome, limite, dia_fechamento, dia_vencimento, cor, ativo, data_criacao, data_atualizacao
        `;
        
        const values = [
            nome.trim(),
            parseFloat(limite),
            parseInt(dia_fechamento) || 1,
            parseInt(dia_vencimento) || 1,
            cor || '#3498db',
            ativo !== undefined ? ativo : true,
            cartaoId,
            req.usuario_id
        ];
        
        const result = await query(queryText, values);
        
        res.json({
            success: true,
            message: 'Cartão atualizado com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao atualizar cartão:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const cartaoId = parseInt(req.params.id);
        
        if (isNaN(cartaoId)) {
            return res.status(400).json({
                success: false,
                message: 'ID do cartão deve ser um número válido'
            });
        }
        
        const verificarExistencia = `
            SELECT id, nome FROM cartoes 
            WHERE id = $1 AND usuario_id = $2
        `;
        
        const existeCartao = await query(verificarExistencia, [cartaoId, req.usuario_id]);
        
        if (existeCartao.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Cartão não encontrado'
            });
        }
        
        const verificarUso = `
            SELECT COUNT(*) as total FROM despesas 
            WHERE cartao_id = $1 AND usuario_id = $2
        `;
        
        const usoCartao = await query(verificarUso, [cartaoId, req.usuario_id]);
        const totalUsos = parseInt(usoCartao.rows[0].total);
        
        if (totalUsos > 0) {
            return res.status(400).json({
                success: false,
                message: `Não é possível excluir este cartão pois ele está sendo usado em ${totalUsos} despesa(s). Primeiro altere ou exclua essas despesas.`
            });
        }
        
        const queryText = `
            DELETE FROM cartoes 
            WHERE id = $1 AND usuario_id = $2
        `;
        
        await query(queryText, [cartaoId, req.usuario_id]);
        
        res.json({
            success: true,
            message: `Cartão "${existeCartao.rows[0].nome}" excluído com sucesso`
        });
        
    } catch (error) {
        console.error('Erro ao excluir cartão:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

router.get('/estatisticas/uso', async (req, res) => {
    try {
        const queryText = `
            SELECT 
                c.id,
                c.nome,
                c.limite,
                c.cor,
                COUNT(d.id) as total_uso,
                COALESCE(SUM(d.valor), 0) as valor_total_gasto,
                (c.limite - COALESCE(SUM(d.valor), 0)) as limite_disponivel,
                CASE 
                    WHEN c.limite > 0 THEN ROUND((COALESCE(SUM(d.valor), 0) / c.limite * 100), 2)
                    ELSE 0 
                END as percentual_uso
            FROM cartoes c
            LEFT JOIN despesas d ON c.id = d.cartao_id AND d.forma_pagamento = 'credito'
            WHERE c.usuario_id = $1
            GROUP BY c.id, c.nome, c.limite, c.cor
            ORDER BY percentual_uso DESC, c.nome ASC
        `;
        
        const result = await query(queryText, [req.usuario_id]);
        
        res.json({
            success: true,
            message: 'Estatísticas de uso carregadas',
            data: result.rows
        });
        
    } catch (error) {
        console.error('Erro ao buscar estatísticas de cartões:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

router.put('/:id/ativar', async (req, res) => {
    try {
        const cartaoId = parseInt(req.params.id);
        
        if (isNaN(cartaoId)) {
            return res.status(400).json({
                success: false,
                message: 'ID do cartão deve ser um número válido'
            });
        }
        
        const queryText = `
            UPDATE cartoes 
            SET ativo = true, data_atualizacao = CURRENT_TIMESTAMP
            WHERE id = $1 AND usuario_id = $2
            RETURNING id, nome, ativo
        `;
        
        const result = await query(queryText, [cartaoId, req.usuario_id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Cartão não encontrado'
            });
        }
        
        res.json({
            success: true,
            message: `Cartão "${result.rows[0].nome}" ativado com sucesso`,
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao ativar cartão:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

router.put('/:id/desativar', async (req, res) => {
    try {
        const cartaoId = parseInt(req.params.id);
        
        if (isNaN(cartaoId)) {
            return res.status(400).json({
                success: false,
                message: 'ID do cartão deve ser um número válido'
            });
        }
        
        const queryText = `
            UPDATE cartoes 
            SET ativo = false, data_atualizacao = CURRENT_TIMESTAMP
            WHERE id = $1 AND usuario_id = $2
            RETURNING id, nome, ativo
        `;
        
        const result = await query(queryText, [cartaoId, req.usuario_id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Cartão não encontrado'
            });
        }
        
        res.json({
            success: true,
            message: `Cartão "${result.rows[0].nome}" desativado com sucesso`,
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao desativar cartão:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

module.exports = router;