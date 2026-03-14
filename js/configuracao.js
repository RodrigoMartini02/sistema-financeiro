// ================================================================
// SISTEMA DE CONFIGURAÇÕES
// ================================================================

// ================================================================
// VARIÁVEIS GLOBAIS
// ================================================================
let categoriasUsuario = { despesas: [] };
let cartoesUsuario = []; // Array dinâmico de cartões com IDs únicos
let proximoIdCartao = 1; // Contador para gerar IDs únicos
let usuariosFiltrados = [];
let paginaAtual = 1;
let tipoUsuarioAtual = null;

const itensPorPagina = 10;
const categoriasPadrao = {
    despesas: ["Alimentação", "Combustível", "Moradia"]
};

// ================================================================
// UTILITÁRIOS DE VALIDAÇÃO
// ================================================================
function formatarValidade(input) {
    let validade = input.value.replace(/\D/g, '');

    if (validade.length >= 2) {
        validade = validade.replace(/(\d{2})(\d{0,4})/, '$1/$2');
    }

    input.value = validade;
}

function formatarValidadeCartao(input) {
    let v = input.value.replace(/\D/g, '');
    if (v.length >= 2) {
        v = v.substring(0, 2) + '/' + v.substring(2, 6);
    }
    input.value = v;
}

function validarValidade(validade) {
    if (!validade || validade.length !== 7) return false;
    
    const [mes, ano] = validade.split('/');
    const mesNum = parseInt(mes);
    const anoNum = parseInt(ano);
    
    if (mesNum < 1 || mesNum > 12) return false;
    if (anoNum < 2024 || anoNum > 2099) return false;
    
    const dataAtual = new Date();
    const anoAtual = dataAtual.getFullYear();
    const mesAtual = dataAtual.getMonth() + 1;
    
    if (anoNum < anoAtual || (anoNum === anoAtual && mesNum < mesAtual)) {
        return false;
    }
    
    return true;
}

// ================================================================
// SISTEMA DE CATEGORIAS
// ================================================================
async function carregarCategoriasLocal() {
    const usuario = window.usuarioDataManager?.getUsuarioAtual();
    const token = sessionStorage.getItem('token');

    // ✅ Verificar se está autenticado ANTES de fazer API call
    if (!usuario || !usuario.id || !token) {
        categoriasUsuario.despesas = [...categoriasPadrao.despesas];
        return;
    }

    try {
        // ✅ Garantir que API_URL existe
        const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

        // 🔥 BUSCAR DA API
        const response = await fetch(`${API_URL}/usuarios/${usuario.id}/categorias`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            // Silenciosamente usar padrão se não autenticado ou erro
            categoriasUsuario.despesas = [...categoriasPadrao.despesas];
            return;
        }

        const data = await response.json();

        if (data.success) {
            categoriasUsuario = data.categorias;
        } else {
            categoriasUsuario.despesas = [...categoriasPadrao.despesas];
        }
    } catch (error) {
        // Silenciosamente usar padrão em caso de erro
        categoriasUsuario.despesas = [...categoriasPadrao.despesas];
    }
}

// ✅ NOVO: Buscar categorias da API (tabela categorias)
async function buscarCategoriasAPI() {
    const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';
    try {
        const response = await fetch(`${API_URL}/categorias`, {
            headers: {
                'Authorization': `Bearer ${sessionStorage.getItem('token') || ''}`
            }
        });
        if (response.ok) {
            const data = await response.json();
            return data.data || [];
        }
        return [];
    } catch (error) {
        console.error('Erro ao buscar categorias:', error);
        return [];
    }
}

async function atualizarDropdowns() {
    try {
        const categorias = await buscarCategoriasAPI();
        if (categorias && categorias.length > 0) {
            // Apenas categorias ativas aparecem nos dropdowns
            categoriasUsuario.despesas = categorias.filter(c => c.ativo !== false);
            window.categoriasUsuario = categoriasUsuario;
        }
        if (typeof window.popularTodosOsCards === 'function') {
            window.popularTodosOsCards();
        }
    } catch (error) {
        console.error('Erro ao atualizar dropdowns:', error);
    }
}

async function adicionarCategoria() {
    const inputNovaCategoria = document.getElementById('nova-categoria-nome');
    if (!inputNovaCategoria) return;

    const nomeCat = inputNovaCategoria.value.trim();
    if (!nomeCat) {
        mostrarFeedback('Por favor, digite um nome para a categoria.', 'warning');
        return;
    }

    const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

    try {
        // ✅ CORRIGIDO: POST para criar categoria na tabela
        const response = await fetch(`${API_URL}/categorias`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('token') || ''}`
            },
            body: JSON.stringify({ nome: nomeCat })
        });

        if (response.ok) {
            inputNovaCategoria.value = '';
            await atualizarListaCategorias();
            atualizarDropdowns();
            mostrarFeedback('Categoria criada com sucesso!', 'success');

            if (window.logManager) {
                window.logManager.registrar({
                    modulo: 'Configurações',
                    acao: 'Criado',
                    categoria: 'Categoria',
                    descricao: nomeCat,
                    valor: null,
                    detalhes: 'Criou nova categoria'
                });
            }
        } else {
            const data = await response.json();
            mostrarFeedback(data.message || 'Erro ao criar categoria', 'error');
        }
    } catch (error) {
        console.error('Erro ao adicionar categoria:', error);
        mostrarFeedback('Erro ao salvar categoria. Tente novamente.', 'error');
    }
}

async function atualizarListaCategorias() {
    const listaCategorias = document.getElementById('lista-categorias');
    const semCategoriasMessage = document.getElementById('sem-categorias-message');

    if (!listaCategorias) return;

    listaCategorias.innerHTML = '';

    // ✅ CORRIGIDO: Buscar categorias da API
    const categorias = await buscarCategoriasAPI();

    if (!categorias || categorias.length === 0) {
        if (semCategoriasMessage) semCategoriasMessage.classList.remove('hidden');
        return;
    }

    if (semCategoriasMessage) semCategoriasMessage.classList.add('hidden');

    categorias.forEach(categoria => {
        const template = document.getElementById('template-linha-categoria');
        if (!template) return;

        const linha = template.content.cloneNode(true);

        // Preencher células
        const tdId = linha.querySelector('.categoria-id');
        const tdNome = linha.querySelector('.categoria-nome');
        const tdDataCriacao = linha.querySelector('.categoria-data-criacao');
        const tdDataEdicao = linha.querySelector('.categoria-data-edicao');
        const tdFavorito = linha.querySelector('.categoria-favorito');
        const btnEditar = linha.querySelector('.btn-editar-categoria');
        const btnRemover = linha.querySelector('.btn-remover-categoria');

        if (tdId) tdId.textContent = categoria.id || '-';
        if (tdNome) tdNome.textContent = categoria.nome;

        // Data de criação
        if (tdDataCriacao) {
            const dataCriacao = categoria.data_criacao ? new Date(categoria.data_criacao) : new Date();
            tdDataCriacao.textContent = dataCriacao.toLocaleDateString('pt-BR');
        }

        // Data de edição
        if (tdDataEdicao) {
            const dataEdicao = categoria.data_atualizacao ? new Date(categoria.data_atualizacao) : new Date();
            tdDataEdicao.textContent = dataEdicao.toLocaleDateString('pt-BR');
        }

        // Favorito — ícone compacto com tooltip
        if (tdFavorito) {
            const icones = {
                pix:      { icon: 'fas fa-qrcode',          color: '#10b981', title: 'PIX' },
                debito:   { icon: 'fas fa-university',       color: '#3b82f6', title: 'Débito' },
                dinheiro: { icon: 'fas fa-money-bill-wave',  color: '#f59e0b', title: 'Dinheiro' },
                credito:  { icon: 'fas fa-credit-card',      color: '#8b5cf6', title: categoria.cartao_favorito_nome || 'Crédito' }
            };
            const info = icones[categoria.forma_favorita];
            tdFavorito.innerHTML = info
                ? `<i class="${info.icon}" style="color:${info.color};font-size:15px" title="${info.title}"></i>`
                : '';
        }

        // Status ativo/inativo
        const tdStatus = linha.querySelector('.categoria-status');
        const ativo = categoria.ativo !== false;
        if (tdStatus) {
            tdStatus.innerHTML = ativo
                ? `<span class="badge-categoria-ativo">Ativa</span>`
                : `<span class="badge-categoria-inativo">Inativa</span>`;
        }

        // Linha inteira fica opaca quando inativa
        const tr = linha.querySelector('tr');
        if (tr && !ativo) tr.classList.add('categoria-inativa');

        // Configurar botões
        const btnToggle = linha.querySelector('.btn-toggle-categoria');
        if (btnEditar) btnEditar.setAttribute('data-categoria-id', categoria.id);
        if (btnToggle) {
            btnToggle.setAttribute('data-categoria-id', categoria.id);
            btnToggle.setAttribute('data-ativo', ativo ? '1' : '0');
            btnToggle.title = ativo ? 'Desativar categoria' : 'Ativar categoria';
            btnToggle.querySelector('i').className = ativo ? 'fas fa-ban' : 'fas fa-check-circle';
        }
        if (btnRemover) btnRemover.setAttribute('data-categoria-id', categoria.id);

        listaCategorias.appendChild(linha);
    });
}

async function editarCategoria(categoriaId) {
    const categorias = await buscarCategoriasAPI();
    const categoria = categorias.find(c => c.id == categoriaId);
    if (!categoria) return;

    const modalEditar = document.getElementById('modal-editar-categoria');
    const nomeInput = document.getElementById('categoria-edit-nome');
    const idInput = document.getElementById('categoria-edit-id');

    if (modalEditar && nomeInput && idInput) {
        nomeInput.value = categoria.nome;
        idInput.value = categoria.id;
        modalEditar.style.display = 'flex';
    }
}

async function toggleAtivoCategoria(categoriaId) {
    const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';
    try {
        const response = await fetch(`${API_URL}/categorias/${categoriaId}/toggle-ativo`, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token') || ''}` }
        });
        const data = await response.json();
        if (data.success) {
            mostrarFeedback(data.message, 'success');
            await atualizarListaCategorias();
            // Recarregar dropdowns dos cards para refletir o novo status
            const categorias = await buscarCategoriasAPI();
            window.categoriasUsuario = window.categoriasUsuario || {};
            window.categoriasUsuario.despesas = categorias.filter(c => c.ativo !== false);
            if (typeof window.popularTodosOsCards === 'function') window.popularTodosOsCards();
        } else {
            mostrarFeedback(data.message || 'Erro ao alterar status', 'error');
        }
    } catch (error) {
        console.error('Erro ao alterar status da categoria:', error);
        mostrarFeedback('Erro ao alterar status da categoria', 'error');
    }
}

async function removerCategoria(categoriaId) {
    const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

    // Buscar nome da categoria para confirmação
    const categorias = await buscarCategoriasAPI();
    const categoria = categorias.find(c => c.id == categoriaId);
    if (!categoria) return;

    const confirmar = confirm(`Tem certeza que deseja remover a categoria "${categoria.nome}"?`);
    if (!confirmar) return;

    try {
        // ✅ CORRIGIDO: DELETE para remover categoria da tabela
        const response = await fetch(`${API_URL}/categorias/${categoriaId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${sessionStorage.getItem('token') || ''}`
            }
        });

        if (response.ok) {
            await atualizarListaCategorias();
            atualizarDropdowns();
            mostrarFeedback('Categoria removida com sucesso!', 'success');

            if (window.logManager) {
                window.logManager.registrar({
                    modulo: 'Configurações',
                    acao: 'Excluído',
                    categoria: 'Categoria',
                    descricao: categoria.nome,
                    valor: null,
                    detalhes: 'Excluiu categoria'
                });
            }
        } else {
            mostrarFeedback('Erro ao remover categoria. Tente novamente.', 'error');
        }
    } catch (error) {
        console.error('Erro ao remover categoria:', error);
        mostrarFeedback('Erro ao remover categoria. Tente novamente.', 'error');
    }
}

async function salvarEdicaoCategoria() {
    const nomeInput = document.getElementById('categoria-edit-nome');
    const idInput = document.getElementById('categoria-edit-id');

    if (!nomeInput || !idInput) return;

    const novoNome = nomeInput.value.trim();
    const categoriaId = idInput.value;

    if (!novoNome) {
        mostrarFeedback('Por favor, digite um nome para a categoria.', 'warning');
        return;
    }

    const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

    try {
        // ✅ CORRIGIDO: PUT para atualizar categoria na tabela
        const response = await fetch(`${API_URL}/categorias/${categoriaId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('token') || ''}`
            },
            body: JSON.stringify({ nome: novoNome })
        });

        if (response.ok) {
            await atualizarListaCategorias();
            atualizarDropdowns();
            document.getElementById('modal-editar-categoria').style.display = 'none';
            mostrarFeedback('Categoria atualizada com sucesso!', 'success');

            if (window.logManager) {
                window.logManager.registrar({
                    modulo: 'Configurações',
                    acao: 'Editado',
                    categoria: 'Categoria',
                    descricao: novoNome,
                    valor: null,
                    detalhes: 'Editou categoria'
                });
            }
        } else {
            mostrarFeedback('Erro ao salvar alteração. Tente novamente.', 'error');
        }
    } catch (error) {
        console.error('Erro ao editar categoria:', error);
        mostrarFeedback('Erro ao salvar alteração. Tente novamente.', 'error');
    }
}

