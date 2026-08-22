# Relatório — correção do fluxo de resposta em segundo plano

**Data:** 22 de agosto de 2026
**Projeto:** Klipza.IA
**Escopo:** corrigir o aviso e o enfileiramento indevido de respostas profundas.

## Problema

O cliente estava transformando imediatamente algumas mensagens do Pensamento profundo em jobs. Por isso, o usuário via “Klipza está respondendo em segundo plano” mesmo permanecendo dentro do aplicativo, e a resposta não seguia o fluxo normal de streaming da conversa aberta.

## Comportamento corrigido

| Situação | Comportamento agora |
|---|---|
| App visível e usuário permanece na tela | A resposta segue normalmente pelo streaming, incluindo Pensamento profundo, diário operacional e resultado na conversa aberta. Nenhum banner de segundo plano é exibido. |
| Usuário troca de chat sem sair do app | O app continua no fluxo normal; não cria um job apenas por trocar a conversa. |
| Página fica oculta ou o usuário sai enquanto uma resposta profunda ainda está pendente | A resposta aberta é promovida uma única vez para um job, o visual transitório é encerrado e a tarefa continua no servidor. |
| Usuário retorna ao app | O banner de segundo plano é ocultado, a conversa correta é atualizada e o resultado do job é inserido nela sem duplicação. |
| Resposta termina enquanto o app está visível | Nenhuma notificação de “segundo plano” é criada. |
| Resposta termina enquanto o app está oculto | A notificação do navegador pode ser enviada quando o usuário tiver permitido notificações. |

## Implementação

A decisão não é mais feita no início do envio. O cliente registra os dados necessários somente para mensagens profundas compatíveis com job, inicia a resposta normalmente e aguarda os eventos `visibilitychange` e `pagehide`. A promoção para job usa uma trava de promessa e uma flag por resposta, evitando duas filas para a mesma mensagem.

O banner e o ponto de atividade no histórico também respeitam `document.hidden`. Enquanto a página está visível, esses elementos são removidos; quando o usuário retorna, a interface mostra diretamente a conversa e o resultado, em vez de manter um aviso enganoso de segundo plano.

O resultado dos jobs continua sendo associado por `chatId` e `messageId`. A entrega verifica se o job ou sua mensagem já estão presentes antes de inserir a resposta, preservando a conversa correta e evitando duplicação.

## Validação

Foram executados o check de HTML, a geração do `www/index.html`, a checagem de whitespace do Git e a verificação de sintaxe do endpoint de jobs. Também foi conferido no código que não existe mais enfileiramento imediato por `backgroundEligible`; a única promoção ocorre quando a página está oculta.

A alteração é exclusivamente de comportamento do segundo plano. Energia, tokens, limite de anexos, autenticação, memória e demais recursos não foram modificados neste ajuste.

— **Manus AI**
