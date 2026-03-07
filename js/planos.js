// ================================================================
// PLANOS.JS — Gerenciamento de planos, pagamento e bloqueio
// ================================================================

const API_URL_PLANOS = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

let planoSelecionado = null; // 'mensal' | 'anual'
let metodoSelecionado = 'cartao'; // 'cartao' | 'pix'
let sistemaEstaBloqueado = false;
let mpInstance = null; // Mercado Pago SDK instance
let pixIntervalId = null;
let contextoCartaoPlano = null; // { nome, bandeira, ultimos_digitos } vindo de configurações

// ================================================================
// INICIALIZAÇÃO
// ================================================================

window.addEventListener('sistemaFinanceiroReady', () => {
    carregarStatusPlano();
    carregarMPPublicKey();
    // Revalida a cada 1 hora em background
    setInterval(carregarStatusPlano, 60 * 60 * 1000);
});

async function carregarMPPublicKey() {
    try {
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        if (!token) return;

        const res = await fetch(`${API_URL_PLANOS}/planos/config`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;

        const data = await res.json();
        if (data.success && data.public_key && typeof MercadoPago !== 'undefined') {
            mpInstance = new MercadoPago(data.public_key);
        }
    } catch (e) {
        console.warn('MP SDK nao inicializado:', e.message);
    }
}

// ================================================================
// STATUS DO PLANO
// ================================================================

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

        const diasEl = document.getElementById('trial-dias-restantes');
        const fillEl = document.getElementById('trial-progress-fill');
        if (diasEl) diasEl.textContent =
            diasRestantes === 1 ? '1 dia restante' : `${diasRestantes} dias restantes`;
        if (fillEl) fillEl.style.width = `${progresso}%`;

        trialBanner.style.display = 'flex';
        if (btnLabel) btnLabel.textContent = 'Assinar agora';
        btnUpgrade.style.cssText = '';
        btnUpgrade.style.display = 'flex';

    } else if (plano.status === 'expirado') {
        expiradoBanner.style.display = 'flex';
        btnUpgrade.style.display = 'none'; // banner expirado já tem botão "Renovar" inline

    } else if (plano.status === 'ativo') {
        const tipo = plano.plano_tipo;
        if (btnLabel) {
            btnLabel.textContent = tipo === 'anual' ? 'Plano Anual ativo' : tipo === 'master' ? 'Plano Master' : 'Plano Mensal ativo';
        }
        btnUpgrade.style.cssText = '';
        btnUpgrade.style.display = 'flex';
        if (tipo !== 'master') {
            // Verde para plano pago ativo — clique abre tela gerenciar
            btnUpgrade.style.background = 'rgba(74, 222, 128, 0.18)';
            btnUpgrade.style.border = '1px solid rgba(74, 222, 128, 0.28)';
            btnUpgrade.style.color = '#4ade80';
            btnUpgrade.onclick = () => abrirGerenciarPlano(plano);
        }
    }
}

// ================================================================
// MODAL — abrir / fechar
// ================================================================

window.abrirModalPlanos = function () {
    mostrarTelaPlanos();
    // Esconde o overlay de bloqueio para o modal aparecer por cima
    const overlay = document.getElementById('overlay-bloqueio');
    if (overlay) overlay.style.display = 'none';
    const modal = document.getElementById('modal-planos');
    if (modal) modal.style.display = 'flex';
};

// Define o cartão de configurações a ser usado como referência visual no pagamento
window.definirContextoCartaoPlano = function (ctx) {
    contextoCartaoPlano = ctx;
};

window.fecharModalPlanos = function () {
    if (sistemaEstaBloqueado) return;
    const modal = document.getElementById('modal-planos');
    if (modal) modal.style.display = 'none';
    pararContagemPix();
};

function fecharModalAposPageamento() {
    // Chamado após pagamento confirmado — não reexibe overlay pois plano foi ativado
    const modal = document.getElementById('modal-planos');
    if (modal) modal.style.display = 'none';
    pararContagemPix();
}