// ================================================================
// SISTEMA DE CARTÕES - DINÂMICO COM IDs
// ================================================================

/**
 * Carrega os cartões do usuário da API
 */
async function carregarCartoesLocal() {
    const usuario = window.usuarioDataManager?.getUsuarioAtual();
    const token = sessionStorage.getItem('token');

    // Se não está autenticado, inicializar vazio
    if (!usuario || !usuario.id || !token) {
        cartoesUsuario = [];
        window.cartoesUsuario = cartoesUsuario;
        renderizarListaCartoes();
        return;
    }

    try {
        const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

        // Buscar cartões da API
        const response = await fetch(`${API_URL}/usuarios/${usuario.id}/cartoes`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            cartoesUsuario = [];
            window.cartoesUsuario = cartoesUsuario;
            renderizarListaCartoes();
            return;
        }

        const data = await response.json();

        if (data.success && data.cartoes) {
            // Migrar formato antigo para novo (se necessário)
            cartoesUsuario = migrarCartoesSeNecessario(data.cartoes);
            window.cartoesUsuario = cartoesUsuario;
        } else {
            cartoesUsuario = [];
            window.cartoesUsuario = cartoesUsuario;
        }

        // Atualizar o próximo ID
        if (cartoesUsuario.length > 0) {
            const maxId = Math.max(...cartoesUsuario.map(c => c.id || 0));
            proximoIdCartao = maxId + 1;
        }

        // Renderizar a lista
        renderizarListaCartoes();

        // Atualizar as opções de cartões nas despesas
        atualizarOpcoesCartoes();

    } catch (error) {
        console.error('Erro ao carregar cartões:', error);
        cartoesUsuario = [];
        window.cartoesUsuario = cartoesUsuario;
        renderizarListaCartoes();
    }
}

/**
 * Migra cartões do formato antigo {cartao1, cartao2, cartao3} para array com IDs
 */
function migrarCartoesSeNecessario(cartoes) {
    // Se já é um array, retornar
    if (Array.isArray(cartoes)) {
        return cartoes.filter(c => c.banco && c.banco.trim() !== '');
    }

    // Se é objeto no formato antigo, converter
    const cartoesArray = [];
    let id = 1;

    ['cartao1', 'cartao2', 'cartao3'].forEach(key => {
        if (cartoes[key] && cartoes[key].nome && cartoes[key].nome.trim() !== '') {
            cartoesArray.push({
                id: id++,
                banco: cartoes[key].nome,
                validade: cartoes[key].validade || '',
                limite: parseFloat(cartoes[key].limite) || 0,
                ativo: cartoes[key].ativo || false
            });
        }
    });

    return cartoesArray;
}

/**
 * Cria um novo cartão via API POST
 */
async function criarCartaoAPI(cartao) {
    const token = sessionStorage.getItem('token');
    if (!token) return null;

    try {
        const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

        const response = await fetch(`${API_URL}/cartoes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                nome: cartao.banco || cartao.nome,
                dia_fechamento: cartao.dia_fechamento,
                dia_vencimento: cartao.dia_vencimento,
                limite: cartao.limite,
                ativo: cartao.ativo !== false,
                validade: cartao.validade || null
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Erro ao criar cartão:', errorData);
            return null;
        }

        const data = await response.json();
        return data.data || data.cartao || data;

    } catch (error) {
        console.error('Erro ao criar cartão:', error);
        return null;
    }
}

/**
 * Atualiza um cartão existente via API PUT
 */
async function atualizarCartaoAPI(id, cartao) {
    const token = sessionStorage.getItem('token');
    if (!token) return false;

    try {
        const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

        const response = await fetch(`${API_URL}/cartoes/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                nome: cartao.banco || cartao.nome,
                dia_fechamento: cartao.dia_fechamento,
                dia_vencimento: cartao.dia_vencimento,
                limite: cartao.limite,
                ativo: cartao.ativo !== false,
                validade: cartao.validade || null
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Erro ao atualizar cartão:', errorData);
            return false;
        }

        return true;

    } catch (error) {
        console.error('Erro ao atualizar cartão:', error);
        return false;
    }
}

/**
 * Exclui um cartão via API DELETE
 */
