// ================================================================
// CONFIGURAÇÕES.JS - VERSÃO LIMPA (APENAS LÓGICA)
// ================================================================

// ================================================================
// GERENCIAMENTO DE CATEGORIAS
// ================================================================

let categoriasUsuario = {
    despesas: []
};

const categoriasPadrao = {
    despesas: ["Alimentação", "Combustível", "Educação", "Lazer", "Moradia", "Outros", "Saúde", "Transporte"]
};

function iniciarCategorias() {
    console.log("Iniciando categorias...");
    
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    if (usuarioAtual) {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const usuario = usuarios.find(u => u.documento.replace(/[^\d]+/g, '') === usuarioAtual);
        
        if (usuario) {
            if (!usuario.categorias) {
                usuario.categorias = { despesas: [...categoriasPadrao.despesas] };
                localStorage.setItem('usuarios', JSON.stringify(usuarios));
            }
            
            // Remove categorias obsoletas de cartão se existirem
            if (usuario.categorias.cartao) {
                delete usuario.categorias.cartao;
                localStorage.setItem('usuarios', JSON.stringify(usuarios));
            }
            
            categoriasUsuario.despesas = usuario.categorias.despesas || [...categoriasPadrao.despesas];
        }
    }
    
    if (!categoriasUsuario.despesas || !categoriasUsuario.despesas.length) {
        categoriasUsuario.despesas = [...categoriasPadrao.despesas];
    }
    
    atualizarDropdowns();
    setupGerenciadorCategorias();
}

function salvarCategorias() {
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    if (!usuarioAtual) return;
    
    // ✅ ADICIONAR ESTAS 3 LINHAS:
    if (window.useAPI && window.sistemaAdapter) {
        window.sistemaAdapter.salvarCategorias(categoriasUsuario.despesas);
    } else {
        // Código existente
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const index = usuarios.findIndex(u => u.documento.replace(/[^\d]+/g, '') === usuarioAtual);
        
        if (index !== -1) {
            usuarios[index].categorias = { despesas: categoriasUsuario.despesas };
            localStorage.setItem('usuarios', JSON.stringify(usuarios));
        }
    }
}

function atualizarDropdowns() {
    const dropdownCategoria = document.getElementById('despesa-categoria');
    if (dropdownCategoria) {
        const valorSelecionado = dropdownCategoria.value;
        
        // Remove todas as opções exceto a primeira
        while (dropdownCategoria.options.length > 1) {
            dropdownCategoria.remove(1);
        }
        
        // Adiciona as categorias atuais
        categoriasUsuario.despesas.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            dropdownCategoria.appendChild(option);
        });
        
        // Restaura valor selecionado se ainda existir
        if (valorSelecionado) {
            dropdownCategoria.value = valorSelecionado;
        }
    }
}

function setupGerenciadorCategorias() {
    const abaCategorias = document.querySelector('.config-tab-btn[data-tab="categorias"]');
    if (abaCategorias) {
        abaCategorias.addEventListener('click', () => {
            atualizarListaCategorias();
        });
    }
    
    const btnAddCategoria = document.getElementById('btn-adicionar-categoria');
    const inputNovaCategoria = document.getElementById('nova-categoria-nome');
    
    if (btnAddCategoria && inputNovaCategoria) {
        btnAddCategoria.addEventListener('click', adicionarCategoria);
        
        inputNovaCategoria.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                adicionarCategoria();
            }
        });
    }
    
    atualizarListaCategorias();
}

function adicionarCategoria() {
    const inputNovaCategoria = document.getElementById('nova-categoria-nome');
    if (!inputNovaCategoria) return;
    
    const nomeCat = inputNovaCategoria.value.trim();
    if (!nomeCat) {
        alert('Por favor, digite um nome para a categoria.');
        return;
    }
    
    if (categoriasUsuario.despesas.includes(nomeCat)) {
        alert('Esta categoria já existe!');
        return;
    }
    
    categoriasUsuario.despesas.push(nomeCat);
    categoriasUsuario.despesas.sort();
    salvarCategorias();
    inputNovaCategoria.value = '';
    atualizarListaCategorias();
    atualizarDropdowns();
    
    alert('Categoria adicionada com sucesso!');
}

