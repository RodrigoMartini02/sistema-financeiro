const { query } = require('./config/database');

async function fixParcelasVazias() {
    console.log('🔧 Corrigindo campos de parcelas vazios...\n');

    // 1. Corrigir despesas com (X/Y) na descrição
    const despesasComParcela = await query(`
        SELECT id, descricao, parcela_atual, numero_parcelas
        FROM despesas
        WHERE descricao ~ '\\(\\d+/\\d+\\)'
    `);

    console.log(`📋 Encontradas ${despesasComParcela.rows.length} despesas com (X/Y) na descrição\n`);

    let corrigidas = 0;
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

            console.log(`✅ ID ${d.id}: "${d.descricao}" → "${descricaoLimpa}" | ${parcelaAtual}/${numeroParcelas}`);
            corrigidas++;
        }
    }

    console.log(`\n✅ ${corrigidas} despesas corrigidas!`);

    // 2. Verificar inconsistências (parcelado=true mas sem numero_parcelas)
    const inconsistentes = await query(`
        SELECT id, descricao, parcelado, numero_parcelas, parcela_atual
        FROM despesas
        WHERE parcelado = true
        AND (numero_parcelas IS NULL OR parcela_atual IS NULL)
    `);

    if (inconsistentes.rows.length > 0) {
        console.log(`\n⚠️ Encontradas ${inconsistentes.rows.length} despesas marcadas como parceladas mas sem número de parcelas:`);
        for (const d of inconsistentes.rows) {
            console.log(`   ID ${d.id}: ${d.descricao} - parcelado=${d.parcelado}, numero_parcelas=${d.numero_parcelas}, parcela_atual=${d.parcela_atual}`);
        }

        // Marcar como não parceladas
        await query(`
            UPDATE despesas
            SET parcelado = false
            WHERE parcelado = true
            AND (numero_parcelas IS NULL OR parcela_atual IS NULL)
        `);
        console.log(`✅ ${inconsistentes.rows.length} despesas desmarcadas como parceladas`);
    }

    console.log('\n🎉 Correção concluída!');
    process.exit(0);
}

fixParcelasVazias().catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
});
