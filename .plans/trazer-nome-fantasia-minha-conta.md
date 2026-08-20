# Plano de Implementação: Trazer "Nome fantasia" para a tela Minha conta (contas CNPJ)

## Origem

- Arquivo de especificação: nenhum `.md` de feature — pedido direto do usuário, comparando a tela "Criar conta" (que pede Nome fantasia para CNPJ) com "Minha conta" (que não mostra esse campo).
- Data do planejamento: 2026-08-20
- Classificação: `fullstack` (frontend consome a API `/profiles` já existente; nenhuma alteração de backend é necessária)

## Resumo

No cadastro (`POST /auth/register`), quando o documento é CNPJ, o usuário informa um "Nome fantasia da empresa" obrigatório, que é salvo em `perfis.nome_fantasia` (não em `usuarios`). O plano anterior `redesign-minha-conta-bloco-unico` unificou "Minha conta" num bloco único, mas cobriu apenas campos da tabela `usuarios` (nome, email, documento, país, estado, cidade) — o usuário notou a ausência do Nome fantasia e confirmou que quer vê-lo ali também, não só na tela "Perfis" (que já tem esse campo funcionando).

Como `nome_fantasia` pertence a uma tabela e endpoint diferentes (`perfis` / `PUT /api/profiles/:id`), esta mudança é puramente de frontend: buscar o perfil empresa ativo do usuário e coordenar duas chamadas de API no mesmo submit.

## Escopo

### Dentro do escopo

- `MinhaContaTab.tsx` passa a buscar também os perfis do usuário via `fetchPerfis()` (já existente em `configService.ts`), localizando o perfil com `tipo === 'empresa'` ativo.
- Exibir o campo "Nome fantasia" no formulário **somente quando o documento do usuário tiver 14 dígitos** (CNPJ) — mesma regra (`isCnpj = cleanDoc.length === 14`) já usada em `auth.ts` no cadastro.
- Pré-preencher o campo com `perfilEmpresa.nome_fantasia`.
- No submit do formulário único: sempre disparar `updateMe` (dados de `usuarios`); se houver perfil empresa carregado, também disparar `savePerfil` (PUT) enviando o **objeto do perfil completo** — `nome`, `documento`, `razao_social`, `nome_fantasia` (atualizado), `atividade`, `enquadramento` — reaproveitando os valores já carregados de `fetchPerfis()`, não apenas o campo alterado.
- Coordenar as duas mutations: sucesso só é sinalizado quando ambas completarem (quando aplicável); erro em qualquer uma exibe mensagem no bloco único de erro já existente.
- Assumir no máximo um perfil `tipo === 'empresa'` ativo por usuário nesta tela — é a limitação conhecida documentada abaixo, não resolvida aqui.

### Fora do escopo

- Suporte a múltiplas empresas por usuário dentro de "Minha conta" — se o usuário tiver mais de um perfil empresa ativo, esta tela usa apenas o primeiro encontrado; gerenciar múltiplos continua sendo função exclusiva da tela "Perfis".
- Qualquer alteração em `PerfisTab.tsx`, `backend/src/routes/profiles.ts` ou no schema de `perfis`.
- Criar um perfil empresa novo a partir desta tela — se o usuário não tiver nenhum perfil `empresa` ativo (caso não deveria ocorrer para contas CNPJ após a correção do plano `corrigir-cadastro-incompleto-categorias-padrao`, mas pode ocorrer em dados legados), o campo Nome fantasia simplesmente não aparece; não é criado um perfil no lugar.
- Correção de bug de barra invertida em `configService.ts` — investigado e descartado: as URLs já usam barra normal corretamente (falso alarme de uma ferramenta de busca anterior).

## Leitura de contexto

