// ================================================================
// SISTEMA DE CONFIGURAÇÕES - VERSÃO ORGANIZADA
// ================================================================

console.log('⚙️ Carregando Configurações.js organizado...');

// ================================================================
// VARIÁVEIS GLOBAIS
// ================================================================

let categoriasUsuario = { despesas: [] };
let configuracaoInicializada = false;
let processandoCategoria = false;
let usuariosFiltrados = [];
let paginaAtual = 1;
const itensPorPagina = 10;
let tipoUsuarioAtual = null;

const categoriasPadrao = {
    despesas: ["Alimentação", "Combustível", "Educação", "Lazer", "Moradia", "Outros", "Saúde", "Transporte"]
};

// ================================================================
// UTILITÁRIOS
// ================================================================

async function aguardarSistemaConfiguracoesPronto() {
    return new Promise((resolve) => {
        let tentativas = 0;
        const maxTentativas = 30;
        
        function verificarSistema() {
            tentativas++;
            
            const mainPronto = window.sistemaInicializado === true;
            const usuarioDadosDisponivel = window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function';
            const formatarMoedaDisponivel = typeof window.formatarMoeda === 'function';
            
            if (mainPronto && usuarioDadosDisponivel && formatarMoedaDisponivel) {
                console.log('✅ Sistema pronto após', tentativas, 'tentativas');
                resolve(true);
            } else if (tentativas >= maxTentativas) {
                console.warn('⚠️ Timeout aguardando sistema');
                resolve(false);
            } else {
                setTimeout(verificarSistema, 200);
            }
        }
        
        verificarSistema();
    });
}

function formatarDocumento(input) {
    try {
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
            } else if (documento.length > 5) {
                documento = documento.replace(/(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3');
            } else if (documento.length > 2) {
                documento = documento.replace(/(\d{2})(\d{0,3})/, '$1.$2');
            }
        }
        
        input.value = documento;
    } catch (error) {
        console.error('Erro ao formatar documento:', error);
    }
}

