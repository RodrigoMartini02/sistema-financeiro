// ================================================================
// DASHBOARD DO FORNECEDOR — Apenas Master
// ================================================================

let _dadosFornecedor = null;
let _chartStatus = null;

async function carregarDadosFornecedor() {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

    try {
        const resGeral = await fetch(`${API_URL}/usuarios/stats/geral`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const geral = await resGeral.json();
        if (!geral.success) throw new Error('Falha ao carregar dados');

        _dadosFornecedor = { geral: geral.data };
        renderizarFornecedorDashboard(_dadosFornecedor);

    } catch (e) {
        console.error('Erro ao carregar painel fornecedor:', e);
    }
}

function renderizarFornecedorDashboard({ geral }) {
    const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setEl('fkpi-total', geral.total_usuarios || 0);
    setEl('fkpi-ativos', geral.usuarios_ativos || 0);
    setEl('fkpi-inativos', geral.usuarios_inativos || 0);
    setEl('fkpi-bloqueados', geral.usuarios_bloqueados || 0);

    renderizarChartStatus(geral);

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

window.carregarDadosFornecedor = carregarDadosFornecedor;
