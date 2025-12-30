# 🧪 PLANO DE TESTES - REFATORAÇÃO

## Sistema Financeiro - Rodrigo
**Data:** 30/12/2024
**Versão:** Após Fase 1 e Fase 2.1

---

## 🎯 OBJETIVO

Verificar se todas as funcionalidades continuam funcionando após a refatoração das Fases 1 e 2.1.

---

## ✅ CHECKLIST DE TESTES

### **1. CARREGAMENTO INICIAL** ⏱️

**O que testar:**
- [ ] Abrir `index.html` no navegador
- [ ] Verificar se não há erros no console (F12)
- [ ] Confirmar que todos os scripts carregam na ordem correta:
  1. config.js
  2. utils.js
  3. main.js
  4. usuarioDados.js
  5. configuracao.js
  6. receita.js
  7. despesas.js
  8. despesas-filtros.js
  9. anexos.js
  10. dashboard.js
  11. notificacao.js
  12. rel.js

**Como verificar:**
```javascript
// No console do navegador (F12), digite:
console.log('API_URL:', window.API_URL);
console.log('getToken:', typeof window.getToken);
console.log('formatarMoeda:', typeof window.formatarMoeda);
console.log('filtrarDespesasPorCategoria:', typeof window.filtrarDespesasPorCategoria);
```

**Resultado esperado:**
```
API_URL: https://sistema-financeiro-backend-o199.onrender.com/api
getToken: function
formatarMoeda: function
filtrarDespesasPorCategoria: function
```

---

### **2. AUTENTICAÇÃO** 🔐

**O que testar:**
- [ ] Fazer login com suas credenciais
- [ ] Verificar se o token é salvo no sessionStorage
- [ ] Confirmar redirecionamento para página principal

**Como verificar:**
```javascript
// No console após login:
console.log('Token:', sessionStorage.getItem('token'));
console.log('isAuthenticated:', window.isAuthenticated());
```

**Resultado esperado:**
```
Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
isAuthenticated: true
```

---

### **3. DESPESAS - CRUD BÁSICO** 💰

**O que testar:**
- [ ] Abrir modal de nova despesa
- [ ] Preencher todos os campos
- [ ] Salvar nova despesa
- [ ] Verificar se aparece na lista
- [ ] Editar a despesa criada
- [ ] Excluir a despesa

**Passos detalhados:**

1. **Criar despesa:**
   - Clicar em "+ Nova Despesa"
   - Preencher: Descrição, Categoria, Valor, Data de compra, Vencimento
   - Clicar em "Salvar"
   - Verificar mensagem de sucesso

2. **Verificar renderização:**
   - Procurar despesa na lista
   - Confirmar que valor está formatado corretamente (R$ X.XXX,XX)
   - Confirmar que data está no formato DD/MM/YYYY

3. **Editar:**
   - Clicar no botão de editar (lápis)
   - Mudar descrição ou valor
   - Salvar
   - Verificar atualização na lista

4. **Excluir:**
   - Clicar no botão de excluir
   - Confirmar exclusão
   - Verificar que sumiu da lista

---

### **4. SISTEMA DE FILTROS** 🔍 (NOVO MÓDULO!)

**O que testar:**
- [ ] Filtrar por categoria
- [ ] Filtrar por forma de pagamento
- [ ] Filtrar por status
- [ ] Ordenar por data de compra
- [ ] Ordenar por data de vencimento
- [ ] Ordenar por valor
- [ ] Limpar todos os filtros

**Passos detalhados:**

1. **Filtro de Categoria:**
   - Abrir dropdown "Todas as Categorias"
   - Selecionar uma categoria específica
   - Verificar que apenas despesas daquela categoria aparecem
   - Verificar contador de filtro (ex: "5 de 20 despesas (R$ 500,00)")

2. **Filtro de Forma de Pagamento:**
   - Selecionar "PIX", "Débito" ou "Crédito"
   - Verificar filtragem correta

3. **Filtro de Status:**
   - Selecionar "Pendentes", "Pagas", "Atrasadas" ou "Em dia"
   - Verificar filtragem correta

4. **Ordenação:**
   - Ordenar por "Data de Compra (crescente)"
   - Verificar que datas estão em ordem
   - Ordenar por "Valor (decrescente)"
   - Verificar que valores estão em ordem

5. **Limpar Filtros:**
   - Clicar em "Limpar Filtros"
   - Verificar que todos os filtros voltam para "Todas"
   - Verificar que todas as despesas aparecem novamente

**Como verificar no console:**
```javascript
// Testar função de filtro manualmente:
window.filtrarDespesasPorCategoria('Alimentação');
console.log('Filtro aplicado');

// Limpar filtros:
window.limparFiltros();
console.log('Filtros limpos');
```

---

### **5. RECEITAS** 💵

**O que testar:**
- [ ] Adicionar nova receita
- [ ] Editar receita
- [ ] Excluir receita
- [ ] Verificar totalizações

---

### **6. CONFIGURAÇÕES** ⚙️

**O que testar:**
- [ ] Abrir modal de configurações
- [ ] Adicionar nova categoria de despesa
- [ ] Adicionar nova categoria de receita
- [ ] Salvar configurações
- [ ] Verificar que aparecem nos selects

---

### **7. DASHBOARD** 📊

