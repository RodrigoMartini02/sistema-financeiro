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
    setEl('fkpi-trial',      geral.usuarios_trial      || 0);
    setEl('fkpi-cancelados', geral.usuarios_cancelados || 0);

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

// Coordenadas de países como fallback (quando usuário tem país mas não tem GPS)
const COORDS_PAISES = {
    'brasil': [-14.235, -51.925], 'brazil': [-14.235, -51.925],
    'portugal': [39.399, -8.224],
    'estados unidos': [37.09, -95.71], 'usa': [37.09, -95.71], 'eua': [37.09, -95.71],
    'argentina': [-38.416, -63.617], 'chile': [-35.675, -71.543],
    'colombia': [4.571, -74.297], 'mexico': [23.634, -102.553], 'méxico': [23.634, -102.553],
    'peru': [-9.190, -75.015], 'venezuela': [6.424, -66.590],
    'bolívia': [-16.290, -63.589], 'bolivia': [-16.290, -63.589],
    'uruguai': [-32.523, -55.765], 'paraguai': [-23.422, -58.444],
    'equador': [-1.831, -78.184], 'ecuador': [-1.831, -78.184],
    'alemanha': [51.166, 10.452], 'germany': [51.166, 10.452],
    'frança': [46.228, 2.214], 'france': [46.228, 2.214],
    'espanha': [40.463, -3.750], 'spain': [40.463, -3.750],
    'itália': [41.872, 12.567], 'italy': [41.872, 12.567],
    'reino unido': [55.378, -3.436], 'uk': [55.378, -3.436],
    'canadá': [56.130, -106.347], 'canada': [56.130, -106.347],
    'austrália': [-25.275, 133.775], 'australia': [-25.275, 133.775],
    'japão': [36.205, 138.252], 'japan': [36.205, 138.252],
    'china': [35.861, 104.195], 'índia': [20.594, 78.963], 'india': [20.594, 78.963],
    'rússia': [61.524, 105.319], 'russia': [61.524, 105.319],
    'angola': [-11.202, 17.874], 'moçambique': [-18.666, 35.530],
    'cabo verde': [16.002, -24.013]
};

function obterCoords(pais) {
    if (!pais || pais === 'Não informado') return null;
    return COORDS_PAISES[pais.toLowerCase().trim()] || null;
}

