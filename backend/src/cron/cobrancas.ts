import { and, eq, gte, isNotNull, lte } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';

const DIAS_AVISO_PLANO = [7, 1, 0];
const DIAS_AVISO_TRIAL = [3, 1, 0];
const TRIAL_DURACAO_DIAS = 15;

function frontendUrl(): string {
  return process.env['FRONTEND_URL'] ?? 'https://fin-gerence.com.br';
}

async function enviarEmailCobranca(params: {
  email: string;
  nome: string;
  diasRestantes: number;
  tipoPlano: string;
  linkRenovacao: string;
}): Promise<void> {
  const serviceId = process.env['EMAILJS_SERVICE_ID'];
  const templateId = process.env['EMAILJS_TEMPLATE_COBRANCA_ID'];
  const userId = process.env['EMAILJS_USER_ID'];

  if (!serviceId || !templateId || !userId) {
    console.warn('[cobranca cron] Credenciais EmailJS nao configuradas. Configure EMAILJS_TEMPLATE_COBRANCA_ID.');
    return;
  }

  let assunto: string;
  if (params.diasRestantes === 0) {
    assunto = 'Seu plano expirou hoje — renove agora';
  } else if (params.diasRestantes === 1) {
    assunto = 'Seu plano expira amanha!';
  } else {
    assunto = `Seu plano expira em ${params.diasRestantes} dias`;
  }

  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: frontendUrl(),
      },
      body: JSON.stringify({
        service_id: serviceId,
        template_id: templateId,
        user_id: userId,
        template_params: {
          to_email: params.email,
          to_name: params.nome,
          assunto,
          dias_restantes: params.diasRestantes,
          tipo_plano: params.tipoPlano,
          link_renovacao: params.linkRenovacao,
          sistema_nome: 'FINGERENCE',
        },
      }),
    });

    if (response.ok) {
      console.log(`[cobranca cron] Email enviado para ${params.email} (${params.diasRestantes} dias restantes)`);
    } else {
      console.error(`[cobranca cron] Erro ao enviar email: ${response.status} - ${await response.text()}`);
    }
  } catch (error) {
    console.error('[cobranca cron] Erro ao enviar email:', (error as Error).message);
  }
}

async function verificarPlanosAtivos(): Promise<void> {
  const agora = new Date();
  const limite = new Date(agora.getTime() + 8 * 24 * 60 * 60 * 1000);

  const planosAtivos = await db
    .select({
      email: users.email,
      name: users.name,
      planType: users.planType,
      planExpiration: users.planExpiration,
    })
    .from(users)
    .where(
      and(
        eq(users.planStatus, 'ativo'),
        isNotNull(users.planExpiration),
        gte(users.planExpiration, agora),
        lte(users.planExpiration, limite),
      ),
    );

  for (const usuario of planosAtivos) {
    if (!usuario.planExpiration) continue;
    const diasRestantes = Math.round(
      (usuario.planExpiration.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (DIAS_AVISO_PLANO.includes(diasRestantes)) {
      await enviarEmailCobranca({
        email: usuario.email,
        nome: usuario.name,
        diasRestantes,
        tipoPlano: usuario.planType === 'anual' ? 'Premium' : 'Plus',
        linkRenovacao: `${frontendUrl()}/app.html?planos=1`,
      });
    }
  }
}

async function verificarTrials(): Promise<void> {
  const agora = new Date();

  const usuariosTrial = await db
    .select({
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.planStatus, 'trial'));

  for (const usuario of usuariosTrial) {
    if (!usuario.createdAt) continue;
    const diasDecorridos = Math.floor(
      (agora.getTime() - usuario.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    const diasRestantes = Math.max(0, TRIAL_DURACAO_DIAS - diasDecorridos);

    if (DIAS_AVISO_TRIAL.includes(diasRestantes)) {
      await enviarEmailCobranca({
        email: usuario.email,
        nome: usuario.name,
        diasRestantes,
        tipoPlano: 'Grátis',
        linkRenovacao: `${frontendUrl()}/app.html?planos=1`,
      });
    }
  }
}

async function executarVerificacaoCobrancas(): Promise<void> {
  console.log('[cobranca cron] Iniciando verificacao de vencimentos...');
  try {
    await verificarPlanosAtivos();
    await verificarTrials();
    console.log('[cobranca cron] Verificacao concluida.');
  } catch (error) {
    console.error('[cobranca cron] Erro:', (error as Error).message);
  }
}

function nextEightAM(from: Date = new Date()): Date {
  const result = new Date(from);
  result.setHours(8, 0, 0, 0);
  if (result.getTime() <= from.getTime()) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

let activeTimer: NodeJS.Timeout | null = null;

function scheduleNext(): void {
  if (activeTimer) {
    clearTimeout(activeTimer);
  }

  const next = nextEightAM();
  const delay = next.getTime() - Date.now();

  activeTimer = setTimeout(() => {
    executarVerificacaoCobrancas()
      .catch((error) => console.error('[cobranca cron] Erro no disparo agendado:', error))
      .finally(() => scheduleNext());
  }, delay);

  console.log(`[cobranca cron] Proxima verificacao agendada para ${next.toISOString()}`);
}

export function startCobrancaCron(): void {
  scheduleNext();
}
