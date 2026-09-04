# Plano de Implementação: Readequação Membros/Colaboradores por tipo de conta

## Origem

- Arquivo de especificação: nenhum `.md` de feature — pedido direto do usuário em conversa, após questionamento sobre a existência simultânea das abas "Usuários" (backoffice do admin) e "Membros" (gestor).
- Data do planejamento: 2026-09-04
- Classificação: `frontend-only`

## Resumo

Hoje o gestor de uma conta vê sempre a aba "Membros" (`MembrosTab.tsx`), independente do tipo de conta (`pessoal` ou `empresa`). O usuário identificou que o rótulo genérico "Membros" não comunica bem o contexto de uso: numa conta pessoal (PF) faz sentido falar em "Membros da família" (esposa, filhos); numa conta empresarial (PJ) faz mais sentido falar em "Colaboradores" (equipe/funcionários).

Este plano introduz um rótulo condicional (ícone, título do item de menu, título dos dialogs internos, mensagens de confirmação e empty state) baseado no `contaTipo` da conta ativa (`'pessoal' | 'empresa'`), reaproveitando o padrão já existente no projeto (`localStorage.getItem('contaAtivaTipo')`, já usado em `ConfigPanel.tsx` para mostrar/esconder as abas Representantes/Sócios).

**Importante**: por trás da mudança de rótulo, é exatamente a mesma tela, mesmo componente (`MembrosTab.tsx`), mesmo endpoint (`/account-members`), mesma tabela (`conta_membros`) e mesma lógica de permissões — nenhuma duplicação de código ou dado. A tela de backoffice do `admin` ("Usuários", `UsuariosTab.tsx`, que gerencia qualquer conta da plataforma) permanece com esse nome, sem alteração — são públicos e propósitos diferentes, e "Usuários" não colide mais com nada depois que a versão PJ do gestor passou a se chamar "Colaboradores" em vez de "Usuários".

## Escopo

### Dentro do escopo

- `src/layout/ConfigPanel.tsx`: o item de menu hoje fixo como `{ id: 'membros', label: 'Membros', icon: Users }` passa a ter label e ícone calculados dinamicamente a partir de `contaTipo` (mesma variável já lida via `localStorage.getItem('contaAtivaTipo')` nesse arquivo): `'pessoal'` → label `'Membros da família'`; `'empresa'` → label `'Colaboradores'`. Fallback (`contaTipo` ausente/indefinido) mantém `'Membros'` como neutro.
- `src/screens/config/MembrosTab.tsx`: passa a receber (ou ler internamente, mesmo padrão já usado por outras tabs) o `contaTipo` da conta ativa, e usar esse valor para variar os textos visíveis ao usuário:
  - Título do dialog de criação: "Novo membro" → "Novo colaborador" quando `empresa`.
  - Placeholder/labels do formulário ("Nome do membro" → "Nome do colaborador").
  - Mensagem de confirmação de desativação ("Desativar membro" → "Desativar colaborador").
  - Texto do empty state ("Nenhum membro vinculado ainda" → "Nenhum colaborador vinculado ainda").
  - Texto do botão de ação ("Novo membro" → "Novo colaborador").
- Nenhuma mudança em `src/services/membrosService.ts`, `src/services/permissoesService.ts`, backend, schema ou lógica de permissões.
- `UsuariosTab.tsx` (backoffice do admin) permanece sem alteração de nome ou comportamento.

### Fora do escopo

- Tela/fluxo de permissões (toggles de `viewOthersEntries`, etc.) — usuário pediu explicitamente para tratar depois, em rodada separada, possivelmente com um modelo de referência (imagem) que ainda será compartilhado.
- Qualquer mudança de endpoint, schema de banco, ou regra de negócio de vínculo/permissão de membro.
- Renomear ou alterar a tela "Usuários" (backoffice do admin) — decisão confirmada do usuário de mantê-la como está.
- Textos de e-mail, notificações ou qualquer outro canal fora da UI do modal de Configurações.

## Leitura de contexto

- `sistema financas/CLAUDE.md`, `sistema financas/AGENT.md` — mesmas notas de planos anteriores (modelo multi-prefeitura do `AGENT.md` não se aplica; princípios gerais de qualidade aplicados).
- `frontend/AGENT.md`, `backend/AGENT.md` — não existem como arquivos dedicados neste projeto.
- `src/layout/ConfigPanel.tsx` — lido por completo (estrutura de `ITEMS`, `visibleItems`, uso de `contaTipo` via `localStorage.getItem('contaAtivaTipo')` já usado para Representantes/Sócios — mesmo padrão a reaproveitar).
- `src/screens/config/MembrosTab.tsx` — lido por completo (`NovoMembroDialog`, `TransferirPendenciasDialog`, `PermissoesDialog`, componente principal `MembrosTab`).
- `src/screens/config/UsuariosTab.tsx` — lido por completo (confirmado: backoffice do admin, endpoint `/usuarios`, `requireAdmin` no backend — completamente separado de `MembrosTab`/`/account-members`).
- Grep de `contaAtivaTipo`/`contaTipo` em `src/` — confirmado o padrão já estabelecido de leitura desse valor em 9 arquivos, incluindo `ConfigPanel.tsx`.
- `.plans/redefinicao-papeis-admin-gestor-padrao.md`, `.plans/vinculo-membros-conta-familiar.md`, `.plans/permissoes-configuraveis-por-membro.md` — planos anteriores que originaram `MembrosTab`/`UsuariosTab` na forma atual; este plano é uma readequação de apresentação sobre esse trabalho já implementado e em produção.

