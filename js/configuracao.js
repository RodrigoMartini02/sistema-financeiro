// ================================================================
// SISTEMA DE CONFIGURAÇÕES
// ================================================================

// ================================================================
// VARIÁVEIS GLOBAIS
// ================================================================
let categoriasUsuario = { despesas: [] };
let cartoesUsuario = {
    cartao1: { nome: '', validade: '', limite: 0, ativo: false },
    cartao2: { nome: '', validade: '', limite: 0, ativo: false },
    cartao3: { nome: '', validade: '', limite: 0, ativo: false }
};
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
function formatarDocumento(input) {
    let documento = input.value.replace(/\D/g, '');
    
    if (documento.length <= 11) {
        if (documento.length > 9) {
            documento = documento.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
        } else if (documento.length > 6) {
            documento = documento.replace(/(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3');
        } else if (documento.length > 3) {
            documento = documento.replace(/(\d{3})(\d{0,3})/, '$1.$2');
        }
    } else {
        if (documento.length > 12) {
            documento = documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5');
        } else if (documento.length > 8) {
            documento = documento.replace(/(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4');
        }
    }
    
    input.value = documento;
}

function formatarValidade(input) {
    let validade = input.value.replace(/\D/g, '');
    
    if (validade.length >= 2) {
        validade = validade.replace(/(\d{2})(\d{0,4})/, '$1/$2');
    }
    
    input.value = validade;
}

function validarCPF(cpf) {
    cpf = cpf.replace(/[^\d]+/g, '');
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    
    let soma = 0;
    for (let i = 1; i <= 9; i++) 
        soma += parseInt(cpf.substring(i-1, i)) * (11 - i);
    
    let resto = (soma * 10) % 11;
    if ((resto === 10) || (resto === 11)) resto = 0;
    if (resto !== parseInt(cpf.substring(9, 10))) return false;
    
    soma = 0;
    for (let i = 1; i <= 10; i++) 
        soma += parseInt(cpf.substring(i-1, i)) * (12 - i);
        
    resto = (soma * 10) % 11;
    if ((resto === 10) || (resto === 11)) resto = 0;
    return resto === parseInt(cpf.substring(10, 11));
}

function validarCNPJ(cnpj) {
    cnpj = cnpj.replace(/[^\d]+/g, '');
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
    
    let tamanho = cnpj.length - 2;
    let numeros = cnpj.substring(0, tamanho);
    let digitos = cnpj.substring(tamanho);
    let soma = 0;
    let pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
        soma += numeros.charAt(tamanho - i) * pos--;
        if (pos < 2) pos = 9;
    }
    
    let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    if (resultado != digitos.charAt(0)) return false;
    
    tamanho++;
    numeros = cnpj.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
        soma += numeros.charAt(tamanho - i) * pos--;
        if (pos < 2) pos = 9;
    }
    
    resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    return resultado == digitos.charAt(1);
}

function validarDocumento(documento) {
    documento = documento.replace(/[^\d]+/g, '');
    
    if (documento.length === 11) {
        return validarCPF(documento);
    } else if (documento.length === 14) {
        return validarCNPJ(documento);
    }
    
    return false;
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

async function salvarCategorias() {
    const usuario = window.usuarioDataManager?.getUsuarioAtual();
    if (!usuario || !usuario.id) {
        console.error('❌ Usuário não encontrado para salvar categorias');
        return false;
    }

    try {
        console.log('💾 Salvando categorias na API...', categoriasUsuario);

        // ✅ Garantir que API_URL existe
        const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

        // 🔥 SALVAR NA API
        const response = await fetch(`${API_URL}/usuarios/${usuario.id}/categorias`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('token') || ''}`
            },
            body: JSON.stringify({ categorias: categoriasUsuario })
        });

        // ✅ Verificar se a resposta tem conteúdo antes de parsear
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            console.error('❌ Resposta não é JSON:', await response.text());
            return false;
        }

        const data = await response.json();

        if (!response.ok) {
            console.error('❌ Erro ao salvar categorias:', data.message || 'Erro desconhecido');
            return false;
        }

        if (data.success) {
            console.log('✅ Categorias salvas na API com sucesso!');
            return true;
        } else {
            console.error('❌ API retornou sucesso=false:', data.message);
            return false;
        }
    } catch (error) {
        console.error('❌ Erro ao salvar categorias na API:', error);
        return false;
    }
}

function atualizarDropdowns() {
    const dropdownCategoria = document.getElementById('despesa-categoria');
    if (dropdownCategoria && categoriasUsuario.despesas) {
        const valorSelecionado = dropdownCategoria.value;
        
        while (dropdownCategoria.options.length > 1) {
            dropdownCategoria.remove(1);
        }
        
        categoriasUsuario.despesas.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            dropdownCategoria.appendChild(option);
        });
        
        if (valorSelecionado && categoriasUsuario.despesas.includes(valorSelecionado)) {
            dropdownCategoria.value = valorSelecionado;
        }
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

    if (categoriasUsuario.despesas.includes(nomeCat)) {
        mostrarFeedback('Esta categoria já existe!', 'error');
        return;
    }

    categoriasUsuario.despesas.push(nomeCat);
    categoriasUsuario.despesas.sort();

    const sucesso = await salvarCategorias();
    if (sucesso) {
        inputNovaCategoria.value = '';
        atualizarListaCategorias();
        atualizarDropdowns();
        mostrarFeedback('Alterações realizadas com sucesso!', 'success');
    } else {
        const index = categoriasUsuario.despesas.indexOf(nomeCat);
        if (index > -1) {
            categoriasUsuario.despesas.splice(index, 1);
        }
        mostrarFeedback('Erro ao salvar categoria. Tente novamente.', 'error');
    }
}

function atualizarListaCategorias() {
    const listaCategorias = document.getElementById('lista-categorias');
    const semCategoriasMessage = document.getElementById('sem-categorias-message');
    
    if (!listaCategorias) return;
    
    listaCategorias.innerHTML = '';
    
    if (!categoriasUsuario.despesas || categoriasUsuario.despesas.length === 0) {
        if (semCategoriasMessage) semCategoriasMessage.classList.remove('hidden');
        return;
    }
    
    if (semCategoriasMessage) semCategoriasMessage.classList.add('hidden');
    
    categoriasUsuario.despesas.forEach(categoria => {
        const template = document.getElementById('template-linha-categoria');
        if (!template) return;
        
        const linha = template.content.cloneNode(true);
        linha.querySelector('.categoria-nome').textContent = categoria;
        linha.querySelector('.btn-editar-categoria').setAttribute('data-categoria', categoria);
        linha.querySelector('.btn-remover-categoria').setAttribute('data-categoria', categoria);
        
        listaCategorias.appendChild(linha);
    });
}

function editarCategoria(categoria) {
    const modalEditar = document.getElementById('modal-editar-categoria');
    const nomeInput = document.getElementById('categoria-edit-nome');
    const nomeOriginalInput = document.getElementById('categoria-edit-nome-original');
    
    if (modalEditar && nomeInput && nomeOriginalInput) {
        nomeInput.value = categoria;
        nomeOriginalInput.value = categoria;
        modalEditar.style.display = 'flex';
    }
}

async function removerCategoria(categoria) {
    const confirmar = confirm(`Tem certeza que deseja remover a categoria "${categoria}"?`);
    if (!confirmar) return;

    const index = categoriasUsuario.despesas.indexOf(categoria);
    if (index !== -1) {
        const categoriaRemovida = categoriasUsuario.despesas.splice(index, 1)[0];

        const sucesso = await salvarCategorias();
        if (sucesso) {
            atualizarListaCategorias();
            atualizarDropdowns();
            mostrarFeedback('Alterações realizadas com sucesso!', 'success');
        } else {
            categoriasUsuario.despesas.splice(index, 0, categoriaRemovida);
            mostrarFeedback('Erro ao remover categoria. Tente novamente.', 'error');
        }
    }
}

async function salvarEdicaoCategoria() {
    const nomeInput = document.getElementById('categoria-edit-nome');
    const nomeOriginalInput = document.getElementById('categoria-edit-nome-original');

    if (!nomeInput || !nomeOriginalInput) return;

    const novoNome = nomeInput.value.trim();
    const nomeOriginal = nomeOriginalInput.value;

    if (!novoNome) {
        mostrarFeedback('Por favor, digite um nome para a categoria.', 'warning');
        return;
    }

    if (novoNome !== nomeOriginal && categoriasUsuario.despesas.includes(novoNome)) {
        mostrarFeedback('Já existe uma categoria com este nome!', 'error');
        return;
    }

    const index = categoriasUsuario.despesas.indexOf(nomeOriginal);
    if (index !== -1) {
        categoriasUsuario.despesas[index] = novoNome;
        categoriasUsuario.despesas.sort();

        const sucesso = await salvarCategorias();
        if (sucesso) {
            atualizarListaCategorias();
            atualizarDropdowns();
            document.getElementById('modal-editar-categoria').style.display = 'none';
            mostrarFeedback('Alterações realizadas com sucesso!', 'success');
        } else {
            categoriasUsuario.despesas[index] = nomeOriginal;
            mostrarFeedback('Erro ao salvar alteração. Tente novamente.', 'error');
        }
    }
}

// ================================================================
// SISTEMA DE CARTÕES
// ================================================================
async function carregarCartoesLocal() {
    const usuario = window.usuarioDataManager?.getUsuarioAtual();
    const token = sessionStorage.getItem('token');

    const cartoesPadrao = {
        cartao1: { nome: '', validade: '', limite: 0, ativo: false },
        cartao2: { nome: '', validade: '', limite: 0, ativo: false },
        cartao3: { nome: '', validade: '', limite: 0, ativo: false }
    };

    // ✅ Verificar se está autenticado ANTES de fazer API call
    if (!usuario || !usuario.id || !token) {
        cartoesUsuario = cartoesPadrao;
        window.cartoesUsuario = cartoesUsuario;
        return;
    }

    try {
        // ✅ Garantir que API_URL existe
        const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

        // 🔥 BUSCAR DA API
        const response = await fetch(`${API_URL}/usuarios/${usuario.id}/cartoes`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            // Silenciosamente usar padrão se não autenticado ou erro
            cartoesUsuario = cartoesPadrao;
            window.cartoesUsuario = cartoesUsuario;
            return;
        }

        const data = await response.json();

        if (data.success) {
            cartoesUsuario = data.cartoes;
            window.cartoesUsuario = cartoesUsuario;
        } else {
            cartoesUsuario = cartoesPadrao;
            window.cartoesUsuario = cartoesUsuario;
        }
    } catch (error) {
        // Silenciosamente usar padrão em caso de erro
        cartoesUsuario = cartoesPadrao;
        window.cartoesUsuario = cartoesUsuario;
    }
}

async function salvarCartoes() {
    const usuario = window.usuarioDataManager?.getUsuarioAtual();
    if (!usuario || !usuario.id) {
        console.error('❌ Usuário não encontrado para salvar cartões');
        return false;
    }

    try {
        console.log('💾 Salvando cartões na API...', cartoesUsuario);

        // ✅ Garantir que API_URL existe
        const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';
        const url = `${API_URL}/usuarios/${usuario.id}/cartoes`;
        console.log('📡 URL da requisição:', url);

        // 🔥 SALVAR NA API
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('token') || ''}`
            },
            body: JSON.stringify({ cartoes: cartoesUsuario })
        });

        // ✅ Verificar se a resposta tem conteúdo antes de parsear
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            console.error('❌ Resposta não é JSON:', await response.text());
            return false;
        }

        const data = await response.json();

        if (!response.ok) {
            console.error('❌ Erro ao salvar cartões:', data.message || 'Erro desconhecido');
            return false;
        }

        if (data.success) {
            console.log('✅ Cartões salvos na API com sucesso!');
            window.cartoesUsuario = cartoesUsuario;
            return true;
        } else {
            console.error('❌ API retornou sucesso=false:', data.message);
            return false;
        }
    } catch (error) {
        console.error('❌ Erro ao salvar cartões na API:', error);
        return false;
    }
}

