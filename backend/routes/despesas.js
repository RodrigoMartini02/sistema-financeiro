const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

async function obterProximoNumero(usuarioId) {
    const result = await query(
        'SELECT COALESCE(MAX(numero), 0) + 1 as proximo FROM despesas WHERE usuario_id = $1',
        [usuarioId]
    );
    return result.rows[0].proximo;
}

async function validarCartaoId(cartaoId, usuarioId) {
    if (!cartaoId) return null;
    const result = await query(
        'SELECT id FROM cartoes WHERE id = $1 AND usuario_id = $2',
        [cartaoId, usuarioId]
    );
    return result.rows.length > 0 ? cartaoId : null;
}

router.get('/', authMiddleware, async (req, res) => {
    try {
        const { mes, ano, usuario_id } = req.query;

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

        const { perfil_id } = req.query;
        if (perfil_id) {
            paramCount++;
            whereClause += ` AND (d.perfil_id = $${paramCount} OR (d.perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis p WHERE p.id = $${paramCount} AND p.tipo = 'pessoal' AND p.usuario_id = d.usuario_id)))`;
            params.push(parseInt(perfil_id));
        }

        // BUSCAR COM JOIN para pegar nome da categoria
        const result = await query(
            `SELECT
                d.*,
                c.nome as categoria_nome
             FROM despesas d
             LEFT JOIN categorias c ON d.categoria_id = c.id
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
    body('valor_original').isFloat({ min: 0.01 }).withMessage('Valor original deve ser maior que zero'),
    body('data_vencimento').isISO8601().withMessage('Data inválida'),
    body('mes').isInt({ min: 0, max: 11 }).withMessage('Mês inválido'),
    body('ano').isInt({ min: 2000 }).withMessage('Ano inválido')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.error('❌ Erros de validação na despesa:', errors.array());
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const {
            descricao, valor_original, valor_final, data_vencimento, data_compra, data_pagamento,
            mes, ano, categoria_id, cartao_id, forma_pagamento,
            parcelado, total_parcelas, parcela_atual, observacoes, pago,
            valor_pago, anexos, recorrente,
            perfil_id
        } = req.body;

        const numeroParcelas = total_parcelas || null;
        const parcelaAtual = parcela_atual || (parcelado ? 1 : null);

        const [catResult, proximoNumero, cartaoIdFinal] = await Promise.all([
            !categoria_id
                ? query('SELECT id FROM categorias WHERE usuario_id = $1 ORDER BY id ASC LIMIT 1', [req.usuario.id])
                : Promise.resolve(null),
            obterProximoNumero(req.usuario.id),
            validarCartaoId(cartao_id, req.usuario.id)
        ]);

        let categoriaFinal = categoria_id;
        if (!categoriaFinal) {
            categoriaFinal = catResult && catResult.rows.length > 0 ? catResult.rows[0].id : null;
        }

        // Converter anexos para JSON se existirem
        const anexosJson = anexos && Array.isArray(anexos) && anexos.length > 0 ? JSON.stringify(anexos) : null;

        const result = await query(
            `INSERT INTO despesas (
                usuario_id, descricao, data_vencimento, data_compra, data_pagamento,
                mes, ano, categoria_id, cartao_id, forma_pagamento,
                parcelado, numero_parcelas, parcela_atual, observacoes, pago,
                valor_original, valor_final, valor_pago, numero, anexos, recorrente, perfil_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
            RETURNING *`,
            [
                req.usuario.id, descricao, data_vencimento,
                data_compra || null, data_pagamento || null, mes, ano,
                categoriaFinal, cartaoIdFinal, forma_pagamento || 'dinheiro',
                parcelado || false, numeroParcelas, parcelaAtual,
                observacoes || null, pago || false,
                valor_original ? parseFloat(valor_original) : null,
                valor_final ? parseFloat(valor_final) : (valor_original ? parseFloat(valor_original) : null),
                valor_pago ? parseFloat(valor_pago) : null,
                proximoNumero,
                anexosJson,
                recorrente || false,
                perfil_id ? parseInt(perfil_id) : null
            ]
        );

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
        // Construir batch INSERT para todas as parcelas de uma vez
        const values = [];
        const params = [];
        let paramIndex = 1;

        for (let i = 2; i <= totalParcelas; i++) {
            let proximoMes = despesaBase.mes + (i - 1);
            let proximoAno = despesaBase.ano;

            while (proximoMes > 11) {
                proximoMes -= 12;
                proximoAno += 1;
            }

            const [ano, mes, dia] = despesaBase.data_vencimento.split('-').map(Number);
            const dataVencimentoBase = new Date(ano, mes - 1, dia);
            dataVencimentoBase.setMonth(dataVencimentoBase.getMonth() + (i - 1));

            const proximoAnoCalc = dataVencimentoBase.getFullYear();
            const proximoMesCalc = String(dataVencimentoBase.getMonth() + 1).padStart(2, '0');
            const proximoDiaCalc = String(dataVencimentoBase.getDate()).padStart(2, '0');
            const proximaDataVencimento = `${proximoAnoCalc}-${proximoMesCalc}-${proximoDiaCalc}`;

            const placeholders = [];
            for (let p = 0; p < 19; p++) {
                placeholders.push(`$${paramIndex++}`);
            }
            values.push(`(${placeholders.join(', ')})`);

            const valorPorParcela = parseFloat(despesaBase.valor_final) / totalParcelas;
            params.push(
                usuarioId,
                despesaBase.descricao + ` (${i}/${totalParcelas})`,
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
                despesaBase.id,
                despesaBase.recorrente || false,
                despesaBase.perfil_id || null,
                valorPorParcela,
                valorPorParcela
            );
        }

        // Uma única query para todas as parcelas
        if (values.length > 0) {
            await query(
                `INSERT INTO despesas (
                    usuario_id, descricao, data_vencimento, data_compra,
                    mes, ano, categoria_id, cartao_id, forma_pagamento,
                    parcelado, numero_parcelas, parcela_atual, observacoes, pago,
                    grupo_parcelamento_id, recorrente, perfil_id,
                    valor_original, valor_final
                ) VALUES ${values.join(', ')}`,
                params
            );
        }

        // Atualizar primeira parcela com info de grupo
        await query(
            `UPDATE despesas
             SET grupo_parcelamento_id = $1,
                 descricao = $2,
                 parcela_atual = 1
             WHERE id = $3`,
            [despesaBase.id, despesaBase.descricao + ` (1/${totalParcelas})`, despesaBase.id]
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
            descricao, valor_original, valor_final, data_vencimento, data_compra, data_pagamento,
            categoria_id, cartao_id, forma_pagamento, observacoes, pago,
            total_parcelas, parcela_atual, valor_pago, anexos,
            mes, ano, parcelado, recorrente, perfil_id
        } = req.body;

        const numeroParcelas = total_parcelas || null;
        const parcelaAtual = parcela_atual || null;
        const cartaoIdFinal = await validarCartaoId(cartao_id, req.usuario.id);

        // Converter anexos para JSON se existirem
        const anexosJson = anexos && Array.isArray(anexos) && anexos.length > 0 ? JSON.stringify(anexos) : null;

        const result = await query(
            `UPDATE despesas
             SET descricao = $1, data_vencimento = $2, data_compra = $3,
                 data_pagamento = $4, categoria_id = $5, cartao_id = $6,
                 forma_pagamento = $7, observacoes = $8, pago = $9,
                 numero_parcelas = $10, parcela_atual = $11,
                 valor_original = $12, valor_final = $13, valor_pago = $14, anexos = $15,
                 mes = COALESCE($16, mes), ano = COALESCE($17, ano), parcelado = COALESCE($18, parcelado),
                 recorrente = COALESCE($19, recorrente),
                 perfil_id = COALESCE($20, perfil_id)
             WHERE id = $21 AND usuario_id = $22
             RETURNING *`,
            [
                descricao, data_vencimento, data_compra,
                data_pagamento, categoria_id || null, cartaoIdFinal, forma_pagamento,
                observacoes, pago, numeroParcelas, parcelaAtual,
                valor_original ? parseFloat(valor_original) : null,
                valor_final ? parseFloat(valor_final) : (valor_original ? parseFloat(valor_original) : null),
                valor_pago ? parseFloat(valor_pago) : null,
                anexosJson,
                mes !== undefined ? mes : null, ano !== undefined ? ano : null, parcelado !== undefined ? parcelado : null,
                recorrente !== undefined ? recorrente : null,
                perfil_id ? parseInt(perfil_id) : null,
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
// CANCELAR DESPESA
// ================================================================
router.put('/:id/cancelar', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query(
            `UPDATE despesas SET status = 'cancelada' WHERE id = $1 AND usuario_id = $2 RETURNING *`,
            [parseInt(id), req.usuario.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Despesa não encontrada' });
        }
        res.json({ success: true, message: 'Despesa cancelada', data: result.rows[0] });
    } catch (error) {
        console.error('Erro ao cancelar despesa:', error);
        res.status(500).json({ success: false, message: 'Erro ao cancelar despesa' });
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
// MOVER DESPESA PARA O PRÓXIMO MÊS
// ================================================================
router.post('/:id/mover', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const orig = await query(
            'SELECT * FROM despesas WHERE id = $1 AND usuario_id = $2',
            [id, req.usuario.id]
        );

        if (orig.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Despesa não encontrada' });
        }

        const d = orig.rows[0];
        const novoMes = d.mes === 12 ? 1 : d.mes + 1;
        const novoAno = d.mes === 12 ? d.ano + 1 : d.ano;

        const novaVencimento = d.data_vencimento
            ? `${novoAno}-${String(novoMes).padStart(2, '0')}-${d.data_vencimento.toISOString().slice(8, 10)}`
            : `${novoAno}-${String(novoMes).padStart(2, '0')}-15`;

        const result = await query(
            `INSERT INTO despesas (
                descricao, valor_original, valor_final, data_vencimento, data_compra,
                mes, ano, forma_pagamento, observacoes, pago, recorrente, parcelado,
                numero_nf, data_emissao_nf, tipo_despesa, categoria_id, cartao_id,
                usuario_id, perfil_id, grupo_parcelamento_id, parcela_atual, numero_parcelas
            ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
            ) RETURNING *`,
            [
                d.descricao, d.valor_original, d.valor_final, novaVencimento, d.data_compra,
                novoMes, novoAno, d.forma_pagamento, d.observacoes, d.recorrente, d.parcelado,
                d.numero_nf, d.data_emissao_nf, d.tipo_despesa, d.categoria_id, d.cartao_id,
                d.usuario_id, d.perfil_id, d.grupo_parcelamento_id, d.parcela_atual, d.numero_parcelas,
            ]
        );

        res.json({ success: true, data: result.rows[0] });

    } catch (error) {
        console.error('Erro ao mover despesa:', error);
        res.status(500).json({ success: false, message: 'Erro ao mover despesa' });
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