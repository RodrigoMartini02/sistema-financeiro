// ================================================================
// ROTAS DE USUÃRIOS - EXPANDIDO COM FUNCIONALIDADES ADMINISTRATIVAS
// ================================================================
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

// ================================================================
// MIDDLEWARE DE PERMISSÃ•ES
// ================================================================
const isMaster = (req, res, next) => {
    if (req.usuario.tipo !== 'master') {
        return res.status(403).json({
            success: false,
            message: 'Acesso negado. Apenas usuÃ¡rios Master podem realizar esta aÃ§Ã£o.'
        });
    }
    next();
};

const isAdminOrMaster = (req, res, next) => {
    if (req.usuario.tipo !== 'admin' && req.usuario.tipo !== 'master') {
        return res.status(403).json({
            success: false,
            message: 'Acesso negado. Apenas usuÃ¡rios Admin ou Master podem realizar esta aÃ§Ã£o.'
        });
    }
    next();
};

// ================================================================
// GET /api/usuarios/current - Dados do usuÃ¡rio logado
// ================================================================
router.get('/current', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            'SELECT id, nome, email, documento, tipo, status, foto, pais, estado, cidade, latitude, longitude, data_cadastro FROM usuarios WHERE id = $1',
            [req.usuario.id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'UsuÃ¡rio nÃ£o encontrado'
            });
        }
        
        res.json({
            success: true,
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao buscar usuÃ¡rio:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar dados do usuÃ¡rio'
        });
    }
});

// ================================================================
// PUT /api/usuarios/current - Atualizar dados do usuÃ¡rio logado
// ================================================================
router.put('/current', authMiddleware, async (req, res) => {
    try {
        const { nome, email, pais, estado, cidade, dados_financeiros_merge } = req.body;

        // Se vier dados_financeiros_merge, fazer merge no JSONB existente
        if (dados_financeiros_merge) {
            await query(
                `UPDATE usuarios
                 SET dados_financeiros = COALESCE(dados_financeiros, '{}'::jsonb) || $1::jsonb
                 WHERE id = $2`,
                [JSON.stringify(dados_financeiros_merge), req.usuario.id]
            );

            // Se sÃ³ veio o merge, retornar sucesso sem alterar outros campos
            if (!nome && !email) {
                return res.json({
                    success: true,
                    message: 'Dados atualizados com sucesso'
                });
            }
        }

        const result = await query(
            `UPDATE usuarios
             SET nome = $1, email = $2, pais = $3, estado = $4, cidade = $5, data_atualizacao = CURRENT_TIMESTAMP
             WHERE id = $6
             RETURNING id, nome, email, documento, tipo, status, pais, estado, cidade`,
            [nome, email, pais || null, estado || null, cidade || null, req.usuario.id]
        );

        res.json({
            success: true,
            message: 'Dados atualizados com sucesso',
            data: result.rows[0]
        });

    } catch (error) {
        console.error('Erro ao atualizar usuÃ¡rio:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar dados'
        });
    }
});

// ================================================================
// PUT /api/usuarios/current/foto - Upload/remover foto de perfil
// ================================================================
router.put('/current/foto', authMiddleware, async (req, res) => {
    try {
        const { foto } = req.body;

        await query(
            'UPDATE usuarios SET foto = $1, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $2',
            [foto || null, req.usuario.id]
        );

        res.json({
            success: true,
            message: foto ? 'Foto atualizada com sucesso' : 'Foto removida com sucesso'
        });

    } catch (error) {
        console.error('Erro ao atualizar foto:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao atualizar foto'
        });
    }
});

