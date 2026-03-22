const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// ================================================================
// GET /api/avaliacoes — Buscar avaliações aprovadas (público)
// ================================================================
router.get('/', async (req, res) => {
    try {
        const result = await query(
            `SELECT id, autor, estrelas, comentario, data_criacao
             FROM avaliacoes
             WHERE aprovada = true
             ORDER BY data_criacao DESC
             LIMIT 100`
        );

        const total = result.rows.length;
        const media = total > 0
            ? (result.rows.reduce((acc, r) => acc + r.estrelas, 0) / total).toFixed(1)
            : '0.0';

        res.json({
            success: true,
            data: {
                avaliacoes: result.rows,
                total,
                media: parseFloat(media)
            }
        });

    } catch (error) {
        console.error('Erro ao buscar avaliações:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar avaliações' });
    }
});

// ================================================================
// POST /api/avaliacoes — Enviar nova avaliação (requer login)
// ================================================================
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { estrelas, comentario } = req.body;
        const usuarioId = req.usuario.id;

        if (!estrelas || estrelas < 1 || estrelas > 5) {
            return res.status(400).json({ success: false, message: 'Avaliação deve ter entre 1 e 5 estrelas' });
        }

        if (!comentario || comentario.trim().length < 10) {
            return res.status(400).json({ success: false, message: 'Comentário deve ter pelo menos 10 caracteres' });
        }

        if (comentario.trim().length > 500) {
            return res.status(400).json({ success: false, message: 'Comentário deve ter no máximo 500 caracteres' });
        }

        // Verificar se usuário já avaliou
        const jaAvaliou = await query(
            'SELECT id FROM avaliacoes WHERE usuario_id = $1',
            [usuarioId]
        );

        if (jaAvaliou.rows.length > 0) {
            return res.status(409).json({ success: false, message: 'Você já enviou uma avaliação' });
        }

        // Buscar nome do usuário
        const usuarioResult = await query(
            'SELECT nome FROM usuarios WHERE id = $1',
            [usuarioId]
        );
        const nomeCompleto = usuarioResult.rows[0]?.nome || 'Usuário';
        const autor = nomeCompleto.split(' ')[0]; // Apenas primeiro nome

        // Inserir avaliação (aprovada automaticamente)
        const result = await query(
            `INSERT INTO avaliacoes (usuario_id, autor, estrelas, comentario, aprovada)
             VALUES ($1, $2, $3, $4, true)
             RETURNING id, autor, estrelas, comentario, data_criacao`,
            [usuarioId, autor, parseInt(estrelas), comentario.trim()]
        );

        // Marcar usuário como tendo avaliado
        await query(
            'UPDATE usuarios SET avaliacao_feita = true WHERE id = $1',
            [usuarioId]
        );

        res.status(201).json({
            success: true,
            message: 'Avaliação enviada com sucesso!',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Erro ao salvar avaliação:', error);
        res.status(500).json({ success: false, message: 'Erro ao salvar avaliação' });
    }
});

// ================================================================
// GET /api/avaliacoes/status — Verifica se o usuário já avaliou
// ================================================================
router.get('/status', authMiddleware, async (req, res) => {
    try {
        const usuarioId = req.usuario.id;

        const [avaliacaoResult, usuarioResult] = await Promise.all([
            query('SELECT id FROM avaliacoes WHERE usuario_id = $1', [usuarioId]),
            query('SELECT data_cadastro FROM usuarios WHERE id = $1', [usuarioId])
        ]);

        const jaAvaliou = avaliacaoResult.rows.length > 0;
        const dataCadastro = usuarioResult.rows[0]?.data_cadastro;

        let diasDesde = 0;
        if (dataCadastro) {
            const agora = new Date();
            const cadastro = new Date(dataCadastro);
            diasDesde = Math.floor((agora - cadastro) / (1000 * 60 * 60 * 24));
        }

        res.json({
            success: true,
            data: {
                jaAvaliou,
                diasDesde,
                deveExibir: !jaAvaliou && diasDesde >= 5
            }
        });

    } catch (error) {
        console.error('Erro ao verificar status de avaliação:', error);
        res.status(500).json({ success: false, message: 'Erro interno' });
    }
});

module.exports = router;
