# Completar a abertura em fluxo salvo antes dela existir

## Problema

O editor mostra o aviso "O fluxo não define a abertura" e o canvas não desenha
o bloco de início. Não é bug do desenho: `getActiveFlowForEditing` devolve a
linha gravada no banco, e essa linha (versão 1) foi criada antes de a abertura
existir. `parseAbertura` devolve `undefined`, `toGraph` pula o bloco.

O `DEFAULT_FLOW_DEFINITION` tem a abertura, mas ele só entra em cena ao semear
a tabela vazia ou ao restaurar — nunca ao carregar uma linha existente.

"Restaurar padrão" resolve hoje (o fluxo salvo é a semente original, sem
edições), mas não pode ser a resposta permanente: assim que houver ajuste
salvo, restaurar significaria perdê-lo.

## Solução

O backend completa a abertura ausente ao carregar, sem tocar no resto.

Um único ponto de mudança: `getActiveFlowForEditing`, em
`backend/src/services/assistantFlowStore.ts`. Ao devolver uma definição sem
`abertura`, anexar `DEFAULT_FLOW_DEFINITION.abertura`.

Preserva nós, ordem, obrigatórios e posições exatamente como estão — só
preenche o que falta.

### Por que ali e não em `parseFlowDefinition`

`parseFlowDefinition` é a fronteira de validação: a função diz o que o dado
recebido **é**, não o que ele deveria ser. Fazê-la inventar um campo ausente
apagaria a diferença entre "fluxo sem abertura" e "fluxo com a abertura
padrão" — e é essa diferença que `validarAbertura` usa para avisar. Além
disso ela roda também no PUT, onde inventar campo mascararia um payload
incompleto vindo do editor.

O default pertence a quem **carrega para uso**, não a quem valida.

### Por que não escrever no banco ao carregar

Um GET que grava é efeito colateral escondido: dois editores abertos gerariam
escrita concorrente, e o `versao` subiria sem ninguém ter editado. O
preenchimento fica em memória; a linha só muda quando o usuário aperta Salvar
— aí a abertura já vai junto, porque o editor a recebeu.

## Efeito colateral positivo

`GET /assistant-flows/abertura` já tem `?? DEFAULT_FLOW_DEFINITION.abertura`,
então o chat nunca quebrou. Com a mudança, os dois caminhos passam a ler a
mesma coisa da mesma origem, e o fallback da rota vira apenas a última defesa.

## Teste

`backend/src/services/assistantFlowEngine.test.ts` cobre `parseAbertura`, que
não muda. O comportamento novo é do store, que fala com o banco e não tem
teste unitário hoje (os 133 não cobrem essa camada).

Verificação: um teste direto da função de completar, extraída como helper puro
(`comAberturaPadrao(definicao)`), que é a parte com lógica. O acesso ao banco
em volta continua sem cobertura, como já era.

- definição sem `abertura` recebe a padrão
- definição com `abertura` própria é devolvida intacta (não sobrescrever)
- nós, ordem e obrigatórios não são alterados em nenhum dos casos

## Risco

Baixo. Uma função pura e uma chamada. Nada de migration, nada de escrita,
formato salvo inalterado. O pior caso é um fluxo que já tinha abertura ser
sobrescrito — evitado pela checagem, e coberto por teste.

## Fora de escopo

- Desenhar o fluxo de consulta (você pediu para deixar de fora agora)
- Editar textos da abertura pelo painel
