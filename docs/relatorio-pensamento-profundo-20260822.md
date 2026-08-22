# Relatório — Pensamento profundo e menu +

## Resultado

O Pensamento profundo foi aprimorado sem recriar o sistema de chat. O servidor agora monta um planejamento operacional proporcional à complexidade do pedido, com tópicos, verificações, alternativas, caminhos de solução, decisões e boletins específicos. Os boletins são orientados a requisitos concretos do pedido e não devem afirmar que uma pesquisa, execução ou validação ocorreu quando isso não aconteceu.

Por segurança, o sistema não expõe a cadeia de raciocínio privada completa nem um monólogo interno irrestrito. Em seu lugar, o usuário vê um **resumo operacional seguro** em primeira pessoa, com etapas, critérios e decisões úteis. Isso preserva a transparência do processo sem revelar instruções internas, tokens, credenciais ou conteúdo de raciocínio privado.

## Comportamento durante a resposta

O modo profundo do chat usa eventos SSE para receber atualizações reais das passagens do planejador. O primeiro boletim identifica o pedido concreto; as passagens seguintes atualizam tópicos, verificações, alternativas e decisões. O cliente mantém um fallback JSON caso um proxy não preserve o streaming.

Quando o plano termina e a resposta final começa a ser escrita, o bloco de pensamento é fechado automaticamente antes do primeiro caractere da resposta final. O conteúdo permanece no histórico como um elemento `<details>` fechado, podendo ser reaberto pelo usuário. A rolagem, o bloqueio manual de rolagem e a separação por `chatId` continuam preservados; ao trocar de conversa, o progresso recebido não é renderizado na conversa errada.

A duração não é mais artificialmente estendida por um atraso mínimo fixo no cliente. Pedidos simples encerram quando o planejamento e a resposta ficam prontos; pedidos médios ou complexos podem naturalmente demorar mais conforme o número de passagens e o tempo real do provedor. O ritmo visual inicial continua proporcional à classificação local apenas enquanto o servidor ainda está preparando o primeiro evento.

## Menu + e artefatos

O item manual **Criar artefato** foi removido exclusivamente do menu +. A geração automática permanece ativa no pós-processamento das respostas, assim como os cards dentro do chat, os downloads client-side, o canvas lateral para código e a página de Artefatos. O botão contextual exibido dentro de um bloco de código também foi preservado, pois não pertence ao menu + e continua sendo uma ação contextual do código apresentado.

## Compatibilidade com jobs em segundo plano

O endpoint de jobs profundos continua usando `processAiRequest` com o mesmo planejamento seguro e recebe as atualizações por `onProgress`. Jobs em segundo plano mantêm `progress`, `updates`, `pass`, `totalPasses` e o pedido original necessários para renderizar a resposta na conversa correta quando o usuário retornar.

| Área | Alteração | Preservação verificada |
|---|---|---|
| Prompt do planejador | Boletins específicos, em primeira pessoa, proporcionais e sem cadeia privada | Resposta normal continua com o prompt e o fluxo próprios |
| Transporte | SSE apenas quando `stream: true` e `thinkingMode: 'deep'` | Fallback JSON e jobs profundos existentes mantidos |
| Interface | Atualização progressiva do bloco de pensamento e colapso antes da resposta | Reabertura pelo histórico, rolagem e separação por conversa mantidas |
| Menu + | Remoção do item manual de artefato | Artefatos automáticos, cards, downloads e canvas mantidos |
| Segurança | Redação de padrões de credenciais nos campos visíveis do plano | Chaves e tokens não são exibidos no bloco operacional |

## Validações

Foram executados `node --check api/ai.js`, `node --check api/deep-jobs.js`, `pnpm check:html`, `pnpm build:web`, `git diff --check` e um teste estático específico para o contrato SSE, o prompt seguro, o colapso automático, os jobs profundos, a remoção do item do menu + e a preservação dos caminhos automáticos de artefatos. O build local carregou a tela de login sem erros de console; nenhuma mensagem real foi enviada à IA durante esta alteração.

O build publicado continua sendo gerado em `www/index.html` a partir do `index.html` principal. O código alterado permanece no repositório GitHub do Klipza.IA, sem adicionar credenciais ou dados de usuários.

## Referências internas

[1]: ../index.html "Aplicação principal single-file do Klipza.IA"
[2]: ../api/ai.js "Endpoint de IA e planejador do Pensamento profundo"
[3]: ../api/deep-jobs.js "Endpoint de jobs em segundo plano"
