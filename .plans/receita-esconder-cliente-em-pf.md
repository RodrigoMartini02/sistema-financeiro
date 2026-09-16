# Plano de Implementação: esconder "Cliente / fonte" em conta PF

## Origem

- Arquivo de especificação: `.plans/modal-receitas-pf-e-lote.md` (Melhoria 1;
  a Melhoria 2 — lote de receitas — fica para trabalho próprio)
- Data do planejamento: 2026-09-15
- Classificação: `frontend-only`

## Resumo

O modal de receita mostra o campo "Cliente / fonte" mesmo em conta pessoal,
onde não existe cliente. Todos os outros campos de PJ do mesmo modal já são
renderizados condicionalmente — este ficou de fora.

É uma condicional que faltou, não uma decisão de produto: a infraestrutura para
escondê-lo já está no arquivo.

## Escopo

### Dentro do escopo

- Envolver o bloco do campo "Cliente / fonte" em `{isEmpresa && (...)}`,
  incluindo o `datalist`, o aviso "Cliente não cadastrado" e o mini-formulário
  de criar cliente

### Fora do escopo

- Lote de receitas (Melhoria 2 do documento de origem — exige extrair um
  `IncomeForm` de ~960 linhas antes)
- Mudar campos, validações ou o payload da receita
- Mexer no modal de despesa

## Leitura de contexto

- `/AGENT.md` — lido. Descreve um sistema multi-prefeitura com RLS que **não
  corresponde a este projeto**; aplicadas apenas as regras transversais
  (legibilidade, sem `any`, reaproveitar padrões existentes)
- `/CLAUDE.md` — fluxo obrigatório `/planejar → aprovação → /implementar →
  /finalizar`
- `frontend/AGENT.md` — **não existe** neste projeto
- `backend/AGENT.md` — **não existe** neste projeto
- `.plans/modal-receitas-pf-e-lote.md` — documento de origem
- `src/screens/finance/IncomeDialog.tsx` — inspecionado

## Achados da investigação

Quatro fatos que reduzem o risco a quase nada:

| Achado | Onde | Efeito |
|---|---|---|
| `isEmpresa` já calculado, com fallback em `localStorage` | `IncomeDialog.tsx:59` | Nada a derivar |
| `clienteValido` já é `!isEmpresa \|\| ...` | linha 321 | **Em PF já retorna `true`: esconder o campo não trava o botão Salvar** |
| Queries de cliente já são `enabled: open && isEmpresa` | linhas 119, 133 | Em PF a lista nem é buscada — o campo aparecia vazio |
| `cliente` é `z.string().optional()` | linha 33 | Não integra o payload de gravação |

O padrão a seguir já existe no próprio arquivo:

```
linha 592:  {isEmpresa && (tiposReceita.length > 0 || ...)}    ← tipo de receita
linha 656:  {isEmpresa && representantes.length > 0 && (...)}   ← representante
linha 720:  {isNew && isEmpresa && produtosDisponiveis...}      ← produtos
linha 531:  <div>   ← Cliente / fonte, SEM condicional
```

## Impacto por área

### Frontend

- `IncomeDialog.tsx`: bloco das linhas **531–587** passa a renderizar só quando
  `isEmpresa` for verdadeiro
- O bloco inclui, como filhos do mesmo `div`: `<label>`, `<input>` registrado
  em `cliente`, `<datalist>`, o aviso de cliente não cadastrado e o
  mini-formulário de criação
- Sem novos estados, hooks, query keys ou validações
- Loading/error/empty: inalterados — as queries envolvidas já não rodam em PF

### Backend

`Sem impacto esperado.`

### Banco de dados

`Sem impacto esperado.`

