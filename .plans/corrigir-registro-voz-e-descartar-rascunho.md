# Plano: Corrigir registro por voz e descartar rascunho

## Origem

- Task/arquivo de origem: erro `Failed to create expense` ao confirmar uma despesa criada pelo assistente por voz e ausencia de uma acao para abandonar o rascunho.
- Classificacao: fullstack.

## Resumo

Restaurar o preenchimento da coluna legada `despesas.valor` nos inserts de despesa. O banco de producao ainda a exige como `NOT NULL`, mas o commit `bf1b8ee` a removeu das insercoes comuns, parceladas e recorrentes. Adicionar tambem uma acao explicita para descartar somente o rascunho do assistente e continuar a conversa.

## Escopo

### Dentro do escopo

- Preencher `valor` com o mesmo valor calculado de `valor_final` nos tres inserts de despesas.
- Preservar a compatibilidade com o schema e os dados ja existentes em producao.
- Retornar uma mensagem segura e clara em portugues quando uma despesa nao puder ser criada.
- Incluir o comando `Descartar rascunho` no formulario de revisao do assistente.
- Limpar rascunho, anexos desse rascunho e erro sem apagar o historico da conversa.

### Fora do escopo

- Alterar registros financeiros existentes.
- Executar migration, seed ou mudanca de schema.
- Mudar a interpretacao de voz ou o periodo financeiro selecionado.
- Encerrar a conversa ao descartar o rascunho.

## Leitura de Contexto

- `backend/src/routes/expenses.ts` insere uma despesa em `despesas` por SQL parametrizado.
- O commit `4bbb238` documenta que a producao mantem `despesas.valor` como `NOT NULL` e a preenchia na criacao e nas parcelas.
- O commit `bf1b8ee` removeu `valor` dos inserts sem que a coluna legada tivesse sido removida no banco de producao.
- `src/components/financial-assistant/FinancialAssistant.tsx` usa `saveExpense`, a mesma funcao do cadastro convencional; portanto a voz apenas evidencia uma falha geral de criacao.

## Impacto por Area

### Frontend

- Adicionar botao secundario `Descartar rascunho` no card de revisao.
- Ao descartar, manter mensagens e composer disponiveis para o proximo assunto.

### Backend

- Restaurar a coluna `valor` e os parametros correspondentes nos inserts principal, de parcelas futuras e de recorrencias.
- Traduzir o erro generico de criacao para uma mensagem orientada ao usuario, mantendo o detalhe tecnico apenas no log do servidor.

### Banco de Dados

- Nenhuma alteracao. A correcao escreve na coluna legada que ja existe e e obrigatoria em producao.

### Infra/Deploy

- Publicar apos build e testes passarem; o Render recebera a correcao pelo `main`.

## Arquivos Provavelmente Afetados

- `backend/src/routes/expenses.ts`
- `src/components/financial-assistant/FinancialAssistant.tsx`
- `.plans/corrigir-registro-voz-e-descartar-rascunho.md`

## Estrategia de Implementacao

1. Calcular uma unica vez o valor final e usalo tambem em `despesas.valor` no insert principal.
2. Incluir a mesma coluna e valor nos inserts das parcelas futuras e das ocorrencias recorrentes, mantendo a quantidade de placeholders alinhada aos parametros.
3. Manter o log detalhado de erro no backend e devolver uma mensagem segura em portugues para o cliente.
4. Criar um manipulador de descarte que limpe somente o estado do rascunho e focalize o campo de mensagem.
5. Exibir o comando de descarte ao lado da confirmacao, desabilitado enquanto houver salvamento em andamento.

## Seguranca, Dados e Multi-Tenant

- O usuario autenticado continua sendo a origem de `usuario_id` em todas as insercoes.
- Nenhuma query nova deixa de filtrar o usuario.
- Nenhum dado de banco ou detalhe interno sera devolvido no erro ao usuario.

## Validacoes Necessarias

- Despesa simples preenche `valor_original`, `valor_final` e `valor` com o valor confirmado.
- Parcelas futuras e recorrencias tambem recebem `valor`.
- O rascunho criado por voz pode ser descartado e a conversa continua utilizavel.
- Nenhum lancamento e salvo ao descartar.
- Build do frontend, verificacao TypeScript e testes do backend passam.

## Riscos e Pontos de Atencao

- Os inserts SQL usam placeholders posicionais; toda coluna adicionada exige o parametro correspondente.
- A validacao final no Render depende do deploy automatico e de uma tentativa autenticada de cadastro.

## Criterios de Aceite

- Confirmar a despesa `gastei R$ 250 no mercado hoje` nao retorna erro e cria um unico lancamento.
- O usuario pode clicar em `Descartar rascunho` e enviar uma pergunta ou novo registro sem reiniciar a conversa.
- Dados financeiros existentes permanecem inalterados.

## Instrucoes Para /implementar

- Nao criar ou executar migration.
- Nao remover a coluna legada `valor` do banco ou schema de producao.
- Validar cada insert alterado pelo numero de colunas e parametros.