async function excluirCartaoAPI(id) {
    const token = sessionStorage.getItem('token');
    if (!token) return false;

    try {
        const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

        const response = await fetch(`${API_URL}/cartoes/${id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Erro ao excluir cartão:', errorData);
            return false;
        }

        return true;

    } catch (error) {
        console.error('Erro ao excluir cartão:', error);
        return false;
    }
}

/**
 * Salva os cartões na API (compatibilidade com código antigo)
 */
async function salvarCartoes() {
    // Esta função agora é um fallback - as operações individuais são preferidas
    return true;
}

/**
 * Recarrega os cartões do backend e atualiza as opções no formulário
 */
async function recarregarEAtualizarCartoes() {
    try {
        await carregarCartoesLocal();
        await atualizarOpcoesCartoes();
    } catch (error) {
        console.error('Erro ao recarregar e atualizar cartões:', error);
    }
}

// ================================================================
// PAINEL DE PAGAMENTO — CARTÕES DINÂMICOS E FAVORITO
// ================================================================

// Renderiza as linhas de cartões de crédito no painel de pagamento
async function atualizarOpcoesCartoes() {
    try {
        // Atualizar todos os cards abertos no modal de lançamento
        if (typeof window.popularTodosOsCards === 'function') {
            window.popularTodosOsCards();
        }
    } catch (error) {
        console.error('Erro ao atualizar opções de cartões:', error);
    }
}

// Persiste o favorito via API
async function _persistirFavorito(categoriaId, forma, cartaoId) {
    const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';
    const token = sessionStorage.getItem('token');
    try {
        await fetch(`${API_URL}/categorias/${categoriaId}/favorito`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ forma_favorita: forma, cartao_favorito_id: cartaoId || null })
        });
    } catch (e) {
        console.error('Erro ao salvar favorito:', e);
    }
}


/**
 * Renderiza a lista de cartões na tabela de configurações
 */
function renderizarListaCartoes() {
    const listaCartoes = document.getElementById('lista-cartoes');
    if (!listaCartoes) return;

    listaCartoes.innerHTML = '';

    if (cartoesUsuario.length === 0) {
        listaCartoes.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: #6c757d;">
                    <i class="fas fa-credit-card" style="font-size: 48px; margin-bottom: 16px; opacity: 0.3;"></i>
                    <p style="margin: 0;">Nenhum cartão cadastrado. Adicione seu primeiro cartão acima.</p>
                </td>
            </tr>
        `;
        return;
    }

    cartoesUsuario.forEach(cartao => {
        const tr = document.createElement('tr');

        const validadeDisplay = cartao.validade || '-';
        const fechamentoDisplay = cartao.dia_fechamento ? `Dia ${cartao.dia_fechamento}` : '-';
        const vencimentoDisplay = cartao.dia_vencimento ? `Dia ${cartao.dia_vencimento}` : '-';

        tr.innerHTML = `
            <td><span class="cartao-id">#${cartao.id}</span></td>
            <td><span class="cartao-banco">${cartao.banco || cartao.nome || ''}</span></td>
            <td><span class="cartao-validade">${validadeDisplay}</span></td>
            <td><span class="cartao-fechamento">${fechamentoDisplay}</span></td>
            <td><span class="cartao-vencimento">${vencimentoDisplay}</span></td>
            <td><span class="cartao-limite">R$ ${formatarValorCartao(cartao.limite)}</span></td>
            <td>
                <span class="badge-status ${cartao.ativo ? 'ativo' : 'inativo'}">
                    ${cartao.ativo ? 'Ativo' : 'Inativo'}
                </span>
            </td>
            <td class="cartao-acoes">
                <div class="acoes-grupo">
                    <button class="btn btn-sm btn-pagar-plano-cartao" onclick="usarCartaoParaPlano(${cartao.id})" title="Pagar plano com este cartão">
                        <i class="fas fa-crown"></i>
                    </button>
                    <button class="btn btn-sm btn-editar-cartao" onclick="abrirModalEditarCartao(${cartao.id})" title="Editar cartão">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-excluir-cartao" onclick="excluirCartao(${cartao.id})" title="Excluir cartão">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        listaCartoes.appendChild(tr);
    });
}

/**
 * Abre o modal de planos para pagar usando este cartão cadastrado
 */
function usarCartaoParaPlano(id) {
    const cartao = cartoesUsuario.find(c => c.id === id);
    if (!cartao) return;

    // Passa contexto do cartão para o modal de planos
    if (typeof window.definirContextoCartaoPlano === 'function') {
        window.definirContextoCartaoPlano({
            nome: cartao.banco || cartao.nome || '',
            bandeira: cartao.bandeira || '',
            ultimos_digitos: cartao.ultimos_digitos || ''
        });
    }

    if (typeof window.abrirModalPlanos === 'function') {
        window.abrirModalPlanos();
    }
}

/**
 * Formata valor monetário
 */
function formatarValorCartao(valor) {
    return parseFloat(valor).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/**
 * Adiciona um novo cartão
 */
async function adicionarCartao() {
    const inputBanco = document.getElementById('novo-cartao-banco');
    const inputFechamento = document.getElementById('novo-cartao-fechamento');
    const inputVencimento = document.getElementById('novo-cartao-vencimento');
    const inputLimite = document.getElementById('novo-cartao-limite');
    const inputValidade = document.getElementById('novo-cartao-validade');

    if (!inputBanco || !inputFechamento || !inputVencimento || !inputLimite) return;

    const banco = inputBanco.value.trim();
    const diaFechamento = parseInt(inputFechamento.value) || 0;
    const diaVencimento = parseInt(inputVencimento.value) || 0;
    const limite = parseFloat(inputLimite.value) || 0;
    const validade = inputValidade ? inputValidade.value.trim() : '';

    // Validações
    if (!banco) {
        mostrarStatusCartoes('Por favor, informe o nome do banco', 'error');
        inputBanco.focus();
        return;
    }

    if (diaFechamento < 1 || diaFechamento > 31) {
        mostrarStatusCartoes('Dia de fechamento deve ser entre 1 e 31', 'error');
        inputFechamento.focus();
        return;
    }

    if (diaVencimento < 1 || diaVencimento > 31) {
        mostrarStatusCartoes('Dia de vencimento deve ser entre 1 e 31', 'error');
        inputVencimento.focus();
        return;
    }

    if (limite <= 0) {
        mostrarStatusCartoes('O limite deve ser maior que zero', 'error');
        inputLimite.focus();
        return;
    }

    // Dados do novo cartão para a API
    const novoCartao = {
        banco: banco,
        nome: banco,
        dia_fechamento: diaFechamento,
        dia_vencimento: diaVencimento,
        limite: limite,
        ativo: true,
        validade: validade || null
    };

    mostrarStatusCartoes('Salvando cartão...', 'info');

    // Criar cartão via API POST
    const cartaoCriado = await criarCartaoAPI(novoCartao);

    if (cartaoCriado) {
        // Adicionar o cartão com o ID real do banco de dados
        const cartaoComId = {
            id: cartaoCriado.id,
            banco: banco,
            nome: banco,
            dia_fechamento: diaFechamento,
            dia_vencimento: diaVencimento,
            limite: limite,
            ativo: true,
            validade: validade || null,
            numero_cartao: cartaoCriado.numero_cartao || cartoesUsuario.length + 1
        };

        cartoesUsuario.push(cartaoComId);
        window.cartoesUsuario = cartoesUsuario;

        mostrarStatusCartoes('Cartão adicionado com sucesso!', 'success');
        inputBanco.value = '';
        if (inputValidade) inputValidade.value = '';
        inputFechamento.value = '';
        inputVencimento.value = '';
        inputLimite.value = '';
        renderizarListaCartoes();
        atualizarOpcoesCartoes();
    } else {
        mostrarStatusCartoes('Erro ao salvar o cartão. Tente novamente.', 'error');
    }
}

/**
 * Abre modal para editar cartão
 */
function abrirModalEditarCartao(id) {
    const cartao = cartoesUsuario.find(c => c.id === id);
    if (!cartao) return;

    document.getElementById('cartao-edit-id').value = cartao.id;
    document.getElementById('cartao-edit-banco').value = cartao.banco || cartao.nome || '';
    document.getElementById('cartao-edit-fechamento').value = cartao.dia_fechamento || 1;
    document.getElementById('cartao-edit-vencimento').value = cartao.dia_vencimento || 10;
    document.getElementById('cartao-edit-limite').value = cartao.limite;
    document.getElementById('cartao-edit-ativo').checked = cartao.ativo !== false;
    document.getElementById('cartao-edit-validade').value = cartao.validade || '';

    const modal = document.getElementById('modal-editar-cartao');
    if (modal) {
        modal.style.display = 'block';
        setTimeout(() => modal.classList.add('show'), 10);
    }
}

/**
 * Salva edição de cartão
 */
async function salvarEdicaoCartao(e) {
    e.preventDefault();

    const id = parseInt(document.getElementById('cartao-edit-id').value);
    const banco = document.getElementById('cartao-edit-banco').value.trim();
    const diaFechamento = parseInt(document.getElementById('cartao-edit-fechamento').value) || 0;
    const diaVencimento = parseInt(document.getElementById('cartao-edit-vencimento').value) || 0;
    const limite = parseFloat(document.getElementById('cartao-edit-limite').value) || 0;
    const ativo = document.getElementById('cartao-edit-ativo').checked;
    const validade = document.getElementById('cartao-edit-validade').value.trim() || null;

    if (!banco || limite <= 0) {
        mostrarStatusCartoes('Preencha todos os campos corretamente', 'error');
        return;
    }

    if (diaFechamento < 1 || diaFechamento > 31) {
        mostrarStatusCartoes('Dia de fechamento deve ser entre 1 e 31', 'error');
        return;
    }

    if (diaVencimento < 1 || diaVencimento > 31) {
        mostrarStatusCartoes('Dia de vencimento deve ser entre 1 e 31', 'error');
        return;
    }

    const index = cartoesUsuario.findIndex(c => c.id === id);
    if (index === -1) return;

    const cartaoAtualizado = {
        banco,
        nome: banco,
        dia_fechamento: diaFechamento,
        dia_vencimento: diaVencimento,
        limite,
        ativo,
        validade
    };

    mostrarStatusCartoes('Atualizando cartão...', 'info');

    // Atualizar cartão via API PUT
    const sucesso = await atualizarCartaoAPI(id, cartaoAtualizado);

    if (sucesso) {
        // Atualizar no array local
        cartoesUsuario[index] = {
            ...cartoesUsuario[index],
            ...cartaoAtualizado,
            id
        };
        window.cartoesUsuario = cartoesUsuario;

        mostrarStatusCartoes('Cartão atualizado com sucesso!', 'success');
        fecharModalCartao('modal-editar-cartao');
        renderizarListaCartoes();
        atualizarOpcoesCartoes();
    } else {
        mostrarStatusCartoes('Erro ao atualizar o cartão', 'error');
    }
}

/**
 * Exclui um cartão
 */
async function excluirCartao(id) {
    const cartao = cartoesUsuario.find(c => c.id === id);
    if (!cartao) return;

    if (!confirm(`Deseja realmente excluir o cartão "${cartao.banco}"?`)) return;

    mostrarStatusCartoes('Excluindo cartão...', 'info');

    // Excluir cartão via API DELETE
    const sucesso = await excluirCartaoAPI(id);

    if (sucesso) {
        // Remover do array local
        const index = cartoesUsuario.findIndex(c => c.id === id);
        if (index !== -1) {
            cartoesUsuario.splice(index, 1);
            window.cartoesUsuario = cartoesUsuario;
        }

        mostrarStatusCartoes('Cartão excluído com sucesso!', 'success');
        renderizarListaCartoes();
        atualizarOpcoesCartoes();
    } else {
        mostrarStatusCartoes('Erro ao excluir o cartão', 'error');
    }
}

function fecharModalCartao(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = 'none', 300);
    }
}

// ================================================================
// SISTEMA DE USUÁRIOS - PERMISSÕES
// ================================================================

/**
 * Verifica se o usuário atual pode visualizar outro usuário
 * @param {Object} usuario - Usuário a ser visualizado
 * @returns {boolean} - True se pode visualizar
 */
function podeVisualizarUsuario(usuario) {
    const usuarioAtual = window.usuarioDataManager?.getUsuarioAtual();
    if (!usuarioAtual) return false;

    const tipoAtual = usuarioAtual.tipo || 'padrao';

    // MASTER: Vê todos
    if (tipoAtual === 'master') return true;

    // ADMINISTRADOR: Vê apenas padrão e ele mesmo
    if (tipoAtual === 'admin') {
        if (usuario.id === usuarioAtual.id) return true;
        if (usuario.tipo === 'padrao') return true;
        return false;
    }

    // PADRÃO: Vê apenas ele mesmo
    if (tipoAtual === 'padrao') {
        return usuario.id === usuarioAtual.id;
    }

    return false;
}

/**
 * Verifica se o usuário atual pode editar outro usuário
 * @param {Object} usuario - Usuário a ser editado
 * @returns {boolean} - True se pode editar
 */
function podeEditarUsuario(usuario) {
    const usuarioAtual = window.usuarioDataManager?.getUsuarioAtual();
    if (!usuarioAtual) return false;

    const tipoAtual = usuarioAtual.tipo || 'padrao';

    // MASTER: Edita todos
    if (tipoAtual === 'master') return true;

    // ADMINISTRADOR: Edita apenas padrão e ele mesmo
    if (tipoAtual === 'admin') {
        if (usuario.id === usuarioAtual.id) return true;
        if (usuario.tipo === 'padrao') return true;
        return false;
    }

    // PADRÃO: Edita apenas ele mesmo
    if (tipoAtual === 'padrao') {
        return usuario.id === usuarioAtual.id;
    }

    return false;
}

/**
 * Verifica se o usuário atual pode excluir outro usuário
 * @param {Object} usuario - Usuário a ser excluído
 * @returns {boolean} - True se pode excluir
 */
function podeExcluirUsuario(usuario) {
    const usuarioAtual = window.usuarioDataManager?.getUsuarioAtual();
    if (!usuarioAtual) return false;

    const tipoAtual = usuarioAtual.tipo || 'padrao';

    // MASTER: Exclui todos (exceto ele mesmo para segurança)
    if (tipoAtual === 'master') {
        return usuario.id !== usuarioAtual.id;
    }

    // ADMINISTRADOR: Não pode excluir
    if (tipoAtual === 'admin') return false;

    // PADRÃO: Não pode excluir (nem ele mesmo)
    if (tipoAtual === 'padrao') return false;

    return false;
}

/**
 * Verifica se o usuário atual pode bloquear/desbloquear outro usuário
 * @param {Object} usuario - Usuário a ser bloqueado
 * @returns {boolean} - True se pode bloquear
 */
function podeBloquearUsuario(usuario) {
    const usuarioAtual = window.usuarioDataManager?.getUsuarioAtual();
    if (!usuarioAtual) return false;

    const tipoAtual = usuarioAtual.tipo || 'padrao';

    // MASTER: Bloqueia todos (exceto ele mesmo)
    if (tipoAtual === 'master') {
        return usuario.id !== usuarioAtual.id;
    }

    // ADMINISTRADOR: Bloqueia apenas padrão (não pode bloquear a si mesmo)
    if (tipoAtual === 'admin') {
        if (usuario.id === usuarioAtual.id) return false;
        return usuario.tipo === 'padrao';
    }

    // PADRÃO: Não pode bloquear
    return false;
}

/**
 * Verifica se o usuário atual pode criar novos usuários
 * @returns {boolean} - True se pode criar
 */
function podeCriarUsuario() {
    const usuarioAtual = window.usuarioDataManager?.getUsuarioAtual();
    if (!usuarioAtual) return false;

    const tipoAtual = usuarioAtual.tipo || 'padrao';

    // MASTER e ADMINISTRADOR: Podem criar usuários
    return tipoAtual === 'master' || tipoAtual === 'admin';
}

/**
 * Verifica se o usuário atual pode limpar logs
 * @returns {boolean} - True se pode limpar logs
 */
function podeLimparLogs() {
    const usuarioAtual = window.usuarioDataManager?.getUsuarioAtual();
    if (!usuarioAtual) return false;

    const tipoAtual = usuarioAtual.tipo || 'padrao';

    // Apenas MASTER pode limpar logs
    return tipoAtual === 'master';
}

/**
 * Retorna os tipos de usuário que podem ser criados pelo usuário atual
 * @returns {Array} - Array de tipos permitidos ['padrao', 'admin', 'master']
 */
function obterTiposPermitidos() {
    const usuarioAtual = window.usuarioDataManager?.getUsuarioAtual();
    if (!usuarioAtual) return ['padrao'];

    const tipoAtual = usuarioAtual.tipo || 'padrao';

    // MASTER: Pode criar todos os tipos
    if (tipoAtual === 'master') {
        return ['padrao', 'admin', 'master'];
    }

    // ADMINISTRADOR: Pode criar apenas padrão e admin
    if (tipoAtual === 'admin') {
        return ['padrao', 'admin'];
    }

    // PADRÃO: Não pode criar (mas retorna array vazio para evitar erros)
    return [];
}

// ================================================================
// SISTEMA DE USUÁRIOS
// ================================================================
function obterTipoUsuarioAtual() {
    // 🔥 USAR USUARIO DATA MANAGER
    const usuario = window.usuarioDataManager?.getUsuarioAtual();
    tipoUsuarioAtual = usuario?.tipo || 'padrao';
}

function ajustarVisibilidadeElementos() {
    const tabUsuarios = document.querySelector('.config-tab-btn[data-tab="usuarios"]');
    if (tabUsuarios) {
        if (tipoUsuarioAtual === 'admin' || tipoUsuarioAtual === 'master') {
            tabUsuarios.classList.remove('hidden');
        } else {
            tabUsuarios.classList.add('hidden');
        }
    }

    // Botão "Novo Usuário" - Visível para MASTER e ADMINISTRADOR
    const btnAdicionarUsuario = document.getElementById('btn-adicionar-usuario');
    if (btnAdicionarUsuario) {
        if (podeCriarUsuario()) {
            btnAdicionarUsuario.classList.remove('hidden');
        } else {
            btnAdicionarUsuario.classList.add('hidden');
        }
    }

    // Botão "Limpar Logs" - Visível apenas para MASTER
    const btnLimparTodosLogs = document.getElementById('btn-limpar-todos-logs');
    if (btnLimparTodosLogs) {
        if (podeLimparLogs()) {
            btnLimparTodosLogs.classList.remove('hidden');
        } else {
            btnLimparTodosLogs.classList.add('hidden');
        }
    }
}

async function filtrarUsuarios() {
    const searchInput = document.getElementById('usuario-search');
    const filterSelect = document.getElementById('filter-user-type');

    const termoBusca = (searchInput?.value || '').trim();
    const filtroTipo = filterSelect?.value || 'todos';

    try {
        const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

        // 🔥 BUSCAR DA API
        const params = new URLSearchParams({
            page: 1,
            limit: 1000, // Carregar todos para filtro local funcionar
            search: termoBusca,
            tipo: filtroTipo
        });

        const response = await fetch(`${API_URL}/usuarios?${params}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('token') || ''}`
            }
        });

        const data = await response.json();

        if (response.ok && data.success) {
            // 🔥 APLICAR FILTRO DE PERMISSÕES
            const todosUsuarios = data.data || [];
            usuariosFiltrados = todosUsuarios.filter(usuario => podeVisualizarUsuario(usuario));
        } else {
            console.error('❌ Erro ao buscar usuários:', data.message);
            usuariosFiltrados = [];
        }
    } catch (error) {
        console.error('❌ Erro ao filtrar usuários:', error);
        usuariosFiltrados = [];
    }

    paginaAtual = 1;
    renderizarUsuarios();
}

function renderizarUsuarios() {
    const listaUsuarios = document.getElementById('lista-usuarios');
    const noUsersMessage = document.getElementById('no-users-message');
    const paginationInfo = document.getElementById('pagination-info');
    const btnPrevPage = document.getElementById('btn-prev-page');
    const btnNextPage = document.getElementById('btn-next-page');
    
    if (!listaUsuarios) return;
    
    listaUsuarios.innerHTML = '';
    
    if (usuariosFiltrados.length === 0) {
        if (noUsersMessage) noUsersMessage.classList.remove('hidden');
        if (paginationInfo) paginationInfo.textContent = 'Página 0 de 0';
        if (btnPrevPage) btnPrevPage.disabled = true;
        if (btnNextPage) btnNextPage.disabled = true;
        return;
    }
    
    if (noUsersMessage) noUsersMessage.classList.add('hidden');
    
    const totalPaginas = Math.ceil(usuariosFiltrados.length / itensPorPagina);
    const inicio = (paginaAtual - 1) * itensPorPagina;
    const fim = Math.min(inicio + itensPorPagina, usuariosFiltrados.length);
    
    if (paginationInfo) paginationInfo.textContent = `Página ${paginaAtual} de ${totalPaginas}`;
    if (btnPrevPage) btnPrevPage.disabled = paginaAtual <= 1;
    if (btnNextPage) btnNextPage.disabled = paginaAtual >= totalPaginas;
    
    for (let i = inicio; i < fim; i++) {
        const usuario = usuariosFiltrados[i];
        const linha = criarLinhaUsuario(usuario, i);
        listaUsuarios.appendChild(linha);
    }
}

function criarLinhaUsuario(usuario, index) {
    const template = document.getElementById('template-linha-usuario');
    if (!template) return null;

    const linha = template.content.cloneNode(true);

    const tipo = usuario.tipo || 'padrao';
    const status = usuario.status || 'ativo';

    linha.querySelector('.usuario-nome').textContent = usuario.nome || '-';
    linha.querySelector('.usuario-documento').textContent = usuario.documento || '-';
    linha.querySelector('.usuario-email').textContent = usuario.email || '-';

    const tipoBadge = linha.querySelector('.tipo-badge');
    tipoBadge.textContent = tipo === 'padrao' ? 'Padrão' : tipo === 'admin' ? 'Admin' : 'Master';
    tipoBadge.className = `tipo-badge tipo-${tipo}`;

    const statusBadge = linha.querySelector('.status-badge');
    statusBadge.textContent = status === 'ativo' ? 'Ativo' : status === 'inativo' ? 'Inativo' : 'Bloqueado';
    statusBadge.className = `status-badge status-${status}`;

    const btnEditar = linha.querySelector('.btn-editar-usuario');
    const btnBloquear = linha.querySelector('.btn-bloquear-usuario');
    const btnExcluir = linha.querySelector('.btn-excluir-usuario');
    const textoSemPermissao = linha.querySelector('.texto-sem-permissao');

    btnEditar.setAttribute('data-index', index);
    btnBloquear.setAttribute('data-index', index);
    btnExcluir.setAttribute('data-index', index);

    if (status === 'bloqueado') {
        btnBloquear.title = 'Desbloquear usuário';
        btnBloquear.querySelector('i').className = 'fas fa-unlock';
    } else {
        btnBloquear.title = 'Bloquear usuário';
        btnBloquear.querySelector('i').className = 'fas fa-ban';
    }

    // 🔥 USAR FUNÇÕES DE PERMISSÃO
    const podeEditar = podeEditarUsuario(usuario);
    const podeBloquear = podeBloquearUsuario(usuario);
    const podeExcluir = podeExcluirUsuario(usuario);
    const temAlgumaPermissao = podeEditar || podeBloquear || podeExcluir;

    if (podeEditar) {
        btnEditar.classList.remove('hidden');
    } else {
        btnEditar.classList.add('hidden');
    }

    if (podeBloquear) {
        btnBloquear.classList.remove('hidden');
    } else {
        btnBloquear.classList.add('hidden');
    }

    if (podeExcluir) {
        btnExcluir.classList.remove('hidden');
    } else {
        btnExcluir.classList.add('hidden');
    }

    if (temAlgumaPermissao) {
        textoSemPermissao.classList.add('hidden');
    } else {
        textoSemPermissao.classList.remove('hidden');
    }

    return linha;
}

async function alternarBloqueioUsuario(usuario) {
    // 🔥 VERIFICAR PERMISSÃO
    if (!podeBloquearUsuario(usuario)) {
        mostrarFeedback('Você não tem permissão para bloquear/desbloquear este usuário', 'error');
        return;
    }

    const estavaBloqueado = usuario.status === 'bloqueado';
    const acao = estavaBloqueado ? 'desbloquear' : 'bloquear';

    if (!confirm(`Deseja ${acao} o usuário ${usuario.nome}?`)) {
        return;
    }

    try {
        const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

        // 🔥 ATUALIZAR NA API
        const response = await fetch(`${API_URL}/usuarios/${usuario.id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('token') || ''}`
            },
            body: JSON.stringify({
                status: estavaBloqueado ? 'ativo' : 'bloqueado'
            })
        });

        const data = await response.json();

        if (response.ok && data.success) {
            await filtrarUsuarios();
            mostrarFeedback('Alterações realizadas com sucesso!', 'success');
        } else {
            mostrarFeedback(data.message || 'Erro ao alterar status do usuário', 'error');
        }
    } catch (error) {
        mostrarFeedback('Erro ao alterar status do usuário', 'error');
    }
}

function excluirUsuario(usuario) {
    // 🔥 VERIFICAR PERMISSÃO
    if (!podeExcluirUsuario(usuario)) {
        mostrarFeedback('Você não tem permissão para excluir este usuário', 'error');
        return;
    }

    const nomeUsuarioElement = document.getElementById('usuario-nome-exclusao');
    if (nomeUsuarioElement) {
        nomeUsuarioElement.textContent = usuario.nome;
    }

    const modal = document.getElementById('modal-confirmar-exclusao-usuario');
    if (modal) {
        modal.style.display = 'flex';
        modal.setAttribute('data-usuario-id', usuario.id);
    }
}

async function confirmarExclusaoUsuario() {
    const modal = document.getElementById('modal-confirmar-exclusao-usuario');
    const usuarioId = modal?.getAttribute('data-usuario-id');

    if (!usuarioId) return;

    try {
        const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

        // 🔥 EXCLUIR NA API
        const response = await fetch(`${API_URL}/usuarios/${usuarioId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('token') || ''}`
            }
        });

        const data = await response.json();

        if (response.ok && data.success) {
            modal.style.display = 'none';
            await filtrarUsuarios();
            mostrarFeedback('Usuário excluído com sucesso!', 'success');
        } else {
            mostrarFeedback(data.message || 'Erro ao excluir usuário', 'error');
        }
    } catch (error) {
        mostrarFeedback('Erro ao excluir usuário', 'error');
    }
}

function abrirModalEditarUsuario(usuario, isNovo = false) {
    const modal = document.getElementById(isNovo ? 'modal-adicionar-usuario' : 'modal-editar-usuario');
    const form = document.getElementById(isNovo ? 'form-adicionar-usuario' : 'form-editar-usuario');

    if (!modal || !form) return;

    form.reset();

    if (!isNovo && usuario) {
        preencherDadosUsuario(usuario);
    } else if (isNovo) {
        // 🔥 CONFIGURAR DROPDOWN DE TIPOS PERMITIDOS PARA NOVO USUÁRIO
        configurarDropdownTipos(isNovo);
    }

    modal.style.display = 'flex';
}

/**
 * Configura o dropdown de tipos de usuário baseado nas permissões
 * @param {boolean} isNovo - Se é um novo usuário ou edição
 */
function configurarDropdownTipos(isNovo = false) {
    const selectTipo = document.getElementById(isNovo ? 'novo-usuario-tipo' : 'editar-usuario-tipo');
    if (!selectTipo) return;

    const tiposPermitidos = obterTiposPermitidos();

    // Limpar opções existentes
    selectTipo.innerHTML = '';

    // Adicionar apenas os tipos permitidos
    tiposPermitidos.forEach(tipo => {
        const option = document.createElement('option');
        option.value = tipo;

        if (tipo === 'padrao') {
            option.textContent = 'Padrão';
        } else if (tipo === 'admin') {
            option.textContent = 'Administrador';
        } else if (tipo === 'master') {
            option.textContent = 'Master';
        }

        selectTipo.appendChild(option);
    });

    // Definir valor padrão
    if (tiposPermitidos.length > 0) {
        selectTipo.value = 'padrao';
    }
}

function preencherDadosUsuario(usuario) {
    // 🔥 USAR ID DO USUARIO AO INVÉS DE DOCUMENTO
    const campos = {
        'editar-usuario-id': usuario.id,
        'editar-usuario-nome': usuario.nome || '',
        'editar-usuario-email': usuario.email || '',
        'editar-usuario-documento': usuario.documento || '',
        'editar-usuario-status': usuario.status || 'ativo'
    };

    Object.entries(campos).forEach(([id, valor]) => {
        const elemento = document.getElementById(id);
        if (elemento) {
            elemento.value = valor;
        }
    });

    // 🔥 CONFIGURAR DROPDOWN DE TIPOS BASEADO EM PERMISSÕES
    const tiposPermitidos = obterTiposPermitidos();
    const selectTipo = document.getElementById('editar-usuario-tipo');

    if (selectTipo) {
        // Limpar e recriar opções
        selectTipo.innerHTML = '';

        tiposPermitidos.forEach(tipo => {
            const option = document.createElement('option');
            option.value = tipo;

            if (tipo === 'padrao') {
                option.textContent = 'Padrão';
            } else if (tipo === 'admin') {
                option.textContent = 'Administrador';
            } else if (tipo === 'master') {
                option.textContent = 'Master';
            }

            selectTipo.appendChild(option);
        });

        // Definir o valor do usuário (se permitido)
        if (tiposPermitidos.includes(usuario.tipo)) {
            selectTipo.value = usuario.tipo || 'padrao';
        } else {
            // Se o tipo do usuário não está permitido, desabilitar o campo
            selectTipo.value = usuario.tipo || 'padrao';
            selectTipo.disabled = true;
        }
    }

    const formGroupTipo = document.getElementById('form-group-tipo');
    const permissaoMessage = document.getElementById('permissao-message');

    // 🔥 VERIFICAR SE PODE EDITAR ESTE USUÁRIO
    const podeEditar = podeEditarUsuario(usuario);

    if (!podeEditar) {
        // Desabilitar todos os campos
        ['editar-usuario-nome', 'editar-usuario-email', 'editar-usuario-status',
         'editar-usuario-senha', 'editar-usuario-confirmar-senha', 'editar-usuario-tipo'].forEach(id => {
            const elemento = document.getElementById(id);
            if (elemento) elemento.disabled = true;
        });

        if (permissaoMessage) permissaoMessage.classList.remove('hidden');
        if (formGroupTipo) formGroupTipo.classList.add('hidden');
    } else {
        // Habilitar campos
        ['editar-usuario-nome', 'editar-usuario-email', 'editar-usuario-status',
         'editar-usuario-senha', 'editar-usuario-confirmar-senha'].forEach(id => {
            const elemento = document.getElementById(id);
            if (elemento) elemento.disabled = false;
        });

        if (permissaoMessage) permissaoMessage.classList.add('hidden');

        // Mostrar/ocultar campo de tipo baseado em permissões
        if (tipoUsuarioAtual === 'master') {
            if (formGroupTipo) formGroupTipo.classList.remove('hidden');
        } else {
            if (formGroupTipo) formGroupTipo.classList.add('hidden');
        }
    }
}

async function salvarEdicaoUsuario(isNovo = false) {
    try {
        const prefixo = isNovo ? 'novo-usuario' : 'editar-usuario';

        // 🔥 VERIFICAR PERMISSÃO PARA CRIAR/EDITAR
        if (isNovo && !podeCriarUsuario()) {
            mostrarValidacao('Você não tem permissão para criar usuários', 'error');
            return;
        }

        const nome = document.getElementById(`${prefixo}-nome`).value.trim();
        const email = document.getElementById(`${prefixo}-email`).value.trim();
        const tipo = document.getElementById(`${prefixo}-tipo`)?.value || 'padrao';
        const status = isNovo ? 'ativo' : document.getElementById(`${prefixo}-status`)?.value || 'ativo';
        const senhaInput = document.getElementById(`${prefixo}-senha`);
        const confirmarSenhaInput = document.getElementById(`${prefixo}-confirmar-senha`);
        const senha = senhaInput ? senhaInput.value.trim() : '';
        const confirmarSenha = confirmarSenhaInput ? confirmarSenhaInput.value.trim() : '';

        let identificador;
        if (isNovo) {
            identificador = document.getElementById(`${prefixo}-documento`).value.trim();
        } else {
            identificador = document.getElementById('editar-usuario-id').value;
        }

        // 🔥 VERIFICAR SE TEM PERMISSÃO PARA EDITAR (se não é novo)
        if (!isNovo) {
            const usuarioParaEditar = usuariosFiltrados.find(u => u.id === identificador);
            if (usuarioParaEditar && !podeEditarUsuario(usuarioParaEditar)) {
                mostrarValidacao('Você não tem permissão para editar este usuário', 'error');
                return;
            }
        }

        // 🔥 VERIFICAR SE O TIPO SELECIONADO ESTÁ PERMITIDO
        const tiposPermitidos = obterTiposPermitidos();
        if (!tiposPermitidos.includes(tipo)) {
            mostrarValidacao('Você não tem permissão para criar/editar usuários com este tipo', 'error');
            return;
        }

        // Validações
        if (!nome || !email || !identificador) {
            mostrarValidacao('Por favor, preencha todos os campos obrigatórios.', 'error');
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            mostrarValidacao('Por favor, informe um e-mail válido.', 'error');
            return;
        }

        if (senha || confirmarSenha) {
            if (senha !== confirmarSenha) {
                mostrarValidacao('As senhas não coincidem.', 'error');
                return;
            }

            if (senha.length < 6) {
                mostrarValidacao('A senha deve ter pelo menos 6 caracteres.', 'error');
                return;
            }
        }

        // 🔥 CHAMAR API
        try {
            const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';
            let response;

            if (isNovo) {
                // POST /api/usuarios - Criar novo usuário
                if (!senha) {
                    mostrarValidacao('Senha é obrigatória para novo usuário.', 'error');
                    return;
                }

                response = await fetch(`${API_URL}/usuarios`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionStorage.getItem('token') || ''}`
                    },
                    body: JSON.stringify({
                        nome,
                        email,
                        documento: identificador,
                        senha,
                        tipo: tipoUsuarioAtual === 'master' ? tipo : 'padrao',
                        status
                    })
                });
            } else {
                // PUT /api/usuarios/:id - Atualizar usuário existente
                const updateData = {
                    nome,
                    email,
                    status
                };

                if (tipoUsuarioAtual === 'master') {
                    updateData.tipo = tipo;
                }

                if (senha && senha.length > 0) {
                    updateData.senha = senha;
                }

                response = await fetch(`${API_URL}/usuarios/${identificador}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${sessionStorage.getItem('token') || ''}`
                    },
                    body: JSON.stringify(updateData)
                });
            }

            const data = await response.json();

            if (response.ok && data.success) {
                const modal = document.getElementById(isNovo ? 'modal-adicionar-usuario' : 'modal-editar-usuario');
                if (modal) modal.style.display = 'none';

                await filtrarUsuarios();
                mostrarFeedback(isNovo ? 'Usuário criado com sucesso!' : 'Alterações realizadas com sucesso!', 'success');
            } else {
                mostrarValidacao(data.message || 'Erro ao salvar usuário', 'error');
            }
        } catch (apiError) {
            mostrarValidacao('Erro ao conectar com o servidor. Tente novamente.', 'error');
        }

    } catch (error) {
        mostrarValidacao('Erro ao salvar alterações. Tente novamente.', 'error');
    }
}