Atenção: migrations não devem ser executadas sem confirmação explícita do
usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado.`

## Arquivos provavelmente afetados

- `src/screens/finance/IncomeDialog.tsx` — único arquivo

## Estratégia de implementação

1. Envolver o bloco das linhas 531–587 em `{isEmpresa && (...)}`, mantendo
   `datalist`, aviso e mini-formulário dentro dele
2. Rodar `tsc --noEmit` — é o que pega erro de fecho de JSX
3. Rodar `vite build`
4. Conferir na tela: em PF o campo some e o salvamento funciona; em PJ nada
   muda

## Regras de negócio identificadas

- Conta pessoal não tem cliente: o campo não faz sentido ali
- Conta empresa mantém o campo com o comportamento atual, inclusive a
  validação de cliente cadastrado e o atalho de criação
- O tipo da conta vem de `contaSelecionada.tipo`, com fallback em
  `localStorage.getItem('contaAtivaTipo')` — mesmo critério do modal de despesa

## Regras multi-tenant e segurança

Projeto **não é multi-tenant**: nenhuma ocorrência de `tenant`/`prefeitura` no
backend, sem RLS. O isolamento relevante é por usuário/conta.

Nesta alteração não há impacto de autorização: o campo é de interface, o dado é
opcional no schema e não entra no payload. Esconder a entrada não afeta o que o
backend aceita — a régua de gravação continua igual.

## Validações necessárias

Nenhuma nova.

`clienteValido` (linha 321) já contempla PF na primeira cláusula, então o botão
Salvar não é bloqueado por um campo invisível. Isso foi verificado, não
assumido.

## Testes necessários

### Frontend

- Não aplicável: o projeto não tem runner de testes no frontend. Garantia por
  `tsc --noEmit`, `vite build` e verificação na tela

### Backend

- Nenhum teste novo. Os 151 existentes devem continuar passando, já que o
  backend não é tocado

### E2E

- Não aplicável: não há suíte E2E. Verificação manual:
  - **PF:** abrir o modal de receita, confirmar que "Cliente / fonte" não
    aparece, salvar uma receita
  - **PJ:** confirmar que o campo continua presente, com autocompletar e o
    atalho "+ Cadastrar"

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm run build

npm --prefix backend run build
npm --prefix backend test
```

## Riscos e pontos de atenção

1. **Fecho de JSX:** o bloco tem 57 linhas com aninhamento. Errar o fecho
   quebra o build — o `tsc` pega imediatamente, então o risco é de retrabalho,
   não de defeito silencioso
2. **Troca de conta com o modal aberto:** de PF para PJ, o campo aparece vazio.
   Comportamento correto e idêntico ao dos outros campos condicionais do mesmo
   modal
3. **Receita já gravada com cliente, aberta em PF:** o valor continua no
   rascunho mas sem campo visível para editá-lo. Cenário improvável (a receita
   pertence à conta em que foi criada), e o mesmo já vale hoje para tipo de
   receita e representante

## Perguntas em aberto

`Nenhuma pergunta em aberto identificada.`

A única dúvida real do documento de origem — se a validação travaria o submit
em PF — foi respondida pela investigação: `clienteValido` já retorna `true`
quando `isEmpresa` é falso.

## Critérios de aceite do plano

- Em conta PF, o campo "Cliente / fonte" não aparece no modal de receita
- Em conta PF, salvar uma receita continua funcionando
- Em conta PJ, o campo continua presente, com autocompletar e atalho de
  cadastro
- O `datalist`, o aviso e o mini-formulário de criar cliente somem junto em PF
- `tsc --noEmit` (frontend e backend), `npm test` e `npm run build` passam
- Nenhuma migration executada

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto
- Alteração pequena e focada: um bloco JSX, um arquivo
- Não implementar a Melhoria 2 (lote), que está fora do escopo
- Não executar migrations (não há nenhuma nesta feature)
- Seguir `/AGENT.md` nas regras transversais; `frontend/AGENT.md` e
  `backend/AGENT.md` não existem neste projeto
- Este projeto vai direto para `main`, sem staging nem PR
