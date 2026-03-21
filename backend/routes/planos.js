const express = require('express');
const router = express.Router();
const { query } = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { MercadoPagoConfig, Preference, Payment, PreApproval } = require('mercadopago');

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

    const valor = tipo === 'mensal' ? 39.99 : 422.28;

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

    const valor = tipo === 'mensal' ? 39.99 : 422.28;

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
    res.sendStatus(200); // responde rápido ao MP

    const { action, data, type } = req.body;
    const eventType = type || req.query.type;
    const resourceId = data?.id || req.query['data.id'];

    if (!resourceId) return;

    try {
        // ── Pagamento avulso (PIX, cartão one-time) ──────────────
        if (eventType === 'payment' || action === 'payment.created' || action === 'payment.updated') {
            const payment = new Payment(client);
            const pdt = await payment.get({ id: resourceId });

            if (pdt.status === 'approved') {
                const usuarioId = pdt.external_reference;
                let tipoPlano = 'mensal';
                if (parseFloat(pdt.transaction_amount) >= 200) tipoPlano = 'anual';

                const diasAdicionais = tipoPlano === 'anual' ? 365 : 30;
                const expiracao = new Date();
                expiracao.setDate(expiracao.getDate() + diasAdicionais);

                await query(
                    `UPDATE usuarios SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = $2,
                     plano_inicio = NOW(), payment_id_anual = $3
                     WHERE id = $4`,
                    [tipoPlano, expiracao, tipoPlano === 'anual' ? pdt.id.toString() : null, usuarioId]
                );
                console.log(`[Webhook] Plano ${tipoPlano} ativado (pagamento avulso) para usuario ${usuarioId}`);
            }
        }

        // ── Assinatura recorrente ─────────────────────────────────
        if (eventType === 'subscription_preapproval' || action === 'subscription_preapproval.updated') {
            const preApproval = new PreApproval(client);
            const sub = await preApproval.get({ id: resourceId });

            const usuarioId = sub.external_reference;

            if (sub.status === 'authorized') {
                // Assinatura ativa ou renovada — mantém plano ativo sem data de expiração
                let tipoPlano = 'mensal';
                if (parseFloat(sub.auto_recurring?.transaction_amount) >= 200) tipoPlano = 'anual';

                await query(
                    `UPDATE usuarios SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = NULL, preapproval_id = $2
                     WHERE id = $3`,
                    [tipoPlano, sub.id, usuarioId]
                );
                console.log(`[Webhook] Assinatura ${sub.id} autorizada para usuario ${usuarioId}`);

            } else if (sub.status === 'cancelled' || sub.status === 'paused') {
                await query(
                    `UPDATE usuarios SET plano_status = 'expirado', preapproval_id = NULL WHERE id = $1`,
                    [usuarioId]
                );
                console.log(`[Webhook] Assinatura ${sub.id} ${sub.status} — usuario ${usuarioId} bloqueado`);
            }
        }

        // ── Cobrança recorrente executada ────────────────────────
        if (eventType === 'subscription_authorized_payment') {
            // MP executou uma cobrança automática — garante que o plano continua ativo
            const payment = new Payment(client);
            const pdt = await payment.get({ id: resourceId });

            if (pdt.status === 'approved' && pdt.external_reference) {
                await query(
                    `UPDATE usuarios SET plano_status = 'ativo', plano_expiracao = NULL
                     WHERE id = $1`,
                    [pdt.external_reference]
                );
                console.log(`[Webhook] Cobrança recorrente aprovada para usuario ${pdt.external_reference}`);
            } else if (pdt.status === 'rejected' && pdt.external_reference) {
                // Cobrança falhou — pode notificar ou aguardar retentativas do MP
                console.warn(`[Webhook] Cobrança recorrente rejeitada para usuario ${pdt.external_reference}: ${pdt.status_detail}`);
            }
        }
    } catch (err) {
        console.error('[Webhook] Erro ao processar evento:', err.message);
    }
});

// ================================================================
// GET /api/planos/config — retorna chave pública do Mercado Pago
// ================================================================
router.get('/config', authMiddleware, (_req, res) => {
    res.json({
        success: true,
        public_key: process.env.MP_PUBLIC_KEY || null
    });
});