function validarCPF(cpf) {
    cpf = cpf.replace(/[^\d]+/g, '');
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    
    let soma = 0;
    for (let i = 1; i <= 9; i++) 
        soma = soma + parseInt(cpf.substring(i-1, i)) * (11 - i);
    
    let resto = (soma * 10) % 11;
    if ((resto === 10) || (resto === 11)) resto = 0;
    if (resto !== parseInt(cpf.substring(9, 10))) return false;
    
    soma = 0;
    for (let i = 1; i <= 10; i++) 
        soma = soma + parseInt(cpf.substring(i-1, i)) * (12 - i);
        
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
    
    tamanho = tamanho + 1;
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

// ================================================================
// GERENCIAMENTO DE CATEGORIAS
// ================================================================

async function iniciarCategorias() {
    if (processandoCategoria) return;
    
    processandoCategoria = true;
    
    try {
        console.log('📂 Iniciando sistema de categorias...');
        
        await aguardarSistemaConfiguracoesPronto();
        
        if (window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function') {
            await window.usuarioDados.aguardarPronto();
        }
        
        const usuarioAtual = sessionStorage.getItem('usuarioAtual');
        if (!usuarioAtual) {
            categoriasUsuario.despesas = [...categoriasPadrao.despesas];
            atualizarDropdowns();
            setupGerenciadorCategorias();
            return;
        }
        
        let categoriasCarregadas = false;
        
        if (window.useAPI && window.sistemaAdapter) {
            try {
                const categorias = await window.sistemaAdapter.getCategorias();
                if (categorias && categorias.despesas) {
                    categoriasUsuario.despesas = categorias.despesas;
                    categoriasCarregadas = true;
                }
            } catch (error) {
                console.error('Erro ao carregar categorias da API:', error);
            }
        }
        
        if (!categoriasCarregadas) {
            await carregarCategoriasLocal(usuarioAtual);
        }
        
        if (!categoriasUsuario.despesas || !categoriasUsuario.despesas.length) {
            categoriasUsuario.despesas = [...categoriasPadrao.despesas];
            await salvarCategorias();
        }
        
        atualizarDropdowns();
        setupGerenciadorCategorias();
        
        console.log('✅ Sistema de categorias inicializado');
        
    } catch (error) {
        console.error('Erro ao iniciar categorias:', error);
        categoriasUsuario.despesas = [...categoriasPadrao.despesas];
        atualizarDropdowns();
        setupGerenciadorCategorias();
    } finally {
        processandoCategoria = false;
    }
}

async function carregarCategoriasLocal(usuarioAtual) {
    try {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const usuario = usuarios.find(u => u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual);
        
        if (usuario) {
            if (!usuario.categorias) {
                usuario.categorias = { despesas: [...categoriasPadrao.despesas] };
                localStorage.setItem('usuarios', JSON.stringify(usuarios));
            }
            
            if (usuario.categorias.cartao) {
                delete usuario.categorias.cartao;
                localStorage.setItem('usuarios', JSON.stringify(usuarios));
            }
            
            categoriasUsuario.despesas = usuario.categorias.despesas || [...categoriasPadrao.despesas];
            console.log('✅ Categorias carregadas do localStorage');
        } else {
            categoriasUsuario.despesas = [...categoriasPadrao.despesas];
        }
    } catch (error) {
        console.error('Erro ao carregar categorias locais:', error);
        categoriasUsuario.despesas = [...categoriasPadrao.despesas];
    }
}

async function salvarCategorias() {
    if (processandoCategoria) return false;
    
    try {
        const usuarioAtual = sessionStorage.getItem('usuarioAtual');
        if (!usuarioAtual) return false;
        
        if (window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function') {
            await window.usuarioDados.aguardarPronto();
        }
        
        let sucessoAPI = false;
        
        if (window.useAPI && window.sistemaAdapter) {
            try {
                sucessoAPI = await window.sistemaAdapter.salvarCategorias(categoriasUsuario.despesas);
                if (sucessoAPI) return true;
            } catch (error) {
                console.error('Erro ao salvar categorias na API:', error);
            }
        }
        
        if (!sucessoAPI) {
            return await salvarCategoriasLocal(usuarioAtual);
        }
        
        return sucessoAPI;
        
    } catch (error) {
        console.error('Erro ao salvar categorias:', error);
        return false;
    }
}

async function salvarCategoriasLocal(usuarioAtual) {
    try {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const index = usuarios.findIndex(u => u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual);
        
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
        console.error('Erro ao salvar categorias localmente:', error);
        return false;
    }
}

function atualizarDropdowns() {
    try {
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
        
        if (typeof window.onNovaCategoriaAdicionada === 'function') {
            window.onNovaCategoriaAdicionada();
        }
    } catch (error) {
        console.error('Erro ao atualizar dropdowns:', error);
    }
}

function setupGerenciadorCategorias() {
    try {
        const abaCategorias = document.querySelector('.config-tab-btn[data-tab="categorias"]');
        if (abaCategorias) {
            abaCategorias.addEventListener('click', () => {
                setTimeout(() => atualizarListaCategorias(), 100);
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
    } catch (error) {
        console.error('Erro ao configurar gerenciador de categorias:', error);
    }
}

async function adicionarCategoria() {
    if (processandoCategoria) return;
    
    processandoCategoria = true;
    
    try {
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
        
        const sucesso = await salvarCategorias();
        if (sucesso) {
            inputNovaCategoria.value = '';
            atualizarListaCategorias();
            atualizarDropdowns();
            alert('Categoria adicionada com sucesso!');
        } else {
            const index = categoriasUsuario.despesas.indexOf(nomeCat);
            if (index > -1) {
                categoriasUsuario.despesas.splice(index, 1);
            }
            alert('Erro ao salvar categoria. Tente novamente.');
        }
    } catch (error) {
        console.error('Erro ao adicionar categoria:', error);
        alert('Erro ao adicionar categoria: ' + error.message);
    } finally {
        processandoCategoria = false;
    }
}

function atualizarListaCategorias() {
    try {
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
                <td class="categoria-nome">${categoria}</td>
                <td class="acoes-categoria">
                    <button class="btn-editar-categoria" data-categoria="${categoria}" title="Editar categoria">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-remover-categoria" data-categoria="${categoria}" title="Remover categoria">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            listaCategorias.appendChild(tr);
        });
        
        listaCategorias.addEventListener('click', async (event) => {
            const target = event.target.closest('button');
            if (!target) return;
            
            const categoria = target.getAttribute('data-categoria');
            if (!categoria) return;
            
            if (target.classList.contains('btn-editar-categoria')) {
                await editarCategoria(categoria);
            } else if (target.classList.contains('btn-remover-categoria')) {
                await removerCategoria(categoria);
            }
        });
    } catch (error) {
        console.error('Erro ao atualizar lista de categorias:', error);
    }
}

async function editarCategoria(categoria) {
    if (processandoCategoria) return;
    
    processandoCategoria = true;
    
    try {
        const novoNome = prompt('Editar categoria:', categoria);
        
        if (novoNome && novoNome.trim() !== '') {
            const nomeFormatado = novoNome.trim();
            
            if (nomeFormatado !== categoria && categoriasUsuario.despesas.includes(nomeFormatado)) {
                alert('Já existe uma categoria com este nome!');
                return;
            }
            
            const index = categoriasUsuario.despesas.indexOf(categoria);
            if (index !== -1) {
                const categoriaAnterior = categoriasUsuario.despesas[index];
                categoriasUsuario.despesas[index] = nomeFormatado;
                categoriasUsuario.despesas.sort();
                
                const sucesso = await salvarCategorias();
                if (sucesso) {
                    atualizarListaCategorias();
                    atualizarDropdowns();
                    alert('Categoria editada com sucesso!');
                } else {
                    categoriasUsuario.despesas[index] = categoriaAnterior;
                    alert('Erro ao salvar alteração. Tente novamente.');
                }
            }
        }
    } catch (error) {
        console.error('Erro ao editar categoria:', error);
        alert('Erro ao editar categoria: ' + error.message);
    } finally {
        processandoCategoria = false;
    }
}

async function removerCategoria(categoria) {
    if (processandoCategoria) return;
    
    processandoCategoria = true;
    
    try {
        if (confirm(`Tem certeza que deseja remover a categoria "${categoria}"?`)) {
            const index = categoriasUsuario.despesas.indexOf(categoria);
            if (index !== -1) {
                const categoriaRemovida = categoriasUsuario.despesas.splice(index, 1)[0];
                
                const sucesso = await salvarCategorias();
                if (sucesso) {
                    atualizarListaCategorias();
                    atualizarDropdowns();
                    alert('Categoria removida com sucesso!');
                } else {
                    categoriasUsuario.despesas.splice(index, 0, categoriaRemovida);
                    alert('Erro ao remover categoria. Tente novamente.');
                }
            }
        }
    } catch (error) {
        console.error('Erro ao remover categoria:', error);
        alert('Erro ao remover categoria: ' + error.message);
    } finally {
        processandoCategoria = false;
    }
}

// ================================================================
// CONFIGURAÇÕES DO SISTEMA
// ================================================================

async function initConfigSection() {
    try {
        console.log('⚙️ Inicializando seção de configurações...');
        
        await aguardarSistemaConfiguracoesPronto();
        
        setupConfigTabs();
        await setupSistema();
        
        console.log('✅ Seção de configurações inicializada');
    } catch (error) {
        console.error('Erro ao inicializar configurações:', error);
    }
}

function setupConfigTabs() {
    try {
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
                }
            });
        });
    } catch (error) {
        console.error('Erro ao configurar abas:', error);
    }
}

