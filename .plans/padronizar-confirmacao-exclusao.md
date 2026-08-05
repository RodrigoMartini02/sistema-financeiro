# Plano de Implementação: Padronizar confirmação de exclusão

## Origem

- Arquivo de especificação: nenhum (escopo definido interativamente a partir do relatório de auditoria desta conversa)
- Data do planejamento: 2026-08-05
- Classificação: `frontend-only`

## Resumo

O sistema financas usa hoje 4 padrões diferentes para confirmar ações destrutivas/impactantes (exclusão, arquivamento, reabertura, cancelamento): um bloco JSX "Confirmar? Sim/Não" copiado literalmente em 6 arquivos, `window.confirm()` nativo do navegador em 7 arquivos (10 pontos), nenhuma confirmação em 1 arquivo, e um checkbox dedicado em 1 fluxo crítico de pagamento. Isso gera inconsistência visual (o `confirm()` nativo quebra a identidade do produto) e duplicação de código (~350-400 linhas repetidas). Este plano cria um único mecanismo de confirmação (`useConfirm()` + `ConfirmDialog`) e migra os padrões A, B e C para ele, deixando o padrão D (checkbox de cancelamento de assinatura) intocado por ser uma UI própria já adequada a uma ação financeira crítica.

## Escopo

### Dentro do escopo

- Criar `ConfirmDialog` (componente visual, usando o `Dialog` base existente) em `src/ui/`.
- Criar `useConfirm()` (hook com API baseada em Promise) + `ConfirmProvider` (contexto/portal montado uma vez na raiz do app) para permitir `if (await confirm({ title, message, confirmLabel, variant })) { ... }`.
- Migrar os 6 arquivos do **Padrão A** (two-step inline duplicado): `ClientesTab.tsx`, `PerfisTab.tsx`, `RepresentantesTab.tsx`, `SociosTab.tsx`, `ServicosTab.tsx`, `UsuariosTab.tsx` — removendo o estado `confirmDelete` e o JSX duplicado de cada um.
- Migrar os 7 arquivos do **Padrão B** (`window.confirm()` nativo, 10 pontos): `CartaoTab.tsx`, `ClienteDetail.tsx` (2 pontos), `DespesasScreen.tsx` (2 pontos), `MesesScreen.tsx` (2 pontos), `ReceitasScreen.tsx` (2 pontos), `ReservasScreen.tsx`.
- Adicionar confirmação ao **Padrão C**: `CategoriasTab.tsx` (toggle ativar/desativar hoje sem nenhum aviso).
- Manter o rótulo do botão de confirmação específico por ação (ex.: "Excluir", "Arquivar", "Reabrir", "Mover para o próximo mês", "Cancelar despesa", "Confirmar recebimento", "Encerrar contrato", "Desativar categoria"), preservando a linguagem/wording já usada em cada tela hoje.

### Fora do escopo

- `PlanosScreen.tsx` `CancelarDialog` (Padrão D) — mantido como está; é uma UI própria com checkbox + preview de reembolso, adequada à criticidade de cancelamento de assinatura paga.
- Qualquer alteração visual em modais que não sejam de confirmação (não mexe no `ExpenseDialog`, `IncomeDialog`, `ReservaDialog`, `LoginModal`, `TermosModal`, etc.).
- Qualquer mudança no `Dialog` base além do necessário para o `ConfirmDialog` reaproveitá-lo (não vai virar uma refatoração geral do design system).
- Backend: nenhuma rota, controller ou mutation muda de nome/assinatura — só a camada de UI que dispara a mutation muda.
- Correções de outros achados da auditoria não relacionados a confirmação (ex.: `ExpensePanel`/`IncomePanel` mortos, formatação de moeda duplicada, código morto do backend) — ficam para rodadas futuras.

## Leitura de contexto

- `/AGENT.md` — regras globais de multi-tenant/backend (não aplicável diretamente, mudança é frontend-only, mas confirma que toda validação de tenant já ocorre no backend e não é afetada aqui)
- `sistema financas/AGENT.md` — idêntico ao AGENT.md raiz
- `CLAUDE.md` (raiz e do projeto) — regra de fluxo `/planejar → aprovação → /implementar → /finalizar`
- `sistema financas/src/ui/dialog.tsx` — componente `Dialog` base a ser reaproveitado
- `sistema financas/src/ui/button.tsx` — variantes de botão (`danger`, `ghost`) já usadas nos blocos de confirmação atuais
- `sistema financas/src/screens/config/ClientesTab.tsx`, `SociosTab.tsx`, `PerfisTab.tsx`, `CategoriasTab.tsx` — lidos por completo para confirmar o padrão exato do bloco duplicado e das variações (label "Arquivar", condição `isMaster`, toggle sem confirmação)
- Grep completo de `confirm(` em `src/` — 10 ocorrências confirmadas em 7 arquivos (lista exata na seção de arquivos afetados)

## Impacto por área

### Frontend