// ================================================================
// UTILITÁRIOS DE FEEDBACK E UI - SISTEMA DE TOAST
// ================================================================
function mostrarToast(mensagem, tipo = 'info', duracao = 4000) {
    // Garantir que o container de toast existe
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    // Criar elemento toast
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;

    // Ícones por tipo
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };

    toast.innerHTML = `
        <i class="toast-icon ${icons[tipo] || icons.info}"></i>
        <div class="toast-content">
            <p class="toast-message">${mensagem}</p>
        </div>
        <button class="toast-close" aria-label="Fechar">
            <i class="fas fa-times"></i>
        </button>
    `;

    // Adicionar ao container
    container.appendChild(toast);

    // Mostrar toast com animação
    setTimeout(() => toast.classList.add('show'), 10);

    // Fechar toast ao clicar no botão X
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
        fecharToast(toast);
    });

    // Auto-fechar após duração
    if (duracao > 0) {
        setTimeout(() => {
            fecharToast(toast);
        }, duracao);
    }

    return toast;
}

function fecharToast(toast) {
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(() => {
        if (toast.parentElement) {
            toast.parentElement.removeChild(toast);
        }
    }, 300);
}

// Manter retrocompatibilidade com código existente
function mostrarFeedback(mensagem, tipo) {
    mostrarToast(mensagem, tipo, 4000);
}

