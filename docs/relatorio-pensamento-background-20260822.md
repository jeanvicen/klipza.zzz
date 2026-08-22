# Klipza.IA — Pensamento profundo e respostas em segundo plano

**Data:** 22 de agosto de 2026  
**Repositório:** `jeanvicen/klipza.zzz`  
**Branch:** `main`

## Objetivo

Esta entrega aprimora o modo Pensamento profundo para trabalhar em múltiplas passagens adaptativas e permite que uma resposta continue associada à conversa correta quando a pessoa troca de chat. O usuário vê um resumo operacional contextual, o progresso é persistido por conta e a conclusão gera uma notificação da aplicação.

## Pensamento profundo

O endpoint `api/ai.js` agora classifica a complexidade do pedido em `standard`, `medium` ou `high`. A quantidade de passagens é proporcional à classificação: duas para pedidos objetivos, três para pedidos detalhados e quatro para pedidos extensos ou com várias dependências.

Cada passagem atua como uma revisão operacional do plano. Ela pode reorganizar tópicos, identificar lacunas, comparar alternativas, registrar uma decisão profissional resumida e atualizar verificações de segurança, compatibilidade e casos-limite. O texto enviado ao modelo instrui que apenas boletins operacionais seguros sejam retornados; a cadeia privada completa de raciocínio não é armazenada nem exibida.

O retorno profundo contém `topics`, `checks`, `alternatives`, `decisions`, `updates`, `summary`, `complexity` e `passes`. O frontend apresenta esses dados em um cartão recolhível dentro da mensagem, com a seção **Diário da análise**, a passagem atual e o resumo final.

## Respostas em segundo plano

A migração `20260821000009_deep_jobs.sql` cria a tabela `public.deep_jobs`, com vínculo à conta, conversa, mensagem, histórico limitado, complexidade, progresso, resultado, tentativas e datas de execução. A chave única por usuário e mensagem evita duplicação.

O endpoint `api/deep-jobs.js` permite criar uma tarefa, iniciar seu processamento, consultar tarefas da própria conta, cancelar uma tarefa ainda não concluída, confirmar a entrega e recuperar o resultado. A política RLS restringe leitura, inserção e atualização à conta autenticada.

O endpoint `api/cron-deep-jobs.js` fornece um worker protegido por `CRON_SECRET` para processar itens enfileirados e retomar tentativas. Ele foi incluído para uma futura agenda de execução e para ambientes com cron habilitado. O fluxo imediato do app usa o endpoint autenticado de início, que persiste o job antes de processar.

No frontend, a resposta profunda de chat sem anexos ou pesquisa é enfileirada. O compositor é liberado logo depois, permitindo abrir outra conversa. A conversa original recebe um ponto de atividade no histórico; acima do chat aparece **Klipza está respondendo em segundo plano**, com a passagem atual e o botão para voltar à conversa. A resposta final é aplicada somente ao `chat_id` de origem.

## Notificações

Quando o worker conclui uma tarefa, grava uma linha em `user_notifications` com o tipo `ai_response_complete`. Se o app estiver aberto e a permissão de notificações estiver habilitada, o navegador também recebe o aviso **Klipza terminou a resposta**. Ao reabrir o app, a notificação persistida é carregada pela rotina existente de notificações da conta.

A implementação não finge que uma função serverless pode trabalhar por horas sem limite. O processamento imediato é limitado pelo tempo máximo da função e usa passagens finitas. Para execuções realmente longas ou notificações do sistema com o app completamente encerrado, é necessário ativar um worker agendado/filas e configurar Web Push com chaves VAPID; nenhum segredo desse tipo foi criado ou incluído nesta entrega.

## Arquivos alterados

| Arquivo | Responsabilidade |
|---|---|
| `api/ai.js` | Classificação de complexidade, passagens de revisão, boletins operacionais e função compartilhada de geração. |
| `api/deep-jobs.js` | API autenticada de criação, início, consulta, cancelamento e confirmação de entrega. |
| `api/cron-deep-jobs.js` | Worker protegido para processamento de tarefas enfileiradas e tentativas. |
| `index.html` | Cartão de pensamento, estado por conversa, banner de segundo plano, polling, aplicação do resultado e avisos. |
| `www/index.html` | Cópia publicada gerada pelo build web. |
| `supabase/migrations/20260821000009_deep_jobs.sql` | Tabela, RLS, índices, constraint de notificação e trigger de atualização. |
| `docs/relatorio-pensamento-background-20260822.md` | Este relatório. |

## Validações realizadas

Foram executados `node --check` em `api/ai.js`, `api/deep-jobs.js` e `api/cron-deep-jobs.js`, `pnpm check:html`, `pnpm build:web`, `git diff --check` e uma varredura nos arquivos versionados para impedir padrões de chaves reais.

A migração foi executada no projeto Supabase de produção e retornou **Success. No rows returned**. O endpoint de tarefas mantém autenticação por bearer e as políticas do banco isolam os jobs por `auth.uid()`.

## Limites de hospedagem e próximos passos

O projeto atual está publicado em Vercel. O fluxo funciona enquanto a chamada serverless estiver em execução e o estado persistido permite recuperar a tarefa ao reabrir o app. A frequência de cron depende do plano da hospedagem; no plano Hobby, jobs frequentes não são permitidos, portanto não foi adicionado um cron que aparentasse garantir execução contínua. Para garantir retomada automática com o app fechado, o próximo passo de infraestrutura é configurar uma fila/worker com frequência permitida e Web Push.

Nenhuma senha, chave de API, token, valor de variável sensível ou instrução privada do modelo está presente neste documento.