function atualizarOpcoesCartoes() {
    try {
        let cartoesVisiveis = 0;
        
        ['1', '2', '3'].forEach(num => {
            const label = document.getElementById(`label-cartao${num}`);
            const option = document.getElementById(`cartao${num}-option`);
            const radioInput = document.getElementById(`pagamento-cartao${num}`);
            const cartao = cartoesUsuario[`cartao${num}`];
            
            if (label && option && radioInput && cartao) {
                if (cartao.ativo && cartao.nome && cartao.nome.trim() !== '') {
                    label.textContent = cartao.nome.toUpperCase();
                    option.classList.remove('hidden');
                    radioInput.disabled = false;
                    radioInput.setAttribute('data-cartao', num);
                    cartoesVisiveis++;
                } else {
                    label.textContent = `CARTÃO ${num}`;
                    option.classList.add('hidden');
                    radioInput.disabled = true;
                    radioInput.checked = false;
                }
            }
        });
        
        const creditoOptions = document.getElementById('credito-options');
        if (creditoOptions) {
            if (cartoesVisiveis === 0) {
                creditoOptions.classList.add('hidden');
                
                const radioPix = document.getElementById('pagamento-pix');
                if (radioPix && !document.querySelector('input[name="forma-pagamento"]:checked')) {
                    radioPix.checked = true;
                }
            } else {
                creditoOptions.classList.remove('hidden');
            }
        }
    } catch (error) {
        console.error('Erro ao atualizar opções de cartões:', error);
    }
}

