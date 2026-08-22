# Relatório — pensamento profundo, rolagem e histórico

**Data:** 22 de agosto de 2026
**Projeto:** Klipza.IA

## Pensamento profundo proporcional

O modo profundo não usa uma espera longa fixa para todos os pedidos. O cliente classifica localmente o contexto em análise objetiva, detalhada ou extensa e aplica ritmos diferentes ao diário operacional: pedidos simples avançam rapidamente; pedidos médios exibem mais etapas; pedidos complexos recebem mais passagens visuais e uma espera mínima maior antes da resposta final.

O backend continua sendo a fonte do trabalho real. Ele escolhe entre 2, 3 ou 4 passagens conforme a complexidade e produz atualizações, tópicos, verificações, alternativas e decisões específicas. O cliente não inventa uma hora de processamento nem mantém uma função aberta artificialmente por horas. Em ambientes serverless com tempo limitado, análises realmente longas devem continuar pelo job em segundo plano já implementado quando o usuário sair do app.

## Rolagem durante a geração

O contêiner de mensagens agora identifica se o usuário está próximo do final. Se estiver acompanhando a resposta, ele continua seguindo o texto. Se tiver rolado para cima, a aplicação preserva a posição e não puxa a tela para baixo a cada atualização do streaming ou do cartão de pensamento.

Enquanto a resposta está sendo gerada e o usuário está distante do fim, aparece uma seta `↓`. Ao tocar nela, o chat rola suavemente até a resposta mais recente. A seta desaparece quando o usuário chega ao final ou quando a geração termina. O controle também funciona depois de uma renderização completa da conversa.

## Limite de 50 conversas

O histórico mantém no máximo 50 conversas recentes. Ao chegar nesse limite, o botão de nova conversa não cria silenciosamente uma 51ª conversa. O histórico mostra a mensagem “Limite de 50 conversas atingido. Apague uma para começar outra.” Depois que uma conversa antiga é apagada, o botão volta a criar uma nova conversa normalmente.

A regra existente de retenção e sincronização continua limitando o estado carregado a 50 conversas. O ajuste não altera energia, tokens, anexos, memória ou o processamento em segundo plano.

## Validação

Foram executados a checagem de sintaxe do backend, o check HTML, o build estático de `www/index.html`, a checagem de whitespace do Git e uma inspeção dos marcadores do novo controle de rolagem, perfis de ritmo e limite do histórico.

— **Manus AI**
