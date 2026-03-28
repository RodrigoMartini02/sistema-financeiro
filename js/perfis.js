// ================================================================
// GERENCIAMENTO DE PERFIS PF/PJ
// ================================================================

const PERFIL_KEY = 'perfilAtivoId';

let _perfisCarregados = [];

function getPerfilAtivo() {
    return parseInt(localStorage.getItem(PERFIL_KEY)) || null;
}

function setPerfilAtivo(perfilId, nome, tipo) {
    localStorage.setItem(PERFIL_KEY, perfilId);
    localStorage.setItem('perfilAtivoNome', nome);
    localStorage.setItem('perfilAtivoTipo', tipo);
    atualizarSwitcherUI(tipo);
    atualizarVisibilidadeTemaEmpresa(tipo);
    const selectEmpresa = document.getElementById('select-empresa-ativa');
    if (selectEmpresa && tipo === 'empresa') selectEmpresa.value = perfilId;
}

async function carregarPerfis() {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';
    try {
        const res = await fetch(`${API_URL}/perfis`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        return data.success ? data.data : [];
    } catch (e) {
        console.error('Erro ao carregar perfis:', e);
        return [];
    }
}

async function inicializarPerfis() {
    let perfis = await carregarPerfis();

    // Segurança: se usuário não tem perfil (conta antiga), criar pessoal
    if (!perfis.length) {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';
        try {
            await fetch(`${API_URL}/perfis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ tipo: 'pessoal', nome: 'Pessoal' })
            });
            perfis = await carregarPerfis();
        } catch (e) {
            console.error('Erro ao criar perfil padrão:', e);
            if (typeof window.mostrarToast === 'function') {
                window.mostrarToast('Erro ao inicializar perfil. Recarregue a página.', 'error');
            }
        }
    }

    _perfisCarregados = perfis;
    if (!perfis.length) return;

    // Garantir que há um perfil ativo salvo válido
    let perfilAtivoId = getPerfilAtivo();
    if (!perfilAtivoId || !perfis.find(p => p.id === perfilAtivoId)) {
        const pessoal = perfis.find(p => p.tipo === 'pessoal') || perfis[0];
        setPerfilAtivo(pessoal.id, pessoal.nome, pessoal.tipo);
    }

    // Restaurar UI
    const tipo = localStorage.getItem('perfilAtivoTipo') || 'pessoal';
    atualizarSwitcherUI(tipo);
    atualizarVisibilidadeTemaEmpresa(tipo);

    configurarEventosSwitcher(perfis);
}

function popularSelectEmpresas(empresas) {
    const select = document.getElementById('select-empresa-ativa');
    if (!select) return;
    select.innerHTML = empresas.map(e =>
        `<option value="${e.id}">${e.nome_fantasia || e.razao_social || e.nome}</option>`
    ).join('');
}

function configurarEventosSwitcher(perfis) {
    const btnPF = document.getElementById('btn-perfil-pf');
    const btnPJ = document.getElementById('btn-perfil-pj');
    const selectEmpresa = document.getElementById('select-empresa-ativa');

    const perfilPessoal  = perfis.find(p => p.tipo === 'pessoal');
    const perfisEmpresa  = perfis.filter(p => p.tipo === 'empresa' && p.ativo !== false);
    const primeiraEmpresa = perfisEmpresa[0];

    if (btnPJ) btnPJ.classList.toggle('disabled', !primeiraEmpresa);

    if (btnPF) {
        btnPF.addEventListener('click', () => {
            if (!perfilPessoal) return;
            if (localStorage.getItem('perfilAtivoTipo') === 'pessoal') return;
            setPerfilAtivo(perfilPessoal.id, perfilPessoal.nome, perfilPessoal.tipo);
            _recarregarComFeedback('Carregando perfil pessoal...');
        });
    }

    if (btnPJ) {
        btnPJ.addEventListener('click', () => {
            if (!primeiraEmpresa) return;
            if (localStorage.getItem('perfilAtivoTipo') === 'empresa') return;
            setPerfilAtivo(primeiraEmpresa.id, primeiraEmpresa.nome, primeiraEmpresa.tipo);
            _recarregarComFeedback(`Carregando ${primeiraEmpresa.nome_fantasia || primeiraEmpresa.nome}...`);
        });
    }

    // Múltiplas empresas: popular select e registrar handler de troca
    if (perfisEmpresa.length > 1) {
        popularSelectEmpresas(perfisEmpresa);

        if (selectEmpresa) {
            selectEmpresa.addEventListener('change', () => {
                const empresaSelecionada = perfisEmpresa.find(e => e.id === parseInt(selectEmpresa.value));
                if (!empresaSelecionada) return;
                setPerfilAtivo(empresaSelecionada.id, empresaSelecionada.nome, empresaSelecionada.tipo);
                _recarregarComFeedback(`Carregando ${empresaSelecionada.nome_fantasia || empresaSelecionada.nome}...`);
            });
        }
    }

    // Sincronizar select com perfil ativo atual
    const perfilAtivoId = getPerfilAtivo();
    if (selectEmpresa && perfisEmpresa.find(e => e.id === perfilAtivoId)) {
        selectEmpresa.value = perfilAtivoId;
    }
}

function atualizarSwitcherUI(tipo) {
    const btnPF = document.getElementById('btn-perfil-pf');
    const btnPJ = document.getElementById('btn-perfil-pj');
    const selectEmpresa = document.getElementById('select-empresa-ativa');
    if (!btnPF || !btnPJ) return;

    const nomeAtivo = localStorage.getItem('perfilAtivoNome') || '';

    if (tipo === 'empresa') {
        btnPF.classList.remove('ativo');
        btnPF.title = 'Pessoal (PF)';
        btnPJ.classList.add('ativo');
        btnPJ.title = `Empresa ativa: ${nomeAtivo}`;
        if (selectEmpresa && selectEmpresa.options.length > 1) {
            selectEmpresa.style.display = '';
            const perfilAtivoId = getPerfilAtivo();
            if (perfilAtivoId) selectEmpresa.value = perfilAtivoId;
        }
    } else {
        btnPF.classList.add('ativo');
        btnPF.title = `Perfil ativo: ${nomeAtivo}`;
        btnPJ.classList.remove('ativo');
        btnPJ.title = 'Empresa (PJ)';
        if (selectEmpresa) selectEmpresa.style.display = 'none';
    }
}

function atualizarVisibilidadeTemaEmpresa(tipo) {
    const btnTemaEmpresa = document.querySelector('.tema-btn-empresa');
    if (!btnTemaEmpresa) return;
    if (tipo === 'empresa') {
        btnTemaEmpresa.style.display = '';
    } else {
        btnTemaEmpresa.style.display = 'none';
        const temaAtivo = document.querySelector('.tema-btn.active');
        if (temaAtivo && temaAtivo.dataset.tema === 'empresa') {
            document.querySelector('.tema-btn[data-tema="saude"]')?.click();
        }
    }
}

function _recarregarComFeedback(mensagem) {
    const switcher = document.getElementById('perfil-switcher');
    if (switcher) switcher.style.opacity = '0.5';
    if (typeof window.mostrarToast === 'function') window.mostrarToast(mensagem, 'info');
    if (typeof window.recarregarDadosApp === 'function') {
        window.recarregarDadosApp().finally(() => {
            if (switcher) switcher.style.opacity = '';
        });
    }
}

// P3.2 — Sincronizar troca de perfil entre abas do browser
window.addEventListener('storage', (e) => {
    if (e.key === PERFIL_KEY && e.newValue && e.newValue !== e.oldValue) {
        // Outra aba trocou de perfil — recarregar silenciosamente
        const tipo = localStorage.getItem('perfilAtivoTipo') || 'pessoal';
        atualizarSwitcherUI(tipo);
        atualizarVisibilidadeTemaEmpresa(tipo);
        if (typeof window.recarregarDadosApp === 'function') window.recarregarDadosApp();
    }
});

window.getPerfilAtivo = getPerfilAtivo;
window.setPerfilAtivo = setPerfilAtivo;
window.inicializarPerfis = inicializarPerfis;
window.carregarPerfis = carregarPerfis;
