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
// HELPER: Enviar email de recuperação via EmailJS
// ================================================================
async function enviarEmailRecuperacaoEmailJS(email, nome, codigo) {
    const serviceId = process.env.EMAILJS_SERVICE_ID;
    const templateId = process.env.EMAILJS_TEMPLATE_ID;
    const userId = process.env.EMAILJS_USER_ID;

    if (!serviceId || !templateId || !userId) {
        throw new Error('Serviço de email não configurado');
    }

    const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch');
    const response = await fetchFn('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Origin': process.env.FRONTEND_URL || 'https://fin-gerence.com.br'
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
                sistema_nome: 'e-conomia',
                assunto: '[e-conomia] Codigo de Recuperacao de Senha'
            }
        })
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error('Erro ao enviar email: ' + text);
    }
}

// ================================================================
// POST /api/auth/login - Login do usuário
// ================================================================
router.post('/login', [
    authRateLimiter(),
    body('documento').notEmpty().withMessage('Documento é obrigatório'),
    body('senha').notEmpty().withMessage('Senha é obrigatória'),
    validate
], async (req, res) => {
    try {
        const { documento, senha } = req.body;
        const docLimpo = documento.replace(/[^\d]+/g, '');

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

        if (usuario.status === 'bloqueado') {
            return res.status(403).json({
                success: false,
                message: 'Conta bloqueada. Entre em contato com o suporte.'
            });
        }

        const senhaValida = await bcrypt.compare(senha, usuario.senha);

        if (!senhaValida) {
            return res.status(401).json({
                success: false,
                message: 'Documento ou senha incorretos'
            });
        }

        const token = jwt.sign(
            {
                id: usuario.id,
                documento: usuario.documento,
                tipo: usuario.tipo
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

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
    body('senha').isLength({ min: 8 }).withMessage('Senha deve ter no mínimo 8 caracteres'),
    validate
], async (req, res) => {
    try {
        const { nome, email, documento, senha, tipo, google_id, pais, estado, cidade, latitude, longitude } = req.body;
        const docLimpo = documento.replace(/[^\d]+/g, '');

        // Apenas CPF (11 dígitos) permitido no cadastro público
        if (docLimpo.length !== 11) {
            return res.status(400).json({
                success: false,
                message: 'Apenas CPF é permitido no cadastro. Para cadastrar uma empresa (PJ), entre em contato com o administrador.'
            });
        }

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

        const senhaHash = await bcrypt.hash(senha, 10);

        const result = await query(
            `INSERT INTO usuarios (nome, email, documento, senha, tipo, status, google_id, pais, estado, cidade, latitude, longitude)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING id, nome, email, documento, tipo, status`,
            [nome, email.toLowerCase(), docLimpo, senhaHash, tipo || 'padrao', 'ativo', google_id || null, pais || null, estado || null, cidade || null, latitude || null, longitude || null]
        );

        const novoUsuario = result.rows[0];

        await query('SELECT criar_categorias_padrao($1)', [novoUsuario.id]);

        // Criar perfil pessoal padrão
        await query(
            `INSERT INTO perfis (usuario_id, tipo, nome, ativo)
             VALUES ($1, 'pessoal', 'Pessoal', true)`,
            [novoUsuario.id]
        );

        const token = jwt.sign(
            { id: novoUsuario.id, documento: novoUsuario.documento, tipo: novoUsuario.tipo },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
        );

        res.status(201).json({
            success: true,
            message: 'Usuário cadastrado com sucesso',
            data: {
                token,
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
// POST /api/auth/verify-password - Verificar senha (desbloqueio de tela)
// ================================================================
router.post('/verify-password', [
    authMiddleware,
    body('senha').notEmpty().withMessage('Senha é obrigatória'),
    validate
], async (req, res) => {
    try {
        const { senha } = req.body;
        const usuarioId = req.usuario.id;

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

// ================================================================
// POST /api/auth/forgot-password - Solicitar recuperação de senha
// Gera código server-side, armazena no banco e envia email.
// Sempre retorna 200 para evitar enumeração de usuários.
// ================================================================
router.post('/forgot-password', [
    body('email').isEmail().withMessage('Email inválido'),
    validate
], async (req, res) => {
    const MSG_GENERICA = 'Se este email estiver cadastrado, você receberá um código de recuperação em breve.';
    try {
        const { email } = req.body;
        const emailNorm = email.toLowerCase();

        const result = await query(
            'SELECT id, nome FROM usuarios WHERE email = $1',
            [emailNorm]
        );

        // Always return 200 — don't reveal whether email exists
        if (result.rows.length === 0) {
            return res.json({ success: true, message: MSG_GENERICA });
        }

        const usuario = result.rows[0];
        const codigo = Math.floor(100000 + Math.random() * 900000).toString();
        const expiracao = new Date(Date.now() + 15 * 60 * 1000).toISOString();

        // Store code in DB (overwrites any previous code)
        await query(
            `UPDATE usuarios
             SET dados_financeiros = COALESCE(dados_financeiros, '{}'::jsonb) ||
                 jsonb_build_object(
                     'recovery_code', $1::text,
                     'recovery_code_expiry', $2::text,
                     'recovery_attempts', 0
                 )
             WHERE id = $3`,
            [codigo, expiracao, usuario.id]
        );

        // Send email — log failure but don't expose it to the client
        try {
            await enviarEmailRecuperacaoEmailJS(emailNorm, usuario.nome, codigo);
        } catch (emailErr) {
            console.error('[Recovery] Falha ao enviar email:', emailErr.message);
        }

        res.json({ success: true, message: MSG_GENERICA });
    } catch (error) {
        console.error('Erro na recuperação:', error);
        res.status(500).json({ success: false, message: 'Erro no servidor' });
    }
});

// ================================================================
// POST /api/auth/verify-recovery-code - Validar código de recuperação
// ================================================================
router.post('/verify-recovery-code', [
    body('email').isEmail().withMessage('Email inválido'),
    body('codigo').notEmpty().withMessage('Código é obrigatório'),
    validate
], async (req, res) => {
    const MSG_INVALIDO = 'Código incorreto ou expirado';
    try {
        const { email, codigo } = req.body;
        const emailNorm = email.toLowerCase();

        const result = await query(
            'SELECT id, dados_financeiros FROM usuarios WHERE email = $1',
            [emailNorm]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ success: false, message: MSG_INVALIDO });
        }

        const usuario = result.rows[0];
        const df = usuario.dados_financeiros || {};
        const storedCode = df.recovery_code;
        const expiry = df.recovery_code_expiry;
        const attempts = df.recovery_attempts || 0;

        if (!storedCode || !expiry) {
            return res.status(400).json({ success: false, message: 'Código não encontrado. Solicite um novo.' });
        }

        if (new Date() > new Date(expiry)) {
            return res.status(400).json({ success: false, message: 'Código expirado. Solicite um novo.' });
        }

        if (attempts >= 3) {
            return res.status(400).json({ success: false, message: 'Muitas tentativas. Solicite um novo código.' });
        }

        if (storedCode !== codigo) {
            await query(
                `UPDATE usuarios
                 SET dados_financeiros = COALESCE(dados_financeiros, '{}'::jsonb) ||
                     jsonb_build_object('recovery_attempts', $1)
                 WHERE id = $2`,
                [attempts + 1, usuario.id]
            );
            return res.status(400).json({ success: false, message: MSG_INVALIDO });
        }

        res.json({ success: true, message: 'Código válido' });
    } catch (error) {
        console.error('Erro ao verificar código:', error);
        res.status(500).json({ success: false, message: 'Erro no servidor' });
    }
});

// ================================================================
// POST /api/auth/reset-password - Redefinir senha com código validado
// ================================================================
router.post('/reset-password', [
    body('email').isEmail().withMessage('Email inválido'),
    body('novaSenha').isLength({ min: 8 }).withMessage('Mínimo 8 caracteres'),
    body('codigo').notEmpty().withMessage('Código é obrigatório'),
    validate
], async (req, res) => {
    try {
        const { email, novaSenha, codigo } = req.body;
        const emailNorm = email.toLowerCase();

        const result = await query(
            'SELECT id, dados_financeiros FROM usuarios WHERE email = $1',
            [emailNorm]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }

        const usuario = result.rows[0];
        const df = usuario.dados_financeiros || {};
        const storedCode = df.recovery_code;
        const expiry = df.recovery_code_expiry;
        const attempts = df.recovery_attempts || 0;

        if (!storedCode || !expiry) {
            return res.status(400).json({ success: false, message: 'Código não encontrado. Solicite um novo.' });
        }

        if (new Date() > new Date(expiry)) {
            return res.status(400).json({ success: false, message: 'Código expirado. Solicite um novo.' });
        }

        if (attempts >= 3) {
            return res.status(400).json({ success: false, message: 'Muitas tentativas. Solicite um novo código.' });
        }

        if (storedCode !== codigo) {
            return res.status(400).json({ success: false, message: 'Código inválido' });
        }

        const senhaHash = await bcrypt.hash(novaSenha, 10);

        // Update password and clear recovery fields
        await query(
            `UPDATE usuarios
             SET senha = $1,
                 data_atualizacao = CURRENT_TIMESTAMP,
                 dados_financeiros = dados_financeiros
                     - 'recovery_code'
                     - 'recovery_code_expiry'
                     - 'recovery_attempts'
             WHERE id = $2`,
            [senhaHash, usuario.id]
        );

        res.json({ success: true, message: 'Senha alterada com sucesso!' });
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

        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });

        const googleUser = await userInfoResponse.json();

        if (!googleUser.email) {
            return res.status(400).json({ success: false, message: 'Não foi possível obter email do Google' });
        }

        let result = await query('SELECT * FROM usuarios WHERE email = $1', [googleUser.email]);

        if (result.rows.length === 0) {
            return res.status(403).json({
                success: false,
                message: 'Email não cadastrado no sistema.'
            });
        }

        const usuario = result.rows[0];

        if (usuario.status !== 'ativo') {
            return res.status(403).json({ success: false, message: 'Conta desativada. Entre em contato com o suporte.' });
        }

        if (!usuario.google_id) {
            await query('UPDATE usuarios SET google_id = $1 WHERE id = $2', [googleUser.id, usuario.id]);
        }

        const token = jwt.sign(
            { id: usuario.id, email: usuario.email, tipo: usuario.tipo },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
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
