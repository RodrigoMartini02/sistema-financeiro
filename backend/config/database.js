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
        'DATABASE_URL nÃ£o configurada. Este projeto estÃ¡ configurado para usar somente o PostgreSQL remoto.'
    );
}

const isLocalDatabase = (() => {
    try {
        const host = new URL(connectionString).hostname;
        return ['localhost', '127.0.0.1', '::1'].includes(host);
    } catch {
        return false;
    }
})();

const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: isLocalDatabase ? false : { rejectUnauthorized: false }
});

const DB_SCHEMA = process.env.DB_SCHEMA || 'public';

pool.on('connect', (client) => {
    client.query(`SET search_path TO ${DB_SCHEMA}, public`);
    client.query("SET timezone = 'America/Sao_Paulo'");
});

pool.on('error', (err) => {
    console.error('âŒ Erro inesperado no PostgreSQL:', err);
});

const testarConexao = async () => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT NOW()');
        client.release();
        console.log('âœ… PostgreSQL estÃ¡ funcionando:', result.rows[0].now);
        return true;
    } catch (error) {
        console.error('âŒ Erro ao conectar no PostgreSQL:', error.message);
        return false;
    }
};

// MigraÃ§Ã£o automÃ¡tica para adicionar colunas necessÃ¡rias
const executarMigracoes = async () => {
    try {
        console.log('ðŸ”„ Verificando migraÃ§Ãµes pendentes...');

        // Garantir coluna dados_financeiros na tabela usuarios (JSONB)
        await pool.query(`
            ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS dados_financeiros JSONB DEFAULT '{}'::jsonb
        `);
        console.log('âœ… Coluna dados_financeiros verificada em usuarios');

        // Adicionar coluna anexos na tabela despesas
        await pool.query(`
            ALTER TABLE despesas ADD COLUMN IF NOT EXISTS anexos JSONB DEFAULT NULL
        `);
        console.log('âœ… Coluna anexos verificada em despesas');

        // Adicionar coluna anexos na tabela receitas
        await pool.query(`
            ALTER TABLE receitas ADD COLUMN IF NOT EXISTS anexos JSONB DEFAULT NULL
        `);
        console.log('âœ… Coluna anexos verificada em receitas');

        // Adicionar colunas de objetivos/metas na tabela reservas
        await pool.query(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS tipo_reserva VARCHAR(50) DEFAULT 'normal'`);
        await pool.query(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS objetivo_valor DECIMAL(12,2)`);
        await pool.query(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS objetivo_atingido BOOLEAN DEFAULT FALSE`);
        await pool.query(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS data_objetivo DATE`);
        console.log('âœ… Colunas de metas/objetivos verificadas em reservas');

        // Adicionar colunas de personalizaÃ§Ã£o visual na tabela reservas
        await pool.query(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS cor VARCHAR(7) DEFAULT '#6366f1'`);
        await pool.query(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS icone VARCHAR(10) DEFAULT 'ðŸ’°'`);
        console.log('âœ… Colunas cor e icone verificadas em reservas');

        // Adicionar colunas de localizaÃ§Ã£o na tabela usuarios
        await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pais VARCHAR(100) DEFAULT NULL`);
        await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS estado VARCHAR(100) DEFAULT NULL`);
        await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cidade VARCHAR(100) DEFAULT NULL`);
        await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7) DEFAULT NULL`);
        await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7) DEFAULT NULL`);
        console.log('âœ… Colunas de localizaÃ§Ã£o verificadas em usuarios');

        // Criar Ã­ndices de performance (IF NOT EXISTS para idempotÃªncia)
        await Promise.all([
            pool.query(`CREATE INDEX IF NOT EXISTS idx_despesas_usuario_mes_ano ON despesas (usuario_id, mes, ano)`),
            pool.query(`CREATE INDEX IF NOT EXISTS idx_receitas_usuario_mes_ano ON receitas (usuario_id, mes, ano)`),
            pool.query(`CREATE INDEX IF NOT EXISTS idx_reservas_usuario_mes_ano ON reservas (usuario_id, mes, ano)`),
            pool.query(`CREATE INDEX IF NOT EXISTS idx_meses_usuario_ano_mes ON meses (usuario_id, ano, mes)`),
            pool.query(`CREATE INDEX IF NOT EXISTS idx_movimentacoes_reserva ON movimentacoes_reservas (reserva_id)`)
        ]);
        console.log('âœ… Ãndices de performance verificados');

        // ================================================================
        // ECOSSISTEMA PF/PJ â€” PERFIS
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
        console.log('âœ… Tabela perfis verificada/criada');

        // Adicionar perfil_id nas tabelas financeiras
        await pool.query(`ALTER TABLE despesas ADD COLUMN IF NOT EXISTS perfil_id INT REFERENCES perfis(id)`);
        await pool.query(`ALTER TABLE receitas ADD COLUMN IF NOT EXISTS perfil_id INT REFERENCES perfis(id)`);
        await pool.query(`ALTER TABLE meses ADD COLUMN IF NOT EXISTS perfil_id INT REFERENCES perfis(id)`);
        await pool.query(`ALTER TABLE reservas ADD COLUMN IF NOT EXISTS perfil_id INT REFERENCES perfis(id)`);
        await pool.query(`ALTER TABLE movimentacoes_reservas ADD COLUMN IF NOT EXISTS perfil_id INT REFERENCES perfis(id)`);
        await pool.query(`ALTER TABLE cartoes ADD COLUMN IF NOT EXISTS perfil_id INT REFERENCES perfis(id)`);
        console.log('âœ… Coluna perfil_id verificada nas tabelas financeiras');

        // Ãndices para perfis
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_perfis_usuario ON perfis(usuario_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_despesas_perfil ON despesas(perfil_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_receitas_perfil ON receitas(perfil_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_meses_perfil ON meses(perfil_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_reservas_perfil ON reservas(perfil_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_cartoes_perfil ON cartoes(perfil_id)`);
        console.log('âœ… Ãndices de perfis verificados');

        // Criar perfil pessoal padrÃ£o para usuÃ¡rios que ainda nÃ£o tÃªm um
        await pool.query(`
            INSERT INTO perfis (usuario_id, tipo, nome)
            SELECT id, 'pessoal', 'Pessoal'
            FROM usuarios
            WHERE id NOT IN (SELECT usuario_id FROM perfis WHERE tipo = 'pessoal')
        `);
        console.log('âœ… Perfis pessoais padrÃ£o criados para usuÃ¡rios existentes');

        // Expandir campos da tabela perfis (empresa)
        await pool.query(`ALTER TABLE perfis ADD COLUMN IF NOT EXISTS razao_social VARCHAR(150) DEFAULT NULL`);
        await pool.query(`ALTER TABLE perfis ADD COLUMN IF NOT EXISTS nome_fantasia VARCHAR(150) DEFAULT NULL`);
        await pool.query(`ALTER TABLE perfis ADD COLUMN IF NOT EXISTS atividade VARCHAR(200) DEFAULT NULL`);
        await pool.query(`ALTER TABLE perfis ADD COLUMN IF NOT EXISTS aporte_inicial DECIMAL(12,2) DEFAULT NULL`);
        await pool.query(`ALTER TABLE perfis ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7) DEFAULT NULL`);
        await pool.query(`ALTER TABLE perfis ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7) DEFAULT NULL`);
        console.log('âœ… Colunas expandidas de empresa verificadas em perfis');

        // Migrar constraint de meses para suportar estado por perfil
        // Remove a constraint antiga (usuario_id, ano, mes) e cria Ã­ndice Ãºnico funcional
        // usando COALESCE(perfil_id, 0) para tratar NULL como perfil "legado"
        await pool.query(`ALTER TABLE meses DROP CONSTRAINT IF EXISTS meses_usuario_id_ano_mes_key`);
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS meses_usuario_ano_mes_perfil_unique
            ON meses(usuario_id, ano, mes, COALESCE(perfil_id, 0))
        `);
        console.log('âœ… Constraint de meses migrada para suporte a perfis');

        // Limpar cartÃµes duplicados â€” manter apenas o de menor id por (usuario_id, LOWER(nome), COALESCE(perfil_id,0))
        await pool.query(`
            DELETE FROM cartoes
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM cartoes
                GROUP BY usuario_id, LOWER(nome), COALESCE(perfil_id, 0)
            )
        `);
        // Criar Ã­ndice Ãºnico para evitar duplicatas futuras
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_cartoes_usuario_nome_perfil_unique
            ON cartoes(usuario_id, LOWER(nome), COALESCE(perfil_id, 0))
        `);
        console.log('âœ… Duplicatas de cartÃµes removidas e constraint criada');;

        await pool.query(`
            CREATE TABLE IF NOT EXISTS ia_sessoes (
                usuario_id INT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
                historico JSONB DEFAULT '[]'::jsonb,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('âœ… Tabela ia_sessoes verificada/criada');

        // Adicionar coluna status em despesas e receitas
        await pool.query(`ALTER TABLE despesas ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ativa'`);
        await pool.query(`ALTER TABLE receitas ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ativa'`);
        console.log('âœ… Coluna status verificada em despesas e receitas');

        // Módulo de Clientes, Contratos e Receitas Previstas
        await pool.query(`
            CREATE TABLE IF NOT EXISTS clientes (
                id SERIAL PRIMARY KEY,
                usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
                nome VARCHAR(200) NOT NULL,
                codigo VARCHAR(50),
                tipo_empresa VARCHAR(50),
                cnpj VARCHAR(20),
                criado_em TIMESTAMP DEFAULT NOW()
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contratos (
                id SERIAL PRIMARY KEY,
                usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
                cliente_id INT REFERENCES clientes(id),
                numero VARCHAR(50),
                data_assinatura DATE,
                vencimento DATE NOT NULL,
                num_aditivo INT DEFAULT 0,
                data_aditivo DATE,
                ajuste VARCHAR(50) DEFAULT 'NADA CONSTA',
                status VARCHAR(20) DEFAULT 'ativo',
                data_inicio_faturamento DATE,
                observacoes TEXT,
                criado_em TIMESTAMP DEFAULT NOW()
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS modulos_contrato (
                id SERIAL PRIMARY KEY,
                contrato_id INT REFERENCES contratos(id) ON DELETE CASCADE,
                usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
                nome VARCHAR(200) NOT NULL,
                valor_mensal NUMERIC(12,2) NOT NULL DEFAULT 0,
                implantado BOOLEAN DEFAULT FALSE,
                faturando BOOLEAN DEFAULT FALSE,
                data_inicio_faturamento DATE
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS servicos_tecnicos_contrato (
                id SERIAL PRIMARY KEY,
                contrato_id INT REFERENCES contratos(id) ON DELETE CASCADE,
                usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
                tipo VARCHAR(50) NOT NULL,
                valor_hora NUMERIC(10,2) DEFAULT 0,
                qtde_contratada NUMERIC(10,2) DEFAULT 0,
                qtde_consumida NUMERIC(10,2) DEFAULT 0
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS consumo_horas (
                id SERIAL PRIMARY KEY,
                contrato_id INT REFERENCES contratos(id) ON DELETE CASCADE,
                usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
                tipo VARCHAR(50) NOT NULL,
                data DATE NOT NULL,
                qtde NUMERIC(10,2) NOT NULL,
                descricao TEXT,
                criado_em TIMESTAMP DEFAULT NOW()
            )
        `);
        await pool.query(`ALTER TABLE receitas ADD COLUMN IF NOT EXISTS contrato_id INT REFERENCES contratos(id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_contratos_usuario ON contratos(usuario_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_contratos_cliente ON contratos(cliente_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_modulos_contrato ON modulos_contrato(contrato_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_receitas_contrato ON receitas(contrato_id) WHERE contrato_id IS NOT NULL`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_receitas_status ON receitas(usuario_id, status)`);
        // Novas colunas de contrato: representante, implantação e horas técnicas
        await pool.query(`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS representante_id INT REFERENCES representantes(id)`);
        await pool.query(`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS implantacao_parcelas INT DEFAULT 1`);
        await pool.query(`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS implantacao_valor_parcela NUMERIC(12,2) DEFAULT 0`);
        await pool.query(`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS horas_presenciais_valor NUMERIC(12,2) DEFAULT 0`);
        await pool.query(`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS horas_presenciais_saldo_ini NUMERIC(10,2) DEFAULT 0`);
        await pool.query(`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS horas_presenciais_saldo_atual NUMERIC(10,2) DEFAULT 0`);
        await pool.query(`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS horas_remotas_valor NUMERIC(12,2) DEFAULT 0`);
        await pool.query(`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS horas_remotas_saldo_ini NUMERIC(10,2) DEFAULT 0`);
        await pool.query(`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS horas_remotas_saldo_atual NUMERIC(10,2) DEFAULT 0`);
        await pool.query(`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS valor_contrato NUMERIC(12,2) DEFAULT 0`);
        console.log('âœ… Tabelas de clientes/contratos verificadas/criadas');

        // Catálogo de serviços e vínculo contrato-serviço
        await pool.query(`
            CREATE TABLE IF NOT EXISTS servicos (
                id                  SERIAL PRIMARY KEY,
                usuario_id          INT REFERENCES usuarios(id) ON DELETE CASCADE,
                nome                VARCHAR(200) NOT NULL,
                valor_mensal_padrao NUMERIC(12,2) NOT NULL DEFAULT 0,
                ativo               BOOLEAN NOT NULL DEFAULT true,
                criado_em           TIMESTAMP DEFAULT NOW()
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS contratos_servicos (
                id                      SERIAL PRIMARY KEY,
                contrato_id             INT REFERENCES contratos(id) ON DELETE CASCADE,
                servico_id              INT REFERENCES servicos(id) ON DELETE RESTRICT,
                usuario_id              INT REFERENCES usuarios(id) ON DELETE CASCADE,
                valor_mensal            NUMERIC(12,2) NOT NULL DEFAULT 0,
                implantado              BOOLEAN NOT NULL DEFAULT false,
                faturando               BOOLEAN NOT NULL DEFAULT false,
                data_inicio_faturamento DATE,
                UNIQUE (contrato_id, servico_id)
            )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_servicos_usuario ON servicos(usuario_id)`);
        await pool.query(`CREATE INDEX IF NOT EXISTS idx_contratos_servicos_contrato ON contratos_servicos(contrato_id)`);
        console.log('âœ… Catálogo de serviços verificado/criado');

        console.log('âœ… MigraÃ§Ãµes concluÃ­das');
        return true;
    } catch (error) {
        console.error('âŒ Erro nas migraÃ§Ãµes:', error.message);
        return false;
    }
};

const query = async (text, params) => {
    try {
        return await pool.query(text, params);
    } catch (error) {
        console.error('âŒ Erro na query:', error.message);
        throw error;
    }
};

module.exports = {
    pool,
    query,
    testarConexao,
    executarMigracoes
};
