const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const path = require('path');
require('dotenv').config();

// ================================================================
// CONFIGURAÇÃO DO SERVIDOR
// ================================================================

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares de segurança
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false
}));

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: process.env.NODE_ENV === 'production' ? 100 : 1000,
    message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' }
});
app.use('/api/', limiter);

// Rate limiting específico para auth
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});

// ================================================================
// CONFIGURAÇÃO DO SQLITE
// ================================================================

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, 'sistema_financeiro.db'),
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    define: {
        timestamps: true,
        underscored: false,
        freezeTableName: true
    }
});

// ================================================================
// MODELOS DO BANCO DE DADOS
// ================================================================

// Modelo do Usuário
const Usuario = sequelize.define('Usuario', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    nome: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
            len: [2, 50],
            notEmpty: true
        }
    },
    email: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        validate: {
            isEmail: true,
            notEmpty: true
        }
    },
    documento: {
        type: DataTypes.STRING(14),
        allowNull: false,
        unique: true,
        validate: {
            is: /^[0-9]{11}$|^[0-9]{14}$/
        }
    },
    senha: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
            len: [6, 255]
        }
    },
    tipo: {
        type: DataTypes.ENUM('padrao', 'admin', 'master'),
        defaultValue: 'padrao'
    },
    status: {
        type: DataTypes.ENUM('ativo', 'inativo', 'bloqueado'),
        defaultValue: 'ativo'
    },
    configuracoes: {
        type: DataTypes.JSON,
        defaultValue: {
            tema: 'light',
            moeda: 'BRL',
            notificacoes: true
        }
    },
    ultimoLogin: {
        type: DataTypes.DATE
    },
    tentativasLogin: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    bloqueadoAte: {
        type: DataTypes.DATE
    }
});

// Modelo da Categoria
const Categoria = sequelize.define('Categoria', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    nome: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: {
            len: [1, 30],
            notEmpty: true
        }
    },
    usuarioId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Usuario,
            key: 'id'
        }
    },
    cor: {
        type: DataTypes.STRING(7),
        defaultValue: '#3498db'
    },
    icone: {
        type: DataTypes.STRING(50),
        defaultValue: 'fas fa-tag'
    }
});

// Modelo da Transação
const Transacao = sequelize.define('Transacao', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    usuarioId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Usuario,
            key: 'id'
        }
    },
    tipo: {
        type: DataTypes.ENUM('receita', 'despesa'),
        allowNull: false
    },
    descricao: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
            len: [1, 100],
            notEmpty: true
        }
    },
    valor: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: {
            min: 0.01
        }
    },
    valorPago: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    },
    categoriaId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Categoria,
            key: 'id'
        }
    },
    formaPagamento: {
        type: DataTypes.ENUM('pix', 'debito', 'credito', 'dinheiro', 'transferencia'),
        defaultValue: 'pix'
    },
    dataTransacao: {
        type: DataTypes.DATE,
        allowNull: false
    },
    dataVencimento: {
        type: DataTypes.DATE
    },
    status: {
        type: DataTypes.ENUM('pendente', 'pago', 'atrasado', 'cancelado'),
        defaultValue: 'pendente'
    },
    parcelamento: {
        type: DataTypes.JSON,
        defaultValue: {
            total: 1,
            atual: 1,
            grupoId: null
        }
    },
    observacoes: {
        type: DataTypes.TEXT
    },
    anexos: {
        type: DataTypes.JSON,
        defaultValue: []
    },
    mes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 0,
            max: 11
        }
    },
    ano: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 2000,
            max: 2100
        }
    }
});

// Modelo do Orçamento
const Orcamento = sequelize.define('Orcamento', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    usuarioId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Usuario,
            key: 'id'
        }
    },
    categoriaId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Categoria,
            key: 'id'
        }
    },
    valorLimite: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: {
            min: 0
        }
    },
    mes: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 0,
            max: 11
        }
    },
    ano: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    alertas: {
        type: DataTypes.JSON,
        defaultValue: {
            percentual50: false,
            percentual80: false,
            percentual100: false
        }
    }
});

// ================================================================
// RELACIONAMENTOS
// ================================================================

