# Plano de Implementação: Alinhar escala visual dos modais do app — Fase 3

## Origem

- Arquivo de especificação: `.portal/tasks/Readequacao visual da tela de Configuracoes com base em mockup.md`
- Planos anteriores: `.plans/readequacao-visual-configuracoes-fase-1.md` (commit `96d551d`), `.plans/readequacao-visual-configuracoes-fase-2.md` (commit `08eedaf`)
- Mockup de referência: `Configuracoes Compacto.html`
- Data do planejamento: `2026-09-05`
- Branch atual: `refactor/R/padronizar-modal-configuracoes`
- Classificação: `frontend-only`

## Resumo

Alinhar `src/ui/dialogFormTokens.tsx` (tokens `C`) à escala compacta do mockup, propagando a mudança para os **21 arquivos** que o consomem — ou seja, todos os modais do app, não apenas os de Configurações. Corrigir também o header/footer do `Dialog` genérico, eliminar a duplicação do botão "Salvar" (repetido inline 23 vezes) e fechar as 3 lacunas de componentes auxiliares identificadas na revisão.

## Motivação — o que a revisão visual revelou

As Fases 1 e 2 readequaram as **telas** de Configurações (sidebar, listas, cabeçalhos) usando os tokens novos `CFG` (`configTokens.ts`), mas deixaram os **modais** intactos, porque a auditoria de então perguntava "usa os tokens `C`?" — e como usavam, foram dados como padronizados.

A revisão visual pelo usuário (via `/run`) mostrou o erro desse critério: os modais usam os tokens `C`, mas **os tokens `C` definem uma escala visual diferente da do mockup**. O resultado é um app com dois sistemas convivendo:

| | Tokens `C` (modais) | Tokens `CFG` (telas de Config) |
|---|---|---|
| Altura de campo | 40px | 32px |
| Fonte de campo | 14px | 13px |
| Label | 10.5px, uppercase, letter-spacing | 11px, sentence case |
| Card | radius 14, fundo `#fbfdfe` | radius 12, fundo branco |
| Botão | retangular (`padding 12px 22px`, radius 11) | pill (`height 30`, radius 999) |
| Título do modal | 19px | 13.5px |

Portanto o problema não é "faltou editar 11 modais", e sim que a fonte de estilo dos modais está numa escala antiga. Corrigi-la no arquivo de tokens resolve todos de uma vez.

## Descobertas da investigação

1. **`dialogFormTokens.tsx` é o ponto único de todos os modais** — confirmado: 21 arquivos o importam. A hipótese do usuário ("é um componente para todos os modais") está correta.

2. **Não é possível limitar a mudança a Despesas/Receitas.** Os 10 consumidores fora de Configurações compartilham o mesmo arquivo: `ExpenseDialog`, `IncomeDialog`, `PaymentModal`, `BatchPaymentModal`, `AppointmentDialog`, `ReservaDialog`, `DeleteInstallmentDialog`, `ConfirmDialog`, `CategoryFloatingSelect`, `PlanosScreen`. Daí a decisão 1.

3. **O botão "Salvar" está duplicado inline 23 vezes** em 16 arquivos, com o bloco `padding: '12px 22px', borderRadius: 11, fontSize: 14, fontWeight: 700...` copiado. Mesma classe de duplicação que a Fase 2 resolveu com `ConfigTabHeader` — aqui pede um estilo exportado dos tokens.

4. **`MoneyField` tem 54px de altura e fonte 26px**, deliberadamente grande por ser o campo principal de Despesas/Receitas/Reservas/Pagamento. Não pode ser compactado na mesma proporção dos demais sem perder o destaque — daí a decisão 2.

## Decisões aplicadas

- **Decisão 1 — Alcance:** app inteiro. Os 21 consumidores de `dialogFormTokens` adotam a escala compacta. Descartada a alternativa de criar um segundo conjunto de tokens e migrar seletivamente, que deixaria modais irmãos divergentes (ex.: "Nova despesa" compacta vs. "Pagar despesa" antiga).
- **Decisão 2 — `MoneyField`:** compactar proporcionalmente (≈44px de altura, fonte ≈20px), mantendo-o maior que os demais campos (32px) mas sem dominar tanto o modal.
- **Decisão 3 — Validação:** entrega fechada. Altero os tokens e já corrijo modal a modal o que julgar quebrado; o usuário revisa o resultado final via `/run`.

## Escopo

### Dentro do escopo

