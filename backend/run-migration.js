const fs = require('fs');
const path = require('path');
const { query } = require('./config/database');

async function importarDespesas() {
    try {
        console.log('📥 Iniciando importação de despesas...');

        // ===== Ajuste o caminho do arquivo se necessário =====
        const arquivo = path.resolve(__dirname, 'backup_financeiro.json');

        if (!fs.existsSync(arquivo)) {
            throw new Error('Arquivo de backup não encontrado');
        }

        const conteudo = fs.readFileSync(arquivo, 'utf8');
        const backup = JSON.parse(conteudo);

        if (!backup.despesas || !Array.isArray(backup.despesas)) {
            throw new Error('Nenhuma despesa encontrada no backup');
        }

        for (const despesa of backup.despesas) {

            // ===== Validação mínima obrigatória =====
            if (!despesa.descricao || !despesa.valor || !despesa.status) {
                console.warn('⚠️ Despesa ignorada por dados incompletos:', despesa);
                continue;
            }

            // ===== Fallback seguro de datas =====
            const dataCompra = despesa.compra || null;
            const dataVencimento = despesa.vencimento || dataCompra;
            const dataPagamento =
                despesa.pagamento ||
                despesa.vencimento ||
                despesa.compra ||
                null;

            // ===== Inserção =====
            await query(`
                INSERT INTO despesas (
                    usuario_id,
                    descricao,
                    categoria,
                    metodo_pagamento,
                    valor,
                    valor_pago,
                    status,
                    data_compra,
                    data_vencimento,
                    data_pagamento,
                    created_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()
                )
            `, [
                backup.usuario_id,          // deve existir no backup
                despesa.descricao,
                despesa.categoria || null,
                despesa.metodo || null,
                despesa.valor,
                despesa.valor_pago,          // vem pronto da exportação
                despesa.status,              // "Paga"
                dataCompra,
                dataVencimento,
                dataPagamento
            ]);
        }

        console.log('✅ Importação de despesas concluída com sucesso!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Erro na importação de despesas:', error);
        process.exit(1);
    }
}

// ======================================================
// EXECUÇÃO
// ======================================================
importarDespesas();
