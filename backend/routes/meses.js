const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// Helper: cláusula WHERE + params para filtrar por perfil (mesmo padrão usado em despesas/receitas)
function perfilWhere(perfilId, paramIndex) {
    if (!perfilId) return { clause: '', params: [] };
    return {
        clause: ` AND (perfil_id = $${paramIndex} OR (perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis p WHERE p.id = $${paramIndex} AND p.tipo = 'pessoal' AND p.usuario_id = usuario_id)))`,
        params: [perfilId]
    };
}

// ================================================================
// GET /api/meses - Buscar todos os meses do usuário
// ================================================================
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { perfil_id } = req.query;
        const perfilId = perfil_id ? parseInt(perfil_id) : null;
        const { clause, params: extraParams } = perfilWhere(perfilId, 2);

        const result = await query(
            `SELECT ano, mes, fechado, saldo_final, data_fechamento
             FROM meses
             WHERE usuario_id = $1${clause}
             ORDER BY ano DESC, mes DESC`,
            [req.usuario.id, ...extraParams]
        );

        res.json({ success: true, data: result.rows });

    } catch (error) {
        console.error('Erro ao buscar meses:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar meses' });
    }
});

// ================================================================
// GET /api/meses/:ano/:mes - Buscar mês específico (com filtro de perfil)
// ================================================================
router.get('/:ano/:mes', authMiddleware, async (req, res) => {
    try {
        const { ano, mes } = req.params;
        const { perfil_id } = req.query;
        const perfilId = perfil_id ? parseInt(perfil_id) : null;
        const { clause, params: extraParams } = perfilWhere(perfilId, 4);

        const result = await query(
            `SELECT * FROM meses
             WHERE usuario_id = $1 AND ano = $2 AND mes = $3${clause}
             ORDER BY perfil_id NULLS LAST
             LIMIT 1`,
            [req.usuario.id, parseInt(ano), parseInt(mes), ...extraParams]
        );

        if (result.rows.length === 0) {
            return res.json({ success: true, data: { fechado: false, saldo_anterior: 0, saldo_final: 0 } });
        }

        res.json({ success: true, data: result.rows[0] });

    } catch (error) {
        console.error('Erro ao buscar mês:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar dados do mês' });
    }
});

// ================================================================
// POST /api/meses/:ano/:mes/fechar
// ================================================================
router.post('/:ano/:mes/fechar', authMiddleware, async (req, res) => {
    try {
        const { ano, mes } = req.params;
        const { saldo_final, perfil_id } = req.body;
        const perfilId = perfil_id ? parseInt(perfil_id) : null;
        const anoInt = parseInt(ano);
        const mesInt = parseInt(mes);
        const saldoFinal = parseFloat(saldo_final);

        // UPSERT usando índice funcional COALESCE(perfil_id, 0)
        const result = await query(
            `INSERT INTO meses (usuario_id, ano, mes, fechado, saldo_final, saldo_anterior, perfil_id)
             VALUES ($1, $2, $3, true, $4, 0, $5)
             ON CONFLICT (usuario_id, ano, mes, COALESCE(perfil_id, 0))
             DO UPDATE SET fechado = true, saldo_final = EXCLUDED.saldo_final,
                           data_fechamento = NOW()
             RETURNING *`,
            [req.usuario.id, anoInt, mesInt, saldoFinal, perfilId]
        );

        res.json({ success: true, message: 'Mês fechado com sucesso', data: result.rows[0] });

    } catch (error) {
        console.error('Erro ao fechar mês:', error);
        res.status(500).json({ success: false, message: 'Erro ao fechar mês' });
    }
});

// ================================================================
// POST /api/meses/:ano/:mes/reabrir
// ================================================================
router.post('/:ano/:mes/reabrir', authMiddleware, async (req, res) => {
    try {
        const { ano, mes } = req.params;
        const { perfil_id } = req.body;
        const perfilId = perfil_id ? parseInt(perfil_id) : null;
        const { clause, params: extraParams } = perfilWhere(perfilId, 4);

        const result = await query(
            `UPDATE meses SET fechado = false, data_fechamento = NULL
             WHERE usuario_id = $1 AND ano = $2 AND mes = $3${clause}
             RETURNING *`,
            [req.usuario.id, parseInt(ano), parseInt(mes), ...extraParams]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Mês não encontrado' });
        }

        res.json({ success: true, message: 'Mês reaberto com sucesso', data: result.rows[0] });

    } catch (error) {
        console.error('Erro ao reabrir mês:', error);
        res.status(500).json({ success: false, message: 'Erro ao reabrir mês' });
    }
});

// ================================================================
// GET /api/meses/:ano/:mes/saldo
// ================================================================
router.get('/:ano/:mes/saldo', authMiddleware, async (req, res) => {
    try {
        const { ano, mes } = req.params;
        const { perfil_id } = req.query;

        const mesInt = parseInt(mes);
        const anoInt = parseInt(ano);
        const mesAnterior = mesInt === 0 ? 11 : mesInt - 1;
        const anoAnterior = mesInt === 0 ? anoInt - 1 : anoInt;

        const perfilIdInt = perfil_id ? parseInt(perfil_id) : null;
        const { clause: perfilClause, params: perfilParams } = perfilWhere(perfilIdInt, 4);
        const { clause: perfilClauseAnt, params: perfilParamsAnt } = perfilWhere(perfilIdInt, 4);

        const [receitas, despesas, saldoAnterior] = await Promise.all([
            query(
                `SELECT COALESCE(SUM(valor), 0) as total FROM receitas WHERE usuario_id = $1 AND ano = $2 AND mes = $3${perfilClause}`,
                [req.usuario.id, anoInt, mesInt, ...perfilParams]
            ),
            query(
                `SELECT COALESCE(SUM(valor), 0) as total FROM despesas WHERE usuario_id = $1 AND ano = $2 AND mes = $3${perfilClause}`,
                [req.usuario.id, anoInt, mesInt, ...perfilParams]
            ),
            query(
                `SELECT COALESCE(saldo_final, 0) as saldo FROM meses
                 WHERE usuario_id = $1 AND ano = $2 AND mes = $3${perfilClauseAnt}
                 ORDER BY perfil_id NULLS LAST LIMIT 1`,
                [req.usuario.id, anoAnterior, mesAnterior, ...perfilParamsAnt]
            )
        ]);

        const totalReceitas = parseFloat(receitas.rows[0].total);
        const totalDespesas = parseFloat(despesas.rows[0].total);
        const saldoAnt = parseFloat(saldoAnterior.rows[0]?.saldo || 0);
        const saldoFinal = saldoAnt + totalReceitas - totalDespesas;

        res.json({
            success: true,
            data: { saldo_anterior: saldoAnt, receitas: totalReceitas, despesas: totalDespesas, saldo_final: saldoFinal }
        });

    } catch (error) {
        console.error('Erro ao calcular saldo:', error);
        res.status(500).json({ success: false, message: 'Erro ao calcular saldo' });
    }
});

module.exports = router;
