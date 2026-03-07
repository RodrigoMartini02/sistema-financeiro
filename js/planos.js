// ================================================================
// PLANOS.JS — Gerenciamento de planos, pagamento e bloqueio
// ================================================================

const API_URL_PLANOS = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

let planoSelecionado = null; // 'mensal' | 'anual'
let sistemaEstaBloqueado = false;
let pixPaymentId = null;

// ================================================================
// INICIALIZAÇÃO
// ================================================================

window.addEventListener('sistemaFinanceiroReady', () => {
    carregarStatusPlano();
    // Revalida a cada 1 hora em background
    setInterval(carregarStatusPlano, 60 * 60 * 1000);
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
        if (!data.success) return;

        const plano = data.data;

        if (plano.status === 'expirado') {
            bloquearSistema();
        } else {
            desbloquearSistema();
            atualizarSidebarPlano(plano);
        }
    } catch (error) {
        console.warn('Nao foi possivel carregar status do plano:', error);
    }
}

// ================================================================
// BLOQUEIO DO SISTEMA
// ================================================================

function bloquearSistema() {
    sistemaEstaBloqueado = true;

    const overlay = document.getElementById('overlay-bloqueio');
    if (overlay) overlay.style.display = 'flex';

    // Esconde o X do modal de planos (obriga a assinar)
    const closeBtn = document.getElementById('modal-planos-close-btn');
    if (closeBtn) closeBtn.style.display = 'none';
}

function desbloquearSistema() {
    sistemaEstaBloqueado = false;

    const overlay = document.getElementById('overlay-bloqueio');
    if (overlay) overlay.style.display = 'none';

    const closeBtn = document.getElementById('modal-planos-close-btn');
    if (closeBtn) closeBtn.style.display = 'flex';
}

// ================================================================
// SIDEBAR
// ================================================================

function atualizarSidebarPlano(plano) {
    const trialBanner    = document.getElementById('trial-banner');
    const expiradoBanner = document.getElementById('expirado-banner');
    const btnUpgrade     = document.getElementById('btn-upgrade');
    const btnLabel       = document.getElementById('btn-upgrade-label');

    if (!trialBanner || !btnUpgrade) return;

    trialBanner.style.display    = 'none';
    expiradoBanner.style.display = 'none';
    btnUpgrade.style.display     = 'none';

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
// MODAL — abrir / fechar
// ================================================================

window.abrirModalPlanos = function() {
    irParaStepPlano();
    const modal = document.getElementById('modal-planos');
    if (modal) modal.style.display = 'flex';
};

window.fecharModalPlanos = function() {
    if (sistemaEstaBloqueado) return;
    const modal = document.getElementById('modal-planos');
    if (modal) modal.style.display = 'none';
};

window.fecharModalPlanosOverlay = function(event) {
    if (sistemaEstaBloqueado) return;
    if (event.target === document.getElementById('modal-planos')) {
        fecharModalPlanos();
    }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sistemaEstaBloqueado) fecharModalPlanos();
});

// ================================================================
// STEP 1 — Seleção do plano
// ================================================================

window.selecionarPlano = function(tipo) {
    planoSelecionado = tipo;

    document.getElementById('card-mensal').classList.toggle('plano-selecionado', tipo === 'mensal');
    document.getElementById('card-anual').classList.toggle('plano-selecionado', tipo === 'anual');

    // Pequeno delay para o usuário ver a seleção antes de avançar
    setTimeout(() => irParaStepPagamento(), 220);
};

function irParaStepPlano() {
    planoSelecionado = null;
    pixPaymentId = null;

    document.getElementById('step-plano').style.display = 'block';
    document.getElementById('step-pagamento').style.display = 'none';
    document.getElementById('pix-display').style.display = 'none';
    document.getElementById('step-pagamento-acoes').style.display = 'flex';

    document.querySelectorAll('.plano-card').forEach(c => c.classList.remove('plano-selecionado'));

    // Reset radio para cartão
    const radioCartao = document.querySelector('input[name="forma-pgto"][value="cartao"]');
    if (radioCartao) radioCartao.checked = true;

    // Reset botão confirmar
    const btn = document.getElementById('btn-confirmar-pgto');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = 'Continuar <i class="fas fa-arrow-right"></i>';
    }
}

function irParaStepPagamento() {
    if (!planoSelecionado) return;

    const precos = { mensal: 'R$ 79,90/mês', anual: 'R$ 639,90/ano' };
    const nomes  = { mensal: 'Mensal', anual: 'Anual' };

    document.getElementById('step-plano-resumo').innerHTML =
        `<span class="resumo-label">Plano selecionado:</span>
         <span class="resumo-valor">${nomes[planoSelecionado]} &middot; ${precos[planoSelecionado]}</span>`;

    document.getElementById('step-plano').style.display = 'none';
    document.getElementById('step-pagamento').style.display = 'block';
    document.getElementById('pix-display').style.display = 'none';
    document.getElementById('step-pagamento-acoes').style.display = 'flex';
}

window.voltarStepPlano = function() {
    document.getElementById('step-plano').style.display = 'block';
    document.getElementById('step-pagamento').style.display = 'none';
};