// ================================================================
// POST /api/planos/pagar-cartao — Checkout Transparente (cartão)
// ================================================================
router.post('/pagar-cartao', authMiddleware, async (req, res) => {
    const { tipo, card_token, installments } = req.body;

    if (!['mensal', 'anual'].includes(tipo)) {
        return res.status(400).json({ success: false, message: 'Tipo de plano invalido' });
    }

    if (!card_token) {
        return res.status(400).json({ success: false, message: 'Token do cartao ausente. Verifique os dados e tente novamente.' });
    }

    const valor = tipo === 'mensal' ? 39.99 : 422.28;
    const parcelas = parseInt(installments) || 1;

    try {
        const usuarioResult = await query(
            'SELECT email, nome FROM usuarios WHERE id = $1',
            [req.usuario.id]
        );
        const usuario = usuarioResult.rows[0];

        const payment = new Payment(client);
        const pdt = await payment.create({
            body: {
                transaction_amount: valor,
                token: card_token,
                installments: parcelas,
                payment_method_id: null, // MP detecta pela bandeira do token
                payer: {
                    email: usuario.email,
                    identification: req.body.cpf
                        ? { type: 'CPF', number: req.body.cpf.replace(/\D/g, '') }
                        : undefined
                },
                description: `Sistema Financeiro - Plano ${tipo.charAt(0).toUpperCase() + tipo.slice(1)}`,
                external_reference: req.usuario.id.toString(),
                notification_url: `${BACKEND_URL}/api/planos/webhook`
            }
        });

        if (pdt.status === 'approved') {
            const diasAdicionais = tipo === 'anual' ? 365 : 30;
            const expiracao = new Date();
            expiracao.setDate(expiracao.getDate() + diasAdicionais);

            await query(
                `UPDATE usuarios SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = $2,
                 plano_inicio = NOW(), payment_id_anual = $3 WHERE id = $4`,
                [tipo, expiracao, tipo === 'anual' ? pdt.id.toString() : null, req.usuario.id]
            );

            console.log(`Plano ${tipo} ativado via cartao para usuario ${req.usuario.id}`);
            return res.json({ success: true, message: 'Pagamento aprovado!' });

        } else if (pdt.status === 'in_process' || pdt.status === 'pending') {
            return res.json({
                success: false,
                message: 'Pagamento em análise. Você será notificado quando aprovado.'
            });

        } else {
            const detail = pdt.status_detail || pdt.status;
            return res.json({
                success: false,
                message: `Pagamento recusado (${detail}). Verifique os dados do cartão.`
            });
        }
    } catch (error) {
        console.error('Erro pagar-cartao:', error);
        res.status(500).json({ success: false, message: 'Erro ao processar pagamento. Tente novamente.' });
    }
});

// ================================================================
// POST /api/planos/assinar-recorrente — débito recorrente em cartão
// ================================================================
router.post('/assinar-recorrente', authMiddleware, async (req, res) => {
    const { tipo, card_token } = req.body;

    if (!['mensal', 'anual'].includes(tipo)) {
        return res.status(400).json({ success: false, message: 'Tipo de plano invalido' });
    }

    if (!card_token) {
        return res.status(400).json({ success: false, message: 'Token do cartao ausente.' });
    }

    const valor     = tipo === 'mensal' ? 39.99 : 422.28;
    const frequencia = tipo === 'mensal' ? 1 : 12; // mensal=1 mês, anual=12 meses

    try {
        const usuarioResult = await query(
            'SELECT email, nome, preapproval_id FROM usuarios WHERE id = $1',
            [req.usuario.id]
        );
        const usuario = usuarioResult.rows[0];

        // Cancela assinatura anterior se existir
        if (usuario.preapproval_id) {
            try {
                const preApproval = new PreApproval(client);
                await preApproval.update({
                    id: usuario.preapproval_id,
                    body: { status: 'cancelled' }
                });
            } catch (e) {
                console.warn('Nao foi possivel cancelar assinatura anterior:', e.message);
            }
        }

        const preApproval = new PreApproval(client);
        const startDate = new Date();
        startDate.setSeconds(startDate.getSeconds() + 30); // começa em 30s para garantir processamento

        const result = await preApproval.create({
            body: {
                reason: `Sistema Financeiro - Plano ${tipo === 'mensal' ? 'Mensal' : 'Anual'}`,
                external_reference: req.usuario.id.toString(),
                payer_email: usuario.email,
                card_token_id: card_token,
                auto_recurring: {
                    frequency: frequencia,
                    frequency_type: 'months',
                    start_date: startDate.toISOString(),
                    transaction_amount: valor,
                    currency_id: 'BRL'
                },
                back_url: FRONTEND_URL,
                notification_url: `${BACKEND_URL}/api/planos/webhook`,
                status: 'authorized'
            }
        });

        if (result.status === 'authorized') {
            // Ativa o plano imediatamente (primeira cobrança processada pelo MP)
            await query(
                `UPDATE usuarios
                 SET plano_status = 'ativo', plano_tipo = $1, plano_expiracao = NULL, preapproval_id = $2,
                 plano_inicio = NOW(), payment_id_anual = NULL
                 WHERE id = $3`,
                [tipo, result.id, req.usuario.id]
            );

            console.log(`Assinatura recorrente ${tipo} criada para usuario ${req.usuario.id}: ${result.id}`);
            return res.json({ success: true, message: 'Assinatura criada! Seu plano esta ativo.' });
        } else {
            return res.json({
                success: false,
                message: `Assinatura nao autorizada (${result.status}). Verifique os dados do cartao.`
            });
        }
    } catch (error) {
        console.error('Erro assinar-recorrente:', error);
        res.status(500).json({ success: false, message: 'Erro ao criar assinatura. Tente novamente.' });
    }
});