- **Novo componente** `src/ui/ConfirmDialog.tsx`: recebe `open`, `title`, `message` (string ou ReactNode, para casos como o aviso de duplicata que já usa HTML), `confirmLabel`, `cancelLabel` (padrão "Cancelar"), `variant` (`danger` | `default`), `onConfirm`, `onCancel`. Usa o `Dialog` base (`size="md"` ou menor) para herdar overlay/ESC/backdrop de graça.
- **Novo hook** `src/hooks/useConfirm.ts` + **novo contexto** `src/context/ConfirmContext.tsx` (ou dentro do próprio hook, a definir na implementação): expõe uma função `confirm(options): Promise<boolean>` que monta o `ConfirmDialog` via portal/estado global e resolve `true`/`false` conforme a escolha do usuário. Precisa ser inicializado uma vez perto da raiz do app (provavelmente em `App.tsx`, ao lado de outros providers já existentes como o `AppContext`).
- **Padrão A (6 arquivos)**: remover `const [confirmDelete, setConfirmDelete] = useState(false)`, o `useEffect` de reset, e o bloco JSX de 16 linhas; substituir o botão "Excluir"/"Arquivar" por um único botão que chama `await confirm({...})` e, se confirmado, dispara a mutation existente (`deleteMut.mutate(...)`) — a mutation em si não muda.
- **Padrão B (7 arquivos, 10 pontos)**: substituir `if (confirm('...')) { mutate() }` por `if (await confirm({ title: '...', message: '...' })) { mutate() }` — troca direta, preservando as mensagens de texto atuais.
- **Padrão C (`CategoriasTab.tsx`)**: envolver o `onToggle` existente com uma chamada a `confirm()` antes de executar, com mensagem adequada ("Desativar esta categoria?"/"Ativar esta categoria?").
- Estados de loading/erro das mutations (`isPending`, `error?.message`) continuam exatamente como estão — o `ConfirmDialog` só decide *se* a mutation dispara, não como ela se comporta.
- Sem impacto em query keys, services ou hooks de dados existentes.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

**Novos:**
- `sistema financas/src/ui/ConfirmDialog.tsx`
- `sistema financas/src/hooks/useConfirm.ts` (ou `src/context/ConfirmContext.tsx`, conforme decisão de implementação)

**Editados — Padrão A:**
- `sistema financas/src/screens/config/ClientesTab.tsx`
- `sistema financas/src/screens/config/PerfisTab.tsx`
- `sistema financas/src/screens/config/RepresentantesTab.tsx`
- `sistema financas/src/screens/config/SociosTab.tsx`
- `sistema financas/src/screens/config/ServicosTab.tsx`
- `sistema financas/src/screens/config/UsuariosTab.tsx`

**Editados — Padrão B:**
- `sistema financas/src/screens/config/CartaoTab.tsx`
- `sistema financas/src/screens/config/ClienteDetail.tsx`
- `sistema financas/src/screens/despesas/DespesasScreen.tsx`
- `sistema financas/src/screens/meses/MesesScreen.tsx`
- `sistema financas/src/screens/receitas/ReceitasScreen.tsx`
- `sistema financas/src/screens/reservas/ReservasScreen.tsx`

**Editados — Padrão C:**
- `sistema financas/src/screens/config/CategoriasTab.tsx`

**Possivelmente editado:**
- `sistema financas/src/App.tsx` (para montar o `ConfirmProvider`/portal do hook na raiz do app)

## Estratégia de implementação

1. Criar `ConfirmDialog.tsx` em `src/ui/`, reaproveitando `Dialog` (size pequeno) + `Button` (variantes `danger`/`ghost`/`secondary` conforme o caso), replicando visualmente o padrão já usado no Padrão A (título + mensagem + botões Sim/Não ou Cancelar/Confirmar).
2. Criar o hook `useConfirm()` com o Provider/contexto que o expõe, montado uma vez em `App.tsx`.
3. Migrar primeiro **um** arquivo do Padrão A (sugestão: `SociosTab.tsx`, o mais simples) como prova de conceito, validar visualmente no browser.
4. Migrar os 5 arquivos restantes do Padrão A.
5. Migrar os 7 arquivos do Padrão B (10 pontos de `confirm(`).
6. Adicionar confirmação ao Padrão C (`CategoriasTab.tsx`).
7. Rodar typecheck/build do frontend.
8. Testar manualmente no browser (dev server) os fluxos críticos: excluir cliente, excluir sócio, arquivar perfil, excluir usuário (com `isMaster`), excluir cartão, desvincular serviço de contrato, encerrar contrato, mover/cancelar despesa, reabrir/fechar mês, confirmar recebimento/cancelar receita, excluir reserva, ativar/desativar categoria.

## Regras de negócio identificadas

- O padrão de exclusão em `PerfisTab` é na verdade um **arquivamento** (soft-delete), não uma exclusão permanente — o rótulo "Arquivar" deve ser preservado no novo componente, não trocado por "Excluir".
- Em `UsuariosTab`, a exclusão só é visível/permitida quando `isMaster` é verdadeiro — essa regra de visibilidade condicional do botão continua sendo responsabilidade do componente pai (`UsuariosTab`), não do `ConfirmDialog`.
- Em `CategoriasTab`, a ação é um toggle reversível (ativar/desativar), não uma exclusão — a mensagem de confirmação deve refletir isso claramente, evitando linguagem de "excluir" para uma ação que não apaga dados.