function atualizarListaCategorias() {
    const listaCategorias = document.getElementById('lista-categorias');
    if (!listaCategorias) return;
    
    listaCategorias.innerHTML = '';
    
    if (!categoriasUsuario.despesas || categoriasUsuario.despesas.length === 0) {
        const tr = document.createElement('tr');
        tr.innerHTML = '<td colspan="2" class="text-center">Nenhuma categoria encontrada.</td>';
        listaCategorias.appendChild(tr);
        return;
    }
    
    categoriasUsuario.despesas.forEach(categoria => {
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td>${categoria}</td>
            <td class="acoes-categoria">
                <button class="btn-editar-categoria" data-categoria="${categoria}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-remover-categoria" data-categoria="${categoria}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        listaCategorias.appendChild(tr);
    });
    
    // Adiciona event listeners para os botões
    const btnsEditar = document.querySelectorAll('.btn-editar-categoria');
    const btnsRemover = document.querySelectorAll('.btn-remover-categoria');
    
    btnsEditar.forEach(btn => {
        btn.addEventListener('click', () => {
            const categoria = btn.getAttribute('data-categoria');
            editarCategoria(categoria);
        });
    });
    
    btnsRemover.forEach(btn => {
        btn.addEventListener('click', () => {
            const categoria = btn.getAttribute('data-categoria');
            removerCategoria(categoria);
        });
    });
}

function editarCategoria(categoria) {
    const novoNome = prompt('Editar categoria:', categoria);
    
    if (novoNome && novoNome.trim() !== '') {
        if (novoNome !== categoria && categoriasUsuario.despesas.includes(novoNome)) {
            alert('Já existe uma categoria com este nome!');
            return;
        }
        
        const index = categoriasUsuario.despesas.indexOf(categoria);
        if (index !== -1) {
            categoriasUsuario.despesas[index] = novoNome;
            categoriasUsuario.despesas.sort();
            salvarCategorias();
            atualizarListaCategorias();
            atualizarDropdowns();
            
            alert('Categoria editada com sucesso!');
        }
    }
}

function removerCategoria(categoria) {
    if (confirm(`Tem certeza que deseja remover a categoria "${categoria}"?`)) {
        const index = categoriasUsuario.despesas.indexOf(categoria);
        if (index !== -1) {
            categoriasUsuario.despesas.splice(index, 1);
            salvarCategorias();
            atualizarListaCategorias();
            atualizarDropdowns();
            alert('Categoria removida com sucesso!');
        }
    }
}

// ================================================================
// GERENCIAMENTO DE SISTEMA
// ================================================================

function initConfigSection() {
    console.log('Inicializando seção de configurações...');
    
    setupConfigTabs();
    setupSistema();
}

function setupConfigTabs() {
    const tabButtons = document.querySelectorAll('.config-tab-btn');
    const tabPanes = document.querySelectorAll('.config-tab-pane');
    
    if (!tabButtons.length) {
        console.warn('Botões de abas não encontrados');
        return;
    }
    
    console.log('Configurando abas de configuração...');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Remove classe active de todos os botões
            tabButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            const targetTab = this.getAttribute('data-tab');
            
            // Remove classe active de todos os painéis
            tabPanes.forEach(pane => pane.classList.remove('active'));
            
            // Adiciona classe active ao painel correspondente
            document.getElementById(`${targetTab}-tab`).classList.add('active');
        });
    });
}

function setupSistema() {
    console.log('Configurando sistema...');
    
    const btnExportarDados = document.getElementById('btn-exportar-dados');
    const btnImportarDados = document.getElementById('btn-importar-dados');
    const btnLimparDados = document.getElementById('btn-limpar-dados');
    const btnVerificarAtualizacoes = document.getElementById('btn-verificar-atualizacoes');
    
    if (!btnExportarDados || !btnImportarDados || !btnLimparDados || !btnVerificarAtualizacoes) {
        console.warn('Botões da seção Sistema não encontrados');
        return;
    }
    
    btnExportarDados.addEventListener('click', exportarDados);
    
    btnImportarDados.addEventListener('click', function() {
        const inputFile = document.createElement('input');
        inputFile.type = 'file';
        inputFile.accept = '.json';
        
        inputFile.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    try {
                        importarDados(event.target.result);
                    } catch (error) {
                        alert('Erro ao importar dados: ' + error.message);
                    }
                };
                reader.readAsText(file);
            }
        });
        
        inputFile.click();
    });
    
    btnLimparDados.addEventListener('click', function() {
        if (confirm('ATENÇÃO: Esta ação apagará TODOS os seus dados financeiros e não pode ser desfeita. Deseja continuar?')) {
            if (confirm('Tem certeza? Todos os dados serão perdidos permanentemente.')) {
                limparDados();
            }
        }
    });
    
    btnVerificarAtualizacoes.addEventListener('click', verificarAtualizacoes);
}

