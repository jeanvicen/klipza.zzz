# Teste — Pensamento profundo complexo e segundo plano

**Data:** 22 de agosto de 2026
**Projeto:** Klipza.IA

## Prompt usado

Foi enviado um pedido complexo de arquitetura para um aplicativo de chat com autenticação, memória isolada, energia, tokens, anexos, histórico, artefatos e jobs em segundo plano. O pedido solicitava comparação de rotas, validação de isolamento, idempotência, limites de tempo, sincronização, acessibilidade, desempenho e recuperação de erros.

## Resultado observado

A solicitação foi aceita pela interface com o Pensamento profundo ativo e a energia foi debitada de forma idempotente. A Function de IA retornou HTTP 429 por limite temporário de tokens por minuto do provedor de texto. Portanto, este teste específico não chegou à etapa de observar a resposta profunda nem de promover a resposta ao segundo plano.

O log do ambiente registrou o erro de limite temporário, sem expor chave ou credencial. A aplicação exibiu uma mensagem segura de indisponibilidade ao usuário. O polling de jobs continuou respondendo normalmente.

## Correção aplicada

Foi identificado que uma falha do provedor depois do débito podia deixar a energia consumida mesmo sem resposta final. A interface agora chama o estorno autoritativo quando o débito de energia da conta foi confirmado e a resposta falha. O estorno usa a mesma chave do débito original, é protegido pelo RPC idempotente e devolve somente a cobrança daquela tentativa.

A tentativa deste teste foi estornada uma única vez pelo caminho idempotente. O saldo voltou de 70 para 77 pontos. Nenhum crédito artificial foi criado.

## Limitação do teste

Como o provedor estava sob limite temporário, não foi feita uma segunda tentativa real sem nova autorização, para não consumir mais energia. O fluxo de segundo plano permanece condicionado à página ficar oculta ou ao usuário sair; com a página visível, a resposta segue no fluxo normal.

— **Manus AI**
