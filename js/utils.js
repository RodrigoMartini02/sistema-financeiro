// ================================================================
// UTILITÁRIOS COMPARTILHADOS DO SISTEMA
// ================================================================
// Este arquivo contém funções utilitárias usadas em todo o sistema
// Carregue após config.js e antes dos demais módulos
// ================================================================

// ================================================================
// AUTENTICAÇÃO E SESSÃO
// ================================================================

/**
 * Obtém o token JWT armazenado na sessão
 * @returns {string|null} Token JWT ou null se não existir
 */
function getToken() {
    return sessionStorage.getItem('token');
}

/**
 * Define o token JWT na sessão
 * @param {string} token - Token JWT
 */
function setToken(token) {
    sessionStorage.setItem('token', token);
}

/**
 * Remove o token JWT da sessão
 */
function removeToken() {
    sessionStorage.removeItem('token');
}

/**
 * Verifica se o usuário está autenticado
 * @returns {boolean} True se autenticado
 */
function isAuthenticated() {
    const token = getToken();
    return token !== null && token !== undefined && token !== '';
}

/**
 * Redireciona para a página de login
 */
function redirecionarParaLogin() {
    if (!window.location.pathname.includes('login.html')) {
        window.location.href = 'login.html';
    }
}

/**
 * Faz logout do usuário
 */
function logout() {
    removeToken();
    sessionStorage.clear();
    redirecionarParaLogin();
}

// ================================================================
// FORMATAÇÃO DE VALORES
// ================================================================

/**
 * Formata um número como moeda brasileira
 * @param {number} valor - Valor a ser formatado
 * @returns {string} Valor formatado (ex: "R$ 1.234,56")
 */
function formatarMoeda(valor) {
    if (valor === null || valor === undefined || isNaN(valor)) {
        return 'R$ 0,00';
    }

    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(valor);
}

/**
 * Converte string de moeda para número
 * @param {string} valorString - String no formato "R$ 1.234,56"
 * @returns {number} Valor numérico
 */
function moedaParaNumero(valorString) {
    if (!valorString) return 0;

    return parseFloat(
        valorString
            .replace('R$', '')
            .replace(/\./g, '')
            .replace(',', '.')
            .trim()
    ) || 0;
}

/**
 * Formata uma data no padrão brasileiro
 * @param {string|Date} data - Data a ser formatada
 * @returns {string} Data formatada (ex: "31/12/2023")
 */
function formatarData(data) {
    if (!data) return '';

    try {
        const dataObj = typeof data === 'string' ? new Date(data + 'T00:00:00') : new Date(data);

        if (isNaN(dataObj.getTime())) return '';

        const dia = String(dataObj.getDate()).padStart(2, '0');
        const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
        const ano = dataObj.getFullYear();

        return `${dia}/${mes}/${ano}`;
    } catch (error) {
        console.error('Erro ao formatar data:', error);
        return '';
    }
}

/**
 * Converte data DD/MM/YYYY para YYYY-MM-DD
 * @param {string} dataBR - Data no formato brasileiro
 * @returns {string} Data no formato ISO
 */
function dataBRparaISO(dataBR) {
    if (!dataBR) return '';

    const partes = dataBR.split('/');
    if (partes.length !== 3) return '';

    return `${partes[2]}-${partes[1]}-${partes[0]}`;
}

/**
 * Converte um objeto Date para string YYYY-MM-DD sem problema de timezone
 * IMPORTANTE: Use esta função ao invés de toISOString().split('T')[0]
 * @param {Date} data - Objeto Date
 * @returns {string} Data no formato YYYY-MM-DD
 */
