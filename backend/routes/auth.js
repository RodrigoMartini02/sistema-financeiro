// ================================================================
// ROTAS DE AUTENTICAÇÃO
// ================================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const { query } = require('../config/database');
const { validate, validarDocumento, authRateLimiter } = require('../middleware/validation');
const { authMiddleware } = require('../middleware/auth');

// ================================================================
// POST /api/auth/login - Login do usuário
// ================================================================
router.post('/login', [
    authRateLimiter(), // Rate limiting para prevenir brute force
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
            'UPDATE usuarios SET data_atualizacao = CURRENT_TIMESTAMP WHERE id = $1',
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


router.post('/logout', authMiddleware, (req, res) => {
    res.json({
        success: true,
        message: 'Logout realizado com sucesso'
    });
});

// ================================================================
// POST /api/auth/verify-password - Verificar senha (para desbloqueio de tela)
// ================================================================
router.post('/verify-password', [
    authMiddleware,
    body('senha').notEmpty().withMessage('Senha é obrigatória'),
    validate
], async (req, res) => {
    try {
        const { senha } = req.body;
        const usuarioId = req.usuario.id;

        // Buscar senha do usuário no banco
        const result = await query(
            'SELECT senha FROM usuarios WHERE id = $1',
            [usuarioId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Usuário não encontrado'
            });
        }

        // Verificar senha usando bcrypt
        const senhaValida = await bcrypt.compare(senha, result.rows[0].senha);

        if (!senhaValida) {
            return res.status(401).json({
                success: false,
                message: 'Senha incorreta'
            });
        }

        res.json({
            success: true,
            message: 'Senha verificada com sucesso'
        });

    } catch (error) {
        console.error('Erro ao verificar senha:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao verificar senha'
        });
    }
});



router.post('/forgot-password', [
    body('email').isEmail().withMessage('Email inválido'),
    validate
], async (req, res) => {
    try {
        const { email } = req.body;

        const result = await query(
            'SELECT id, nome, email FROM usuarios WHERE email = $1',
            [email.toLowerCase()]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'E-mail não encontrado'
            });
        }

        res.json({
            success: true,
            message: 'E-mail validado com sucesso',
            data: {
                nome: result.rows[0].nome,
                email: result.rows[0].email
            }
        });
    } catch (error) {
        console.error('Erro na recuperação:', error);
        res.status(500).json({ success: false, message: 'Erro no servidor' });
    }
});

// ================================================================
// POST /api/auth/send-recovery-email - Enviar email de recuperação (seguro)
// ================================================================
router.post('/send-recovery-email', [
    body('email').isEmail().withMessage('Email inválido'),
    body('codigo').notEmpty().withMessage('Código é obrigatório'),
    body('nome').notEmpty().withMessage('Nome é obrigatório'),
    validate
], async (req, res) => {
    try {
        const { email, codigo, nome } = req.body;

        const serviceId = process.env.EMAILJS_SERVICE_ID;
        const templateId = process.env.EMAILJS_TEMPLATE_ID;
        const userId = process.env.EMAILJS_USER_ID;

        console.log('[EmailJS] Vars configuradas:', { serviceId: !!serviceId, templateId: !!templateId, userId: !!userId });

        if (!serviceId || !templateId || !userId) {
            console.error('[EmailJS] Credenciais não configuradas no ambiente');
            return res.status(500).json({
                success: false,
                message: 'Serviço de email não configurado'
            });
        }

        // Usar fetch nativo (Node 18+) ou node-fetch como fallback
        const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch');

        const response = await fetchFn('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Origin': 'https://sistema-financeiro-kxed.onrender.com'
            },
            body: JSON.stringify({
                service_id: serviceId,
                template_id: templateId,
                user_id: userId,
                template_params: {
                    to_email: email,
                    to_name: nome,
                    codigo_recuperacao: codigo,
                    validade: '15 minutos',
                    sistema_nome: 'Sistema de Controle Financeiro'
                }
            })
        });

        if (response.ok) {
            console.log('[EmailJS] Email enviado com sucesso para:', email);
            res.json({
                success: true,
                message: 'Email enviado com sucesso'
            });
        } else {
            const errorText = await response.text();
            console.error('[EmailJS] Erro na resposta:', response.status, errorText);
            res.status(500).json({
                success: false,
                message: 'Erro ao enviar email: ' + errorText
            });
        }
    } catch (error) {
        console.error('[EmailJS] Erro catch:', error.message);
        res.status(500).json({
            success: false,
            message: 'Erro ao enviar email: ' + error.message
        });
    }
});