function mostrarValidacao(mensagem, tipo) {
    mostrarToast(mensagem, tipo, 5000);
}

function mostrarStatusCartoes(mensagem, tipo) {
    mostrarToast(mensagem, tipo, 4000);
}

function garantirUsuarioMaster() {
    const cpfMaster = "08996441988";
    
    let usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    
    const usuarioExistente = usuarios.find(u => 
        u.documento && u.documento.replace(/[^\d]+/g, '') === cpfMaster
    );
    
    if (usuarioExistente) {
        if (usuarioExistente.tipo !== 'master') {
            usuarioExistente.tipo = 'master';
            usuarioExistente.status = 'ativo';
            usuarioExistente.dataAtualizacaoMaster = new Date().toISOString();
            localStorage.setItem('usuarios', JSON.stringify(usuarios));
        }
    } else {
        const cpfFormatado = cpfMaster.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
        
        const novoUsuario = {
            nome: "Administrador Master",
            email: "admin.master@sistema.com",
            documento: cpfFormatado,
            tipo: "master",
            status: "ativo",
            password: "master123",
            senha: "master123",
            categorias: {
                despesas: [...categoriasPadrao.despesas]
            },
            cartoes: {
                cartao1: { nome: '', validade: '', limite: 0, ativo: false },
                cartao2: { nome: '', validade: '', limite: 0, ativo: false },
                cartao3: { nome: '', validade: '', limite: 0, ativo: false }
            },
            dadosFinanceiros: {},
            poupanca: {
                saldo: 0,
                configuracoes: {
                    taxa: 0.5,
                    dia_rendimento: 1
                },
                transacoes: []
            },
            dataCriacaoMaster: new Date().toISOString()
        };
        
        usuarios.push(novoUsuario);
        localStorage.setItem('usuarios', JSON.stringify(usuarios));
    }
}