// ================================================================
// GET /api/planos/cancelar/preview — preview do reembolso antes de cancelar
// ================================================================
router.get('/cancelar/preview', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            'SELECT plano_tipo, plano_inicio, preapproval_id, payment_id_anual FROM usuarios WHERE id = $1',
            [req.usuario.id]
        );
        const usuario = result.rows[0];

        if (!usuario || usuario.plano_tipo !== 'anual') {
            return res.json({ success: true, data: { reembolso: 0, meses_restantes: 0, elegivel: false } });
        }

        const inicio = usuario.plano_inicio ? new Date(usuario.plano_inicio) : null;
        if (!inicio) {
            return res.json({ success: true, data: { reembolso: 0, meses_restantes: 0, elegivel: false } });
        }

        const agora = new Date();
        const mesesUsados = Math.floor((agora - inicio) / (1000 * 60 * 60 * 24 * 30.44));
        const mesesRestantes = Math.max(0, 12 - mesesUsados);
        const VALOR_ANUAL = 422.28;
        const TAXA_DESPESAS = 0.15;

        const valorBruto = (mesesRestantes / 12) * VALOR_ANUAL;
        const reembolso = parseFloat((valorBruto * (1 - TAXA_DESPESAS)).toFixed(2));

        res.json({
            success: true,
            data: {
                elegivel: mesesRestantes > 0 && (!!usuario.payment_id_anual || !!usuario.preapproval_id),
                meses_usados: mesesUsados,
                meses_restantes: mesesRestantes,
                reembolso,
                tem_payment_id: !!usuario.payment_id_anual
            }
        });
    } catch (error) {
        console.error('Erro preview cancelamento:', error);
        res.status(500).json({ success: false, message: 'Erro ao calcular reembolso.' });
    }
});

// ================================================================
// POST /api/planos/cancelar — cancela assinatura e reembolsa se anual
// ================================================================
router.post('/cancelar', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            'SELECT plano_tipo, plano_inicio, preapproval_id, payment_id_anual FROM usuarios WHERE id = $1',
            [req.usuario.id]
        );
        const usuario = result.rows[0];
        if (!usuario) {
            return res.status(404).json({ success: false, message: 'Usuario nao encontrado.' });
        }

        const { plano_tipo, plano_inicio, preapproval_id, payment_id_anual } = usuario;

        // Cancela assinatura recorrente no MP (qualquer tipo)
        if (preapproval_id) {
            try {
                const preApproval = new PreApproval(client);
                await preApproval.update({ id: preapproval_id, body: { status: 'cancelled' } });
            } catch (e) {
                console.warn('Nao foi possivel cancelar preapproval no MP:', e.message);
            }
        }

        // Reembolso proporcional — somente plano anual com payment_id_anual
        let reembolsoRealizado = 0;
        let reembolsoErro = null;

        if (plano_tipo === 'anual' && payment_id_anual && plano_inicio) {
            const agora = new Date();
            const inicio = new Date(plano_inicio);
            const mesesUsados = Math.floor((agora - inicio) / (1000 * 60 * 60 * 24 * 30.44));
            const mesesRestantes = Math.max(0, 12 - mesesUsados);

            if (mesesRestantes > 0) {
                const VALOR_ANUAL = 422.28;
                const TAXA_DESPESAS = 0.15;
                const valorBruto = (mesesRestantes / 12) * VALOR_ANUAL;
                const reembolso = parseFloat((valorBruto * (1 - TAXA_DESPESAS)).toFixed(2));

                try {
                    const payment = new Payment(client);
                    const refundResult = await payment.refund({
                        id: payment_id_anual,
                        body: { amount: reembolso }
                    });
                    reembolsoRealizado = reembolso;
                    console.log(`[Cancelar] Reembolso de R$${reembolso} realizado para usuario ${req.usuario.id}. Refund ID: ${refundResult.id}`);
                } catch (e) {
                    console.error('[Cancelar] Falha ao processar reembolso no MP:', e.message);
                    reembolsoErro = 'Reembolso nao processado automaticamente. Entre em contato com o suporte.';
                }
            }
        }

        // Bloqueia acesso imediatamente
        await query(
            `UPDATE usuarios SET plano_status = 'expirado', preapproval_id = NULL, payment_id_anual = NULL WHERE id = $1`,
            [req.usuario.id]
        );

        res.json({
            success: true,
            message: reembolsoRealizado > 0
                ? `Assinatura cancelada. Reembolso de R$${reembolsoRealizado.toFixed(2)} processado.`
                : 'Assinatura cancelada.',
            reembolso: reembolsoRealizado,
            aviso: reembolsoErro || null
        });
    } catch (error) {
        console.error('Erro cancelar assinatura:', error);
        res.status(500).json({ success: false, message: 'Erro ao cancelar assinatura.' });
    }
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
