#!/usr/bin/env node
// Cria o schema 'dev' somente no banco local, com arquivo de ambiente escolhido explicitamente.
const path = require('path');
const envFile = process.env.DOTENV_CONFIG_PATH;
if (!envFile) {
    console.error('Defina DOTENV_CONFIG_PATH para o arquivo local antes de preparar o schema dev.');
    process.exit(1);
}
const environment = require('dotenv').config({ path: path.resolve(process.cwd(), envFile) });
if (environment.error) {
    console.error('Nao foi possivel carregar o arquivo indicado em DOTENV_CONFIG_PATH.');
    process.exit(1);
}

const { Pool } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('❌ DATABASE_URL não encontrada em .env.dev');
    process.exit(1);
}

let database;
try {
    database = new URL(url);
} catch {
    console.error('DATABASE_URL invalida para a preparacao local.');
    process.exit(1);
}
const isLocal = ['postgres:', 'postgresql:'].includes(database.protocol)
    && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(database.hostname);
if (!isLocal) {
    console.error('A preparacao do schema dev recusa bancos fora do localhost.');
    process.exit(1);
}

const pool = new Pool({
    connectionString: url,
    ssl: false
});

async function run() {
    const sql = fs.readFileSync(path.join(__dirname, '../config/dev-setup.sql'), 'utf8');
    const client = await pool.connect();
    try {
        console.log('🔄 Criando schema dev...');
        await client.query(sql);
        console.log('✅ Schema dev pronto!');
        console.log('ℹ️  Inicie a API de Finanças com: npm run dev');
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(err => {
    console.error('❌', err.message);
    process.exit(1);
});
