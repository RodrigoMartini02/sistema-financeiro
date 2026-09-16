# O assistente financeiro passa a se chamar Nico

## O que muda

O assistente hoje se apresenta como "Assistente Financeiro" — rótulo genérico,
não nome. Passa a ser **Nico**, coerente com o avatar masculino que já está no
cabeçalho do chat.

## Onde o nome aparece

Levantado no código:

| Local | Hoje |
|---|---|
| `FinancialAssistant.tsx:789` | `title="Assistente Financeiro"` (botão flutuante) |
| `FinancialAssistant.tsx:788` | `aria-label="Abrir assistente financeiro"` |
| `FinancialAssistant.tsx:806` | `aria-label="Fechar assistente financeiro"` |
| `FinancialAssistant.tsx:821` | `aria-label="Assistente Financeiro"` (dialog) |
| `FinancialAssistant.tsx:828` | `alt="Avatar do assistente financeiro"` |
| `FinancialAssistant.tsx:833` | Título do cabeçalho do chat |
| `assistantFlowDefault.ts:25` | `'Oi! Sou seu assistente. O que vamos lançar?'` |
| `assistant.html:6` | `<title>FINGERENCE Assistente</title>` |
| `public/manifest.json` | `name` e `description` do app instalável |
| `permissoesService.ts:43` | Rótulo da permissão `accessAssistant` |

## Decisões

### O nome entra como identidade, não substituição cega

"Nico" substitui onde é **nome**; onde o texto descreve **função**, o termo
genérico continua fazendo sentido. Exemplos:

- Cabeçalho do chat: `Assistente Financeiro` → **`Nico`**, com subtítulo
  "Assistente financeiro" — o nome identifica, a função explica
- `aria-label` de fechar: `Fechar assistente financeiro` → **`Fechar o Nico`**
- Permissão em Configurações: continua **"Assistente Financeiro"** — ali é o
  nome da funcionalidade numa lista de permissões, não uma conversa com ele

### Saudação

`'Oi! Sou seu assistente. O que vamos lançar?'` →
`'Oi! Sou o Nico. O que vamos lançar?'`

As outras três saudações (retorno curto, mesmo dia, dias depois) **não** mudam:
quem volta já sabe o nome, e repeti-lo a cada abertura é exatamente o efeito
robótico que a variação existe para evitar.

### Manifest e título da aba

`FINGERENCE Assistente` → **`Nico · FINGERENCE`**. O nome primeiro, porque é
como o usuário chama; a marca depois, para o ícone instalado na tela inicial
não virar um nome solto sem contexto.

A `description` do manifest mantém a explicação funcional — é o texto que
aparece na loja/instalação, onde "assistente financeiro" comunica mais do que
um nome próprio.

### Avatar

O arquivo (`/icons/assistente-perfil.webp`) não é renomeado: mexer em caminho
de asset quebra cache e PWA instalado sem ganho nenhum. Só o `alt` muda.

## Fora do escopo

- Trocar a imagem do avatar
- Renomear arquivos, componentes ou pastas (`FinancialAssistant.tsx`,
  `financial-assistant/`) — são nomes de código, não de produto, e renomeá-los
  espalha o diff sem benefício
- Nome em textos de marketing ou fora do app

## Testes

Frontend não tem runner. Garantia por `tsc --noEmit`, `vite build` e conferência
na tela.

Backend (151 atuais): a saudação padrão está coberta pelos testes de
`parseAbertura`, que comparam o texto — **vão quebrar e precisam ser
atualizados junto**, o que é o comportamento correto de um teste que fixa
conteúdo.

## Risco

Baixo: textos de interface. Nenhuma lógica, rota ou gravação muda.

Atenção ao manifest: alterar `name` muda o rótulo do app já instalado na tela
inicial de quem o adicionou. É o efeito desejado, mas vale saber que acontece
na próxima abertura, não na hora.