async function setupSistema() {
    try {
        const btnExportarDados = document.getElementById('btn-exportar-dados');
        const btnImportarDados = document.getElementById('btn-importar-dados');
        const btnLimparDados = document.getElementById('btn-limpar-dados');
        const btnVerificarAtualizacoes = document.getElementById('btn-verificar-atualizacoes');
        
        if (!btnExportarDados || !btnImportarDados || !btnLimparDados || !btnVerificarAtualizacoes) {
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
                    reader.onload = async function(event) {
                        try {
                            await importarDados(event.target.result);
                        } catch (error) {
                            console.error('Erro ao importar dados:', error);
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
        
    } catch (error) {
        console.error('Erro ao configurar sistema:', error);
    }
}

async function exportarDados() {
    try {
        const usuarioAtual = sessionStorage.getItem('usuarioAtual');
        if (!usuarioAtual) {
            alert('Você precisa estar logado para exportar seus dados.');
            return;
        }
        
        if (window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function') {
            await window.usuarioDados.aguardarPronto();
        }
        
        let dadosUsuario = null;
        
        if (window.usuarioDados && typeof window.usuarioDados.getUsuarioAtual === 'function') {
            dadosUsuario = window.usuarioDados.getUsuarioAtual();
        }
        
        if (!dadosUsuario) {
            const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
            dadosUsuario = usuarios.find(u => u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual);
        }
        
        if (!dadosUsuario) {
            alert('Erro ao encontrar dados do usuário.');
            return;
        }
        
        const dadosExportacao = {
            usuario: {
                nome: dadosUsuario.nome,
                documento: dadosUsuario.documento,
                email: dadosUsuario.email
            },
            categorias: dadosUsuario.categorias || { despesas: categoriasPadrao.despesas },
            dados_financeiros: dadosUsuario.dadosFinanceiros || {},
            poupanca: dadosUsuario.poupanca || { saldo: 0, configuracoes: { taxa: 0.5, dia_rendimento: 1 }, transacoes: [] },
            data_exportacao: new Date().toISOString(),
            versao_sistema: '2.0.0'
        };
        
        const dadosJSON = JSON.stringify(dadosExportacao, null, 2);
        
        const blob = new Blob([dadosJSON], { type: 'application/json' });
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
        
    } catch (error) {
        console.error('Erro ao exportar dados:', error);
        alert('Erro ao exportar dados: ' + error.message);
    }
}

async function importarDados(jsonData) {
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
        
        if (window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function') {
            await window.usuarioDados.aguardarPronto();
        }
        
        let sucessoAPI = false;
        
        if (window.useAPI && window.sistemaAdapter) {
            try {
                sucessoAPI = await window.sistemaAdapter.importarDadosUsuario(dados);
            } catch (error) {
                console.error('Erro ao importar via API:', error);
            }
        }
        
        if (!sucessoAPI) {
            await importarDadosLocal(dados, usuarioAtual);
        }
        
        alert('Dados importados com sucesso! A página será recarregada.');
        
        setTimeout(() => {
            window.location.reload();
        }, 1000);
        
    } catch (error) {
        console.error('Erro ao importar dados:', error);
        alert('Erro ao importar dados: ' + error.message);
    }
}

async function importarDadosLocal(dados, usuarioAtual) {
    try {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const index = usuarios.findIndex(u => u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual);
        
        if (index === -1) {
            throw new Error('Usuário atual não encontrado.');
        }
        
        const senhaAtual = usuarios[index].password || usuarios[index].senha;
        const tipoAtual = usuarios[index].tipo;
        const statusAtual = usuarios[index].status;
        
        usuarios[index] = {
            ...dados.usuario,
            password: senhaAtual,
            senha: senhaAtual,
            tipo: tipoAtual,
            status: statusAtual,
            categorias: dados.categorias || { despesas: categoriasPadrao.despesas },
            dadosFinanceiros: dados.dados_financeiros || {},
            poupanca: dados.poupanca || { saldo: 0, configuracoes: { taxa: 0.5, dia_rendimento: 1 }, transacoes: [] },
            dataImportacao: new Date().toISOString()
        };
        
        localStorage.setItem('usuarios', JSON.stringify(usuarios));
        
    } catch (error) {
        console.error('Erro ao importar dados localmente:', error);
        throw error;
    }
}

async function limparDados() {
    try {
        const usuarioAtual = sessionStorage.getItem('usuarioAtual');
        if (!usuarioAtual) {
            alert('Você precisa estar logado para limpar seus dados.');
            return;
        }
        
        if (window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function') {
            await window.usuarioDados.aguardarPronto();
        }
        
        let sucessoAPI = false;
        
        if (window.useAPI && window.sistemaAdapter) {
            try {
                sucessoAPI = await window.sistemaAdapter.limparDadosUsuario();
            } catch (error) {
                console.error('Erro ao limpar dados via API:', error);
            }
        }
        
        if (!sucessoAPI) {
            await limparDadosLocal(usuarioAtual);
        }
        
        alert('Todos os dados foram limpos com sucesso! A página será recarregada.');
        
        setTimeout(() => {
            window.location.reload();
        }, 1000);
        
    } catch (error) {
        console.error('Erro ao limpar dados:', error);
        alert('Erro ao limpar dados: ' + error.message);
    }
}

async function limparDadosLocal(usuarioAtual) {
    try {
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const index = usuarios.findIndex(u => u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual);
        
        if (index === -1) {
            throw new Error('Usuário atual não encontrado.');
        }
        
        const dadosBasicos = {
            nome: usuarios[index].nome,
            documento: usuarios[index].documento,
            email: usuarios[index].email,
            password: usuarios[index].password || usuarios[index].senha,
            senha: usuarios[index].password || usuarios[index].senha,
            tipo: usuarios[index].tipo,
            status: usuarios[index].status
        };
        
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
            },
            dataLimpeza: new Date().toISOString()
        };
        
        localStorage.setItem('usuarios', JSON.stringify(usuarios));
        
    } catch (error) {
        console.error('Erro ao limpar dados localmente:', error);
        throw error;
    }
}

