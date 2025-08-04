// usuario-dados.js - Gerencia o isolamento de dados por usuário e migração

// Função para obter o usuário atual logado
function getUsuarioAtual() {
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    if (!usuarioAtual) {
        return null;
    }
    
    const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    return usuarios.find(u => u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual);
}

// Função para obter o índice do usuário atual na lista de usuários
function getUsuarioAtualIndex() {
    const usuarioAtual = sessionStorage.getItem('usuarioAtual');
    if (!usuarioAtual) {
        return -1;
    }
    
    const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    return usuarios.findIndex(u => u.documento && u.documento.replace(/[^\d]+/g, '') === usuarioAtual);
}

// Função para salvar dados do usuário atual
function salvarDadosUsuario(dadosFinanceiros) {
    const index = getUsuarioAtualIndex();
    if (index === -1) {
        console.error('Usuário atual não encontrado');
        return false;
    }
    
    const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    usuarios[index].dadosFinanceiros = dadosFinanceiros;
    localStorage.setItem('usuarios', JSON.stringify(usuarios));
    return true;
}

// Função para verificar acesso e redirecionar se não estiver logado
function verificarAcesso() {
    const usuario = getUsuarioAtual();
    if (!usuario) {
        alert('Sessão expirada. Por favor, faça login novamente.');
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

// Função para carregar dados financeiros do usuário atual
function getDadosFinanceirosUsuario() {
    const usuario = getUsuarioAtual();
    if (!usuario) return null;
    
    // Garantir que o objeto dadosFinanceiros exista
    if (!usuario.dadosFinanceiros) {
        usuario.dadosFinanceiros = {
            receitas: [],
            despesas: [],
            investimentos: [],
            metas: []
        };
        
        // Salvar a estrutura inicializada
        salvarDadosUsuario(usuario.dadosFinanceiros);
    }
    
    return usuario.dadosFinanceiros;
}

// SISTEMA DE MIGRAÇÃO DE DADOS
function migrarDadosAntigos() {
    console.log("Iniciando migração de dados antigos...");
    
    const dadosFinanceiros = getDadosFinanceirosUsuario();
    if (!dadosFinanceiros) {
        console.log("Nenhum usuário logado para migração.");
        return false;
    }
    
    let contadorMigrados = 0;
    
    for (const ano in dadosFinanceiros) {
        if (!dadosFinanceiros[ano] || !dadosFinanceiros[ano].meses) continue;
        
        for (let mes = 0; mes < 12; mes++) {
            if (!dadosFinanceiros[ano].meses[mes]) continue;
            
            dadosFinanceiros[ano].meses[mes].despesas.forEach(despesa => {
                // Migração 1: Datas
                if (despesa.data && (!despesa.dataCompra || !despesa.dataVencimento)) {
                    despesa.dataCompra = despesa.data;
                    despesa.dataVencimento = despesa.data;
                    contadorMigrados++;
                }
                
                // Migração 2: Sistema de subcategorias para forma de pagamento
                if (!despesa.formaPagamento) {
                    if (despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito') {
                        despesa.formaPagamento = 'credito';
                        // Converter categoria de cartão para categoria real
                        if (despesa.categoriaCartao) {
                            despesa.categoria = despesa.categoriaCartao;
                            delete despesa.categoriaCartao;
                        } else {
                            despesa.categoria = 'Outros'; // fallback
                        }
                        contadorMigrados++;
                    } else {
                        despesa.formaPagamento = 'credito'; // padrão para dados antigos
                        contadorMigrados++;
                    }
                }
                
                // Limpeza: remover campos antigos se ainda existirem
                if (despesa.categoriaCartao) {
                    delete despesa.categoriaCartao;
                }
            });
        }
    }
    
    if (contadorMigrados > 0) {
        console.log(`${contadorMigrados} registros migrados para o novo formato.`);
        salvarDadosUsuario(dadosFinanceiros);
        return true;
    } else {
        console.log("Nenhum registro precisou ser migrado.");
        return false;
    }
}

// Função para migração específica de categorias de cartão
function migrarCategoriasCartao() {
    console.log("Iniciando migração específica de categorias de cartão...");
    
    const dadosFinanceiros = getDadosFinanceirosUsuario();
    if (!dadosFinanceiros) {
        console.log("Nenhum usuário logado para migração.");
        return false;
    }
    
    let contadorMigrados = 0;
    
    for (const ano in dadosFinanceiros) {
        if (!dadosFinanceiros[ano] || !dadosFinanceiros[ano].meses) continue;
        
        for (let mes = 0; mes < 12; mes++) {
            if (!dadosFinanceiros[ano].meses[mes]) continue;
            
            dadosFinanceiros[ano].meses[mes].despesas.forEach(despesa => {
                // Converter despesas antigas de cartão para novo formato
                if ((despesa.categoria === 'Cartão' || despesa.categoria === 'Cartão de Crédito') && 
                    !despesa.formaPagamento) {
                    
                    // Definir forma de pagamento como crédito
                    despesa.formaPagamento = 'credito';
                    
                    // Mover categoria específica do cartão para categoria principal
                    if (despesa.categoriaCartao) {
                        despesa.categoria = despesa.categoriaCartao;
                        delete despesa.categoriaCartao;
                    } else {
                        // Se não tinha categoria específica, usar "Compras"
                        despesa.categoria = 'Compras';
                    }
                    
                    contadorMigrados++;
                }
            });
        }
    }
    
    if (contadorMigrados > 0) {
        console.log(`${contadorMigrados} despesas de cartão migradas para o novo formato.`);
        salvarDadosUsuario(dadosFinanceiros);
        return true;
    } else {
        console.log("Nenhuma despesa de cartão precisou ser migrada.");
        return false;
    }
}

// Função para verificar e executar todas as migrações necessárias
function executarMigracoes() {
    console.log("=== EXECUTANDO MIGRAÇÕES DE DADOS ===");
    
    if (!verificarAcesso()) {
        return false;
    }
    
    let migracaoExecutada = false;
    
    // Executar migração geral
    if (migrarDadosAntigos()) {
        migracaoExecutada = true;
    }
    
    // Executar migração específica de categorias de cartão
    if (migrarCategoriasCartao()) {
        migracaoExecutada = true;
    }
    
    if (migracaoExecutada) {
        console.log("=== MIGRAÇÕES CONCLUÍDAS COM SUCESSO ===");
    } else {
        console.log("=== NENHUMA MIGRAÇÃO NECESSÁRIA ===");
    }
    
    return migracaoExecutada;
}

// Função para verificar se os dados precisam de migração
function verificarNecessidadeMigracao() {
    const dadosFinanceiros = getDadosFinanceirosUsuario();
    if (!dadosFinanceiros) return false;
    
    let precisaMigracao = false;
    
    for (const ano in dadosFinanceiros) {
        if (!dadosFinanceiros[ano] || !dadosFinanceiros[ano].meses) continue;
        
        for (let mes = 0; mes < 12; mes++) {
            if (!dadosFinanceiros[ano].meses[mes]) continue;
            
            dadosFinanceiros[ano].meses[mes].despesas.forEach(despesa => {
                // Verificar se precisa migrar datas
                if (despesa.data && (!despesa.dataCompra || !despesa.dataVencimento)) {
                    precisaMigracao = true;
                }
                
                // Verificar se precisa migrar forma de pagamento
                if (!despesa.formaPagamento) {
                    precisaMigracao = true;
                }
                
                // Verificar se ainda tem campos antigos
                if (despesa.categoriaCartao) {
                    precisaMigracao = true;
                }
            });
        }
    }
    
    return precisaMigracao;
}

// Função para salvar dados que substitui a função antiga no financeiro.js
function salvarDados() {
    // Tentar obter dadosFinanceiros do escopo global primeiro
    let dadosParaSalvar = null;
    
    if (typeof window.dadosFinanceiros !== 'undefined') {
        dadosParaSalvar = window.dadosFinanceiros;
    } else {
        // Se não encontrou no escopo global, tentar obter os dados atuais
        dadosParaSalvar = getDadosFinanceirosUsuario();
    }
    
    if (!dadosParaSalvar) {
        console.warn('Nenhum dado financeiro encontrado para salvar');
        return false;
    }
    
    return salvarDadosUsuario(dadosParaSalvar);
}

// Expor as funções para uso em outros arquivos
window.usuarioDados = {
    getUsuarioAtual,
    getUsuarioAtualIndex,
    salvarDadosUsuario,
    verificarAcesso,
    getDadosFinanceirosUsuario,
    migrarDadosAntigos,
    migrarCategoriasCartao,
    executarMigracoes,
    verificarNecessidadeMigracao,
    salvarDados
};

// Exportar função salvarDados para o escopo global para compatibilidade
window.salvarDados = salvarDados;