**O que testar:**
- [ ] Verificar se gráficos carregam
- [ ] Verificar totalizações (receitas, despesas, saldo)
- [ ] Verificar se cores dos gráficos estão corretas (CORES_GRAFICOS de config.js)

**Como verificar:**
```javascript
// No console:
console.log('Cores dos gráficos:', window.CORES_GRAFICOS);
```

---

### **8. FORMATAÇÕES** 🎨

**O que testar:**
- [ ] Valores monetários aparecem como R$ X.XXX,XX
- [ ] Datas aparecem como DD/MM/YYYY
- [ ] Percentuais aparecem com %

**Como verificar no console:**
```javascript
// Testar funções de formatação:
console.log(window.formatarMoeda(1234.56)); // Deve retornar "R$ 1.234,56"
console.log(window.formatarData('2024-12-30')); // Deve retornar "30/12/2024"
```

---

### **9. VALIDAÇÕES** ✔️

**O que testar:**
- [ ] Tentar salvar despesa sem preencher campos obrigatórios
- [ ] Verificar mensagens de erro
- [ ] Tentar inserir valor negativo
- [ ] Tentar inserir data inválida

**Como verificar no console:**
```javascript
// Testar validações:
console.log(window.validarCPF('123.456.789-00')); // true ou false
console.log(window.validarEmail('teste@email.com')); // true
console.log(window.validarEmail('invalido')); // false
```

---

### **10. REQUISIÇÕES API** 🌐

**O que testar:**
- [ ] Verificar que todas as requisições usam window.API_URL de config.js
- [ ] Verificar tratamento de erro 401 (token expirado)
- [ ] Verificar logout automático em caso de 401

**Como verificar:**
```javascript
// No console, verificar URL da API:
console.log('API URL configurada:', window.API_URL);

// Fazer requisição de teste:
window.apiGet('/despesas?mes=12&ano=2024')
    .then(data => console.log('Sucesso:', data))
    .catch(err => console.error('Erro:', err));
```

---

### **11. PARCELAMENTO** 📅

**O que testar:**
- [ ] Criar despesa parcelada (ex: 3x)
- [ ] Verificar se 3 parcelas foram criadas
- [ ] Editar uma parcela
- [ ] Excluir uma parcela
- [ ] Excluir parcela e futuras

---

### **12. ANEXOS** 📎

**O que testar:**
- [ ] Adicionar anexo a uma despesa
- [ ] Visualizar anexo
- [ ] Excluir anexo

---

## 🐛 VERIFICAÇÃO DE ERROS

### **Console do Navegador (F12)**

**Erros que NÃO devem aparecer:**
- ❌ `Uncaught ReferenceError: API_URL is not defined`
- ❌ `Uncaught ReferenceError: getToken is not defined`
- ❌ `Uncaught ReferenceError: formatarMoeda is not defined`
- ❌ `Uncaught ReferenceError: filtrarDespesasPorCategoria is not defined`

**Avisos que podem ser ignorados:**
- ⚠️ Avisos de CORS (se estiver testando localmente)
- ⚠️ Avisos de features experimentais do navegador

---

## 📝 RELATÓRIO DE TESTE

### **Após executar todos os testes, preencha:**

**Data do teste:** ___/___/___
**Navegador:** _______________
**Versão do navegador:** _______________

**Testes que passaram:** ___/12

**Problemas encontrados:**
1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

**Observações:**
_______________________________________________
_______________________________________________
_______________________________________________

---

## 🆘 EM CASO DE ERRO

### **Se encontrar erros no console:**

1. **Tire print do erro completo**
2. **Anote:**
   - Qual teste estava fazendo
   - Qual ação executou
   - Mensagem de erro exata
   - Linha do arquivo onde ocorreu

3. **Verificações rápidas:**
   ```javascript
   // No console, verificar carregamento dos módulos:
   console.log('config.js carregado:', typeof window.API_URL !== 'undefined');
   console.log('utils.js carregado:', typeof window.getToken === 'function');
   console.log('despesas-filtros.js carregado:', typeof window.filtrarDespesasPorCategoria === 'function');
   ```

4. **Verificar ordem de carregamento:**
   - Abrir DevTools → Network
   - Recarregar página (F5)
   - Verificar que config.js e utils.js carregam PRIMEIRO

---

## ✅ TESTE RÁPIDO (2 MINUTOS)

**Se não tiver tempo para todos os testes, faça pelo menos:**

1. ✅ Abrir sistema (sem erros no console)
2. ✅ Fazer login
3. ✅ Adicionar uma despesa
4. ✅ Filtrar por categoria (testar novo módulo)
5. ✅ Limpar filtros
6. ✅ Excluir a despesa criada

**Se esses 6 passos funcionarem, o sistema está OK!** 🎉

---

## 🎯 FOCO PRINCIPAL

**Os testes mais importantes são:**

1. **Sistema de filtros** (novo módulo extraído)
2. **Formatações** (agora centralizadas)
3. **API calls** (agora usando config centralizado)

Se esses 3 funcionarem corretamente, a refatoração foi um sucesso! ✅

---

**Boa sorte nos testes!** 🚀

Qualquer problema, verifique:
1. Console do navegador (F12)
2. Ordem de carregamento dos scripts
3. Se config.js e utils.js estão carregando primeiro
