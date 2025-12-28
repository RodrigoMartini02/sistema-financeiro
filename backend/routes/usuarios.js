// ================================================================
// ROTAS DE USUÁRIOS
// ================================================================

const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware, isAdmin } = require('../middleware/auth');

// ================================================================
// GET /api/usuarios/current - Dados do usuário logado
// ================================================================
router.get('/current', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            'SELECT id, nome, email, documento, tipo, status, data_cadastro FROM usuarios WHERE id = $1',
            [req.usuario.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao buscar usuário:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar dados do usuário'
        });
    }
});

// ================================================================
// PUT /api/usuarios/current - Atualizar dados do usuário logado
// ================================================================
router.put('/current', authMiddleware, async (req, res) => {
    try {
        const { nome, email } = req.body;
        
        const result = await query(
            `UPDATE usuarios 
             SET nome = $1, email = $2, data_atualizacao = CURRENT_TIMESTAMP 
             WHERE id = $3 
             RETURNING id, nome, email, documento, tipo, status`,
            [nome, email, req.usuario.id]
        );
        
        res.json({
            success: true,
            message: 'Dados atualizados com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao atualizar usuário:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar dados'
        });
    }
});

module.exports = router;