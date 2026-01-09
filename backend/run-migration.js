const { query } = require('./config/database');

async function runMigration() {
    try {
        console.log('🔧 Executando migration: adicionar numero_cartao...');

        await query(`
            ALTER TABLE cartoes
            ADD COLUMN IF NOT EXISTS numero_cartao INTEGER;
        `);
        console.log('✅ Coluna numero_cartao adicionada');

        await query(`
            CREATE INDEX IF NOT EXISTS idx_cartoes_numero_cartao
            ON cartoes(usuario_id, numero_cartao);
        `);
        console.log('✅ Índice criado');

        console.log('🎉 Migration concluída com sucesso!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Erro ao executar migration:', error);
        process.exit(1);
    }
}

runMigration();
