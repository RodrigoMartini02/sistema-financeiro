# Task: Simplificar Categorias e Automatizar Sugestoes em Despesas

## Contexto

O FinGerence usa categorias para organizar receitas, despesas, relatorios e analises financeiras. A categoria e util para entender para onde o dinheiro esta indo, mas o cadastro atual esta ficando pesado demais para o usuario, especialmente no fluxo de criacao de uma nova categoria.

Hoje o modal de categoria pede decisoes como classificacao, cor, forma favorita, cartao favorito e preview. Isso pode transformar uma acao simples em um processo cansativo. A categoria deve ajudar a analise financeira, nao criar trabalho administrativo para o usuario.

## Problema

Ao cadastrar uma categoria, o usuario precisa tomar muitas decisoes que nem sempre sao importantes no momento. Isso aumenta friccao e pode desestimular o uso correto do sistema.

No cadastro de despesas, o usuario tambem precisa escolher categoria manualmente, mesmo quando o sistema poderia sugerir com base em descricao, historico ou padroes anteriores.

## Objetivo

Simplificar o cadastro de categorias e melhorar o cadastro de despesas com sugestoes inteligentes, para que o usuario registre despesas de forma mais rapida e com menos esforço.

A categoria deve continuar existindo por seu valor analitico, mas deve exigir o minimo possivel do usuario.

## Escopo

### Dentro do escopo

- Simplificar o modal de categoria para campos essenciais:
  - Nome da categoria;
  - Categoria pai opcional, para criar subcategoria;
  - Tipo da categoria, se o sistema precisar separar receita e despesa.
- Remover ou ocultar do fluxo principal os campos avancados do cadastro de categoria:
  - Classificacao OPEX/CAPEX;
  - Cor manual;
  - Forma favorita;
  - Cartao favorito;
  - Preview da categoria.
- Avaliar se algum desses campos ainda e usado em regras existentes antes de remover visualmente.
- No cadastro de despesa, adicionar sugestao de categoria por descricao digitada.
- Criar um mapeamento inicial simples de palavras-chave para categorias comuns, por exemplo:
  - internet, vivo, claro, tim -> Internet / Telefonia;
  - mercado, supermercado, alimentacao -> Alimentacao;
  - gasolina, combustivel, uber -> Transporte;
  - aluguel, condominio -> Moradia / Estrutura;
  - imposto, das, darf, guia -> Impostos e Taxas;
  - sistema, software, assinatura -> Tecnologia.
- Adicionar memoria de ultimo uso por descricao, quando viavel sem backend complexo:
  - se o usuario ja lancou uma despesa com descricao parecida e categoria definida, sugerir a mesma categoria na proxima vez.
- Adicionar acesso rapido a categorias recentes ou mais usadas no modal de despesa.
- Permitir lancar despesa sem categoria, usando fallback `Sem categoria`, sem bloquear o fluxo.
- Avaliar criacao rapida de categoria dentro do modal de despesa, sem sair da tela.

### Fora do escopo inicial

- Criar inteligencia artificial externa para categorizacao.
- Criar integracao bancaria ou leitura automatica de extrato.
- Alterar regras contabeis ou fiscais.
- Executar migrations sem necessidade clara e aprovacao explicita.
- Alterar `.env`, secrets ou configuracoes de producao.
- Remover dados existentes de categorias.
- Fazer deploy/producao sem confirmacao explicita.

## Impacto Previsto

### Frontend

- Ajuste no modal de categoria em `CategoriasTab`.
- Ajuste no modal de despesa para sugerir categoria conforme a descricao.
- Possivel criacao de helper para sugestoes de categoria.
- Possivel uso de `localStorage` para memoria simples por descricao/perfil, se o planejamento considerar adequado.
- Melhoria dos estados vazios e textos para reforcar que categoria e opcional.

### Backend

- Sem impacto obrigatorio inicialmente.
- Se a memoria de categoria precisar ser persistida por usuario/perfil no banco, tratar como decisao separada no planejamento.

### Banco de Dados

- Nao alterar banco na primeira versao sem confirmacao.
- Se campos como cor, classificacao, forma favorita ou cartao favorito existirem no schema, nao remover colunas nesta etapa; apenas simplificar a interface.

### Infra/Deploy

- Sem impacto de infra.
- Producao roda no Render; qualquer envio para producao deve pedir confirmacao explicita.

## Criterios de Aceite

- O modal de categoria fica simples e direto, sem excesso de configuracoes.
- O usuario consegue criar categoria informando apenas nome e, opcionalmente, categoria pai.
- Campos avancados nao aparecem no fluxo principal de criacao de categoria.
- O cadastro de despesa sugere categoria quando a descricao combina com palavras-chave conhecidas.
- O cadastro de despesa pode sugerir categoria usada anteriormente para descricao parecida, se isso for implementado sem complicar backend.
- O usuario continua podendo alterar a categoria manualmente.
- O usuario consegue salvar despesa sem categoria, usando fallback seguro.
- Categorias recentes ou mais usadas aparecem como atalho se houver dados suficientes.
- A implementacao nao quebra relatorios, filtros, dashboard ou despesas existentes.
- `npm run build` deve passar ao final.

## Perguntas Para o Planejamento

- Quais campos de categoria existem no schema e quais sao realmente usados hoje?
- OPEX/CAPEX, cor, forma favorita e cartao favorito devem ser apenas ocultados ou movidos para uma area avancada?
- A sugestao por descricao deve selecionar automaticamente a categoria ou apenas mostrar uma recomendacao clicavel?
- A memoria por descricao deve usar `localStorage` por perfil ativo ou buscar historico real de despesas ja cadastradas?
- A criacao rapida de categoria dentro do modal de despesa entra na primeira versao ou fica para uma segunda etapa?
- Como tratar categorias de receita e despesa se o sistema ja separa ou compartilha o cadastro?

## Arquivos Provavelmente Afetados

- `src/screens/config/CategoriasTab.tsx`
- `src/screens/despesas/DespesasScreen.tsx`
- `src/screens/despesas/DespesaDialog.tsx` ou componente equivalente do modal de despesa
- `src/services/configService.ts`
- `src/types/config.ts`
- `src/types/finance.ts`
- Possivel novo helper em `src/utils/categorySuggestions.ts` ou caminho equivalente existente no projeto

## Instrucoes Para /planejar

- Usar esta task como especificacao de entrada.
- Ler `AGENT.md` e `CLAUDE.md`.
- Inspecionar o schema/tipos de categorias antes de propor remocao ou ocultacao de campos.
- Priorizar simplificacao de UX sem alterar banco na primeira versao.
- Nao implementar codigo durante o planejamento.
- Nao assumir staging ou PR.
- Considerar que o projeto e de um unico desenvolvedor e producao roda no Render.
- Qualquer acao de producao deve pedir confirmacao explicita.