## Impacto por área

### Frontend

**`src/layout/ConfigPanel.tsx`:**
- `ITEMS`: o item `membros` deixa de ter `label`/`icon` fixos; a lista `visibleItems` (ou um novo cálculo antes dela) passa a resolver o label/ícone do item `membros` dinamicamente a partir de `contaTipo`, antes de renderizar a navegação lateral.
- Nenhuma mudança na lógica de visibilidade (`isGestor`) já existente.

**`src/screens/config/MembrosTab.tsx`:**
- Novo parâmetro (prop) `contaTipo?: 'pessoal' | 'empresa'` no componente `MembrosTab`, repassado a partir de `ConfigPanel.tsx` (mesmo padrão de prop já usado para `UsuariosTab` receber `userTipo`).
- Pequeno helper local de rótulos (ex.: `const termo = contaTipo === 'empresa' ? 'colaborador' : 'membro'`) usado nos textos listados em "Dentro do escopo".
- `NovoMembroDialog` e `TransferirPendenciasDialog` recebem o termo resolvido (via prop ou lido do componente pai) para os textos internos.

### Backend

`Sem impacto esperado`.

### Banco de dados

`Sem impacto esperado`.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `src/layout/ConfigPanel.tsx`
- `src/screens/config/MembrosTab.tsx`

## Estratégia de implementação

1. `ConfigPanel.tsx`: calcular label/ícone do item `membros` a partir de `contaTipo`, antes da definição/filtro de `visibleItems`.
2. `MembrosTab.tsx`: adicionar prop `contaTipo`, criar helper de termo (`membro`/`colaborador`), aplicar nos textos do componente principal, `NovoMembroDialog`, `TransferirPendenciasDialog` (e `PermissoesDialog`, se o título "Permissões de ..." também fizer sentido variar — avaliar na implementação, mantendo mudança mínima).
3. Rodar `npx tsc --noEmit -p .` e `npx vite build`.
4. Validação manual: abrir o modal de Configurações com uma conta tipo pessoal ativa (deve mostrar "Membros da família") e com uma conta tipo empresa ativa (deve mostrar "Colaboradores"), conferindo os textos internos da tela em ambos os casos.

## Regras de negócio identificadas

- O termo exibido (`membro` vs `colaborador`) é puramente de apresentação, determinado pelo `tipo` da conta ativa no momento — não há regra de negócio nova, nem persistência de preferência de nomenclatura.

## Regras multi-tenant e segurança

Não aplicável — sem mudança de acesso a dados, permissões ou queries. As mesmas regras de visibilidade (`isGestor`) e os mesmos endpoints/guards de backend (`requireGestor` em `/account-members`) permanecem inalterados.

## Validações necessárias

- Confirmar que o fallback (sem `contaTipo` definido, ex.: antes do primeiro carregamento) não quebra a renderização do menu — deve cair num rótulo neutro (`'Membros'`) em vez de erro ou label vazio.
- Confirmar que trocar de conta ativa (pessoal ↔ empresa) atualiza o rótulo do item de menu corretamente (o mecanismo de troca de conta já força reload da página, então isso deve funcionar automaticamente, mas vale confirmar).

## Testes necessários

### Frontend

- Abrir o modal de Configurações com conta ativa tipo `pessoal`: item de menu mostra "Membros da família"; abrir a tela e criar um membro de teste, confirmar textos ("Novo membro" ou equivalente ajustado).
- Repetir com conta ativa tipo `empresa`: item de menu mostra "Colaboradores"; textos internos usam "colaborador".
- Confirmar que a aba "Usuários" (backoffice do admin) continua inalterada em ambos os cenários.

### E2E

- Não aplicável — mudança de apresentação, sem novo fluxo de dados a testar ponta a ponta.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit -p .
npx vite build
```

## Riscos e pontos de atenção

- Baixo risco técnico — mudança de rótulo/texto condicional, sem tocar em endpoints, schema ou lógica de autorização.
- Atenção para não deixar nenhum texto "Membros"/"membro" residual dentro da tela quando a conta for `empresa` (ou vice-versa) — revisar todos os pontos de texto visível listados em "Dentro do escopo".

## Perguntas em aberto

Nenhuma pergunta em aberto identificada — nomenclatura final confirmada com o usuário (PF: "Membros da família"; PJ: "Colaboradores"; backoffice do admin: mantém "Usuários").

## Critérios de aceite do plano

- Conta tipo `pessoal`: item de menu e textos internos da tela usam "Membros da família"/"membro".
- Conta tipo `empresa`: item de menu e textos internos da tela usam "Colaboradores"/"colaborador".
- Aba "Usuários" (backoffice do admin) permanece sem alteração.
- Nenhuma mudança de comportamento, endpoint ou dado — só apresentação.
- `npx tsc --noEmit -p .` e `npx vite build` passam sem erros novos.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Seguir `sistema financas/CLAUDE.md` (não há `backend/AGENT.md`/`frontend/AGENT.md` dedicados).
- Não implementar nada relacionado à tela de permissões nesta rodada — fica para um plano futuro, possivelmente informado por um modelo de referência (imagem) que o usuário ainda vai compartilhar.
- Mudança pequena e focada — evitar qualquer refactor adicional em `MembrosTab.tsx`/`ConfigPanel.tsx` além do estritamente necessário para o rótulo condicional.