// ================================================================
// BACKUP E RESTAURAÇÃO - EXPORTAR/IMPORTAR/LIMPAR
// ================================================================
// ================================================================
// EXPORTAR DADOS MÊS A MÊS (PRODUÇÃO - PostgreSQL)
// ================================================================
async function exportarDadosMesAMes() {
    try {
        const usuario = window.usuarioDataManager?.getUsuarioAtual();
        if (!usuario || !usuario.id) {
            mostrarFeedback('Usuário não encontrado', 'error');
            return;
        }

        const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';
        const token = sessionStorage.getItem('token');

        if (!token) {
            mostrarFeedback('Token de autenticação não encontrado', 'error');
            return;
        }

        mostrarFeedback('Buscando dados do PostgreSQL...', 'info');

        // ✅ BUSCAR TODAS AS RECEITAS
        const receitasResponse = await fetch(`${API_URL}/receitas`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        let todasReceitas = [];
        if (receitasResponse.ok) {
            const receitasData = await receitasResponse.json();
            todasReceitas = receitasData.data || [];
        }

        // ✅ BUSCAR TODAS AS DESPESAS
        const despesasResponse = await fetch(`${API_URL}/despesas`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        let todasDespesas = [];
        if (despesasResponse.ok) {
            const despesasData = await despesasResponse.json();
            todasDespesas = despesasData.data || [];
        }

        // ✅ BUSCAR MESES FECHADOS
        const mesesResponse = await fetch(`${API_URL}/meses`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        let mesesFechados = [];
        if (mesesResponse.ok) {
            const mesesData = await mesesResponse.json();
            mesesFechados = (mesesData.data || []).filter(m => m.fechado === true);
        }

        // ✅ BUSCAR CARTÕES
        const cartoesResponse = await fetch(`${API_URL}/cartoes`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        let cartoesUsuario = {};
        if (cartoesResponse.ok) {
            const cartoesData = await cartoesResponse.json();
            const cartoes = cartoesData.data || [];

            // Formatar cartões no formato esperado
            cartoes.forEach(cartao => {
                const numeroCartao = cartao.numero_cartao || cartao.id;
                const key = `cartao${numeroCartao}`;
                cartoesUsuario[key] = {
                    numero_cartao: numeroCartao,
                    nome: cartao.nome,
                    limite: parseFloat(cartao.limite) || 0,
                    diaFechamento: parseInt(cartao.dia_fechamento) || 1,
                    diaVencimento: parseInt(cartao.dia_vencimento) || 10,
                    cor: cartao.cor || '#3498db',
                    ativo: cartao.ativo !== false
                };
            });
        }

        // ✅ BUSCAR CATEGORIAS
        const categoriasResponse = await fetch(`${API_URL}/categorias`, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        let categorias = [];
        if (categoriasResponse.ok) {
            const categoriasData = await categoriasResponse.json();
            categorias = (categoriasData.data || []).map(c => c.nome);
        }

        // ✅ AGRUPAR DADOS POR ANO/MÊS
        const dadosPorMes = {};

        // Agrupar receitas
        todasReceitas.forEach(receita => {
            const chave = `${receita.ano}-${String(receita.mes).padStart(2, '0')}`;

            if (!dadosPorMes[chave]) {
                dadosPorMes[chave] = {
                    ano: parseInt(receita.ano),
                    mes: parseInt(receita.mes),
                    receitas: [],
                    despesas: []
                };
            }

            dadosPorMes[chave].receitas.push({
                ano: parseInt(receita.ano),
                mes: parseInt(receita.mes),
                mes_fechado: mesesFechados.some(m => m.ano === receita.ano && m.mes === receita.mes),
                data_recebimento: receita.data_recebimento,
                descricao: receita.descricao || '',
                valor: parseFloat(receita.valor) || 0,
                observacoes: receita.observacoes || ''
            });
        });

        // Agrupar despesas
        todasDespesas.forEach(despesa => {
            const chave = `${despesa.ano}-${String(despesa.mes).padStart(2, '0')}`;

            if (!dadosPorMes[chave]) {
                dadosPorMes[chave] = {
                    ano: parseInt(despesa.ano),
                    mes: parseInt(despesa.mes),
                    receitas: [],
                    despesas: []
                };
            }

            const mesFechado = mesesFechados.some(m => m.ano === despesa.ano && m.mes === despesa.mes);

            dadosPorMes[chave].despesas.push({
                ano: parseInt(despesa.ano),
                mes: parseInt(despesa.mes),
                mes_fechado: mesFechado,
                descricao: despesa.descricao || '',
                valor: parseFloat(despesa.valor) || 0,
                data_vencimento: despesa.data_vencimento,
                data_compra: despesa.data_compra || null,
                data_pagamento: despesa.data_pagamento || null,
                categoria: despesa.categoria_nome || 'Sem categoria',
                categoria_id_original: despesa.categoria_id || null,
                cartao_id_original: despesa.cartao_id || null,
                forma_pagamento: despesa.forma_pagamento || 'dinheiro',
                parcelado: despesa.parcelado || false,
                numero_parcelas: despesa.numero_parcelas || null,
                parcela_atual: despesa.parcela_atual || null,
                pago: despesa.pago || false,
                observacoes: despesa.observacoes || '',
                valor_original: despesa.valor_original ? parseFloat(despesa.valor_original) : null,
                valor_total_com_juros: despesa.valor_total_com_juros ? parseFloat(despesa.valor_total_com_juros) : null,
                valor_pago: despesa.valor_pago ? parseFloat(despesa.valor_pago) : null
            });
        });

        // ✅ FILTRAR APENAS MESES COM DADOS
        const mesesComDados = Object.keys(dadosPorMes).filter(chave => {
            const mes = dadosPorMes[chave];
            return mes.receitas.length > 0 || mes.despesas.length > 0;
        }).sort();

        if (mesesComDados.length === 0) {
            mostrarFeedback('Não há dados para exportar', 'warning');
            return;
        }

        // ✅ EXPORTAR CADA MÊS
        for (const chave of mesesComDados) {
            const mesData = dadosPorMes[chave];

            // Verificar se este mês está fechado
            const mesFechadoAtual = mesesFechados.find(m => m.ano === mesData.ano && m.mes === mesData.mes);

            const backup = {
                versao: '2.0',
                data_exportacao: new Date().toISOString(),
                usuario: {
                    nome: usuario?.nome || 'Produção',
                    email: usuario?.email || '',
                    documento: usuario?.documento || ''
                },
                estatisticas: {
                    total_receitas: mesData.receitas.length,
                    total_despesas: mesData.despesas.length,
                    total_categorias: categorias.length,
                    total_cartoes: Object.keys(cartoesUsuario).length,
                    ano: mesData.ano,
                    mes: mesData.mes
                },
                mesesFechados: mesFechadoAtual ? [{ano: mesFechadoAtual.ano, mes: mesFechadoAtual.mes}] : [],
                dados: {
                    receitas: mesData.receitas,
                    despesas: mesData.despesas,
                    categorias: categorias,
                    cartoes: cartoesUsuario
                }
            };

            // Criar arquivo JSON
            const jsonContent = JSON.stringify(backup, null, 2);
            const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);

            const [ano, mes] = chave.split('-');
            const nomeArquivo = `backup_producao_${ano}_mes${String(parseInt(mes) + 1).padStart(2, '0')}.json`;

            link.setAttribute('href', url);
            link.setAttribute('download', nomeArquivo);
            link.style.visibility = 'hidden';

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Aguardar entre downloads
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        mostrarFeedback(`✅ Exportação concluída! ${mesesComDados.length} arquivos gerados (um por mês)`, 'success');

    } catch (error) {
        console.error('❌ Erro ao exportar dados mês a mês:', error);
        mostrarFeedback('Erro ao exportar dados: ' + error.message, 'error');
    }
}

// ================================================================
// EXPORTAR TODOS OS DADOS (PRODUÇÃO - Backup Completo)
// ================================================================
async function exportarDados() {
    try {
        const usuario = window.usuarioDataManager?.getUsuarioAtual();
        if (!usuario || !usuario.id) {
            mostrarFeedback('Usuário não encontrado', 'error');
            return;
        }

        const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';
        const token = sessionStorage.getItem('token');

        if (!token) {
            mostrarFeedback('Token de autenticação não encontrado', 'error');
            return;
        }

        mostrarFeedback('Buscando dados do PostgreSQL...', 'info');

        // ✅ BUSCAR RECEITAS DIRETAMENTE DA TABELA receitas
        const receitasResponse = await fetch(`${API_URL}/receitas`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        let todasReceitas = [];
        if (receitasResponse.ok) {
            const receitasData = await receitasResponse.json();
            todasReceitas = (receitasData.data || []).map(receita => ({
                ano: parseInt(receita.ano),
                mes: parseInt(receita.mes),
                data_recebimento: receita.data_recebimento,
                descricao: receita.descricao,
                valor: parseFloat(receita.valor),
                observacoes: receita.observacoes || ''
            }));
        }

        // ✅ BUSCAR DESPESAS DIRETAMENTE DA TABELA despesas
        const despesasResponse = await fetch(`${API_URL}/despesas`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        let todasDespesas = [];
        if (despesasResponse.ok) {
            const despesasData = await despesasResponse.json();
            todasDespesas = (despesasData.data || []).map(despesa => ({
                ano: parseInt(despesa.ano),
                mes: parseInt(despesa.mes),
                data_vencimento: despesa.data_vencimento,
                data_compra: despesa.data_compra || null,
                data_pagamento: despesa.data_pagamento || null,
                descricao: despesa.descricao,
                valor: parseFloat(despesa.valor),
                forma_pagamento: despesa.forma_pagamento || 'dinheiro',
                parcelado: despesa.parcelado || false,
                total_parcelas: despesa.total_parcelas || null,
                parcela_atual: despesa.parcela_atual || null,
                observacoes: despesa.observacoes || '',
                pago: despesa.pago || false
            }));
        }

        // Buscar categorias do cache/localStorage
        const categoriasUsuario = window.categoriasUsuario || { receitas: [], despesas: [] };

        // Buscar cartões do cache/localStorage
        const cartoesUsuario = window.cartoesUsuario || {
            cartao1: { nome: '', validade: '', limite: 0, ativo: false },
            cartao2: { nome: '', validade: '', limite: 0, ativo: false },
            cartao3: { nome: '', validade: '', limite: 0, ativo: false }
        };

        // Contar cartões ativos
        const cartoesAtivos = Object.values(cartoesUsuario).filter(c => c.ativo).length;

        const totalCategorias = (categoriasUsuario.receitas?.length || 0) + (categoriasUsuario.despesas?.length || 0);

        if (todasReceitas.length === 0 && todasDespesas.length === 0) {
            mostrarFeedback('Não há dados para exportar', 'warning');
            return;
        }

        // Estrutura do backup
        const backup = {
            versao: '1.0',
            dataExportacao: new Date().toISOString(),
            usuario: usuario.nome,
            receitas: todasReceitas,
            despesas: todasDespesas,
            categorias: categoriasUsuario,
            cartoes: cartoesUsuario
        };

        // Criar arquivo JSON
        const jsonContent = JSON.stringify(backup, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        const dataAtual = new Date().toISOString().split('T')[0];
        link.setAttribute('href', url);
        link.setAttribute('download', `backup_producao_${dataAtual}.json`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        const mensagem = `✅ Exportados: ${todasReceitas.length} receitas, ${todasDespesas.length} despesas, ${totalCategorias} categorias e ${cartoesAtivos} cartões`;
        mostrarFeedback(mensagem, 'success');
    } catch (error) {
        console.error('Erro ao exportar dados:', error);
        mostrarFeedback('Erro ao exportar dados: ' + error.message, 'error');
    }
}

function converterParaCSV(dados) {
    let csv = '';

    // Cabeçalho
    csv += 'Tipo,Ano,Mês,Data,Descrição,Categoria,Valor,FormaPagamento,Parcelas,Status,Observações\n';

    // Processar dados financeiros
    if (dados.dadosFinanceiros) {
        Object.keys(dados.dadosFinanceiros).forEach(ano => {
            const anoData = dados.dadosFinanceiros[ano];

            // Receitas
            if (anoData.receitas) {
                anoData.receitas.forEach(receita => {
                    csv += `Receita,${ano},${receita.mes || ''},${receita.data || ''},`;
                    csv += `"${receita.descricao || ''}","${receita.categoria || ''}",`;
                    csv += `${receita.valor || 0},"${receita.formaPagamento || ''}",`;
                    csv += `${receita.parcelas || ''},"${receita.status || ''}","${receita.observacoes || ''}"\n`;
                });
            }

            // Despesas
            if (anoData.despesas) {
                anoData.despesas.forEach(despesa => {
                    csv += `Despesa,${ano},${despesa.mes || ''},${despesa.data || ''},`;
                    csv += `"${despesa.descricao || ''}","${despesa.categoria || ''}",`;
                    csv += `${despesa.valor || 0},"${despesa.formaPagamento || ''}",`;
                    csv += `${despesa.parcelas || ''},"${despesa.status || ''}","${despesa.observacoes || ''}"\n`;
                });
            }
        });
    }

    return csv;
}

async function importarDados() {
    const inputFile = document.createElement('input');
    inputFile.type = 'file';
    inputFile.accept = '.json';

    inputFile.onchange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const loader = document.getElementById('global-loader');
        const progressText = document.getElementById('loader-progress');

        try {
            const fileText = await file.text();
            const backup = JSON.parse(fileText);

            // Detectar e validar estrutura do backup (suporta v1.0 e v2.0)
            let receitas, despesas, categorias, cartoes;
            const versao = backup.versao || '1.0';

            if (versao === '2.0' && backup.dados) {
                // Formato novo (exportarDadosMesAMes)
                receitas = backup.dados.receitas || [];
                despesas = backup.dados.despesas || [];
                categorias = backup.dados.categorias || [];
                cartoes = backup.dados.cartoes || {};
            } else if (backup.receitas && backup.despesas) {
                // Formato antigo
                receitas = backup.receitas || [];
                despesas = backup.despesas || [];
                categorias = backup.categorias || {};
                cartoes = backup.cartoes || {};
            } else {
                mostrarFeedback('Arquivo inválido: formato de backup não reconhecido', 'error');
                return;
            }

            // Substituir backup com estrutura normalizada
            backup.receitas = receitas;
            backup.despesas = despesas;
            backup.categorias = categorias;
            backup.cartoes = cartoes;

            const usuario = window.usuarioDataManager?.getUsuarioAtual();
            if (!usuario || !usuario.id) {
                mostrarFeedback('Usuário não encontrado', 'error');
                return;
            }

            const totalReceitas = backup.receitas.length;
            const totalDespesas = backup.despesas.length;
            const total = totalReceitas + totalDespesas;

            if (total === 0) {
                mostrarFeedback('Nenhum dado válido encontrado no arquivo', 'warning');
                return;
            }

            // Confirmar importação
            if (!confirm(`Importar ${totalReceitas} receitas e ${totalDespesas} despesas?\n\nIsso adicionará os dados ao sistema.`)) {
                return;
            }

            // Mostrar loader
            if (loader) loader.classList.add('show');

            const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';
            const token = sessionStorage.getItem('token');

            let sucessos = 0;
            let erros = 0;
            let processados = 0;

            // ✅ PASSO 0: Criar categorias padrão no PostgreSQL PRIMEIRO
            if (progressText) progressText.textContent = 'Criando categorias padrão no banco de dados...';

            try {
                const responsePadrao = await fetch(`${API_URL}/categorias/padrao`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!responsePadrao.ok) {
                    const errorData = await responsePadrao.json();
                    console.error('❌ Erro ao criar categorias padrão:', errorData);
                }
            } catch (error) {
                console.warn('⚠️ Erro ao criar categorias padrão:', error);
            }

            // ✅ PASSO 1: Importar categorias (criar na tabela categorias)
            if (backup.categorias && backup.categorias.despesas) {
                const totalCategorias = backup.categorias.despesas.length;
                if (progressText) progressText.textContent = `Importando ${totalCategorias} categorias...`;
                try {
                    // Buscar categorias existentes
                    const responseCatExistentes = await fetch(`${API_URL}/categorias`, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        }
                    });

                    let categoriasExistentes = [];
                    if (responseCatExistentes.ok) {
                        const data = await responseCatExistentes.json();
                        categoriasExistentes = (data.data || []).map(c => c.nome.toLowerCase());
                    }

                    // Criar cada categoria do backup que ainda não existe
                    for (const nomeCategoria of backup.categorias.despesas) {
                        if (!categoriasExistentes.includes(nomeCategoria.toLowerCase())) {
                            try {
                                const responseCreate = await fetch(`${API_URL}/categorias`, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${token}`
                                    },
                                    body: JSON.stringify({
                                        nome: nomeCategoria,
                                        cor: '#3498db',
                                        icone: null
                                    })
                                });

                                if (!responseCreate.ok) {
                                    const errorData = await responseCreate.json();
                                    console.warn(`⚠️ Erro ao criar categoria "${nomeCategoria}":`, errorData);
                                }
                            } catch (error) {
                                console.warn(`⚠️ Exceção ao criar categoria "${nomeCategoria}":`, error);
                            }
                        }
                    }

                } catch (error) {
                    console.warn('⚠️ Erro ao importar categorias:', error);
                }
            }

            // ✅ Buscar categorias do backend para criar mapa nome → ID
            let mapaCategorias = {};
            try {
                const responseCatList = await fetch(`${API_URL}/categorias`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (responseCatList.ok) {
                    const categoriasData = await responseCatList.json();
                    // Criar mapa: { "Alimentação": 1, "Transporte": 2, ... }
                    (categoriasData.data || []).forEach(cat => {
                        mapaCategorias[cat.nome] = cat.id;
                    });
                }
            } catch (error) {
                console.warn('⚠️ Erro ao buscar categorias para mapeamento:', error);
            }

            // ✅ Buscar cartões do backend para criar mapa numero_cartao → ID
            let mapaCartoes = {};
            try {
                const responseCartList = await fetch(`${API_URL}/cartoes`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (responseCartList.ok) {
                    const cartoesData = await responseCartList.json();
                    // Criar mapa: { 1: 123, 2: 124, 3: 125 } (numero_cartao → id do banco)
                    (cartoesData.data || []).forEach(cartao => {
                        if (cartao.numero_cartao) {
                            mapaCartoes[cartao.numero_cartao] = cartao.id;
                        }
                    });
                }
            } catch (error) {
                console.warn('⚠️ Erro ao buscar cartões para mapeamento:', error);
            }

            // ✅ PASSO 2: Importar cartões
            if (backup.cartoes) {
                const totalCartoes = Object.values(backup.cartoes).filter(c => c.ativo).length;
                if (progressText) progressText.textContent = `Importando ${totalCartoes} cartões...`;

                try {
                    const responseCartoes = await fetch(`${API_URL}/usuarios/${usuario.id}/cartoes`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ cartoes: backup.cartoes })  // ✅ Backend espera { cartoes: {...} }
                    });

                    if (responseCartoes.ok) {
                        window.cartoesUsuario = backup.cartoes;
                    } else {
                        const errorData = await responseCartoes.json();
                        console.error('⚠️ Erro ao importar cartões:', errorData);
                    }
                } catch (error) {
                    console.warn('⚠️ Erro ao importar cartões:', error);
                }
            }

            // ✅ PASSO 3: Importar receitas
            for (const receita of backup.receitas) {
                try {
                    // Validar e converter data para formato ISO8601
                    let dataRecebimento = receita.data_recebimento || receita.data;

                    // Se a data não estiver no formato YYYY-MM-DD, converter
                    if (dataRecebimento && !dataRecebimento.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        // Tentar converter de DD/MM/YYYY para YYYY-MM-DD
                        const partes = dataRecebimento.split('/');
                        if (partes.length === 3) {
                            dataRecebimento = `${partes[2]}-${partes[1]}-${partes[0]}`;
                        }
                    }

                    const dadosReceita = {
                        descricao: receita.descricao,
                        valor: parseFloat(receita.valor),
                        data_recebimento: dataRecebimento,
                        mes: parseInt(receita.mes),
                        ano: parseInt(receita.ano),
                        observacoes: receita.observacoes || ''
                    };

                    const response = await fetch(`${API_URL}/receitas`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(dadosReceita)
                    });

                    if (response.ok) {
                        sucessos++;
                        await response.json();
                    } else {
                        erros++;
                        console.error('❌ Erro ao importar receita (HTTP ' + response.status + ')');
                    }
                } catch (error) {
                    erros++;
                    console.error('❌ Exceção ao importar receita:', error.message);
                }

                processados++;
                if (progressText) {
                    progressText.textContent = `Receitas: ${processados} de ${totalReceitas}`;
                }

                // ✅ DELAY para evitar erro 429 (Too Many Requests)
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // ✅ PASSO 3.5: Buscar receitas do banco para obter IDs reais
            if (progressText) progressText.textContent = 'Sincronizando receitas com banco de dados...';

            try {
                // Buscar anos únicos das receitas importadas
                const anosReceitas = [...new Set(backup.receitas.map(r => parseInt(r.ano)))];

                for (const ano of anosReceitas) {
                    const mesesAno = [...new Set(backup.receitas.filter(r => r.ano === ano).map(r => parseInt(r.mes)))];

                    for (const mes of mesesAno) {
                        const responseReceitas = await fetch(`${API_URL}/receitas?mes=${mes}&ano=${ano}`, {
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        });

                        if (responseReceitas.ok) {
                            await responseReceitas.json();
                        }
                    }
                }
            } catch (error) {
                console.warn('⚠️ Erro ao sincronizar receitas:', error);
            }

            // ✅ PASSO 4: Importar despesas
            let despesasProcessadas = 0;

            for (const despesa of backup.despesas) {
                try {
                    // ✅ FILTRO: Ignorar parcelas que não sejam a primeira
                    // Se for parcelada E parcela_atual não for 1, PULAR
                    if (despesa.parcelado && despesa.parcela_atual && despesa.parcela_atual !== 1) {
                        despesasProcessadas++;
                        processados++;
                        continue;
                    }

                    // Validar e converter data_vencimento para formato ISO8601
                    let dataVencimento = despesa.data || despesa.data_vencimento;

                    // Se a data não estiver no formato YYYY-MM-DD, converter
                    if (dataVencimento && !dataVencimento.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        // Tentar converter de DD/MM/YYYY para YYYY-MM-DD
                        const partes = dataVencimento.split('/');
                        if (partes.length === 3) {
                            dataVencimento = `${partes[2]}-${partes[1]}-${partes[0]}`;
                        }
                    }

                    // Converter data_compra se existir
                    let dataCompra = despesa.data_compra || null;
                    if (dataCompra && !dataCompra.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        const partes = dataCompra.split('/');
                        if (partes.length === 3) {
                            dataCompra = `${partes[2]}-${partes[1]}-${partes[0]}`;
                        }
                    }

                    // Converter data_pagamento se existir
                    let dataPagamento = despesa.data_pagamento || null;
                    if (dataPagamento && !dataPagamento.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        const partes = dataPagamento.split('/');
                        if (partes.length === 3) {
                            dataPagamento = `${partes[2]}-${partes[1]}-${partes[0]}`;
                        }
                    }

                    // ✅ Mapear nome da categoria para ID
                    let categoriaId = null;
                    if (despesa.categoria && mapaCategorias[despesa.categoria]) {
                        categoriaId = mapaCategorias[despesa.categoria];
                    }

                    // ✅ Mapear cartao_id_original para ID real do banco
                    let cartaoId = null;
                    const cartaoOriginal = despesa.cartao_id_original || despesa.cartao_id || despesa.cartao || despesa.numeroCartao;
                    if (cartaoOriginal && mapaCartoes[cartaoOriginal]) {
                        cartaoId = mapaCartoes[cartaoOriginal];
                    }

                    // ✅ CORRIGIDO: Respeitar campo mes_fechado da exportação
                    // Se o mês estava fechado na exportação, todas as despesas devem ser marcadas como pagas
                    const statusPago = despesa.mes_fechado ? true : (despesa.pago || false);

                    const dadosDespesa = {
                        descricao: despesa.descricao,
                        valor: parseFloat(despesa.valor),
                        data_vencimento: dataVencimento,
                        data_compra: dataCompra,
                        data_pagamento: dataPagamento,
                        mes: parseInt(despesa.mes),
                        ano: parseInt(despesa.ano),
                        categoria_id: categoriaId,
                        cartao_id: cartaoId,
                        forma_pagamento: despesa.forma_pagamento || despesa.formaPagamento || 'dinheiro',
                        parcelado: despesa.parcelado || false,
                        total_parcelas: despesa.numero_parcelas || despesa.total_parcelas || despesa.numeroParcelas || null, // ✅ CORRIGIDO: aceita numero_parcelas
                        parcela_atual: despesa.parcela_atual || despesa.parcelaAtual || null,
                        observacoes: despesa.observacoes || '',
                        pago: statusPago, // ✅ Usa lógica que respeita mes_fechado
                        // ✅ NOVO: Campos de juros e economias
                        valor_original: despesa.valor_original ? parseFloat(despesa.valor_original) : null,
                        valor_total_com_juros: despesa.valor_total_com_juros ? parseFloat(despesa.valor_total_com_juros) : null,
                        valor_pago: despesa.valor_pago ? parseFloat(despesa.valor_pago) : null
                    };

                    const response = await fetch(`${API_URL}/despesas`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(dadosDespesa)
                    });

                    if (response.ok) {
                        sucessos++;
                        await response.json();
                    } else {
                        erros++;
                        let errorData;
                        try {
                            errorData = await response.json();
                        } catch (e) {
                            errorData = { message: await response.text() };
                        }
                        console.error('Erro ao importar despesa:', errorData);
                    }
                } catch (error) {
                    erros++;
                    console.error('Exceção ao importar despesa:', error);
                }

                despesasProcessadas++;
                processados++;
                if (progressText) {
                    progressText.textContent = `Despesas: ${despesasProcessadas} de ${totalDespesas}`;
                }

                // ✅ DELAY para evitar erro 429 (Too Many Requests)
                // Aguardar 100ms entre cada requisição
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // ✅ PASSO 4.5: Buscar despesas do banco para obter IDs reais
            if (progressText) progressText.textContent = 'Sincronizando despesas com banco de dados...';

            try {
                // Buscar anos únicos das despesas importadas
                const anosDespesas = [...new Set(backup.despesas.map(d => parseInt(d.ano)))];

                for (const ano of anosDespesas) {
                    const mesesAno = [...new Set(backup.despesas.filter(d => d.ano === ano).map(d => parseInt(d.mes)))];

                    for (const mes of mesesAno) {
                        const responseDespesas = await fetch(`${API_URL}/despesas?mes=${mes}&ano=${ano}`, {
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        });

                        if (responseDespesas.ok) {
                            await responseDespesas.json();
                        }
                    }
                }
            } catch (error) {
                console.warn('Erro ao sincronizar despesas:', error);
            }

            // ✅ PASSO 5: Salvar anos na tabela 'anos'
            const anosImportados = new Set();
            if (backup.receitas) {
                backup.receitas.forEach(r => anosImportados.add(parseInt(r.ano)));
            }
            if (backup.despesas) {
                backup.despesas.forEach(d => anosImportados.add(parseInt(d.ano)));
            }

            if (anosImportados.size > 0) {
                if (progressText) progressText.textContent = `Salvando ${anosImportados.size} anos...`;

                for (const ano of anosImportados) {
                    try {
                        await fetch(`${API_URL}/anos`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({ ano: parseInt(ano) })
                        });
                    } catch (error) {
                        console.warn(`Erro ao salvar ano ${ano}:`, error);
                    }
                }
            }

            // ✅ PASSO 6: Salvar meses fechados na tabela 'meses_fechados'
            if (backup.mesesFechados && backup.mesesFechados.length > 0) {
                if (progressText) progressText.textContent = `Fechando ${backup.mesesFechados.length} meses...`;

                for (const mesFechado of backup.mesesFechados) {
                    try {
                        // Buscar saldo do mês antes de fechar
                        const saldoResponse = await fetch(`${API_URL}/meses/${mesFechado.ano}/${mesFechado.mes}/saldo`, {
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            }
                        });

                        let saldoFinal = 0;
                        if (saldoResponse.ok) {
                            const saldoData = await saldoResponse.json();
                            saldoFinal = saldoData.data?.saldo_final || 0;
                        }

                        const response = await fetch(`${API_URL}/meses/${mesFechado.ano}/${mesFechado.mes}/fechar`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                saldo_final: saldoFinal
                            })
                        });

                        if (!response.ok) {
                            const errorData = await response.json();
                            console.warn(`Erro ao fechar mês ${mesFechado.mes + 1}/${mesFechado.ano}:`, errorData);
                        }
                    } catch (error) {
                        console.warn(`Exceção ao fechar mês ${mesFechado.mes + 1}/${mesFechado.ano}:`, error);
                    }
                }
            }

            // ✅ PASSO 7: Forçar recarga dos dados do banco com IDs reais
            if (progressText) progressText.textContent = 'Finalizando e atualizando dados...';

            // Limpar cache do usuarioDataManager
            if (window.usuarioDataManager && typeof window.usuarioDataManager.limparCache === 'function') {
                window.usuarioDataManager.limparCache();
            }

            // Recarregar dados financeiros do banco
            if (window.usuarioDataManager && typeof window.usuarioDataManager.getDadosFinanceirosUsuario === 'function') {
                const dadosAtualizados = await window.usuarioDataManager.getDadosFinanceirosUsuario();
                if (dadosAtualizados) {
                    window.dadosFinanceiros = dadosAtualizados;
                }
            }

            // Ocultar loader
            if (loader) loader.classList.remove('show');
            if (progressText) progressText.textContent = '';

            if (sucessos > 0) {
                mostrarFeedback(
                    `Importação concluída: ${sucessos} de ${total} registros${erros > 0 ? ` (${erros} erros)` : ''}. Dados sincronizados com sucesso!`,
                    erros > 0 ? 'warning' : 'success'
                );

                // ✅ PRODUÇÃO: Recarregar página para garantir interface atualizada
                setTimeout(() => {
                    window.location.reload(true);  // true = forçar reload do servidor
                }, 2000);
            } else {
                mostrarFeedback('Erro: Nenhum registro foi importado', 'error');
            }
        } catch (error) {
            // Ocultar loader em caso de erro
            if (loader) loader.classList.remove('show');
            if (progressText) progressText.textContent = '';

            mostrarFeedback('Erro ao processar arquivo: ' + error.message, 'error');
        }
    };

    inputFile.click();
}

function converterCSVParaJSON(csvText) {
    const lines = csvText.split('\n');
    const dados = { receitas: [], despesas: [] };

    // Pular cabeçalho
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Parse CSV com suporte a aspas
        const valores = [];
        let valorAtual = '';
        let dentroAspas = false;

        for (let char of line) {
            if (char === '"') {
                dentroAspas = !dentroAspas;
            } else if (char === ',' && !dentroAspas) {
                valores.push(valorAtual);
                valorAtual = '';
            } else {
                valorAtual += char;
            }
        }
        valores.push(valorAtual);

        if (valores.length < 11) continue;

        // Limpar aspas duplas escapadas ("") -> (")
        const limparValor = (val) => val.replace(/""/g, '"').trim();

        const item = {
            tipo: limparValor(valores[0]),
            ano: parseInt(valores[1]) || new Date().getFullYear(),
            mes: parseInt(valores[2]) || 0,
            data: limparValor(valores[3]),
            descricao: limparValor(valores[4]),
            categoria: limparValor(valores[5]),
            valor: parseFloat(valores[6]) || 0,
            formaPagamento: limparValor(valores[7]),
            parcelas: parseInt(valores[8]) || null,
            status: limparValor(valores[9]) || 'Pago',
            observacoes: limparValor(valores[10])
        };

        if (item.tipo === 'Receita') {
            dados.receitas.push(item);
        } else if (item.tipo === 'Despesa') {
            dados.despesas.push(item);
        }
    }

    return dados;
}

async function limparDados() {
    if (!confirm('Deseja apagar TUDO? (Dados, Categorias, Cartões e Notificações)')) return;

    const usuario = window.usuarioDataManager?.getUsuarioAtual();
    const token = sessionStorage.getItem('token') || localStorage.getItem('token');
    const API_BASE = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

    try {
        const response = await fetch(`${API_BASE}/usuarios/${usuario.id}/limpar-dados`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            // Limpa notificações do backend
            try {
                await fetch(`${API_BASE}/notificacoes`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
            } catch (err) {
                console.warn('Erro ao limpar notificações:', err);
            }

            // Limpa cache local do navegador
            localStorage.removeItem('notificacoes');
            localStorage.removeItem('dashboard_data');

            // Limpa contador de notificações
            const notificationCount = document.getElementById('notification-count');
            if (notificationCount) {
                notificationCount.textContent = '0';
                notificationCount.classList.add('hidden');
            }

            mostrarFeedback('Tudo limpo com sucesso!', 'success');
            window.location.reload();
        } else {
            mostrarFeedback('Erro ao limpar dados no servidor.', 'error');
        }
    } catch (error) {
        // Erro de conexão - silencioso
    }
}

// Função de apoio para tentar a segunda rota caso a primeira falhe
async function fazerChamadaGenerica(apiBase, usuarioId) {
    const response = await fetch(`${apiBase}/limpar-dados`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sessionStorage.getItem('token') || ''}`
        },
        body: JSON.stringify({ usuarioId })
    });
    
    if (response.ok) {
        mostrarFeedback('Dados excluídos!', 'success');
        window.location.reload();
    } else {
        mostrarFeedback('Erro Crítico: A rota de limpeza não existe no Backend. Verifique o código do servidor.', 'error');
    }
}

// ================================================================
// SISTEMA DE ABAS E NAVEGAÇÃO
// ================================================================
function setupConfigTabs() {
    const tabButtons = document.querySelectorAll('.config-tab-btn');
    const tabPanes = document.querySelectorAll('.config-tab-pane');
    
    if (!tabButtons.length) return;
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            const targetTab = this.getAttribute('data-tab');
            
            tabPanes.forEach(pane => pane.classList.remove('active'));
            
            const targetPane = document.getElementById(`${targetTab}-tab`);
            if (targetPane) {
                targetPane.classList.add('active');
                
                if (targetTab === 'categorias') {
                    setTimeout(() => atualizarListaCategorias(), 100);
                } else if (targetTab === 'cartoes') {
                    setTimeout(() => renderizarListaCartoes(), 100);
                } else if (targetTab === 'usuarios') {
                    setTimeout(() => filtrarUsuarios(), 100);
                } else if (targetTab === 'logs') {
                    setTimeout(() => {
                        if (typeof window.renderizarLogs === 'function') {
                            window.renderizarLogs();
                        }
                    }, 100);
                }
            }
        });
    });
}

// ================================================================
// EVENT LISTENERS E INICIALIZAÇÃO
// ================================================================
function setupEventListeners() {
    const btnAddCategoria = document.getElementById('btn-adicionar-categoria');
    const inputNovaCategoria = document.getElementById('nova-categoria-nome');
    
    if (btnAddCategoria) btnAddCategoria.addEventListener('click', adicionarCategoria);
    if (inputNovaCategoria) {
        inputNovaCategoria.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                adicionarCategoria();
            }
        });
    }
    
    // Event listeners para cartões
    const btnAdicionarCartao = document.getElementById('btn-adicionar-cartao');
    if (btnAdicionarCartao) {
        btnAdicionarCartao.addEventListener('click', adicionarCartao);
    }

    const inputValidadeCartao = document.getElementById('novo-cartao-validade');
    if (inputValidadeCartao) {
        inputValidadeCartao.addEventListener('input', function() {
            formatarValidade(this);
        });
    }

    // Modal de editar cartão
    const formEditarCartao = document.getElementById('form-editar-cartao');
    if (formEditarCartao) {
        formEditarCartao.addEventListener('submit', salvarEdicaoCartao);
    }

    // Fechar modal de editar cartão
    const closeEditarCartao = document.querySelectorAll('#modal-editar-cartao .close, #modal-editar-cartao [data-action="cancelar"]');
    closeEditarCartao.forEach(btn => {
        btn.addEventListener('click', () => fecharModalCartao('modal-editar-cartao'));
    });
    
    const btnSearchUser = document.getElementById('btn-search-user');
    const usuarioSearch = document.getElementById('usuario-search');
    const filterUserType = document.getElementById('filter-user-type');
    const btnAdicionarUsuario = document.getElementById('btn-adicionar-usuario');
    
    if (btnSearchUser) btnSearchUser.addEventListener('click', filtrarUsuarios);
    if (usuarioSearch) {
        usuarioSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') filtrarUsuarios();
        });
    }
    if (filterUserType) filterUserType.addEventListener('change', filtrarUsuarios);
    if (btnAdicionarUsuario) {
        btnAdicionarUsuario.addEventListener('click', () => abrirModalEditarUsuario(null, true));
    }
    
    const btnPrevPage = document.getElementById('btn-prev-page');
    const btnNextPage = document.getElementById('btn-next-page');
    
    if (btnPrevPage) {
        btnPrevPage.addEventListener('click', () => {
            if (paginaAtual > 1) {
                paginaAtual--;
                renderizarUsuarios();
            }
        });
    }
    
    if (btnNextPage) {
        btnNextPage.addEventListener('click', () => {
            const totalPaginas = Math.ceil(usuariosFiltrados.length / itensPorPagina);
            if (paginaAtual < totalPaginas) {
                paginaAtual++;
                renderizarUsuarios();
            }
        });
    }
    
    const formAdicionarUsuario = document.getElementById('form-adicionar-usuario');
    const formEditarUsuario = document.getElementById('form-editar-usuario');
    const formEditarCategoria = document.getElementById('form-editar-categoria');
    
    if (formAdicionarUsuario) {
        formAdicionarUsuario.addEventListener('submit', (e) => {
            e.preventDefault();
            salvarEdicaoUsuario(true);
        });
    }
    
    if (formEditarUsuario) {
        formEditarUsuario.addEventListener('submit', (e) => {
            e.preventDefault();
            salvarEdicaoUsuario(false);
        });
    }
    
    if (formEditarCategoria) {
        formEditarCategoria.addEventListener('submit', (e) => {
            e.preventDefault();
            salvarEdicaoCategoria();
        });
    }
    
    const novoUsuarioDocumento = document.getElementById('novo-usuario-documento');
    const editarUsuarioDocumento = document.getElementById('editar-usuario-documento');
    
    if (novoUsuarioDocumento) {
        novoUsuarioDocumento.addEventListener('input', function() {
            formatarDocumento(this);
        });
    }
    
    if (editarUsuarioDocumento) {
        editarUsuarioDocumento.addEventListener('input', function() {
            formatarDocumento(this);
        });
    }
    
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('close') || e.target.dataset.action === 'cancelar') {
            const modal = e.target.closest('.modal');
            if (modal) modal.style.display = 'none';
        }
        
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
        }
    });
    
    document.addEventListener('click', (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        
        if (target.classList.contains('btn-editar-categoria')) {
            const categoriaId = target.getAttribute('data-categoria-id');
            if (categoriaId) editarCategoria(categoriaId);
        }

        if (target.classList.contains('btn-toggle-categoria')) {
            const categoriaId = target.getAttribute('data-categoria-id');
            if (categoriaId) toggleAtivoCategoria(categoriaId);
        }

        if (target.classList.contains('btn-remover-categoria')) {
            const categoriaId = target.getAttribute('data-categoria-id');
            if (categoriaId) removerCategoria(categoriaId);
        }
        
        if (target.classList.contains('btn-editar-usuario')) {
            const index = parseInt(target.getAttribute('data-index'));
            const usuario = usuariosFiltrados[index];
            if (usuario) abrirModalEditarUsuario(usuario);
        }
        
        if (target.classList.contains('btn-bloquear-usuario')) {
            const index = parseInt(target.getAttribute('data-index'));
            const usuario = usuariosFiltrados[index];
            if (usuario) alternarBloqueioUsuario(usuario);
        }
        
        if (target.classList.contains('btn-excluir-usuario')) {
            const index = parseInt(target.getAttribute('data-index'));
            const usuario = usuariosFiltrados[index];
            if (usuario) excluirUsuario(usuario);
        }
    });
    
    const btnConfirmarExclusao = document.getElementById('btn-confirmar-exclusao-usuario');
    const btnCancelarExclusao = document.getElementById('btn-cancelar-exclusao-usuario');
    const btnFeedbackOk = document.getElementById('btn-feedback-ok');
    
    if (btnConfirmarExclusao) {
        btnConfirmarExclusao.addEventListener('click', confirmarExclusaoUsuario);
    }
    
    if (btnCancelarExclusao) {
        btnCancelarExclusao.addEventListener('click', () => {
            document.getElementById('modal-confirmar-exclusao-usuario').style.display = 'none';
        });
    }
    
    if (btnFeedbackOk) {
        btnFeedbackOk.addEventListener('click', () => {
            document.getElementById('modal-feedback-sistema').style.display = 'none';
        });
    }

    // Botões de backup e restauração
    const btnExportarDados = document.getElementById('btn-exportar-dados');
    const btnExportarMesAMes = document.getElementById('btn-exportar-mes-a-mes'); // ✅ NOVO
    const btnImportarDados = document.getElementById('btn-importar-dados');
    const btnLimparDados = document.getElementById('btn-limpar-dados');

    if (btnExportarDados) {
        btnExportarDados.addEventListener('click', exportarDados);
    }

    // ✅ NOVO: Event listener para exportar mês a mês
    if (btnExportarMesAMes) {
        btnExportarMesAMes.addEventListener('click', exportarDadosMesAMes);
    }

    if (btnImportarDados) {
        btnImportarDados.addEventListener('click', importarDados);
    }

    if (btnLimparDados) {
        btnLimparDados.addEventListener('click', limparDados);
    }
}

