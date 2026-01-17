// ================================================================
// ROTAS DE USUÁRIOS - EXPANDIDO COM FUNCIONALIDADES ADMINISTRATIVAS
// ================================================================
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { authMiddleware, isAdmin } = require('../middleware/auth');

// ================================================================
// MIDDLEWARE DE PERMISSÕES
// ================================================================
const isMaster = (req, res, next) => {
    if (req.usuario.tipo !== 'master') {
        return res.status(403).json({
            success: false,
            message: 'Acesso negado. Apenas usuários Master podem realizar esta ação.'
        });
    }
    next();
};

const isAdminOrMaster = (req, res, next) => {
    if (req.usuario.tipo !== 'admin' && req.usuario.tipo !== 'master') {
        return res.status(403).json({
            success: false,
            message: 'Acesso negado. Apenas usuários Admin ou Master podem realizar esta ação.'
        });
    }
    next();
};

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

// ================================================================
// GET /api/usuarios - Listar todos os usuários (Admin/Master)
// ================================================================
router.get('/', authMiddleware, isAdminOrMaster, async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', tipo = '', status = '' } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        
        let whereClause = 'WHERE 1=1';
        const params = [];
        let paramCount = 0;
        
        // Filtro de busca
        if (search && search.trim() !== '') {
            paramCount++;
            whereClause += ` AND (LOWER(nome) LIKE LOWER($${paramCount}) OR LOWER(email) LIKE LOWER($${paramCount}) OR documento LIKE $${paramCount})`;
            params.push(`%${search.trim()}%`);
        }
        
        // Filtro de tipo
        if (tipo && tipo !== 'todos') {
            paramCount++;
            whereClause += ` AND tipo = $${paramCount}`;
            params.push(tipo);
        }
        
        // Filtro de status
        if (status && status !== 'todos') {
            paramCount++;
            whereClause += ` AND status = $${paramCount}`;
            params.push(status);
        }
        
        // Permissão: Admin só vê usuários padrão, Master vê todos
        if (req.usuario.tipo === 'admin') {
            paramCount++;
            whereClause += ` AND tipo = $${paramCount}`;
            params.push('padrao');
        }
        
        // Contar total
        const countQuery = `SELECT COUNT(*) as total FROM usuarios ${whereClause}`;
        const countResult = await query(countQuery, params);
        const total = parseInt(countResult.rows[0].total);
        
        // Buscar usuários
        params.push(parseInt(limit), offset);
        const usersQuery = `
            SELECT id, nome, email, documento, tipo, status, data_cadastro, data_atualizacao
            FROM usuarios 
            ${whereClause}
            ORDER BY nome ASC
            LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
        `;
        
        const usersResult = await query(usersQuery, params);
        
        res.json({
            success: true,
            message: 'Usuários carregados com sucesso',
            data: usersResult.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
        
    } catch (error) {
        console.error('Erro ao buscar usuários:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// ================================================================
// POST /api/usuarios - Criar novo usuário (Apenas Master)
// ================================================================
router.post('/', authMiddleware, isMaster, async (req, res) => {
    try {
        const { nome, email, documento, senha, tipo = 'admin', status = 'ativo' } = req.body;
        
        // Validações
        if (!nome || !email || !documento || !senha) {
            return res.status(400).json({
                success: false,
                message: 'Nome, email, documento e senha são obrigatórios'
            });
        }
        
        if (senha.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'A senha deve ter pelo menos 6 caracteres'
            });
        }
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Email inválido'
            });
        }
        
        // Verificar se email já existe
        const emailExists = await query('SELECT id FROM usuarios WHERE email = $1', [email]);
        if (emailExists.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Este email já está cadastrado'
            });
        }
        
        // Verificar se documento já existe
        const documentoLimpo = documento.replace(/[^\d]+/g, '');
        const docExists = await query('SELECT id FROM usuarios WHERE REPLACE(documento, \'.|-|/\', \'\') = $1', [documentoLimpo]);
        if (docExists.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Este documento já está cadastrado'
            });
        }

        // Hash da senha
        const senhaHash = await bcrypt.hash(senha, 10);

        // Criar usuário
        const result = await query(
            `INSERT INTO usuarios (nome, email, documento, senha, tipo, status)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, nome, email, documento, tipo, status, data_cadastro`,
            [nome, email, documento, senhaHash, tipo, status]
        );
        
        res.status(201).json({
            success: true,
            message: 'Usuário criado com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao criar usuário:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// ================================================================
// GET /api/usuarios/:id - Buscar usuário específico
// ================================================================
router.get('/:id', authMiddleware, isAdminOrMaster, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        
        if (isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'ID do usuário deve ser um número válido'
            });
        }
        
        const result = await query(
            'SELECT id, nome, email, documento, tipo, status, data_cadastro, data_atualizacao FROM usuarios WHERE id = $1',
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }
        
        const usuario = result.rows[0];
        
        // Admin não pode ver dados de outros admins ou masters
        if (req.usuario.tipo === 'admin' && usuario.tipo !== 'padrao') {
            return res.status(403).json({
                success: false,
                message: 'Acesso negado'
            });
        }
        
        res.json({
            success: true,
            data: usuario
        });
        
    } catch (error) {
        console.error('Erro ao buscar usuário:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// ================================================================
// PUT /api/usuarios/:id - Atualizar usuário específico
// ================================================================
router.put('/:id', authMiddleware, isAdminOrMaster, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { nome, email, senha, tipo, status } = req.body;
        
        if (isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'ID do usuário deve ser um número válido'
            });
        }
        
        // Verificar se usuário existe
        const existingUser = await query(
            'SELECT id, tipo FROM usuarios WHERE id = $1',
            [userId]
        );
        
        if (existingUser.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }
        
        const targetUser = existingUser.rows[0];
        
        // Verificações de permissão
        if (req.usuario.tipo === 'admin' && targetUser.tipo !== 'padrao') {
            return res.status(403).json({
                success: false,
                message: 'Admin só pode editar usuários padrão'
            });
        }
        
        // Apenas Master pode alterar tipo de usuário
        if (tipo && req.usuario.tipo !== 'master') {
            return res.status(403).json({
                success: false,
                message: 'Apenas Master pode alterar tipo de usuário'
            });
        }
        
        // Validações
        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Email inválido'
                });
            }
            
            const emailExists = await query('SELECT id FROM usuarios WHERE email = $1 AND id != $2', [email, userId]);
            if (emailExists.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Este email já está sendo usado por outro usuário'
                });
            }
        }
        
        if (senha && senha.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'A senha deve ter pelo menos 6 caracteres'
            });
        }
        
        // Construir query de update dinâmica
        const updates = [];
        const params = [];
        let paramCount = 0;
        
        if (nome) {
            paramCount++;
            updates.push(`nome = $${paramCount}`);
            params.push(nome);
        }
        
        if (email) {
            paramCount++;
            updates.push(`email = $${paramCount}`);
            params.push(email);
        }

        if (senha) {
            // Hash da senha antes de salvar
            const senhaHash = await bcrypt.hash(senha, 10);
            paramCount++;
            updates.push(`senha = $${paramCount}`);
            params.push(senhaHash);
        }

        if (tipo && req.usuario.tipo === 'master') {
            paramCount++;
            updates.push(`tipo = $${paramCount}`);
            params.push(tipo);
        }
        
        if (status) {
            paramCount++;
            updates.push(`status = $${paramCount}`);
            params.push(status);
        }
        
        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Nenhum campo para atualizar'
            });
        }
        
        paramCount++;
        updates.push(`data_atualizacao = CURRENT_TIMESTAMP`);
        params.push(userId);
        
        const updateQuery = `
            UPDATE usuarios 
            SET ${updates.join(', ')}
            WHERE id = $${paramCount}
            RETURNING id, nome, email, documento, tipo, status, data_atualizacao
        `;
        
        const result = await query(updateQuery, params);
        
        res.json({
            success: true,
            message: 'Usuário atualizado com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao atualizar usuário:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// ================================================================
// PUT /api/usuarios/:id/alterar-senha - Alterar senha do usuário
// ================================================================
router.put('/:id/alterar-senha', authMiddleware, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { senhaAtual, senhaNova } = req.body;

        // Validações
        if (isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'ID do usuário deve ser um número válido'
            });
        }

        // Usuário só pode alterar sua própria senha
        if (userId !== req.usuario.id) {
            return res.status(403).json({
                success: false,
                message: 'Você só pode alterar sua própria senha'
            });
        }

        if (!senhaAtual || !senhaNova) {
            return res.status(400).json({
                success: false,
                message: 'Senha atual e senha nova são obrigatórias'
            });
        }

        if (senhaNova.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'A senha nova deve ter pelo menos 6 caracteres'
            });
        }

        // Buscar usuário e verificar senha atual
        const userResult = await query(
            'SELECT id, senha FROM usuarios WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        const usuario = userResult.rows[0];

        // Verificar se a senha atual está correta
        const senhaValida = await bcrypt.compare(senhaAtual, usuario.senha);

        if (!senhaValida) {
            return res.status(401).json({
                success: false,
                message: 'Senha atual incorreta'
            });
        }

        // Hash da senha nova
        const senhaNovaHash = await bcrypt.hash(senhaNova, 10);

        // Atualizar senha
        await query(
            `UPDATE usuarios
             SET senha = $1, data_atualizacao = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [senhaNovaHash, userId]
        );

        res.json({
            success: true,
            message: 'Senha alterada com sucesso'
        });

    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// ================================================================
// DELETE /api/usuarios/:id - Excluir usuário (Apenas Master)
// ================================================================
router.delete('/:id', authMiddleware, isMaster, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        
        if (isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'ID do usuário deve ser um número válido'
            });
        }
        
        // Não pode excluir a si mesmo
        if (userId === req.usuario.id) {
            return res.status(400).json({
                success: false,
                message: 'Você não pode excluir sua própria conta'
            });
        }
        
        // Verificar se usuário existe
        const existingUser = await query(
            'SELECT id, nome, tipo FROM usuarios WHERE id = $1',
            [userId]
        );
        
        if (existingUser.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }
        
        // Verificar se usuário tem dados financeiros
        const hasData = await query(
            'SELECT COUNT(*) as total FROM (SELECT id FROM receitas WHERE usuario_id = $1 UNION SELECT id FROM despesas WHERE usuario_id = $1) as dados',
            [userId]
        );
        
        const totalDados = parseInt(hasData.rows[0].total);
        
        if (totalDados > 0) {
            return res.status(400).json({
                success: false,
                message: `Não é possível excluir este usuário pois ele possui ${totalDados} registros financeiros. Desative o usuário em vez de excluí-lo.`
            });
        }
        
        await query('DELETE FROM usuarios WHERE id = $1', [userId]);
        
        res.json({
            success: true,
            message: `Usuário "${existingUser.rows[0].nome}" excluído com sucesso`
        });
        
    } catch (error) {
        console.error('Erro ao excluir usuário:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// ================================================================
// PUT /api/usuarios/:id/status - Alterar status do usuário (Admin/Master)
// ================================================================
router.put('/:id/status', authMiddleware, isAdminOrMaster, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { status } = req.body;
        
        if (isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'ID do usuário deve ser um número válido'
            });
        }
        
        if (!['ativo', 'inativo', 'bloqueado'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status deve ser: ativo, inativo ou bloqueado'
            });
        }
        
        // Não pode alterar próprio status
        if (userId === req.usuario.id) {
            return res.status(400).json({
                success: false,
                message: 'Você não pode alterar seu próprio status'
            });
        }
        
        // Verificar se usuário existe
        const existingUser = await query(
            'SELECT id, nome, tipo, status FROM usuarios WHERE id = $1',
            [userId]
        );
        
        if (existingUser.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }
        
        const targetUser = existingUser.rows[0];
        
        // Admin não pode alterar status de outros admins ou masters
        if (req.usuario.tipo === 'admin' && targetUser.tipo !== 'padrao') {
            return res.status(403).json({
                success: false,
                message: 'Admin só pode alterar status de usuários padrão'
            });
        }
        
        const result = await query(
            `UPDATE usuarios 
             SET status = $1, data_atualizacao = CURRENT_TIMESTAMP 
             WHERE id = $2 
             RETURNING id, nome, status`,
            [status, userId]
        );
        
        const statusTexto = status === 'ativo' ? 'ativado' : status === 'inativo' ? 'inativado' : 'bloqueado';
        
        res.json({
            success: true,
            message: `Usuário "${result.rows[0].nome}" ${statusTexto} com sucesso`,
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao alterar status:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// ================================================================
// GET /api/usuarios/stats/geral - Estatísticas gerais (Master)
// ================================================================
router.get('/stats/geral', authMiddleware, isMaster, async (req, res) => {
    try {
        const stats = await query(`
            SELECT
                COUNT(*) as total_usuarios,
                COUNT(CASE WHEN status = 'ativo' THEN 1 END) as usuarios_ativos,
                COUNT(CASE WHEN status = 'inativo' THEN 1 END) as usuarios_inativos,
                COUNT(CASE WHEN status = 'bloqueado' THEN 1 END) as usuarios_bloqueados,
                COUNT(CASE WHEN tipo = 'padrao' THEN 1 END) as usuarios_padrao,
                COUNT(CASE WHEN tipo = 'admin' THEN 1 END) as usuarios_admin,
                COUNT(CASE WHEN tipo = 'master' THEN 1 END) as usuarios_master
            FROM usuarios
        `);

        res.json({
            success: true,
            data: stats.rows[0]
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
// FUNÇÃO AUXILIAR: Criar estrutura inicial de dados financeiros
// ================================================================
function criarEstruturaInicial() {
    const anoAtual = new Date().getFullYear();
    const estrutura = {};

    estrutura[anoAtual] = { meses: [] };
    for (let i = 0; i < 12; i++) {
        estrutura[anoAtual].meses[i] = {
            receitas: [],
            despesas: [],
            fechado: false,
            saldoAnterior: 0,
            saldoFinal: 0
        };
    }

    return estrutura;
}

// ================================================================
// GET /api/usuarios/:id/dados-financeiros
// Buscar dados financeiros de um usuário
// ================================================================
router.get('/:id/dados-financeiros', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar se o usuário está tentando acessar seus próprios dados
        if (req.usuario.id !== parseInt(id)) {
            return res.status(403).json({
                success: false,
                message: 'Acesso negado. Você só pode acessar seus próprios dados.'
            });
        }

        // Buscar usuário no banco de dados
        const result = await query(
            'SELECT dados_financeiros FROM usuarios WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        // Se não houver dados financeiros, retornar estrutura inicial
        const dadosFinanceiros = result.rows[0].dados_financeiros || criarEstruturaInicial();

        res.json({
            success: true,
            dadosFinanceiros
        });

    } catch (error) {
        console.error('Erro ao buscar dados financeiros:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar dados financeiros',
            error: error.message
        });
    }
});

// ================================================================
// PUT /api/usuarios/:id/dados-financeiros
// Salvar/atualizar dados financeiros de um usuário
// ================================================================
router.put('/:id/dados-financeiros', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { dadosFinanceiros } = req.body;

        // Verificar se o usuário está tentando atualizar seus próprios dados
        if (req.usuario.id !== parseInt(id)) {
            return res.status(403).json({
                success: false,
                message: 'Acesso negado. Você só pode atualizar seus próprios dados.'
            });
        }

        // Validar dados recebidos
        if (!dadosFinanceiros || typeof dadosFinanceiros !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'Dados financeiros inválidos'
            });
        }

        // Atualizar no banco de dados
        const result = await query(
            'UPDATE usuarios SET dados_financeiros = $1, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id',
            [JSON.stringify(dadosFinanceiros), id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Dados financeiros salvos com sucesso',
            usuarioId: id
        });

    } catch (error) {
        console.error('Erro ao salvar dados financeiros:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao salvar dados financeiros',
            error: error.message
        });
    }
});

// ================================================================
// GET /api/usuarios/:id/categorias
// Buscar categorias de um usuário
// ================================================================
router.get('/:id/categorias', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar se o usuário está tentando acessar seus próprios dados
        if (req.usuario.id !== parseInt(id)) {
            return res.status(403).json({
                success: false,
                message: 'Acesso negado'
            });
        }

        const result = await query(
            'SELECT categorias FROM usuarios WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        // Estrutura padrão de categorias
        const categoriasPadrao = {
            despesas: ["Alimentação", "Combustível", "Moradia"]
        };

        const categorias = result.rows[0].categorias || categoriasPadrao;

        res.json({
            success: true,
            categorias
        });

    } catch (error) {
        console.error('Erro ao buscar categorias:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar categorias',
            error: error.message
        });
    }
});

// ================================================================
// PUT /api/usuarios/:id/categorias
// Salvar/atualizar categorias de um usuário
// ================================================================
router.put('/:id/categorias', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { categorias } = req.body;

        if (req.usuario.id !== parseInt(id)) {
            return res.status(403).json({
                success: false,
                message: 'Acesso negado'
            });
        }

        if (!categorias || typeof categorias !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'Categorias inválidas'
            });
        }

        const result = await query(
            'UPDATE usuarios SET categorias = $1, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id',
            [JSON.stringify(categorias), id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Categorias salvas com sucesso'
        });

    } catch (error) {
        console.error('Erro ao salvar categorias:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao salvar categorias',
            error: error.message
        });
    }
});

// ================================================================
// GET /api/usuarios/:id/cartoes
// Buscar cartões de um usuário
// ================================================================
router.get('/:id/cartoes', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        if (req.usuario.id !== parseInt(id)) {
            return res.status(403).json({
                success: false,
                message: 'Acesso negado'
            });
        }

        // 1. Primeiro tentar buscar da TABELA cartoes
        const resultTabela = await query(
            `SELECT id, nome as banco, limite, dia_fechamento, dia_vencimento, cor, ativo, numero_cartao
             FROM cartoes
             WHERE usuario_id = $1
             ORDER BY numero_cartao ASC NULLS LAST, id ASC`,
            [id]
        );

        // Se encontrou cartões na tabela, retornar eles
        if (resultTabela.rows.length > 0) {
            const cartoes = resultTabela.rows.map(cartao => ({
                id: cartao.id,
                banco: cartao.banco,
                nome: cartao.banco,
                limite: parseFloat(cartao.limite) || 0,
                dia_fechamento: cartao.dia_fechamento,
                dia_vencimento: cartao.dia_vencimento,
                cor: cartao.cor || '#3498db',
                ativo: cartao.ativo !== false,
                numero_cartao: cartao.numero_cartao
            }));

            return res.json({
                success: true,
                cartoes
            });
        }

        // 2. Fallback: buscar do campo JSON usuarios.cartoes (formato antigo)
        const resultJson = await query(
            'SELECT cartoes FROM usuarios WHERE id = $1',
            [id]
        );

        if (resultJson.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        const cartoesJson = resultJson.rows[0].cartoes;

        // Se não tem cartões no JSON, retornar array vazio
        if (!cartoesJson) {
            return res.json({
                success: true,
                cartoes: []
            });
        }

        // 3. Migrar cartões do JSON para a tabela automaticamente
        let cartoesParaMigrar = [];

        if (Array.isArray(cartoesJson)) {
            // Formato array
            cartoesParaMigrar = cartoesJson.filter(c => c && (c.banco || c.nome) && (c.banco || c.nome).trim() !== '');
        } else if (typeof cartoesJson === 'object') {
            // Formato antigo {cartao1, cartao2, cartao3}
            let posicao = 1;
            ['cartao1', 'cartao2', 'cartao3'].forEach(key => {
                if (cartoesJson[key] && cartoesJson[key].nome && cartoesJson[key].nome.trim() !== '') {
                    cartoesParaMigrar.push({
                        banco: cartoesJson[key].nome,
                        nome: cartoesJson[key].nome,
                        validade: cartoesJson[key].validade || '',
                        limite: parseFloat(cartoesJson[key].limite) || 0,
                        ativo: cartoesJson[key].ativo !== false,
                        numero_cartao: posicao
                    });
                    posicao++;
                }
            });
        }

        // Se tem cartões para migrar, inserir na tabela
        const cartoesMigrados = [];
        for (let i = 0; i < cartoesParaMigrar.length; i++) {
            const cartao = cartoesParaMigrar[i];
            try {
                const insertResult = await query(
                    `INSERT INTO cartoes (usuario_id, nome, limite, dia_fechamento, dia_vencimento, cor, ativo, numero_cartao)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                     RETURNING id, nome as banco, limite, dia_fechamento, dia_vencimento, cor, ativo, numero_cartao`,
                    [
                        id,
                        (cartao.banco || cartao.nome || '').trim(),
                        parseFloat(cartao.limite) || 0,
                        cartao.dia_fechamento || 1,
                        cartao.dia_vencimento || 10,
                        cartao.cor || '#3498db',
                        cartao.ativo !== false,
                        cartao.numero_cartao || (i + 1)
                    ]
                );

                if (insertResult.rows.length > 0) {
                    const c = insertResult.rows[0];
                    cartoesMigrados.push({
                        id: c.id,
                        banco: c.banco,
                        nome: c.banco,
                        limite: parseFloat(c.limite) || 0,
                        dia_fechamento: c.dia_fechamento,
                        dia_vencimento: c.dia_vencimento,
                        cor: c.cor || '#3498db',
                        ativo: c.ativo !== false,
                        numero_cartao: c.numero_cartao
                    });
                }
            } catch (insertError) {
                console.error('Erro ao migrar cartão:', insertError);
            }
        }

        console.log(`✅ Migrados ${cartoesMigrados.length} cartões do JSON para tabela (usuário ${id})`);

        res.json({
            success: true,
            cartoes: cartoesMigrados
        });

    } catch (error) {
        console.error('Erro ao buscar cartões:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar cartões',
            error: error.message
        });
    }
});

// ================================================================
// PUT /api/usuarios/:id/cartoes
// Salvar/atualizar cartões de um usuário
// ================================================================
router.put('/:id/cartoes', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { cartoes } = req.body;

        if (req.usuario.id !== parseInt(id)) {
            return res.status(403).json({
                success: false,
                message: 'Acesso negado'
            });
        }

        if (!cartoes || typeof cartoes !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'Cartões inválidos'
            });
        }

        const result = await query(
            'UPDATE usuarios SET cartoes = $1, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id',
            [JSON.stringify(cartoes), id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        res.json({
            success: true,
            message: 'Cartões salvos com sucesso'
        });

    } catch (error) {
        console.error('Erro ao salvar cartões:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao salvar cartões',
            error: error.message
        });
    }
});


router.delete('/:id/limpar-dados', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // Segurança: verifica se o ID da URL é o mesmo do token
        if (req.usuario.id !== parseInt(id)) {
            return res.status(403).json({ success: false, message: 'Acesso negado' });
        }

        // Executa a limpeza em todas as tabelas relacionadas
        await query('DELETE FROM receitas WHERE usuario_id = $1', [id]);
        await query('DELETE FROM despesas WHERE usuario_id = $1', [id]);
        await query('DELETE FROM reservas WHERE usuario_id = $1', [id]);
        await query('DELETE FROM meses WHERE usuario_id = $1', [id]);
        await query('DELETE FROM categorias WHERE usuario_id = $1', [id]);
        await query('DELETE FROM cartoes WHERE usuario_id = $1', [id]);

        // Limpa os campos JSON e notificações na tabela usuarios
        await query(`
            UPDATE usuarios
            SET dados_financeiros = NULL,
                categorias = NULL,
                cartoes = NULL,
                notificacoes = NULL,
                data_atualizacao = CURRENT_TIMESTAMP
            WHERE id = $1`,
            [id]
        );

        // Opcional: Recria as categorias padrão (Alimentação, Moradia, etc.) para o usuário não ficar sem nada
        await query('SELECT criar_categorias_padrao($1)', [id]);

        res.json({ 
            success: true, 
            message: 'Sistema resetado: Dados, Categorias, Cartões e Notificações apagados.' 
        });

    } catch (error) {
        console.error('Erro na limpeza:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao limpar dados' });
    }
});



module.exports = router;