function exportarDados() {
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    if (!usuarioAtual) {
        alert('Você precisa estar logado para exportar seus dados.');
        return;
    }
    
    const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    const usuario = usuarios.find(u => u.documento.replace(/[^\d]+/g, '') === usuarioAtual);
    
    if (!usuario) {
        alert('Erro ao encontrar dados do usuário.');
        return;
    }
    
    const dadosExportacao = {
        usuario: {
            nome: usuario.nome,
            documento: usuario.documento,
            email: usuario.email
        },
        categorias: usuario.categorias || {},
        dados_financeiros: usuario.dadosFinanceiros || {},
        poupanca: usuario.poupanca || {}
    };
    
    const dadosJSON = JSON.stringify(dadosExportacao, null, 2);
    
    const blob = new Blob([dadosJSON], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `financeiro_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
    
    alert('Dados exportados com sucesso!');
}

function importarDados(jsonData) {
    try {
        const dados = JSON.parse(jsonData);
        
        if (!dados.usuario || !dados.usuario.documento) {
            throw new Error('Formato de arquivo inválido ou corrompido.');
        }
        
        const usuarioAtual = sessionStorage.getItem('usuarioAtual');
        if (!usuarioAtual) {
            alert('Você precisa estar logado para importar dados.');
            return;
        }
        
        if (!confirm(`Importar dados para o usuário ${dados.usuario.nome}? Isso substituirá seus dados atuais.`)) {
            return;
        }
        
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const index = usuarios.findIndex(u => u.documento.replace(/[^\d]+/g, '') === usuarioAtual);
        
        if (index === -1) {
            alert('Erro ao localizar usuário atual.');
            return;
        }
        
        // Preserva a senha atual
        const senhaAtual = usuarios[index].senha;
        usuarios[index] = {
            ...dados.usuario,
            senha: senhaAtual,
            categorias: dados.categorias || {},
            dadosFinanceiros: dados.dados_financeiros || {},
            poupanca: dados.poupanca || {}
        };
        
        localStorage.setItem('usuarios', JSON.stringify(usuarios));
        
        alert('Dados importados com sucesso! A página será recarregada.');
        window.location.reload();
        
    } catch (error) {
        alert('Erro ao importar dados: ' + error.message);
    }
}

function limparDados() {
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    if (!usuarioAtual) {
        alert('Você precisa estar logado para limpar seus dados.');
        return;
    }
    
    const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    const index = usuarios.findIndex(u => u.documento.replace(/[^\d]+/g, '') === usuarioAtual);
    
    if (index === -1) {
        alert('Erro ao localizar usuário atual.');
        return;
    }
    
    // Preserva dados básicos do usuário
    const dadosBasicos = {
        nome: usuarios[index].nome,
        documento: usuarios[index].documento,
        email: usuarios[index].email,
        senha: usuarios[index].senha
    };
    
    // Reseta dados financeiros
    usuarios[index] = {
        ...dadosBasicos,
        categorias: {
            despesas: [...categoriasPadrao.despesas]
        },
        dadosFinanceiros: {},
        poupanca: {
            saldo: 0,
            configuracoes: {
                taxa: 0.5,
                dia_rendimento: 1
            },
            transacoes: []
        }
    };
    
    localStorage.setItem('usuarios', JSON.stringify(usuarios));
    
    alert('Todos os dados foram limpos com sucesso! A página será recarregada.');
    window.location.reload();
}

function verificarAtualizacoes() {
    // Simula verificação de atualizações
    setTimeout(() => {
        alert('Sistema atualizado! Você está usando a versão mais recente (2.0.0).');
    }, 1000);
}

// ================================================================
// GERENCIAMENTO DE USUÁRIOS
// ================================================================

let usuariosFiltrados = [];
let paginaAtual = 1;
let itensPorPagina = 10;
let tipoUsuarioAtual = null;

function iniciarGerenciamentoUsuarios() {
    console.log("Iniciando módulo de gerenciamento de usuários...");
    
    obterTipoUsuarioAtual();
    
    const btnGerenciarUsuarios = document.getElementById('btn-gerenciar-usuarios');
    if (btnGerenciarUsuarios) {
        btnGerenciarUsuarios.addEventListener('click', abrirModalGerenciamentoUsuarios);
    }
    
    // Event listeners para modais
    const fechaModalUsuarios = document.querySelector('#modal-gerenciar-usuarios .close');
    if (fechaModalUsuarios) {
        fechaModalUsuarios.addEventListener('click', () => {
            document.getElementById('modal-gerenciar-usuarios').style.display = 'none';
        });
    }
    
    const fechaModalEditar = document.querySelector('#modal-editar-usuario .close');
    if (fechaModalEditar) {
        fechaModalEditar.addEventListener('click', () => {
            document.getElementById('modal-editar-usuario').style.display = 'none';
        });
    }
    
    // Event listeners para busca e filtros
    const searchInput = document.getElementById('usuario-search');
    const searchButton = document.getElementById('btn-search-user');
    
    if (searchInput && searchButton) {
        searchButton.addEventListener('click', () => {
            filtrarUsuarios();
        });
        
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                filtrarUsuarios();
            }
        });
    }
    
    const filterSelect = document.getElementById('filter-user-type');
    if (filterSelect) {
        filterSelect.addEventListener('change', filtrarUsuarios);
    }
    
    // Event listeners para paginação
    const btnPrevPage = document.getElementById('btn-prev-page');
    const btnNextPage = document.getElementById('btn-next-page');
    
    if (btnPrevPage && btnNextPage) {
        btnPrevPage.addEventListener('click', () => {
            if (paginaAtual > 1) {
                paginaAtual--;
                renderizarUsuarios();
            }
        });
        
        btnNextPage.addEventListener('click', () => {
            const totalPaginas = Math.ceil(usuariosFiltrados.length / itensPorPagina);
            if (paginaAtual < totalPaginas) {
                paginaAtual++;
                renderizarUsuarios();
            }
        });
    }
    
    // Event listener para form de edição
    const formEditarUsuario = document.getElementById('form-editar-usuario');
    if (formEditarUsuario) {
        formEditarUsuario.addEventListener('submit', (e) => {
            e.preventDefault();
            salvarEdicaoUsuario();
        });
    }
    
    // Event listener para adicionar usuário
    const btnAdicionarUsuario = document.getElementById('btn-adicionar-usuario');
    if (btnAdicionarUsuario) {
        btnAdicionarUsuario.addEventListener('click', () => {
            abrirModalEditarUsuario(null, true);
        });
    }
    
    ajustarVisibilidadeElementos();
}

function ajustarVisibilidadeElementos() {
    const tabUsuarios = document.querySelector('.config-tab-btn[data-tab="usuarios"]');
    if (tabUsuarios) {
        tabUsuarios.style.display = (tipoUsuarioAtual === 'admin' || tipoUsuarioAtual === 'master') ? 'block' : 'none';
    }
    
    const tabSistema = document.querySelector('.config-tab-btn[data-tab="sistema"]');
    if (tabSistema) {
        tabSistema.style.display = tipoUsuarioAtual === 'master' ? 'block' : 'none';
    }
    
    const btnAdicionarUsuario = document.getElementById('btn-adicionar-usuario');
    if (btnAdicionarUsuario) {
        btnAdicionarUsuario.style.display = tipoUsuarioAtual === 'master' ? 'block' : 'none';
    }
}

function obterTipoUsuarioAtual() {
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    if (!usuarioAtual) return;
    
    const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    const usuario = usuarios.find(u => u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual);
    
    if (usuario) {
        tipoUsuarioAtual = usuario.tipo || 'padrao';
    } else {
        tipoUsuarioAtual = 'padrao';
    }
    
    console.log("Tipo do usuário atual:", tipoUsuarioAtual);
}

function abrirModalGerenciamentoUsuarios() {
    if (tipoUsuarioAtual !== 'admin' && tipoUsuarioAtual !== 'master') {
        alert('Você não tem permissão para acessar o gerenciamento de usuários.');
        return;
    }
    
    paginaAtual = 1;
    
    filtrarUsuarios();
    
    const modal = document.getElementById('modal-gerenciar-usuarios');
    if (modal) {
        modal.style.display = 'flex';
    }
    
    const btnAdicionarUsuario = document.getElementById('btn-adicionar-usuario');
    if (btnAdicionarUsuario) {
        btnAdicionarUsuario.style.display = tipoUsuarioAtual === 'master' ? 'block' : 'none';
    }
}

function filtrarUsuarios() {
    const searchInput = document.getElementById('usuario-search');
    const filterSelect = document.getElementById('filter-user-type');
    
    let termoBusca = '';
    let filtroTipo = 'todos';
    
    if (searchInput) {
        termoBusca = searchInput.value.trim().toLowerCase();
    }
    
    if (filterSelect) {
        filtroTipo = filterSelect.value;
    }
    
    const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    
    usuariosFiltrados = usuarios.filter(usuario => {
        const matchesBusca = !termoBusca || 
            usuario.nome?.toLowerCase().includes(termoBusca) || 
            usuario.email?.toLowerCase().includes(termoBusca) || 
            usuario.documento?.toLowerCase().includes(termoBusca);
        
        const matchesTipo = filtroTipo === 'todos' || usuario.tipo === filtroTipo;
        
        return matchesBusca && matchesTipo;
    });
    
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
        if (noUsersMessage) noUsersMessage.style.display = 'flex';
        listaUsuarios.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum usuário encontrado</td></tr>';
        
        if (paginationInfo) paginationInfo.textContent = 'Página 0 de 0';
        if (btnPrevPage) btnPrevPage.disabled = true;
        if (btnNextPage) btnNextPage.disabled = true;
        
        return;
    }
    
    if (noUsersMessage) noUsersMessage.style.display = 'none';
    
    // Cálculos de paginação
    const totalPaginas = Math.ceil(usuariosFiltrados.length / itensPorPagina);
    const inicio = (paginaAtual - 1) * itensPorPagina;
    const fim = Math.min(inicio + itensPorPagina, usuariosFiltrados.length);
    
    // Atualiza informações de paginação
    if (paginationInfo) paginationInfo.textContent = `Página ${paginaAtual} de ${totalPaginas}`;
    if (btnPrevPage) btnPrevPage.disabled = paginaAtual <= 1;
    if (btnNextPage) btnNextPage.disabled = paginaAtual >= totalPaginas;
    
    // Renderiza usuários da página atual
    for (let i = inicio; i < fim; i++) {
        const usuario = usuariosFiltrados[i];
        const index = i;
        
        const tr = document.createElement('tr');
        
        const tipo = usuario.tipo || 'padrao';
        const status = usuario.status || 'ativo';
        
        // Cria badges para tipo e status
        const tipoBadge = `<span class="tipo-badge tipo-${tipo}">${tipo === 'padrao' ? 'Padrão' : tipo === 'admin' ? 'Admin' : 'Master'}</span>`;
        const statusBadge = `<span class="status-badge status-${status}">${status === 'ativo' ? 'Ativo' : status === 'inativo' ? 'Inativo' : 'Bloqueado'}</span>`;
        
        // Define ações baseadas no tipo do usuário atual
        let acoesHTML = '';
        
        if (tipoUsuarioAtual === 'master') {
            // Master pode tudo
            acoesHTML = `
                <button class="btn-usuario btn-editar-usuario" data-index="${index}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-usuario btn-bloquear-usuario" data-index="${index}" ${status === 'bloqueado' ? 'style="color: #28a745"' : ''}>
                    <i class="fas ${status === 'bloqueado' ? 'fa-unlock' : 'fa-ban'}"></i>
                </button>
                <button class="btn-usuario btn-excluir-usuario" data-index="${index}">
                    <i class="fas fa-trash"></i>
                </button>
            `;
        } else if (tipoUsuarioAtual === 'admin') {
            // Admin só pode editar usuários padrão
            if (tipo === 'padrao') {
                acoesHTML = `
                    <button class="btn-usuario btn-editar-usuario" data-index="${index}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-usuario btn-bloquear-usuario" data-index="${index}" ${status === 'bloqueado' ? 'style="color: #28a745"' : ''}>
                        <i class="fas ${status === 'bloqueado' ? 'fa-unlock' : 'fa-ban'}"></i>
                    </button>
                `;
            } else {
                acoesHTML = '<span class="texto-alerta">Sem permissão</span>';
            }
        }
        
        tr.innerHTML = `
            <td>${usuario.nome || '-'}</td>
            <td>${usuario.documento || '-'}</td>
            <td>${usuario.email || '-'}</td>
            <td>${tipoBadge}</td>
            <td>${statusBadge}</td>
            <td class="acoes-usuario">${acoesHTML}</td>
        `;
        
        listaUsuarios.appendChild(tr);
    }
    
    // Adiciona event listeners para os botões de ação
    document.querySelectorAll('.btn-editar-usuario').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-index'));
            abrirModalEditarUsuario(usuariosFiltrados[index]);
        });
    });
    
    document.querySelectorAll('.btn-bloquear-usuario').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-index'));
            alternarBloqueioUsuario(usuariosFiltrados[index]);
        });
    });
    
    document.querySelectorAll('.btn-excluir-usuario').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.getAttribute('data-index'));
            excluirUsuario(usuariosFiltrados[index]);
        });
    });
}

function alternarBloqueioUsuario(usuario) {
    const estavaBloqueado = usuario.status === 'bloqueado';
    const acao = estavaBloqueado ? 'desbloquear' : 'bloquear';
    
    if (confirm(`Deseja ${acao} o usuário ${usuario.nome}?`)) {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const index = usuarios.findIndex(u => u.documento === usuario.documento);
        
        if (index !== -1) {
            usuarios[index].status = estavaBloqueado ? 'ativo' : 'bloqueado';
            localStorage.setItem('usuarios', JSON.stringify(usuarios));
            
            filtrarUsuarios();
            
            alert(`Usuário ${estavaBloqueado ? 'desbloqueado' : 'bloqueado'} com sucesso!`);
        }
    }
}

function excluirUsuario(usuario) {
    if (confirm(`Tem certeza que deseja excluir o usuário ${usuario.nome}? Esta ação não pode ser desfeita.`)) {
        if (confirm('ATENÇÃO: Todos os dados deste usuário serão perdidos. Confirma a exclusão?')) {
            const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
            const novaLista = usuarios.filter(u => u.documento !== usuario.documento);
            
            localStorage.setItem('usuarios', JSON.stringify(novaLista));
            
            filtrarUsuarios();
            
            alert('Usuário excluído com sucesso!');
        }
    }
}

function abrirModalEditarUsuario(usuario, isNovo = false) {
    const modal = document.getElementById('modal-editar-usuario');
    const formEditarUsuario = document.getElementById('form-editar-usuario');
    const titulo = document.getElementById('editar-usuario-titulo');
    const formGroupTipo = document.getElementById('form-group-tipo');
    
    if (!modal || !formEditarUsuario) return;
    
    // Limpa o formulário
    formEditarUsuario.reset();
    
    // Atualiza o título
    if (isNovo) {
        titulo.innerHTML = '<i class="fas fa-user-plus"></i> Novo Usuário';
    } else {
        titulo.innerHTML = '<i class="fas fa-user-edit"></i> Editar Usuário';
    }
    
    // Controla visibilidade do campo tipo
    if (formGroupTipo) {
        formGroupTipo.style.display = tipoUsuarioAtual === 'master' ? 'block' : 'none';
    }
    
    // Preenche dados se for edição
    if (!isNovo && usuario) {
        document.getElementById('editar-usuario-id').value = usuario.documento;
        document.getElementById('editar-usuario-nome').value = usuario.nome || '';
        document.getElementById('editar-usuario-email').value = usuario.email || '';
        document.getElementById('editar-usuario-documento').value = usuario.documento || '';
        
        const selectTipo = document.getElementById('editar-usuario-tipo');
        const selectStatus = document.getElementById('editar-usuario-status');
        
        if (selectTipo && usuario.tipo) {
            selectTipo.value = usuario.tipo;
        }
        
        if (selectStatus && usuario.status) {
            selectStatus.value = usuario.status;
        }
        
        // Controla permissões para não-master
        if (tipoUsuarioAtual !== 'master') {
            if (selectTipo) selectTipo.disabled = true;
            
            if (usuario.tipo !== 'padrao') {
                document.getElementById('editar-usuario-nome').disabled = true;
                document.getElementById('editar-usuario-email').disabled = true;
                document.getElementById('editar-usuario-status').disabled = true;
                document.getElementById('editar-usuario-senha').disabled = true;
                document.getElementById('editar-usuario-confirmar-senha').disabled = true;
                
                alert('Você só pode editar usuários do tipo Padrão.');
            }
        }
    } else {
        // Para novos usuários, habilita edição do documento
        document.getElementById('editar-usuario-documento').disabled = false;
    }
    
    modal.style.display = 'flex';
}

function salvarEdicaoUsuario() {
    const isNovo = !document.getElementById('editar-usuario-id').value;
    
    const documento = isNovo ? 
        document.getElementById('editar-usuario-documento').value.trim() :
        document.getElementById('editar-usuario-id').value;
    
    const nome = document.getElementById('editar-usuario-nome').value.trim();
    const email = document.getElementById('editar-usuario-email').value.trim();
    const tipo = document.getElementById('editar-usuario-tipo').value;
    const status = document.getElementById('editar-usuario-status').value;
    const senha = document.getElementById('editar-usuario-senha').value;
    const confirmarSenha = document.getElementById('editar-usuario-confirmar-senha').value;
    
    // Validações
    if (!nome || !email || !documento) {
        alert('Por favor, preencha todos os campos obrigatórios.');
        return;
    }
    
    if (isNovo && !validarDocumento(documento)) {
        alert('Por favor, informe um CPF ou CNPJ válido.');
        return;
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        alert('Por favor, informe um e-mail válido.');
        return;
    }
    
    if (senha || confirmarSenha) {
        if (senha !== confirmarSenha) {
            alert('As senhas não coincidem.');
            return;
        }
        
        if (senha.length < 6) {
            alert('A senha deve ter pelo menos 6 caracteres.');
            return;
        }
    }
    
    const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    
    if (isNovo) {
        // Verifica se documento já existe
        const docExists = usuarios.some(u => u.documento && 
            u.documento.replace(/[^\d]+/g, '') === documento.replace(/[^\d]+/g, ''));
            
        if (docExists) {
            alert('Este CPF/CNPJ já está cadastrado.');
            return;
        }
        
        // Verifica se email já existe
        const emailExists = usuarios.some(u => u.email === email);
        if (emailExists) {
            alert('Este e-mail já está cadastrado.');
            return;
        }
    }
    
    if (isNovo) {
        // Cria novo usuário
        const novoUsuario = {
            nome: nome,
            email: email,
            documento: documento,
            tipo: tipoUsuarioAtual === 'master' ? tipo : 'padrao',
            status: status,
            password: senha || '123456',
            categorias: {
                despesas: [...categoriasPadrao.despesas]
            },
            dadosFinanceiros: {},
            poupanca: {
                saldo: 0,
                configuracoes: {
                    taxa: 0.5,
                    dia_rendimento: 1
                },
                transacoes: []
            }
        };
        
        usuarios.push(novoUsuario);
        
        localStorage.setItem('usuarios', JSON.stringify(usuarios));
        
        document.getElementById('modal-editar-usuario').style.display = 'none';
        filtrarUsuarios();
        
        alert('Usuário cadastrado com sucesso!');
    } else {
        // Edita usuário existente
        const index = usuarios.findIndex(u => u.documento === documento);
        
        if (index !== -1) {
            // Verifica permissões
            if (tipoUsuarioAtual !== 'master' && usuarios[index].tipo !== 'padrao') {
                alert('Você não tem permissão para editar este usuário.');
                return;
            }
            
            usuarios[index].nome = nome;
            
            // Verifica se email mudou e não está em uso
            if (usuarios[index].email !== email) {
                const emailExists = usuarios.some(u => u.email === email && u.documento !== documento);
                if (emailExists) {
                    alert('Este e-mail já está cadastrado para outro usuário.');
                    return;
                }
                
                usuarios[index].email = email;
            }
            
            // Só master pode alterar tipo
            if (tipoUsuarioAtual === 'master') {
                usuarios[index].tipo = tipo;
            }
            
            usuarios[index].status = status;
            
            // Atualiza senha se fornecida
            if (senha) {
                usuarios[index].password = senha;
            }
            
            localStorage.setItem('usuarios', JSON.stringify(usuarios));
            
            document.getElementById('modal-editar-usuario').style.display = 'none';
            filtrarUsuarios();
            
            alert('Usuário atualizado com sucesso!');
        } else {
            alert('Usuário não encontrado.');
        }
    }
}

// ================================================================
// UTILITÁRIOS DE VALIDAÇÃO
// ================================================================

function formatarDocumento(input) {
    let documento = input.value.replace(/\D/g, '');
    
    if (documento.length <= 11) {
        // CPF
        if (documento.length > 9) {
            documento = documento.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
        } else if (documento.length > 6) {
            documento = documento.replace(/(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3');
        } else if (documento.length > 3) {
            documento = documento.replace(/(\d{3})(\d{0,3})/, '$1.$2');
        }
    } else {
        // CNPJ
        if (documento.length > 12) {
            documento = documento.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5');
        } else if (documento.length > 8) {
            documento = documento.replace(/(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4');
        } else if (documento.length > 5) {
            documento = documento.replace(/(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3');
        } else if (documento.length > 2) {
            documento = documento.replace(/(\d{2})(\d{0,3})/, '$1.$2');
        }
    }
    
    input.value = documento;
}

function validarCPF(cpf) {
    cpf = cpf.replace(/[^\d]+/g, '');
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    
    let soma = 0;
    let resto;
    
    for (let i = 1; i <= 9; i++) 
        soma = soma + parseInt(cpf.substring(i-1, i)) * (11 - i);
    
    resto = (soma * 10) % 11;
    if ((resto === 10) || (resto === 11)) resto = 0;
    if (resto !== parseInt(cpf.substring(9, 10))) return false;
    
    soma = 0;
    for (let i = 1; i <= 10; i++) 
        soma = soma + parseInt(cpf.substring(i-1, i)) * (12 - i);
        
    resto = (soma * 10) % 11;
    if ((resto === 10) || (resto === 11)) resto = 0;
    if (resto !== parseInt(cpf.substring(10, 11))) return false;
    
    return true;
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
    
    tamanho = tamanho + 1;
    numeros = cnpj.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
        soma += numeros.charAt(tamanho - i) * pos--;
        if (pos < 2) pos = 9;
    }
    
    resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    if (resultado != digitos.charAt(1)) return false;
    
    return true;
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

function garantirUsuarioMaster() {
    console.log("Verificando usuário master padrão...");
    
    const cpfMaster = "08996441988";
    
    let usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    
    const usuarioExistente = usuarios.find(u => 
        u.documento && u.documento.replace(/[^\d]+/g, '') === cpfMaster
    );
    
    if (usuarioExistente) {
        if (usuarioExistente.tipo !== 'master') {
            console.log("Usuário encontrado. Atualizando para master...");
            usuarioExistente.tipo = 'master';
            usuarioExistente.status = 'ativo';
            
            localStorage.setItem('usuarios', JSON.stringify(usuarios));
            console.log("Usuário atualizado para master com sucesso!");
        } else {
            console.log("Usuário já é master. Nenhuma ação necessária.");
        }
    } else {
        console.log("Criando novo usuário master...");
        
        const cpfFormatado = cpfMaster.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
        
        const novoUsuario = {
            nome: "Administrador Master",
            email: "admin.master@sistema.com",
            documento: cpfFormatado,
            tipo: "master",
            status: "ativo",
            password: "master123",
            categorias: {
                despesas: categoriasPadrao ? [...categoriasPadrao.despesas] : []
            },
            dadosFinanceiros: {},
            poupanca: {
                saldo: 0,
                configuracoes: {
                    taxa: 0.5,
                    dia_rendimento: 1
                },
                transacoes: []
            }
        };
        
        usuarios.push(novoUsuario);
        
        localStorage.setItem('usuarios', JSON.stringify(usuarios));
        console.log("Novo usuário master criado com sucesso!");
    }
}

// ================================================================
// INICIALIZAÇÃO
// ================================================================

document.addEventListener('DOMContentLoaded', function() {
    iniciarCategorias();
    initConfigSection();
    iniciarGerenciamentoUsuarios();
    garantirUsuarioMaster();
    
    // Adiciona formatação ao campo de documento
    const editarDocumentoInput = document.getElementById('editar-usuario-documento');
    if (editarDocumentoInput) {
        editarDocumentoInput.addEventListener('input', function() {
            formatarDocumento(this);
        });
    }
});

// Event listeners para fechar modais clicando fora
window.addEventListener('click', function(event) {
    const modalUsuarios = document.getElementById('modal-gerenciar-usuarios');
    if (modalUsuarios && event.target === modalUsuarios) {
        modalUsuarios.style.display = 'none';
    }
    
    const modalEditarUsuario = document.getElementById('modal-editar-usuario');
    if (modalEditarUsuario && event.target === modalEditarUsuario) {
        modalEditarUsuario.style.display = 'none';
    }
});

// Ajusta visibilidade após carregamento
window.addEventListener('load', function() {
    obterTipoUsuarioAtual();
    ajustarVisibilidadeElementos();
});