function verificarAtualizacoes() {
    try {
        setTimeout(() => {
            const versaoAtual = '2.0.0';
            const dataAtualizacao = new Date().toLocaleDateString('pt-BR');
            alert(`Sistema atualizado!\n\nVersão atual: ${versaoAtual}\nÚltima verificação: ${dataAtualizacao}\n\nVocê está usando a versão mais recente.`);
        }, 1000);
        
    } catch (error) {
        console.error('Erro ao verificar atualizações:', error);
        alert('Erro ao verificar atualizações. Tente novamente mais tarde.');
    }
}

// ================================================================
// GERENCIAMENTO DE USUÁRIOS
// ================================================================

async function iniciarGerenciamentoUsuarios() {
    try {
        await aguardarSistemaConfiguracoesPronto();
        await obterTipoUsuarioAtual();
        
        setupEventListenersUsuarios();
        ajustarVisibilidadeElementos();
        
        console.log('✅ Gerenciamento de usuários inicializado');
    } catch (error) {
        console.error('Erro ao inicializar gerenciamento de usuários:', error);
    }
}

function setupEventListenersUsuarios() {
    try {
        const btnGerenciarUsuarios = document.getElementById('btn-gerenciar-usuarios');
        if (btnGerenciarUsuarios) {
            btnGerenciarUsuarios.addEventListener('click', abrirModalGerenciamentoUsuarios);
        }
        
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
        
        const searchInput = document.getElementById('usuario-search');
        const searchButton = document.getElementById('btn-search-user');
        
        if (searchInput && searchButton) {
            searchButton.addEventListener('click', filtrarUsuarios);
            
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
        
        const formEditarUsuario = document.getElementById('form-editar-usuario');
        if (formEditarUsuario) {
            formEditarUsuario.addEventListener('submit', async (e) => {
                e.preventDefault();
                await salvarEdicaoUsuario();
            });
        }
        
        const btnAdicionarUsuario = document.getElementById('btn-adicionar-usuario');
        if (btnAdicionarUsuario) {
            btnAdicionarUsuario.addEventListener('click', () => {
                abrirModalEditarUsuario(null, true);
            });
        }
        
        const editarDocumentoInput = document.getElementById('editar-usuario-documento');
        if (editarDocumentoInput) {
            editarDocumentoInput.addEventListener('input', function() {
                formatarDocumento(this);
            });
        }
    } catch (error) {
        console.error('Erro ao configurar event listeners de usuários:', error);
    }
}

function ajustarVisibilidadeElementos() {
    try {
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
    } catch (error) {
        console.error('Erro ao ajustar visibilidade:', error);
    }
}

async function obterTipoUsuarioAtual() {
    try {
        const usuarioAtual = sessionStorage.getItem('usuarioAtual');
        if (!usuarioAtual) {
            tipoUsuarioAtual = 'padrao';
            return;
        }
        
        if (window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function') {
            await window.usuarioDados.aguardarPronto();
        }
        
        let usuario = null;
        
        if (typeof window.usuarioDados?.getUsuarioAtual === 'function') {
            usuario = window.usuarioDados.getUsuarioAtual();
        }
        
        if (!usuario) {
            const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
            usuario = usuarios.find(u => u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual);
        }
        
        tipoUsuarioAtual = usuario?.tipo || 'padrao';
        
    } catch (error) {
        console.error('Erro ao obter tipo de usuário:', error);
        tipoUsuarioAtual = 'padrao';
    }
}

async function abrirModalGerenciamentoUsuarios() {
    try {
        if (tipoUsuarioAtual !== 'admin' && tipoUsuarioAtual !== 'master') {
            alert('Você não tem permissão para acessar o gerenciamento de usuários.');
            return;
        }
        
        paginaAtual = 1;
        await filtrarUsuarios();
        
        const modal = document.getElementById('modal-gerenciar-usuarios');
        if (modal) {
            modal.style.display = 'flex';
        }
        
        const btnAdicionarUsuario = document.getElementById('btn-adicionar-usuario');
        if (btnAdicionarUsuario) {
            btnAdicionarUsuario.style.display = tipoUsuarioAtual === 'master' ? 'block' : 'none';
        }
    } catch (error) {
        console.error('Erro ao abrir modal de gerenciamento:', error);
    }
}

async function filtrarUsuarios() {
    try {
        const searchInput = document.getElementById('usuario-search');
        const filterSelect = document.getElementById('filter-user-type');
        
        const termoBusca = (searchInput?.value || '').trim().toLowerCase();
        const filtroTipo = filterSelect?.value || 'todos';
        
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        
        usuariosFiltrados = usuarios.filter(usuario => {
            const matchesBusca = !termoBusca || 
                (usuario.nome?.toLowerCase().includes(termoBusca)) || 
                (usuario.email?.toLowerCase().includes(termoBusca)) || 
                (usuario.documento?.toLowerCase().includes(termoBusca));
            
            const matchesTipo = filtroTipo === 'todos' || usuario.tipo === filtroTipo;
            
            return matchesBusca && matchesTipo;
        });
        
        paginaAtual = 1;
        renderizarUsuarios();
    } catch (error) {
        console.error('Erro ao filtrar usuários:', error);
    }
}

function renderizarUsuarios() {
    try {
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
        
        const totalPaginas = Math.ceil(usuariosFiltrados.length / itensPorPagina);
        const inicio = (paginaAtual - 1) * itensPorPagina;
        const fim = Math.min(inicio + itensPorPagina, usuariosFiltrados.length);
        
        if (paginationInfo) paginationInfo.textContent = `Página ${paginaAtual} de ${totalPaginas}`;
        if (btnPrevPage) btnPrevPage.disabled = paginaAtual <= 1;
        if (btnNextPage) btnNextPage.disabled = paginaAtual >= totalPaginas;
        
        for (let i = inicio; i < fim; i++) {
            const usuario = usuariosFiltrados[i];
            const tr = criarLinhaUsuario(usuario, i);
            listaUsuarios.appendChild(tr);
        }
        
        listaUsuarios.addEventListener('click', async (event) => {
            const target = event.target.closest('button');
            if (!target) return;
            
            const index = parseInt(target.getAttribute('data-index'));
            const usuario = usuariosFiltrados[index];
            
            if (target.classList.contains('btn-editar-usuario')) {
                abrirModalEditarUsuario(usuario);
            } else if (target.classList.contains('btn-bloquear-usuario')) {
                await alternarBloqueioUsuario(usuario);
            } else if (target.classList.contains('btn-excluir-usuario')) {
                await excluirUsuario(usuario);
            }
        });
    } catch (error) {
        console.error('Erro ao renderizar usuários:', error);
    }
}

function criarLinhaUsuario(usuario, index) {
    const tr = document.createElement('tr');
    
    const tipo = usuario.tipo || 'padrao';
    const status = usuario.status || 'ativo';
    
    const tipoBadge = `<span class="tipo-badge tipo-${tipo}">${tipo === 'padrao' ? 'Padrão' : tipo === 'admin' ? 'Admin' : 'Master'}</span>`;
    const statusBadge = `<span class="status-badge status-${status}">${status === 'ativo' ? 'Ativo' : status === 'inativo' ? 'Inativo' : 'Bloqueado'}</span>`;
    
    let acoesHTML = '';
    
    if (tipoUsuarioAtual === 'master') {
        acoesHTML = `
            <button class="btn-usuario btn-editar-usuario" data-index="${index}" title="Editar usuário">
                <i class="fas fa-edit"></i>
            </button>
            <button class="btn-usuario btn-bloquear-usuario" data-index="${index}" ${status === 'bloqueado' ? 'style="color: #28a745"' : ''} title="${status === 'bloqueado' ? 'Desbloquear' : 'Bloquear'} usuário">
                <i class="fas ${status === 'bloqueado' ? 'fa-unlock' : 'fa-ban'}"></i>
            </button>
            <button class="btn-usuario btn-excluir-usuario" data-index="${index}" title="Excluir usuário">
                <i class="fas fa-trash"></i>
            </button>
        `;
    } else if (tipoUsuarioAtual === 'admin') {
        if (tipo === 'padrao') {
            acoesHTML = `
                <button class="btn-usuario btn-editar-usuario" data-index="${index}" title="Editar usuário">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn-usuario btn-bloquear-usuario" data-index="${index}" ${status === 'bloqueado' ? 'style="color: #28a745"' : ''} title="${status === 'bloqueado' ? 'Desbloquear' : 'Bloquear'} usuário">
                    <i class="fas ${status === 'bloqueado' ? 'fa-unlock' : 'fa-ban'}"></i>
                </button>
            `;
        } else {
            acoesHTML = '<span class="texto-sem-permissao">Sem permissão</span>';
        }
    }
    
    tr.innerHTML = `
        <td class="usuario-nome">${usuario.nome || '-'}</td>
        <td class="usuario-documento">${usuario.documento || '-'}</td>
        <td class="usuario-email">${usuario.email || '-'}</td>
        <td class="usuario-tipo">${tipoBadge}</td>
        <td class="usuario-status">${statusBadge}</td>
        <td class="acoes-usuario">${acoesHTML}</td>
    `;
    
    return tr;
}

async function alternarBloqueioUsuario(usuario) {
    try {
        const estavaBloqueado = usuario.status === 'bloqueado';
        const acao = estavaBloqueado ? 'desbloquear' : 'bloquear';
        
        if (!confirm(`Deseja ${acao} o usuário ${usuario.nome}?`)) {
            return;
        }
        
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const index = usuarios.findIndex(u => u.documento === usuario.documento);
        
        if (index !== -1) {
            usuarios[index].status = estavaBloqueado ? 'ativo' : 'bloqueado';
            usuarios[index].dataAlteracaoStatus = new Date().toISOString();
            localStorage.setItem('usuarios', JSON.stringify(usuarios));
            
            await filtrarUsuarios();
            
            alert(`Usuário ${estavaBloqueado ? 'desbloqueado' : 'bloqueado'} com sucesso!`);
        }
    } catch (error) {
        console.error('Erro ao alterar bloqueio:', error);
        alert('Erro ao alterar status do usuário: ' + error.message);
    }
}

async function excluirUsuario(usuario) {
    try {
        if (!confirm(`Tem certeza que deseja excluir o usuário ${usuario.nome}? Esta ação não pode ser desfeita.`)) {
            return;
        }
        
        if (!confirm('ATENÇÃO: Todos os dados deste usuário serão perdidos. Confirma a exclusão?')) {
            return;
        }
        
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        const novaLista = usuarios.filter(u => u.documento !== usuario.documento);
        
        localStorage.setItem('usuarios', JSON.stringify(novaLista));
        
        await filtrarUsuarios();
        
        alert('Usuário excluído com sucesso!');
    } catch (error) {
        console.error('Erro ao excluir usuário:', error);
        alert('Erro ao excluir usuário: ' + error.message);
    }
}

function abrirModalEditarUsuario(usuario, isNovo = false) {
    try {
        const modal = document.getElementById('modal-editar-usuario');
        const formEditarUsuario = document.getElementById('form-editar-usuario');
        const titulo = document.getElementById('editar-usuario-titulo');
        const formGroupTipo = document.getElementById('form-group-tipo');
        
        if (!modal || !formEditarUsuario) return;
        
        formEditarUsuario.reset();
        
        if (titulo) {
            titulo.innerHTML = isNovo ? 
                '<i class="fas fa-user-plus"></i> Novo Usuário' : 
                '<i class="fas fa-user-edit"></i> Editar Usuário';
        }
        
        if (formGroupTipo) {
            formGroupTipo.style.display = tipoUsuarioAtual === 'master' ? 'block' : 'none';
        }
        
        if (!isNovo && usuario) {
            preencherDadosUsuario(usuario);
        } else {
            const documentoInput = document.getElementById('editar-usuario-documento');
            if (documentoInput) {
                documentoInput.disabled = false;
            }
        }
        
        modal.style.display = 'flex';
    } catch (error) {
        console.error('Erro ao abrir modal de edição:', error);
    }
}

function preencherDadosUsuario(usuario) {
    try {
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
        
        if (tipoUsuarioAtual !== 'master') {
            const selectTipo = document.getElementById('editar-usuario-tipo');
            if (selectTipo) selectTipo.disabled = true;
            
            if (usuario.tipo !== 'padrao') {
                ['editar-usuario-nome', 'editar-usuario-email', 'editar-usuario-status', 
                 'editar-usuario-senha', 'editar-usuario-confirmar-senha'].forEach(id => {
                    const elemento = document.getElementById(id);
                    if (elemento) elemento.disabled = true;
                });
                
                alert('Você só pode editar usuários do tipo Padrão.');
            }
        }
    } catch (error) {
        console.error('Erro ao preencher dados do usuário:', error);
    }
}

async function salvarEdicaoUsuario() {
    try {
        const isNovo = !document.getElementById('editar-usuario-id').value;
        
        const dadosUsuario = coletarDadosFormulario(isNovo);
        
        if (!validarDadosUsuario(dadosUsuario, isNovo)) {
            return;
        }
        
        const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
        
        if (isNovo) {
            await criarNovoUsuario(usuarios, dadosUsuario);
        } else {
            await atualizarUsuarioExistente(usuarios, dadosUsuario);
        }
        
        document.getElementById('modal-editar-usuario').style.display = 'none';
        await filtrarUsuarios();
        
        alert(`Usuário ${isNovo ? 'cadastrado' : 'atualizado'} com sucesso!`);
        
    } catch (error) {
        console.error('Erro ao salvar usuário:', error);
        alert('Erro ao salvar usuário: ' + error.message);
    }
}

function coletarDadosFormulario(isNovo) {
    return {
        documento: isNovo ? 
            document.getElementById('editar-usuario-documento').value.trim() :
            document.getElementById('editar-usuario-id').value,
        nome: document.getElementById('editar-usuario-nome').value.trim(),
        email: document.getElementById('editar-usuario-email').value.trim(),
        tipo: document.getElementById('editar-usuario-tipo').value,
        status: document.getElementById('editar-usuario-status').value,
        senha: document.getElementById('editar-usuario-senha').value,
        confirmarSenha: document.getElementById('editar-usuario-confirmar-senha').value
    };
}

function validarDadosUsuario(dados, isNovo) {
    if (!dados.nome || !dados.email || !dados.documento) {
        alert('Por favor, preencha todos os campos obrigatórios.');
        return false;
    }
    
    if (isNovo && !validarDocumento(dados.documento)) {
        alert('Por favor, informe um CPF ou CNPJ válido.');
        return false;
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) {
        alert('Por favor, informe um e-mail válido.');
        return false;
    }
    
    if (dados.senha || dados.confirmarSenha) {
        if (dados.senha !== dados.confirmarSenha) {
            alert('As senhas não coincidem.');
            return false;
        }
        
        if (dados.senha.length < 6) {
            alert('A senha deve ter pelo menos 6 caracteres.');
            return false;
        }
    }
    
    return true;
}

async function criarNovoUsuario(usuarios, dados) {
    const docExists = usuarios.some(u => u.documento && 
        u.documento.replace(/[^\d]+/g, '') === dados.documento.replace(/[^\d]+/g, ''));
        
    if (docExists) {
        throw new Error('Este CPF/CNPJ já está cadastrado.');
    }
    
    const emailExists = usuarios.some(u => u.email === dados.email);
    if (emailExists) {
        throw new Error('Este e-mail já está cadastrado.');
    }
    
    const novoUsuario = {
        nome: dados.nome,
        email: dados.email,
        documento: dados.documento,
        tipo: tipoUsuarioAtual === 'master' ? dados.tipo : 'padrao',
        status: dados.status,
        password: dados.senha || '123456',
        senha: dados.senha || '123456',
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
        },
        dataCadastro: new Date().toISOString()
    };
    
    usuarios.push(novoUsuario);
    localStorage.setItem('usuarios', JSON.stringify(usuarios));
}

