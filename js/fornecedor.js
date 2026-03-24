// ================================================================
// DASHBOARD DO FORNECEDOR — Apenas Master
// ================================================================

let _dadosFornecedor = null;
let _chartStatus = null;
let _chartPlano = null;
let _globe = null;

const API_URL_F = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

async function carregarDadosFornecedor() {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');

    try {
        const [resGeral, resMapa] = await Promise.all([
            fetch(`${API_URL_F}/usuarios/stats/geral`, { headers: { 'Authorization': `Bearer ${token}` } }),
            fetch(`${API_URL_F}/usuarios/stats/mapa`,  { headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        const geral = await resGeral.json();
        const mapa  = await resMapa.json();

        if (!geral.success) throw new Error('Falha ao carregar dados');

        _dadosFornecedor = {
            geral: geral.data,
            mapa:  mapa.success ? mapa.data : null
        };

        renderizarFornecedorDashboard(_dadosFornecedor);

    } catch (e) {
        console.error('Erro ao carregar painel fornecedor:', e);
    }
}

function renderizarFornecedorDashboard({ geral, mapa }) {
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    // KPIs status
    setEl('fkpi-total',     geral.total_usuarios    || 0);
    setEl('fkpi-ativos',    geral.usuarios_ativos   || 0);
    setEl('fkpi-inativos',  geral.usuarios_inativos || 0);
    setEl('fkpi-bloqueados',geral.usuarios_bloqueados || 0);

    // KPIs planos
    setEl('fkpi-pagantes',  geral.usuarios_pagantes || 0);
    setEl('fkpi-mensal',    geral.usuarios_mensal   || 0);
    setEl('fkpi-anual',     geral.usuarios_anual    || 0);
    setEl('fkpi-trial',     geral.usuarios_trial    || 0);

    renderizarChartStatus(geral);
    renderizarChartPlano(geral);

    if (mapa) renderizarGlobo(mapa);

    const btnAtualizar = document.getElementById('btn-atualizar-fornecedor');
    if (btnAtualizar) btnAtualizar.onclick = carregarDadosFornecedor;
}

function renderizarChartStatus(geral) {
    const canvas = document.getElementById('chart-usuarios-status');
    if (!canvas) return;
    if (_chartStatus) { _chartStatus.destroy(); _chartStatus = null; }

    _chartStatus = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: ['Ativos', 'Inativos', 'Bloqueados'],
            datasets: [{
                data: [
                    parseInt(geral.usuarios_ativos)    || 0,
                    parseInt(geral.usuarios_inativos)  || 0,
                    parseInt(geral.usuarios_bloqueados) || 0
                ],
                backgroundColor: [
                    'rgba(46,204,113,0.85)',
                    'rgba(243,156,18,0.85)',
                    'rgba(231,76,60,0.85)'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: 'var(--text-primary,#333)', padding: 16 } },
                tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}` } }
            },
            cutout: '65%'
        }
    });
}

function renderizarChartPlano(geral) {
    const canvas = document.getElementById('chart-usuarios-plano');
    if (!canvas) return;
    if (_chartPlano) { _chartPlano.destroy(); _chartPlano = null; }

    _chartPlano = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: ['Mensal', 'Anual', 'Trial', 'Expirado'],
            datasets: [{
                data: [
                    parseInt(geral.usuarios_mensal)    || 0,
                    parseInt(geral.usuarios_anual)     || 0,
                    parseInt(geral.usuarios_trial)     || 0,
                    parseInt(geral.usuarios_expirados) || 0
                ],
                backgroundColor: [
                    'rgba(99,102,241,0.85)',
                    'rgba(139,92,246,0.85)',
                    'rgba(59,130,246,0.85)',
                    'rgba(156,163,175,0.85)'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: 'var(--text-primary,#333)', padding: 16 } },
                tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}` } }
            },
            cutout: '65%'
        }
    });
}

// Mapeamento de países (PT-BR) → coordenadas
const COORDS_PAISES = {
    'brasil': [-14.235, -51.925], 'brazil': [-14.235, -51.925],
    'portugal': [39.399, -8.224],
    'estados unidos': [37.09, -95.71], 'usa': [37.09, -95.71], 'eua': [37.09, -95.71],
    'argentina': [-38.416, -63.617],
    'chile': [-35.675, -71.543],
    'colombia': [4.571, -74.297],
    'mexico': [23.634, -102.553], 'méxico': [23.634, -102.553],
    'peru': [-9.190, -75.015],
    'venezuela': [6.424, -66.590],
    'bolívia': [-16.290, -63.589], 'bolivia': [-16.290, -63.589],
    'uruguai': [-32.523, -55.765],
    'paraguai': [-23.422, -58.444],
    'equador': [-1.831, -78.184], 'ecuador': [-1.831, -78.184],
    'alemanha': [51.166, 10.452], 'germany': [51.166, 10.452],
    'frança': [46.228, 2.214], 'france': [46.228, 2.214],
    'espanha': [40.463, -3.750], 'spain': [40.463, -3.750],
    'itália': [41.872, 12.567], 'italy': [41.872, 12.567],
    'reino unido': [55.378, -3.436], 'uk': [55.378, -3.436],
    'canadá': [56.130, -106.347], 'canada': [56.130, -106.347],
    'austrália': [-25.275, 133.775], 'australia': [-25.275, 133.775],
    'japão': [36.205, 138.252], 'japan': [36.205, 138.252],
    'china': [35.861, 104.195],
    'índia': [20.594, 78.963], 'india': [20.594, 78.963],
    'rússia': [61.524, 105.319], 'russia': [61.524, 105.319],
    'angola': [-11.202, 17.874],
    'moçambique': [-18.666, 35.530], 'mozambique': [-18.666, 35.530],
    'cabo verde': [16.002, -24.013]
};

function obterCoords(pais) {
    if (!pais || pais === 'Não informado') return null;
    const key = pais.toLowerCase().trim();
    return COORDS_PAISES[key] || null;
}

function renderizarGlobo(mapa) {
    const container = document.getElementById('fornecedor-globe-container');
    if (!container || typeof Globe === 'undefined') return;

    // Mapear países para pontos com coordenadas
    const pontos = (mapa.por_pais || [])
        .map(p => {
            const coords = obterCoords(p.pais);
            if (!coords) return null;
            return {
                lat: coords[0],
                lng: coords[1],
                size: Math.max(0.3, Math.log2(parseInt(p.total) + 1) * 0.15),
                color: '#a78bfa',
                label: `${p.pais}: ${p.total} usuário(s)`
            };
        })
        .filter(Boolean);

    if (_globe) {
        // Atualizar dados se já existe
        _globe.pointsData(pontos);
        return;
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    _globe = Globe()(container)
        .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
        .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
        .backgroundImageUrl('https://unpkg.com/three-globe/example/img/night-sky.png')
        .pointsData(pontos)
        .pointLat('lat')
        .pointLng('lng')
        .pointAltitude('size')
        .pointColor('color')
        .pointRadius(0.5)
        .pointLabel('label')
        .width(container.clientWidth || 700)
        .height(420);

    // Auto-rotação
    _globe.controls().autoRotate = true;
    _globe.controls().autoRotateSpeed = 0.5;
}

window.carregarDadosFornecedor = carregarDadosFornecedor;