// ================================================================
// GET /api/usuarios - Listar todos os usuÃ¡rios (Admin/Master)
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
        
        // PermissÃ£o: Admin sÃ³ vÃª usuÃ¡rios padrÃ£o, Master vÃª todos
        if (req.usuario.tipo === 'admin') {
            paramCount++;
            whereClause += ` AND tipo = $${paramCount}`;
            params.push('padrao');
        }
        
        // Contar total
        const countQuery = `SELECT COUNT(*) as total FROM usuarios ${whereClause}`;
        const countResult = await query(countQuery, params);
        const total = parseInt(countResult.rows[0].total);
        
        // Buscar usuÃ¡rios
        params.push(parseInt(limit), offset);
        const usersQuery = `
            SELECT id, nome, email, documento, tipo, status, pais, estado, cidade, latitude, longitude, data_cadastro, data_atualizacao
            FROM usuarios
            ${whereClause}
            ORDER BY nome ASC
            LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
        `;
        
        const usersResult = await query(usersQuery, params);
        
        res.json({
            success: true,
            message: 'UsuÃ¡rios carregados com sucesso',
            data: usersResult.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
        
    } catch (error) {
        console.error('Erro ao buscar usuÃ¡rios:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// ================================================================
// POST /api/usuarios - Criar novo usuÃ¡rio (Apenas Master)
// ================================================================
router.post('/', authMiddleware, isMaster, async (req, res) => {
    try {
        const { nome, email, documento, senha, tipo = 'admin', status = 'ativo', pais, estado, cidade } = req.body;
        
        // ValidaÃ§Ãµes
        if (!nome || !email || !documento || !senha) {
            return res.status(400).json({
                success: false,
                message: 'Nome, email, documento e senha sÃ£o obrigatÃ³rios'
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
                message: 'Email invÃ¡lido'
            });
        }
        
        // Verificar se email jÃ¡ existe
        const emailExists = await query('SELECT id FROM usuarios WHERE email = $1', [email]);
        if (emailExists.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Este email jÃ¡ estÃ¡ cadastrado'
            });
        }
        
        // Verificar se documento jÃ¡ existe
        const documentoLimpo = documento.replace(/[^\d]+/g, '');
        const docExists = await query('SELECT id FROM usuarios WHERE REPLACE(documento, \'.|-|/\', \'\') = $1', [documentoLimpo]);
        if (docExists.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Este documento jÃ¡ estÃ¡ cadastrado'
            });
        }

        // Hash da senha
        const senhaHash = await bcrypt.hash(senha, 10);

        // Criar usuÃ¡rio
        const result = await query(
            `INSERT INTO usuarios (nome, email, documento, senha, tipo, status, pais, estado, cidade)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id, nome, email, documento, tipo, status, pais, estado, cidade, data_cadastro`,
            [nome, email, documento, senhaHash, tipo, status, pais || null, estado || null, cidade || null]
        );
        
        res.status(201).json({
            success: true,
            message: 'UsuÃ¡rio criado com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao criar usuÃ¡rio:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// ================================================================
// GET /api/usuarios/me â€” Dados do prÃ³prio usuÃ¡rio logado
// ================================================================
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            'SELECT id, nome, email, documento, pais, estado, cidade, latitude, longitude, tipo, status, plano_status, plano_tipo, plano_expiracao, data_cadastro FROM usuarios WHERE id = $1',
            [req.usuario.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'UsuÃ¡rio nÃ£o encontrado' });
        }
        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Erro ao buscar perfil:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar perfil' });
    }
});

