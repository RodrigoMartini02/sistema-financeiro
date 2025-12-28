// ================================================================
// MIDDLEWARE DE AUTENTICAÇÃO JWT
// ================================================================

const jwt = require('jsonwebtoken');

const authMiddleware = async (req, res, next) => {
    try {
        // Pegar token do header
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Acesso negado. Token não fornecido.'
            });
        }

        // Verificar token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Adicionar usuário na requisição
        req.usuario = {
            id: decoded.id,
            documento: decoded.documento,
            tipo: decoded.tipo
        };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Token inválido.'
            });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expirado. Faça login novamente.'
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Erro ao verificar autenticação.'
        });
    }
};

// Middleware opcional (não bloqueia se não tiver token)
const authOptional = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.usuario = {
                id: decoded.id,
                documento: decoded.documento,
                tipo: decoded.tipo
            };
        }

        next();
    } catch (error) {
        // Ignora erros e continua sem usuário autenticado
        next();
    }
};

// Verificar se é admin ou master
const isAdmin = (req, res, next) => {
    if (!req.usuario || (req.usuario.tipo !== 'admin' && req.usuario.tipo !== 'master')) {
        return res.status(403).json({
            success: false,
            message: 'Acesso negado. Apenas administradores.'
        });
    }
    next();
};

// Verificar se é master
const isMaster = (req, res, next) => {
    if (!req.usuario || req.usuario.tipo !== 'master') {
        return res.status(403).json({
            success: false,
            message: 'Acesso negado. Apenas usuário master.'
        });
    }
    next();
};

module.exports = {
    authMiddleware,
    authOptional,
    isAdmin,
    isMaster
};