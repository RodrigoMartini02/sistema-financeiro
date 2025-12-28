# 🚀 BACKEND - SISTEMA FINANCEIRO

Backend completo em Node.js + Express + PostgreSQL para o Sistema de Controle Financeiro.

---

## 📋 PRÉ-REQUISITOS

- ✅ Node.js 16+ instalado
- ✅ PostgreSQL 18 rodando (porta 5433)
- ✅ Banco `sistema_financas` criado
- ✅ Tabelas criadas (executar script SQL primeiro)

---

## 🔧 INSTALAÇÃO

### **PASSO 1: Navegar até a pasta do backend**
```bash
cd backend
```

### **PASSO 2: Instalar dependências**
```bash
npm install
```

### **PASSO 3: Configurar variáveis de ambiente**
```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Editar .env e configurar:
# - DB_PASSWORD (sua senha do PostgreSQL)
# - JWT_SECRET (gerar uma chave segura)
```

---

## 🎯 EXECUTAR O SERVIDOR

### **Modo Desenvolvimento (com auto-reload)**
```bash
npm run dev
```

### **Modo Produção**
```bash
npm start
```

---

## ✅ VERIFICAR SE ESTÁ FUNCIONANDO

### **1. Testar API**
Abra o navegador: `http://localhost:3000`

Deve mostrar:
```json
{
  "success": true,
  "message": "API Sistema Financeiro está funcionando!",
  "version": "1.0.0"
}
```

### **2. Testar Health Check**
```bash
curl http://localhost:3000/health
```

Deve retornar:
```json
{
  "success": true,
  "status": "OK",
  "database": "Conectado"
}
```

---

## 🔐 TESTAR AUTENTICAÇÃO

### **Criar um usuário**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Rodrigo Teste",
    "email": "rodrigo@teste.com",
    "documento": "12345678900",
    "senha": "senha123"
  }'
```

### **Fazer login**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "documento": "12345678900",
    "senha": "senha123"
  }'
```

Vai retornar um **token JWT**. Copie o token!

### **Usar o token para acessar rota protegida**
```bash
curl http://localhost:3000/api/usuarios/current \
  -H "Authorization: Bearer SEU_TOKEN_AQUI"
```

---

## 📁 ESTRUTURA DO BACKEND

```
backend/
├── config/
│   └── database.js          # Conexão PostgreSQL
├── middleware/
│   ├── auth.js              # Middleware JWT
│   └── validation.js        # Validações
├── routes/
│   ├── auth.js              # Rotas de autenticação
│   ├── usuarios.js          # Rotas de usuários
│   ├── receitas.js          # (A CRIAR)
│   ├── despesas.js          # (A CRIAR)
│   ├── categorias.js        # (A CRIAR)
│   ├── cartoes.js           # (A CRIAR)
│   ├── meses.js             # (A CRIAR)
│   └── reservas.js          # (A CRIAR)
├── .env                     # Configurações (NÃO COMMITAR!)
├── .env.example             # Exemplo de configurações
├── package.json             # Dependências
└── server.js                # Servidor principal
```

---

## 🛠️ ROTAS DISPONÍVEIS (ATÉ AGORA)

### **Públicas**
- `GET /` - Informações da API
- `GET /health` - Status do sistema

### **Autenticação**
- `POST /api/auth/register` - Cadastrar usuário
- `POST /api/auth/login` - Fazer login
- `GET /api/auth/verify` - Verificar token (🔒 protegida)
- `POST /api/auth/logout` - Logout (🔒 protegida)

### **Usuários**
- `GET /api/usuarios/current` - Dados do usuário logado (🔒 protegida)
- `GET /api/usuarios` - Listar usuários (🔒 admin/master)
- `PUT /api/usuarios/current` - Atualizar dados (🔒 protegida)

---

## 🔑 AUTENTICAÇÃO

O sistema usa **JWT (JSON Web Token)**.

### **Como usar:**
1. Fazer login → receber token
2. Incluir token no header de todas as requisições:
   ```
   Authorization: Bearer SEU_TOKEN_AQUI
   ```

### **Tipos de usuário:**
- `padrao` - Usuário comum
- `admin` - Administrador
- `master` - Super administrador

---

## 🐛 TROUBLESHOOTING

### **Erro: Cannot connect to PostgreSQL**
✅ Verificar se o PostgreSQL está rodando:
```bash
# Windows
services.msc (procurar por PostgreSQL)

# Linux/Mac
sudo systemctl status postgresql
```

✅ Verificar porta no `.env` (deve ser 5433)

### **Erro: relation "usuarios" does not exist**
✅ Você não executou o script SQL! 
Execute o arquivo `criar_tabelas_sistema_financeiro.sql` no pgAdmin primeiro.

### **Erro: JWT_SECRET is not defined**
✅ Você não configurou o `.env`!
Copie o `.env.example` para `.env` e configure as variáveis.

---

## 📊 PRÓXIMOS PASSOS

1. ✅ Backend básico funcionando
2. ⏳ Criar rotas de **receitas**
3. ⏳ Criar rotas de **despesas**
4. ⏳ Criar rotas de **categorias**
5. ⏳ Criar rotas de **cartões**
6. ⏳ Criar rotas de **meses**
7. ⏳ Criar rotas de **reservas**
8. ⏳ Adaptar frontend para usar API

---

## 📞 SUPORTE

Se encontrar erros:
1. Verificar logs no terminal onde rodou `npm run dev`
2. Verificar se o PostgreSQL está conectado: `GET /health`
3. Verificar se as tabelas foram criadas no pgAdmin

---

**Desenvolvido com ❤️ por Rodrigo**
