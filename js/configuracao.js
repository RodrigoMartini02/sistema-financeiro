// ================================================================
// SISTEMA DE CONFIGURAÇÕES
// ================================================================
// DEPENDÊNCIAS: config.js, utils.js
// ================================================================

// NOTA: window.API_URL e getToken() agora são definidos em config.js e utils.js
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
async function carregarCategoriasAPI() {
    try {
        const token = getToken();
        if (!token) {
            categoriasUsuario.despesas = [...categoriasPadrao.despesas];
            return;
        }

        const response = await fetch(`${API_URL}/categorias`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            categoriasUsuario.despesas = data.data.map(cat => cat.nome);
        } else {
            carregarCategoriasLocalFallback();
        }
    } catch (error) {
        carregarCategoriasLocalFallback();
    }
}






async function salvarCategoriasAPI(nome, acao = 'criar', categoriaId = null) {
    try {
        const token = getToken();
        if (!token) {
            return salvarCategoriasLocalFallback();
        }

        let response;
        
        if (acao === 'criar') {
            response = await fetch(`${API_URL}/categorias`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    nome: nome,
                    cor: '#3498db',
                    icone: null
                })
            });
        } else if (acao === 'editar') {
            response = await fetch(`${API_URL}/categorias/${categoriaId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    nome: nome,
                    cor: '#3498db',
                    icone: null
                })
            });
        } else if (acao === 'excluir') {
            response = await fetch(`${API_URL}/categorias/${categoriaId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }

        return response && response.ok;
    } catch (error) {
        return salvarCategoriasLocalFallback();
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
    
    const sucesso = await salvarCategoriasAPI(nomeCat, 'criar');
    
    if (sucesso) {
        categoriasUsuario.despesas.push(nomeCat);
        categoriasUsuario.despesas.sort();
        
        inputNovaCategoria.value = '';
        await carregarCategoriasAPI();
        atualizarListaCategorias();
        atualizarDropdowns();
        mostrarFeedback('Alterações realizadas com sucesso!', 'success');
    } else {
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
    
    const categoriaId = await obterCategoriaId(categoria);
    if (!categoriaId) {
        mostrarFeedback('Erro: categoria não encontrada.', 'error');
        return;
    }
    
    const sucesso = await salvarCategoriasAPI(categoria, 'excluir', categoriaId);
    
    if (sucesso) {
        const index = categoriasUsuario.despesas.indexOf(categoria);
        if (index !== -1) {
            categoriasUsuario.despesas.splice(index, 1);
        }
        
        await carregarCategoriasAPI();
        atualizarListaCategorias();
        atualizarDropdowns();
        mostrarFeedback('Alterações realizadas com sucesso!', 'success');
    } else {
        mostrarFeedback('Erro ao remover categoria. Tente novamente.', 'error');
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
    
    const categoriaId = await obterCategoriaId(nomeOriginal);
    if (!categoriaId) {
        mostrarFeedback('Erro: categoria não encontrada.', 'error');
        return;
    }
    
    const sucesso = await salvarCategoriasAPI(novoNome, 'editar', categoriaId);
    
    if (sucesso) {
        const index = categoriasUsuario.despesas.indexOf(nomeOriginal);
        if (index !== -1) {
            categoriasUsuario.despesas[index] = novoNome;
            categoriasUsuario.despesas.sort();
        }
        
        await carregarCategoriasAPI();
        atualizarListaCategorias();
        atualizarDropdowns();
        document.getElementById('modal-editar-categoria').style.display = 'none';
        mostrarFeedback('Alterações realizadas com sucesso!', 'success');
    } else {
        mostrarFeedback('Erro ao salvar alteração. Tente novamente.', 'error');
    }
}

// ================================================================
// SISTEMA DE CARTÕES
// ================================================================
async function carregarCartoesAPI() {
    try {
        const token = getToken();
        if (!token) {
            cartoesUsuario = {
                cartao1: { nome: '', validade: '', limite: 0, ativo: false },
                cartao2: { nome: '', validade: '', limite: 0, ativo: false },
                cartao3: { nome: '', validade: '', limite: 0, ativo: false }
            };
            window.cartoesUsuario = cartoesUsuario;
            return;
        }

        const response = await fetch(`${API_URL}/cartoes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const cartoes = data.data || [];
            
            cartoesUsuario = {
                cartao1: { nome: '', validade: '', limite: 0, ativo: false },
                cartao2: { nome: '', validade: '', limite: 0, ativo: false },
                cartao3: { nome: '', validade: '', limite: 0, ativo: false }
            };
            
            cartoes.forEach((cartao, index) => {
                if (index < 3) {
                    const numeroCartao = index + 1;
                    cartoesUsuario[`cartao${numeroCartao}`] = {
                        nome: cartao.nome || '',
                        validade: `${cartao.dia_fechamento}/${cartao.dia_vencimento}` || '',
                        limite: parseFloat(cartao.limite) || 0,
                        ativo: true
                    };
                }
            });
            
            window.cartoesUsuario = cartoesUsuario;
        } else {
            carregarCartoesLocalFallback();
        }
    } catch (error) {
        carregarCartoesLocalFallback();
    }
}

async function salvarCartoesAPI() {
    try {
        const token = getToken();
        if (!token) {
            return salvarCartoesLocalFallback();
        }

        const cartoesAtivos = [];
        
        ['1', '2', '3'].forEach(num => {
            const cartao = cartoesUsuario[`cartao${num}`];
            if (cartao && cartao.ativo && cartao.nome && cartao.nome.trim() !== '') {
                const [diaFechamento, diaVencimento] = (cartao.validade || '/').split('/');
                
                cartoesAtivos.push({
                    nome: cartao.nome,
                    limite: parseFloat(cartao.limite) || 0,
                    dia_fechamento: parseInt(diaFechamento) || 1,
                    dia_vencimento: parseInt(diaVencimento) || 1,
                    cor: '#3498db'
                });
            }
        });

        const response = await fetch(`${API_URL}/cartoes`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ cartoes: cartoesAtivos })
        });

        if (response.ok) {
            window.cartoesUsuario = cartoesUsuario;
            return true;
        } else {
            return salvarCartoesLocalFallback();
        }
    } catch (error) {
        return salvarCartoesLocalFallback();
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
        
        if (await salvarCartoesAPI()) {
            atualizarOpcoesCartoes();
            window.cartoesUsuario = cartoesUsuario;
            
            if (typeof window.limparCacheCartoes === 'function') {
                window.limparCacheCartoes();
            }
            
            mostrarStatusCartoes('Alterações realizadas com sucesso!', 'success');
            
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

function mostrarStatusCartoes(mensagem, tipo) {
    const statusElement = document.getElementById('cartoes-status');
    const iconElement = statusElement?.querySelector('.feedback-icon');
    const textElement = statusElement?.querySelector('.feedback-text');
    
    if (statusElement && iconElement && textElement) {
        statusElement.className = `status-feedback ${tipo}`;
        textElement.textContent = mensagem;
        
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle'
        };
        
        iconElement.className = `feedback-icon ${icons[tipo]}`;
        statusElement.classList.remove('hidden');
        
        setTimeout(() => {
            statusElement.classList.add('hidden');
        }, 5000);
    }
}

// ================================================================
// SISTEMA DE USUÁRIOS
// ================================================================
async function obterTipoUsuarioAtual() {
    try {
        const token = getToken();
        if (!token) {
            tipoUsuarioAtual = 'padrao';
            return;
        }
        
        const response = await fetch(`${API_URL}/usuarios/current`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            tipoUsuarioAtual = data.data.tipo || 'padrao';
        } else {
            tipoUsuarioAtual = 'padrao';
        }
        
    } catch (error) {
        console.error('Erro ao obter tipo do usuário:', error);
        tipoUsuarioAtual = 'padrao';
    }
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
    try {
        const searchTerm = document.getElementById('usuario-search')?.value || '';
        const filterType = document.getElementById('filter-user-type')?.value || 'todos';
        
        const params = new URLSearchParams({
            page: paginaAtual,
            limit: itensPorPagina,
            search: searchTerm,
            tipo: filterType === 'todos' ? '' : filterType
        });
        
        const response = await fetch(`${API_URL}/usuarios?${params}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        
        const data = await response.json();
        
        if (response.ok) {
            usuariosFiltrados = data.data;
            renderizarUsuarios();
            atualizarInfoPaginacao(data.pagination);
        }
    } catch (error) {
        console.error('Erro ao buscar usuários:', error);
    }
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
    const novoStatus = estavaBloqueado ? 'ativo' : 'bloqueado';
    const acao = estavaBloqueado ? 'desbloquear' : 'bloquear';
    
    if (!confirm(`Deseja ${acao} o usuário ${usuario.nome}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/usuarios/${usuario.id}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ status: novoStatus })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            await filtrarUsuarios();
            mostrarFeedback('Alterações realizadas com sucesso!', 'success');
        } else {
            mostrarFeedback(data.message || 'Erro ao alterar status do usuário', 'error');
        }
        
    } catch (error) {
        console.error('Erro ao alterar status:', error);
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




function atualizarInfoPaginacao(pagination) {
    const paginationInfo = document.getElementById('pagination-info');
    const btnPrevPage = document.getElementById('btn-prev-page');
    const btnNextPage = document.getElementById('btn-next-page');
    
    if (paginationInfo) {
        paginationInfo.textContent = `Página ${pagination.page} de ${pagination.pages}`;
    }
    
    if (btnPrevPage) {
        btnPrevPage.disabled = pagination.page <= 1;
    }
    
    if (btnNextPage) {
        btnNextPage.disabled = pagination.page >= pagination.pages;
    }
}




async function confirmarExclusaoUsuario() {
    const modal = document.getElementById('modal-confirmar-exclusao-usuario');
    const userId = modal?.getAttribute('data-usuario-id');
    
    if (!userId) return;
    
    try {
        const response = await fetch(`${API_URL}/usuarios/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        
        const data = await response.json();
        
        modal.style.display = 'none';
        
        if (response.ok) {
            await filtrarUsuarios();
            mostrarFeedback('Alterações realizadas com sucesso!', 'success');
        } else {
            mostrarFeedback(data.message || 'Erro ao excluir usuário', 'error');
        }
        
    } catch (error) {
        console.error('Erro ao excluir usuário:', error);
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
    const campos = {
        'editar-usuario-id': usuario.documento,
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
        const tipo = document.getElementById(`${prefixo}-tipo`).value;
        const status = isNovo ? 'ativo' : document.getElementById(`${prefixo}-status`).value;
        const senhaInput = document.getElementById(`${prefixo}-senha`);
        const confirmarSenhaInput = document.getElementById(`${prefixo}-confirmar-senha`);
        const senha = senhaInput ? senhaInput.value.trim() : '';
        const confirmarSenha = confirmarSenhaInput ? confirmarSenhaInput.value.trim() : '';
        
        let documento;
        if (isNovo) {
            documento = document.getElementById(`${prefixo}-documento`).value.trim();
        } else {
            documento = document.getElementById('editar-usuario-id').value;
        }
        
        if (!nome || !email || !documento) {
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
        
        const payload = {
            nome: nome,
            email: email,
            tipo: tipoUsuarioAtual === 'master' ? tipo : 'padrao',
            status: status
        };
        
        if (isNovo) {
            payload.documento = documento;
            payload.senha = senha || '123456';
        } else {
            if (senha && senha.length > 0) {
                payload.senha = senha;
            }
        }
        
        const url = isNovo ? `${API_URL}/usuarios` : `${API_URL}/usuarios/${documento}`;
        const method = isNovo ? 'POST' : 'PUT';
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            const modal = document.getElementById(isNovo ? 'modal-adicionar-usuario' : 'modal-editar-usuario');
            if (modal) modal.style.display = 'none';
            
            await filtrarUsuarios();
            mostrarFeedback('Alterações realizadas com sucesso!', 'success');
        } else {
            mostrarValidacao(data.message || 'Erro ao salvar usuário', 'error');
        }
        
    } catch (error) {
        console.error('Erro ao salvar usuário:', error);
        mostrarValidacao('Erro ao salvar alterações. Tente novamente.', 'error');
    }
}

// ================================================================
// UTILITÁRIOS DE FEEDBACK E UI
// ================================================================
function mostrarFeedback(mensagem, tipo) {
    const modal = document.getElementById('modal-feedback-sistema');
    const titulo = document.getElementById('feedback-titulo');
    const icone = document.getElementById('feedback-icone');
    const texto = document.getElementById('feedback-texto');
    
    if (modal && titulo && icone && texto) {
        const config = {
            success: { titulo: 'Sucesso', icone: 'fas fa-check-circle' },
            error: { titulo: 'Erro', icone: 'fas fa-exclamation-circle' },
            warning: { titulo: 'Atenção', icone: 'fas fa-exclamation-triangle' }
        };
        
        const conf = config[tipo] || config.error;
        titulo.textContent = conf.titulo;
        icone.className = `feedback-icon ${conf.icone}`;
        texto.textContent = mensagem;
        
        modal.style.display = 'flex';
    }
}

function mostrarValidacao(mensagem, tipo) {
    const validacaoStatus = document.getElementById('validacao-status');
    const validacaoIcon = validacaoStatus?.querySelector('.validation-icon');
    const validacaoText = validacaoStatus?.querySelector('.validation-text');
    
    if (validacaoStatus && validacaoIcon && validacaoText) {
        const icons = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle'
        };
        
        validacaoStatus.className = `validation-feedback ${tipo}`;
        validacaoIcon.className = `validation-icon ${icons[tipo]}`;
        validacaoText.textContent = mensagem;
        validacaoStatus.classList.remove('hidden');
        
        setTimeout(() => {
            validacaoStatus.classList.add('hidden');
        }, 5000);
    }
}

async function garantirUsuarioMaster() {
    
    const usuario = JSON.parse(sessionStorage.getItem('usuario') || '{}');
    
    if (usuario.tipo !== 'admin' && usuario.tipo !== 'master') {
        console.log('Usuário padrão - verificação de master ignorada');
        return;
    }
    
    const cpfMaster = "08996441988";
    const dadosMaster = {
        nome: "Administrador Master",
        email: "admin.master@sistema.com",
        documento: cpfMaster.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4"),
        senha: "master123",
        tipo: "master",
        status: "ativo"
    };
    
    try {
        const token = getToken();
        if (!token) {
            console.log('Token não encontrado, usuário master será verificado após login');
            return;
        }
        
        if (usuario.tipo !== 'master') {
            console.log('Apenas usuários Master podem gerenciar outros Masters');
            return;
        }
        
        const statsResponse = await fetch(`${API_URL}/usuarios/stats/geral`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            
            if (statsData.data.usuarios_master > 0) {
                const usuariosResponse = await fetch(`${API_URL}/usuarios?tipo=master&limit=10`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (usuariosResponse.ok) {
                    const usuariosData = await usuariosResponse.json();
                    const masterExistente = usuariosData.data.find(u => 
                        u.documento && u.documento.replace(/[^\d]+/g, '') === cpfMaster
                    );
                    
                    if (masterExistente) {
                        if (masterExistente.status !== 'ativo' || masterExistente.tipo !== 'master') {
                            await fetch(`${API_URL}/usuarios/${masterExistente.id}`, {
                                method: 'PUT',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify({
                                    tipo: 'master',
                                    status: 'ativo'
                                })
                            });
                            console.log('✅ Usuário master atualizado com sucesso');
                        }
                        return;
                    }
                }
            }
        }
        
        const criarResponse = await fetch(`${API_URL}/usuarios`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(dadosMaster)
        });
        
        if (criarResponse.ok) {
            console.log('✅ Usuário master criado com sucesso via API');
        }
        
    } catch (error) {
        console.warn('⚠️ Erro ao garantir usuário master:', error);
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
       btnSalvarCartoes.addEventListener('click', async () => await salvarCartoesForms());
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
}

async function inicializarConfiguracoes() {
    if (!window.sistemaInicializado) {
        setTimeout(inicializarConfiguracoes, 200);
        return;
    }
    
    await garantirUsuarioMaster();
    await obterTipoUsuarioAtual();
    
    await carregarCategoriasAPI();
    await carregarCartoesAPI();
    
    setupConfigTabs();
    setupEventListeners();
    ajustarVisibilidadeElementos();
    
    atualizarDropdowns();
    atualizarOpcoesCartoes();
    
    console.log('Sistema de configurações inicializado com sucesso');
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(async () => await inicializarConfiguracoes(), 1000);
});





function carregarCategoriasLocalFallback() {
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    if (!usuarioAtual) {
        categoriasUsuario.despesas = [...categoriasPadrao.despesas];
        return;
    }
    
    try {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const usuario = usuarios.find(u => 
            u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual
        );
        
        if (usuario && usuario.categorias) {
            categoriasUsuario.despesas = usuario.categorias.despesas || [...categoriasPadrao.despesas];
        } else {
            categoriasUsuario.despesas = [...categoriasPadrao.despesas];
        }
    } catch (error) {
        categoriasUsuario.despesas = [...categoriasPadrao.despesas];
    }
}




function salvarCategoriasLocalFallback() {
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    if (!usuarioAtual) return false;
    
    try {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const index = usuarios.findIndex(u => 
            u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual
        );
        
        if (index !== -1) {
            if (!usuarios[index].categorias) {
                usuarios[index].categorias = {};
            }
            usuarios[index].categorias.despesas = categoriasUsuario.despesas;
            localStorage.setItem('usuarios', JSON.stringify(usuarios));
            return true;
        }
        return false;
    } catch (error) {
        return false;
    }
}

async function obterCategoriaId(nomeCategoria) {
    try {
        const token = getToken();
        if (!token) return null;

        const response = await fetch(`${API_URL}/categorias`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            const categoria = data.data.find(cat => cat.nome === nomeCategoria);
            return categoria ? categoria.id : null;
        }
        return null;
    } catch (error) {
        return null;
    }
}


function carregarCartoesLocalFallback() {
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    if (!usuarioAtual) {
        cartoesUsuario = {
            cartao1: { nome: '', validade: '', limite: 0, ativo: false },
            cartao2: { nome: '', validade: '', limite: 0, ativo: false },
            cartao3: { nome: '', validade: '', limite: 0, ativo: false }
        };
        window.cartoesUsuario = cartoesUsuario;
        return;
    }
    
    try {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const usuario = usuarios.find(u => 
            u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual
        );
        
        if (usuario && usuario.cartoes) {
            cartoesUsuario = usuario.cartoes;
            window.cartoesUsuario = usuario.cartoes;
        } else {
            cartoesUsuario = {
                cartao1: { nome: '', validade: '', limite: 0, ativo: false },
                cartao2: { nome: '', validade: '', limite: 0, ativo: false },
                cartao3: { nome: '', validade: '', limite: 0, ativo: false }
            };
            window.cartoesUsuario = cartoesUsuario;
        }
    } catch (error) {
        cartoesUsuario = {
            cartao1: { nome: '', validade: '', limite: 0, ativo: false },
            cartao2: { nome: '', validade: '', limite: 0, ativo: false },
            cartao3: { nome: '', validade: '', limite: 0, ativo: false }
        };
        window.cartoesUsuario = cartoesUsuario;
    }
}





function salvarCartoesLocalFallback() {
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    if (!usuarioAtual) return false;
    
    try {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const index = usuarios.findIndex(u => 
            u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual
        );
        
        if (index !== -1) {
            usuarios[index].cartoes = cartoesUsuario;
            usuarios[index].ultimaAtualizacaoCartoes = new Date().toISOString();
            localStorage.setItem('usuarios', JSON.stringify(usuarios));
            
            window.cartoesUsuario = cartoesUsuario;
            return true;
        }
        return false;
    } catch (error) {
        return false;
    }
}

// ================================================================
// FUNÇÕES DE COMPATIBILIDADE PARA EVITAR ERROS
// ================================================================

window.carregarcategoriasLocal = function() {
    console.log('carregarcategoriasLocal: descontinuada - agora usa API');
};


window.categoriasUsuario = categoriasUsuario;
window.cartoesUsuario = cartoesUsuario;
window.categoriasPadrao = categoriasPadrao;

window.carregarCategoriasLocal = carregarCategoriasLocalFallback;
window.salvarCategorias = salvarCategoriasLocalFallback;
window.atualizarDropdowns = atualizarDropdowns;
window.atualizarListaCategorias = atualizarListaCategorias;

window.carregarCartoesLocal = carregarCartoesLocalFallback;
window.salvarCartoes = salvarCartoesLocalFallback;
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




// Novas funções da API
window.carregarCategoriasAPI = carregarCategoriasAPI;
window.salvarCategoriasAPI = salvarCategoriasAPI;
window.obterCategoriaId = obterCategoriaId;
window.carregarCartoesAPI = carregarCartoesAPI;
window.salvarCartoesAPI = salvarCartoesAPI;
window.carregarCategoriasLocalFallback = carregarCategoriasLocalFallback;
window.salvarCategoriasLocalFallback = salvarCategoriasLocalFallback;
window.carregarCartoesLocalFallback = carregarCartoesLocalFallback;
window.salvarCartoesLocalFallback = salvarCartoesLocalFallback;