function _criarIconeLeaflet(cor) {
    return L.divIcon({
        className: '',
        html: `<div style="
            width:14px;height:14px;border-radius:50%;
            background:${cor};border:2px solid #fff;
            box-shadow:0 0 6px ${cor}88;
        "></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
        popupAnchor: [0, -8]
    });
}

function renderizarGlobo(mapa) {
    const container = document.getElementById('fornecedor-globe-container');
    if (!container || typeof L === 'undefined') return;

    // Destruir mapa anterior se existir
    if (_globe) { _globe.remove(); _globe = null; }

    // Criar mapa Leaflet
    _globe = L.map(container, { zoomControl: true, attributionControl: true });

    // Camadas de tiles
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors', maxZoom: 19
    });
    const satelliteLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri', maxZoom: 19
    });
    const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenTopoMap', maxZoom: 17
    });

    osmLayer.addTo(_globe);

    // Controle de camadas
    L.control.layers({
        'Mapa': osmLayer,
        'Satélite': satelliteLayer,
        'Topográfico': topoLayer
    }).addTo(_globe);

    // Grupos de marcadores com clustering
    const clusterUsuarios = typeof L.markerClusterGroup === 'function'
        ? L.markerClusterGroup({ maxClusterRadius: 40 }) : L.layerGroup();
    const clusterEmpresas = typeof L.markerClusterGroup === 'function'
        ? L.markerClusterGroup({ maxClusterRadius: 40 }) : L.layerGroup();
    const clusterPaises = L.layerGroup();

    const iconeUsuario = _criarIconeLeaflet('#a78bfa');
    const iconeEmpresa = _criarIconeLeaflet('#fb923c');
    const iconePais    = _criarIconeLeaflet('#60a5fa');

    // Usuários com GPS exato — roxo
    (mapa.pontos_exatos || []).forEach(u => {
        const lat = parseFloat(u.latitude), lng = parseFloat(u.longitude);
        if (isNaN(lat) || isNaN(lng)) return;
        L.marker([lat, lng], { icon: iconeUsuario })
            .bindPopup(`<b>👤 ${u.nome}</b><br>${u.cidade || ''}${u.cidade && u.pais ? ', ' : ''}${u.pais || ''}`)
            .addTo(clusterUsuarios);
    });

    // Empresas com GPS — laranja
    (mapa.empresas || []).forEach(e => {
        const lat = parseFloat(e.latitude), lng = parseFloat(e.longitude);
        if (isNaN(lat) || isNaN(lng)) return;
        L.marker([lat, lng], { icon: iconeEmpresa })
            .bindPopup(`<b>🏢 ${e.nome}</b>${e.atividade ? '<br>' + e.atividade : ''}`)
            .addTo(clusterEmpresas);
    });

    // Fallback: países sem GPS — azul (círculo proporcional)
    const paisesComGPS = new Set((mapa.pontos_exatos || []).map(u => (u.pais || '').toLowerCase().trim()));
    (mapa.por_pais || []).forEach(p => {
        if (paisesComGPS.has((p.pais || '').toLowerCase().trim())) return;
        const coords = obterCoords(p.pais);
        if (!coords) return;
        const total = parseInt(p.total) || 1;
        L.circleMarker(coords, {
            radius: Math.max(6, Math.min(20, total * 4)),
            fillColor: '#60a5fa', color: '#fff',
            weight: 1.5, fillOpacity: 0.7
        }).bindPopup(`<b>🌍 ${p.pais}</b><br>${total} usuário(s)`)
          .addTo(clusterPaises);
    });

    clusterUsuarios.addTo(_globe);
    clusterEmpresas.addTo(_globe);
    clusterPaises.addTo(_globe);

    // Controle de camadas de dados
    L.control.layers({}, {
        '👤 Usuários': clusterUsuarios,
        '🏢 Empresas': clusterEmpresas,
        '🌍 Por País': clusterPaises
    }, { collapsed: false, position: 'bottomright' }).addTo(_globe);

    // Legenda
    const legenda = L.control({ position: 'bottomleft' });
    legenda.onAdd = () => {
        const div = L.DomUtil.create('div');
        div.style.cssText = 'background:rgba(255,255,255,0.92);padding:8px 12px;border-radius:8px;font-size:12px;line-height:1.8;box-shadow:0 2px 8px rgba(0,0,0,0.15)';
        div.innerHTML = `
            <div><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#a78bfa;margin-right:6px;border:2px solid #fff;box-shadow:0 0 4px #a78bfa88"></span>Usuário (GPS)</div>
            <div><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#fb923c;margin-right:6px;border:2px solid #fff;box-shadow:0 0 4px #fb923c88"></span>Empresa (GPS)</div>
            <div><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#60a5fa;margin-right:6px;border:2px solid #fff;box-shadow:0 0 4px #60a5fa88"></span>País (sem GPS)</div>
        `;
        return div;
    };
    legenda.addTo(_globe);

    // Ajustar view
    const todosPontos = [
        ...(mapa.pontos_exatos || []).map(u => [parseFloat(u.latitude), parseFloat(u.longitude)]),
        ...(mapa.empresas || []).map(e => [parseFloat(e.latitude), parseFloat(e.longitude)])
    ].filter(p => !isNaN(p[0]) && !isNaN(p[1]));

    if (todosPontos.length > 0) {
        _globe.fitBounds(L.latLngBounds(todosPontos), { padding: [30, 30], maxZoom: 10 });
    } else {
        _globe.setView([-14, -51], 3);
    }

    // Forçar resize ao mostrar o container
    setTimeout(() => _globe.invalidateSize(), 200);
}

window.carregarDadosFornecedor = carregarDadosFornecedor;