1. Reescrever `src/ui/dialogFormTokens.tsx` na escala compacta, preservando a API pública (nomes de exports) para não quebrar os 21 consumidores.
2. Exportar `saveButtonStyle` e `dangerButtonStyle` dos tokens, eliminando a duplicação inline.
3. Ajustar `src/ui/dialog.tsx`: título 13.5px, espaçamentos de header/footer compactos.
4. Substituir as 23 ocorrências do botão "Salvar" inline pelo estilo exportado.
5. Revisar e corrigir os 11 modais de Configurações após a propagação.
6. Revisar e corrigir os 10 consumidores fora de Configurações.
7. Fechar as 3 lacunas pendentes da revisão:
   - `CategoryPreview` (`ContasTab.tsx`) — card verde do enquadramento no cadastro PJ, ainda em Tailwind
   - `AvatarUploadDialog` (`src/components/`) — upload de logo da conta
   - `ProdutoImagensManager` (`src/components/`) — imagens no modal de produto
8. Alinhar os cards de plano de `PlanosScreen` (visível como divergente no print do usuário).

### Fora do escopo

- Backend, banco de dados, migrations, `.env`, CI/CD
- Qualquer alteração de lógica: queries, mutations, validações, autorização
- `ClientesTab` — tela própria do app (`App.tsx`, rota `clientes`), não faz parte de Configurações; será afetada apenas por herança dos tokens
- `ClienteDetail`/`ContratoModal` — tem tasks e planos próprios em `.portal/`; afetado apenas por herança
- Componente `Button` (`src/ui/button.tsx`) — não é usado nos footers de modal (que usam botão inline), e alterá-lo atingiria 20 arquivos de telas, não de modais

## Leitura de contexto

- `/AGENT.md` (raiz do monorepo) — existe
- `sistema financas/AGENT.md` — existe. Descreve backend multi-tenant herdado de outro projeto; **não se aplica** a esta task frontend-only.
- `sistema financas/CLAUDE.md` — regras de workflow obrigatório
- `frontend/AGENT.md` — **não existe** neste projeto
- `backend/AGENT.md` — **não existe** (há pasta `backend/`, sem AGENT.md próprio)
- Planos das Fases 1 e 2, task original
- Prints da revisão visual do usuário (modal "Editar conta", aba Assinatura, toggle de contas)

Arquivos inspecionados: `dialogFormTokens.tsx`, `dialog.tsx`, `configTokens.ts`, os 21 consumidores dos tokens, `form.tsx`, `button.tsx`, `AvatarUploadDialog.tsx`, `ProdutoImagensManager.tsx`.

## Impacto por área

### Frontend

**`dialogFormTokens.tsx` — a mudança central**

Nova escala, preservando todos os nomes de export:

| Token | Atual | Novo |
|---|---|---|
| `fieldInputStyle` | height 40, fontSize 14, radius 10, border 1.5px | height 32, fontSize 13, radius 10, border 1px |
| `smallInputStyle` | height 40, width 168 | height 32 |
| `numericInputStyle` | height 40, width 76 | height 32 |
| `labelStyle` | 10.5px, 700, uppercase, letter-spacing .09em | 11px, 600, sentence case, sem letter-spacing |
| `cardStyle` | radius 14, padding 13/14, fundo `C.cardBg` | radius 12, padding ~12, fundo branco |
| `chipStyle` | height 42 | height 32 |
| `MoneyField` / `MoneyFieldSmall` | height 54, fontSize 26 | height 44, fontSize 20 |
| `valuesInlineFieldStyle` | height 38 | height 32 |
| **novo** `saveButtonStyle` | — | pill: height 30, radius 999, fontSize 12.5 |
| **novo** `dangerButtonStyle` | — | pill outline vermelho |

A paleta `C` (cores) permanece — o que muda é dimensão, peso e forma. As cores já coincidem com o mockup (`primary: #0891b2`).

**`dialog.tsx`**

- Título: 19px → 13.5px; description 13px → 11.5px
- Header: `pt-[22px] pb-[18px]` → compacto (~12px)
- Footer dos modais: `padding: '14px 26px 16px'` → ~10px/14px

**Modais de Configurações (11)**

`ContaDialog`, `CategoriaDialog`, `CartaoDialog`, `UsuarioDialog`, `ProdutoDialog`, `NovoMembroDialog`, `PermissoesDialog`, `TransferirPendenciasDialog`, `SocioDialog`, `RepresentanteDialog`, `ServicoDialog`.

Herdam a escala automaticamente; a revisão corrige o que não couber (ex.: grids de 2 colunas que ficaram apertados, botões "Arquivar"/"Excluir" que devem virar outline).

**Consumidores fora de Configurações (10)**

`ExpenseDialog`, `IncomeDialog`, `PaymentModal`, `BatchPaymentModal`, `AppointmentDialog`, `ReservaDialog`, `DeleteInstallmentDialog`, `ConfirmDialog`, `CategoryFloatingSelect`, `PlanosScreen`.

