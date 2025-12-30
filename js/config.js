// ================================================================
// ARQUIVO DE CONFIGURAÇÃO CENTRALIZADO
// ================================================================
// IMPORTANTE: Este arquivo deve ser carregado ANTES de todos os outros
// scripts JS do sistema. Adicione no index.html:
// <script src="js/config.js"></script>
// ================================================================

// ================================================================
// CONFIGURAÇÕES DE API E AMBIENTE
// ================================================================

/**
 * URL base da API do backend
 * @constant {string}
 */
window.API_URL = 'https://sistema-financeiro-backend-o199.onrender.com/api';

/**
 * Ambiente de execução (development, staging, production)
 * @constant {string}
 */
window.ENVIRONMENT = 'production';

/**
 * Versão do sistema frontend
 * @constant {string}
 */
window.APP_VERSION = '1.0.0';

// ================================================================
// CONFIGURAÇÕES DE CACHE
// ================================================================

/**
 * Tempo de expiração do cache em milissegundos (5 minutos)
 * @constant {number}
 */
window.CACHE_TIMEOUT = 5 * 60 * 1000;

/**
 * Tempo de debounce para salvamento automático (2 segundos)
 * @constant {number}
 */
window.DEBOUNCE_SAVE_TIME = 2000;

// ================================================================
// CONFIGURAÇÕES DE UI
// ================================================================

/**
 * Número de itens por página em listagens
 * @constant {number}
 */
window.ITEMS_PER_PAGE = 10;

/**
 * Delay para mostrar mensagens de sucesso/erro (3 segundos)
 * @constant {number}
 */
window.MESSAGE_DISPLAY_TIME = 3000;

/**
 * Delay para animações CSS (300ms)
 * @constant {number}
 */
window.ANIMATION_DELAY = 300;

// ================================================================
// CONFIGURAÇÕES DE VALIDAÇÃO
// ================================================================

/**
 * Tamanho máximo de arquivo para upload (10MB)
 * @constant {number}
 */
window.MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Tipos de arquivo permitidos para anexos
 * @constant {string[]}
 */
window.ALLOWED_FILE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'image/webp'
];

/**
 * Extensões de arquivo permitidas
 * @constant {string[]}
 */
window.ALLOWED_FILE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.webp'];

// ================================================================
// MENSAGENS DE ERRO PADRÃO
// ================================================================

window.MENSAGENS = {
    ERRO_GENERICO: 'Ocorreu um erro inesperado. Tente novamente.',
    ERRO_CONEXAO: 'Erro de conexão com o servidor. Verifique sua internet.',
    ERRO_AUTENTICACAO: 'Sessão expirada. Faça login novamente.',
    ERRO_PERMISSAO: 'Você não tem permissão para esta ação.',
    ERRO_VALIDACAO: 'Dados inválidos. Verifique os campos.',

    SUCESSO_SALVAR: 'Dados salvos com sucesso!',
    SUCESSO_EXCLUIR: 'Item excluído com sucesso!',
    SUCESSO_ATUALIZAR: 'Item atualizado com sucesso!',

    CONFIRMAR_EXCLUSAO: 'Tem certeza que deseja excluir este item?',
    CONFIRMAR_SAIR: 'Deseja realmente sair do sistema?'
};

// ================================================================
// CORES PARA GRÁFICOS E CATEGORIAS
// ================================================================

window.CORES_GRAFICOS = [
    'rgba(255, 99, 132, 0.7)',
    'rgba(54, 162, 235, 0.7)',
    'rgba(255, 206, 86, 0.7)',
    'rgba(75, 192, 192, 0.7)',
    'rgba(153, 102, 255, 0.7)',
    'rgba(255, 159, 64, 0.7)',
    'rgba(220, 53, 69, 0.7)',
    'rgba(83, 102, 255, 0.7)',
    'rgba(199, 199, 199, 0.7)',
    'rgba(50, 205, 50, 0.7)'
];

// ================================================================
// MESES DO ANO
// ================================================================

window.MESES_NOMES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril',
    'Maio', 'Junho', 'Julho', 'Agosto',
    'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

window.MESES_CURTOS = [
    'Jan', 'Fev', 'Mar', 'Abr',
    'Mai', 'Jun', 'Jul', 'Ago',
    'Set', 'Out', 'Nov', 'Dez'
];

// ================================================================
// CATEGORIAS PADRÃO
// ================================================================

window.CATEGORIAS_PADRAO = {
    despesas: [
        'Alimentação',
        'Transporte',
        'Moradia',
        'Saúde',
        'Educação',
        'Lazer',
        'Vestuário',
        'Outros'
    ],
    receitas: [
        'Salário',
        'Freelance',
        'Investimentos',
        'Outros'
    ]
};

// ================================================================
// LOG DE CONFIGURAÇÃO (apenas em desenvolvimento)
// ================================================================

if (window.ENVIRONMENT === 'development') {
    console.log('✅ Configurações carregadas:', {
        API_URL: window.API_URL,
        VERSION: window.APP_VERSION,
        ENVIRONMENT: window.ENVIRONMENT
    });
}

// Marcar que as configurações foram carregadas
window.configCarregado = true;
