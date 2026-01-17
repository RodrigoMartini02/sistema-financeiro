const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// ================================================================
// FUNÇÃO AUXILIAR - OBTER PRÓXIMO NÚMERO PARA DESPESA
// ================================================================
async function obterProximoNumero(usuarioId) {
    const result = await query(
        'SELECT COALESCE(MAX(numero), 0) + 1 as proximo FROM despesas WHERE usuario_id = $1',
        [usuarioId]
    );
    return result.rows[0].proximo;
}

// ================================================================
// BUSCAR DESPESAS - COMPATÍVEL COM FRONTEND
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
            whereClause = `WHERE d.usuario_id = $${paramCount}`;
            params.push(parseInt(usuario_id));
        } else {
            // Usuário comum vê apenas seus dados
            paramCount++;
            whereClause = `WHERE d.usuario_id = $${paramCount}`;
            params.push(req.usuario.id);
        }

        if (mes !== undefined && ano !== undefined) {
            whereClause += ` AND d.mes = $${paramCount + 1} AND d.ano = $${paramCount + 2}`;
            params.push(parseInt(mes), parseInt(ano));
            paramCount += 2;
        }

        // ✅ BUSCAR COM JOIN para pegar nome da categoria
        const result = await query(
            `SELECT
                d.*,
                c.nome as categoria_nome,
                u.nome as usuario_nome
             FROM despesas d
             LEFT JOIN categorias c ON d.categoria_id = c.id
             LEFT JOIN usuarios u ON d.usuario_id = u.id
             ${whereClause}
             ORDER BY d.data_vencimento ASC`,
            params
        );

        res.json({
            success: true,
            data: result.rows
        });

    } catch (error) {
        console.error('Erro ao buscar despesas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar despesas'
        });
    }
});

// ================================================================
// CRIAR DESPESA - ACEITA CAMPOS DO FRONTEND
// ================================================================
router.post('/', authMiddleware, [
    body('descricao').notEmpty().withMessage('Descrição é obrigatória'),
    body('valor').isFloat({ min: 0.01 }).withMessage('Valor deve ser maior que zero'),
    body('data_vencimento').isISO8601().withMessage('Data inválida'),
    body('mes').isInt({ min: 0, max: 11 }).withMessage('Mês inválido'),
    body('ano').isInt({ min: 2000 }).withMessage('Ano inválido')
], async (req, res) => {
    try {
        // Log detalhado dos dados recebidos
        console.log('📥 Dados recebidos para criar despesa:', JSON.stringify({
            ...req.body,
            anexos: req.body.anexos ? `[${req.body.anexos.length} anexo(s)]` : null
        }, null, 2));

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.error('❌ Erros de validação na despesa:', errors.array());
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const {
            descricao, valor, data_vencimento, data_compra, data_pagamento,
            mes, ano, categoria_id, cartao_id, forma_pagamento,
            parcelado, total_parcelas, parcela_atual, observacoes, pago,
            valor_original, valor_total_com_juros, valor_pago, anexos
        } = req.body;

        console.log('📝 Criando despesa:', {
            descricao, valor, data_vencimento, mes, ano,
            categoria_id, forma_pagamento, parcelado, usuario_id: req.usuario.id,
            temAnexos: anexos && anexos.length > 0
        });

        // ✅ Se categoria_id não foi fornecida, buscar a primeira categoria do usuário
        let categoriaFinal = categoria_id;
        if (!categoriaFinal) {
            const catResult = await query(
                'SELECT id FROM categorias WHERE usuario_id = $1 ORDER BY id ASC LIMIT 1',
                [req.usuario.id]
            );
            if (catResult.rows.length > 0) {
                categoriaFinal = catResult.rows[0].id;
                console.log('📁 Usando categoria padrão:', categoriaFinal);
            } else {
                console.warn('⚠️ Nenhuma categoria encontrada para o usuário');
                categoriaFinal = null; // Permitir NULL na tabela
            }
        }

        // ✅ CORRIGIR: aceitar total_parcelas do frontend
        const numeroParcelas = total_parcelas || null;
        const parcelaAtual = parcela_atual || (parcelado ? 1 : null);

        // ✅ VALIDAR CARTAO_ID: verificar se existe na tabela cartoes do usuário
        let cartaoIdFinal = cartao_id || null;
        if (cartaoIdFinal) {
            const cartaoResult = await query(
                'SELECT id FROM cartoes WHERE id = $1 AND usuario_id = $2',
                [cartaoIdFinal, req.usuario.id]
            );
            if (cartaoResult.rows.length === 0) {
                console.warn(`⚠️ Cartão ID ${cartaoIdFinal} não encontrado para usuário ${req.usuario.id}, ignorando cartao_id`);
                cartaoIdFinal = null;
            }
        }

        // ✅ OBTER PRÓXIMO NÚMERO
        const proximoNumero = await obterProximoNumero(req.usuario.id);

        // Converter anexos para JSON se existirem
        const anexosJson = anexos && Array.isArray(anexos) && anexos.length > 0 ? JSON.stringify(anexos) : null;

        const result = await query(
            `INSERT INTO despesas (
                usuario_id, descricao, valor, data_vencimento, data_compra, data_pagamento,
                mes, ano, categoria_id, cartao_id, forma_pagamento,
                parcelado, numero_parcelas, parcela_atual, observacoes, pago,
                valor_original, valor_total_com_juros, valor_pago, numero, anexos
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
            RETURNING *`,
            [
                req.usuario.id, descricao, parseFloat(valor), data_vencimento,
                data_compra || null, data_pagamento || null, mes, ano,
                categoriaFinal, cartaoIdFinal, forma_pagamento || 'dinheiro',
                parcelado || false, numeroParcelas, parcelaAtual,
                observacoes || null, pago || false,
                valor_original ? parseFloat(valor_original) : null,
                valor_total_com_juros ? parseFloat(valor_total_com_juros) : null,
                valor_pago ? parseFloat(valor_pago) : null,
                proximoNumero,
                anexosJson
            ]
        );

        console.log('✅ Despesa criada com sucesso:', result.rows[0].id);

        // ✅ Se for parcelado, criar as parcelas futuras
        if (parcelado && numeroParcelas && numeroParcelas > 1) {
            await criarParcelasFuturas(req.usuario.id, result.rows[0], numeroParcelas);
        }

        res.status(201).json({
            success: true,
            message: 'Despesa cadastrada com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('❌ Erro detalhado ao criar despesa:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Erro ao criar despesa',
            error: error.message,
            detalhes: error.detail || error.hint
        });
    }
});