// Usuario -> Categorias
Usuario.hasMany(Categoria, { foreignKey: 'usuarioId', as: 'categorias' });
Categoria.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });

// Usuario -> Transacoes
Usuario.hasMany(Transacao, { foreignKey: 'usuarioId', as: 'transacoes' });
Transacao.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });

// Categoria -> Transacoes
Categoria.hasMany(Transacao, { foreignKey: 'categoriaId', as: 'transacoes' });
Transacao.belongsTo(Categoria, { foreignKey: 'categoriaId', as: 'categoria' });

// Usuario -> Orcamentos
Usuario.hasMany(Orcamento, { foreignKey: 'usuarioId', as: 'orcamentos' });
Orcamento.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });

// Categoria -> Orcamentos
Categoria.hasMany(Orcamento, { foreignKey: 'categoriaId', as: 'orcamentos' });
Orcamento.belongsTo(Categoria, { foreignKey: 'categoriaId', as: 'categoria' });

// Hook para hash da senha
Usuario.beforeCreate(async (usuario) => {
    if (usuario.senha) {
        usuario.senha = await bcrypt.hash(usuario.senha, 12);
    }
});

Usuario.beforeUpdate(async (usuario) => {
    if (usuario.changed('senha')) {
        usuario.senha = await bcrypt.hash(usuario.senha, 12);
    }
});

// ================================================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ================================================================

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'Token não fornecido' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key');
        const usuario = await Usuario.findByPk(decoded.id, {
            attributes: { exclude: ['senha'] }
        });
        
        if (!usuario) {
            return res.status(401).json({ error: 'Usuário não encontrado' });
        }

        if (usuario.status !== 'ativo') {
            return res.status(401).json({ error: 'Usuário inativo' });
        }

        req.usuario = usuario;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Token inválido' });
    }
};

// ================================================================
// ROTAS DE AUTENTICAÇÃO
// ================================================================