function preencherFormularioCartoes() {
    ['1', '2', '3'].forEach(num => {
        const cartao = cartoesUsuario[`cartao${num}`];
        
        const nomeInput = document.getElementById(`cartao${num}-nome`);
        const validadeInput = document.getElementById(`cartao${num}-validade`);
        const limiteInput = document.getElementById(`cartao${num}-limite`);
        const ativoCheckbox = document.getElementById(`cartao${num}-ativo`);
        
        if (nomeInput) nomeInput.value = cartao.nome || '';
        if (validadeInput) validadeInput.value = cartao.validade || '';
        if (limiteInput) limiteInput.value = cartao.limite || 0;
        if (ativoCheckbox) ativoCheckbox.checked = cartao.ativo || false;
    });
}

async function salvarCartoesForms() {
    try {
        let cartoesAlterados = false;
        let errosValidacao = [];

        ['1', '2', '3'].forEach(num => {
            const nomeInput = document.getElementById(`cartao${num}-nome`);
            const validadeInput = document.getElementById(`cartao${num}-validade`);
            const limiteInput = document.getElementById(`cartao${num}-limite`);
            const ativoCheckbox = document.getElementById(`cartao${num}-ativo`);

            if (!nomeInput || !validadeInput || !limiteInput || !ativoCheckbox) {
                return;
            }

            const dadosFormulario = {
                nome: nomeInput.value.trim(),
                validade: validadeInput.value.trim(),
                limite: parseFloat(limiteInput.value) || 0,
                ativo: ativoCheckbox.checked
            };

            const cartaoAtual = cartoesUsuario[`cartao${num}`];

            if (cartaoAtual.nome !== dadosFormulario.nome ||
                cartaoAtual.validade !== dadosFormulario.validade ||
                cartaoAtual.limite !== dadosFormulario.limite ||
                cartaoAtual.ativo !== dadosFormulario.ativo) {

                cartoesAlterados = true;

                if (dadosFormulario.ativo) {
                    if (!dadosFormulario.nome) {
                        errosValidacao.push(`Cartão ${num}: Nome é obrigatório`);
                    }

                    if (!dadosFormulario.validade || !validarValidade(dadosFormulario.validade)) {
                        errosValidacao.push(`Cartão ${num}: Validade inválida (MM/AAAA)`);
                    }

                    if (dadosFormulario.limite <= 0) {
                        errosValidacao.push(`Cartão ${num}: Limite deve ser maior que zero`);
                    }
                }

                cartoesUsuario[`cartao${num}`] = dadosFormulario;
            }
        });

        if (errosValidacao.length > 0) {
            mostrarFeedback(errosValidacao.join('\n'), 'error');
            return;
        }

        if (!cartoesAlterados) {
            mostrarFeedback('Nenhuma alteração foi detectada nos cartões.', 'warning');
            return;
        }

        // 🔥 SALVAR COM AWAIT
        const sucesso = await salvarCartoes();

        if (sucesso) {
            atualizarOpcoesCartoes();
            window.cartoesUsuario = cartoesUsuario;

            if (typeof window.limparCacheCartoes === 'function') {
                window.limparCacheCartoes();
            }

            mostrarStatusCartoes('Cartões salvos com sucesso!', 'success');

            // ✅ Recarregar cartões do servidor para garantir sincronização
            await carregarCartoesLocal();

            setTimeout(() => {
                if (typeof window.renderizarDetalhesDoMes === 'function' &&
                    window.mesAberto !== null && window.anoAberto !== null) {
                    window.renderizarDetalhesDoMes(window.mesAberto, window.anoAberto);
                }
            }, 100);

        } else {
            mostrarStatusCartoes('Erro ao salvar os cartões. Tente novamente.', 'error');
        }
        
    } catch (error) {
        console.error('Erro ao salvar cartões:', error);
        mostrarStatusCartoes('Erro inesperado ao salvar cartões.', 'error');
    }
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
    
    const btnAdicionarUsuario = document.getElementById('btn-adicionar-usuario');
    if (btnAdicionarUsuario) {
        if (tipoUsuarioAtual === 'master') {
            btnAdicionarUsuario.classList.remove('hidden');
        } else {
            btnAdicionarUsuario.classList.add('hidden');
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
            usuariosFiltrados = data.data || [];
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
        btnBloquear.classList.add('btn-desbloquear');
    }
    
    if (tipoUsuarioAtual === 'master') {
        btnEditar.classList.remove('hidden');
        btnBloquear.classList.remove('hidden');
        btnExcluir.classList.remove('hidden');
        textoSemPermissao.classList.add('hidden');
    } else if (tipoUsuarioAtual === 'admin') {
        if (tipo === 'padrao') {
            btnEditar.classList.remove('hidden');
            btnBloquear.classList.remove('hidden');
            btnExcluir.classList.add('hidden');
            textoSemPermissao.classList.add('hidden');
        } else {
            btnEditar.classList.add('hidden');
            btnBloquear.classList.add('hidden');
            btnExcluir.classList.add('hidden');
            textoSemPermissao.classList.remove('hidden');
        }
    }
    
    return linha;
}

async function alternarBloqueioUsuario(usuario) {
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
        console.error('❌ Erro ao alterar status:', error);
        mostrarFeedback('Erro ao alterar status do usuário', 'error');
    }
}

