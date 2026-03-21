const express = require('express');
const router = express.Router();

// ================================================================
// ROTA PÚBLICA — não requer autenticação
// GET /api/financeiro/selic
// ================================================================

// Cache em memória: 24h
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let selicCache = null; // { taxa_mensal, taxa_anual, data, timestamp }

const TAXA_PADRAO_MENSAL = 1.17;

function calcularTaxaAnual(taxaMensal) {
    return (Math.pow(1 + taxaMensal / 100, 12) - 1) * 100;
}

router.get('/selic', async (req, res) => {
    try {
        // Retorna cache se ainda válido
        if (selicCache && (Date.now() - selicCache.timestamp) < CACHE_TTL_MS) {
            return res.json({
                success: true,
                taxa_mensal: selicCache.taxa_mensal,
                taxa_anual: selicCache.taxa_anual,
                data: selicCache.data,
                fonte: 'cache'
            });
        }

        // Busca taxa atual no BCB
        let fetch;
        try {
            fetch = require('node-fetch');
        } catch (e) {
            fetch = global.fetch || require('node-fetch');
        }

        const bcbUrl = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.11/dados/ultimos/1?formato=json';
        const response = await fetch(bcbUrl, { timeout: 8000 });

        if (!response.ok) {
            throw new Error(`BCB respondeu com status ${response.status}`);
        }

        const dados = await response.json();

        if (!Array.isArray(dados) || dados.length === 0) {
            throw new Error('Resposta inesperada do BCB');
        }

        const taxa_mensal = parseFloat(dados[0].valor);
        const taxa_anual  = calcularTaxaAnual(taxa_mensal);
        const data        = dados[0].data;

        // Atualiza cache
        selicCache = { taxa_mensal, taxa_anual, data, timestamp: Date.now() };

        return res.json({
            success: true,
            taxa_mensal,
            taxa_anual,
            data,
            fonte: 'bcb'
        });

    } catch (err) {
        console.warn('[financeiro] Falha ao buscar Selic no BCB:', err.message);

        // Fallback: última taxa cacheada ou padrão
        const taxa_mensal = selicCache ? selicCache.taxa_mensal : TAXA_PADRAO_MENSAL;
        const taxa_anual  = selicCache ? selicCache.taxa_anual  : calcularTaxaAnual(TAXA_PADRAO_MENSAL);
        const data        = selicCache ? selicCache.data        : null;

        return res.json({
            success: true,
            taxa_mensal,
            taxa_anual,
            data,
            fonte: 'fallback'
        });
    }
});

module.exports = router;
