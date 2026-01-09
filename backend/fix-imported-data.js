const { query } = require('./config/database');

async function fixImportedData() {
    console.log('🔧 Iniciando correção de dados importados...\n');

    try {
        // 1. Extrair parcelas da descrição e limpar
        console.log('📋 Buscando despesas com parcelas na descrição...');
        const despesasComParcela = await query(`
            SELECT id, descricao, ano, mes
            FROM despesas
            WHERE ano >= 2025
            AND descricao ~ '\\(\\d+/\\d+\\)'
            ORDER BY ano, mes, descricao
        `);

        console.log(`   Encontradas: ${despesasComParcela.rows.length} despesas\n`);

        let parcelasCorrigidas = 0;
        for (const d of despesasComParcela.rows) {
            const match = d.descricao.match(/\((\d+)\/(\d+)\)/);
            if (match) {
                const parcelaAtual = parseInt(match[1]);
                const numeroParcelas = parseInt(match[2]);
                const descricaoLimpa = d.descricao.replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();

                await query(`
                    UPDATE despesas
                    SET descricao = $1,
                        parcela_atual = $2,
                        numero_parcelas = $3,
                        parcelado = true
                    WHERE id = $4
                `, [descricaoLimpa, parcelaAtual, numeroParcelas, d.id]);

                console.log(`   ✅ ID ${d.id}: "${d.descricao}" → "${descricaoLimpa}" | Parcela: ${parcelaAtual}/${numeroParcelas}`);
                parcelasCorrigidas++;
            }
        }

        console.log(`\n📊 Total de parcelas extraídas e limpas: ${parcelasCorrigidas}\n`);

        // 2. Marcar todas despesas de 2025 e Jan/2026 como pagas
        console.log('💰 Marcando despesas de 2025 e Janeiro/2026 como pagas...');
        const result = await query(`
            UPDATE despesas
            SET pago = true
            WHERE (ano = 2025 OR (ano = 2026 AND mes = 0))
            AND pago = false
            RETURNING id, descricao, ano, mes
        `);

        console.log(`   ✅ ${result.rows.length} despesas marcadas como pagas:`);
        result.rows.forEach(r => {
            const mesNome = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                           'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][r.mes];
            console.log(`      - ID ${r.id}: ${r.descricao} (${mesNome}/${r.ano})`);
        });

        // 3. Verificar resultado final
        console.log('\n📈 Verificando resultado final...');

        const verificacao = await query(`
            SELECT
                COUNT(*) FILTER (WHERE parcela_atual IS NOT NULL AND numero_parcelas IS NOT NULL) as com_parcelas,
                COUNT(*) FILTER (WHERE descricao ~ '\\(\\d+/\\d+\\)') as ainda_com_parcela_descricao,
                COUNT(*) FILTER (WHERE pago = true AND (ano = 2025 OR (ano = 2026 AND mes = 0))) as pagas_2025_jan2026,
                COUNT(*) FILTER (WHERE pago = false AND (ano = 2025 OR (ano = 2026 AND mes = 0))) as nao_pagas_2025_jan2026
            FROM despesas
            WHERE ano >= 2025
        `);

        const v = verificacao.rows[0];
        console.log(`\n✅ Despesas com parcela_atual e numero_parcelas preenchidos: ${v.com_parcelas}`);
        console.log(`✅ Despesas ainda com (X/Y) na descrição: ${v.ainda_com_parcela_descricao}`);
        console.log(`✅ Despesas pagas de 2025/Jan-2026: ${v.pagas_2025_jan2026}`);
        console.log(`⚠️  Despesas NÃO pagas de 2025/Jan-2026: ${v.nao_pagas_2025_jan2026}`);

        console.log('\n🎉 Correção concluída com sucesso!');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Erro durante a correção:', error.message);
        console.error(error);
        process.exit(1);
    }
}

// Executar
fixImportedData().catch(err => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
});