async function inicializarConfiguracoes() {
    if (!window.sistemaInicializado) {
        setTimeout(inicializarConfiguracoes, 200);
        return;
    }

    garantirUsuarioMaster();
    obterTipoUsuarioAtual();

    // 🔥 CARREGAR DADOS DA API COM AWAIT
    await carregarCategoriasLocal();
    await carregarCartoesLocal();

    setupConfigTabs();
    setupEventListeners();
    ajustarVisibilidadeElementos();

    atualizarDropdowns();
    atualizarOpcoesCartoes();
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(inicializarConfiguracoes, 1000);
});







window.categoriasUsuario = categoriasUsuario;
window.cartoesUsuario = cartoesUsuario;
window.categoriasPadrao = categoriasPadrao;

window.carregarCategoriasLocal = carregarCategoriasLocal;
// window.salvarCategorias = salvarCategorias; // ✅ REMOVIDO: função não existe
window.atualizarDropdowns = atualizarDropdowns;
window.atualizarListaCategorias = atualizarListaCategorias;

window.carregarCartoesLocal = carregarCartoesLocal;
window.salvarCartoes = salvarCartoes;
window.atualizarOpcoesCartoes = atualizarOpcoesCartoes;
window.recarregarEAtualizarCartoes = recarregarEAtualizarCartoes;
window.renderizarListaCartoes = renderizarListaCartoes;
window.adicionarCartao = adicionarCartao;
window.abrirModalEditarCartao = abrirModalEditarCartao;
window.excluirCartao = excluirCartao;