// Registro de usuário
app.post('/api/auth/register', [
    body('nome').isLength({ min: 2, max: 50 }).trim(),
    body('email').isEmail().normalizeEmail(),
    body('documento').matches(/^[0-9]{11}$|^[0-9]{14}$/),
    body('senha').isLength({ min: 6 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { nome, email, documento, senha } = req.body;

        // Verificar se usuário já existe
        const existeUsuario = await Usuario.findOne({
            where: {
                [Sequelize.Op.or]: [{ email }, { documento }]
            }
        });

        if (existeUsuario) {
            return res.status(400).json({ 
                error: 'Usuário já existe com este email ou documento' 
            });
        }

        // Criar usuário
        const novoUsuario = await Usuario.create({
            nome,
            email,
            documento,
            senha
        });

        // Criar categorias padrão
        const categoriasDefault = [
            'Alimentação', 'Transporte', 'Saúde', 'Lazer', 'Casa', 
            'Educação', 'Trabalho', 'Outros'
        ];

        for (const nomeCategoria of categoriasDefault) {
            await Categoria.create({
                nome: nomeCategoria,
                usuarioId: novoUsuario.id
            });
        }

        // Gerar token
        const token = jwt.sign(
            { id: novoUsuario.id },
            process.env.JWT_SECRET || 'fallback_secret_key',
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'Usuário criado com sucesso',
            token,
            usuario: {
                id: novoUsuario.id,
                nome: novoUsuario.nome,
                email: novoUsuario.email,
                tipo: novoUsuario.tipo
            }
        });

    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Login
app.post('/api/auth/login', authLimiter, [
    body('documento').matches(/^[0-9]{11}$|^[0-9]{14}$/),
    body('senha').isLength({ min: 1 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { documento, senha } = req.body;

        // Buscar usuário
        const usuario = await Usuario.findOne({ 
            where: { documento }
        });
        
        if (!usuario) {
            return res.status(400).json({ error: 'Credenciais inválidas' });
        }

        // Verificar se está bloqueado
        if (usuario.bloqueadoAte && usuario.bloqueadoAte > new Date()) {
            return res.status(423).json({ 
                error: 'Conta temporariamente bloqueada. Tente novamente mais tarde.' 
            });
        }

        // Verificar senha
        const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
        
        if (!senhaCorreta) {
            // Incrementar tentativas
            usuario.tentativasLogin += 1;
            
            if (usuario.tentativasLogin >= 5) {
                usuario.bloqueadoAte = new Date(Date.now() + 15 * 60 * 1000); // 15 min
            }
            
            await usuario.save();
            return res.status(400).json({ error: 'Credenciais inválidas' });
        }

        // Reset tentativas em caso de sucesso
        usuario.tentativasLogin = 0;
        usuario.bloqueadoAte = null;
        usuario.ultimoLogin = new Date();
        await usuario.save();

        // Gerar token
        const token = jwt.sign(
            { id: usuario.id },
            process.env.JWT_SECRET || 'fallback_secret_key',
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login realizado com sucesso',
            token,
            usuario: {
                id: usuario.id,
                nome: usuario.nome,
                email: usuario.email,
                tipo: usuario.tipo,
                configuracoes: usuario.configuracoes
            }
        });

    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Verificar token
app.get('/api/auth/me', authMiddleware, async (req, res) => {
    res.json({
        usuario: {
            id: req.usuario.id,
            nome: req.usuario.nome,
            email: req.usuario.email,
            documento: req.usuario.documento,
            tipo: req.usuario.tipo,
            configuracoes: req.usuario.configuracoes
        }
    });
});

// ================================================================
// ROTAS DE CATEGORIAS
// ================================================================

// Listar categorias do usuário
app.get('/api/categorias', authMiddleware, async (req, res) => {
    try {
        const categorias = await Categoria.findAll({
            where: { usuarioId: req.usuario.id },
            order: [['nome', 'ASC']]
        });
        
        res.json(categorias);
    } catch (error) {
        console.error('Erro ao buscar categorias:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Criar categoria
app.post('/api/categorias', authMiddleware, [
    body('nome').isLength({ min: 1, max: 30 }).trim()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { nome, cor, icone } = req.body;

        // Verificar se categoria já existe para este usuário
        const categoriaExiste = await Categoria.findOne({
            where: {
                nome: nome,
                usuarioId: req.usuario.id
            }
        });

        if (categoriaExiste) {
            return res.status(400).json({ error: 'Categoria já existe' });
        }

        const novaCategoria = await Categoria.create({
            nome,
            cor: cor || '#3498db',
            icone: icone || 'fas fa-tag',
            usuarioId: req.usuario.id
        });

        res.status(201).json(novaCategoria);

    } catch (error) {
        console.error('Erro ao criar categoria:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Atualizar categoria
app.put('/api/categorias/:id', authMiddleware, [
    body('nome').optional().isLength({ min: 1, max: 30 }).trim()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { nome, cor, icone } = req.body;

        const categoria = await Categoria.findOne({
            where: { id, usuarioId: req.usuario.id }
        });

        if (!categoria) {
            return res.status(404).json({ error: 'Categoria não encontrada' });
        }

        await categoria.update({
            nome: nome || categoria.nome,
            cor: cor || categoria.cor,
            icone: icone || categoria.icone
        });

        res.json(categoria);

    } catch (error) {
        console.error('Erro ao atualizar categoria:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Excluir categoria
app.delete('/api/categorias/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const categoria = await Categoria.findOne({
            where: { id, usuarioId: req.usuario.id }
        });

        if (!categoria) {
            return res.status(404).json({ error: 'Categoria não encontrada' });
        }

        // Verificar se há transações usando esta categoria
        const transacoesCount = await Transacao.count({
            where: { categoriaId: id, usuarioId: req.usuario.id }
        });

        if (transacoesCount > 0) {
            return res.status(400).json({ 
                error: 'Não é possível excluir categoria com transações vinculadas' 
            });
        }

        await categoria.destroy();
        res.json({ message: 'Categoria excluída com sucesso' });

    } catch (error) {
        console.error('Erro ao excluir categoria:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ================================================================
// ROTAS DE TRANSAÇÕES
// ================================================================

// Listar transações
app.get('/api/transacoes', authMiddleware, async (req, res) => {
    try {
        const { mes, ano, tipo, categoria, status, page = 1, limit = 50 } = req.query;
        
        const where = { usuarioId: req.usuario.id };
        
        if (mes !== undefined) where.mes = parseInt(mes);
        if (ano) where.ano = parseInt(ano);
        if (tipo) where.tipo = tipo;
        if (categoria) where.categoriaId = parseInt(categoria);
        if (status) where.status = status;

        const offset = (parseInt(page) - 1) * parseInt(limit);

        const { count, rows: transacoes } = await Transacao.findAndCountAll({
            where,
            include: [{
                model: Categoria,
                as: 'categoria',
                attributes: ['id', 'nome', 'cor', 'icone']
            }],
            order: [['dataTransacao', 'DESC'], ['createdAt', 'DESC']],
            limit: parseInt(limit),
            offset
        });

        res.json({
            transacoes,
            pagination: {
                total: count,
                page: parseInt(page),
                pages: Math.ceil(count / parseInt(limit)),
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Erro ao buscar transações:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Buscar transação por ID
app.get('/api/transacoes/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const transacao = await Transacao.findOne({
            where: { id, usuarioId: req.usuario.id },
            include: [{
                model: Categoria,
                as: 'categoria',
                attributes: ['id', 'nome', 'cor', 'icone']
            }]
        });

        if (!transacao) {
            return res.status(404).json({ error: 'Transação não encontrada' });
        }

        res.json(transacao);

    } catch (error) {
        console.error('Erro ao buscar transação:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Criar transação
app.post('/api/transacoes', authMiddleware, [
    body('tipo').isIn(['receita', 'despesa']),
    body('descricao').isLength({ min: 1, max: 100 }).trim(),
    body('valor').isFloat({ min: 0.01 }),
    body('categoriaId').isInt({ min: 1 }),
    body('dataTransacao').isISO8601()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const {
            tipo, descricao, valor, categoriaId, formaPagamento,
            dataTransacao, dataVencimento, status, observacoes,
            parcelamento
        } = req.body;

        // Verificar se categoria pertence ao usuário
        const categoria = await Categoria.findOne({
            where: { id: categoriaId, usuarioId: req.usuario.id }
        });

        if (!categoria) {
            return res.status(400).json({ error: 'Categoria não encontrada' });
        }

        const dataTransacaoObj = new Date(dataTransacao);
        const mes = dataTransacaoObj.getMonth();
        const ano = dataTransacaoObj.getFullYear();

        const novaTransacao = await Transacao.create({
            usuarioId: req.usuario.id,
            tipo,
            descricao,
            valor: parseFloat(valor),
            valorPago: tipo === 'receita' ? parseFloat(valor) : 0,
            categoriaId: parseInt(categoriaId),
            formaPagamento: formaPagamento || 'pix',
            dataTransacao: dataTransacaoObj,
            dataVencimento: dataVencimento ? new Date(dataVencimento) : null,
            status: status || (tipo === 'receita' ? 'pago' : 'pendente'),
            observacoes,
            parcelamento: parcelamento || { total: 1, atual: 1, grupoId: null },
            mes,
            ano
        });

        // Buscar transação criada com categoria
        const transacaoCompleta = await Transacao.findByPk(novaTransacao.id, {
            include: [{
                model: Categoria,
                as: 'categoria',
                attributes: ['id', 'nome', 'cor', 'icone']
            }]
        });

        res.status(201).json(transacaoCompleta);

    } catch (error) {
        console.error('Erro ao criar transação:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Atualizar transação
app.put('/api/transacoes/:id', authMiddleware, [
    body('tipo').optional().isIn(['receita', 'despesa']),
    body('descricao').optional().isLength({ min: 1, max: 100 }).trim(),
    body('valor').optional().isFloat({ min: 0.01 }),
    body('categoriaId').optional().isInt({ min: 1 }),
    body('dataTransacao').optional().isISO8601()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const updateData = req.body;

        const transacao = await Transacao.findOne({
            where: { id, usuarioId: req.usuario.id }
        });

        if (!transacao) {
            return res.status(404).json({ error: 'Transação não encontrada' });
        }

        // Se categoria foi alterada, verificar se pertence ao usuário
        if (updateData.categoriaId) {
            const categoria = await Categoria.findOne({
                where: { id: updateData.categoriaId, usuarioId: req.usuario.id }
            });

            if (!categoria) {
                return res.status(400).json({ error: 'Categoria não encontrada' });
            }
        }

        // Atualizar mes/ano se data foi alterada
        if (updateData.dataTransacao) {
            const dataTransacaoObj = new Date(updateData.dataTransacao);
            updateData.mes = dataTransacaoObj.getMonth();
            updateData.ano = dataTransacaoObj.getFullYear();
        }

        await transacao.update(updateData);

        // Buscar transação atualizada com categoria
        const transacaoAtualizada = await Transacao.findByPk(id, {
            include: [{
                model: Categoria,
                as: 'categoria',
                attributes: ['id', 'nome', 'cor', 'icone']
            }]
        });

        res.json(transacaoAtualizada);

    } catch (error) {
        console.error('Erro ao atualizar transação:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Excluir transação
app.delete('/api/transacoes/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const transacao = await Transacao.findOne({
            where: { id, usuarioId: req.usuario.id }
        });

        if (!transacao) {
            return res.status(404).json({ error: 'Transação não encontrada' });
        }

        await transacao.destroy();
        res.json({ message: 'Transação excluída com sucesso' });

    } catch (error) {
        console.error('Erro ao excluir transação:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Marcar transação como paga
app.patch('/api/transacoes/:id/pagar', authMiddleware, [
    body('valorPago').optional().isFloat({ min: 0 })
], async (req, res) => {
    try {
        const { id } = req.params;
        const { valorPago } = req.body;

        const transacao = await Transacao.findOne({
            where: { id, usuarioId: req.usuario.id }
        });

        if (!transacao) {
            return res.status(404).json({ error: 'Transação não encontrada' });
        }

        await transacao.update({
            status: 'pago',
            valorPago: valorPago !== undefined ? parseFloat(valorPago) : transacao.valor
        });

        res.json({ message: 'Transação marcada como paga', transacao });

    } catch (error) {
        console.error('Erro ao marcar transação como paga:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ================================================================
// ROTAS DE DASHBOARD
// ================================================================

// Dados do dashboard para um ano específico
app.get('/api/dashboard/:ano', authMiddleware, async (req, res) => {
    try {
        const { ano } = req.params;
        const anoInt = parseInt(ano);

        if (anoInt < 2000 || anoInt > 2100) {
            return res.status(400).json({ error: 'Ano inválido' });
        }

        // Buscar todas as transações do ano
        const transacoes = await Transacao.findAll({
            where: {
                usuarioId: req.usuario.id,
                ano: anoInt
            },
            include: [{
                model: Categoria,
                as: 'categoria',
                attributes: ['id', 'nome', 'cor', 'icone']
            }]
        });

        // Calcular resumo mensal
        const resumoMensal = [];
        for (let mes = 0; mes < 12; mes++) {
            const transacoesMes = transacoes.filter(t => t.mes === mes);
            
            const receitas = transacoesMes
                .filter(t => t.tipo === 'receita')
                .reduce((sum, t) => sum + parseFloat(t.valor), 0);
            
            const despesas = transacoesMes
                .filter(t => t.tipo === 'despesa')
                .reduce((sum, t) => sum + parseFloat(t.valor), 0);

            resumoMensal.push({
                mes,
                receitas,
                despesas,
                saldo: receitas - despesas,
                transacoes: transacoesMes.length
            });
        }

        // Calcular gastos por categoria
        const gastosPorCategoria = {};
        transacoes
            .filter(t => t.tipo === 'despesa')
            .forEach(transacao => {
                const catId = transacao.categoriaId;
                const catNome = transacao.categoria.nome;
                const catCor = transacao.categoria.cor;
                
                if (!gastosPorCategoria[catId]) {
                    gastosPorCategoria[catId] = {
                        id: catId,
                        nome: catNome,
                        cor: catCor,
                        valor: 0,
                        transacoes: 0
                    };
                }
                
                gastosPorCategoria[catId].valor += parseFloat(transacao.valor);
                gastosPorCategoria[catId].transacoes += 1;
            });

        // Converter para array e ordenar
        const categorias = Object.values(gastosPorCategoria)
            .sort((a, b) => b.valor - a.valor);

        // Calcular totais do ano
        const totalReceitas = transacoes
            .filter(t => t.tipo === 'receita')
            .reduce((sum, t) => sum + parseFloat(t.valor), 0);
        
        const totalDespesas = transacoes
            .filter(t => t.tipo === 'despesa')
            .reduce((sum, t) => sum + parseFloat(t.valor), 0);

        // Transações recentes (últimas 10)
        const transacoesRecentes = transacoes
            .sort((a, b) => new Date(b.dataTransacao) - new Date(a.dataTransacao))
            .slice(0, 10);

        // Contas pendentes
        const contasPendentes = transacoes
            .filter(t => t.status === 'pendente' && t.tipo === 'despesa')
            .sort((a, b) => new Date(a.dataVencimento || a.dataTransacao) - new Date(b.dataVencimento || b.dataTransacao));

        res.json({
            ano: anoInt,
            resumo: {
                totalReceitas,
                totalDespesas,
                saldoTotal: totalReceitas - totalDespesas,
                totalTransacoes: transacoes.length
            },
            resumoMensal,
            gastosPorCategoria: categorias,
            transacoesRecentes,
            contasPendentes: contasPendentes.slice(0, 5),
            estatisticas: {
                mediaMensalReceitas: totalReceitas / 12,
                mediaMensalDespesas: totalDespesas / 12,
                maiorReceita: Math.max(...transacoes.filter(t => t.tipo === 'receita').map(t => parseFloat(t.valor)), 0),
                maiorDespesa: Math.max(...transacoes.filter(t => t.tipo === 'despesa').map(t => parseFloat(t.valor)), 0)
            }
        });

    } catch (error) {
        console.error('Erro ao buscar dados do dashboard:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Resumo rápido (ano atual)
app.get('/api/dashboard/resumo', authMiddleware, async (req, res) => {
    try {
        const anoAtual = new Date().getFullYear();
        const mesAtual = new Date().getMonth();

        // Totais do mês atual
        const transacoesMesAtual = await Transacao.findAll({
            where: {
                usuarioId: req.usuario.id,
                ano: anoAtual,
                mes: mesAtual
            }
        });

        const receitasMes = transacoesMesAtual
            .filter(t => t.tipo === 'receita')
            .reduce((sum, t) => sum + parseFloat(t.valor), 0);

        const despesasMes = transacoesMesAtual
            .filter(t => t.tipo === 'despesa')
            .reduce((sum, t) => sum + parseFloat(t.valor), 0);

        // Contas pendentes do mês
        const contasPendentes = await Transacao.count({
            where: {
                usuarioId: req.usuario.id,
                status: 'pendente',
                tipo: 'despesa',
                mes: mesAtual,
                ano: anoAtual
            }
        });

        res.json({
            mesAtual: {
                receitas: receitasMes,
                despesas: despesasMes,
                saldo: receitasMes - despesasMes
            },
            contasPendentes
        });

    } catch (error) {
        console.error('Erro ao buscar resumo:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ================================================================
// ROTAS DE ORÇAMENTOS
// ================================================================

// Listar orçamentos
app.get('/api/orcamentos', authMiddleware, async (req, res) => {
    try {
        const { mes, ano } = req.query;
        const where = { usuarioId: req.usuario.id };
        
        if (mes !== undefined) where.mes = parseInt(mes);
        if (ano) where.ano = parseInt(ano);

        const orcamentos = await Orcamento.findAll({
            where,
            include: [{
                model: Categoria,
                as: 'categoria',
                attributes: ['id', 'nome', 'cor', 'icone']
            }],
            order: [['categoria', 'nome', 'ASC']]
        });

        // Calcular gastos realizados para cada orçamento
        const orcamentosComGastos = await Promise.all(
            orcamentos.map(async (orcamento) => {
                const gastoRealizado = await Transacao.sum('valor', {
                    where: {
                        usuarioId: req.usuario.id,
                        categoriaId: orcamento.categoriaId,
                        tipo: 'despesa',
                        mes: orcamento.mes,
                        ano: orcamento.ano
                    }
                }) || 0;

                const percentualUsado = (gastoRealizado / parseFloat(orcamento.valorLimite)) * 100;
                
                return {
                    ...orcamento.toJSON(),
                    gastoRealizado: parseFloat(gastoRealizado),
                    percentualUsado: Math.round(percentualUsado * 100) / 100,
                    saldoRestante: parseFloat(orcamento.valorLimite) - parseFloat(gastoRealizado),
                    status: percentualUsado >= 100 ? 'excedido' : 
                           percentualUsado >= 80 ? 'alerta' : 'normal'
                };
            })
        );

        res.json(orcamentosComGastos);

    } catch (error) {
        console.error('Erro ao buscar orçamentos:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Criar orçamento
app.post('/api/orcamentos', authMiddleware, [
    body('categoriaId').isInt({ min: 1 }),
    body('valorLimite').isFloat({ min: 0.01 }),
    body('mes').isInt({ min: 0, max: 11 }),
    body('ano').isInt({ min: 2000, max: 2100 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { categoriaId, valorLimite, mes, ano } = req.body;

        // Verificar se categoria pertence ao usuário
        const categoria = await Categoria.findOne({
            where: { id: categoriaId, usuarioId: req.usuario.id }
        });

        if (!categoria) {
            return res.status(400).json({ error: 'Categoria não encontrada' });
        }

        // Verificar se já existe orçamento para esta categoria/período
        const orcamentoExiste = await Orcamento.findOne({
            where: {
                usuarioId: req.usuario.id,
                categoriaId: parseInt(categoriaId),
                mes: parseInt(mes),
                ano: parseInt(ano)
            }
        });

        if (orcamentoExiste) {
            return res.status(400).json({ 
                error: 'Já existe orçamento para esta categoria neste período' 
            });
        }

        const novoOrcamento = await Orcamento.create({
            usuarioId: req.usuario.id,
            categoriaId: parseInt(categoriaId),
            valorLimite: parseFloat(valorLimite),
            mes: parseInt(mes),
            ano: parseInt(ano)
        });

        // Buscar orçamento criado com categoria
        const orcamentoCompleto = await Orcamento.findByPk(novoOrcamento.id, {
            include: [{
                model: Categoria,
                as: 'categoria',
                attributes: ['id', 'nome', 'cor', 'icone']
            }]
        });

        res.status(201).json(orcamentoCompleto);

    } catch (error) {
        console.error('Erro ao criar orçamento:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Atualizar orçamento
app.put('/api/orcamentos/:id', authMiddleware, [
    body('valorLimite').optional().isFloat({ min: 0.01 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const { valorLimite } = req.body;

        const orcamento = await Orcamento.findOne({
            where: { id, usuarioId: req.usuario.id }
        });

        if (!orcamento) {
            return res.status(404).json({ error: 'Orçamento não encontrado' });
        }

        await orcamento.update({
            valorLimite: valorLimite ? parseFloat(valorLimite) : orcamento.valorLimite
        });

        // Buscar orçamento atualizado com categoria
        const orcamentoAtualizado = await Orcamento.findByPk(id, {
            include: [{
                model: Categoria,
                as: 'categoria',
                attributes: ['id', 'nome', 'cor', 'icone']
            }]
        });

        res.json(orcamentoAtualizado);

    } catch (error) {
        console.error('Erro ao atualizar orçamento:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// Excluir orçamento
app.delete('/api/orcamentos/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;

        const orcamento = await Orcamento.findOne({
            where: { id, usuarioId: req.usuario.id }
        });

        if (!orcamento) {
            return res.status(404).json({ error: 'Orçamento não encontrado' });
        }

        await orcamento.destroy();
        res.json({ message: 'Orçamento excluído com sucesso' });

    } catch (error) {
        console.error('Erro ao excluir orçamento:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ================================================================
// ROTAS DE RELATÓRIOS
// ================================================================

// Relatório de gastos por período
app.get('/api/relatorios/gastos', authMiddleware, async (req, res) => {
    try {
        const { dataInicio, dataFim, categoriaId, tipo } = req.query;

        if (!dataInicio || !dataFim) {
            return res.status(400).json({ error: 'Data início e fim são obrigatórias' });
        }

        const where = {
            usuarioId: req.usuario.id,
            dataTransacao: {
                [Sequelize.Op.between]: [new Date(dataInicio), new Date(dataFim)]
            }
        };

        if (categoriaId) where.categoriaId = parseInt(categoriaId);
        if (tipo) where.tipo = tipo;

        const transacoes = await Transacao.findAll({
            where,
            include: [{
                model: Categoria,
                as: 'categoria',
                attributes: ['id', 'nome', 'cor', 'icone']
            }],
            order: [['dataTransacao', 'DESC']]
        });

        const resumo = {
            totalTransacoes: transacoes.length,
            totalReceitas: transacoes
                .filter(t => t.tipo === 'receita')
                .reduce((sum, t) => sum + parseFloat(t.valor), 0),
            totalDespesas: transacoes
                .filter(t => t.tipo === 'despesa')
                .reduce((sum, t) => sum + parseFloat(t.valor), 0)
        };

        resumo.saldoPeriodo = resumo.totalReceitas - resumo.totalDespesas;

        res.json({
            periodo: { dataInicio, dataFim },
            resumo,
            transacoes
        });

    } catch (error) {
        console.error('Erro ao gerar relatório:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

// ================================================================
// ROTAS DE SAÚDE E INFORMAÇÕES
// ================================================================

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: 'SQLite',
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Rota raiz
app.get('/', (req, res) => {
    res.json({
        message: '🚀 Sistema Financeiro API - SQLite',
        version: '1.0.0',
        status: 'running',
        database: 'SQLite',
        endpoints: {
            health: '/api/health',
            auth: '/api/auth',
            categorias: '/api/categorias',
            transacoes: '/api/transacoes',
            dashboard: '/api/dashboard',
            orcamentos: '/api/orcamentos',
            relatorios: '/api/relatorios'
        }
    });
});

// Rota 404
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});

// Error handler global
app.use((error, req, res, next) => {
    console.error('Erro não tratado:', error);
    res.status(500).json({ 
        error: 'Erro interno do servidor',
        ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
});

// ================================================================
// INICIALIZAÇÃO DO SERVIDOR
// ================================================================

const startServer = async () => {
    try {
        // Conectar ao SQLite e sincronizar tabelas
        await sequelize.authenticate();
        console.log('✅ SQLite conectado com sucesso');
        
        await sequelize.sync({ force: false }); // force: true recria as tabelas
        console.log('✅ Tabelas sincronizadas');
        
        app.listen(PORT, () => {
            console.log(`\n🚀 ====================================`);
            console.log(`💰 SISTEMA FINANCEIRO BACKEND v1.0`);
            console.log(`🚀 ====================================`);
            console.log(`🌍 Servidor: http://localhost:${PORT}`);
            console.log(`📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🗄️  Banco: SQLite (${path.join(__dirname, 'sistema_financeiro.db')})`);
            console.log(`🔐 JWT: Configurado`);
            console.log(`🛡️  Segurança: Helmet + CORS + Rate Limit`);
            console.log(`🚀 ====================================\n`);
            console.log(`📋 ENDPOINTS DISPONÍVEIS:`);
            console.log(`   🔐 Auth: /api/auth/[register|login|me]`);
            console.log(`   📂 Categorias: /api/categorias [GET|POST|PUT|DELETE]`);
            console.log(`   💰 Transações: /api/transacoes [GET|POST|PUT|DELETE]`);
            console.log(`   📊 Dashboard: /api/dashboard/:ano`);
            console.log(`   🎯 Orçamentos: /api/orcamentos [GET|POST|PUT|DELETE]`);
            console.log(`   📈 Relatórios: /api/relatorios/gastos`);
            console.log(`🚀 ====================================\n`);
        });
    } catch (error) {
        console.error('❌ Falha ao iniciar servidor:', error);
        process.exit(1);
    }
};

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM recebido. Parando servidor...');
    sequelize.close().then(() => {
        console.log('🔒 SQLite desconectado');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT recebido. Parando servidor...');
    sequelize.close().then(() => {
        console.log('🔒 SQLite desconectado');
        process.exit(0);
    });
});

// Iniciar servidor
startServer();