// ================================================================
// FUNÇÃO AUXILIAR - CRIAR PARCELAS FUTURAS
// ================================================================
async function criarParcelasFuturas(usuarioId, despesaBase, totalParcelas) {
    try {
        for (let i = 2; i <= totalParcelas; i++) {
            // Calcular mês/ano da próxima parcela
            let proximoMes = despesaBase.mes + (i - 1);
            let proximoAno = despesaBase.ano;
            
            while (proximoMes > 11) {
                proximoMes -= 12;
                proximoAno += 1;
            }
            
            // Data de vencimento da próxima parcela
            // Criar data local sem conversão UTC
            const [ano, mes, dia] = despesaBase.data_vencimento.split('-').map(Number);
            const dataVencimentoBase = new Date(ano, mes - 1, dia);
            dataVencimentoBase.setMonth(dataVencimentoBase.getMonth() + (i - 1));

            // Formatar como YYYY-MM-DD local
            const proximoAnoCalc = dataVencimentoBase.getFullYear();
            const proximoMesCalc = String(dataVencimentoBase.getMonth() + 1).padStart(2, '0');
            const proximoDiaCalc = String(dataVencimentoBase.getDate()).padStart(2, '0');
            const proximaDataVencimento = `${proximoAnoCalc}-${proximoMesCalc}-${proximoDiaCalc}`;
            
            await query(
                `INSERT INTO despesas (
                    usuario_id, descricao, valor, data_vencimento, data_compra,
                    mes, ano, categoria_id, cartao_id, forma_pagamento,
                    parcelado, numero_parcelas, parcela_atual, observacoes, pago,
                    grupo_parcelamento_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
                [
                    usuarioId, 
                    despesaBase.descricao + ` (${i}/${totalParcelas})`,
                    despesaBase.valor,
                    proximaDataVencimento,
                    despesaBase.data_compra,
                    proximoMes,
                    proximoAno,
                    despesaBase.categoria_id,
                    despesaBase.cartao_id,
                    despesaBase.forma_pagamento,
                    true,
                    totalParcelas,
                    i,
                    despesaBase.observacoes,
                    false,
                    despesaBase.id // Usar ID da primeira parcela como grupo
                ]
            );
        }
        
        // Atualizar primeira parcela com info de grupo
        await query(
            `UPDATE despesas 
             SET grupo_parcelamento_id = $1, 
                 descricao = $2,
                 parcela_atual = 1
             WHERE id = $1`,
            [despesaBase.id, despesaBase.descricao + ` (1/${totalParcelas})`]
        );
        
    } catch (error) {
        console.error('Erro ao criar parcelas futuras:', error);
    }
}

// ================================================================
// ATUALIZAR DESPESA - COMPATÍVEL COM FRONTEND
// ================================================================
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            descricao, valor, data_vencimento, data_compra, data_pagamento,
            categoria_id, cartao_id, forma_pagamento, observacoes, pago,
            total_parcelas, parcela_atual, valor_original, valor_total_com_juros, valor_pago, anexos
        } = req.body;

        // ✅ ACEITAR total_parcelas e parcela_atual do frontend
        const numeroParcelas = total_parcelas || null;
        const parcelaAtual = parcela_atual || null;

        // ✅ VALIDAR CARTAO_ID: verificar se existe na tabela cartoes do usuário
        let cartaoIdFinal = cartao_id || null;
        if (cartaoIdFinal) {
            const cartaoResult = await query(
                'SELECT id FROM cartoes WHERE id = $1 AND usuario_id = $2',
                [cartaoIdFinal, req.usuario.id]
            );
            if (cartaoResult.rows.length === 0) {
                console.warn(`⚠️ Cartão ID ${cartaoIdFinal} não encontrado para usuário ${req.usuario.id}, ignorando cartao_id`);
                cartaoIdFinal = null;
            }
        }

        // Converter anexos para JSON se existirem
        const anexosJson = anexos && Array.isArray(anexos) && anexos.length > 0 ? JSON.stringify(anexos) : null;

        const result = await query(
            `UPDATE despesas
             SET descricao = $1, valor = $2, data_vencimento = $3, data_compra = $4,
                 data_pagamento = $5, categoria_id = $6, cartao_id = $7,
                 forma_pagamento = $8, observacoes = $9, pago = $10,
                 numero_parcelas = $11, parcela_atual = $12,
                 valor_original = $13, valor_total_com_juros = $14, valor_pago = $15, anexos = $16
             WHERE id = $17 AND usuario_id = $18
             RETURNING *`,
            [
                descricao, parseFloat(valor), data_vencimento, data_compra,
                data_pagamento, categoria_id || null, cartaoIdFinal, forma_pagamento,
                observacoes, pago, numeroParcelas, parcelaAtual,
                valor_original ? parseFloat(valor_original) : null,
                valor_total_com_juros ? parseFloat(valor_total_com_juros) : null,
                valor_pago ? parseFloat(valor_pago) : null,
                anexosJson,
                id, req.usuario.id
            ]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Despesa não encontrada'
            });
        }
        
        res.json({
            success: true,
            message: 'Despesa atualizada com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao atualizar despesa:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar despesa'
        });
    }
});

// ================================================================
// EXCLUIR DESPESA
// ================================================================
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { excluir_grupo } = req.query; // Para excluir grupo de parcelamento
        
        if (excluir_grupo === 'true') {
            // Excluir todo o grupo de parcelamento
            await query(
                `DELETE FROM despesas 
                 WHERE (id = $1 OR grupo_parcelamento_id = $1) 
                 AND usuario_id = $2`,
                [id, req.usuario.id]
            );
        } else {
            // Excluir apenas esta parcela
            const result = await query(
                'DELETE FROM despesas WHERE id = $1 AND usuario_id = $2 RETURNING *',
                [id, req.usuario.id]
            );
            
            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Despesa não encontrada'
                });
            }
        }
        
        res.json({
            success: true,
            message: 'Despesa excluída com sucesso'
        });
        
    } catch (error) {
        console.error('Erro ao excluir despesa:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao excluir despesa'
        });
    }
});

// ================================================================
// PAGAR DESPESA - COMPATÍVEL COM FRONTEND
// ================================================================
router.post('/:id/pagar', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { data_pagamento, valor_pago, quitar_futuras } = req.body;
        
        const dataPagamento = data_pagamento || new Date().toISOString().split('T')[0];
        
        // Atualizar despesa atual
        const result = await query(
            `UPDATE despesas 
             SET pago = true, data_pagamento = $1, valor_pago = $2
             WHERE id = $3 AND usuario_id = $4
             RETURNING *`,
            [dataPagamento, valor_pago || null, id, req.usuario.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Despesa não encontrada'
            });
        }
        
        // ✅ Se quitar_futuras = true, quitar parcelas futuras do mesmo grupo
        if (quitar_futuras && result.rows[0].grupo_parcelamento_id) {
            await query(
                `UPDATE despesas 
                 SET pago = true, data_pagamento = $1, valor_pago = 0
                 WHERE grupo_parcelamento_id = $2 
                 AND parcela_atual > $3 
                 AND usuario_id = $4`,
                [
                    dataPagamento, 
                    result.rows[0].grupo_parcelamento_id,
                    result.rows[0].parcela_atual,
                    req.usuario.id
                ]
            );
        }
        
        res.json({
            success: true,
            message: 'Pagamento processado com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao marcar despesa como paga:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao processar pagamento'
        });
    }
});

// ================================================================
// BUSCAR CATEGORIAS - PARA DROPDOWN DO FRONTEND
// ================================================================
router.get('/categorias', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            'SELECT * FROM categorias ORDER BY nome ASC'
        );
        
        res.json({
            success: true,
            data: result.rows
        });
        
    } catch (error) {
        console.error('Erro ao buscar categorias:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar categorias'
        });
    }
});

module.exports = router;