window.fecharModalPlanosOverlay = function (event) {
    // Clique fora do modal enquanto bloqueado → reexibe o overlay de bloqueio
    if (event.target !== document.getElementById('modal-planos')) return;
    if (sistemaEstaBloqueado) {
        const modal = document.getElementById('modal-planos');
        if (modal) modal.style.display = 'none';
        pararContagemPix();
        const overlay = document.getElementById('overlay-bloqueio');
        if (overlay) overlay.style.display = 'flex';
        return;
    }
    fecharModalPlanos();
};


document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sistemaEstaBloqueado) fecharModalPlanos();
});

// ================================================================
// TELA 1 — Seleção do plano
// ================================================================

function mostrarTelaPlanos() {
    planoSelecionado = null;
    document.getElementById('pgmt-tela-planos').style.display = 'block';
    document.getElementById('pgmt-tela-pagamento').style.display = 'none';
    document.getElementById('pgmt-tela-gerenciar').style.display = 'none';
}

function atualizarBannerCartaoContexto() {
    const banner = document.getElementById('pgmt-banner-cartao-ctx');
    if (!banner) return;

    if (!contextoCartaoPlano) {
        banner.style.display = 'none';
        return;
    }

    const { nome, bandeira, ultimos_digitos } = contextoCartaoPlano;
    const BANDEIRA_LABELS = {
        visa: 'Visa', mastercard: 'Mastercard', elo: 'Elo',
        hipercard: 'Hipercard', amex: 'Amex', outro: ''
    };
    const bandeiraLabel = BANDEIRA_LABELS[bandeira] || '';
    const digitosLabel = ultimos_digitos ? ` ****${ultimos_digitos}` : '';
    const label = [nome, bandeiraLabel].filter(Boolean).join(' ') + digitosLabel;

    banner.querySelector('#pgmt-banner-cartao-nome').textContent = label;
    banner.style.display = 'flex';
}

window.irParaPagamento = function (tipo) {
    planoSelecionado = tipo;

    const nomes  = { mensal: 'Mensal', anual: 'Anual' };
    const precos = { mensal: 'R$ 79,90/mês', anual: 'R$ 639,90/ano' };

    const resumoEl = document.getElementById('pgmt-pag-resumo');
    if (resumoEl) resumoEl.textContent = `${nomes[tipo]} · ${precos[tipo]}`;

    document.getElementById('pgmt-tela-planos').style.display = 'none';
    document.getElementById('pgmt-tela-pagamento').style.display = 'block';
    document.getElementById('pgmt-tela-gerenciar').style.display = 'none';

    // Exibe banner do cartão vindo de configurações (se houver)
    atualizarBannerCartaoContexto();

    // Reset do estado de pagamento
    selecionarMetodo('cartao');
    resetarBotaoAssinar();
    esconderPixDisplay();
};

window.voltarParaPlanos = function () {
    pararContagemPix();
    contextoCartaoPlano = null; // limpa contexto ao voltar
    mostrarTelaPlanos();
};

// ================================================================
// TELA 2 — Tabs cartão / PIX
// ================================================================

window.selecionarMetodo = function (metodo) {
    metodoSelecionado = metodo;

    const tabCartao = document.getElementById('pgmt-tab-cartao');
    const tabPix    = document.getElementById('pgmt-tab-pix');
    const formCartao = document.getElementById('pgmt-form-cartao');
    const formPix    = document.getElementById('pgmt-form-pix');
    const btnAssinar = document.getElementById('pgmt-btn-assinar');

    if (metodo === 'cartao') {
        tabCartao.classList.add('pgmt-tab-ativo');
        tabPix.classList.remove('pgmt-tab-ativo');
        formCartao.style.display = 'block';
        formPix.style.display = 'none';
        btnAssinar.style.display = 'flex';
        esconderPixDisplay();
    } else {
        tabPix.classList.add('pgmt-tab-ativo');
        tabCartao.classList.remove('pgmt-tab-ativo');
        formCartao.style.display = 'none';
        formPix.style.display = 'block';
        btnAssinar.style.display = 'flex';
        esconderPixDisplay();
    }

    atualizarTextoBotao();
    resetarBotaoAssinar();
};

