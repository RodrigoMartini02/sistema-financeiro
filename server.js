const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false
}));

app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:5000', process.env.FRONTEND_URL],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('.'));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 100 : 1000,
    message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './sistema_financeiro.db',
    logging: false,
    define: {
        timestamps: true,
        underscored: false,
        freezeTableName: true
    }
});

const Usuario = sequelize.define('Usuario', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    nome: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
            len: [2, 100],
            notEmpty: true
        }
    },
    email: {
        type: DataTypes.STRING(150),
        allowNull: false,
        unique: true,
        validate: {
            isEmail: true,
            notEmpty: true
        }
    },
    documento: {
        type: DataTypes.STRING(20),
        allowNull: false,
        unique: true
    },
    senha: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    tipo: {
        type: DataTypes.ENUM('padrao', 'admin', 'master'),
        defaultValue: 'padrao'
    },
    status: {
        type: DataTypes.ENUM('ativo', 'inativo', 'bloqueado'),
        defaultValue: 'ativo'
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

const Categoria = sequelize.define('Categoria', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    nome: {
        type: DataTypes.STRING(50),
        allowNull: false
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
    },
    ativa: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
});

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
        type: DataTypes.STRING(200),
        allowNull: false
    },
    valor: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false
    },
    valorPago: {
        type: DataTypes.DECIMAL(12, 2),
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
    mes: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    ano: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    quitado: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    idOriginal: {
        type: DataTypes.STRING(50)
    }
});

Usuario.hasMany(Categoria, { foreignKey: 'usuarioId', as: 'categorias' });
Categoria.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });

Usuario.hasMany(Transacao, { foreignKey: 'usuarioId', as: 'transacoes' });
Transacao.belongsTo(Usuario, { foreignKey: 'usuarioId', as: 'usuario' });

Categoria.hasMany(Transacao, { foreignKey: 'categoriaId', as: 'transacoes' });
Transacao.belongsTo(Categoria, { foreignKey: 'categoriaId', as: 'categoria' });

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
        
        if (!usuario || usuario.status !== 'ativo') {
            return res.status(401).json({ error: 'Usuário inválido' });
        }

        req.usuario = usuario;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Token inválido' });
    }
};

app.post('/api/auth/login', authLimiter, [
    body('documento').notEmpty(),
    body('senha').isLength({ min: 1 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { documento, senha } = req.body;
        const documentoLimpo = documento.replace(/[^\d]+/g, '');

        const usuario = await Usuario.findOne({ 
            where: { documento: documentoLimpo }
        });
        
        if (!usuario) {
            return res.status(400).json({ error: 'Credenciais inválidas' });
        }

        if (usuario.bloqueadoAte && usuario.bloqueadoAte > new Date()) {
            return res.status(423).json({ 
                error: 'Conta temporariamente bloqueada. Tente novamente mais tarde.' 
            });
        }

        const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
        
        if (!senhaCorreta) {
            usuario.tentativasLogin += 1;
            
            if (usuario.tentativasLogin >= 5) {
                usuario.bloqueadoAte = new Date(Date.now() + 15 * 60 * 1000);
            }
            
            await usuario.save();
            return res.status(400).json({ error: 'Credenciais inválidas' });
        }

        usuario.tentativasLogin = 0;
        usuario.bloqueadoAte = null;
        usuario.ultimoLogin = new Date();
        await usuario.save();

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
                documento: usuario.documento,
                tipo: usuario.tipo,
                senha: senha
            }
        });

    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
    res.json({
        usuario: {
            id: req.usuario.id,
            nome: req.usuario.nome,
            email: req.usuario.email,
            documento: req.usuario.documento,
            tipo: req.usuario.tipo
        }
    });
});

