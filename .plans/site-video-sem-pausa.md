# Plano de Implementação: Vídeo da Início sem o botão de pausa

## Origem

- Arquivo de especificação: pedido do usuário na conversa de 13/10/2026: "quero que remova o botão de play e pause do vídeo", que é o vídeo do site, na Início.
- Data do planejamento: `2026-10-13`
- Classificação: `frontend-only`. Só muda o componente do topo da Início, sem backend nem banco.

## Resumo

O topo da Início ([HeroVideo.tsx](../src/screens/public/components/HeroVideo.tsx)) tem um botão redondo de pausar e continuar no canto inferior direito do vídeo. O botão sai.

- O vídeo continua tocando sozinho, em loop e sem som.
- No celular (abaixo de 768 px) e para quem ativou "reduzir movimento", continua a imagem de capa no lugar do vídeo.

## Escopo

### Dentro do escopo

- Remover o botão de pausar e continuar do `HeroVideo`, com o código que só servia a ele.
- Atualizar o comentário do componente.

### Fora do escopo

- **O vídeo:** o arquivo, a imagem de capa, o degradê e os textos do topo.
- **A troca pela imagem:** continua igual, no celular e com "reduzir movimento".
- **Outras páginas:** nenhuma outra página do site usa o `HeroVideo`.

## Leitura de contexto

- `/AGENT.md`
- `/frontend/AGENT.md`: não existe no projeto
- `/backend/AGENT.md`: não existe no projeto
- `CLAUDE.md`, com o fluxo obrigatório
- Especificação: o pedido de 13/10/2026
- Código lido:
  - `src/screens/public/components/HeroVideo.tsx`;
  - `src/screens/public/HomePage.tsx`, o único lugar que usa o `HeroVideo`.
- Busca: nenhum teste nem outro arquivo usa o botão ("Pausar o vídeo" e "Continuar o vídeo").

## Impacto por área

### Frontend

- **`HeroVideo.tsx`:**
  - sai o `<button>` de pausar e continuar;
  - sai o código que só servia ao botão: o estado `isPlaying`, o `togglePlayback`, o `videoRef` (e o `useRef`, se ficar sem uso), os eventos `onPlay` e `onPause` do `<video>`, e os ícones `Play` e `Pause` do `lucide-react`;
  - o `<video>` continua com `autoPlay`, `muted`, `loop`, `playsInline`, `preload="metadata"` e o `poster`;
  - o comentário do componente deixa de citar o botão de pausar.
- **Estados:** o vídeo e a imagem continuam como estão, sem estado novo.

### Backend

Sem impacto esperado.

### Banco de dados

Sem impacto esperado.

Atenção: migrations não devem ser executadas sem confirmação explícita do usuário, pois o ambiente atual pode estar apontando para produção.

### Infra/Deploy

Sem impacto esperado.

## Arquivos provavelmente afetados

- `src/screens/public/components/HeroVideo.tsx`
- `.plans/site-video-sem-pausa.md` (este plano)

## Estratégia de implementação

1. **Branch:** `feat/R/site-video-sem-pausa`, a partir da `main` atualizada.
2. **`HeroVideo.tsx`:** remover o botão e o código que só servia a ele, sem sobras, e atualizar o comentário.
3. **Validação:** os comandos abaixo e a conferência no local (`/run`), em tela de 768 px ou mais.

## Regras de negócio identificadas

1. **Botão:** o vídeo do topo da Início não tem botão de pausar nem de continuar.
2. **Vídeo:** toca sozinho, em loop e sem som, em telas de 768 px ou mais.
3. **Imagem:** no celular e para quem ativou "reduzir movimento", aparece a imagem de capa no lugar do vídeo.

## Regras multi-tenant e segurança

Sem impacto: é uma página pública, sem dado de conta nem de usuário.

## Validações necessárias

Nenhuma: não há formulário nem dado de entrada.

## Testes necessários

### Frontend

Não há regra pura nova. A suíte atual precisa continuar passando.

### Backend

Sem impacto esperado.

### E2E

Conferência manual no local (`/run`):

- **Tela de 768 px ou mais:** o vídeo da Início toca sozinho, em loop e sem som, sem o botão no canto inferior direito.
- **Celular:** aparece a imagem de capa.
- **"Reduzir movimento" no sistema:** aparece a imagem de capa.

## Comandos de validação sugeridos

```bash
npx tsc --noEmit
npm test
npx vite build
```

## Riscos e pontos de atenção

- **Acessibilidade:** sem o botão, quem não ativou "reduzir movimento" não consegue parar o vídeo, e as regras de acessibilidade pedem um jeito de pausar animações que começam sozinhas. O "reduzir movimento" continua trocando o vídeo pela imagem.

## Perguntas em aberto

Nenhuma pergunta em aberto identificada.

## Critérios de aceite do plano

A implementação deve ser considerada pronta quando:

- O vídeo da Início não tem mais o botão de pausar e continuar.
- O vídeo continua tocando sozinho, em loop e sem som, e a imagem continua no celular e com "reduzir movimento".
- O `HeroVideo` não tem código sem uso.
- Os comandos acima passam.

## Observações para a skill implementar

- **Fonte:** usar este plano como fonte principal.
- **Branch:** `feat/R/site-video-sem-pausa`, a partir da `main` atualizada.
- **Ambiente:** não há migration, e o `.env` não muda.
- **Código:** seguir o `/AGENT.md` e remover o código do botão, sem sobras.
- **Commits:** `.portal/` e `GLOSSARIO.md` nunca entram.
