const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN
});

const TRIAL_DIAS = 15;
const BACKEND_URL = process.env.BACKEND_URL || 'https://sistema-financeiro-backend-o199.onrender.com';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sistema-financeiro-kxed.onrender.com';

// ================================================================
// GET /api/planos/status
// ================================================================
router.get('/status', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            `SELECT tipo, data_cadastro, plano_status, plano_tipo, plano_expiracao
             FROM usuarios WHERE id = $1`,
            [req.usuario.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuario nao encontrado' });
        }

        const usuario = result.rows[0];
        const agora = new Date();
        const dataCadastro = new Date(usuario.data_cadastro);
        const diasDecorridos = Math.floor((agora - dataCadastro) / (1000 * 60 * 60 * 24));
        const diasRestantesTrial = Math.max(0, TRIAL_DIAS - diasDecorridos);

        let status = usuario.plano_status || 'trial';

        // Master nunca expira
        if (usuario.tipo === 'master') {
            return res.json({
                success: true,
                data: {
                    status: 'ativo',
                    plano_tipo: 'master',
                    plano_expiracao: null,
                    dias_restantes_trial: null,
                    data_cadastro: usuario.data_cadastro
                }
            });
        }

        if (status === 'trial' && diasDecorridos >= TRIAL_DIAS) {
            status = 'expirado';
            await query(`UPDATE usuarios SET plano_status = 'expirado' WHERE id = $1`, [req.usuario.id]);
        }

        if (status === 'ativo' && usuario.plano_expiracao) {
            if (new Date(usuario.plano_expiracao) < agora) {
                status = 'expirado';
                await query(`UPDATE usuarios SET plano_status = 'expirado' WHERE id = $1`, [req.usuario.id]);
            }
        }

        res.json({
            success: true,
            data: {
                status,
                plano_tipo: usuario.plano_tipo || null,
                plano_expiracao: usuario.plano_expiracao || null,
                dias_restantes_trial: status === 'trial' ? diasRestantesTrial : null,
                data_cadastro: usuario.data_cadastro
            }
        });
    } catch (error) {
        console.error('Erro ao buscar status do plano:', error);
        res.status(500).json({ success: false, message: 'Erro ao buscar status do plano' });
    }
});

// ================================================================
// POST /api/planos/assinar — cartao / debito (Preference MP)
// ================================================================
router.post('/assinar', authMiddleware, async (req, res) => {
    const { tipo, forma_pagamento } = req.body;

    if (!['mensal', 'anual'].includes(tipo)) {
        return res.status(400).json({ success: false, message: 'Tipo de plano invalido' });
    }

    const valor = tipo === 'mensal' ? 79.90 : 639.90;

    try {
        const preference = new Preference(client);

        // Formas de pagamento excluídas conforme seleção
        let excludedTypes = [{ id: 'ticket' }]; // sempre exclui boleto
        if (forma_pagamento === 'debito') {
            excludedTypes.push({ id: 'credit_card' });
        } else if (forma_pagamento === 'cartao') {
            excludedTypes.push({ id: 'debit_card' });
        }

        const body = {
            items: [{
                id: tipo,
                title: `Sistema Financeiro - Plano ${tipo.toUpperCase()}`,
                unit_price: valor,
                quantity: 1,
                currency_id: 'BRL'
            }],
            payment_methods: {
                excluded_payment_types: excludedTypes,
                installments: (tipo === 'anual' && forma_pagamento !== 'debito') ? 12 : 1
            },
            external_reference: req.usuario.id.toString(),
            notification_url: `${BACKEND_URL}/api/planos/webhook`,
            back_urls: {
                success: `${FRONTEND_URL}/dashboard.html`,
                failure: `${FRONTEND_URL}/dashboard.html`
            },
            auto_return: 'approved'
        };

        const result = await preference.create({ body });

        res.json({
            success: true,
            data: { payment_url: result.init_point }
        });
    } catch (error) {
        console.error('Erro Mercado Pago (assinar):', error);
        res.status(500).json({ success: false, message: 'Erro ao gerar link de pagamento' });
    }
});

// ================================================================
// POST /api/planos/pix — gera pagamento PIX com QR Code
// ================================================================
router.post('/pix', authMiddleware, async (req, res) => {
    const { tipo } = req.body;

    if (!['mensal', 'anual'].includes(tipo)) {
        return res.status(400).json({ success: false, message: 'Tipo de plano invalido' });
    }

    const valor = tipo === 'mensal' ? 79.90 : 639.90;

    try {
        const usuarioResult = await query(
            'SELECT email, nome FROM usuarios WHERE id = $1',
            [req.usuario.id]
        );
        const usuario = usuarioResult.rows[0];

        const payment = new Payment(client);
        const expiracao = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min

        const pdt = await payment.create({
            body: {
                transaction_amount: valor,
                payment_method_id: 'pix',
                payer: { email: usuario.email },
                description: `Sistema Financeiro - Plano ${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`,
                external_reference: req.usuario.id.toString(),
                notification_url: `${BACKEND_URL}/api/planos/webhook`,
                date_of_expiration: expiracao
            }
        });

        const pixData = pdt.point_of_interaction?.transaction_data;

        if (!pixData?.qr_code) {
            throw new Error('QR Code nao retornado pelo Mercado Pago');
        }

        res.json({
            success: true,
            data: {
                payment_id: pdt.id,
                qr_code: pixData.qr_code,
                qr_code_base64: pixData.qr_code_base64
            }
        });
    } catch (error) {
        console.error('Erro ao gerar PIX:', error);
        res.status(500).json({ success: false, message: 'Erro ao gerar PIX' });
    }
});