async function atualizarUsuarioExistente(usuarios, dados) {
    const index = usuarios.findIndex(u => u.documento === dados.documento);
    
    if (index === -1) {
        throw new Error('Usuário não encontrado.');
    }
    
    if (tipoUsuarioAtual !== 'master' && usuarios[index].tipo !== 'padrao') {
        throw new Error('Você não tem permissão para editar este usuário.');
    }
    
    if (usuarios[index].email !== dados.email) {
        const emailExists = usuarios.some(u => u.email === dados.email && u.documento !== dados.documento);
        if (emailExists) {
            throw new Error('Este e-mail já está cadastrado para outro usuário.');
        }
    }
    
    usuarios[index].nome = dados.nome;
    usuarios[index].email = dados.email;
    usuarios[index].status = dados.status;
    
    if (tipoUsuarioAtual === 'master') {
        usuarios[index].tipo = dados.tipo;
    }
    
    if (dados.senha) {
        usuarios[index].password = dados.senha;
        usuarios[index].senha = dados.senha;
    }
    
    usuarios[index].dataAtualizacao = new Date().toISOString();
    
    localStorage.setItem('usuarios', JSON.stringify(usuarios));
}

async function garantirUsuarioMaster() {
    try {
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
                },
                dataCriacaoMaster: new Date().toISOString()
            };
            
            usuarios.push(novoUsuario);
            localStorage.setItem('usuarios', JSON.stringify(usuarios));
        }
    } catch (error) {
        console.error('Erro ao garantir usuário master:', error);
    }
}

