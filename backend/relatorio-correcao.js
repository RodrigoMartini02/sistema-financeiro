const { query } = require('./config/database');

async function gerarRelatorio() {
    console.log('\n=== RELATÓRIO DE CORREÇÃO DE DADOS ===\n');

    // Estatísticas gerais
    const stats = await query(`
        SELECT
            COUNT(*) FILTER (WHERE parcelado = true AND parcela_atual IS NOT NULL) as parcelas_ok,
            COUNT(*) FILTER (WHERE descricao ~ '\\(\\d+/\\d+\\)') as desc_com_parcela,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE pago = true) as pagas,
            COUNT(*) FILTER (WHERE pago = false) as nao_pagas
        FROM despesas
        WHERE ano >= 2025
    `);

    const s = stats.rows[0];
    console.log('📊 ESTATÍSTICAS GERAIS:');
    console.log('   Total de despesas 2025+:', s.total);
    console.log('   Despesas pagas:', s.pagas);
    console.log('   Despesas não pagas:', s.nao_pagas);
    console.log('   Despesas com parcelas extraídas:', s.parcelas_ok);
    console.log('   Descrições ainda com (X/Y):', s.desc_com_parcela);
    console.log('\n');

    // Despesas parceladas
    const parcelas = await query(`
        SELECT
            descricao,
            COUNT(*) as qtd,
            MIN(parcela_atual) as primeira,
            MAX(parcela_atual) as ultima,
            MAX(numero_parcelas) as total_parcelas
        FROM despesas
        WHERE ano >= 2025 AND parcelado = true
        GROUP BY descricao
        ORDER BY descricao
    `);

    console.log('📦 DESPESAS PARCELADAS:');
    if (parcelas.rows.length === 0) {
        console.log('   Nenhuma despesa parcelada encontrada.');
    } else {
        parcelas.rows.forEach(p => {
            console.log(`   - ${p.descricao}: ${p.qtd} parcelas (de ${p.primeira} até ${p.ultima} de ${p.total_parcelas})`);
        });
    }

    // Status por período
    console.log('\n📅 STATUS POR PERÍODO:');
    const periodos = await query(`
        SELECT
            ano,
            mes,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE pago = true) as pagas,
            COUNT(*) FILTER (WHERE parcelado = true) as parceladas
        FROM despesas
        WHERE ano >= 2025
        GROUP BY ano, mes
        ORDER BY ano, mes
    `);

    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    periodos.rows.forEach(p => {
        console.log(`   ${meses[p.mes]}/${p.ano}: ${p.total} despesas | ${p.pagas} pagas | ${p.parceladas} parceladas`);
    });

    console.log('\n✅ Relatório concluído!\n');
    process.exit(0);
}

gerarRelatorio().catch(err => {
    console.error('❌ Erro:', err);
    process.exit(1);
});