// ================================================================
// POST /api/planos/webhook — callback do Mercado Pago
// ================================================================
router.post('/webhook', async (req, res) => {
    const { action, data } = req.body;

    if (action === 'payment.created' || action === 'payment.updated' || req.query.type === 'payment') {
        const paymentId = data?.id || req.query['data.id'];

        try {
            const payment = new Payment(client);
            const pdt = await payment.get({ id: paymentId });

            if (pdt.status === 'approved') {
                const usuarioId = pdt.external_reference;
                // Tenta pegar o tipo pelo item ou pelo valor pago
                let tipoPlano = 'mensal';
                const valorPago = parseFloat(pdt.transaction_amount);
                if (valorPago >= 600) tipoPlano = 'anual';

                const diasAdicionais = tipoPlano === 'anual' ? 365 : 30;
                const expiracao = new Date();
                expiracao.setDate(expiracao.getDate() + diasAdicionais);

                await query(
                    `UPDATE usuarios
                     SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = $2
                     WHERE id = $3`,
                    [tipoPlano, expiracao, usuarioId]
                );

                console.log(`Plano ${tipoPlano} ativado para usuario ${usuarioId}`);
            }
        } catch (err) {
            console.error('Erro ao processar webhook:', err);
        }
    }

    res.sendStatus(200);
});

// ================================================================
// POST /api/planos/ativar — ativacao manual (admin/teste)
// ================================================================
router.post('/ativar', authMiddleware, async (req, res) => {
    const { tipo, dias } = req.body;

    if (!['mensal', 'anual'].includes(tipo)) {
        return res.status(400).json({ success: false, message: 'Tipo invalido' });
    }

    const expiracao = new Date();
    expiracao.setDate(expiracao.getDate() + (dias || (tipo === 'anual' ? 365 : 30)));

    await query(
        `UPDATE usuarios SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = $2 WHERE id = $3`,
        [tipo, expiracao, req.usuario.id]
    );

    res.json({ success: true, message: 'Plano ativado manualmente', expiracao });
});

// ================================================================
// FUNCAO UTILITARIA — enviar e-mail de cobranca via EmailJS
// Exportada para uso no cron
// ================================================================
async function enviarEmailCobranca({ email, nome, diasRestantes, linkRenovacao, tipoPlano }) {
    const serviceId  = process.env.EMAILJS_SERVICE_ID;
    const templateId = process.env.EMAILJS_TEMPLATE_COBRANCA_ID;
    const userId     = process.env.EMAILJS_USER_ID;

    if (!serviceId || !templateId || !userId) {
        console.warn('[EmailJS Cobranca] Credenciais nao configuradas. Configure EMAILJS_TEMPLATE_COBRANCA_ID no .env');
        return false;
    }

    const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch');

    let assunto = '';
    if (diasRestantes === 0) {
        assunto = 'Seu plano expirou hoje — renove agora';
    } else if (diasRestantes === 1) {
        assunto = 'Seu plano expira amanha!';
    } else {
        assunto = `Seu plano expira em ${diasRestantes} dias`;
    }

    try {
        const response = await fetchFn('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Origin': FRONTEND_URL
            },
            body: JSON.stringify({
                service_id: serviceId,
                template_id: templateId,
                user_id: userId,
                template_params: {
                    to_email: email,
                    to_name: nome,
                    assunto,
                    dias_restantes: diasRestantes,
                    tipo_plano: tipoPlano || 'mensal',
                    link_renovacao: linkRenovacao || FRONTEND_URL,
                    sistema_nome: 'Sistema de Controle Financeiro'
                }
            })
        });

        if (response.ok) {
            console.log(`[EmailJS Cobranca] Email enviado para ${email} (${diasRestantes} dias restantes)`);
            return true;
        } else {
            const err = await response.text();
            console.error(`[EmailJS Cobranca] Erro: ${response.status} - ${err}`);
            return false;
        }
    } catch (error) {
        console.error('[EmailJS Cobranca] Erro catch:', error.message);
        return false;
    }
}

module.exports = router;
module.exports.enviarEmailCobranca = enviarEmailCobranca;
