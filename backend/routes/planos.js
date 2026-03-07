import express from "express";
import cors from "cors";
import mercadopago from "mercadopago";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

/* =========================================================
CONFIG MERCADO PAGO
========================================================= */

mercadopago.configure({
    access_token: process.env.MP_ACCESS_TOKEN
});

/* =========================================================
PLANOS
========================================================= */

const PLANOS = {
    mensal: {
        titulo: "Plano Mensal",
        valor: 79.90
    },
    anual: {
        titulo: "Plano Anual",
        valor: 639.90
    }
};

/* =========================================================
CRIAR PAGAMENTO
POST /api/planos/assinar
========================================================= */

app.post("/api/planos/assinar", async (req, res) => {

    try {

        const { tipo, forma_pagamento } = req.body;

        const plano = PLANOS[tipo];

        if (!plano) {
            return res.json({
                success: false,
                message: "Plano inválido"
            });
        }

        /* ========================================
        PAGAMENTO PIX
        ======================================== */

        if (forma_pagamento === "pix") {

            const payment = await mercadopago.payment.create({
                transaction_amount: plano.valor,
                description: plano.titulo,
                payment_method_id: "pix",
                payer: {
                    email: "cliente@email.com"
                }
            });

            return res.json({
                success: true,
                data: {
                    qr_code: payment.body.point_of_interaction.transaction_data.qr_code,
                    qr_code_base64: payment.body.point_of_interaction.transaction_data.qr_code_base64
                }
            });
        }

        /* ========================================
        CHECKOUT CARTÃO
        ======================================== */

        if (forma_pagamento === "cartao") {

            const preference = await mercadopago.preferences.create({

                items: [
                    {
                        title: plano.titulo,
                        unit_price: plano.valor,
                        quantity: 1
                    }
                ],

                back_urls: {
                    success: "https://seusite.com/pagamento/sucesso",
                    failure: "https://seusite.com/pagamento/erro",
                    pending: "https://seusite.com/pagamento/pendente"
                },

                auto_return: "approved",

                notification_url: process.env.WEBHOOK_URL
            });

            return res.json({
                success: true,
                data: {
                    payment_url: preference.body.init_point
                }
            });
        }

        return res.json({
            success: false,
            message: "Forma de pagamento inválida"
        });

    } catch (error) {

        console.error(error);

        res.json({
            success: false,
            message: "Erro ao criar pagamento"
        });
    }
});


/* =========================================================
ASSINATURA AUTOMÁTICA (SaaS)
========================================================= */

app.post("/api/planos/assinatura", async (req, res) => {

    try {

        const { email } = req.body;

        const assinatura = await mercadopago.preapproval.create({

            reason: "Sistema Financeiro - Plano Mensal",

            auto_recurring: {
                frequency: 1,
                frequency_type: "months",
                transaction_amount: 79.90,
                currency_id: "BRL"
            },

            payer_email: email,

            back_url: "https://seusite.com/painel",

            status: "pending"
        });

        res.json({
            success: true,
            data: {
                payment_url: assinatura.body.init_point
            }
        });

    } catch (error) {

        console.error(error);

        res.json({
            success: false
        });
    }

});


/* =========================================================
WEBHOOK MERCADO PAGO
========================================================= */

app.post("/api/webhook", async (req, res) => {

    try {

        const data = req.body;

        console.log("Webhook recebido:", data);

        if (data.type === "payment") {

            const payment = await mercadopago.payment.findById(data.data.id);

            const status = payment.body.status;

            console.log("Status pagamento:", status);

            if (status === "approved") {

                /*
                AQUI VOCÊ ATIVA O PLANO NO BANCO
                */

                console.log("Pagamento aprovado ✔");
            }
        }

        res.sendStatus(200);

    } catch (error) {

        console.error("Erro webhook", error);

        res.sendStatus(500);
    }

});


/* =========================================================
SERVER
========================================================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Servidor rodando na porta", PORT);
});