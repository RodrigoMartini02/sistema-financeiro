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
    const sel = document.getElementById('select-perfil-ativo');
    if (sel) sel.value = perfilId;
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
        perfilAtivoId = pessoal.id;
    }

    popularSelectPerfil(perfis, perfilAtivoId);
    configurarEventoSelect(perfis);

    atualizarVisibilidadeTemaEmpresa();
}

function atualizarVisibilidadeTemaEmpresa() {
    const btnTemaEmpresa = document.querySelector('.tema-btn-empresa');
    if (!btnTemaEmpresa) return;
    const temEmpresa = _perfisCarregados.some(p => p.tipo === 'empresa' && p.ativo !== false);
    if (temEmpresa) {
        btnTemaEmpresa.style.display = '';
    } else {
        btnTemaEmpresa.style.display = 'none';
        const temaAtivo = document.querySelector('.tema-btn.active');
        if (temaAtivo && temaAtivo.dataset.tema === 'empresa') {
            document.querySelector('.tema-btn[data-tema="saude"]')?.click();
        }
    }
}

function popularSelectPerfil(perfis, perfilAtivoId) {
    const sel = document.getElementById('select-perfil-ativo');
    if (!sel) return;

    const pessoal  = perfis.find(p => p.tipo === 'pessoal');
    const empresas = perfis.filter(p => p.tipo === 'empresa' && p.ativo !== false);

    let html = '';

    if (pessoal) {
        html += `<option value="${pessoal.id}">👤 Pessoal (PF)</option>`;
    }

    if (empresas.length) {
        html += `<optgroup label="Empresas (PJ)">`;
        empresas.forEach(e => {
            const nome = e.nome_fantasia || e.razao_social || e.nome;
            html += `<option value="${e.id}">🏢 ${nome}</option>`;
        });
        html += `</optgroup>`;
    }

    sel.innerHTML = html;
    sel.value = perfilAtivoId;
}

function configurarEventoSelect(perfis) {
    const sel = document.getElementById('select-perfil-ativo');
    if (!sel) return;

    sel.addEventListener('change', () => {
        const id = parseInt(sel.value);
        const perfil = perfis.find(p => p.id === id);
        if (!perfil) return;
        setPerfilAtivo(perfil.id, perfil.nome || perfil.nome_fantasia || perfil.razao_social, perfil.tipo);
        const label = perfil.tipo === 'pessoal'
            ? 'Carregando perfil pessoal...'
            : `Carregando ${perfil.nome_fantasia || perfil.razao_social || perfil.nome}...`;
        _recarregarComFeedback(label);
    });
}


function _recarregarComFeedback(mensagem) {
    const sel = document.getElementById('select-perfil-ativo');
    if (sel) sel.style.opacity = '0.5';
    if (typeof window.mostrarToast === 'function') window.mostrarToast(mensagem, 'info');
    if (typeof window.recarregarDadosApp === 'function') {
        window.recarregarDadosApp().finally(() => {
            if (sel) sel.style.opacity = '';
            // Notificar IA sobre troca de perfil
            if (window.IA && typeof window.IA.notificarTrocaPerfil === 'function') {
                const nome = localStorage.getItem('perfilAtivoNome') || '';
                const tipo = localStorage.getItem('perfilAtivoTipo') || 'pessoal';
                window.IA.notificarTrocaPerfil(nome, tipo);
            }
        });
    }
}

// P3.2 — Sincronizar troca de perfil entre abas do browser
window.addEventListener('storage', (e) => {
    if (e.key === PERFIL_KEY && e.newValue && e.newValue !== e.oldValue) {
        atualizarVisibilidadeTemaEmpresa();
        const sel = document.getElementById('select-perfil-ativo');
        if (sel) sel.value = e.newValue;
        if (typeof window.recarregarDadosApp === 'function') window.recarregarDadosApp();
    }
});

window.getPerfilAtivo = getPerfilAtivo;
window.setPerfilAtivo = setPerfilAtivo;
window.inicializarPerfis = inicializarPerfis;
window.carregarPerfis = carregarPerfis;
