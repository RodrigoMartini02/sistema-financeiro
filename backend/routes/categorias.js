const express = require('express');
const router = express.Router();
const { query } = require('../config/database');

function verificarAutenticacao(req, res, next) {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Token de autenticação necessário'
        });
    }
    
    const token = authHeader.substring(7);
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Token inválido'
        });
    }
    
    req.usuario_id = 1;
    next();
}

router.use(verificarAutenticacao);

router.get('/', async (req, res) => {
    try {
        const queryText = `
            SELECT id, nome, cor, icone, data_criacao, data_atualizacao
            FROM categorias 
            WHERE usuario_id = $1 
            ORDER BY nome ASC
        `;
        
        const result = await query(queryText, [req.usuario_id]);
        
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

router.post('/', async (req, res) => {
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
        
        const verificarExistente = `
            SELECT id FROM categorias 
            WHERE usuario_id = $1 AND LOWER(nome) = LOWER($2)
        `;
        
        const existente = await query(verificarExistente, [req.usuario_id, nome.trim()]);
        
        if (existente.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Já existe uma categoria com este nome'
            });
        }
        
        const queryText = `
            INSERT INTO categorias (usuario_id, nome, cor, icone)
            VALUES ($1, $2, $3, $4)
            RETURNING id, nome, cor, icone, data_criacao, data_atualizacao
        `;
        
        const values = [
            req.usuario_id,
            nome.trim(),
            cor || '#3498db',
            icone || null
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

router.get('/:id', async (req, res) => {
    try {
        const categoriaId = parseInt(req.params.id);
        
        if (isNaN(categoriaId)) {
            return res.status(400).json({
                success: false,
                message: 'ID da categoria deve ser um número válido'
            });
        }
        
        const queryText = `
            SELECT id, nome, cor, icone, data_criacao, data_atualizacao
            FROM categorias 
            WHERE id = $1 AND usuario_id = $2
        `;
        
        const result = await query(queryText, [categoriaId, req.usuario_id]);
        
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

router.put('/:id', async (req, res) => {
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
        
        const verificarExistencia = `
            SELECT id FROM categorias 
            WHERE id = $1 AND usuario_id = $2
        `;
        
        const existeCategoria = await query(verificarExistencia, [categoriaId, req.usuario_id]);
        
        if (existeCategoria.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Categoria não encontrada'
            });
        }
        
        const verificarNomeDuplicado = `
            SELECT id FROM categorias 
            WHERE usuario_id = $1 AND LOWER(nome) = LOWER($2) AND id != $3
        `;
        
        const nomeDuplicado = await query(verificarNomeDuplicado, [req.usuario_id, nome.trim(), categoriaId]);
        
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
            req.usuario_id
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

router.delete('/:id', async (req, res) => {
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
        
        const existeCategoria = await query(verificarExistencia, [categoriaId, req.usuario_id]);
        
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
        
        const usoCategoria = await query(verificarUso, [categoriaId, req.usuario_id]);
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
        
        await query(queryText, [categoriaId, req.usuario_id]);
        
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

router.get('/estatisticas/uso', async (req, res) => {
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
        
        const result = await query(queryText, [req.usuario_id]);
        
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

module.exports = router;