function dataParaISO(data) {
    if (!data || !(data instanceof Date) || isNaN(data.getTime())) {
        return '';
    }
    const ano = data.getFullYear();
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${ano}-${mes}-${dia}`;
}

/**
 * Cria um objeto Date a partir de uma string YYYY-MM-DD sem problema de timezone
 * IMPORTANTE: Use esta função ao invés de new Date(string)
 * @param {string} dataString - Data no formato YYYY-MM-DD
 * @returns {Date} Objeto Date
 */
function dataDeISO(dataString) {
    if (!dataString) return null;
    // Adiciona T00:00:00 para evitar interpretação UTC
    return new Date(dataString + 'T00:00:00');
}

// Expor globalmente
window.dataParaISO = dataParaISO;
window.dataDeISO = dataDeISO;

/**
 * Formata data e hora
 * @param {string|Date} dataHora - Data/hora a ser formatada
 * @returns {string} Data/hora formatada (ex: "31/12/2023 14:30")
 */
function formatarDataHora(dataHora) {
    if (!dataHora) return '';

    try {
        const dataObj = new Date(dataHora);

        if (isNaN(dataObj.getTime())) return '';

        const data = formatarData(dataObj);
        const hora = String(dataObj.getHours()).padStart(2, '0');
        const minuto = String(dataObj.getMinutes()).padStart(2, '0');

        return `${data} ${hora}:${minuto}`;
    } catch (error) {
        console.error('Erro ao formatar data/hora:', error);
        return '';
    }
}

// ================================================================
// GERAÇÃO DE IDs E IDENTIFICADORES
// ================================================================

/**
 * Gera um ID único baseado em timestamp e random
 * @returns {string} ID único
 */
function gerarId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Gera um UUID v4
 * @returns {string} UUID
 */
function gerarUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ================================================================
// VALIDAÇÕES
// ================================================================

/**
 * Valida CPF
 * @param {string} cpf - CPF a ser validado
 * @returns {boolean} True se válido
 */
function validarCPF(cpf) {
    cpf = cpf.replace(/[^\d]/g, '');

    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;

    let soma = 0;
    for (let i = 0; i < 9; i++) {
        soma += parseInt(cpf.charAt(i)) * (10 - i);
    }
    let resto = 11 - (soma % 11);
    let digito1 = resto > 9 ? 0 : resto;

    if (parseInt(cpf.charAt(9)) !== digito1) return false;

    soma = 0;
    for (let i = 0; i < 10; i++) {
        soma += parseInt(cpf.charAt(i)) * (11 - i);
    }
    resto = 11 - (soma % 11);
    let digito2 = resto > 9 ? 0 : resto;

    return parseInt(cpf.charAt(10)) === digito2;
}

/**
 * Valida CNPJ
 * @param {string} cnpj - CNPJ a ser validado
 * @returns {boolean} True se válido
 */
function validarCNPJ(cnpj) {
    cnpj = cnpj.replace(/[^\d]/g, '');

    if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;

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

/**
 * Valida email
 * @param {string} email - Email a ser validado
 * @returns {boolean} True se válido
 */
function validarEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

// ================================================================
// MANIPULAÇÃO DE DOM
// ================================================================

/**
 * Mostra/esconde elemento
 * @param {string|HTMLElement} elemento - ID ou elemento DOM
 * @param {boolean} mostrar - True para mostrar, false para esconder
 */
function toggleElemento(elemento, mostrar) {
    const el = typeof elemento === 'string' ? document.getElementById(elemento) : elemento;
    if (el) {
        el.style.display = mostrar ? '' : 'none';
    }
}

/**
 * Adiciona classe a elemento
 * @param {string|HTMLElement} elemento - ID ou elemento DOM
 * @param {string} classe - Nome da classe
 */
function addClass(elemento, classe) {
    const el = typeof elemento === 'string' ? document.getElementById(elemento) : elemento;
    if (el) {
        el.classList.add(classe);
    }
}

/**
 * Remove classe de elemento
 * @param {string|HTMLElement} elemento - ID ou elemento DOM
 * @param {string} classe - Nome da classe
 */
function removeClass(elemento, classe) {
    const el = typeof elemento === 'string' ? document.getElementById(elemento) : elemento;
    if (el) {
        el.classList.remove(classe);
    }
}

// ================================================================
// REQUISIÇÕES HTTP
// ================================================================

/**
 * Faz requisição GET autenticada para a API
 * @param {string} endpoint - Endpoint da API (sem o prefixo /api)
 * @returns {Promise<any>} Resposta da API
 */
async function apiGet(endpoint) {
    const token = getToken();

    const response = await fetch(`${window.API_URL}${endpoint}`, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    if (response.status === 401) {
        logout();
        throw new Error('Sessão expirada');
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Erro na requisição');
    }

    return data;
}

/**
 * Faz requisição POST autenticada para a API
 * @param {string} endpoint - Endpoint da API
 * @param {object} body - Corpo da requisição
 * @returns {Promise<any>} Resposta da API
 */
async function apiPost(endpoint, body) {
    const token = getToken();

    const response = await fetch(`${window.API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (response.status === 401) {
        logout();
        throw new Error('Sessão expirada');
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Erro na requisição');
    }

    return data;
}

/**
 * Faz requisição PUT autenticada para a API
 * @param {string} endpoint - Endpoint da API
 * @param {object} body - Corpo da requisição
 * @returns {Promise<any>} Resposta da API
 */
async function apiPut(endpoint, body) {
    const token = getToken();

    const response = await fetch(`${window.API_URL}${endpoint}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    if (response.status === 401) {
        logout();
        throw new Error('Sessão expirada');
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Erro na requisição');
    }

    return data;
}

/**
 * Faz requisição DELETE autenticada para a API
 * @param {string} endpoint - Endpoint da API
 * @returns {Promise<any>} Resposta da API
 */
async function apiDelete(endpoint) {
    const token = getToken();

    const response = await fetch(`${window.API_URL}${endpoint}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });

    if (response.status === 401) {
        logout();
        throw new Error('Sessão expirada');
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Erro na requisição');
    }

    return data;
}