function esconderPixDisplay() {
    pararContagemPix();
    const pixDisplay = document.getElementById('pgmt-pix-display');
    const pixInstrucao = document.getElementById('pgmt-pix-instrucao');
    if (pixDisplay) pixDisplay.style.display = 'none';
    if (pixInstrucao) pixInstrucao.style.display = 'block';
}

function atualizarTextoBotao() {
    const btn = document.getElementById('pgmt-btn-assinar');
    if (!btn) return;
    if (metodoSelecionado === 'pix') {
        btn.innerHTML = '<i class="fas fa-qrcode"></i> Gerar QR Code';
    } else {
        btn.innerHTML = '<i class="fas fa-lock"></i> Confirmar pagamento';
    }
}

function resetarBotaoAssinar() {
    const btn = document.getElementById('pgmt-btn-assinar');
    if (!btn) return;
    btn.disabled = false;
    atualizarTextoBotao();
}

// ================================================================
// PROCESSAR PAGAMENTO
// ================================================================

window.processarPagamento = async function () {
    if (!planoSelecionado) return;

    if (metodoSelecionado === 'pix') {
        await gerarPix();
    } else {
        await pagarCartao();
    }
};

// ================================================================
// CARTÃO — tokenização MP + assinatura recorrente
// ================================================================

async function pagarCartao() {
    const numero = document.getElementById('pgmt-card-number')?.value.replace(/\s/g, '');
    const expiry = document.getElementById('pgmt-card-expiry')?.value;
    const cvv    = document.getElementById('pgmt-card-cvv')?.value;
    const nome   = document.getElementById('pgmt-card-name')?.value.trim();
    const cpf    = document.getElementById('pgmt-card-cpf')?.value.replace(/\D/g, '');

    if (!numero || !expiry || !cvv || !nome || !cpf) {
        mostrarErro('Preencha todos os campos do cartão.');
        return;
    }

    const [mesStr, anoStr] = expiry.split('/');
    if (!mesStr || !anoStr || mesStr.length !== 2 || anoStr.length !== 2) {
        mostrarErro('Data de validade inválida. Use MM/AA.');
        return;
    }

    if (!mpInstance) {
        mostrarErro('Módulo de pagamento não carregado. Recarregue a página e tente novamente.');
        return;
    }

    const btn = document.getElementById('pgmt-btn-assinar');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';

    try {
        // Tokeniza o cartão via Mercado Pago SDK v2
        const cardToken = await mpInstance.createCardToken({
            cardNumber: numero,
            cardholderName: nome,
            cardExpirationMonth: mesStr,
            cardExpirationYear: `20${anoStr}`,
            securityCode: cvv,
            identificationType: 'CPF',
            identificationNumber: cpf
        });

        if (!cardToken?.id) {
            mostrarErro('Não foi possível validar o cartão. Verifique os dados e tente novamente.');
            btn.disabled = false;
            atualizarTextoBotao();
            return;
        }

        const recorrente = document.getElementById('pgmt-recorrente')?.checked ?? true;
        const endpoint = recorrente ? 'assinar-recorrente' : 'pagar-cartao';

        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        const response = await fetch(`${API_URL_PLANOS}/planos/${endpoint}`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tipo: planoSelecionado,
                card_token: cardToken.id
            })
        });

        const data = await response.json();

        if (data.success) {
            fecharModalAposPageamento();
            await carregarStatusPlano();
            const msg = recorrente
                ? 'Assinatura ativada! Seu cartão será cobrado automaticamente a cada período.'
                : 'Pagamento aprovado! Seu plano está ativo.';
            alert(msg);
        } else {
            mostrarErro(data.message || 'Não foi possível processar o pagamento. Verifique os dados do cartão.');
            btn.disabled = false;
            atualizarTextoBotao();
        }
    } catch (error) {
        console.error('Erro assinatura cartão:', error);
        mostrarErro('Erro ao processar. Verifique sua conexão e tente novamente.');
        btn.disabled = false;
        atualizarTextoBotao();
    }
}

// ================================================================
// PIX — geração de QR Code
// ================================================================