// ================================================================
// PUT /api/usuarios/me â€” Atualizar dados do prÃ³prio usuÃ¡rio
// ================================================================
router.put('/me', authMiddleware, async (req, res) => {
    try {
        const { nome, email, pais, estado, cidade, senha_atual, nova_senha, latitude, longitude } = req.body;

        if (!nome || nome.trim() === '') {
            return res.status(400).json({ success: false, message: 'Nome Ã© obrigatÃ³rio' });
        }

        const current = await query('SELECT senha, email FROM usuarios WHERE id = $1', [req.usuario.id]);
        if (current.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'UsuÃ¡rio nÃ£o encontrado' });
        }

        // Se quer trocar senha, valida a atual
        let senhaHash = null;
        if (nova_senha) {
            if (!senha_atual) {
                return res.status(400).json({ success: false, message: 'Informe a senha atual para alterar a senha' });
            }
            const senhaValida = await bcrypt.compare(senha_atual, current.rows[0].senha);
            if (!senhaValida) {
                return res.status(400).json({ success: false, message: 'Senha atual incorreta' });
            }
            if (nova_senha.length < 8) {
                return res.status(400).json({ success: false, message: 'Nova senha deve ter pelo menos 8 caracteres' });
            }
            senhaHash = await bcrypt.hash(nova_senha, 10);
        }

        // Verificar email duplicado (se mudou)
        if (email && email.toLowerCase() !== current.rows[0].email) {
            const emailExiste = await query('SELECT id FROM usuarios WHERE email = $1 AND id != $2', [email.toLowerCase(), req.usuario.id]);
            if (emailExiste.rows.length > 0) {
                return res.status(400).json({ success: false, message: 'Este email jÃ¡ estÃ¡ em uso' });
            }
        }

        const lat = latitude != null ? parseFloat(latitude) : null;
        const lng = longitude != null ? parseFloat(longitude) : null;

        const updateQuery = senhaHash
            ? `UPDATE usuarios SET nome = $1, email = $2, pais = $3, estado = $4, cidade = $5, senha = $6, latitude = $7, longitude = $8, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $9 RETURNING id, nome, email, pais, estado, cidade, latitude, longitude`
            : `UPDATE usuarios SET nome = $1, email = $2, pais = $3, estado = $4, cidade = $5, latitude = $6, longitude = $7, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $8 RETURNING id, nome, email, pais, estado, cidade, latitude, longitude`;

        const params = senhaHash
            ? [nome.trim(), (email || current.rows[0].email).toLowerCase(), pais || null, estado || null, cidade || null, senhaHash, lat, lng, req.usuario.id]
            : [nome.trim(), (email || current.rows[0].email).toLowerCase(), pais || null, estado || null, cidade || null, lat, lng, req.usuario.id];

        const result = await query(updateQuery, params);

        res.json({ success: true, message: 'Perfil atualizado com sucesso', data: result.rows[0] });
    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        res.status(500).json({ success: false, message: 'Erro ao atualizar perfil' });
    }
});

// ================================================================
// DELETE /api/usuarios/me/cancelar â€” Cancelar a prÃ³pria conta
// ================================================================
router.delete('/me/cancelar', authMiddleware, async (req, res) => {
    try {
        const { senha } = req.body;
        if (!senha) {
            return res.status(400).json({ success: false, message: 'Informe sua senha para confirmar o cancelamento' });
        }

        const result = await query('SELECT senha, tipo FROM usuarios WHERE id = $1', [req.usuario.id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'UsuÃ¡rio nÃ£o encontrado' });
        }

        if (result.rows[0].tipo === 'master') {
            return res.status(403).json({ success: false, message: 'Conta master nÃ£o pode ser cancelada por este fluxo' });
        }

        const senhaValida = await bcrypt.compare(senha, result.rows[0].senha);
        if (!senhaValida) {
            return res.status(400).json({ success: false, message: 'Senha incorreta' });
        }

        await query(
            `UPDATE usuarios SET status = 'cancelado', plano_status = 'expirado', data_atualizacao = CURRENT_TIMESTAMP WHERE id = $1`,
            [req.usuario.id]
        );

        res.json({ success: true, message: 'Conta cancelada com sucesso' });
    } catch (error) {
        console.error('Erro ao cancelar conta:', error);
        res.status(500).json({ success: false, message: 'Erro ao cancelar conta' });
    }
});

