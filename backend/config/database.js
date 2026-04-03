const { Pool, types } = require('pg');
require('dotenv').config();

// Configurar pg para retornar DATEs como strings (evita problemas de timezone)
// TYPE_ID 1082 = DATE
// TYPE_ID 1114 = TIMESTAMP WITHOUT TIME ZONE
// TYPE_ID 1184 = TIMESTAMP WITH TIME ZONE
types.setTypeParser(1082, val => val);
types.setTypeParser(1114, val => val);
types.setTypeParser(1184, val => val);

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error(
        'DATABASE_URL não configurada. Este projeto está configurado para usar somente o PostgreSQL remoto.'
    );
}

const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: {
        rejectUnauthorized: false
    }
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

        // Garantir coluna dados_financeiros na tabela usuarios (JSONB)
        await pool.query(`
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dados_financeiros JSONB DEFAULT '{}'::jsonb
        `);
        console.log('✅ Coluna dados_financeiros verificada em usuarios');

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

        // Adicionar colunas de objetivos/metas na tabela reservas
        await pool.query(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS tipo_reserva VARCHAR(50) DEFAULT 'normal'`);
        await pool.query(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS objetivo_valor DECIMAL(12,2)`);
        await pool.query(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS objetivo_atingido BOOLEAN DEFAULT FALSE`);
        await pool.query(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS data_objetivo DATE`);
        console.log('✅ Colunas de metas/objetivos verificadas em reservas');

        // Adicionar colunas de localização na tabela usuarios
        await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pais VARCHAR(100) DEFAULT NULL`);
        await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS estado VARCHAR(100) DEFAULT NULL`);
        await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cidade VARCHAR(100) DEFAULT NULL`);
        await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7) DEFAULT NULL`);
        await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7) DEFAULT NULL`);
        console.log('✅ Colunas de localização verificadas em usuarios');

        // Criar índices de performance (IF NOT EXISTS para idempotência)
        await Promise.all([
            pool.query(`CREATE INDEX IF NOT EXISTS idx_despesas_usuario_mes_ano ON despesas (usuario_id, mes, ano)`),
            pool.query(`CREATE INDEX IF NOT EXISTS idx_receitas_usuario_mes_ano ON receitas (usuario_id, mes, ano)`),
            pool.query(`CREATE INDEX IF NOT EXISTS idx_reservas_usuario_mes_ano ON reservas (usuario_id, mes, ano)`),
            pool.query(`CREATE INDEX IF NOT EXISTS idx_meses_usuario_ano_mes ON meses (usuario_id, ano, mes)`),
            pool.query(`CREATE INDEX IF NOT EXISTS idx_movimentacoes_reserva ON movimentacoes_reservas (reserva_id)`)
        ]);
        console.log('✅ Índices de performance verificados');

        // ================================================================
        // ECOSSISTEMA PF/PJ — PERFIS
        // ================================================================

        // Criar tabela perfis
        await pool.query(`
            CREATE TABLE IF NOT EXISTS perfis (
                id SERIAL PRIMARY KEY,
                usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
                tipo VARCHAR(10) NOT NULL DEFAULT 'pessoal',
                nome VARCHAR(100) NOT NULL,
                documento VARCHAR(20) DEFAULT NULL,
                ativo BOOLEAN DEFAULT true,
                data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabela perfis verificada/criada');

        // Adicionar perfil_id nas tabelas financeiras
        await pool.query(`ALTER TABLE despesas ADD COLUMN IF NOT EXISTS perfil_id INT REFERENCES perfis(id)`);
        await pool.query(`ALTER TABLE receitas ADD COLUMN IF NOT EXISTS perfil_id INT REFERENCES perfis(id)`);
        await pool.query(`ALTER TABLE meses ADD COLUMN IF NOT EXISTS perfil_id INT REFERENCES perfis(id)`);
        await pool.query(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS perfil_id INT REFERENCES perfis(id)`);
        await pool.query(`ALTER TABLE movimentacoes_reservas ADD COLUMN IF NOT EXISTS perfil_id INT REFERENCES perfis(id)`);
        await pool.query(`ALTER TABLE cartoes ADD COLUMN IF NOT EXISTS perfil_id INT REFERENCES perfis(id)`);
        console.log('✅ Coluna perfil_id verificada nas tabelas financeiras');

        // Índices para perfis
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_perfis_usuario ON perfis(usuario_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_despesas_perfil ON despesas(perfil_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_receitas_perfil ON receitas(perfil_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_meses_perfil ON meses(perfil_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_reservas_perfil ON reservas(perfil_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_cartoes_perfil ON cartoes(perfil_id)`);
        console.log('✅ Índices de perfis verificados');

        // Criar perfil pessoal padrão para usuários que ainda não têm um
        await pool.query(`
            INSERT INTO perfis (usuario_id, tipo, nome)
            SELECT id, 'pessoal', 'Pessoal'
            FROM usuarios
            WHERE id NOT IN (SELECT usuario_id FROM perfis WHERE tipo = 'pessoal')
        `);
        console.log('✅ Perfis pessoais padrão criados para usuários existentes');

        // Expandir campos da tabela perfis (empresa)
        await pool.query(`ALTER TABLE perfis ADD COLUMN IF NOT EXISTS razao_social VARCHAR(150) DEFAULT NULL`);
        await pool.query(`ALTER TABLE perfis ADD COLUMN IF NOT EXISTS nome_fantasia VARCHAR(150) DEFAULT NULL`);
        await pool.query(`ALTER TABLE perfis ADD COLUMN IF NOT EXISTS atividade VARCHAR(200) DEFAULT NULL`);
        await pool.query(`ALTER TABLE perfis ADD COLUMN IF NOT EXISTS aporte_inicial DECIMAL(12,2) DEFAULT NULL`);
        await pool.query(`ALTER TABLE perfis ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7) DEFAULT NULL`);
        await pool.query(`ALTER TABLE perfis ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7) DEFAULT NULL`);
        console.log('✅ Colunas expandidas de empresa verificadas em perfis');

        // Migrar constraint de meses para suportar estado por perfil
        // Remove a constraint antiga (usuario_id, ano, mes) e cria índice único funcional
        // usando COALESCE(perfil_id, 0) para tratar NULL como perfil "legado"
        await pool.query(`ALTER TABLE meses DROP CONSTRAINT IF EXISTS meses_usuario_id_ano_mes_key`);
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS meses_usuario_ano_mes_perfil_unique
            ON meses(usuario_id, ano, mes, COALESCE(perfil_id, 0))
        `);
        console.log('✅ Constraint de meses migrada para suporte a perfis');

        // Limpar cartões duplicados — manter apenas o de menor id por (usuario_id, LOWER(nome), COALESCE(perfil_id,0))
        await pool.query(`
            DELETE FROM cartoes
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM cartoes
                GROUP BY usuario_id, LOWER(nome), COALESCE(perfil_id, 0)
            )
        `);
        // Criar índice único para evitar duplicatas futuras
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_cartoes_usuario_nome_perfil_unique
            ON cartoes(usuario_id, LOWER(nome), COALESCE(perfil_id, 0))
        `);
        console.log('✅ Duplicatas de cartões removidas e constraint criada');;

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