async function gerarPix() {
    const btn = document.getElementById('pgmt-btn-assinar');
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
            mostrarPixDisplay(data.data);
        } else {
            mostrarErro(data.message || 'Erro ao gerar PIX. Tente novamente.');
            resetarBotaoAssinar();
        }
    } catch (error) {
        console.error('Erro PIX:', error);
        mostrarErro('Erro ao gerar PIX. Verifique sua conexão e tente novamente.');
        resetarBotaoAssinar();
    }
}

function mostrarPixDisplay(dados) {
    const pixInstrucao = document.getElementById('pgmt-pix-instrucao');
    const pixDisplay   = document.getElementById('pgmt-pix-display');
    const img          = document.getElementById('pgmt-pix-img');
    const codigoInput  = document.getElementById('pgmt-pix-codigo');
    const btnAssinar   = document.getElementById('pgmt-btn-assinar');

    img.src = `data:image/png;base64,${dados.qr_code_base64}`;
    codigoInput.value = dados.qr_code;

    pixInstrucao.style.display = 'none';
    pixDisplay.style.display   = 'flex';
    btnAssinar.style.display   = 'none';

    iniciarContagemPix(30 * 60);
}

// ================================================================
// PIX — contagem regressiva
// ================================================================

function pararContagemPix() {
    if (pixIntervalId) {
        clearInterval(pixIntervalId);
        pixIntervalId = null;
    }
}

function iniciarContagemPix(segundos) {
    pararContagemPix();
    const el = document.getElementById('pgmt-pix-validade');
    let restantes = segundos;

    function atualizar() {
        const min = Math.floor(restantes / 60);
        const seg = restantes % 60;
        if (el) el.textContent = `PIX válido por ${min}:${String(seg).padStart(2, '0')}`;

        if (restantes <= 0) {
            pararContagemPix();
            if (el) el.textContent = 'PIX expirado. Gere um novo.';
            const btnJaPaguei = document.querySelector('.pgmt-btn-ja-paguei');
            if (btnJaPaguei) btnJaPaguei.style.display = 'none';
        }
        restantes--;
    }

    atualizar();
    pixIntervalId = setInterval(atualizar, 1000);
}

// ================================================================
// PIX — ações do usuário
// ================================================================

window.copiarPix = function () {
    const codigo = document.getElementById('pgmt-pix-codigo')?.value;
    if (!codigo) return;

    navigator.clipboard.writeText(codigo).then(() => {
        const btn = document.querySelector('.pgmt-btn-copiar');
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
        const input = document.getElementById('pgmt-pix-codigo');
        input.select();
        document.execCommand('copy');
    });
};

window.verificarPagamentoPix = async function () {
    const btn = document.querySelector('.pgmt-btn-ja-paguei');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
    }

    await carregarStatusPlano();

    if (!sistemaEstaBloqueado) {
        pararContagemPix();
        fecharModalAposPageamento();
        alert('Pagamento confirmado! Seu plano está ativo. Obrigado!');
    } else {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Já paguei';
        }
        alert('Pagamento ainda não identificado. Aguarde alguns instantes e tente novamente.');
    }
};

// ================================================================
// FORMATAÇÃO DOS INPUTS DO CARTÃO
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
    const numInput = document.getElementById('pgmt-card-number');
    const expInput = document.getElementById('pgmt-card-expiry');
    const cvvInput = document.getElementById('pgmt-card-cvv');
    const cpfInput = document.getElementById('pgmt-card-cpf');

    if (numInput) {
        numInput.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '').slice(0, 16);
            e.target.value = v.replace(/(.{4})/g, '$1 ').trim();

            // Detectar bandeira
            const brand = document.getElementById('pgmt-brand');
            if (brand) {
                const num = v;
                if (/^4/.test(num))        brand.innerHTML = '<i class="fab fa-cc-visa"></i>';
                else if (/^5[1-5]/.test(num)) brand.innerHTML = '<i class="fab fa-cc-mastercard"></i>';
                else if (/^3[47]/.test(num))  brand.innerHTML = '<i class="fab fa-cc-amex"></i>';
                else if (/^6/.test(num))   brand.innerHTML = '<i class="fas fa-credit-card"></i>';
                else                       brand.innerHTML = '<i class="fas fa-credit-card" style="opacity:.3"></i>';
            }

        });
    }

    if (expInput) {
        expInput.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '').slice(0, 4);
            if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
            e.target.value = v;
        });
    }

    if (cvvInput) {
        cvvInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
        });
    }

    if (cpfInput) {
        cpfInput.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '').slice(0, 11);
            v = v.replace(/(\d{3})(\d)/, '$1.$2')
                 .replace(/(\d{3})(\d)/, '$1.$2')
                 .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
            e.target.value = v;
        });
    }
});

