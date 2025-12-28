// ================================================================
// MIDDLEWARE DE VALIDAÇÃO
// ================================================================

const { validationResult } = require('express-validator');

// Validar resultado das validações
const validate = (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Erro de validação',
            errors: errors.array().map(err => ({
                campo: err.path || err.param,
                mensagem: err.msg
            }))
        });
    }
    
    next();
};

// Validação de CPF
const validarCPF = (cpf) => {
    cpf = cpf.replace(/[^\d]+/g, '');
    
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
        return false;
    }
    
    let soma = 0;
    for (let i = 1; i <= 9; i++) {
        soma += parseInt(cpf.substring(i - 1, i)) * (11 - i);
    }
    
    let resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf.substring(9, 10))) return false;
    
    soma = 0;
    for (let i = 1; i <= 10; i++) {
        soma += parseInt(cpf.substring(i - 1, i)) * (12 - i);
    }
    
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf.substring(10, 11))) return false;
    
    return true;
};

// Validação de CNPJ
const validarCNPJ = (cnpj) => {
    cnpj = cnpj.replace(/[^\d]+/g, '');
    
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) {
        return false;
    }
    
    let tamanho = cnpj.length - 2;
    let numeros = cnpj.substring(0, tamanho);
    let digitos = cnpj.substring(tamanho);
    let soma = 0;
    let pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
        soma += numeros.charAt(tamanho - i) * pos--;
        if (pos < 2) pos = 9;
    }
    
    let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    if (resultado != digitos.charAt(0)) return false;
    
    tamanho++;
    numeros = cnpj.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
        soma += numeros.charAt(tamanho - i) * pos--;
        if (pos < 2) pos = 9;
    }
    
    resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    if (resultado != digitos.charAt(1)) return false;
    
    return true;
};

// Validação de documento (CPF ou CNPJ)
const validarDocumento = (documento) => {
    const doc = documento.replace(/[^\d]+/g, '');
    
    if (doc.length === 11) {
        return validarCPF(doc);
    } else if (doc.length === 14) {
        return validarCNPJ(doc);
    }
    
    return false;
};

// Middleware de limite de requisições
const rateLimiter = () => {
    const requests = new Map();
    const WINDOW_MS = 60 * 1000; // 1 minuto
    const MAX_REQUESTS = parseInt(process.env.REQUEST_LIMIT) || 100;

    return (req, res, next) => {
        const ip = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        
        if (!requests.has(ip)) {
            requests.set(ip, []);
        }
        
        const userRequests = requests.get(ip);
        
        // Limpar requisições antigas
        const recentRequests = userRequests.filter(timestamp => now - timestamp < WINDOW_MS);
        
        if (recentRequests.length >= MAX_REQUESTS) {
            return res.status(429).json({
                success: false,
                message: 'Muitas requisições. Tente novamente em alguns minutos.'
            });
        }
        
        recentRequests.push(now);
        requests.set(ip, recentRequests);
        
        next();
    };
};

module.exports = {
    validate,
    validarCPF,
    validarCNPJ,
    validarDocumento,
    rateLimiter
};