// ================================================================
// GET /api/usuarios/:id - Buscar usuÃ¡rio especÃ­fico
// ================================================================
router.get('/:id', authMiddleware, isAdminOrMaster, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        
        if (isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'ID do usuÃ¡rio deve ser um nÃºmero vÃ¡lido'
            });
        }
        
        const result = await query(
            'SELECT id, nome, email, documento, tipo, status, pais, estado, cidade, latitude, longitude, data_cadastro, data_atualizacao FROM usuarios WHERE id = $1',
            [userId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'UsuÃ¡rio nÃ£o encontrado'
            });
        }
        
        const usuario = result.rows[0];
        
        // Admin nÃ£o pode ver dados de outros admins ou masters
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
        console.error('Erro ao buscar usuÃ¡rio:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// ================================================================
// PUT /api/usuarios/:id - Atualizar usuÃ¡rio especÃ­fico
// ================================================================
router.put('/:id', authMiddleware, isAdminOrMaster, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { nome, email, senha, tipo, status, pais, estado, cidade, latitude, longitude } = req.body;
        
        if (isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'ID do usuÃ¡rio deve ser um nÃºmero vÃ¡lido'
            });
        }
        
        // Verificar se usuÃ¡rio existe
        const existingUser = await query(
            'SELECT id, tipo FROM usuarios WHERE id = $1',
            [userId]
        );
        
        if (existingUser.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'UsuÃ¡rio nÃ£o encontrado'
            });
        }
        
        const targetUser = existingUser.rows[0];
        
        // VerificaÃ§Ãµes de permissÃ£o
        if (req.usuario.tipo === 'admin' && targetUser.tipo !== 'padrao') {
            return res.status(403).json({
                success: false,
                message: 'Admin sÃ³ pode editar usuÃ¡rios padrÃ£o'
            });
        }
        
        // Apenas Master pode alterar tipo de usuÃ¡rio
        if (tipo && req.usuario.tipo !== 'master') {
            return res.status(403).json({
                success: false,
                message: 'Apenas Master pode alterar tipo de usuÃ¡rio'
            });
        }
        
        // ValidaÃ§Ãµes
        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Email invÃ¡lido'
                });
            }
            
            const emailExists = await query('SELECT id FROM usuarios WHERE email = $1 AND id != $2', [email, userId]);
            if (emailExists.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Este email jÃ¡ estÃ¡ sendo usado por outro usuÃ¡rio'
                });
            }
        }
        
        if (senha && senha.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'A senha deve ter pelo menos 6 caracteres'
            });
        }
        
        // Construir query de update dinÃ¢mica
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

        if (pais !== undefined) {
            paramCount++;
            updates.push(`pais = $${paramCount}`);
            params.push(pais || null);
        }

        if (estado !== undefined) {
            paramCount++;
            updates.push(`estado = $${paramCount}`);
            params.push(estado || null);
        }

        if (cidade !== undefined) {
            paramCount++;
            updates.push(`cidade = $${paramCount}`);
            params.push(cidade || null);
        }

        if (latitude !== undefined) {
            paramCount++;
            updates.push(`latitude = $${paramCount}`);
            params.push(latitude != null ? parseFloat(latitude) : null);
        }

        if (longitude !== undefined) {
            paramCount++;
            updates.push(`longitude = $${paramCount}`);
            params.push(longitude != null ? parseFloat(longitude) : null);
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
            message: 'UsuÃ¡rio atualizado com sucesso',
            data: result.rows[0]
        });
        
    } catch (error) {
        console.error('Erro ao atualizar usuÃ¡rio:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// ================================================================
// PUT /api/usuarios/:id/alterar-senha - Alterar senha do usuÃ¡rio
// ================================================================
router.put('/:id/alterar-senha', authMiddleware, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { senhaAtual, senhaNova } = req.body;

        // ValidaÃ§Ãµes
        if (isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'ID do usuÃ¡rio deve ser um nÃºmero vÃ¡lido'
            });
        }

        // UsuÃ¡rio sÃ³ pode alterar sua prÃ³pria senha
        if (userId !== req.usuario.id) {
            return res.status(403).json({
                success: false,
                message: 'VocÃª sÃ³ pode alterar sua prÃ³pria senha'
            });
        }

        if (!senhaAtual || !senhaNova) {
            return res.status(400).json({
                success: false,
                message: 'Senha atual e senha nova sÃ£o obrigatÃ³rias'
            });
        }

        if (senhaNova.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'A senha nova deve ter pelo menos 6 caracteres'
            });
        }

        // Buscar usuÃ¡rio e verificar senha atual
        const userResult = await query(
            'SELECT id, senha FROM usuarios WHERE id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'UsuÃ¡rio nÃ£o encontrado'
            });
        }

        const usuario = userResult.rows[0];

        // Verificar se a senha atual estÃ¡ correta
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
// DELETE /api/usuarios/:id - Excluir usuÃ¡rio (Apenas Master)
// ================================================================
router.delete('/:id', authMiddleware, isMaster, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        
        if (isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'ID do usuÃ¡rio deve ser um nÃºmero vÃ¡lido'
            });
        }
        
        // NÃ£o pode excluir a si mesmo
        if (userId === req.usuario.id) {
            return res.status(400).json({
                success: false,
                message: 'VocÃª nÃ£o pode excluir sua prÃ³pria conta'
            });
        }
        
        // Verificar se usuÃ¡rio existe
        const existingUser = await query(
            'SELECT id, nome, tipo FROM usuarios WHERE id = $1',
            [userId]
        );
        
        if (existingUser.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'UsuÃ¡rio nÃ£o encontrado'
            });
        }
        
        // Verificar se usuÃ¡rio tem dados financeiros
        const hasData = await query(
            'SELECT COUNT(*) as total FROM (SELECT id FROM receitas WHERE usuario_id = $1 UNION SELECT id FROM despesas WHERE usuario_id = $1) as dados',
            [userId]
        );
        
        const totalDados = parseInt(hasData.rows[0].total);
        
        if (totalDados > 0) {
            return res.status(400).json({
                success: false,
                message: `NÃ£o Ã© possÃ­vel excluir este usuÃ¡rio pois ele possui ${totalDados} registros financeiros. Desative o usuÃ¡rio em vez de excluÃ­-lo.`
            });
        }
        
        await query('DELETE FROM usuarios WHERE id = $1', [userId]);
        
        res.json({
            success: true,
            message: `UsuÃ¡rio "${existingUser.rows[0].nome}" excluÃ­do com sucesso`
        });
        
    } catch (error) {
        console.error('Erro ao excluir usuÃ¡rio:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// ================================================================
// PUT /api/usuarios/:id/status - Alterar status do usuÃ¡rio (Admin/Master)
// ================================================================
router.put('/:id/status', authMiddleware, isAdminOrMaster, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { status } = req.body;
        
        if (isNaN(userId)) {
            return res.status(400).json({
                success: false,
                message: 'ID do usuÃ¡rio deve ser um nÃºmero vÃ¡lido'
            });
        }
        
        if (!['ativo', 'inativo', 'bloqueado'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Status deve ser: ativo, inativo ou bloqueado'
            });
        }
        
        // NÃ£o pode alterar prÃ³prio status
        if (userId === req.usuario.id) {
            return res.status(400).json({
                success: false,
                message: 'VocÃª nÃ£o pode alterar seu prÃ³prio status'
            });
        }
        
        // Verificar se usuÃ¡rio existe
        const existingUser = await query(
            'SELECT id, nome, tipo, status FROM usuarios WHERE id = $1',
            [userId]
        );
        
        if (existingUser.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'UsuÃ¡rio nÃ£o encontrado'
            });
        }
        
        const targetUser = existingUser.rows[0];
        
        // Admin nÃ£o pode alterar status de outros admins ou masters
        if (req.usuario.tipo === 'admin' && targetUser.tipo !== 'padrao') {
            return res.status(403).json({
                success: false,
                message: 'Admin sÃ³ pode alterar status de usuÃ¡rios padrÃ£o'
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
            message: `UsuÃ¡rio "${result.rows[0].nome}" ${statusTexto} com sucesso`,
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
// GET /api/usuarios/stats/geral - EstatÃ­sticas gerais (Master)
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
                COUNT(CASE WHEN tipo = 'master' THEN 1 END) as usuarios_master,
                COUNT(CASE WHEN plano_status = 'ativo' AND tipo != 'master' THEN 1 END) as usuarios_pagantes,
                COUNT(CASE WHEN (plano_status = 'trial' OR plano_status IS NULL) AND tipo != 'master' THEN 1 END) as usuarios_trial,
                COUNT(CASE WHEN plano_status = 'expirado' AND tipo != 'master' THEN 1 END) as usuarios_expirados,
                COUNT(CASE WHEN plano_status = 'ativo' AND plano_tipo = 'mensal' THEN 1 END) as usuarios_mensal,
                COUNT(CASE WHEN plano_status = 'ativo' AND plano_tipo = 'anual' THEN 1 END) as usuarios_anual,
                COUNT(CASE WHEN status = 'cancelado' THEN 1 END) as usuarios_cancelados
            FROM usuarios
        `);

        res.json({
            success: true,
            data: stats.rows[0]
        });

    } catch (error) {
        console.error('Erro ao buscar estatÃ­sticas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// ================================================================
// GET /api/usuarios/stats/mapa - DistribuiÃ§Ã£o geogrÃ¡fica de usuÃ¡rios (Master)
// ================================================================
router.get('/stats/mapa', authMiddleware, isMaster, async (req, res) => {
    try {
        const pontosExatos = await query(`
            SELECT nome, latitude, longitude, pais, cidade
            FROM usuarios
            WHERE (tipo = 'padrao' OR tipo = 'admin')
            AND latitude IS NOT NULL AND longitude IS NOT NULL
        `);

        const porPais = await query(`
            SELECT
                COALESCE(pais, 'NÃ£o informado') as pais,
                COUNT(*) as total
            FROM usuarios
            WHERE tipo = 'padrao' OR tipo = 'admin'
            GROUP BY pais
            ORDER BY total DESC
        `);

        res.json({
            success: true,
            data: {
                pontos_exatos: pontosExatos.rows,
                por_pais: porPais.rows
            }
        });

    } catch (error) {
        console.error('Erro ao buscar mapa de usuÃ¡rios:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// ================================================================
// FUNÃ‡ÃƒO AUXILIAR: Criar estrutura inicial de dados financeiros
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
// Buscar dados financeiros de um usuÃ¡rio
// ================================================================
router.get('/:id/dados-financeiros', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar se o usuÃ¡rio estÃ¡ tentando acessar seus prÃ³prios dados
        if (req.usuario.id !== parseInt(id)) {
            return res.status(403).json({
                success: false,
                message: 'Acesso negado. VocÃª sÃ³ pode acessar seus prÃ³prios dados.'
            });
        }

        // Buscar usuÃ¡rio no banco de dados
        const result = await query(
            'SELECT dados_financeiros FROM usuarios WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'UsuÃ¡rio nÃ£o encontrado'
            });
        }

        // Se nÃ£o houver dados financeiros, retornar estrutura inicial
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
// Salvar/atualizar dados financeiros de um usuÃ¡rio
// ================================================================
router.put('/:id/dados-financeiros', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { dadosFinanceiros } = req.body;

        // Verificar se o usuÃ¡rio estÃ¡ tentando atualizar seus prÃ³prios dados
        if (req.usuario.id !== parseInt(id)) {
            return res.status(403).json({
                success: false,
                message: 'Acesso negado. VocÃª sÃ³ pode atualizar seus prÃ³prios dados.'
            });
        }

        // Validar dados recebidos
        if (!dadosFinanceiros || typeof dadosFinanceiros !== 'object') {
            return res.status(400).json({
                success: false,
                message: 'Dados financeiros invÃ¡lidos'
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
                message: 'UsuÃ¡rio nÃ£o encontrado'
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
// Buscar categorias de um usuÃ¡rio
// ================================================================
router.get('/:id/categorias', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar se o usuÃ¡rio estÃ¡ tentando acessar seus prÃ³prios dados
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
                message: 'UsuÃ¡rio nÃ£o encontrado'
            });
        }

        // Estrutura padrÃ£o de categorias
        const categoriasPadrao = {
            despesas: ["AlimentaÃ§Ã£o", "CombustÃ­vel", "Moradia"]
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
// Salvar/atualizar categorias de um usuÃ¡rio
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
                message: 'Categorias invÃ¡lidas'
            });
        }

        const result = await query(
            'UPDATE usuarios SET categorias = $1, data_atualizacao = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id',
            [JSON.stringify(categorias), id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'UsuÃ¡rio nÃ£o encontrado'
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
// Buscar cartÃµes de um usuÃ¡rio
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
        const { perfil_id } = req.query;
        let cartoesWhere = 'WHERE c.usuario_id = $1';
        const cartoesParams = [id];

        if (perfil_id) {
            cartoesWhere += ` AND (c.perfil_id = $2 OR (c.perfil_id IS NULL AND EXISTS (SELECT 1 FROM perfis p WHERE p.id = $2 AND p.tipo = 'pessoal' AND p.usuario_id = c.usuario_id)))`;
            cartoesParams.push(parseInt(perfil_id));
        }

        const resultTabela = await query(
            `SELECT c.id, c.nome as banco, c.limite, c.dia_fechamento, c.dia_vencimento, c.cor, c.ativo
             FROM cartoes c
             ${cartoesWhere}
             ORDER BY c.id ASC`,
            cartoesParams
        );

        // Se encontrou cartÃµes na tabela, retornar eles
        if (resultTabela.rows.length > 0) {
            const cartoes = resultTabela.rows.map((cartao, index) => ({
                id: cartao.id,
                banco: cartao.banco,
                nome: cartao.banco,
                limite: parseFloat(cartao.limite) || 0,
                dia_fechamento: cartao.dia_fechamento,
                dia_vencimento: cartao.dia_vencimento,
                cor: cartao.cor || '#3498db',
                ativo: cartao.ativo !== false,
                numero_cartao: index + 1
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
                message: 'UsuÃ¡rio nÃ£o encontrado'
            });
        }

        const cartoesJson = resultJson.rows[0].cartoes;

        // Se nÃ£o tem cartÃµes no JSON, retornar array vazio
        if (!cartoesJson) {
            return res.json({
                success: true,
                cartoes: []
            });
        }

        // 3. Migrar cartÃµes do JSON para a tabela automaticamente
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

        // Se tem cartÃµes para migrar, inserir na tabela (ON CONFLICT ignora duplicatas)
        const cartoesMigrados = [];
        for (let i = 0; i < cartoesParaMigrar.length; i++) {
            const cartao = cartoesParaMigrar[i];
            try {
                const insertResult = await query(
                    `INSERT INTO cartoes (usuario_id, nome, limite, dia_fechamento, dia_vencimento, cor, ativo)
                     VALUES ($1, $2, $3, $4, $5, $6, $7)
                     ON CONFLICT (usuario_id, LOWER(nome), COALESCE(perfil_id, 0)) DO NOTHING
                     RETURNING id, nome as banco, limite, dia_fechamento, dia_vencimento, cor, ativo`,
                    [
                        id,
                        (cartao.banco || cartao.nome || '').trim(),
                        parseFloat(cartao.limite) || 0,
                        cartao.dia_fechamento || 1,
                        cartao.dia_vencimento || 10,
                        cartao.cor || '#3498db',
                        cartao.ativo !== false
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
                        numero_cartao: i + 1
                    });
                }
            } catch (insertError) {
                console.error('Erro ao migrar cartÃ£o:', insertError);
            }
        }

        console.log(`âœ… Migrados ${cartoesMigrados.length} cartÃµes do JSON para tabela (usuÃ¡rio ${id})`);

        res.json({
            success: true,
            cartoes: cartoesMigrados
        });

    } catch (error) {
        console.error('Erro ao buscar cartÃµes:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar cartÃµes',
            error: error.message
        });
    }
});

// ================================================================
// PUT /api/usuarios/:id/cartoes
// Salvar/atualizar cartÃµes de um usuÃ¡rio - SALVA NA TABELA CARTOES
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

        if (!cartoes || !Array.isArray(cartoes)) {
            return res.status(400).json({
                success: false,
                message: 'CartÃµes invÃ¡lidos - esperado array'
            });
        }

        // Iniciar transaÃ§Ã£o
        await query('BEGIN');

        try {
            // 1. Buscar cartÃµes existentes na tabela
            const existentes = await query(
                'SELECT id FROM cartoes WHERE usuario_id = $1',
                [id]
            );
            const idsExistentes = existentes.rows.map(r => r.id);

            // 2. IDs dos cartÃµes enviados (apenas os que jÃ¡ tÃªm ID vÃ¡lido do banco)
            const idsEnviados = cartoes
                .filter(c => c.id && typeof c.id === 'number' && c.id > 100) // IDs reais sÃ£o maiores
                .map(c => c.id);

            // 3. Deletar cartÃµes que nÃ£o estÃ£o mais na lista
            const idsParaDeletar = idsExistentes.filter(id => !idsEnviados.includes(id));
            for (const cartaoId of idsParaDeletar) {
                await query('DELETE FROM cartoes WHERE id = $1 AND usuario_id = $2', [cartaoId, id]);
            }

            // 4. Inserir ou atualizar cada cartÃ£o
            const cartoesSalvos = [];
            for (let i = 0; i < cartoes.length; i++) {
                const cartao = cartoes[i];
                const nome = (cartao.banco || cartao.nome || '').trim();

                if (!nome) continue;

                // Se tem ID vÃ¡lido do banco, atualizar
                if (cartao.id && typeof cartao.id === 'number' && idsExistentes.includes(cartao.id)) {
                    const updateResult = await query(
                        `UPDATE cartoes
                         SET nome = $1, limite = $2, dia_fechamento = $3, dia_vencimento = $4,
                             cor = $5, ativo = $6, data_atualizacao = CURRENT_TIMESTAMP
                         WHERE id = $7 AND usuario_id = $8
                         RETURNING id, nome as banco, limite, dia_fechamento, dia_vencimento, cor, ativo`,
                        [
                            nome,
                            parseFloat(cartao.limite) || 0,
                            cartao.dia_fechamento || 1,
                            cartao.dia_vencimento || 10,
                            cartao.cor || '#3498db',
                            cartao.ativo !== false,
                            cartao.id,
                            id
                        ]
                    );
                    if (updateResult.rows.length > 0) {
                        cartoesSalvos.push(updateResult.rows[0]);
                    }
                } else {
                    // Inserir novo cartÃ£o
                    const insertResult = await query(
                        `INSERT INTO cartoes (usuario_id, nome, limite, dia_fechamento, dia_vencimento, cor, ativo)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)
                         RETURNING id, nome as banco, limite, dia_fechamento, dia_vencimento, cor, ativo`,
                        [
                            id,
                            nome,
                            parseFloat(cartao.limite) || 0,
                            cartao.dia_fechamento || 1,
                            cartao.dia_vencimento || 10,
                            cartao.cor || '#3498db',
                            cartao.ativo !== false
                        ]
                    );
                    if (insertResult.rows.length > 0) {
                        cartoesSalvos.push(insertResult.rows[0]);
                    }
                }
            }

            await query('COMMIT');

            console.log(`âœ… Salvos ${cartoesSalvos.length} cartÃµes na tabela (usuÃ¡rio ${id})`);

            res.json({
                success: true,
                message: 'CartÃµes salvos com sucesso',
                cartoes: cartoesSalvos.map(c => ({
                    id: c.id,
                    banco: c.banco,
                    nome: c.banco,
                    limite: parseFloat(c.limite) || 0,
                    dia_fechamento: c.dia_fechamento,
                    dia_vencimento: c.dia_vencimento,
                    cor: c.cor,
                    ativo: c.ativo
                }))
            });

        } catch (err) {
            await query('ROLLBACK');
            throw err;
        }

    } catch (error) {
        console.error('Erro ao salvar cartÃµes:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao salvar cartÃµes',
            error: error.message
        });
    }
});


router.delete('/:id/limpar-dados', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        // SeguranÃ§a: verifica se o ID da URL Ã© o mesmo do token
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

        // Limpa os campos JSON e notificaÃ§Ãµes na tabela usuarios
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

        // Opcional: Recria as categorias padrÃ£o (AlimentaÃ§Ã£o, Moradia, etc.) para o usuÃ¡rio nÃ£o ficar sem nada
        await query('SELECT criar_categorias_padrao($1)', [id]);

        res.json({ 
            success: true, 
            message: 'Sistema resetado: Dados, Categorias, CartÃµes e NotificaÃ§Ãµes apagados.' 
        });

    } catch (error) {
        console.error('Erro na limpeza:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao limpar dados' });
    }
});



module.exports = router;

