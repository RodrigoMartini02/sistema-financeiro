# 📦 MÓDULOS DO SISTEMA DE DESPESAS

## Estrutura Modular (Fase 2 - Refatoração)

O arquivo original `despesas.js` (3.391 linhas) foi dividido em módulos especializados para melhor manutenibilidade.

---

## 📁 Organização dos Módulos

### **despesas-core.js** - Funções Principais (CRUD)
Responsabilidades: Operações básicas de criação, leitura, atualização e exclusão
- `buscarEExibirDespesas()` - Busca despesas da API
- `salvarDespesa()` - Salva/atualiza despesa
- `salvarDespesaLocal()` - Comunicação com API
- `editarDespesa()` - Edição de despesa
- `excluirDespesa()` - Exclusão de despesa
- `criarObjetoDespesa()` - Criação de objeto despesa
- `encontrarDespesaPorIndice()` - Busca despesa por índice

### **despesas-render.js** - Renderização de UI
Responsabilidades: Renderização de tabelas e elementos visuais
- `renderizarDespesas()` - Renderiza lista de despesas
- `criarLinhaDespesaGrid()` - Cria linha na tabela
- `preencherCelulasGrid()` - Preenche células da grid
- `preencherCelula*()` - Funções específicas de cada célula
- `sincronizarIndicesDespesas()` - Sincroniza índices

### **despesas-pagamento.js** - Sistema de Pagamentos
Responsabilidades: Processamento de pagamentos e quitação
- `abrirModalPagamento()` - Abre modal de pagamento
- `processarPagamento()` - Processa pagamento individual
- `pagarDespesasEmLote()` - Pagamento em lote
- `processarParcelasFuturas()` - Quitação antecipada
- `configurarFormPagamento()` - Configuração do formulário

### **despesas-filtros.js** - Filtros e Ordenação
Responsabilidades: Filtragem e ordenação de despesas
- `aplicarTodosFiltros()` - Aplica todos os filtros
- `filtrarDespesasPor*()` - Filtros específicos
- `aplicarOrdenacaoDespesas()` - Ordenação
- `limparFiltros()` - Limpa filtros
- `atualizarContadoresFiltro()` - Atualiza contadores

### **despesas-parcelamento.js** - Gestão de Parcelamento
Responsabilidades: Lógica de parcelamentos
- `validarGrupoParcelamento()` - Valida grupo
- `sincronizarParcelasGrupo()` - Sincroniza parcelas
- `excluirApenasParcela()` - Exclui parcela única
- `excluirParcelaEFuturas()` - Exclui parcela e futuras
- `calcularInfoParcelamento()` - Calcula informações

### **despesas-modal.js** - Modais e Formulários
Responsabilidades: Gerenciamento de modais
- `abrirModalNovaDespesa()` - Abre modal de cadastro
- `resetarEstadoFormularioDespesa()` - Reseta formulário
- `preencherFormularioEdicao()` - Preenche para edição
- `coletarDadosFormularioDespesa()` - Coleta dados
- `validarCategoria()` - Validação de categoria
- `validarFormaPagamento()` - Validação de pagamento

### **despesas-utils.js** - Utilitários Específicos
Responsabilidades: Funções auxiliares específicas de despesas
- `atualizarStatusDespesas()` - Atualiza status
- `obterCategoriaLimpa()` - Limpa categoria
- `criarBadgeStatus()` - Cria badge de status
- `obterClasseStatus()` - Obtém classe CSS
- `calcularTotalDespesas()` - Calcula total
- `calcularTotalJuros()` - Calcula juros
- `calcularTotalEconomias()` - Calcula economias

---

## 🔄 Ordem de Carregamento

```html
<!-- Carregamento ordenado no index.html -->
<script src="js/despesas/despesas-utils.js"></script>
<script src="js/despesas/despesas-core.js"></script>
<script src="js/despesas/despesas-render.js"></script>
<script src="js/despesas/despesas-parcelamento.js"></script>
<script src="js/despesas/despesas-filtros.js"></script>
<script src="js/despesas/despesas-pagamento.js"></script>
<script src="js/despesas/despesas-modal.js"></script>
```

---

## ✅ Compatibilidade

Todas as funções continuam expostas no `window` para manter compatibilidade com código existente.

**Backup:** O arquivo original foi renomeado para `despesas-legacy.js` e está desabilitado no index.html.

---

## 📊 Métricas

| Métrica | Antes | Depois |
|---------|-------|--------|
| Linhas por arquivo | 3.391 | ~400-600/módulo |
| Número de arquivos | 1 | 7 módulos |
| Manutenibilidade | Difícil | Fácil |
| Responsabilidades | Misturadas | Separadas |

---

## 🎯 Benefícios

1. ✅ **Manutenção mais fácil** - Cada módulo tem responsabilidade clara
2. ✅ **Debugging simplificado** - Erros apontam para módulo específico
3. ✅ **Reusabilidade** - Módulos podem ser usados independentemente
4. ✅ **Escalabilidade** - Fácil adicionar novas funcionalidades
5. ✅ **Trabalho em equipe** - Diferentes devs em diferentes módulos

---

Criado em: 30/12/2024
Por: Claude Code + Rodrigo