// ================================================================
// STEP 2 — Confirmar forma de pagamento
// ================================================================

window.confirmarPagamento = async function() {
    const formaEl = document.querySelector('input[name="forma-pgto"]:checked');
    if (!formaEl || !planoSelecionado) return;

    const forma = formaEl.value;

    if (forma === 'pix') {
        await gerarPix();
    } else {
        // cartao ou debito → redireciona para Mercado Pago
        await abrirCheckoutMP(planoSelecionado, forma);
    }
};

// ================================================================
// PIX — geração de QR Code
// ================================================================

async function gerarPix() {
    const btn = document.getElementById('btn-confirmar-pgto');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando PIX...';

    try {
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        const response = await fetch(`${API_URL_PLANOS}/planos/pix`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ tipo: planoSelecionado })
        });

        const data = await response.json();

        if (data.success) {
            pixPaymentId = data.data.payment_id;
            mostrarPixDisplay(data.data);
        } else {
            alert(data.message || 'Erro ao gerar PIX. Tente novamente.');
            btn.disabled = false;
            btn.innerHTML = 'Continuar <i class="fas fa-arrow-right"></i>';
        }
    } catch (error) {
        console.error('Erro PIX:', error);
        alert('Erro ao gerar PIX. Verifique sua conexão e tente novamente.');
        btn.disabled = false;
        btn.innerHTML = 'Continuar <i class="fas fa-arrow-right"></i>';
    }
}

function mostrarPixDisplay(dados) {
    const img = document.getElementById('pix-qrcode-img');
    img.src = `data:image/png;base64,${dados.qr_code_base64}`;

    document.getElementById('pix-codigo-input').value = dados.qr_code;
    document.getElementById('pix-display').style.display = 'block';
    document.getElementById('step-pagamento-acoes').style.display = 'none';
    document.querySelector('.pagamento-opcoes-lista').style.display = 'none';
    document.getElementById('step-plano-resumo').style.display = 'none';

    // Contagem regressiva de 30 minutos
    iniciarContagemPix(30 * 60);
}

function iniciarContagemPix(segundos) {
    const el = document.getElementById('pix-validade');
    let restantes = segundos;

    const interval = setInterval(() => {
        restantes--;
        const min = Math.floor(restantes / 60);
        const seg = restantes % 60;
        el.textContent = `PIX valido por ${min}:${String(seg).padStart(2, '0')}`;

        if (restantes <= 0) {
            clearInterval(interval);
            el.textContent = 'PIX expirado. Gere um novo.';
            document.querySelector('.btn-ja-paguei').style.display = 'none';
        }
    }, 1000);
}

window.trocarFormaPagamento = function() {
    pixPaymentId = null;

    document.getElementById('pix-display').style.display = 'none';
    document.querySelector('.pagamento-opcoes-lista').style.display = 'flex';
    document.getElementById('step-pagamento-acoes').style.display = 'flex';
    document.getElementById('step-plano-resumo').style.display = 'flex';

    // Reset radio para cartão
    document.querySelector('input[name="forma-pgto"][value="cartao"]').checked = true;

    // Reset botão confirmar
    const btn = document.getElementById('btn-confirmar-pgto');
    btn.disabled = false;
    btn.innerHTML = 'Continuar <i class="fas fa-arrow-right"></i>';
};

window.copiarPix = function() {
    const codigo = document.getElementById('pix-codigo-input').value;
    navigator.clipboard.writeText(codigo).then(() => {
        const btn = document.querySelector('.btn-copiar-pix');
        const original = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
        btn.style.background = 'rgba(74, 222, 128, 0.25)';
        btn.style.color = '#4ade80';
        setTimeout(() => {
            btn.innerHTML = original;
            btn.style.background = '';
            btn.style.color = '';
        }, 2500);
    }).catch(() => {
        // Fallback para navegadores mais antigos
        const input = document.getElementById('pix-codigo-input');
        input.select();
        document.execCommand('copy');
    });
};

window.verificarPagamentoPix = async function() {
    const btn = document.querySelector('.btn-ja-paguei');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';

    await carregarStatusPlano();

    if (!sistemaEstaBloqueado) {
        // Plano ativado com sucesso
        fecharModalPlanos();
        alert('Pagamento confirmado! Seu plano esta ativo.');
    } else {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Ja paguei';
        alert('Pagamento ainda nao identificado. Aguarde alguns instantes e tente novamente.');
    }
};

// ================================================================
// CARTAO / DEBITO — checkout Mercado Pago
// ================================================================

async function abrirCheckoutMP(tipo, forma) {
    const btn = document.getElementById('btn-confirmar-pgto');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Aguarde...';

    try {
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        const response = await fetch(`${API_URL_PLANOS}/planos/assinar`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ tipo, forma_pagamento: forma })
        });

        const data = await response.json();

        if (data.success && data.data?.payment_url) {
            window.open(data.data.payment_url, '_blank');
        } else {
            alert(data.message || 'Erro ao abrir pagamento. Tente novamente.');
        }
    } catch (error) {
        console.error('Erro checkout MP:', error);
        alert('Erro ao abrir pagamento. Verifique sua conexao.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Continuar <i class="fas fa-arrow-right"></i>';
    }
}
