# Plano de Implementação: Atalho "Segurança" no menu dropdown do header

## Origem

- Arquivo de especificação: nenhum `.md` fornecido — especificação construída interativamente (pedido do usuário + investigação de código + decisões coletadas).
- Data do planejamento: `2026-09-17`
- Classificação: `frontend-only`

## Resumo

Adiciona um item "Segurança" no dropdown do `AccountMenu` (menu suspenso que abre ao clicar no avatar/nome no header), posicionado acima de "Configurações" e "Sair". O item chama `onOpenConfig?.('seguranca')` para abrir o painel de Configurações já na aba de trocar senha — reaproveitando 100% da infraestrutura existente (aba `SecurityTab`, rota `PUT /usuarios/me`, sem restrição de papel), sem criar nada novo além do próprio item de menu.

## Escopo

### Dentro do escopo

- Adicionar item "Segurança" no dropdown de `AccountMenu.tsx`, com ícone `KeyRound`, abrindo `onOpenConfig?.('seguranca')`.
- Posicionar esse item visualmente acima dos blocos existentes de "Configurações" e "Sair".
- Ajustar a navegação por teclado do dropdown para incluir o novo item na sequência de foco.

### Fora do escopo

- Qualquer mudança em `SecurityTab.tsx` (a aba já existe e já funciona para todo usuário logado).
- Qualquer mudança em `ConfigPanel.tsx` (o item `seguranca` já existe em `ITEMS` e não tem guard de role).
- Mover o campo de trocar senha para dentro de `ContaDialog` ou `MeusDadosDialog` — decisão revertida pelo usuário; "Segurança" continua sendo só uma aba de Configurações.
- Qualquer mudança de permissão/autorização no backend — `PUT /usuarios/me` já é seguro e já está disponível a gestor e membro/colaborador.

## Leitura de contexto

- `/AGENT.md` (raiz) e `sistema financas/AGENT.md` — lidos (idênticos).
- Não existem `frontend/AGENT.md`/`backend/AGENT.md` dedicados.
- Arquivos investigados: `src/layout/AccountMenu.tsx`, `src/layout/ConfigPanel.tsx`, `src/layout/AppShell.tsx`, `src/screens/config/SecurityTab.tsx`.

## Impacto por área

### Frontend

- `src/layout/AccountMenu.tsx`:
  - Importar `KeyRound` de `lucide-react` (hoje o import é só `Check, ChevronDown, LogOut, Settings`).
  - Adicionar um novo botão "Segurança" com o mesmo estilo visual dos itens existentes do dropdown (`Configurações`/`Sair`), chamando `() => { setOpen(false); onOpenConfig?.('seguranca'); }`.
  - Posicionar esse botão num bloco (novo ou reaproveitando o bloco de `border-t` existente) imediatamente acima do bloco de "Configurações".
  - Incluir o novo item na lista `menuItems`/`itemRefs` usada pela navegação por teclado (setas, Enter, Espaço), para manter a acessibilidade consistente com os demais itens do menu.
- Sem mudança em query keys, hooks de dados, ou estados de loading/error — é só um item de navegação estático.

### Backend

`Sem impacto esperado` — nenhuma rota nova, nenhuma mudança de autorização.

### Banco de dados

`Sem impacto esperado`.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `src/layout/AccountMenu.tsx`

## Estratégia de implementação

1. Importar `KeyRound` em `AccountMenu.tsx`.
2. Adicionar o botão "Segurança" no JSX do dropdown, acima do bloco de "Configurações", com o mesmo padrão visual (ícone + label, mesma altura/padding/hover dos itens vizinhos).
3. Ligar o `onClick` a `onOpenConfig?.('seguranca')` e fechar o dropdown (`setOpen(false)`).
4. Ajustar `menuItems`/`itemRefs` para que a navegação por teclado (setas, Home/End se existir, Enter/Espaço) inclua o novo item na ordem correta.
5. Validar manualmente: abrir o dropdown, clicar em "Segurança", confirmar que o painel de Configurações abre direto na aba de trocar senha — testar tanto como gestor quanto como membro, se possível.

## Regras de negócio identificadas

- "Segurança" (trocar senha) é acessível a qualquer usuário autenticado, sem distinção de papel (gestor, membro, colaborador) — comportamento já existente, preservado sem alteração.

## Regras multi-tenant e segurança

- Este projeto não é multi-tenant/multi-prefeitura (esse contexto pertence a outro subprojeto do monorepo).
- Nenhuma mudança de autorização é introduzida — o atalho só melhora a navegação até uma tela que já era acessível.

## Validações necessárias

- Confirmar visualmente que o novo item não quebra o layout do dropdown em telas estreitas (mobile).
- Confirmar que a navegação por teclado (Tab/setas) continua funcional com o item extra.

## Testes necessários

### Frontend

- Clicar no atalho "Segurança" abre o painel de Configurações direto na aba correta.
- Navegação por teclado no dropdown inclui o novo item na ordem esperada.

### Backend

Não aplicável — sem mudança de backend.

### E2E

- Fluxo: usuário loga, abre o dropdown do header, clica em "Segurança", altera a senha com sucesso.

## Comandos de validação sugeridos

```bash
npx vite build
```

## Riscos e pontos de atenção

- Risco muito baixo: mudança isolada de UI em um único arquivo, sem alteração de dados, permissões ou rotas.
- Atenção a não quebrar a navegação por teclado existente ao inserir o novo item na lista `menuItems`.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- O dropdown do header mostra um item "Segurança" acima de "Configurações" e "Sair".
- Clicar nele abre o painel de Configurações já na aba de trocar senha.
- Nenhuma regressão nos itens existentes do dropdown (troca de conta, Configurações, Sair) nem na navegação por teclado.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations (não há necessidade).
- Mudança restrita a `src/layout/AccountMenu.tsx` — não tocar em `SecurityTab.tsx` nem `ConfigPanel.tsx`.
- Manter o mesmo padrão visual dos itens existentes do dropdown (não inventar um estilo novo).