// ================================================================
// UTILITÁRIOS GERAIS
// ================================================================

/**
 * Debounce - Atrasa execução de função
 * @param {Function} func - Função a ser executada
 * @param {number} wait - Tempo de espera em ms
 * @returns {Function} Função com debounce
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Deep clone de objeto
 * @param {any} obj - Objeto a ser clonado
 * @returns {any} Clone do objeto
 */
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Capitaliza primeira letra de string
 * @param {string} str - String a ser capitalizada
 * @returns {string} String capitalizada
 */
function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Arredonda número para N casas decimais
 * @param {number} numero - Número a ser arredondado
 * @param {number} casas - Número de casas decimais (padrão: 2)
 * @returns {number} Número arredondado
 */
function arredondar(numero, casas = 2) {
    return Math.round((parseFloat(numero) + Number.EPSILON) * Math.pow(10, casas)) / Math.pow(10, casas);
}

// ================================================================
// EXPORTAÇÃO PARA WINDOW (COMPATIBILIDADE)
// ================================================================

window.getToken = getToken;
window.setToken = setToken;
window.removeToken = removeToken;
window.isAuthenticated = isAuthenticated;
window.redirecionarParaLogin = redirecionarParaLogin;
window.logout = logout;

window.formatarMoeda = formatarMoeda;
window.moedaParaNumero = moedaParaNumero;
window.formatarData = formatarData;
window.dataBRparaISO = dataBRparaISO;
window.formatarDataHora = formatarDataHora;

window.gerarId = gerarId;
window.gerarUUID = gerarUUID;

window.validarCPF = validarCPF;
window.validarCNPJ = validarCNPJ;
window.validarEmail = validarEmail;

window.toggleElemento = toggleElemento;
window.addClass = addClass;
window.removeClass = removeClass;

window.apiGet = apiGet;
window.apiPost = apiPost;
window.apiPut = apiPut;
window.apiDelete = apiDelete;

window.debounce = debounce;
window.deepClone = deepClone;
window.capitalize = capitalize;
window.arredondar = arredondar;

// Log de carregamento
if (window.ENVIRONMENT === 'development') {
    console.log('✅ Utilitários carregados');
}

window.utilsCarregado = true;
