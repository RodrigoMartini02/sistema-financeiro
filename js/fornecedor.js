// ================================================================
// DASHBOARD DO FORNECEDOR — Apenas Master
// ================================================================

let _dadosFornecedor = null;
let _chartPais = null;
let _chartStatus = null;

async function carregarDadosFornecedor() {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

    try {
        const [resGeral, resMapa] = await Promise.all([
            fetch(`${API_URL}/usuarios/stats/geral`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch(`${API_URL}/usuarios/stats/mapa`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
        ]);

        const [geral, mapa] = await Promise.all([resGeral.json(), resMapa.json()]);

        if (!geral.success || !mapa.success) throw new Error('Falha ao carregar dados');

        _dadosFornecedor = { geral: geral.data, mapa: mapa.data };
        renderizarFornecedorDashboard(_dadosFornecedor);

    } catch (e) {
        console.error('Erro ao carregar painel fornecedor:', e);
        const tbody = document.getElementById('tabela-geo-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--danger)">Erro ao carregar dados</td></tr>';
    }
}

function renderizarFornecedorDashboard({ geral, mapa }) {
    // KPIs
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('fkpi-total', geral.total_usuarios || 0);
    setEl('fkpi-ativos', geral.usuarios_ativos || 0);
    setEl('fkpi-inativos', geral.usuarios_inativos || 0);
    setEl('fkpi-bloqueados', geral.usuarios_bloqueados || 0);
    setEl('fkpi-paises', mapa.por_pais ? mapa.por_pais.filter(p => p.pais !== 'Não informado').length : 0);

    // Gráfico: Usuários por País
    const porPais = mapa.por_pais || [];
    const topPaises = porPais.slice(0, 10);
    renderizarChartPais(topPaises);

    // Gráfico: Status
    renderizarChartStatus(geral);

    // Tabela geográfica
    renderizarTabelaGeo(mapa.detalhado || []);

    // Filtro da tabela
    const inputBusca = document.getElementById('fornecedor-busca');
    if (inputBusca) {
        inputBusca.oninput = () => {
            const termo = inputBusca.value.toLowerCase();
            const filtrado = (mapa.detalhado || []).filter(r =>
                (r.pais || '').toLowerCase().includes(termo) ||
                (r.estado || '').toLowerCase().includes(termo) ||
                (r.cidade || '').toLowerCase().includes(termo)
            );
            renderizarTabelaGeo(filtrado);
        };
    }

    // Botão atualizar
    const btnAtualizar = document.getElementById('btn-atualizar-fornecedor');
    if (btnAtualizar) btnAtualizar.onclick = carregarDadosFornecedor;
}

function renderizarChartPais(dados) {
    const canvas = document.getElementById('chart-usuarios-pais');
    if (!canvas) return;
    if (_chartPais) { _chartPais.destroy(); _chartPais = null; }

    const cores = [
        'rgba(52,152,219,0.8)', 'rgba(46,204,113,0.8)', 'rgba(243,156,18,0.8)',
        'rgba(155,89,182,0.8)', 'rgba(231,76,60,0.8)', 'rgba(26,188,156,0.8)',
        'rgba(241,196,15,0.8)', 'rgba(52,73,94,0.8)', 'rgba(149,165,166,0.8)',
        'rgba(230,126,34,0.8)'
    ];

    _chartPais = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: dados.map(d => d.pais),
            datasets: [{
                label: 'Usuários',
                data: dados.map(d => parseInt(d.total)),
                backgroundColor: cores.slice(0, dados.length),
                borderRadius: 4,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.parsed.x} usuário(s)`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: 'var(--text-secondary, #aaa)', stepSize: 1 },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    ticks: { color: 'var(--text-secondary, #aaa)' },
                    grid: { display: false }
                }
            }
        }
    });
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
                    parseInt(geral.usuarios_ativos) || 0,
                    parseInt(geral.usuarios_inativos) || 0,
                    parseInt(geral.usuarios_bloqueados) || 0
                ],
                backgroundColor: [
                    'rgba(46,204,113,0.8)',
                    'rgba(243,156,18,0.8)',
                    'rgba(231,76,60,0.8)'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: 'var(--text-primary, #fff)', padding: 16 }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.parsed} usuário(s)`
                    }
                }
            },
            cutout: '65%'
        }
    });
}

function renderizarTabelaGeo(dados) {
    const tbody = document.getElementById('tabela-geo-body');
    if (!tbody) return;

    if (!dados.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary)">Nenhum resultado encontrado</td></tr>';
        return;
    }

    tbody.innerHTML = dados.map(row => {
        const total = parseInt(row.total) || 0;
        const ativos = parseInt(row.ativos) || 0;
        const pct = total > 0 ? Math.round((ativos / total) * 100) : 0;
        const corPct = pct >= 75 ? 'var(--success, #2ecc71)' : pct >= 50 ? 'var(--warning, #f39c12)' : 'var(--danger, #e74c3c)';
        return `
            <tr>
                <td>${row.pais || '-'}</td>
                <td>${row.estado || '-'}</td>
                <td>${row.cidade || '-'}</td>
                <td>${total}</td>
                <td>${ativos}</td>
                <td style="color:${corPct};font-weight:600">${pct}%</td>
            </tr>
        `;
    }).join('');
}

window.carregarDadosFornecedor = carregarDadosFornecedor;
