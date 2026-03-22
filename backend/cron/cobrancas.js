// ================================================================
// CRON DE COBRANCAS — envia e-mails de aviso de vencimento
// Roda diariamente às 8h
// ================================================================

const cron = require('node-cron');
const { query } = require('../config/database');
const { enviarEmailCobranca } = require('../routes/planos');

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://sistema-financeiro-kxed.onrender.com';

// Dias antes do vencimento em que o e-mail é enviado
const DIAS_AVISO = [7, 1, 0];

async function executarVerificacaoCobrancas() {
    console.log('[Cron Cobrancas] Iniciando verificacao de vencimentos...');

    try {
        const agora = new Date();

        // ---- Planos ativos: verificar vencimento próximo ----
        const planosAtivos = await query(
            `SELECT id, nome, email, plano_tipo, plano_expiracao
             FROM usuarios
             WHERE plano_status = 'ativo'
               AND plano_expiracao IS NOT NULL
               AND plano_expiracao >= NOW()
               AND plano_expiracao <= NOW() + INTERVAL '8 days'`
        );

        for (const usuario of planosAtivos.rows) {
            const expiracao = new Date(usuario.plano_expiracao);
            const diffMs = expiracao - agora;
            const diasRestantes = Math.round(diffMs / (1000 * 60 * 60 * 24));

            if (DIAS_AVISO.includes(diasRestantes)) {
                await enviarEmailCobranca({
                    email: usuario.email,
                    nome: usuario.nome,
                    diasRestantes,
                    tipoPlano: usuario.plano_tipo === 'anual' ? 'Premium' : 'Plus',
                    linkRenovacao: `${FRONTEND_URL}/app.html?planos=1`
                });
            }
        }

        // ---- Trial: avisar nos últimos 3 dias ----
        const usuariosTrial = await query(
            `SELECT id, nome, email, data_cadastro
             FROM usuarios
             WHERE plano_status = 'trial'`
        );

        for (const usuario of usuariosTrial.rows) {
            const dataCadastro = new Date(usuario.data_cadastro);
            const diasDecorridos = Math.floor((agora - dataCadastro) / (1000 * 60 * 60 * 24));
            const diasRestantes = Math.max(0, 15 - diasDecorridos);

            if ([3, 1, 0].includes(diasRestantes)) {
                await enviarEmailCobranca({
                    email: usuario.email,
                    nome: usuario.nome,
                    diasRestantes,
                    tipoPlano: 'Grátis',
                    linkRenovacao: `${FRONTEND_URL}/app.html?planos=1`
                });
            }
        }

        console.log('[Cron Cobrancas] Verificacao concluida.');
    } catch (error) {
        console.error('[Cron Cobrancas] Erro:', error.message);
    }
}

function iniciarCronCobrancas() {
    // Toda dia às 8h (horário do servidor)
    cron.schedule('0 8 * * *', executarVerificacaoCobrancas, {
        timezone: 'America/Sao_Paulo'
    });

    console.log('[Cron Cobrancas] Agendado para rodar diariamente as 08:00 (America/Sao_Paulo)');
}

module.exports = { iniciarCronCobrancas };
