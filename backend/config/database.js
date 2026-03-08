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

pool.on('connect', (client) => {
    client.query("SET timezone = 'America/Sao_Paulo'");
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

// Migração automática para adicionar colunas necessárias
const executarMigracoes = async () => {
    try {
        console.log('🔄 Verificando migrações pendentes...');

        // Adicionar coluna anexos na tabela despesas
        await pool.query(`
            ALTER TABLE despesas ADD COLUMN IF NOT EXISTS anexos JSONB DEFAULT NULL
        `);
        console.log('✅ Coluna anexos verificada em despesas');

        // Adicionar coluna anexos na tabela receitas
        await pool.query(`
            ALTER TABLE receitas ADD COLUMN IF NOT EXISTS anexos JSONB DEFAULT NULL
        `);
        console.log('✅ Coluna anexos verificada em receitas');

        console.log('✅ Migrações concluídas');
        return true;
    } catch (error) {
        console.error('❌ Erro nas migrações:', error.message);
        return false;
    }
};

const query = async (text, params) => {
    try {
        return await pool.query(text, params);
    } catch (error) {
        console.error('❌ Erro na query:', error.message);
        throw error;
    }
};

module.exports = {
    pool,
    query,
    testarConexao,
    executarMigracoes
};