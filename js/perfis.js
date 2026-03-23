// ================================================================
// GERENCIAMENTO DE PERFIS PF/PJ
// ================================================================

const PERFIL_KEY = 'perfilAtivoId';

function getPerfilAtivo() {
    return parseInt(localStorage.getItem(PERFIL_KEY)) || null;
}

function setPerfilAtivo(perfilId, nome, tipo) {
    localStorage.setItem(PERFIL_KEY, perfilId);
    localStorage.setItem('perfilAtivoNome', nome);
    localStorage.setItem('perfilAtivoTipo', tipo);
    atualizarSwitcherUI(nome, tipo);
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
    const perfis = await carregarPerfis();
    if (!perfis.length) return;

    // Garantir que há um perfil ativo salvo válido
    let perfilAtivoId = getPerfilAtivo();
    if (!perfilAtivoId || !perfis.find(p => p.id === perfilAtivoId)) {
        const pessoal = perfis.find(p => p.tipo === 'pessoal') || perfis[0];
        setPerfilAtivo(pessoal.id, pessoal.nome, pessoal.tipo);
        perfilAtivoId = pessoal.id;
    }

    renderizarDropdownPerfis(perfis, perfilAtivoId);
    configurarEventosSwitcher();
}

function renderizarDropdownPerfis(perfis, perfilAtivoId) {
    const lista = document.getElementById('lista-perfis-dropdown');
    if (!lista) return;

    lista.innerHTML = perfis.map(p => `
        <button class="perfil-dropdown-item ${p.id === perfilAtivoId ? 'ativo' : ''}"
                data-perfil-id="${p.id}" data-perfil-nome="${p.nome}" data-perfil-tipo="${p.tipo}">
            <i class="fas ${p.tipo === 'empresa' ? 'fa-building' : 'fa-user'}"></i>
            ${p.nome}
            ${p.id === perfilAtivoId ? '<i class="fas fa-check perfil-check"></i>' : ''}
        </button>
    `).join('');

    lista.querySelectorAll('.perfil-dropdown-item[data-perfil-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = parseInt(btn.dataset.perfilId);
            const nome = btn.dataset.perfilNome;
            const tipo = btn.dataset.perfilTipo;
            setPerfilAtivo(id, nome, tipo);
            fecharDropdownPerfil();
            // Recarregar dados do app com novo perfil
            if (typeof window.recarregarDadosApp === 'function') {
                window.recarregarDadosApp();
            }
        });
    });
}

function atualizarSwitcherUI(nome, tipo) {
    const nomeEl = document.getElementById('perfil-nome-atual');
    const iconeEl = document.getElementById('perfil-icone');
    if (nomeEl) nomeEl.textContent = nome;
    if (iconeEl) {
        iconeEl.className = `fas ${tipo === 'empresa' ? 'fa-building' : 'fa-user'}`;
    }
    // Mostrar/ocultar aba empresa no dashboard
    const btnTemaEmpresa = document.querySelector('.tema-btn-empresa');
    if (btnTemaEmpresa) {
        if (tipo === 'empresa') {
            btnTemaEmpresa.style.display = '';
        } else {
            btnTemaEmpresa.style.display = 'none';
            // Se o tema empresa estava ativo, voltar para saude
            const temaAtivo = document.querySelector('.tema-btn.active');
            if (temaAtivo && temaAtivo.dataset.tema === 'empresa') {
                const temaSaude = document.querySelector('.tema-btn[data-tema="saude"]');
                if (temaSaude) temaSaude.click();
            }
        }
    }
}

function configurarEventosSwitcher() {
    const btn = document.getElementById('btn-perfil-atual');
    const dropdown = document.getElementById('perfil-dropdown');
    const btnGerenciar = document.getElementById('btn-gerenciar-empresas');

    if (btn) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown?.classList.toggle('hidden');
        });
    }

    document.addEventListener('click', () => fecharDropdownPerfil());

    if (btnGerenciar) {
        btnGerenciar.addEventListener('click', () => {
            fecharDropdownPerfil();
            if (typeof window.abrirConfiguracoesEmpresas === 'function') {
                window.abrirConfiguracoesEmpresas();
            }
        });
    }

    // Restaurar UI do perfil salvo
    const nome = localStorage.getItem('perfilAtivoNome') || 'Pessoal';
    const tipo = localStorage.getItem('perfilAtivoTipo') || 'pessoal';
    atualizarSwitcherUI(nome, tipo);
}

function fecharDropdownPerfil() {
    document.getElementById('perfil-dropdown')?.classList.add('hidden');
}

window.getPerfilAtivo = getPerfilAtivo;
window.setPerfilAtivo = setPerfilAtivo;
window.inicializarPerfis = inicializarPerfis;
window.carregarPerfis = carregarPerfis;
window.fecharDropdownPerfil = fecharDropdownPerfil;