router.post('/reset-password', [
    body('email').isEmail().withMessage('Email inválido'),
    body('novaSenha').isLength({ min: 6 }).withMessage('Mínimo 6 caracteres'),
    validate
], async (req, res) => {
    try {
        const { email, novaSenha } = req.body;
        const senhaHash = await bcrypt.hash(novaSenha, 10);

        const result = await query(
            'UPDATE usuarios SET senha = $1, data_atualizacao = CURRENT_TIMESTAMP WHERE email = $2 RETURNING id',
            [senhaHash, email.toLowerCase()]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }

        res.json({ success: true, message: 'Senha alterada com sucesso no banco!' });
    } catch (error) {
        console.error('Erro ao resetar senha:', error);
        res.status(500).json({ success: false, message: 'Erro ao atualizar senha' });
    }
});



// ================================================================
// POST /api/auth/google - Login com Google OAuth
// ================================================================
router.post('/google', async (req, res) => {
    try {
        const { code, redirect_uri } = req.body;

        if (!code) {
            return res.status(400).json({ success: false, message: 'Código de autorização não fornecido' });
        }

        // 1. Trocar o código por tokens no Google
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: redirect_uri,
                grant_type: 'authorization_code'
            })
        });

        const tokenData = await tokenResponse.json();

        if (tokenData.error) {
            console.error('Erro Google token:', tokenData.error_description);
            return res.status(400).json({ success: false, message: 'Erro ao autenticar com Google: ' + (tokenData.error_description || tokenData.error) });
        }

        // 2. Buscar informações do usuário com o access_token
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });

        const googleUser = await userInfoResponse.json();

        if (!googleUser.email) {
            return res.status(400).json({ success: false, message: 'Não foi possível obter email do Google' });
        }

        // 3. Verificar se já existe usuário com este email
        let result = await query('SELECT * FROM usuarios WHERE email = $1', [googleUser.email]);
        let usuario;

        if (result.rows.length > 0) {
            // Usuário existe - login direto
            usuario = result.rows[0];

            if (usuario.status !== 'ativo') {
                return res.status(403).json({ success: false, message: 'Conta desativada. Entre em contato com o suporte.' });
            }

            // Salvar google_id se ainda não tem
            if (!usuario.google_id) {
                await query('UPDATE usuarios SET google_id = $1 WHERE id = $2', [googleUser.id, usuario.id]);
            }
        } else {
            // Usuário não existe - criar conta automaticamente
            const senhaHash = await bcrypt.hash(googleUser.id + Date.now(), 10);
            const docPlaceholder = 'G' + googleUser.id.substring(0, 19);

            const insertResult = await query(
                `INSERT INTO usuarios (nome, email, documento, senha, tipo, status, google_id)
                 VALUES ($1, $2, $3, $4, 'admin', 'ativo', $5) RETURNING *`,
                [googleUser.name || googleUser.email.split('@')[0], googleUser.email, docPlaceholder, senhaHash, googleUser.id]
            );

            usuario = insertResult.rows[0];
        }

        // 4. Gerar JWT do sistema
        const token = jwt.sign(
            { id: usuario.id, email: usuario.email, tipo: usuario.tipo },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            data: {
                token,
                usuario: {
                    id: usuario.id,
                    nome: usuario.nome,
                    email: usuario.email,
                    documento: usuario.documento,
                    tipo: usuario.tipo
                }
            }
        });

    } catch (error) {
        console.error('Erro no login Google:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao processar login com Google' });
    }
});

module.exports = router;