function excluirUsuario(usuario) {
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
        console.error('❌ Erro ao excluir usuário:', error);
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
    }
    
    modal.style.display = 'flex';
}

function preencherDadosUsuario(usuario) {
    // 🔥 USAR ID DO USUARIO AO INVÉS DE DOCUMENTO
    const campos = {
        'editar-usuario-id': usuario.id,
        'editar-usuario-nome': usuario.nome || '',
        'editar-usuario-email': usuario.email || '',
        'editar-usuario-documento': usuario.documento || '',
        'editar-usuario-tipo': usuario.tipo || 'padrao',
        'editar-usuario-status': usuario.status || 'ativo'
    };

    Object.entries(campos).forEach(([id, valor]) => {
        const elemento = document.getElementById(id);
        if (elemento) {
            elemento.value = valor;
        }
    });

    const formGroupTipo = document.getElementById('form-group-tipo');
    const permissaoMessage = document.getElementById('permissao-message');

    if (tipoUsuarioAtual !== 'master') {
        if (formGroupTipo) formGroupTipo.classList.add('hidden');

        if (usuario.tipo !== 'padrao') {
            ['editar-usuario-nome', 'editar-usuario-email', 'editar-usuario-status',
             'editar-usuario-senha', 'editar-usuario-confirmar-senha'].forEach(id => {
                const elemento = document.getElementById(id);
                if (elemento) elemento.disabled = true;
            });

            if (permissaoMessage) permissaoMessage.classList.remove('hidden');
        } else {
            if (permissaoMessage) permissaoMessage.classList.add('hidden');
        }
    } else {
        if (formGroupTipo) formGroupTipo.classList.remove('hidden');
        if (permissaoMessage) permissaoMessage.classList.add('hidden');
    }
}

