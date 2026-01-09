const { query } = require('./config/database');

async function runMigration() {
    try {
        console.log('🔧 Executando migration completa...');
        console.log('');

        // ================================================================
        // 1. TABELA CARTÕES - Adicionar numero_cartao
        // ================================================================
        console.log('📋 [1/3] Verificando tabela CARTÕES...');

        await query(`
            ALTER TABLE cartoes
            ADD COLUMN IF NOT EXISTS numero_cartao INTEGER;
        `);
        console.log('✅ Coluna numero_cartao adicionada/verificada');

        await query(`
            CREATE INDEX IF NOT EXISTS idx_cartoes_numero_cartao
            ON cartoes(usuario_id, numero_cartao);
        `);
        console.log('✅ Índice idx_cartoes_numero_cartao criado/verificado');

        // ================================================================
        // 2. TABELA DESPESAS - Adicionar campo numero
        // ================================================================
        console.log('');
        console.log('📋 [2/3] Verificando tabela DESPESAS...');

        await query(`
            ALTER TABLE despesas
            ADD COLUMN IF NOT EXISTS numero INTEGER;
        `);
        console.log('✅ Coluna numero adicionada/verificada');

        await query(`
            CREATE INDEX IF NOT EXISTS idx_despesas_numero
            ON despesas(usuario_id, numero);
        `);
        console.log('✅ Índice idx_despesas_numero criado/verificado');

        // ✅ Garantir que campos de juros existem
        await query(`
            ALTER TABLE despesas
            ADD COLUMN IF NOT EXISTS valor_original DECIMAL(10, 2);
        `);
        console.log('✅ Coluna valor_original verificada');

        await query(`
            ALTER TABLE despesas
            ADD COLUMN IF NOT EXISTS valor_total_com_juros DECIMAL(10, 2);
        `);
        console.log('✅ Coluna valor_total_com_juros verificada');

        await query(`
            ALTER TABLE despesas
            ADD COLUMN IF NOT EXISTS valor_pago DECIMAL(10, 2);
        `);
        console.log('✅ Coluna valor_pago verificada');

        // ================================================================
        // 3. VERIFICAR CONSTRAINTS E ÍNDICES
        // ================================================================
        console.log('');
        console.log('📋 [3/3] Verificando constraints e índices...');

        // Índice para performance em despesas
        await query(`
            CREATE INDEX IF NOT EXISTS idx_despesas_mes_ano
            ON despesas(usuario_id, ano, mes);
        `);
        console.log('✅ Índice idx_despesas_mes_ano criado/verificado');

        // Índice para performance em receitas
        await query(`
            CREATE INDEX IF NOT EXISTS idx_receitas_mes_ano
            ON receitas(usuario_id, ano, mes);
        `);
        console.log('✅ Índice idx_receitas_mes_ano criado/verificado');

        console.log('');
        console.log('🎉 Migration concluída com sucesso!');
        console.log('');
        console.log('✅ RESUMO:');
        console.log('   • Tabela cartões: campo numero_cartao adicionado');
        console.log('   • Tabela despesas: campo numero adicionado');
        console.log('   • Tabela despesas: campos de juros verificados');
        console.log('   • Índices de performance criados');
        console.log('');

        process.exit(0);

    } catch (error) {
        console.error('');
        console.error('❌ Erro ao executar migration:', error);
        console.error('');
        process.exit(1);
    }
}

runMigration();
