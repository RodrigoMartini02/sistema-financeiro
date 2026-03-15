const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { testarConexao, executarMigracoes } = require('./config/database');
const { rateLimiter } = require('./middleware/validation');

const app = express();
const PORT = process.env.PORT || 3010;

// CORS - permitir todas as origens por enquanto (ajustar em produção se necessário)
app.use(cors({
    origin: true,
    credentials: true
}));

// Headers de Segurança
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// app.use(rateLimiter()); // Desativado temporariamente

if (process.env.NODE_ENV !== 'production') {
    app.use((req, res, next) => {
        console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
        next();
    });
}

app.get('/', (req, res) => {
    const packageJson = require('./package.json');
    res.json({
        success: true,
        message: 'API Sistema Financeiro está funcionando!',
        version: packageJson.version,
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

app.get('/version', (req, res) => {
    const packageJson = require('./package.json');
    res.json({
        success: true,
        version: packageJson.version,
        timestamp: new Date().toISOString()
    });
});

// Rotas da API
const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const receitasRoutes = require('./routes/receitas');
const despesasRoutes = require('./routes/despesas');
const categoriasRoutes = require('./routes/categorias');
const cartoesRoutes = require('./routes/cartoes');
const mesesRoutes = require('./routes/meses');
const reservasRoutes = require('./routes/reservas');
const anosRoutes = require('./routes/anos');
const planosRoutes = require('./routes/planos');
const aiRoutes = require('./routes/aiRoutes');
const avaliacoesRoutes = require('./routes/avaliacoes');

app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/receitas', receitasRoutes);
app.use('/api/despesas', despesasRoutes);
app.use('/api/categorias', categoriasRoutes);
app.use('/api/cartoes', cartoesRoutes);
app.use('/api/meses', mesesRoutes);
app.use('/api/reservas', reservasRoutes);
app.use('/api/anos', anosRoutes);
app.use('/api/planos', planosRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/avaliacoes', avaliacoesRoutes);

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

// ✅ FUNÇÃO SEGURA PARA CRIAR ESTRUTURA DO BANCO
async function criarEstruturaBanco() {
    const { query } = require('./config/database');
    
    try {
        console.log('📦 Verificando/criando estrutura do banco de dados...');

        // ⚠️ SÓ RECRIA TABELAS EM DESENVOLVIMENTO OU SE FORÇADO
        const forceRecreate = process.env.FORCE_RECREATE_TABLES === 'true';
        const isDev = process.env.NODE_ENV === 'development';
        
        if (forceRecreate && isDev) {
            console.log('🔄 Recriando tabelas (modo desenvolvimento)...');
            await query(`DROP TABLE IF EXISTS meses CASCADE;`);
            await query(`DROP TABLE IF EXISTS reservas CASCADE;`);
            await query(`DROP TABLE IF EXISTS despesas CASCADE;`);
            await query(`DROP TABLE IF EXISTS receitas CASCADE;`);
            await query(`DROP TABLE IF EXISTS cartoes CASCADE;`);
            await query(`DROP TABLE IF EXISTS categorias CASCADE;`);
            await query(`DROP TABLE IF EXISTS usuarios CASCADE;`);
            await query(`DROP TABLE IF EXISTS usuários CASCADE;`);
            console.log('✅ Tabelas antigas removidas (desenvolvimento)!');
        }

        // ✅ TABELA USUARIOS (CREATE IF NOT EXISTS - SEGURO!)
       await query(`
    CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        documento VARCHAR(20) UNIQUE NOT NULL,
        senha VARCHAR(255) NOT NULL,
        tipo VARCHAR(20) DEFAULT 'admin' CHECK (tipo IN ('padrao', 'admin', 'master')),
        status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'bloqueado')),
        dados_financeiros JSONB,
        categorias JSONB,
        cartoes JSONB,
        notificacoes JSONB,
        data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`);

        // Adicionar colunas JSONB se não existirem
        await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dados_financeiros JSONB DEFAULT NULL;`);
        await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS categorias JSONB DEFAULT NULL;`);
        await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cartoes JSONB DEFAULT NULL;`);
        await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto TEXT DEFAULT NULL;`);
        await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) DEFAULT NULL;`);
        await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS plano_status VARCHAR(20) DEFAULT 'trial' CHECK (plano_status IN ('trial', 'ativo', 'expirado'));`);
        await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS plano_tipo VARCHAR(10) DEFAULT NULL;`);
        await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS plano_expiracao TIMESTAMP DEFAULT NULL;`);
        await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS preapproval_id VARCHAR(100) DEFAULT NULL;`);
        await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS plano_inicio TIMESTAMP DEFAULT NULL;`);
        await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS payment_id_anual VARCHAR(100) DEFAULT NULL;`);

        // Índices para performance (só cria se não existir)
        await query(`CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);`);
        await query(`CREATE INDEX IF NOT EXISTS idx_usuarios_documento ON usuarios(documento);`);
        await query(`CREATE INDEX IF NOT EXISTS idx_usuarios_tipo ON usuarios(tipo);`);
        await query(`CREATE INDEX IF NOT EXISTS idx_usuarios_status ON usuarios(status);`);
        await query(`CREATE INDEX IF NOT EXISTS idx_usuarios_dados_financeiros ON usuarios USING GIN (dados_financeiros);`);
        await query(`CREATE INDEX IF NOT EXISTS idx_usuarios_categorias ON usuarios USING GIN (categorias);`);
        await query(`CREATE INDEX IF NOT EXISTS idx_usuarios_cartoes ON usuarios USING GIN (cartoes);`);

        // View compatibilidade
        await query(`CREATE OR REPLACE VIEW usuários AS SELECT * FROM usuarios;`);
        console.log('✅ Tabela usuarios verificada/criada!');

        // ✅ TABELA CATEGORIAS
        await query(`
            CREATE TABLE IF NOT EXISTS categorias (
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
        await query(`ALTER TABLE categorias ADD COLUMN IF NOT EXISTS forma_favorita VARCHAR(20) DEFAULT NULL;`);
        await query(`ALTER TABLE categorias ADD COLUMN IF NOT EXISTS cartao_favorito_id INTEGER DEFAULT NULL REFERENCES cartoes(id) ON DELETE SET NULL;`);
        console.log('✅ Tabela categorias verificada/criada!');

        // ✅ FUNÇÃO criar_categorias_padrao
        // Drop function first if it exists with different signature
        await query(`DROP FUNCTION IF EXISTS criar_categorias_padrao(integer);`);

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
        console.log('✅ Função criar_categorias_padrao verificada/criada!');

        // ✅ TABELA CARTOES
        await query(`
            CREATE TABLE IF NOT EXISTS cartoes (
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
        await query(`ALTER TABLE cartoes ADD COLUMN IF NOT EXISTS numero_cartao INTEGER DEFAULT NULL;`);
        await query(`ALTER TABLE cartoes ADD COLUMN IF NOT EXISTS bandeira VARCHAR(20) DEFAULT NULL;`);
        await query(`ALTER TABLE cartoes ADD COLUMN IF NOT EXISTS ultimos_digitos VARCHAR(4) DEFAULT NULL;`);
        await query(`ALTER TABLE cartoes ADD COLUMN IF NOT EXISTS validade VARCHAR(7) DEFAULT NULL;`);
        console.log('✅ Tabela cartoes verificada/criada!');

        // ✅ TABELA RECEITAS
        await query(`
            CREATE TABLE IF NOT EXISTS receitas (
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
        console.log('✅ Tabela receitas verificada/criada!');

        // ✅ TABELA DESPESAS
        await query(`
            CREATE TABLE IF NOT EXISTS despesas (
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

        // Adicionar colunas para cálculo de juros e economias (se não existirem)
        await query(`ALTER TABLE despesas ADD COLUMN IF NOT EXISTS valor_original DECIMAL(10, 2);`);
        await query(`ALTER TABLE despesas ADD COLUMN IF NOT EXISTS valor_total_com_juros DECIMAL(10, 2);`);
        await query(`ALTER TABLE despesas ADD COLUMN IF NOT EXISTS recorrente BOOLEAN DEFAULT false;`);
        await query(`ALTER TABLE despesas ADD COLUMN IF NOT EXISTS anexos JSONB;`);

        console.log('✅ Tabela despesas verificada/criada!');

        // ✅ TABELA RESERVAS
        await query(`
            CREATE TABLE IF NOT EXISTS reservas (
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
        console.log('✅ Tabela reservas verificada/criada!');

        // ✅ TABELA MOVIMENTAÇÕES DE RESERVAS
        await query(`
            CREATE TABLE IF NOT EXISTS movimentacoes_reservas (
                id SERIAL PRIMARY KEY,
                reserva_id INTEGER NOT NULL REFERENCES reservas(id) ON DELETE CASCADE,
                tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'saida')),
                valor DECIMAL(10, 2) NOT NULL,
                data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                observacoes TEXT
            );
        `);
        console.log('✅ Tabela movimentacoes_reservas verificada/criada!');

        // ✅ TABELA MESES
        await query(`
            CREATE TABLE IF NOT EXISTS meses (
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
        console.log('✅ Tabela meses verificada/criada!');

        // ✅ TABELA ANOS
        await query(`
            CREATE TABLE IF NOT EXISTS anos (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                ano INTEGER NOT NULL CHECK (ano BETWEEN 2000 AND 2100),
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(usuario_id, ano)
            );
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_anos_usuario_ano ON anos(usuario_id, ano);`);
        console.log('✅ Tabela anos verificada/criada!');

        // Indexes de performance para queries frequentes
        await query(`CREATE INDEX IF NOT EXISTS idx_despesas_usuario_mes_ano ON despesas(usuario_id, mes, ano);`);
        await query(`CREATE INDEX IF NOT EXISTS idx_receitas_usuario_mes_ano ON receitas(usuario_id, mes, ano);`);
        await query(`CREATE INDEX IF NOT EXISTS idx_reservas_usuario_mes_ano ON reservas(usuario_id, mes, ano);`);
        await query(`CREATE INDEX IF NOT EXISTS idx_categorias_usuario ON categorias(usuario_id);`);
        await query(`CREATE INDEX IF NOT EXISTS idx_cartoes_usuario ON cartoes(usuario_id);`);
        await query(`CREATE INDEX IF NOT EXISTS idx_meses_usuario_ano_mes ON meses(usuario_id, ano, mes);`);
        await query(`CREATE INDEX IF NOT EXISTS idx_despesas_grupo_parcelamento ON despesas(grupo_parcelamento_id);`);
        console.log('✅ Indexes de performance criados!');

        // ✅ TABELA APRENDIZADO_CATEGORIA (módulo IA)
        await query(`
            CREATE TABLE IF NOT EXISTS aprendizado_categoria (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                texto VARCHAR(100) NOT NULL,
                categoria VARCHAR(100) NOT NULL,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_aprendizado_usuario ON aprendizado_categoria(usuario_id);`);
        console.log('✅ Tabela aprendizado_categoria verificada/criada!');

        // ✅ TABELA RECORRENCIAS_IA (módulo IA)
        await query(`
            CREATE TABLE IF NOT EXISTS recorrencias_ia (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                descricao VARCHAR(255) NOT NULL,
                valor DECIMAL(10,2),
                dia_vencimento INTEGER CHECK (dia_vencimento BETWEEN 1 AND 31),
                frequencia VARCHAR(20) DEFAULT 'mensal',
                categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
                forma_pagamento VARCHAR(50) DEFAULT 'dinheiro',
                ativa BOOLEAN DEFAULT true,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(usuario_id, descricao)
            );
        `);
        await query(`CREATE INDEX IF NOT EXISTS idx_recorrencias_usuario ON recorrencias_ia(usuario_id);`);
        console.log('✅ Tabela recorrencias_ia verificada/criada!');

        // ✅ TABELA AVALIACOES
        await query(`
            CREATE TABLE IF NOT EXISTS avaliacoes (
                id SERIAL PRIMARY KEY,
                usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                autor VARCHAR(100) NOT NULL,
                estrelas INTEGER NOT NULL CHECK (estrelas BETWEEN 1 AND 5),
                comentario TEXT NOT NULL,
                aprovada BOOLEAN DEFAULT true,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(usuario_id)
            );
        `);
        await query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS avaliacao_feita BOOLEAN DEFAULT false;`);
        await query(`CREATE INDEX IF NOT EXISTS idx_avaliacoes_aprovada ON avaliacoes(aprovada);`);
        console.log('✅ Tabela avaliacoes verificada/criada!');

        // ✅ DIRETÓRIO DE UPLOADS (módulo IA)
        const uploadsDir = require('path').join(__dirname, 'uploads');
        if (!require('fs').existsSync(uploadsDir)) {
            require('fs').mkdirSync(uploadsDir, { recursive: true });
            console.log('✅ Diretório uploads criado!');
        }

        console.log('🎉 Estrutura do banco de dados está pronta!');
        return true;
        
    } catch (error) {
        console.error('❌ Erro ao criar estrutura do banco:', error);
        throw error;
    }
}

// ✅ FUNÇÃO PARA CRIAR/ATUALIZAR USUÁRIO MASTER
async function criarUsuarioMaster() {
    const bcrypt = require('bcryptjs');
    const { query } = require('./config/database');

    try {
        console.log('👤 Verificando usuário master...');

        // Usar variáveis de ambiente em vez de hardcoded
        const nome = process.env.MASTER_NOME;
        const documento = process.env.MASTER_DOCUMENTO;
        const email = process.env.MASTER_EMAIL;
        const senha = process.env.MASTER_SENHA;
        const tipo = 'master';
        const status = 'ativo';

        // Verificar se as variáveis estão configuradas
        if (!nome || !documento || !email || !senha) {
            console.log('⚠️ Variáveis de ambiente do usuário master não configuradas. Pulando criação.');
            return false;
        }

        // Verificar se usuário já existe
        const userExists = await query(
            'SELECT id, tipo FROM usuarios WHERE documento = $1',
            [documento]
        );

        if (userExists.rows.length > 0) {
            // Atualizar para master se não for
            if (userExists.rows[0].tipo !== 'master') {
                await query(
                    'UPDATE usuarios SET tipo = $1, nome = $2, email = $3, status = $4 WHERE documento = $5',
                    [tipo, nome, email, status, documento]
                );
                console.log('✅ Usuário atualizado para MASTER!');
            } else {
                console.log('✅ Usuário master já existe!');
            }
        } else {
            // Criar novo usuário master
            const senhaHash = await bcrypt.hash(senha, 10);
            await query(
                `INSERT INTO usuarios (nome, email, documento, senha, tipo, status)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [nome, email, documento, senhaHash, tipo, status]
            );
            console.log('✅ Usuário master criado com sucesso!');
        }

        return true;
    } catch (error) {
        console.error('❌ Erro ao criar/atualizar usuário master:', error);
        return false;
    }
}

// ✅ SEED: Migra carta de serviços do arquivo para o banco (one-time)
async function seedCartaServicos() {
    try {
        const fs = require('fs');
        const path = require('path');
        const { query } = require('./config/database');
        const CARTA_PATH = path.join(__dirname, '../docs/gen-instrucoes.md');
        if (!fs.existsSync(CARTA_PATH)) return;
        const r = await query(`SELECT dados_financeiros FROM usuarios WHERE tipo = 'master' LIMIT 1`);
        if (!r.rows[0]) return;
        if (r.rows[0].dados_financeiros?.carta_servicos) return; // já existe
        const conteudo = fs.readFileSync(CARTA_PATH, 'utf8');
        await query(
            `UPDATE usuarios SET dados_financeiros = COALESCE(dados_financeiros, '{}'::jsonb) || jsonb_build_object('carta_servicos', $1::text) WHERE tipo = 'master'`,
            [conteudo]
        );
        console.log('✅ Carta de Serviços migrada para o banco de dados');
    } catch (e) {
        console.error('⚠️ Seed carta falhou:', e.message);
    }
}

// ✅ FUNÇÃO PRINCIPAL DE INICIALIZAÇÃO
const iniciarServidor = async () => {
    try {
        console.log('🔄 Testando conexão com PostgreSQL...');
        const dbOk = await testarConexao();

        if (!dbOk) {
            console.error('❌ Não foi possível conectar ao PostgreSQL!');
            process.exit(1);
        }

        // ✅ Criar/verificar estrutura do banco
        await criarEstruturaBanco();

        // ✅ Executar migrações pendentes (adicionar colunas, etc)
        await executarMigracoes();

        // ✅ Criar/atualizar usuário master
        await criarUsuarioMaster();

        // ✅ Migrar carta de serviços para o banco (one-time seed)
        await seedCartaServicos();

        // ✅ Iniciar cron de cobranças (e-mails de vencimento)
        try {
            const { iniciarCronCobrancas } = require('./cron/cobrancas');
            iniciarCronCobrancas();
        } catch (cronError) {
            console.warn('⚠️ Cron de cobranças não iniciado (node-cron não instalado?):', cronError.message);
        }

        app.listen(PORT, () => {
            console.log('================================================');
            console.log('🚀 SERVIDOR INICIADO COM SUCESSO!');
            console.log(`📡 Servidor rodando na porta: ${PORT}`);
            console.log(`🗃️  Banco PostgreSQL: Conectado e funcionando!`);
            console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
            console.log('================================================');
        });
        
    } catch (error) {
        console.error('❌ Erro ao iniciar servidor:', error);
        process.exit(1);
    }
};

// ✅ TRATAMENTO DE SINAIS
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

// ✅ INICIALIZAR SERVIDOR
iniciarServidor();

module.exports = app;