// ================================================================
// INICIALIZAÇÃO
// ================================================================

async function inicializarConfiguracoes() {
    if (configuracaoInicializada) {
        return;
    }
    
    try {
        console.log('🚀 Inicializando sistema de configurações...');
        
        await aguardarSistemaConfiguracoesPronto();
        
        await garantirUsuarioMaster();
        
        await iniciarCategorias();
        await initConfigSection();
        await iniciarGerenciamentoUsuarios();
        
        configuracaoInicializada = true;
        console.log('✅ Sistema de configurações inicializado completamente');
        
    } catch (error) {
        console.error('Erro ao inicializar configurações:', error);
    }
}

// ================================================================
// EVENT LISTENERS GLOBAIS
// ================================================================

window.addEventListener('click', function(event) {
    try {
        const modalUsuarios = document.getElementById('modal-gerenciar-usuarios');
        if (modalUsuarios && event.target === modalUsuarios) {
            modalUsuarios.style.display = 'none';
        }
        
        const modalEditarUsuario = document.getElementById('modal-editar-usuario');
        if (modalEditarUsuario && event.target === modalEditarUsuario) {
            modalEditarUsuario.style.display = 'none';
        }
    } catch (error) {
        console.error('Erro ao processar clique fora do modal:', error);
    }
});