async function salvarEdicaoUsuario(isNovo = false) {
    try {
        const prefixo = isNovo ? 'novo-usuario' : 'editar-usuario';

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
            console.error('❌ Erro ao chamar API:', apiError);
            mostrarValidacao('Erro ao conectar com o servidor. Tente novamente.', 'error');
        }

    } catch (error) {
        console.error('Erro ao salvar usuário:', error);
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
async function exportarDados() {
    try {
        // Usar dados já carregados no sistema
        const dadosFinanceiros = window.dadosFinanceiros || {};

        if (!dadosFinanceiros || Object.keys(dadosFinanceiros).length === 0) {
            mostrarFeedback('Não há dados para exportar', 'warning');
            return;
        }

        // Converter para CSV
        const csvContent = converterParaCSV({ dadosFinanceiros });

        // Download do arquivo
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        const dataAtual = new Date().toISOString().split('T')[0];
        link.setAttribute('href', url);
        link.setAttribute('download', `backup_financeiro_${dataAtual}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        mostrarFeedback('Dados exportados com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao exportar dados:', error);
        mostrarFeedback('Erro ao exportar dados', 'error');
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
    inputFile.accept = '.csv';

    inputFile.onchange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const csvText = await file.text();
            const dadosImportados = converterCSVParaJSON(csvText);

            const usuario = window.usuarioDataManager?.getUsuarioAtual();
            if (!usuario || !usuario.id) {
                mostrarFeedback('Usuário não encontrado', 'error');
                return;
            }

            if (dadosImportados.receitas.length === 0 && dadosImportados.despesas.length === 0) {
                mostrarFeedback('Nenhum dado válido encontrado no arquivo CSV', 'warning');
                return;
            }

            const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';
            const token = sessionStorage.getItem('token');

            let sucessos = 0;
            let erros = 0;
            const total = dadosImportados.receitas.length + dadosImportados.despesas.length;

            mostrarFeedback(`Importando ${total} registros...`, 'info');

            // Importar receitas usando rotas existentes
            for (const receita of dadosImportados.receitas) {
                try {
                    const response = await fetch(`${API_URL}/usuarios/${usuario.id}/anos/${receita.ano}/receitas`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            mes: receita.mes,
                            data: receita.data,
                            descricao: receita.descricao,
                            categoria: receita.categoria,
                            valor: receita.valor,
                            formaPagamento: receita.formaPagamento,
                            parcelas: receita.parcelas,
                            status: receita.status,
                            observacoes: receita.observacoes
                        })
                    });

                    if (response.ok) sucessos++;
                    else erros++;
                } catch (error) {
                    erros++;
                }
            }

            // Importar despesas usando rotas existentes
            for (const despesa of dadosImportados.despesas) {
                try {
                    const response = await fetch(`${API_URL}/usuarios/${usuario.id}/anos/${despesa.ano}/despesas`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            mes: despesa.mes,
                            data: despesa.data,
                            descricao: despesa.descricao,
                            categoria: despesa.categoria,
                            valor: despesa.valor,
                            formaPagamento: despesa.formaPagamento,
                            parcelas: despesa.parcelas,
                            status: despesa.status,
                            observacoes: despesa.observacoes
                        })
                    });

                    if (response.ok) sucessos++;
                    else erros++;
                } catch (error) {
                    erros++;
                }
            }

            if (sucessos > 0) {
                mostrarFeedback(
                    `Importação concluída: ${sucessos} de ${total} registros${erros > 0 ? ` (${erros} erros)` : ''}`,
                    erros > 0 ? 'warning' : 'success'
                );

                // Recarregar dados
                if (typeof window.carregarDadosLocais === 'function') {
                    await window.carregarDadosLocais();
                }

                // Atualizar dashboard
                if (typeof window.carregarDadosDashboard === 'function') {
                    await window.carregarDadosDashboard(window.anoAtual || new Date().getFullYear());
                }
            } else {
                mostrarFeedback('Erro: Nenhum registro foi importado', 'error');
            }
        } catch (error) {
            console.error('Erro ao importar dados:', error);
            mostrarFeedback('Erro ao processar arquivo CSV', 'error');
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

        const item = {
            tipo: valores[0],
            ano: parseInt(valores[1]) || new Date().getFullYear(),
            mes: parseInt(valores[2]) || 1,
            data: valores[3],
            descricao: valores[4],
            categoria: valores[5],
            valor: parseFloat(valores[6]) || 0,
            formaPagamento: valores[7],
            parcelas: parseInt(valores[8]) || null,
            status: valores[9] || 'Pago',
            observacoes: valores[10]
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
    const confirmar = confirm(
        'ATENÇÃO: Esta ação é irreversível!\n\n' +
        'Todos os seus dados financeiros serão permanentemente excluídos.\n' +
        'Deseja realmente continuar?'
    );

    if (!confirmar) return;

    const confirmarNovamente = confirm(
        'ÚLTIMA CONFIRMAÇÃO!\n\n' +
        'Tem ABSOLUTA CERTEZA que deseja excluir TODOS os seus dados?\n' +
        'Esta ação NÃO pode ser desfeita!'
    );

    if (!confirmarNovamente) return;

    try {
        const usuario = window.usuarioDataManager?.getUsuarioAtual();
        if (!usuario || !usuario.id) {
            mostrarFeedback('Usuário não encontrado', 'error');
            return;
        }

        const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';

        const response = await fetch(`${API_URL}/usuarios/${usuario.id}/limpar-dados`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionStorage.getItem('token') || ''}`
            }
        });

        const data = await response.json();

        if (response.ok && data.success) {
            mostrarFeedback('Todos os dados foram excluídos!', 'success');

            // Recarregar dados (agora vazios)
            if (typeof window.carregarDadosLocais === 'function') {
                await window.carregarDadosLocais();
            }

            // Limpar dashboard
            if (typeof window.carregarDadosDashboard === 'function') {
                await window.carregarDadosDashboard(window.anoAtual || new Date().getFullYear());
            }

            // Redirecionar para dashboard
            setTimeout(() => {
                if (typeof window.onSecaoAtivada === 'function') {
                    window.onSecaoAtivada('dashboard');
                }
            }, 1000);
        } else {
            mostrarFeedback(data.message || 'Erro ao limpar dados', 'error');
        }
    } catch (error) {
        console.error('Erro ao limpar dados:', error);
        mostrarFeedback('Erro ao limpar dados', 'error');
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
                    setTimeout(() => preencherFormularioCartoes(), 100);
                } else if (targetTab === 'usuarios') {
                    setTimeout(() => filtrarUsuarios(), 100);
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
    
    const btnSalvarCartoes = document.getElementById('btn-salvar-cartoes');
    if (btnSalvarCartoes) {
        btnSalvarCartoes.addEventListener('click', salvarCartoesForms);
    }
    
    ['1', '2', '3'].forEach(num => {
        const validadeInput = document.getElementById(`cartao${num}-validade`);
        if (validadeInput) {
            validadeInput.addEventListener('input', function() {
                formatarValidade(this);
            });
        }
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
            const categoria = target.getAttribute('data-categoria');
            if (categoria) editarCategoria(categoria);
        }
        
        if (target.classList.contains('btn-remover-categoria')) {
            const categoria = target.getAttribute('data-categoria');
            if (categoria) removerCategoria(categoria);
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
    const btnImportarDados = document.getElementById('btn-importar-dados');
    const btnLimparDados = document.getElementById('btn-limpar-dados');

    if (btnExportarDados) {
        btnExportarDados.addEventListener('click', exportarDados);
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

    console.log('Sistema de configurações inicializado com sucesso');
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(inicializarConfiguracoes, 1000);
});

window.categoriasUsuario = categoriasUsuario;
window.cartoesUsuario = cartoesUsuario;
window.categoriasPadrao = categoriasPadrao;

window.carregarCategoriasLocal = carregarCategoriasLocal;
window.salvarCategorias = salvarCategorias;
window.atualizarDropdowns = atualizarDropdowns;
window.atualizarListaCategorias = atualizarListaCategorias;

window.carregarCartoesLocal = carregarCartoesLocal;
window.salvarCartoes = salvarCartoes;
window.atualizarOpcoesCartoes = atualizarOpcoesCartoes;
window.preencherFormularioCartoes = preencherFormularioCartoes;

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