window.obterTipoUsuarioAtual = obterTipoUsuarioAtual;
window.filtrarUsuarios = filtrarUsuarios;
window.renderizarUsuarios = renderizarUsuarios;

window.formatarDocumento = formatarDocumento;
window.formatarValidade = formatarValidade;
window.validarDocumento = validarDocumento;
window.validarValidade = validarValidade;

window.mostrarFeedback = mostrarFeedback;
window.inicializarConfiguracoes = inicializarConfiguracoes;

window.exportarDados = exportarDados;
window.importarDados = importarDados;
window.limparDados = limparDados;

// Funções de permissão
window.podeVisualizarUsuario = podeVisualizarUsuario;
window.podeEditarUsuario = podeEditarUsuario;
window.podeExcluirUsuario = podeExcluirUsuario;
window.podeBloquearUsuario = podeBloquearUsuario;
window.podeCriarUsuario = podeCriarUsuario;
window.podeLimparLogs = podeLimparLogs;
window.obterTiposPermitidos = obterTiposPermitidos;

// ================================================================
// ALTERAR SENHA - MODAL
// ================================================================
document.addEventListener('DOMContentLoaded', function() {
    // Abrir modal ao clicar no botão do dropdown
    const btnAlterarSenhaMenu = document.getElementById('btn-alterar-senha-menu');
    const modalAlterarSenha = document.getElementById('modal-alterar-senha');
    const formAlterarSenha = document.getElementById('form-alterar-senha');

    if (btnAlterarSenhaMenu && modalAlterarSenha) {
        btnAlterarSenhaMenu.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            modalAlterarSenha.style.display = 'flex';
            modalAlterarSenha.classList.add('active');
            // Limpar campos quando abrir
            if (formAlterarSenha) {
                formAlterarSenha.reset();
            }
            // Fechar o dropdown
            const dropdownAnoMenu = document.getElementById('dropdown-ano-menu');
            if (dropdownAnoMenu) {
                dropdownAnoMenu.classList.remove('show');
            }
        });
    }

    // Formulário de alterar senha

    if (formAlterarSenha) {
        formAlterarSenha.addEventListener('submit', async function(e) {
            e.preventDefault();

            const senhaAtual = document.getElementById('senha-atual-modal').value;
            const senhaNova = document.getElementById('senha-nova-modal').value;
            const senhaConfirmar = document.getElementById('senha-confirmar-modal').value;

            // Validar se as senhas novas coincidem
            if (senhaNova !== senhaConfirmar) {
                mostrarFeedback('As senhas não coincidem!', 'error');
                return;
            }

            // Validar tamanho mínimo
            if (senhaNova.length < 6) {
                mostrarFeedback('A senha deve ter no mínimo 6 caracteres!', 'error');
                return;
            }

            const usuario = window.usuarioDataManager?.getUsuarioAtual();
            const token = sessionStorage.getItem('token') || localStorage.getItem('token');
            const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

            try {
                const response = await fetch(`${API_URL}/usuarios/${usuario.id}/alterar-senha`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        senhaAtual: senhaAtual,
                        senhaNova: senhaNova
                    })
                });

                const data = await response.json();

                if (response.ok) {
                    mostrarFeedback('Senha alterada com sucesso!', 'success');
                    formAlterarSenha.reset();
                    modalAlterarSenha.style.display = 'none';
                } else {
                    mostrarFeedback(data.message || 'Erro ao alterar senha. Verifique se a senha atual está correta.', 'error');
                }
            } catch (error) {
                console.error('Erro ao alterar senha:', error);
                mostrarFeedback('Erro ao alterar senha. Tente novamente.', 'error');
            }
        });
    }
});

// ================================================================
// REDIMENSIONAMENTO DE COLUNAS - CATEGORIAS
// ================================================================
(function() {
    let isResizing = false;
    let currentResizer = null;
    let startX = 0;
    let startWidth = 0;
    let currentColumnIndex = 0;

    const STORAGE_KEY = 'categorias-column-widths';

    function initColumnResizer() {
        const header = document.getElementById('categorias-grid-header');
        if (!header) return;

        loadColumnWidths();

        const resizers = header.querySelectorAll('.column-resizer');
        resizers.forEach((resizer, index) => {
            resizer.addEventListener('mousedown', startResize.bind(null, resizer, index));
        });

        document.addEventListener('mousemove', resize);
        document.addEventListener('mouseup', stopResize);
    }

    function startResize(resizer, columnIndex, e) {
        isResizing = true;
        currentResizer = resizer;
        currentColumnIndex = columnIndex;
        startX = e.pageX;

        const header = resizer.parentElement;
        startWidth = header.offsetWidth;

        e.preventDefault();
    }

    function resize(e) {
        if (!isResizing) return;

        const header = currentResizer.parentElement;
        const diff = e.pageX - startX;
        const newWidth = Math.max(50, startWidth + diff);

        header.style.width = newWidth + 'px';
        header.style.minWidth = newWidth + 'px';
        header.style.maxWidth = newWidth + 'px';

        syncColumnWidth(currentColumnIndex, newWidth);
    }

    function stopResize() {
        if (isResizing) {
            saveColumnWidths();
            isResizing = false;
        }
    }

    function syncColumnWidth(columnIndex, width) {
        const headers = document.querySelectorAll('#categorias-grid-header > div');
        const rows = document.querySelectorAll('#lista-categorias .grid-row');

        rows.forEach(row => {
            const cells = row.querySelectorAll('div');
            if (cells[columnIndex]) {
                cells[columnIndex].style.width = width + 'px';
                cells[columnIndex].style.minWidth = width + 'px';
                cells[columnIndex].style.maxWidth = width + 'px';
            }
        });
    }

    function saveColumnWidths() {
        const headers = document.querySelectorAll('#categorias-grid-header > div');
        const widths = Array.from(headers).map(h => h.offsetWidth);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
    }

    function loadColumnWidths() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;

        try {
            const widths = JSON.parse(saved);
            const headers = document.querySelectorAll('#categorias-grid-header > div');

            headers.forEach((header, index) => {
                if (widths[index]) {
                    header.style.width = widths[index] + 'px';
                    header.style.minWidth = widths[index] + 'px';
                    header.style.maxWidth = widths[index] + 'px';
                }
            });
        } catch (e) {
            console.error('Erro ao carregar larguras das colunas:', e);
        }
    }

    // Inicializar quando o DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initColumnResizer);
    } else {
        initColumnResizer();
    }

    // Reinicializar após renderizar lista
    window.reinitCategoriasResizer = initColumnResizer;
})();