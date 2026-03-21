// ================================================================
// paypal.js — Integração PayPal REST API v2
// ================================================================

const express = require('express');
const router  = express.Router();
const fetch   = require('node-fetch');
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');

const PAYPAL_MODE      = process.env.PAYPAL_MODE || 'sandbox'; // 'sandbox' | 'live'
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_SECRET    = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_BASE      = PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

const BACKEND_URL  = process.env.BACKEND_URL  || 'https://sistema-financeiro-backend-o199.onrender.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sistema-financeiro-kxed.onrender.com';

// ── Helper: obtém access token ────────────────────────────────────
async function getAccessToken() {
    const credentials = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');
    const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });
    const data = await res.json();
    if (!data.access_token) throw new Error('Falha ao obter access token PayPal');
    return data.access_token;
}

// ── Helper: ativa plano no banco ──────────────────────────────────
async function ativarPlano(usuarioId, tipoPlano, paypalOrderId) {
    const diasAdicionais = tipoPlano === 'anual' ? 365 : 30;
    const expiracao = new Date();
    expiracao.setDate(expiracao.getDate() + diasAdicionais);
    await query(
        `UPDATE usuarios SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = $2,
         plano_inicio = NOW(), payment_id_anual = $3
         WHERE id = $4`,
        [tipoPlano, expiracao, paypalOrderId, usuarioId]
    );
}

// ================================================================
// GET /api/paypal/config — retorna client_id público para o frontend
// ================================================================
router.get('/config', (req, res) => {
    if (!PAYPAL_CLIENT_ID) {
        return res.status(503).json({ success: false, message: 'PayPal não configurado' });
    }
    res.json({ success: true, clientId: PAYPAL_CLIENT_ID, mode: PAYPAL_MODE });
});

// ================================================================
// POST /api/paypal/create-order — cria ordem PayPal
// ================================================================
router.post('/create-order', authMiddleware, async (req, res) => {
    const { tipo } = req.body;

    if (!['mensal', 'anual'].includes(tipo)) {
        return res.status(400).json({ success: false, message: 'Tipo de plano inválido' });
    }

    if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
        return res.status(503).json({ success: false, message: 'PayPal não configurado no servidor' });
    }

    const valor = tipo === 'mensal' ? '39.99' : '422.28';
    const descricao = `FinGerence - Plano ${tipo === 'mensal' ? 'Mensal' : 'Anual'}`;

    try {
        const token = await getAccessToken();

        const res2 = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                intent: 'CAPTURE',
                purchase_units: [{
                    reference_id: `${req.usuario.id}_${tipo}`,
                    description: descricao,
                    amount: {
                        currency_code: 'BRL',
                        value: valor
                    }
                }],
                application_context: {
                    brand_name: 'FinGerence',
                    locale: 'pt-BR',
                    return_url: `${FRONTEND_URL}/app.html`,
                    cancel_url: `${FRONTEND_URL}/app.html`
                }
            })
        });

        const order = await res2.json();

        if (!order.id) {
            console.error('[PayPal] Erro ao criar ordem:', order);
            return res.status(500).json({ success: false, message: 'Erro ao criar ordem PayPal' });
        }

        res.json({ success: true, orderID: order.id });
    } catch (error) {
        console.error('[PayPal] create-order error:', error);
        res.status(500).json({ success: false, message: 'Erro interno ao processar PayPal' });
    }
});

// ================================================================
// POST /api/paypal/capture-order — captura pagamento aprovado
// ================================================================
router.post('/capture-order', authMiddleware, async (req, res) => {
    const { orderID, tipo } = req.body;

    if (!orderID || !['mensal', 'anual'].includes(tipo)) {
        return res.status(400).json({ success: false, message: 'Dados inválidos' });
    }

    try {
        const token = await getAccessToken();

        const res2 = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderID}/capture`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const capture = await res2.json();

        if (capture.status !== 'COMPLETED') {
            console.error('[PayPal] Captura não completada:', capture);
            return res.status(400).json({ success: false, message: 'Pagamento não aprovado pelo PayPal' });
        }

        // Verifica se o valor capturado bate com o plano
        const valorCapturado = parseFloat(
            capture.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value || 0
        );
        const tipoConfirmado = valorCapturado >= 200 ? 'anual' : 'mensal';

        await ativarPlano(req.usuario.id, tipoConfirmado, orderID);

        console.log(`[PayPal] Plano ${tipoConfirmado} ativado para usuário ${req.usuario.id} (order: ${orderID})`);

        res.json({ success: true, message: 'Plano ativado com sucesso!', tipo: tipoConfirmado });
    } catch (error) {
        console.error('[PayPal] capture-order error:', error);
        res.status(500).json({ success: false, message: 'Erro ao confirmar pagamento PayPal' });
    }
});

// ================================================================
// POST /api/paypal/webhook — eventos PayPal (IPN)
// ================================================================
router.post('/webhook', async (req, res) => {
    res.sendStatus(200); // responde rápido ao PayPal

    const eventType = req.body?.event_type;
    const resource  = req.body?.resource;

    if (!eventType || !resource) return;

    try {
        if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
            const orderID = resource.supplementary_data?.related_ids?.order_id || resource.id;
            const valor   = parseFloat(resource.amount?.value || 0);
            const refId   = resource.custom_id || resource.purchase_units?.[0]?.reference_id || '';
            const usuarioId = refId.split('_')[0];

            if (!usuarioId) return;

            const tipoPlano = valor >= 200 ? 'anual' : 'mensal';
            await ativarPlano(usuarioId, tipoPlano, orderID);
            console.log(`[PayPal Webhook] Plano ${tipoPlano} ativado para usuário ${usuarioId}`);
        }
    } catch (error) {
        console.error('[PayPal Webhook] Erro:', error);
    }
});

module.exports = router;
