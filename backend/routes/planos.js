const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

// Configuração do Mercado Pago com suas credenciais do Render
const client = new MercadoPagoConfig({ 
    accessToken: process.env.MP_ACCESS_TOKEN 
});

const TRIAL_DIAS = 15;

// ================================================================
// GET /api/planos/status — retorna status do plano do usuário
// ================================================================
router.get('/status', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            `SELECT data_cadastro, plano_status, plano_tipo, plano_expiracao
             FROM usuarios WHERE id = $1`,
            [req.usuario.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Usuário não encontrado' });
        }

        const usuario = result.rows[0];
        const agora = new Date();
        const dataCadastro = new Date(usuario.data_cadastro);
        const diasDecorridos = Math.floor((agora - dataCadastro) / (1000 * 60 * 60 * 24));
        const diasRestantesTrial = Math.max(0, TRIAL_DIAS - diasDecorridos);

        let status = usuario.plano_status || 'trial';

        // Lógica de expiração automática (Trial)
        if (status === 'trial' && diasDecorridos >= TRIAL_DIAS) {
            status = 'expirado';
            await query(`UPDATE usuarios SET plano_status = 'expirado' WHERE id = $1`, [req.usuario.id]);
        }

        // Lógica de expiração automática (Plano Ativo)
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
// POST /api/planos/assinar — inicia assinatura via Mercado Pago
// ================================================================
router.post('/assinar', authMiddleware, async (req, res) => {
    const { tipo, forma_pagamento } = req.body;

    if (!['mensal', 'anual'].includes(tipo)) {
        return res.status(400).json({ success: false, message: 'Tipo de plano inválido' });
    }

    const valor = tipo === 'mensal' ? 79.90 : 639.90;

    try {
        const preference = new Preference(client);
        
        const body = {
            items: [{
                id: tipo,
                title: `Sistema Financeiro - Plano ${tipo.toUpperCase()}`,
                unit_price: valor,
                quantity: 1,
                currency_id: 'BRL'
            }],
            payment_methods: {
                excluded_payment_types: forma_pagamento === 'pix' 
                    ? [{ id: 'credit_card' }, { id: 'debit_card' }, { id: 'ticket' }] 
                    : [{ id: 'ticket' }],
                installments: tipo === 'anual' ? 12 : 1
            },
            // External Reference vincula o pagamento ao ID do usuário no banco
            external_reference: req.usuario.id.toString(),
            notification_url: "https://sistema-financeiro-backend-o199.onrender.com/api/planos/webhook",
            back_urls: {
                success: "https://seu-frontend.onrender.com/dashboard.html",
                failure: "https://seu-frontend.onrender.com/dashboard.html"
            },
            auto_return: "approved",
        };

        const result = await preference.create({ body });

        res.json({
            success: true,
            data: { 
                payment_url: result.init_point 
            }
        });

    } catch (error) {
        console.error('Erro Mercado Pago:', error);
        res.status(500).json({ success: false, message: 'Erro ao gerar link de pagamento' });
    }
});

// ================================================================
// POST /api/planos/webhook — callback do Mercado Pago após pagamento
// ================================================================
router.post('/webhook', async (req, res) => {
    const { action, data } = req.body;

    // Processa apenas notificações de pagamento concluído
    if (action === "payment.created" || action === "payment.updated" || req.query.type === 'payment') {
        const paymentId = data?.id || req.query['data.id'];

        try {
            const payment = new Payment(client);
            const pdt = await payment.get({ id: paymentId });

            if (pdt.status === 'approved') {
                const usuarioId = pdt.external_reference;
                const tipoPlano = pdt.additional_info.items[0].id; // 'mensal' ou 'anual'
                
                const diasAdicionais = tipoPlano === 'anual' ? 365 : 30;
                const expiracao = new Date();
                expiracao.setDate(expiracao.getDate() + diasAdicionais);

                await query(
                    `UPDATE usuarios 
                     SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = $2 
                     WHERE id = $3`,
                    [tipoPlano, expiracao, usuarioId]
                );
                
                console.log(`Plano ${tipoPlano} ativado para usuário ${usuarioId}`);
            }
        } catch (err) {
            console.error('Erro ao processar webhook:', err);
        }
    }

    // Mercado Pago exige retorno 200 rápido
    res.sendStatus(200);
});

// ================================================================
// POST /api/planos/ativar — ativação manual (admin/teste)
// ================================================================
router.post('/ativar', authMiddleware, async (req, res) => {
    const { tipo, dias } = req.body;

    if (!['mensal', 'anual'].includes(tipo)) {
        return res.status(400).json({ success: false, message: 'Tipo inválido' });
    }

    const expiracao = new Date();
    expiracao.setDate(expiracao.getDate() + (dias || (tipo === 'anual' ? 365 : 30)));

    await query(
        `UPDATE usuarios SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = $2 WHERE id = $3`,
        [tipo, expiracao, req.usuario.id]
    );

    res.json({ success: true, message: 'Plano ativado manualmente', expiracao });
});

module.exports = router;