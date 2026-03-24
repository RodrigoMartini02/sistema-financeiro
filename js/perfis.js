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

function configurarEventosSwitcher(perfis) {
    const btnPF = document.getElementById('btn-perfil-pf');
    const btnPJ = document.getElementById('btn-perfil-pj');

    const perfilPessoal = perfis.find(p => p.tipo === 'pessoal');
    const perfilEmpresa  = perfis.find(p => p.tipo === 'empresa' && p.ativo !== false);

    if (btnPF) {
        btnPJ?.classList.toggle('disabled', !perfilEmpresa);

        btnPF.addEventListener('click', () => {
            if (!perfilPessoal) return;
            setPerfilAtivo(perfilPessoal.id, perfilPessoal.nome, perfilPessoal.tipo);
            if (typeof window.recarregarDadosApp === 'function') window.recarregarDadosApp();
        });
    }

    if (btnPJ) {
        btnPJ.addEventListener('click', () => {
            if (!perfilEmpresa) return;
            setPerfilAtivo(perfilEmpresa.id, perfilEmpresa.nome, perfilEmpresa.tipo);
            if (typeof window.recarregarDadosApp === 'function') window.recarregarDadosApp();
        });
    }
}

function atualizarSwitcherUI(tipo) {
    const btnPF = document.getElementById('btn-perfil-pf');
    const btnPJ = document.getElementById('btn-perfil-pj');
    if (!btnPF || !btnPJ) return;

    if (tipo === 'empresa') {
        btnPF.classList.remove('ativo');
        btnPJ.classList.add('ativo');
    } else {
        btnPF.classList.add('ativo');
        btnPJ.classList.remove('ativo');
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

window.getPerfilAtivo = getPerfilAtivo;
window.setPerfilAtivo = setPerfilAtivo;
window.inicializarPerfis = inicializarPerfis;
window.carregarPerfis = carregarPerfis;
