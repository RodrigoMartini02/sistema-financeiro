// ================================================================
// PLANOS.JS — Gerenciamento de planos e upgrade
// ================================================================

const API_URL_PLANOS = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

// ================================================================
// INICIALIZAÇÃO — carrega status do plano ao iniciar
// ================================================================

window.addEventListener('sistemaFinanceiroReady', () => {
    carregarStatusPlano();
});

async function carregarStatusPlano() {
    try {
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        if (!token) return;

        const response = await fetch(`${API_URL_PLANOS}/planos/status`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) return;

        const data = await response.json();
        if (data.success) {
            atualizarSidebarPlano(data.data);
        }
    } catch (error) {
        console.warn('Não foi possível carregar status do plano:', error);
    }
}

// ================================================================
// ATUALIZAR SIDEBAR conforme status
// ================================================================

function atualizarSidebarPlano(plano) {
    const trialBanner   = document.getElementById('trial-banner');
    const expiradoBanner = document.getElementById('expirado-banner');
    const btnUpgrade    = document.getElementById('btn-upgrade');
    const btnLabel      = document.getElementById('btn-upgrade-label');

    if (!trialBanner || !btnUpgrade) return;

    // Ocultar tudo antes de mostrar o correto
    trialBanner.style.display   = 'none';
    expiradoBanner.style.display = 'none';
    btnUpgrade.style.display    = 'none';

    if (plano.status === 'trial') {
        const diasRestantes = plano.dias_restantes_trial ?? 0;
        const progresso = Math.max(0, Math.min(100, ((15 - diasRestantes) / 15) * 100));

        document.getElementById('trial-dias-restantes').textContent =
            diasRestantes === 1 ? '1 dia restante' : `${diasRestantes} dias restantes`;
        document.getElementById('trial-progress-fill').style.width = `${progresso}%`;

        trialBanner.style.display = 'block';
        btnLabel.textContent = 'Assinar agora';
        btnUpgrade.style.display = 'flex';

    } else if (plano.status === 'expirado') {
        expiradoBanner.style.display = 'flex';
        btnLabel.textContent = 'Renovar acesso';
        btnUpgrade.style.display = 'flex';

    } else if (plano.status === 'ativo') {
        if (plano.plano_tipo) {
            btnLabel.textContent = plano.plano_tipo === 'anual' ? 'Plano Anual ativo' : 'Plano Mensal ativo';
            btnUpgrade.style.display = 'flex';
            btnUpgrade.style.background = 'rgba(74, 222, 128, 0.15)';
            btnUpgrade.style.border = '1px solid rgba(74, 222, 128, 0.3)';
            btnUpgrade.style.color = '#4ade80';
            btnUpgrade.onclick = abrirModalPlanos;
        }
    }
}

// ================================================================
// MODAL
// ================================================================

window.abrirModalPlanos = function() {
    const modal = document.getElementById('modal-planos');
    if (modal) modal.style.display = 'flex';
};

window.fecharModalPlanos = function() {
    const modal = document.getElementById('modal-planos');
    if (modal) modal.style.display = 'none';
};

window.fecharModalPlanosOverlay = function(event) {
    if (event.target === document.getElementById('modal-planos')) {
        fecharModalPlanos();
    }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') fecharModalPlanos();
});

// ================================================================
// ASSINAR — placeholder para integração Mercado Pago
// ================================================================

window.assinar = async function(tipo, formaPagamento) {
    try {
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        if (!token) return;

        const response = await fetch(`${API_URL_PLANOS}/planos/assinar`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ tipo, forma_pagamento: formaPagamento })
        });

        const data = await response.json();

        if (data.success) {
            if (data.data?.payment_url) {
                // Quando MP estiver integrado: redirecionar para o checkout
                window.open(data.data.payment_url, '_blank');
            } else {
                // Placeholder: feedback para o usuário
                const msgs = {
                    'mensal+pix': 'Em breve: pagamento via PIX para o plano Mensal (R$ 79,90/mês).',
                    'mensal+cartao': 'Em breve: pagamento via Cartão para o plano Mensal (R$ 79,90/mês).',
                    'anual+cartao': 'Em breve: pagamento via Cartão para o plano Anual (R$ 639,90/ano).'
                };
                const key = `${tipo}+${formaPagamento}`;
                alert(msgs[key] || 'Integração de pagamento em configuração. Em breve disponível!');
            }
        } else {
            alert(data.message || 'Erro ao iniciar pagamento');
        }
    } catch (error) {
        console.error('Erro ao assinar:', error);
        alert('Erro ao iniciar pagamento. Tente novamente.');
    }
};
