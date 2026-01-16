const { Pool, types } = require('pg');
require('dotenv').config();

// Configurar pg para retornar DATEs como strings (evita problemas de timezone)
// TYPE_ID 1082 = DATE
// TYPE_ID 1114 = TIMESTAMP WITHOUT TIME ZONE
// TYPE_ID 1184 = TIMESTAMP WITH TIME ZONE
types.setTypeParser(1082, val => val);
types.setTypeParser(1114, val => val);
types.setTypeParser(1184, val => val);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 
        `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: process.env.DATABASE_URL ? {
        rejectUnauthorized: false
    } : false
});

pool.on('connect', () => {
    console.log('✅ Conectado ao PostgreSQL');
});

pool.on('error', (err) => {
    console.error('❌ Erro inesperado no PostgreSQL:', err);
});

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