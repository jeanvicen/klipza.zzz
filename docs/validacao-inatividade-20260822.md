# Validação de inatividade, notificações e limpeza completa

**Data:** 22 de agosto de 2026
**Autor:** Manus AI

## Resultado

Foi adicionada uma limpeza explícita para contas cuja exclusão definitiva foi enfileirada após 24 meses sem atividade. A rotina remove dados pessoais conhecidos antes de excluir `auth.users`, incluindo conversas, artefatos, estado remoto, memórias, configurações de memória, notificações, backups, feedbacks, jobs, quotas, ledgers de energia/anexos/tokens, compras e assinaturas. Se o Supabase Storage existir, a rotina também remove objetos cujo proprietário ou caminho esteja vinculado ao UUID da conta. As chaves de auditoria administrativa permanecem anonimizadas por desenho.

A rotina só aceita execução com `service_role` e continua protegida contra chamadas de usuários comuns. A função do cron foi atualizada para executar limpeza de memória, geração de notificações e purge no mesmo ciclo diário.

## Avisos de inatividade

O calendário existente usa três marcos antes do prazo final: aproximadamente 90 dias, 30 dias e 7 dias. Cada marco cria um evento único por usuário e tipo. A notificação do cliente usa o ID do evento, registra a entrega por conta no navegador e não reapresenta o mesmo aviso em cada consulta. O banco também usa `source_event_id` único e `sent_at` para impedir duplicação no cron.

Quando o cliente está aberto ou instalado em segundo plano com permissão de notificações, o app recebe as linhas novas por Realtime ou por consulta periódica de um minuto e mostra o aviso no Klipza; se a permissão do navegador estiver concedida e a página estiver oculta, também tenta gerar uma notificação do navegador. Com o app completamente fechado, não há push nativo nesta versão porque não existe servidor de push/worker de entrega configurado; nesse caso, o aviso permanece salvo no Supabase e aparece quando a conta voltar a abrir o app.

## Teste sintético

O teste fora do banco simulou os marcos de 90, 30 e 7 dias e o marco de exclusão em 24 meses. O resultado esperado foi obtido uma vez para cada evento: `warning_90d`, `warning_30d`, `warning_7d` e `deletion_queued`. Uma segunda execução do mesmo marco não aumentou a quantidade de eventos, representando a idempotência do cron.

Também foram validados estaticamente os nomes das tabelas pessoais, a limpeza de Storage, a exigência de `service_role`, o `delete` final de `auth.users`, o Realtime/polling de notificações e a remoção dos caches locais do app e do Studio no logout/limpeza local.

## Limitação da confirmação em produção

Não foi executado o cron nem criado usuário de teste no Supabase de produção nesta sessão. Portanto, o relatório comprova o contrato no código e a simulação determinística, mas não afirma que o Dashboard já aplicou a nova migração, que o pg_cron está habilitado ou que uma notificação real já foi entregue a um dispositivo. Para ativar, aplicar as migrações pendentes, incluindo `20260822000004_complete_account_cleanup.sql`, e executar um teste administrativo controlado com conta de teste.
