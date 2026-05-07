# Gen - Arquitetura Profissional da IA Financeira

## Visao Geral

A Gen agora e tratada como um modulo de assistente financeiro, nao como um conjunto de regras soltas no frontend. O backend concentra interpretacao, tool calling, historico, consultas financeiras, provedores de IA e confirmacao de lancamentos. O frontend fica responsavel pela experiencia: chat, chips, coleta guiada, cards de conferencia e envio final para as rotas financeiras.

O principio principal e simples: **a Gen prepara e recomenda; o usuario confirma; o sistema financeiro grava**.

---

## Decisoes de Arquitetura

### O que fica no backend

- Adaptadores de provedores: OpenAI, Gemini, Claude e Groq.
- Definicao e execucao das ferramentas do modelo.
- Gateway unico de texto em `backend/services/genProviderGateway.js`, usado por carta de servicos e importacao de extrato.
- Historico persistido em PostgreSQL.
- Contexto financeiro do usuario e do perfil ativo PF/PJ.
- Carta de servicos global e instrucoes personalizadas.
- Leitura de documentos, PIX, boleto, recorrencias e extrato.
- Endpoints de metas e orcamentos usados pelo painel da Gen.

### O que fica no frontend

- Renderizacao do chat.
- Coleta visual de campos faltantes.
- Confirmacao, edicao e cancelamento de despesas/receitas.
- Integracao com upload, camera, boleto e acoes rapidas.
- Compatibilidade entre painel flutuante, pagina desktop e pagina mobile.

O frontend pode ter pequenas interceptacoes de UX, como "desfazer", "encerrar" ou troca de perfil, mas regras financeiras permanentes devem migrar para o backend.

---

## Ferramentas da Gen

As ferramentas foram renomeadas para refletir melhor o contrato real. Elas nao salvam diretamente no banco; elas preparam dados ou consultam informacoes.

| Ferramenta | Responsabilidade |
|---|---|
| `preparar_lancamento_despesa` | Monta uma despesa para conferencia. Exige `descricao`, `valor`, `forma_pagamento`; se credito ou parcelado, exige `nome_cartao`. |
| `preparar_lancamento_receita` | Monta uma receita para conferencia. Exige `descricao`, `valor`, `data`. |
| `consultar_resumo_financeiro` | Consulta receitas, despesas, saldo, valores pagos/em aberto e gastos por categoria. |
| `listar_despesas` | Lista despesas por periodo, categoria e limite. |
| `comparar_competencias` | Compara duas competencias financeiras. |
| `analisar_historico_categoria` | Analisa tendencia de gastos em uma categoria por varios meses. |

Depois que uma ferramenta prepara despesa ou receita, o backend retorna `acao: "confirmar_despesa"` ou `acao: "confirmar_receita"`. O usuario confirma no frontend, e somente entao o sistema chama `/api/despesas` ou `/api/receitas`.

---

## Provedores

| Provider | Modelo atual | Observacao |
|---|---|---|
| OpenAI | GPT-4o mini | Pago |
| Google Gemini | Gemini 2.0 Flash | Gratuito com limites |
| Anthropic Claude | Claude Sonnet | Pago |
| Groq | Llama 3.3 70B | Gratuito com limites |

O provider `gen` representa o estado "aguardando configuracao". Ele nao deve prometer IA interna funcionando. Sem chave de provider, o chat inteligente fica pausado e orienta o usuario a configurar uma chave.

Modelos podem ser sobrescritos por variaveis de ambiente:

- `OPENAI_MODEL`
- `GROQ_MODEL`
- `GEMINI_MODEL`
- `CLAUDE_MODEL`
- `OPENAI_VISION_MODEL`
- `CLAUDE_VISION_MODEL`
- `GEN_KEY_ENCRYPTION_SECRET`

`GEN_KEY_ENCRYPTION_SECRET` e usado para criptografar chaves de provedores com AES-256-GCM antes de gravar em `usuarios.dados_financeiros`. Se ele nao existir, o sistema continua funcionando em modo compativel e preserva chaves antigas em texto simples. Em producao, configure esse segredo e mantenha um backup seguro dele.