- `sistema financas/AGENT.md` — lido em planos anteriores desta sessão (mesma ressalva: contexto multi-tenant genérico não totalmente aplicável a este projeto single-tenant; aplicadas as diretrizes gerais de qualidade de código).
- `frontend/AGENT.md` — não existe como arquivo separado neste projeto.
- `backend/AGENT.md` — não existe como arquivo separado neste projeto.
- `sistema financas/src/screens/config/MinhaContaTab.tsx` — lido por completo (estado atual pós-redesign, a ser estendido).
- `sistema financas/src/screens/config/PerfisTab.tsx` — lido por completo (confirma que o campo "Nome fantasia" já funciona nessa tela, referência de UX/validação a não duplicar).
- `sistema financas/src/services/configService.ts` — lido por completo (`fetchPerfis`, `savePerfil` já existentes e corretos; falso alarme de barra invertida descartado após leitura direta do arquivo).
- `sistema financas/src/types/config.ts` — lido (tipo `Perfil` já inclui `nome_fantasia` e demais campos de empresa).
- `sistema financas/backend/src/routes/profiles.ts` — lido por completo, com atenção especial a `PUT /:id` (linhas 90-143): exige `nome` e `documento` (CNPJ de 14 dígitos) no body, e sobrescreve `razao_social`/`atividade`/`enquadramento` com `null` se não enviados — é uma atualização completa, não parcial.
- `sistema financas/backend/src/db/schema/profiles.ts` — lido em plano anterior (confirma que `nome_fantasia` é coluna de `perfis`, sem relação direta com `usuarios`).
- `sistema financas/backend/src/routes/auth.ts` — lido (referência da regra `isCnpj = cleanDoc.length === 14` e do preenchimento inicial de `perfis.name`/`tradeName` a partir de `nome_fantasia` no cadastro).
- Consulta read-only ao banco de produção (Render), reaproveitando padrão já autorizado em planos anteriores: confirmou que o perfil empresa da conta "Aether Software" (`usuario_id=12`, `perfil id=11`) existe, está ativo, com `nome_fantasia="Aether"` — útil para validar a implementação.

## Impacto por área

### Frontend

- `sistema financas/src/screens/config/MinhaContaTab.tsx`:
  - Adicionar `useQuery` para `fetchPerfis()` (nova query key, ex.: `['perfis']` — verificar se já existe uma query key centralizada para perfis em `queryKeys.ts` e reaproveitar, já usada em `PerfisTab.tsx` via `queryKeys.perfis`).
  - Derivar `perfilEmpresa` = primeiro item com `tipo === 'empresa'` da lista retornada.
  - Novo estado `nomeFantasia`, populado via `useEffect` quando `perfilEmpresa` carregar.
  - Renderizar o campo "Nome fantasia" condicionalmente, logo após o campo "Documento", quando `documento.replace(/\D/g,'').length === 14`.
  - Nova mutation (ou reaproveitar `updateMut` existente de forma coordenada) para `savePerfil`, chamada apenas quando `perfilEmpresa` existir, enviando o objeto perfil completo com `nome_fantasia` atualizado.
  - Ajustar o `handleSubmit` para orquestrar as duas chamadas mantendo um único fluxo de loading/erro/sucesso visível ao usuário.
- Nenhuma mudança em `configService.ts`, `PerfisTab.tsx` ou tipos — reaproveitamento total do que já existe.

### Backend

`Sem impacto esperado`. As rotas `GET /api/profiles` e `PUT /api/profiles/:id` já existem, já funcionam e já são consumidas por `PerfisTab.tsx` — esta mudança apenas adiciona um novo consumidor frontend.

### Banco de dados

`Sem impacto esperado`. Nenhuma migration necessária.

### Infra/Deploy

`Sem impacto esperado`.

## Arquivos provavelmente afetados

- `sistema financas/src/screens/config/MinhaContaTab.tsx`

## Estratégia de implementação

1. Verificar se existe uma query key centralizada para perfis (`queryKeys.perfis`, usada em `PerfisTab.tsx`) e reaproveitá-la em `MinhaContaTab.tsx` para os dois componentes compartilharem cache.
2. Adicionar `useQuery({ queryKey: queryKeys.perfis, queryFn: fetchPerfis })` em `MinhaContaTab.tsx`.
3. Derivar o perfil empresa ativo (`data?.find(p => p.tipo === 'empresa')`) e adicionar estado `nomeFantasia`, populado no `useEffect` existente (que já popula os demais campos a partir de `user`), agora também a partir do perfil.
4. Adicionar o campo `Field label="Nome fantasia"` no JSX, renderizado condicionalmente com base no documento ter 14 dígitos, posicionado próximo ao campo Documento para manter a mesma adjacência visual do formulário de cadastro.
5. No `handleSubmit`: manter a chamada a `updateMut.mutate({...})` para os dados de usuário; se `perfilEmpresa` existir, adicionar uma segunda chamada (nova `useMutation` para `savePerfil`, ou reaproveitando padrão via `mutateAsync` sequencial) enviando `{ tipo: 'empresa', nome: perfilEmpresa.nome, documento: perfilEmpresa.documento, razao_social: perfilEmpresa.razao_social, nome_fantasia: nomeFantasia, atividade: perfilEmpresa.atividade, enquadramento: perfilEmpresa.enquadramento }` com `id: perfilEmpresa.id`.
6. Tratar erro/sucesso combinados: usar `Promise.all`/sequencial com `try/catch` local no `handleSubmit` (já que são duas mutations independentes) para popular o mesmo `formError`/`saved` já existentes.
7. Invalidar `queryKeys.perfis` (além de `['usuario-me']`, já invalidado) após sucesso, para refletir a mudança também se o usuário for depois para "Perfis".
8. Rodar `npm run build` (frontend) para validar tipos.
9. Validar visualmente: conta Aether Software deve carregar "Aether" no campo Nome fantasia; editar e salvar deve persistir e refletir também na tela "Perfis" (verificar que razão social/atividade/enquadramento não foram apagados pelo save).