// ================================================================
// TELA 3 — Gerenciar / Cancelar plano
// ================================================================

async function abrirGerenciarPlano(plano) {
    // Mostra modal e navega para tela gerenciar
    const modal = document.getElementById('modal-planos');
    if (modal) modal.style.display = 'flex';

    document.getElementById('pgmt-tela-planos').style.display = 'none';
    document.getElementById('pgmt-tela-pagamento').style.display = 'none';
    document.getElementById('pgmt-tela-gerenciar').style.display = 'block';

    // Preenche info do plano
    const nomePlano = plano.plano_tipo === 'anual' ? 'Plano Anual' : 'Plano Mensal';
    const renovacao = plano.plano_tipo === 'anual'
        ? 'Cancelamento com reembolso proporcional'
        : 'Cancelamento sem reembolso';

    document.getElementById('pgmt-ger-plano').textContent = nomePlano;
    document.getElementById('pgmt-ger-renovacao').textContent = renovacao;

    // Data de início
    const inicioEl = document.getElementById('pgmt-ger-inicio');
    if (plano.plano_inicio || plano.data_cadastro) {
        const d = new Date(plano.plano_inicio || plano.data_cadastro);
        inicioEl.textContent = d.toLocaleDateString('pt-BR');
    } else {
        inicioEl.textContent = '—';
    }

    // Busca preview do reembolso
    const reembolsoBox = document.getElementById('pgmt-reembolso-box');
    reembolsoBox.style.display = 'none';

    if (plano.plano_tipo === 'anual') {
        try {
            const token = sessionStorage.getItem('token') || localStorage.getItem('token');
            const res = await fetch(`${API_URL_PLANOS}/planos/cancelar/preview`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.success && data.data.elegivel) {
                document.getElementById('pgmt-ger-meses-rest').textContent = data.data.meses_restantes;
                document.getElementById('pgmt-ger-valor-reembolso').textContent =
                    `R$ ${data.data.reembolso.toFixed(2).replace('.', ',')}`;
                reembolsoBox.style.display = 'block';
            }
        } catch (e) {
            console.warn('Nao foi possivel carregar preview de reembolso:', e.message);
        }
    }
}

window.abrirGerenciarPlano = abrirGerenciarPlano;

window.confirmarCancelamento = async function () {
    const confirmado = confirm(
        'Tem certeza que deseja cancelar sua assinatura?\n\n' +
        'O acesso será bloqueado IMEDIATAMENTE após a confirmação.'
    );
    if (!confirmado) return;

    const btn = document.getElementById('pgmt-btn-cancelar-confirm');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cancelando...';
    }

    try {
        const token = sessionStorage.getItem('token') || localStorage.getItem('token');
        const res = await fetch(`${API_URL_PLANOS}/planos/cancelar`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await res.json();

        if (data.success) {
            alert(data.message + (data.aviso ? `\n\n⚠️ ${data.aviso}` : ''));
            // Bloqueia o sistema localmente e fecha modal
            sistemaEstaBloqueado = true;
            const modal = document.getElementById('modal-planos');
            if (modal) modal.style.display = 'none';
            bloquearSistema();
        } else {
            alert(data.message || 'Erro ao cancelar assinatura.');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-times-circle"></i> Cancelar assinatura';
            }
        }
    } catch (e) {
        alert('Erro ao conectar com o servidor. Tente novamente.');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-times-circle"></i> Cancelar assinatura';
        }
    }
};

// ================================================================
// UTILITÁRIO
// ================================================================

function mostrarErro(msg) {
    alert(msg);
}
