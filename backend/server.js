const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { testarConexao } = require('./config/database');
const { rateLimiter } = require('./middleware/validation');

const app = express();
const PORT = process.env.PORT || 3100;

app.use(cors({
    origin: ['http://localhost:5500', 'http://127.0.0.1:5500'],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(rateLimiter());

app.use((req, res, next) => {
    console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
    next();
});

app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'API Sistema Financeiro está funcionando!',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

app.get('/health', async (req, res) => {
    const dbOk = await testarConexao();
    
    res.json({
        success: true,
        status: dbOk ? 'OK' : 'ERROR',
        database: dbOk ? 'Conectado' : 'Desconectado',
        timestamp: new Date().toISOString()
    });
});

const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const receitasRoutes = require('./routes/receitas');
const despesasRoutes = require('./routes/despesas');
const categoriasRoutes = require('./routes/categorias');
const cartoesRoutes = require('./routes/cartoes');
const mesesRoutes = require('./routes/meses');
const reservasRoutes = require('./routes/reservas');

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/receitas', receitasRoutes);
app.use('/api/despesas', despesasRoutes);
app.use('/api/categorias', categoriasRoutes);
app.use('/api/cartoes', cartoesRoutes);
app.use('/api/meses', mesesRoutes);
app.use('/api/reservas', reservasRoutes);

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Rota não encontrada'
    });
});

app.use((err, req, res, next) => {
    console.error('Erro não tratado:', err);
    
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Erro interno do servidor',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

const iniciarServidor = async () => {
    try {
        console.log('🔄 Testando conexão com PostgreSQL...');
        const dbOk = await testarConexao();
        
        if (!dbOk) {
            console.error('❌ Não foi possível conectar ao PostgreSQL!');
            console.error('Verifique se o PostgreSQL está rodando e as configurações no .env');
            process.exit(1);
        }
        
        app.listen(PORT, () => {
            console.log('================================================');
            console.log('🚀 SERVIDOR INICIADO COM SUCESSO!');
            console.log('================================================');
            console.log(`📡 Servidor rodando em: http://localhost:${PORT}`);
            console.log(`🗄️  Banco de dados: ${process.env.DB_NAME}`);
            console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
            console.log('================================================');
            console.log('📋 Rotas disponíveis:');
            console.log('   AUTH:');
            console.log('   - POST /api/auth/register');
            console.log('   - POST /api/auth/login');
            console.log('   USUÁRIOS:');
            console.log('   - GET  /api/usuarios/current');
            console.log('   RECEITAS:');
            console.log('   - GET    /api/receitas');
            console.log('   - POST   /api/receitas');
            console.log('   - PUT    /api/receitas/:id');
            console.log('   - DELETE /api/receitas/:id');
            console.log('   DESPESAS:');
            console.log('   - GET    /api/despesas');
            console.log('   - POST   /api/despesas');
            console.log('   - PUT    /api/despesas/:id');
            console.log('   - DELETE /api/despesas/:id');
            console.log('   - POST   /api/despesas/:id/pagar');
            console.log('   CATEGORIAS:');
            console.log('   - GET    /api/categorias');
            console.log('   - POST   /api/categorias');
            console.log('   - PUT    /api/categorias/:id');
            console.log('   - DELETE /api/categorias/:id');
            console.log('   CARTÕES:');
            console.log('   - GET /api/cartoes');
            console.log('   - PUT /api/cartoes');
            console.log('   MESES:');
            console.log('   - GET  /api/meses/:ano/:mes');
            console.log('   - POST /api/meses/:ano/:mes/fechar');
            console.log('   RESERVAS:');
            console.log('   - GET    /api/reservas');
            console.log('   - POST   /api/reservas');
            console.log('   - DELETE /api/reservas/:id');
            console.log('================================================');
        });
        
    } catch (error) {
        console.error('❌ Erro ao iniciar servidor:', error);
        process.exit(1);
    }
};

process.on('SIGTERM', () => {
    console.log('SIGTERM recebido. Encerrando servidor...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('\nSIGINT recebido. Encerrando servidor...');
    process.exit(0);
});

iniciarServidor();