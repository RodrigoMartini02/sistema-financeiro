const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// ================================================================
// GET / — listar sócios do perfil
// ================================================================
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { perfil_id } = req.query;
        const result = await query(
            `SELECT * FROM socios
             WHERE usuario_id = $1 AND ativo = true
               AND ($2::int IS NULL OR perfil_id = $2)
             ORDER BY nome ASC`,
            [req.usuario.id, perfil_id ? parseInt(perfil_id) : null]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Erro ao buscar sócios:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar sócios' });
    }
});

// ================================================================
// POST / — criar sócio
// ================================================================
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { nome, percentual, perfil_id } = req.body;

        if (!nome || nome.trim() === '') {
            return res.status(400).json({ success: false, message: 'Nome é obrigatório' });
        }
        const pct = parseFloat(percentual);
        if (isNaN(pct) || pct <= 0 || pct > 100) {
            return res.status(400).json({ success: false, message: 'Percentual deve ser entre 0,01 e 100' });
        }

        const result = await query(
            `INSERT INTO socios (usuario_id, perfil_id, nome, percentual)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [req.usuario.id, perfil_id ? parseInt(perfil_id) : null, nome.trim(), pct]
        );

        res.status(201).json({ success: true, message: 'Sócio criado', data: result.rows[0] });
    } catch (error) {
        console.error('Erro ao criar sócio:', error);
        res.status(500).json({ success: false, message: 'Erro ao criar sócio' });
    }
});

// ================================================================
// PUT /:id — editar sócio
// ================================================================
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, percentual } = req.body;

        if (!nome || nome.trim() === '') {
            return res.status(400).json({ success: false, message: 'Nome é obrigatório' });
        }
        const pct = parseFloat(percentual);
        if (isNaN(pct) || pct <= 0 || pct > 100) {
            return res.status(400).json({ success: false, message: 'Percentual inválido' });
        }

        const result = await query(
            `UPDATE socios SET nome = $1, percentual = $2
             WHERE id = $3 AND usuario_id = $4 RETURNING *`,
            [nome.trim(), pct, id, req.usuario.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Sócio não encontrado' });
        }

        res.json({ success: true, message: 'Sócio atualizado', data: result.rows[0] });
    } catch (error) {
        console.error('Erro ao atualizar sócio:', error);
        res.status(500).json({ success: false, message: 'Erro ao atualizar sócio' });
    }
});

// ================================================================
// DELETE /:id — remover sócio
// ================================================================
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await query(
            `UPDATE socios SET ativo = false WHERE id = $1 AND usuario_id = $2 RETURNING id`,
            [id, req.usuario.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Sócio não encontrado' });
        }
        res.json({ success: true, message: 'Sócio removido' });
    } catch (error) {
        console.error('Erro ao remover sócio:', error);
        res.status(500).json({ success: false, message: 'Erro ao remover sócio' });
    }
});

module.exports = router;