---

## Rotas

As rotas legadas foram mantidas para compatibilidade. O frontend principal ja foi migrado para as rotas novas; as rotas antigas continuam disponiveis para evitar quebra em telas antigas, scripts externos ou deploys parciais.

| Uso | Rota nova | Rota legada |
|---|---|---|
| Saude do modulo | `GET /api/ai/health` | `GET /api/ai/status` |
| Conversa | `POST /api/ai/conversation` | `POST /api/ai/chat` |
| Provedores | `GET/POST /api/ai/providers` | `GET /api/ai/config`, `POST /api/ai/config/chave` |
| Teste de provider | `GET /api/ai/providers/test` | `GET /api/ai/test` |
| Resumo financeiro | `GET /api/ai/financial-summary` | `GET /api/ai/resumo` |
| Documento | `POST /api/ai/documents` | `POST /api/ai/arquivo` |
| PIX | `POST /api/ai/pix/parse` | `POST /api/ai/pix` |
| Boleto | `POST /api/ai/boletos/parse` | `POST /api/ai/boleto` |
| Extrato | `POST /api/ai/statements/import` | `POST /api/ai/extrato` |
| Instrucoes pessoais | `GET/PUT /api/ai/personal-instructions` | `GET/POST /api/ai/instrucoes` |
| Carta de servicos | `GET/PATCH /api/ai/service-letter` | `GET/POST /api/ai/carta` |
| Metas | `GET/POST/DELETE /api/ai/goals` | `GET/POST/DELETE /api/ai/metas` |
| Orcamentos | `GET/POST/DELETE /api/ai/budgets` | `GET/POST/DELETE /api/ai/orcamentos` |

---

## Historico Persistido

O historico conversacional da IA e salvo na tabela `ia_sessoes`:

```sql
CREATE TABLE ia_sessoes (
    usuario_id INT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
    historico JSONB DEFAULT '[]'::jsonb,
    atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

A conversa mantem as ultimas 40 mensagens por usuario. A limpeza de sessao agora acontece antes da validacao de provider, entao "nova conversa" funciona mesmo quando nao ha chave configurada.

---

## Pontos de Atencao

- As chaves de API ficam em `usuarios.dados_financeiros`, mas agora passam por `backend/services/secureKeyStore.js`; leituras aceitam chaves antigas em texto simples e novas gravacoes usam criptografia quando `GEN_KEY_ENCRYPTION_SECRET`, `JWT_SECRET` ou `SESSION_SECRET` estiver configurado.
- `js/ia.js` ainda possui coleta e normalizacao locais para manter a UX atual. O objetivo futuro e reduzir essas regras e deixar o backend orientar os campos faltantes.
- `ia-mobile.js` deve continuar sendo apenas adaptador de experiencia mobile, nao outra implementacao da IA.
- O controller ja possui nomes profissionais exportados, mantendo aliases antigos para compatibilidade.
- `backend/services/genWorkspaceService.js` concentra persistencia de instrucoes pessoais, carta de servicos, metas e orcamentos.
- `backend/services/genProviderGateway.js` centraliza geracao de texto/JSON para OpenAI, Gemini, Claude e Groq; chamadas multimodais de imagem/PDF continuam em `visionService.js`.
- A interface da Gen recebeu um polimento leve em `css/ia.css` e `css/ia-mobile.css`: bolhas menos pesadas, botoes mais estaveis, foco mais claro no input, rolagem mais suave e suporte a reducao de movimento.

---

## Proximos Passos

1. Extrair o restante de `aiController.js` em services menores: tools financeiras, sessoes e planejamento.
2. Centralizar validacao de campos faltantes no backend.
3. Adicionar testes de contrato para `/conversation`, `/providers`, `/documents` e `/financial-summary`.
4. Remover rotas legadas apenas depois de confirmar que todos os clientes usam as rotas novas.
