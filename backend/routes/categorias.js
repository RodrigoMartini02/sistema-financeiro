const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// ================================================================
// FUNÇÃO AUXILIAR - OBTER PRÓXIMO NÚMERO PARA CATEGORIA
// ================================================================
async function obterProximoNumero(usuarioId) {
    const result = await query(
        'SELECT COALESCE(MAX(numero), 0) + 1 as proximo FROM categorias WHERE usuario_id = $1',
        [usuarioId]
    );
    return result.rows[0].proximo;
}

router.get('/', authMiddleware, async (req, res) => {
    try {
        const { usuario_id } = req.query;

        // ✅ MASTER pode ver categorias de qualquer usuário
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
                c.cor,
                c.icone,
                c.forma_favorita,
                c.cartao_favorito_id,
                ct.nome as cartao_favorito_nome,
                c.data_criacao,
                c.data_atualizacao,
                u.nome as usuario_nome
            FROM categorias c
            LEFT JOIN usuarios u ON c.usuario_id = u.id
            LEFT JOIN cartoes ct ON c.cartao_favorito_id = ct.id
            WHERE c.usuario_id = $1
            ORDER BY c.nome ASC
        `;

        const result = await query(queryText, [targetUserId]);

        res.json({
            success: true,
            message: 'Categorias carregadas com sucesso',
            data: result.rows
        });

    } catch (error) {
        console.error('Erro ao buscar categorias:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

router.post('/', authMiddleware, async (req, res) => {
    try {
        const { nome, cor, icone } = req.body;

        if (!nome || nome.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Nome da categoria é obrigatório'
            });
        }

        if (nome.length > 255) {
            return res.status(400).json({
                success: false,
                message: 'Nome da categoria deve ter no máximo 255 caracteres'
            });
        }

        // Verificar duplicata e obter próximo número em paralelo
        const [existente, proximoNumero] = await Promise.all([
            query(
                'SELECT id FROM categorias WHERE usuario_id = $1 AND LOWER(nome) = LOWER($2)',
                [req.usuario.id, nome.trim()]
            ),
            obterProximoNumero(req.usuario.id)
        ]);

        if (existente.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Já existe uma categoria com este nome'
            });
        }

        const queryText = `
            INSERT INTO categorias (usuario_id, nome, cor, icone, numero)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, nome, cor, icone, numero, data_criacao, data_atualizacao
        `;

        const values = [
            req.usuario.id,
            nome.trim(),
            cor || '#3498db',
            icone || null,
            proximoNumero
        ];
        
        const result = await query(queryText, values);
        
        res.status(201).json({
            success: true,
            message: 'Categoria criada com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao criar categoria:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

router.get('/:id', authMiddleware, async (req, res) => {
    try {
        const categoriaId = parseInt(req.params.id);
        
        if (isNaN(categoriaId)) {
            return res.status(400).json({
                success: false,
                message: 'ID da categoria deve ser um número válido'
            });
        }
        
        const queryText = `
            SELECT id, nome, cor, icone, forma_favorita, cartao_favorito_id, data_criacao, data_atualizacao
            FROM categorias
            WHERE id = $1 AND usuario_id = $2
        `;
        
        const result = await query(queryText, [categoriaId, req.usuario.id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Categoria não encontrada'
            });
        }
        
        res.json({
            success: true,
            message: 'Categoria encontrada',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao buscar categoria:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const categoriaId = parseInt(req.params.id);
        const { nome, cor, icone } = req.body;
        
        if (isNaN(categoriaId)) {
            return res.status(400).json({
                success: false,
                message: 'ID da categoria deve ser um número válido'
            });
        }
        
        if (!nome || nome.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Nome da categoria é obrigatório'
            });
        }
        
        if (nome.length > 255) {
            return res.status(400).json({
                success: false,
                message: 'Nome da categoria deve ter no máximo 255 caracteres'
            });
        }
        
        const [existeCategoria, nomeDuplicado] = await Promise.all([
            query('SELECT id FROM categorias WHERE id = $1 AND usuario_id = $2', [categoriaId, req.usuario.id]),
            query('SELECT id FROM categorias WHERE usuario_id = $1 AND LOWER(nome) = LOWER($2) AND id != $3', [req.usuario.id, nome.trim(), categoriaId])
        ]);

        if (existeCategoria.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Categoria não encontrada'
            });
        }

        if (nomeDuplicado.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Já existe uma categoria com este nome'
            });
        }
        
        const queryText = `
            UPDATE categorias 
            SET nome = $1, cor = $2, icone = $3, data_atualizacao = CURRENT_TIMESTAMP
            WHERE id = $4 AND usuario_id = $5
            RETURNING id, nome, cor, icone, data_criacao, data_atualizacao
        `;
        
        const values = [
            nome.trim(),
            cor || '#3498db',
            icone || null,
            categoriaId,
            req.usuario.id
        ];
        
        const result = await query(queryText, values);
        
        res.json({
            success: true,
            message: 'Categoria atualizada com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao atualizar categoria:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const categoriaId = parseInt(req.params.id);
        
        if (isNaN(categoriaId)) {
            return res.status(400).json({
                success: false,
                message: 'ID da categoria deve ser um número válido'
            });
        }
        
        const verificarExistencia = `
            SELECT id, nome FROM categorias 
            WHERE id = $1 AND usuario_id = $2
        `;
        
        const existeCategoria = await query(verificarExistencia, [categoriaId, req.usuario.id]);
        
        if (existeCategoria.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Categoria não encontrada'
            });
        }
        
        const verificarUso = `
            SELECT COUNT(*) as total FROM despesas 
            WHERE categoria_id = $1 AND usuario_id = $2
        `;
        
        const usoCategoria = await query(verificarUso, [categoriaId, req.usuario.id]);
        const totalUsos = parseInt(usoCategoria.rows[0].total);
        
        if (totalUsos > 0) {
            return res.status(400).json({
                success: false,
                message: `Não é possível excluir esta categoria pois ela está sendo usada em ${totalUsos} despesa(s). Primeiro altere ou exclua essas despesas.`
            });
        }
        
        const queryText = `
            DELETE FROM categorias 
            WHERE id = $1 AND usuario_id = $2
        `;
        
        await query(queryText, [categoriaId, req.usuario.id]);
        
        res.json({
            success: true,
            message: `Categoria "${existeCategoria.rows[0].nome}" excluída com sucesso`
        });
        
    } catch (error) {
        console.error('Erro ao excluir categoria:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

router.get('/estatisticas/uso', authMiddleware, async (req, res) => {
    try {
        const queryText = `
            SELECT 
                c.id,
                c.nome,
                c.cor,
                COUNT(d.id) as total_uso,
                COALESCE(SUM(d.valor), 0) as valor_total
            FROM categorias c
            LEFT JOIN despesas d ON c.id = d.categoria_id
            WHERE c.usuario_id = $1
            GROUP BY c.id, c.nome, c.cor
            ORDER BY total_uso DESC, c.nome ASC
        `;
        
        const result = await query(queryText, [req.usuario.id]);
        
        res.json({
            success: true,
            message: 'Estatísticas de uso carregadas',
            data: result.rows
        });
        
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// ================================================================
// CRIAR CATEGORIAS PADRÃO
// ================================================================
router.post('/padrao', authMiddleware, async (req, res) => {
    try {
        const existentes = await query(
            'SELECT COUNT(*) as total FROM categorias WHERE usuario_id = $1',
            [req.usuario.id]
        );
        const totalAntes = parseInt(existentes.rows[0].total);

        await query('SELECT criar_categorias_padrao($1)', [req.usuario.id]);

        const result = await query(
            'SELECT * FROM categorias WHERE usuario_id = $1 ORDER BY id ASC',
            [req.usuario.id]
        );

        res.json({
            success: true,
            message: `${result.rows.length} categorias disponíveis (${result.rows.length - totalAntes} novas criadas)`,
            data: result.rows,
            resumo: {
                total: result.rows.length,
                novas: result.rows.length - totalAntes,
                ids: result.rows.map(r => r.id)
            }
        });

    } catch (error) {
        console.error('❌ Erro ao criar categorias padrão:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao criar categorias padrão',
            error: error.message
        });
    }
});

// ================================================================
// FAVORITO DE FORMA DE PAGAMENTO POR CATEGORIA
// ================================================================
router.put('/:id/favorito', authMiddleware, async (req, res) => {
    try {
        const categoriaId = parseInt(req.params.id);
        const { forma_favorita, cartao_favorito_id } = req.body;

        if (isNaN(categoriaId)) {
            return res.status(400).json({ success: false, message: 'ID inválido' });
        }

        const existeCategoria = await query(
            'SELECT id FROM categorias WHERE id = $1 AND usuario_id = $2',
            [categoriaId, req.usuario.id]
        );

        if (existeCategoria.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Categoria não encontrada' });
        }

        const result = await query(
            `UPDATE categorias
             SET forma_favorita = $1, cartao_favorito_id = $2, data_atualizacao = CURRENT_TIMESTAMP
             WHERE id = $3 AND usuario_id = $4
             RETURNING id, nome, forma_favorita, cartao_favorito_id`,
            [forma_favorita || null, cartao_favorito_id || null, categoriaId, req.usuario.id]
        );

        res.json({ success: true, message: 'Favorito salvo', data: result.rows[0] });

    } catch (error) {
        console.error('Erro ao salvar favorito:', error);
        res.status(500).json({ success: false, message: 'Erro interno do servidor', error: error.message });
    }
});

module.exports = router;