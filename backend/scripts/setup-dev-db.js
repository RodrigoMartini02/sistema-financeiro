#!/usr/bin/env node
// Cria o schema 'dev' no banco local. Rode: npm run dev:db-setup
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { Pool } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL;
if (!url) {
    console.error('❌ DATABASE_URL não encontrada em .env.dev');
    process.exit(1);
}

const isLocal = url.includes('localhost') || url.includes('127.0.0.1');

const pool = new Pool({
    connectionString: url,
    ssl: isLocal ? false : { rejectUnauthorized: false }
});

async function run() {
    const sql = fs.readFileSync(path.join(__dirname, '../config/dev-setup.sql'), 'utf8');
    const client = await pool.connect();
    try {
        console.log('🔄 Criando schema dev...');
        await client.query(sql);
        console.log('✅ Schema dev pronto!');
        console.log('ℹ️  Inicie o backend com: npm run dev:local');
    } finally {
        client.release();
        await pool.end();
    }
}

run().catch(err => {
    console.error('❌', err.message);
    process.exit(1);
});