## Regras multi-tenant e segurança

Sem impacto: nenhuma mutation, rota ou lógica de autorização muda. O `ConfirmDialog`/`useConfirm()` atua puramente como uma camada de UI antes de disparar as mesmas chamadas de mutation já existentes e já protegidas no backend.

## Validações necessárias

- Nenhuma validação de schema nova — este plano não introduz nenhum formulário novo, apenas confirmação de ações já existentes.
- Validar manualmente que cada migração preserva o texto exato das mensagens de confirmação atuais (ex.: `` `Excluir cartão "${c.nome}"?` ``, `` `Mover "${item.descricao}" para o próximo mês?` ``), já que essas strings hoje interpolam dados dinâmicos.

## Testes necessários

### Frontend

- Verificar manualmente (dev server) que cada um dos 14 pontos de confirmação abre o novo `ConfirmDialog`, exibe a mensagem correta, e que "Cancelar"/"Não" fecha sem disparar a mutation.
- Verificar que "Confirmar"/"Sim" dispara a mutation correta e produz o mesmo resultado de antes (invalidação de query, fechamento de dialog pai quando aplicável).
- Verificar que ESC e clique fora do `ConfirmDialog` também cancelam a ação (herdado do `Dialog` base).
- Verificar que o botão de confirmação reflete o estado de loading da mutation (`disabled` durante `isPending`) nos casos em que isso já existia.

### Backend

Sem impacto — nenhum teste de backend necessário.

### E2E

Não há suíte E2E automatizada identificada no projeto; validação manual cobre este escopo.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run lint
npm --prefix "sistema financas" run build
```

(Confirmar nomes exatos dos scripts no `package.json` do frontend antes de rodar — não foram lidos ainda nesta etapa de planejamento.)

## Riscos e pontos de atenção

- **Provider global novo**: montar o `ConfirmProvider` na raiz do app (`App.tsx`) é uma mudança estrutural pequena, mas toca um arquivo compartilhado por toda a aplicação — precisa ser feita com cuidado para não quebrar outros providers já montados ali (`AppContext`, roteamento, etc.).
- **Perda de nuance de mensagem**: ao migrar os 10 pontos do Padrão B, é preciso preservar exatamente a interpolação de dados dinâmicos em cada mensagem (nome do cliente, descrição da despesa, mês/ano) — risco de erro de copy-paste ao migrar 10 pontos manualmente.
- **`UsuariosTab` tem lógica condicional (`isMaster`)** que precisa continuar funcionando após a migração — não pode se perder na troca do bloco JSX.
- **Regressão visual**: como o novo `ConfirmDialog` substitui o `window.confirm()` nativo (que é bloqueante/síncrono) por um modal assíncrono, o comportamento de "clique e already resolvido" muda para "abre modal, aguarda escolha" — isso é a mudança desejada, mas qualquer código que dependia do bloqueio síncrono do `confirm()` nativo (nenhum identificado até agora) precisaria ser revisto durante a implementação.
- **`PerfisTab` usa "Arquivar"** em vez de "Excluir" — atenção para não uniformizar incorretamente o texto ao migrar.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — as 3 decisões de arquitetura, escopo e rótulo foram resolvidas nas perguntas anteriores.

## Critérios de aceite do plano

- Os 6 arquivos do Padrão A não têm mais estado `confirmDelete` local nem o bloco JSX duplicado — todos usam `useConfirm()`.
- Os 10 pontos de `window.confirm()` nativo (Padrão B) foram substituídos por chamadas a `useConfirm()`.
- `CategoriasTab.tsx` (Padrão C) passa a exibir confirmação antes de ativar/desativar uma categoria.
- `PlanosScreen.tsx` (Padrão D) permanece inalterado.
- O build do frontend (`npm run build` ou equivalente) passa sem erros de tipo.
- Testes manuais dos 14 pontos de confirmação confirmam que a mutation correta ainda dispara ao confirmar, e nada dispara ao cancelar.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations (não há nenhuma nesta mudança).
- Seguir o padrão visual já existente do bloco "Confirmar? Sim/Não" atual como base de estilo do `ConfirmDialog` (não inventar um visual novo não solicitado).
- Preservar literalmente o texto de cada mensagem de confirmação já existente ao migrar — não reescrever copy.
- Preservar o rótulo específico de cada ação ("Arquivar" em PerfisTab, "Mover"/"Cancelar" em DespesasScreen, etc.) — não uniformizar para um texto genérico.
- Manter alterações pequenas e focadas: um arquivo por vez, com possibilidade de parar após o primeiro arquivo (Padrão A) para validação visual antes de prosseguir com os demais.
- Confirmar comandos de lint/build exatos no `package.json` antes de rodá-los.
