# Task: Corrigir erros ortográficos na interface (acentuação e encoding)

## Contexto

Usuário identificou erros ortográficos visíveis na tela de Acessos (`AcessosTab.tsx`). Foi feita uma varredura completa no sistema (frontend `src/`, backend `backend/src/`, textos de guias de onboarding e mensagens de erro) para localizar todos os casos semelhantes.

## Problema

Dois tipos de erro foram encontrados:

1. **Falta de acentuação** em strings digitadas sem acento, concentradas em `AcessosTab.tsx`.
2. **Corrupção de encoding** (`?` no lugar de caracteres acentuados como `ã`, `ê`) em `CartaoTab.tsx` e `ReservasScreen.tsx` — provavelmente de uma edição salva com encoding incorreto.

## Escopo

### Dentro do escopo — correções pontuais de texto (sem alterar lógica/estrutura)

**`src/screens/config/AcessosTab.tsx`**
- Linha 68: `'Usuarios ativos'` → `'Usuários ativos'`
- Linha 80: `Resumo dos ultimos {days} dias` → `Resumo dos últimos {days} dias`
- Linha 116: `Estatisticas de acesso ainda nao disponiveis` → `Estatísticas de acesso ainda não disponíveis`
- Linha 117: `As contas criadas ja aparecem pela tabela de usuarios.` → `As contas criadas já aparecem pela tabela de usuários.`
- Linha 131: `Total historico: {numberFormat(card.total)}` → `Total histórico: ...`
- Linha 143: `Ultimas contas criadas` → `Últimas contas criadas`

**`src/screens/config/CartaoTab.tsx`**
- Linha 262: `Nenhum cart?o cadastrado` → `Nenhum cartão cadastrado`
- Linha 263: `Cadastre um cart?o para acompanhar limite e vencimento.` → `Cadastre um cartão para acompanhar limite e vencimento.`

**`src/screens/reservas/ReservasScreen.tsx`**
- Linha 244: `Crie uma reserva para acompanhar objetivos, emerg?ncias ou valores separados.` → `Crie uma reserva para acompanhar objetivos, emergências ou valores separados.`

### Fora do escopo

- Qualquer mudança de lógica, layout ou estrutura de componente — só o texto das strings acima.
- Demais telas do sistema: já verificadas na varredura e sem erros encontrados (Usuários, Perfis, Minha Conta, Categorias, Representantes, Sócios, Serviços, Clientes, Detalhe de Cliente, guias de onboarding, Despesas, Receitas, Relatórios, Meses, Planos, Reservas/Dialog, Dashboard, modais de despesa/receita/pagamento, páginas públicas, componentes UI compartilhados, e mensagens de erro do backend).
- O comentário de código `{/* Contratos ? Faturamento */}` em `ReceitasScreen.tsx` (linha 259) não é texto visível ao usuário — não entra no escopo.

## Estratégia de implementação

1. Editar as 9 strings listadas acima, uma a uma, preservando indentação e estrutura do JSX.
2. Rodar `npx vite build` para validar.
3. Nenhum impacto em backend, banco de dados ou `.env`.

## Observações

- `AcessosTab.tsx` é visível apenas ao usuário master (verificação por CPF em `ConfigScreen.tsx`), mas é a tela citada pelo usuário e concentra a maior parte dos erros.
- Os casos de `CartaoTab.tsx`/`ReservasScreen.tsx` parecem ser corrupção de encoding pontual, não erro de digitação — vale confirmar visualmente no editor antes de aplicar a correção, para garantir que o caractere `?` realmente substitui a letra acentuada esperada e não é um separador intencional.
