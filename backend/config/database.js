// ================================================================
// CONEXÃO COM POSTGRESQL
// ================================================================

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5433,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'sistema_financas',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    // ADICIONE ESTAS LINHAS ABAIXO:
    ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : false
});

// Teste de conexão
pool.on('connect', () => {
    console.log('✅ Conectado ao PostgreSQL');
});

pool.on('error', (err) => {
    console.error('❌ Erro inesperado no PostgreSQL:', err);
});

// Função para verificar conexão
const testarConexao = async () => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        console.log('✅ PostgreSQL está funcionando:', result.rows[0].now);
        return true;
    } catch (error) {
        console.error('❌ Erro ao conectar no PostgreSQL:', error.message);
        return false;
    }
};

// Query helper
const query = async (text, params) => {
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log(`✓ Query executada em ${duration}ms`);
        return result;
    } catch (error) {
        console.error('❌ Erro na query:', error.message);
        throw error;
    }
};

module.exports = {
    pool,
    query,
    testarConexao
};