Atenção especial a `ExpenseDialog` (o mais longo — risco de densidade excessiva) e `ConfirmDialog` (global, usado em fluxos destrutivos — precisa continuar legível).

**Componentes auxiliares (3 lacunas)**

`CategoryPreview`, `AvatarUploadDialog`, `ProdutoImagensManager` — hoje em Tailwind, sem tokens. Nenhum é usado fora de Configurações.

### Backend

`Sem impacto esperado`

### Banco de dados

`Sem impacto esperado`

> **Atenção:** migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`

## Arquivos provavelmente afetados

### Base (propaga para todos)

- `src/ui/dialogFormTokens.tsx`
- `src/ui/dialog.tsx`

### Configurações (11 modais em 10 arquivos)

- `src/screens/config/ContasTab.tsx`, `CategoriasTab.tsx`, `CartaoTab.tsx`, `UsuariosTab.tsx`, `CatalogoTab.tsx`, `MembrosTab.tsx`, `SociosTab.tsx`, `RepresentantesTab.tsx`, `ServicosTab.tsx`

### Fora de Configurações

- `src/screens/finance/ExpenseDialog.tsx`, `IncomeDialog.tsx`, `PaymentModal.tsx`, `BatchPaymentModal.tsx`, `AppointmentDialog.tsx`
- `src/screens/reservas/ReservaDialog.tsx`
- `src/screens/despesas/DeleteInstallmentDialog.tsx`
- `src/ui/ConfirmDialog.tsx`, `src/ui/CategoryFloatingSelect.tsx`
- `src/screens/planos/PlanosScreen.tsx`

### Componentes auxiliares

- `src/components/AvatarUploadDialog.tsx`
- `src/components/ProdutoImagensManager.tsx`

### Herança apenas (não editados diretamente)

- `src/screens/config/ClientesTab.tsx`, `ClienteDetail.tsx`

## Estratégia de implementação

Em **cada arquivo**, aplicar a regra de redesign do projeto: **remover o estilo antigo primeiro, depois aplicar o novo**, como sub-passos distintos.

1. Reescrever `dialogFormTokens.tsx` na escala nova, preservando os nomes de export, e adicionar `saveButtonStyle` / `dangerButtonStyle`.
2. Ajustar `dialog.tsx` (título, header, espaçamentos), preservando a API (`size`, `scrollBody`, `description`) e as classes `dark:`.
3. **Checkpoint de build** — os 21 consumidores herdam a escala automaticamente. Confirmar que nada quebrou antes de seguir.
4. Substituir as 23 ocorrências do botão "Salvar" inline por `saveButtonStyle`; botões destrutivos ("Arquivar", "Excluir", "Desativar", "Remover") por `dangerButtonStyle`.
5. Varrer os 11 modais de Configurações, corrigindo o que a propagação não resolveu.
6. Varrer os 10 consumidores fora de Configurações, com atenção a `ExpenseDialog` (densidade) e `ConfirmDialog` (legibilidade).
7. Corrigir as 3 lacunas: `CategoryPreview`, `AvatarUploadDialog`, `ProdutoImagensManager`.
8. Alinhar os cards de plano de `PlanosScreen`.
9. `npm run build` final e relato honesto do resultado.

## Regras de negócio identificadas

Task de apresentação; as regras abaixo já existem e **devem ser preservadas sem alteração**:

- Validações de formulário: `required`, `type="email"`, `maxLength` de CPF/CNPJ, formato de validade de cartão, força de senha
- `ConfirmDialog` é usado em fluxos destrutivos (arquivar conta, excluir cartão/representante, desativar categoria/membro) — o comportamento de confirmação não muda
- `MoneyField` converte para centavos via `digitsOnly`; a lógica de conversão não muda, apenas a dimensão
- Visibilidade condicional de abas e permissões permanece intacta

## Regras multi-tenant e segurança

**Este projeto não é multi-tenant** no sentido de organizações isoladas — é uso pessoal, com o conceito de conta/perfil (PF vs PJ). O `AGENT.md` do subprojeto descreve um cenário multi-prefeitura herdado de outro projeto que não se aplica.

Cuidados desta fase:

- Nenhuma lógica de autorização, query ou validação pode ser alterada — apenas dimensão, peso e forma dos elementos visuais
- `ConfirmDialog` protege ações destrutivas: sua legibilidade e a distinção visual do botão de confirmação são requisito, não detalhe estético
- Sem exposição de dados novos

## Validações necessárias

Nenhuma validação de input, schema ou payload é alterada.

## Testes necessários

Sem infraestrutura de testes automatizados no projeto — validação manual via `/run`.

### Frontend (manual, via `/run`)

**Em tema claro e escuro.**

**Configurações:** abrir e salvar cada um dos 11 modais (criar e editar), conferindo campos, labels, cards, footer e botões destrutivos.

**Fora de Configurações (crítico — telas de uso diário):**
- Nova despesa / editar despesa (`ExpenseDialog`) — o mais longo, maior risco de densidade
- Nova receita / editar receita (`IncomeDialog`)
- Pagar (`PaymentModal`) e pagamento em lote (`BatchPaymentModal`)
- Compromisso (`AppointmentDialog`), Reserva (`ReservaDialog`)
- Excluir parcela (`DeleteInstallmentDialog`)
- **`ConfirmDialog`** — disparar por qualquer ação destrutiva; deve continuar legível e com a ação de confirmação clara
- Seletor de categoria (`CategoryFloatingSelect`)
- Contrato de cliente (`ClienteDetail`) — herda os tokens

**Campo de valor (R$):** conferir se em 44px/20px continua sendo o elemento dominante de Despesas/Receitas.

### Backend / E2E

`Não aplicável`

## Comandos de validação sugeridos

```bash
npm run build
```

Não há `lint` nem `typecheck` configurados no `package.json` (apenas `dev`, `build`, `preview`).

## Riscos e pontos de atenção

| Risco | Mitigação |
|---|---|
| **21 arquivos afetados de uma vez** (decisão 1) | Checkpoint de build na etapa 3; varredura separada por área nas etapas 5-6 |
| **Telas de uso diário afetadas** (Despesas, Receitas, Pagamentos) | Revisão dedicada na etapa 6; são o foco da validação |
| `MoneyField` perder destaque | Mantido proporcionalmente maior (44px vs 32px dos demais) — decisão 2 |
| `ConfirmDialog` global em fluxos destrutivos | Legibilidade tratada como requisito de segurança, não estético |
| `ExpenseDialog` ficar denso demais (é o modal mais longo) | Item explícito da revisão da etapa 6 |
| **Densidade visual é julgamento subjetivo** | Build passar não valida aparência; ajustes pós-revisão são esperados |
| Usuário só vê o resultado no fim (decisão 3) | Custo aceito conscientemente |
| Regressão em `ClienteDetail` (herda tokens, tem plano próprio) | Validar sem editar; reportar se divergir |

## Perguntas em aberto

`Nenhuma pergunta em aberto identificada.`

As três decisões pendentes foram respondidas antes de salvar este plano.

## Critérios de aceite do plano

A implementação está pronta quando:

- `dialogFormTokens.tsx` define a escala compacta e todos os 21 consumidores a herdaram
- Os 11 modais de Configurações estão visualmente coerentes com as telas readequadas nas Fases 1 e 2
- Os modais fora de Configurações (Despesas, Receitas, Pagamentos, Reservas, Compromisso, Confirmação) seguem a mesma escala
- O botão "Salvar" não está mais duplicado inline: as 23 ocorrências usam o estilo exportado
- Botões destrutivos são outline, não vermelho sólido
- `MoneyField` continua sendo o elemento dominante nos modais de lançamento
- `ConfirmDialog` permanece legível, com a ação de confirmação clara
- As 3 lacunas (`CategoryPreview`, `AvatarUploadDialog`, `ProdutoImagensManager`) foram fechadas
- Cards de plano de `PlanosScreen` alinhados
- Dark mode funcional em tudo que foi tocado
- Nenhuma alteração de lógica, query, validação ou autorização
- `npm run build` conclui sem erros

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto, junto com a task e os planos das Fases 1 e 2.
- Seguir `/AGENT.md` (raiz). `sistema financas/AGENT.md` descreve cenário backend multi-tenant que **não se aplica**.
- **Regra remove-then-apply**: em cada arquivo, remover o estilo antigo como um passo e aplicar o novo como outro.
- **Preservar os nomes de export de `dialogFormTokens.tsx`** — 21 arquivos dependem deles. Mudar a API quebraria todos.
- **Não alterar** lógica, queries, mutations, validações ou autorização.
- **Não alterar** `src/ui/button.tsx` (fora do escopo).
- Preservar todos os `useFirstAccessGuide`/`FirstAccessGuideCard`.
- Fazer o checkpoint de build da etapa 3 antes de seguir para as varreduras.
- Tratar `ConfirmDialog` com cuidado extra: é global e protege ações destrutivas.
- Ao final, rodar `npm run build` e **reportar honestamente**, deixando claro que build passando não equivale a validação visual — especialmente nesta fase, que toca telas de uso diário.
