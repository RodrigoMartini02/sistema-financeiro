const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// ================================================================
// GET / — listar representantes do perfil ativo
// ================================================================
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { perfil_id } = req.query;
        const result = await query(
            `SELECT r.*,
                COALESCE(json_agg(c ORDER BY c.tipo_receita) FILTER (WHERE c.id IS NOT NULL), '[]') AS comissoes
             FROM representantes r
             LEFT JOIN comissoes c ON c.representante_id = r.id AND c.ativo = true
             WHERE r.usuario_id = $1 AND r.ativo = true
               AND ($2::int IS NULL OR r.perfil_id = $2)
             GROUP BY r.id
             ORDER BY r.nome ASC`,
            [req.usuario.id, perfil_id ? parseInt(perfil_id) : null]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Erro ao buscar representantes:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar representantes' });
    }
});

// ================================================================
// POST / — criar representante
// ================================================================
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { nome, email, telefone, perfil_id, comissoes: comissoesInput } = req.body;

        if (!nome || nome.trim() === '') {
            return res.status(400).json({ success: false, message: 'Nome é obrigatório' });
        }

        const result = await query(
            `INSERT INTO representantes (usuario_id, perfil_id, nome, email, telefone)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [req.usuario.id, perfil_id ? parseInt(perfil_id) : null, nome.trim(),
             email || null, telefone || null]
        );

        const rep = result.rows[0];

        if (Array.isArray(comissoesInput) && comissoesInput.length > 0) {
            for (const c of comissoesInput) {
                if (c.tipo_receita && c.percentual != null) {
                    await query(
                        `INSERT INTO comissoes (representante_id, tipo_receita, percentual)
                         VALUES ($1, $2, $3)`,
                        [rep.id, c.tipo_receita, parseFloat(c.percentual)]
                    );
                }
            }
        }

        // Auto-criar categoria "Comissão" se não existir para este usuário
        await query(
            `INSERT INTO categorias (usuario_id, nome, cor, icone)
             SELECT $1, 'Comissão', '#f59e0b', 'handshake'
             WHERE NOT EXISTS (
                 SELECT 1 FROM categorias WHERE usuario_id = $1 AND LOWER(nome) = 'comissão'
             )`,
            [req.usuario.id]
        );

        res.status(201).json({ success: true, message: 'Representante criado', data: rep });
    } catch (error) {
        console.error('Erro ao criar representante:', error);
        res.status(500).json({ success: false, message: 'Erro ao criar representante' });
    }
});

// ================================================================
// PUT /:id — editar representante + suas comissões
// ================================================================
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, email, telefone, comissoes: comissoesInput } = req.body;

        if (!nome || nome.trim() === '') {
            return res.status(400).json({ success: false, message: 'Nome é obrigatório' });
        }

        const result = await query(
            `UPDATE representantes SET nome = $1, email = $2, telefone = $3
             WHERE id = $4 AND usuario_id = $5 RETURNING *`,
            [nome.trim(), email || null, telefone || null, id, req.usuario.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Representante não encontrado' });
        }

        // Substituir comissões: desativa todas, recria as enviadas
        await query(`UPDATE comissoes SET ativo = false WHERE representante_id = $1`, [id]);

        if (Array.isArray(comissoesInput)) {
            for (const c of comissoesInput) {
                if (c.tipo_receita && c.percentual != null) {
                    await query(
                        `INSERT INTO comissoes (representante_id, tipo_receita, percentual)
                         VALUES ($1, $2, $3)
                         ON CONFLICT DO NOTHING`,
                        [id, c.tipo_receita, parseFloat(c.percentual)]
                    );
                }
            }
        }

        res.json({ success: true, message: 'Representante atualizado', data: result.rows[0] });
    } catch (error) {
        console.error('Erro ao atualizar representante:', error);
        res.status(500).json({ success: false, message: 'Erro ao atualizar representante' });
    }
});

// ================================================================
// DELETE /:id — arquivar representante
// ================================================================
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query(
            `UPDATE representantes SET ativo = false WHERE id = $1 AND usuario_id = $2 RETURNING id`,
            [id, req.usuario.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Representante não encontrado' });
        }
        res.json({ success: true, message: 'Representante arquivado' });
    } catch (error) {
        console.error('Erro ao arquivar representante:', error);
        res.status(500).json({ success: false, message: 'Erro ao arquivar representante' });
    }
});

module.exports = router;
