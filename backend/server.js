// ================================================================
// SERVIDOR PRINCIPAL - SISTEMA FINANCEIRO
// ================================================================

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { testarConexao } = require('./config/database');
const { rateLimiter } = require('./middleware/validation');

// ================================================================
// CONFIGURAÇÃO DO SERVIDOR
// ================================================================

const app = express();
const PORT = process.env.PORT || 3000;

// ================================================================
// MIDDLEWARES GLOBAIS
// ================================================================

// CORS
app.use(cors({
    origin: ['http://localhost:5500', 'http://127.0.0.1:5500'],
    credentials: true
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiter
app.use(rateLimiter());

// Log de requisições
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
    next();
});

// ================================================================
// ROTAS
// ================================================================

// Rota de teste
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'API Sistema Financeiro está funcionando!',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

// Rota de health check
app.get('/health', async (req, res) => {
    const dbOk = await testarConexao();
    
    res.json({
        success: true,
        status: dbOk ? 'OK' : 'ERROR',
        database: dbOk ? 'Conectado' : 'Desconectado',
        timestamp: new Date().toISOString()
    });
});

// Importar rotas
const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
// const receitasRoutes = require('./routes/receitas');
// const despesasRoutes = require('./routes/despesas');
// const categoriasRoutes = require('./routes/categorias');
// const cartoesRoutes = require('./routes/cartoes');
// const mesesRoutes = require('./routes/meses');
// const reservasRoutes = require('./routes/reservas');

// Registrar rotas
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
// app.use('/api/receitas', receitasRoutes);
// app.use('/api/despesas', despesasRoutes);
// app.use('/api/categorias', categoriasRoutes);
// app.use('/api/cartoes', cartoesRoutes);
// app.use('/api/meses', mesesRoutes);
// app.use('/api/reservas', reservasRoutes);

// ================================================================
// TRATAMENTO DE ERROS
// ================================================================

// Rota não encontrada
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Rota não encontrada'
    });
});

// Error handler global
app.use((err, req, res, next) => {
    console.error('Erro não tratado:', err);
    
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Erro interno do servidor',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// ================================================================
// INICIALIZAÇÃO DO SERVIDOR
// ================================================================

const iniciarServidor = async () => {
    try {
        // Testar conexão com banco
        console.log('🔄 Testando conexão com PostgreSQL...');
        const dbOk = await testarConexao();
        
        if (!dbOk) {
            console.error('❌ Não foi possível conectar ao PostgreSQL!');
            console.error('Verifique se o PostgreSQL está rodando e as configurações no .env');
            process.exit(1);
        }
        
        // Iniciar servidor
        app.listen(PORT, () => {
            console.log('================================================');
            console.log('🚀 SERVIDOR INICIADO COM SUCESSO!');
            console.log('================================================');
            console.log(`📡 Servidor rodando em: http://localhost:${PORT}`);
            console.log(`🗄️  Banco de dados: ${process.env.DB_NAME}`);
            console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
            console.log('================================================');
        });
        
    } catch (error) {
        console.error('❌ Erro ao iniciar servidor:', error);
        process.exit(1);
    }
};

// ================================================================
// TRATAMENTO DE SINAIS
// ================================================================

process.on('SIGTERM', () => {
    console.log('SIGTERM recebido. Encerrando servidor...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\nSIGINT recebido. Encerrando servidor...');
    process.exit(0);
});

// ================================================================
// INICIAR
// ================================================================

iniciarServidor();