window.addEventListener('load', async function() {
    try {
        await obterTipoUsuarioAtual();
        ajustarVisibilidadeElementos();
    } catch (error) {
        console.error('Erro ao ajustar visibilidade após load:', error);
    }
});

document.addEventListener('DOMContentLoaded', async function() {
    console.log('⚙️ Configurações.js: DOM carregado, aguardando sistema...');
    
    setTimeout(async () => {
        try {
            await inicializarConfiguracoes();
        } catch (error) {
            console.error('Erro na inicialização automática das configurações:', error);
        }
    }, 1200);
});

// ================================================================
// EXPORTAÇÕES GLOBAIS
// ================================================================

window.iniciarCategorias = iniciarCategorias;
window.salvarCategorias = salvarCategorias;
window.adicionarCategoria = adicionarCategoria;
window.editarCategoria = editarCategoria;
window.removerCategoria = removerCategoria;
window.atualizarDropdowns = atualizarDropdowns;
window.atualizarListaCategorias = atualizarListaCategorias;

window.initConfigSection = initConfigSection;
window.exportarDados = exportarDados;
window.importarDados = importarDados;
window.limparDados = limparDados;
window.verificarAtualizacoes = verificarAtualizacoes;

window.iniciarGerenciamentoUsuarios = iniciarGerenciamentoUsuarios;
window.abrirModalGerenciamentoUsuarios = abrirModalGerenciamentoUsuarios;
window.filtrarUsuarios = filtrarUsuarios;
window.renderizarUsuarios = renderizarUsuarios;
window.alternarBloqueioUsuario = alternarBloqueioUsuario;
window.excluirUsuario = excluirUsuario;
window.abrirModalEditarUsuario = abrirModalEditarUsuario;
window.salvarEdicaoUsuario = salvarEdicaoUsuario;

window.formatarDocumento = formatarDocumento;
window.validarCPF = validarCPF;
window.validarCNPJ = validarCNPJ;
window.validarDocumento = validarDocumento;
window.garantirUsuarioMaster = garantirUsuarioMaster;

window.categoriasUsuario = categoriasUsuario;
window.categoriasPadrao = categoriasPadrao;
window.configuracaoInicializada = configuracaoInicializada;

window.diagnosticoConfiguracoes = function() {
    return {
        inicializado: configuracaoInicializada,
        processandoCategoria: processandoCategoria,
        tipoUsuarioAtual: tipoUsuarioAtual,
        categoriasCarregadas: categoriasUsuario.despesas?.length || 0,
        usuariosFiltrados: usuariosFiltrados.length,
        paginaAtual: paginaAtual,
        sistemaDisponivel: {
            usuarioDados: !!(window.usuarioDados && typeof window.usuarioDados.aguardarPronto === 'function'),
            formatarMoeda: typeof window.formatarMoeda === 'function',
            sistemaInicializado: window.sistemaInicializado === true
        }
    };
};

console.log('✅ Configurações.js organizado carregado - aguardando inicialização completa...');