## Regras de negócio identificadas

- Nome fantasia só é relevante/exibido para contas CNPJ (perfil tipo empresa).
- `PUT /profiles/:id` é uma atualização completa — campos não enviados são sobrescritos com `null` no backend; o frontend deve sempre reenviar o estado completo do perfil, não um patch parcial.
- Assume-se no máximo um perfil empresa ativo por usuário nesta tela (limitação conhecida, não uma regra de negócio nova).

## Regras multi-tenant e segurança

Não aplicável — projeto não é multi-tenant. `GET /api/profiles` e `PUT /api/profiles/:id` já operam exclusivamente sobre `req.user!.id`.

## Validações necessárias

- Nenhuma validação nova de input — reaproveita a validação já existente em `PUT /profiles/:id` (CNPJ de 14 dígitos, nome obrigatório).
- Frontend: nome_fantasia continua obrigatório no contexto de perfil empresa (mesma regra do cadastro), mas como o perfil já existe e já tem um nome_fantasia válido, não é esperado que o campo fique vazio nesta tela.

## Testes necessários

### Frontend

- Verificação manual: conta CNPJ (Aether Software) carrega "Nome fantasia" preenchido com o valor do perfil.
- Verificação manual: conta CPF (sem perfil empresa) não mostra o campo Nome fantasia.
- Verificação manual: editar Nome fantasia em "Minha conta" e salvar reflete corretamente ao abrir a tela "Perfis" depois.
- Verificação manual: salvar em "Minha conta" não apaga razão social/atividade/enquadramento já preenchidos no perfil (checar com uma conta de teste que tenha esses campos preenchidos, se disponível, ou preenchê-los antes do teste).

### Backend

- Não aplicável — nenhuma rota nova ou alterada.

### E2E

- Não aplicável — sem framework E2E identificado no projeto.

## Comandos de validação sugeridos

```bash
npm --prefix "sistema financas" run build
npm --prefix "sistema financas" run lint
```

## Riscos e pontos de atenção

- **Risco principal**: `PUT /profiles/:id` sobrescreve campos ausentes com `null`. Se a implementação não reenviar `razao_social`/`atividade`/`enquadramento` corretamente a partir do estado já carregado, salvar em "Minha conta" pode apagar esses dados silenciosamente. Mitigação: sempre montar o payload a partir do objeto `perfilEmpresa` completo já em memória, sobrescrevendo apenas `nome_fantasia`.
- Duas mutations coordenadas num único submit aumentam a chance de estado inconsistente (ex.: `usuarios` salva mas `perfis` falha) — o plano trata isso com mensagens de erro claras, mas não há transação cross-tabela/cross-request possível aqui (são duas chamadas HTTP separadas); aceitável dado o escopo pequeno, mas vale deixar claro ao usuário que um retry seguro é possível (reenviar o formulário) sem duplicar dados.
- Testes em produção (banco Render) devem usar a conta Aether Software com cautela — evitar apagar `razao_social`/`atividade`/`enquadramento` reais dela durante o teste.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

- Contas CNPJ mostram e permitem editar "Nome fantasia" dentro de "Minha conta".
- Contas CPF não mostram o campo.
- Salvar em "Minha conta" não apaga razão social/atividade/enquadramento do perfil.
- Alterações refletem corretamente na tela "Perfis" depois.
- Nenhuma rota de backend foi alterada.

## Observações para a skill implementar

- Usar este plano como fonte principal de contexto.
- Não executar migrations — nenhuma é necessária.
- Reaproveitar `fetchPerfis`/`savePerfil`/tipo `Perfil` já existentes — não duplicar lógica.
- Reaproveitar a query key `queryKeys.perfis` já usada por `PerfisTab.tsx`, se existente, para compartilhar cache entre as duas telas.
- Atenção ao risco de `PUT /profiles/:id` sobrescrever campos com `null` — sempre montar o payload a partir do perfil completo carregado.
- Testes em produção devem preservar os dados reais da conta Aether Software usada para validação.
