# Correção — Pensamento contextual, isolamento por conversa e rolagem

**Data:** 22 de agosto de 2026
**Projeto:** Klipza.IA

## Escopo

Esta alteração corrige três problemas observados durante o uso do Pensamento profundo: pouca variedade na análise de soluções, resposta em geração aparecendo na conversa errada após trocar de chat e rolagem que puxava o usuário para o final ou não respondia corretamente à seta.

## Pensamento profundo

O plano operacional agora aceita um campo específico de soluções ou rotas de solução. O planejador pode registrar caminhos aplicáveis ao pedido, alternativas, verificações e decisões provisórias. O cartão mostra uma etapa contextual de “Soluções que estou avaliando” e usa os dados daquele pedido para construir os turnos da conversa operacional.

A análise continua limitada a um resumo seguro. O produto não expõe cadeia de raciocínio privada completa; mostra apenas etapas, verificações, caminhos e decisões resumidas que podem ser apresentados ao usuário.

O fallback também deixou de usar apenas uma alternativa genérica. Quando o provedor não devolve o campo de soluções, o sistema monta uma rota mínima, uma rota mais completa para casos-limite e uma escolha baseada em clareza, segurança e manutenção, sempre identificadas como resumo operacional.

## Isolamento entre conversas

Cada geração passa a registrar explicitamente o `chatId` de origem, a referência da conversa, o identificador da mensagem e o conteúdo parcial. O streaming, o botão Parar, a resposta final e o fallback usam esse alvo fixo, em vez de consultar somente a conversa aberta naquele instante.

Com isso, trocar de conversa durante a geração não move o placeholder, o texto parcial ou a resposta final para o novo chat. Ao voltar à conversa original, o app pode reconstruir o estado visual pendente; a conversa diferente não recebe o conteúdo da geração anterior.

## Rolagem

O contêiner de mensagens deixou de usar animação suave global. A posição manual fica preservada durante atualizações do streaming. Quando o usuário sobe, o app registra a intenção de leitura e não tenta devolver a tela ao fim.

A seta `↓` só aparece durante uma geração pertencente à conversa aberta e quando o usuário está distante do final. O clique remove o bloqueio manual, vai ao fim com animação suave e faz uma correção final de posição para evitar que o botão pare no meio. A seta desaparece ao chegar ao final ou quando a geração termina.

## Validação

Foram executados `node --check` nos endpoints alterados, `pnpm check:html`, `pnpm build:web` e `git diff --check`. Também foram conferidos os marcadores de soluções, `chatId` de origem, bloqueio manual de rolagem e ausência do texto genérico “Resultado pronto”.

**Autor:** Manus AI