app.get('/api/categorias', authMiddleware, async (req, res) => {
    try {
        const categorias = await Categoria.findAll({
            where: { usuarioId: req.usuario.id, ativa: true },
            order: [['nome', 'ASC']]
        });
        
        const categoriasFormatadas = {
            despesas: categorias.map(cat => cat.nome)
        };
        
        res.json(categoriasFormatadas);
    } catch (error) {
        console.error('Erro ao buscar categorias:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.post('/api/categorias', authMiddleware, [
    body('categoria').isLength({ min: 1, max: 50 }).trim()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { categoria } = req.body;

        const categoriaExiste = await Categoria.findOne({
            where: {
                nome: categoria,
                usuarioId: req.usuario.id
            }
        });

        if (categoriaExiste) {
            return res.status(400).json({ error: 'Categoria já existe' });
        }

        const novaCategoria = await Categoria.create({
            nome: categoria,
            usuarioId: req.usuario.id
        });

        res.status(201).json({ message: 'Categoria criada com sucesso', categoria: novaCategoria });

    } catch (error) {
        console.error('Erro ao criar categoria:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.get('/api/dados-financeiros', authMiddleware, async (req, res) => {
    try {
        const { ano } = req.query;
        let anosParaBuscar = [];
        
        if (ano) {
            anosParaBuscar = [parseInt(ano)];
        } else {
            const anoAtual = new Date().getFullYear();
            anosParaBuscar = [anoAtual - 1, anoAtual, anoAtual + 1];
        }

        const dadosFinanceiros = {};
        
        for (const anoAtual of anosParaBuscar) {
            dadosFinanceiros[anoAtual] = { meses: [] };
            
            for (let mes = 0; mes < 12; mes++) {
                dadosFinanceiros[anoAtual].meses[mes] = {
                    receitas: [],
                    despesas: [],
                    fechado: false,
                    saldoAnterior: 0,
                    saldoFinal: 0
                };
            }
            
            const transacoes = await Transacao.findAll({
                where: {
                    usuarioId: req.usuario.id,
                    ano: anoAtual
                },
                include: [{
                    model: Categoria,
                    as: 'categoria',
                    attributes: ['nome']
                }],
                order: [['dataTransacao', 'ASC']]
            });

            transacoes.forEach(transacao => {
                const mes = transacao.mes;
                if (mes >= 0 && mes < 12) {
                    const transacaoFormatada = {
                        id: transacao.idOriginal || transacao.id,
                        descricao: transacao.descricao,
                        valor: parseFloat(transacao.valor),
                        valorPago: parseFloat(transacao.valorPago || 0),
                        categoria: transacao.categoria?.nome || 'Outros',
                        formaPagamento: transacao.formaPagamento,
                        data: transacao.dataTransacao,
                        dataCompra: transacao.dataTransacao,
                        dataVencimento: transacao.dataVencimento,
                        status: transacao.quitado ? 'quitada' : (transacao.status === 'pago' ? 'quitada' : transacao.status),
                        quitado: transacao.quitado || transacao.status === 'pago',
                        parcelado: transacao.parcelamento?.total > 1,
                        parcela: transacao.parcelamento?.total > 1 ? 
                                 `${transacao.parcelamento.atual}/${transacao.parcelamento.total}` : null,
                        totalParcelas: transacao.parcelamento?.total || 1,
                        idGrupoParcelamento: transacao.parcelamento?.grupoId,
                        observacoes: transacao.observacoes,
                        dataCriacao: transacao.createdAt
                    };
                    
                    if (transacao.tipo === 'receita') {
                        dadosFinanceiros[anoAtual].meses[mes].receitas.push(transacaoFormatada);
                    } else {
                        dadosFinanceiros[anoAtual].meses[mes].despesas.push(transacaoFormatada);
                    }
                }
            });
        }

        res.json(dadosFinanceiros);

    } catch (error) {
        console.error('Erro ao buscar dados financeiros:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.post('/api/transacoes', authMiddleware, [
    body('tipo').isIn(['receita', 'despesa']),
    body('descricao').isLength({ min: 1, max: 200 }).trim(),
    body('valor').isFloat({ min: 0.01 }),
    body('mes').isInt({ min: 0, max: 11 }),
    body('ano').isInt({ min: 2000, max: 2100 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const {
            tipo, descricao, valor, categoria, formaPagamento,
            dataCompra, dataVencimento, mes, ano, parcelado,
            totalParcelas, idGrupoParcelamento, valorPago, id
        } = req.body;

        let categoriaId = null;
        
        if (categoria) {
            let categoriaObj = await Categoria.findOne({
                where: { nome: categoria, usuarioId: req.usuario.id }
            });

            if (!categoriaObj) {
                categoriaObj = await Categoria.create({
                    nome: categoria,
                    usuarioId: req.usuario.id
                });
            }
            categoriaId = categoriaObj.id;
        }

        const dataTransacaoObj = dataCompra ? new Date(dataCompra) : new Date();
        const isReceita = tipo === 'receita';

        const novaTransacao = await Transacao.create({
            usuarioId: req.usuario.id,
            tipo,
            descricao,
            valor: parseFloat(valor),
            valorPago: valorPago ? parseFloat(valorPago) : (isReceita ? parseFloat(valor) : 0),
            categoriaId,
            formaPagamento: formaPagamento || 'pix',
            dataTransacao: dataTransacaoObj,
            dataVencimento: dataVencimento ? new Date(dataVencimento) : null,
            status: isReceita ? 'pago' : 'pendente',
            quitado: isReceita,
            parcelamento: {
                total: totalParcelas || 1,
                atual: 1,
                grupoId: idGrupoParcelamento || null
            },
            mes: parseInt(mes),
            ano: parseInt(ano),
            idOriginal: id
        });

        res.status(201).json({
            message: 'Transação criada com sucesso',
            transacao: novaTransacao
        });

    } catch (error) {
        console.error('Erro ao criar transação:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.delete('/api/transacoes/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { opcao, descricaoReceita, categoriaDespesa, idGrupoParcelamento } = req.body;

        if (opcao === 'todas') {
            const whereClause = { usuarioId: req.usuario.id };
            
            if (idGrupoParcelamento) {
                whereClause['parcelamento.grupoId'] = idGrupoParcelamento;
            } else if (descricaoReceita || categoriaDespesa) {
                if (descricaoReceita) whereClause.descricao = descricaoReceita;
                if (categoriaDespesa) {
                    const categoria = await Categoria.findOne({
                        where: { nome: categoriaDespesa, usuarioId: req.usuario.id }
                    });
                    if (categoria) whereClause.categoriaId = categoria.id;
                }
            }

            await Transacao.destroy({ where: whereClause });
        } else {
            await Transacao.destroy({
                where: {
                    id: parseInt(id),
                    usuarioId: req.usuario.id
                }
            });
        }

        res.json({ message: 'Transação(ões) excluída(s) com sucesso' });

    } catch (error) {
        console.error('Erro ao excluir transação:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.get('/api/dashboard/:ano', authMiddleware, async (req, res) => {
    try {
        const { ano } = req.params;
        const anoInt = parseInt(ano);

        const transacoes = await Transacao.findAll({
            where: {
                usuarioId: req.usuario.id,
                ano: anoInt
            },
            include: [{
                model: Categoria,
                as: 'categoria',
                attributes: ['nome']
            }]
        });

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
                saldo: receitas - despesas
            });
        }

        const totalReceitas = transacoes
            .filter(t => t.tipo === 'receita')
            .reduce((sum, t) => sum + parseFloat(t.valor), 0);
        
        const totalDespesas = transacoes
            .filter(t => t.tipo === 'despesa')
            .reduce((sum, t) => sum + parseFloat(t.valor), 0);

        const totalJuros = transacoes
            .filter(t => t.tipo === 'despesa')
            .reduce((sum, t) => {
                const valorPago = parseFloat(t.valorPago || 0);
                const valor = parseFloat(t.valor);
                return sum + Math.max(0, valorPago - valor);
            }, 0);

        res.json({
            totalReceitas,
            totalDespesas,
            totalJuros,
            saldo: totalReceitas - totalDespesas,
            resumoMensal
        });

    } catch (error) {
        console.error('Erro ao buscar dashboard:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        database: 'SQLite',
        uptime: process.uptime()
    });
});

app.get('/', (req, res) => {
    res.json({
        message: 'Sistema Financeiro API',
        version: '1.0.0',
        status: 'running',
        database: 'SQLite'
    });
});

app.use('*', (req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});

app.use((error, req, res, next) => {
    console.error('Erro não tratado:', error);
    res.status(500).json({ 
        error: 'Erro interno do servidor'
    });
});

const garantirUsuarioMaster = async () => {
    const masterCPF = '08996441988';
    try {
        const usuarioMaster = await Usuario.findOne({ where: { documento: masterCPF } });
        if (!usuarioMaster) {
            await Usuario.create({
                nome: "Rodrigo Martini (Master)",
                email: "martini.rodrigo1992@gmail.com", 
                documento: masterCPF,
                senha: "qwe12345",
                tipo: "master",
                status: "ativo"
            });
            
            const categoriasDefault = [
                'Alimentação', 'Combustível', 'Educação', 'Lazer', 
                'Moradia', 'Outros', 'Saúde', 'Transporte'
            ];

            const usuarioCriado = await Usuario.findOne({ where: { documento: masterCPF } });
            for (const nomeCategoria of categoriasDefault) {
                await Categoria.create({
                    nome: nomeCategoria,
                    usuarioId: usuarioCriado.id
                });
            }
        }
    } catch (error) {
        console.error('Erro ao garantir usuário master:', error);
    }
};

const startServer = async () => {
    try {
        await sequelize.authenticate();
        await sequelize.sync({ force: false });
        await garantirUsuarioMaster();
        
        app.listen(PORT, () => {
            console.log(`Servidor rodando na porta ${PORT}`);
        });
    } catch (error) {
        console.error('Falha ao iniciar servidor:', error);
        process.exit(1);
    }
};

process.on('SIGTERM', () => {
    sequelize.close().then(() => process.exit(0));
});

process.on('SIGINT', () => {
    sequelize.close().then(() => process.exit(0));
});

startServer();