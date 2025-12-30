const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { testarConexao } = require('./config/database');
const { rateLimiter } = require('./middleware/validation');

const app = express();
const PORT = process.env.PORT || 3010;

app.use(cors({
    origin: '*',
    credentials: false
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
        message: 'Rota não encontrada',
        path: req.path,
        method: req.method
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
            process.exit(1);
        }

        const { query } = require('./config/database'); 

        console.log('📦 Recriando estrutura do banco de dados...');

        // Dropar todas as tabelas (garante estrutura limpa)
        await query(`DROP TABLE IF EXISTS meses CASCADE;`);
        await query(`DROP TABLE IF EXISTS reservas CASCADE;`);
        await query(`DROP TABLE IF EXISTS despesas CASCADE;`);
        await query(`DROP TABLE IF EXISTS receitas CASCADE;`);
        await query(`DROP TABLE IF EXISTS cartoes CASCADE;`);
        await query(`DROP TABLE IF EXISTS categorias CASCADE;`);
        await query(`DROP TABLE IF EXISTS usuarios CASCADE;`);
        await query(`DROP VIEW IF EXISTS usuários;`);

        console.log('✅ Tabelas antigas removidas!');

        // TABELA USUARIOS
        await query(`
            CREATE TABLE usuarios (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                documento VARCHAR(20) UNIQUE NOT NULL,
                senha VARCHAR(255) NOT NULL,
                tipo VARCHAR(20) DEFAULT 'padrao' CHECK (tipo IN ('padrao', 'admin', 'master')),
                status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'bloqueado')),
                data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await query(`CREATE INDEX idx_usuarios_email ON usuarios(email);`);
        await query(`CREATE INDEX idx_usuarios_documento ON usuarios(documento);`);
        await query(`CREATE INDEX idx_usuarios_tipo ON usuarios(tipo);`);
        await query(`CREATE INDEX idx_usuarios_status ON usuarios(status);`);
        await query(`CREATE VIEW usuários AS SELECT * FROM usuarios;`);

        console.log('✅ Tabela usuarios criada!');

        // TABELA CATEGORIAS
        await query(`
            CREATE TABLE categorias (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                nome VARCHAR(255) NOT NULL,
                cor VARCHAR(7) DEFAULT '#3498db',
                icone VARCHAR(10),
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(usuario_id, nome)
            );
        `);

        console.log('✅ Tabela categorias criada!');

        // FUNÇÃO criar_categorias_padrao
        await query(`
            CREATE OR REPLACE FUNCTION criar_categorias_padrao(p_usuario_id INTEGER)
            RETURNS VOID AS $$
            BEGIN
                INSERT INTO categorias (usuario_id, nome, cor) VALUES
                    (p_usuario_id, 'Alimentação', '#FF6B6B'),
                    (p_usuario_id, 'Transporte', '#4ECDC4'),
                    (p_usuario_id, 'Moradia', '#45B7D1'),
                    (p_usuario_id, 'Saúde', '#96CEB4'),
                    (p_usuario_id, 'Educação', '#FFEAA7'),
                    (p_usuario_id, 'Lazer', '#DFE6E9'),
                    (p_usuario_id, 'Outros', '#B2BEC3')
                ON CONFLICT (usuario_id, nome) DO NOTHING;
            END;
            $$ LANGUAGE plpgsql;
        `);

        console.log('✅ Função criar_categorias_padrao criada!');

        // TABELA CARTOES
        await query(`
            CREATE TABLE cartoes (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                nome VARCHAR(255) NOT NULL,
                limite DECIMAL(10, 2) NOT NULL,
                dia_fechamento INTEGER NOT NULL CHECK (dia_fechamento BETWEEN 1 AND 31),
                dia_vencimento INTEGER NOT NULL CHECK (dia_vencimento BETWEEN 1 AND 31),
                cor VARCHAR(7) DEFAULT '#3498db',
                ativo BOOLEAN DEFAULT true,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('✅ Tabela cartoes criada!');

        // TABELA RECEITAS
        await query(`
            CREATE TABLE receitas (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                descricao VARCHAR(255) NOT NULL,
                valor DECIMAL(10, 2) NOT NULL,
                data_recebimento DATE NOT NULL,
                mes INTEGER NOT NULL CHECK (mes BETWEEN 0 AND 11),
                ano INTEGER NOT NULL,
                observacoes TEXT,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('✅ Tabela receitas criada!');

        // TABELA DESPESAS
        await query(`
            CREATE TABLE despesas (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                descricao VARCHAR(255) NOT NULL,
                valor DECIMAL(10, 2) NOT NULL,
                data_vencimento DATE NOT NULL,
                data_compra DATE,
                data_pagamento DATE,
                mes INTEGER NOT NULL CHECK (mes BETWEEN 0 AND 11),
                ano INTEGER NOT NULL,
                categoria_id INTEGER REFERENCES categorias(id),
                cartao_id INTEGER REFERENCES cartoes(id),
                forma_pagamento VARCHAR(50) DEFAULT 'dinheiro',
                parcelado BOOLEAN DEFAULT false,
                numero_parcelas INTEGER,
                parcela_atual INTEGER,
                grupo_parcelamento_id INTEGER,
                observacoes TEXT,
                pago BOOLEAN DEFAULT false,
                valor_pago DECIMAL(10, 2),
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('✅ Tabela despesas criada!');

        // TABELA RESERVAS
        await query(`
            CREATE TABLE reservas (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                valor DECIMAL(10, 2) NOT NULL,
                mes INTEGER NOT NULL CHECK (mes BETWEEN 0 AND 11),
                ano INTEGER NOT NULL,
                data DATE NOT NULL,
                observacoes TEXT,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('✅ Tabela reservas criada!');

        // TABELA MESES
        await query(`
            CREATE TABLE meses (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                ano INTEGER NOT NULL,
                mes INTEGER NOT NULL CHECK (mes BETWEEN 0 AND 11),
                fechado BOOLEAN DEFAULT false,
                saldo_anterior DECIMAL(10, 2) DEFAULT 0,
                saldo_final DECIMAL(10, 2) DEFAULT 0,
                data_fechamento TIMESTAMP,
                UNIQUE(usuario_id, ano, mes)
            );
        `);

        console.log('✅ Tabela meses criada!');
        console.log('✅ Estrutura do banco de dados criada com sucesso!');

        app.listen(PORT, () => {
            console.log('================================================');
            console.log('🚀 SERVIDOR INICIADO COM SUCESSO!');
            console.log(`📡 Servidor rodando na porta: ${PORT}`);
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

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

iniciarServidor();

module.exports = app;