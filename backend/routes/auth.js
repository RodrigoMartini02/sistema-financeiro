// ================================================================
// ROTAS DE AUTENTICAÇÃO
// ================================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const { query } = require('../config/database');
const { validate, validarDocumento } = require('../middleware/validation');
const { authMiddleware } = require('../middleware/auth');

// ================================================================
// POST /api/auth/login - Login do usuário
// ================================================================
router.post('/login', [
    body('documento').notEmpty().withMessage('Documento é obrigatório'),
    body('senha').notEmpty().withMessage('Senha é obrigatória'),
    validate
], async (req, res) => {
    try {
        const { documento, senha } = req.body;
        
        // Limpar documento
        const docLimpo = documento.replace(/[^\d]+/g, '');
        
        // Buscar usuário
        const result = await query(
            'SELECT * FROM usuarios WHERE documento = $1',
            [docLimpo]
        );
        
        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Documento ou senha incorretos'
            });
        }
        
        const usuario = result.rows[0];
        
        // Verificar se está bloqueado
        if (usuario.status === 'bloqueado') {
            return res.status(403).json({
                success: false,
                message: 'Conta bloqueada. Entre em contato com o suporte.'
            });
        }
        
        // Verificar senha
        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        
        if (!senhaValida) {
            return res.status(401).json({
                success: false,
                message: 'Documento ou senha incorretos'
            });
        }
        
        // Gerar token JWT
        const token = jwt.sign(
            { 
                id: usuario.id, 
                documento: usuario.documento,
                tipo: usuario.tipo 
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );
        
        // Atualizar última atualização
        await query(
            'UPDATE usuarios SET ultima_atualizacao = CURRENT_TIMESTAMP WHERE id = $1',
            [usuario.id]
        );
        
        res.json({
            success: true,
            message: 'Login realizado com sucesso',
            data: {
                token,
                usuario: {
                    id: usuario.id,
                    nome: usuario.nome,
                    email: usuario.email,
                    documento: usuario.documento,
                    tipo: usuario.tipo,
                    status: usuario.status
                }
            }
        });
        
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao fazer login'
        });
    }
});

// ================================================================
// POST /api/auth/register - Cadastro de novo usuário
// ================================================================
router.post('/register', [
    body('nome').notEmpty().withMessage('Nome é obrigatório'),
    body('email').isEmail().withMessage('Email inválido'),
    body('documento').notEmpty().withMessage('Documento é obrigatório')
        .custom(validarDocumento).withMessage('CPF/CNPJ inválido'),
    body('senha').isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres'),
    validate
], async (req, res) => {
    try {
        const { nome, email, documento, senha, tipo } = req.body;
        
        // Limpar documento
        const docLimpo = documento.replace(/[^\d]+/g, '');
        
        // Verificar se já existe
        const existe = await query(
            'SELECT id FROM usuarios WHERE email = $1 OR documento = $2',
            [email.toLowerCase(), docLimpo]
        );
        
        if (existe.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Email ou documento já cadastrado'
            });
        }
        
        // Hash da senha
        const senhaHash = await bcrypt.hash(senha, 10);
        
        // Inserir usuário
        const result = await query(
            `INSERT INTO usuarios (nome, email, documento, senha, tipo, status) 
             VALUES ($1, $2, $3, $4, $5, $6) 
             RETURNING id, nome, email, documento, tipo, status`,
            [nome, email.toLowerCase(), docLimpo, senhaHash, tipo || 'padrao', 'ativo']
        );
        
        const novoUsuario = result.rows[0];
        
        // Criar categorias padrão
        await query('SELECT criar_categorias_padrao($1)', [novoUsuario.id]);
        
        res.status(201).json({
            success: true,
            message: 'Usuário cadastrado com sucesso',
            data: {
                usuario: novoUsuario
            }
        });
        
    } catch (error) {
        console.error('Erro no cadastro:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao cadastrar usuário'
        });
    }
});

// ================================================================
// GET /api/auth/verify - Verificar token
// ================================================================
router.get('/verify', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            'SELECT id, nome, email, documento, tipo, status FROM usuarios WHERE id = $1',
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
            data: {
                usuario: result.rows[0]
            }
        });
        
    } catch (error) {
        console.error('Erro ao verificar token:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao verificar autenticação'
        });
    }
});

// ================================================================
// POST /api/auth/logout - Logout
// ================================================================
router.post('/logout', authMiddleware, (req, res) => {
    res.json({
        success: true,
        message: 'Logout realizado com sucesso'
    });
});

module.exports = router;