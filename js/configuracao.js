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
        return false;
    }

    try {
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
            return false;
        }

        const data = await response.json();

        if (!response.ok) {
            return false;
        }

        if (data.success) {
            return true;
        } else {
            return false;
        }
    } catch (error) {
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
            const nomeCategoria = typeof cat === 'string' ? cat : cat.nome;
            const option = document.createElement('option');
            option.value = nomeCategoria;
            option.textContent = nomeCategoria;
            dropdownCategoria.appendChild(option);
        });

        if (valorSelecionado) {
            const existe = categoriasUsuario.despesas.some(cat => {
                const nome = typeof cat === 'string' ? cat : cat.nome;
                return nome === valorSelecionado;
            });

            if (existe) {
                dropdownCategoria.value = valorSelecionado;
            }
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

    // Verificar se já existe (agora comparando o nome do objeto)
    const jaExiste = Array.isArray(categoriasUsuario.despesas)
        ? categoriasUsuario.despesas.some(cat => {
            const nome = typeof cat === 'string' ? cat : cat.nome;
            return nome === nomeCat;
        })
        : false;

    if (jaExiste) {
        mostrarFeedback('Esta categoria já existe!', 'error');
        return;
    }

    // Criar objeto de categoria com metadados
    const novaCategoria = {
        nome: nomeCat,
        dataCriacao: new Date().toISOString(),
        dataEdicao: new Date().toISOString()
    };

    // Converter array antigo (strings) para novo formato (objetos)
    if (!Array.isArray(categoriasUsuario.despesas)) {
        categoriasUsuario.despesas = [];
    } else {
        categoriasUsuario.despesas = categoriasUsuario.despesas.map(cat => {
            if (typeof cat === 'string') {
                return {
                    nome: cat,
                    dataCriacao: new Date().toISOString(),
                    dataEdicao: new Date().toISOString()
                };
            }
            return cat;
        });
    }

    categoriasUsuario.despesas.push(novaCategoria);
    categoriasUsuario.despesas.sort((a, b) => a.nome.localeCompare(b.nome));

    const sucesso = await salvarCategorias();

    // Registrar log da ação
    if (sucesso && window.logManager) {
        window.logManager.registrar({
            modulo: 'Configurações',
            acao: 'Criado',
            categoria: 'Categoria',
            descricao: nomeCat,
            valor: null,
            detalhes: 'Criou nova categoria'
        });
    }
    if (sucesso) {
        inputNovaCategoria.value = '';
        atualizarListaCategorias();
        atualizarDropdowns();
        mostrarFeedback('Alterações realizadas com sucesso!', 'success');
    } else {
        const index = categoriasUsuario.despesas.findIndex(c => c.nome === nomeCat);
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

    // Converter strings antigas para objetos se necessário
    const categoriasNormalizadas = categoriasUsuario.despesas.map(cat => {
        if (typeof cat === 'string') {
            return {
                nome: cat,
                dataCriacao: new Date().toISOString(),
                dataEdicao: new Date().toISOString()
            };
        }
        return cat;
    });

    categoriasNormalizadas.forEach(categoria => {
        const template = document.getElementById('template-linha-categoria');
        if (!template) return;

        const linha = template.content.cloneNode(true);

        // Nome da categoria
        const numeroFormatado = categoria.numero ? `#${categoria.numero.toString().padStart(3, '0')} - ` : '';
        linha.querySelector('.categoria-nome').textContent = `${numeroFormatado}${categoria.nome}`;

        // Data de criação
        const dataCriacao = categoria.dataCriacao ? new Date(categoria.dataCriacao) : new Date();
        linha.querySelector('.categoria-data-criacao').textContent = dataCriacao.toLocaleDateString('pt-BR');

        // Data de edição
        const dataEdicao = categoria.dataEdicao ? new Date(categoria.dataEdicao) : new Date();
        linha.querySelector('.categoria-data-edicao').textContent = dataEdicao.toLocaleDateString('pt-BR');

        // Botões de ação
        linha.querySelector('.btn-editar-categoria').setAttribute('data-categoria', categoria.nome);
        linha.querySelector('.btn-remover-categoria').setAttribute('data-categoria', categoria.nome);

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

async function removerCategoria(nomeCategoria) {
    const confirmar = confirm(`Tem certeza que deseja remover a categoria "${nomeCategoria}"?`);
    if (!confirmar) return;

    const index = categoriasUsuario.despesas.findIndex(cat => {
        const nome = typeof cat === 'string' ? cat : cat.nome;
        return nome === nomeCategoria;
    });

    if (index !== -1) {
        const categoriaRemovida = categoriasUsuario.despesas.splice(index, 1)[0];

        const sucesso = await salvarCategorias();

        // Registrar log da ação
        if (sucesso && window.logManager) {
            window.logManager.registrar({
                modulo: 'Configurações',
                acao: 'Excluído',
                categoria: 'Categoria',
                descricao: nomeCategoria,
                valor: null,
                detalhes: 'Excluiu categoria'
            });
        }

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

    // Verificar se novo nome já existe (excluindo a categoria atual)
    if (novoNome !== nomeOriginal) {
        const jaExiste = categoriasUsuario.despesas.some(cat => {
            const nome = typeof cat === 'string' ? cat : cat.nome;
            return nome === novoNome;
        });

        if (jaExiste) {
            mostrarFeedback('Já existe uma categoria com este nome!', 'error');
            return;
        }
    }

    const index = categoriasUsuario.despesas.findIndex(cat => {
        const nome = typeof cat === 'string' ? cat : cat.nome;
        return nome === nomeOriginal;
    });

    if (index !== -1) {
        const categoriaAtual = categoriasUsuario.despesas[index];
        const categoriaAnterior = {...categoriaAtual};

        // Atualizar categoria mantendo metadados
        if (typeof categoriaAtual === 'string') {
            categoriasUsuario.despesas[index] = {
                nome: novoNome,
                dataCriacao: new Date().toISOString(),
                dataEdicao: new Date().toISOString()
            };
        } else {
            categoriasUsuario.despesas[index] = {
                ...categoriaAtual,
                nome: novoNome,
                dataEdicao: new Date().toISOString()
            };
        }

        categoriasUsuario.despesas.sort((a, b) => {
            const nomeA = typeof a === 'string' ? a : a.nome;
            const nomeB = typeof b === 'string' ? b : b.nome;
            return nomeA.localeCompare(nomeB);
        });

        const sucesso = await salvarCategorias();

        // Registrar log da ação
        if (sucesso && window.logManager) {
            window.logManager.registrar({
                modulo: 'Configurações',
                acao: 'Editado',
                categoria: 'Categoria',
                descricao: `${nomeOriginal} → ${novoNome}`,
                valor: null,
                detalhes: 'Editou categoria'
            });
        }

        if (sucesso) {
            atualizarListaCategorias();
            atualizarDropdowns();
            document.getElementById('modal-editar-categoria').style.display = 'none';
            mostrarFeedback('Alterações realizadas com sucesso!', 'success');
        } else {
            categoriasUsuario.despesas[index] = categoriaAnterior;
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
        return false;
    }

    try {
        // ✅ Garantir que API_URL existe
        const API_URL = window.API_URL || 'https://sistema-financeiro-backend-o199.onrender.com/api';
        const url = `${API_URL}/usuarios/${usuario.id}/cartoes`;

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
            return false;
        }

        const data = await response.json();

        if (!response.ok) {
            return false;
        }

        if (data.success) {
            window.cartoesUsuario = cartoesUsuario;
            return true;
        } else {
            return false;
        }
    } catch (error) {
        return false;
    }
}

async function atualizarOpcoesCartoes() {
    try {
        // ✅ SEMPRE buscar cartões atualizados da API
        await carregarCartoesLocal();

        let cartoesVisiveis = 0;

        ['1', '2', '3'].forEach(num => {
            const label = document.getElementById(`label-cartao${num}`);
            const option = document.getElementById(`cartao${num}-option`);
            const radioInput = document.getElementById(`pagamento-cartao${num}`);
            const cartao = cartoesUsuario[`cartao${num}`] || window.cartoesUsuario?.[`cartao${num}`];

            if (label && option && radioInput && cartao) {
                if (cartao.ativo && cartao.nome && cartao.nome.trim() !== '') {
                    const numeroFormatado = cartao.numero ? `#${cartao.numero.toString().padStart(3, '0')} - ` : '';
                    label.textContent = `${numeroFormatado}${cartao.nome.toUpperCase()}`;
                    option.classList.remove('hidden');
                    radioInput.disabled = false;
                    radioInput.setAttribute('data-cartao', num);
                    cartoesVisiveis++;
                    console.log(`💳 Cartão ${num} disponível: ${numeroFormatado}${cartao.nome}`);
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
        // Erro ao atualizar opções de cartões - silencioso
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
        mostrarStatusCartoes('Erro inesperado ao salvar cartões.', 'error');
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
        btnBloquear.classList.add('btn-desbloquear');
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
        console.log('📦 Iniciando exportação dos dados do PostgreSQL...');

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

        // Debug
        const totalCategorias = (categoriasUsuario.receitas?.length || 0) + (categoriasUsuario.despesas?.length || 0);

        console.log('📊 Dados encontrados no PostgreSQL:');
        console.log('  - Receitas:', todasReceitas.length);
        console.log('  - Despesas:', todasDespesas.length);
        console.log('  - Categorias:', totalCategorias);
        console.log('  - Cartões ativos:', cartoesAtivos);

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

        console.log('📦 Backup gerado:', backup);

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
        console.log(mensagem);
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
                console.log('📦 Backup v2.0 detectado (mês a mês)');
            } else if (backup.receitas && backup.despesas) {
                // Formato antigo
                receitas = backup.receitas || [];
                despesas = backup.despesas || [];
                categorias = backup.categorias || {};
                cartoes = backup.cartoes || {};
                console.log('📦 Backup v1.0 detectado (completo)');
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
            console.log('🏗️ Criando categorias padrão no PostgreSQL...');

            try {
                const responsePadrao = await fetch(`${API_URL}/categorias/padrao`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (responsePadrao.ok) {
                    const data = await responsePadrao.json();
                    console.log('✅ Categorias padrão:', data.message);
                    console.log('📋 Total de categorias:', data.resumo?.total);
                    console.log('📋 IDs disponíveis:', data.resumo?.ids);
                    console.log('📊 Detalhes:', data.data);
                } else {
                    const errorData = await responsePadrao.json();
                    console.error('❌ Erro ao criar categorias padrão:', errorData);
                }
            } catch (error) {
                console.warn('⚠️ Erro ao criar categorias padrão:', error);
            }

            // ✅ PASSO 1: Importar categorias DEPOIS (para o campo JSON no usuarios)
            if (backup.categorias) {
                const totalCategorias = (backup.categorias.receitas?.length || 0) + (backup.categorias.despesas?.length || 0);
                if (progressText) progressText.textContent = `Importando ${totalCategorias} categorias...`;
                console.log('📁 Importando categorias...');

                try {
                    const responseCategorias = await fetch(`${API_URL}/usuarios/${usuario.id}/categorias`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ categorias: backup.categorias })  // ✅ Backend espera { categorias: {...} }
                    });

                    if (responseCategorias.ok) {
                        console.log('✅ Categorias importadas com sucesso');
                        window.categoriasUsuario = backup.categorias;
                    } else {
                        const errorData = await responseCategorias.json();
                        console.error('⚠️ Erro ao importar categorias:', errorData);
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
                    console.log('📋 Mapa de categorias criado:', mapaCategorias);
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
                    console.log('💳 Mapa de cartões criado:', mapaCartoes);
                }
            } catch (error) {
                console.warn('⚠️ Erro ao buscar cartões para mapeamento:', error);
            }

            // ✅ PASSO 2: Importar cartões
            if (backup.cartoes) {
                const totalCartoes = Object.values(backup.cartoes).filter(c => c.ativo).length;
                if (progressText) progressText.textContent = `Importando ${totalCartoes} cartões...`;
                console.log('💳 Importando cartões...');

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
                        console.log('✅ Cartões importados com sucesso');
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
            console.log('📊 Total de receitas a importar:', backup.receitas.length);

            for (const receita of backup.receitas) {
                try {
                    console.log('🔍 Processando receita:', receita);

                    // Validar e converter data para formato ISO8601
                    let dataRecebimento = receita.data_recebimento || receita.data;

                    console.log('📅 Data original:', dataRecebimento);

                    // Se a data não estiver no formato YYYY-MM-DD, converter
                    if (dataRecebimento && !dataRecebimento.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        // Tentar converter de DD/MM/YYYY para YYYY-MM-DD
                        const partes = dataRecebimento.split('/');
                        if (partes.length === 3) {
                            dataRecebimento = `${partes[2]}-${partes[1]}-${partes[0]}`;
                        }
                    }

                    console.log('📅 Data convertida:', dataRecebimento);

                    const dadosReceita = {
                        descricao: receita.descricao,
                        valor: parseFloat(receita.valor),
                        data_recebimento: dataRecebimento,
                        mes: parseInt(receita.mes),
                        ano: parseInt(receita.ano),
                        observacoes: receita.observacoes || ''
                    };

                    console.log('📤 Enviando para API:', dadosReceita);

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
                        console.log('✅ Receita importada com sucesso');
                    } else {
                        erros++;
                        let errorData;
                        try {
                            errorData = await response.json();
                        } catch (e) {
                            errorData = { message: await response.text() };
                        }
                        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                        console.error('❌ ERRO AO IMPORTAR RECEITA');
                        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                        console.error('📊 Status HTTP:', response.status, response.statusText);
                        console.error('📤 Dados enviados:', JSON.stringify(dadosReceita, null, 2));
                        console.error('📥 Resposta do servidor:', JSON.stringify(errorData, null, 2));
                        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    }
                } catch (error) {
                    erros++;
                    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.error('❌ EXCEÇÃO AO IMPORTAR RECEITA');
                    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                    console.error('Erro:', error.message);
                    console.error('Stack:', error.stack);
                    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                }

                processados++;
                if (progressText) {
                    progressText.textContent = `Receitas: ${processados} de ${totalReceitas}`;
                }

                // ✅ DELAY para evitar erro 429 (Too Many Requests)
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            // ✅ PASSO 4: Importar despesas
            let despesasProcessadas = 0;
            console.log('💳 Total de despesas a importar:', totalDespesas);

            for (const despesa of backup.despesas) {
                try {
                    // ✅ FILTRO: Ignorar parcelas que não sejam a primeira
                    // Se for parcelada E parcela_atual não for 1, PULAR
                    if (despesa.parcelado && despesa.parcela_atual && despesa.parcela_atual !== 1) {
                        console.log(`⏭️ Pulando parcela ${despesa.parcela_atual} de: ${despesa.descricao}`);
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
                        console.log(`📁 Mapeando categoria "${despesa.categoria}" → ID ${categoriaId}`);
                    }

                    // ✅ Mapear cartao_id_original para ID real do banco
                    let cartaoId = null;
                    const cartaoOriginal = despesa.cartao_id_original || despesa.cartao_id || despesa.cartao || despesa.numeroCartao;
                    if (cartaoOriginal && mapaCartoes[cartaoOriginal]) {
                        cartaoId = mapaCartoes[cartaoOriginal];
                        console.log(`💳 Mapeando cartão ${cartaoOriginal} → ID ${cartaoId}`);
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
                        total_parcelas: despesa.total_parcelas || despesa.numeroParcelas || null,
                        parcela_atual: despesa.parcela_atual || despesa.parcelaAtual || null,
                        observacoes: despesa.observacoes || '',
                        pago: statusPago  // ✅ Usa lógica que respeita mes_fechado
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
                    } else {
                        erros++;
                        let errorData;
                        try {
                            errorData = await response.json();
                        } catch (e) {
                            errorData = { message: await response.text() };
                        }
                        console.error('❌ Erro ao importar despesa:', errorData);
                        console.error('📤 Dados enviados:', dadosDespesa);
                        console.error('📊 Status:', response.status, response.statusText);
                    }
                } catch (error) {
                    erros++;
                    console.error('❌ Exceção ao importar despesa:', error);
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
                console.log(`📅 Salvando anos: ${Array.from(anosImportados).sort().join(', ')}`);

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
                        console.log(`✅ Ano ${ano} salvo`);
                    } catch (error) {
                        console.warn(`⚠️ Erro ao salvar ano ${ano}:`, error);
                    }
                }
            }

            // Ocultar loader
            if (loader) loader.classList.remove('show');
            if (progressText) progressText.textContent = '';

            if (sucessos > 0) {
                mostrarFeedback(
                    `Importação concluída: ${sucessos} de ${total} registros${erros > 0 ? ` (${erros} erros)` : ''}. Recarregando página...`,
                    erros > 0 ? 'warning' : 'success'
                );

                // ✅ PRODUÇÃO: Recarregar a página completamente para buscar dados do backend
                setTimeout(() => {
                    window.location.reload();
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

            alert('Tudo limpo com sucesso!');
            window.location.reload();
        } else {
            alert('Erro ao limpar dados no servidor.');
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
        alert('Dados excluídos!');
        window.location.reload();
    } else {
        alert('Erro Crítico: A rota de limpeza não existe no Backend. Verifique o código do servidor.');
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

    if (btnAlterarSenhaMenu && modalAlterarSenha) {
        btnAlterarSenhaMenu.addEventListener('click', function() {
            modalAlterarSenha.style.display = 'flex';
            // Fechar o dropdown
            const dropdownAnoMenu = document.getElementById('dropdown-ano-menu');
            if (dropdownAnoMenu) {
                dropdownAnoMenu.style.display = 'none';
            }
        });
    }

    // Formulário de alterar senha
    const formAlterarSenha = document.getElementById('form-alterar-senha');

    if (formAlterarSenha) {
        formAlterarSenha.addEventListener('submit', async function(e) {
            e.preventDefault();

            const senhaAtual = document.getElementById('senha-atual-modal').value;
            const senhaNova = document.getElementById('senha-nova-modal').value;
            const senhaConfirmar = document.getElementById('senha-confirmar-modal').value;

            // Validar se as senhas novas coincidem
            if (senhaNova !== senhaConfirmar) {
                alert('As senhas não coincidem!');
                return;
            }

            // Validar tamanho mínimo
            if (senhaNova.length < 6) {
                alert('A senha deve ter no mínimo 6 caracteres!');
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
                    alert('Senha alterada com sucesso!');
                    formAlterarSenha.reset();
                    modalAlterarSenha.style.display = 'none';
                } else {
                    alert(data.message || 'Erro ao alterar senha. Verifique se a senha atual está correta.');
                }
            } catch (error) {
                console.error('Erro ao alterar senha:', error);
                alert('Erro ao alterar senha. Tente novamente.');
            }
        });
    }
});