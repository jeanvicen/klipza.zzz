# Achados da auditoria de segurança

## Documentação oficial consultada

A documentação do Supabase recomenda ativar RLS em toda tabela exposta e controlar simultaneamente grants e policies; policies sozinhas não removem privilégios já concedidos. O papel `service_role` ignora RLS e deve permanecer somente no servidor. Views criadas de forma insegura podem ignorar RLS e expor linhas protegidas.

Para apagar uma conta de modo que ela não consiga mais autenticar, a documentação recomenda excluir o usuário de `auth.users` pela API administrativa. A exclusão padrão remove sessões e invalida refresh tokens; uma simples marcação na tabela pública ou um ban temporário não substitui a exclusão. Um access token JWT já emitido pode continuar válido até expirar, portanto o projeto deve usar expiração curta e/ou validar `session_id` em operações sensíveis.

Fontes: https://supabase.com/docs/guides/database/postgres/row-level-security e https://supabase.com/docs/guides/auth/managing-user-data


## Estado observado no painel Supabase

O Table Editor autenticado do projeto mostra as tabelas públicas `account_deletions`, `artifacts`, `conversations`, `profiles` e `purchases`, todas marcadas como expostas pela Data API. O repositório `jeanvicen/klipza.zzz` não contém diretório `supabase/` nem migrações rastreadas, apesar de o schema existir no banco. Isso impede reproduzir ou revisar pelo GitHub as políticas, grants, índices, constraints e rotinas de limpeza; é um achado de organização e governança que precisa ser corrigido.


## RLS observado no banco

Consulta somente de leitura no SQL Editor autenticado confirmou:

| Tabela | RLS | FORCE RLS | Policies |
|---|---:|---:|---:|
| `account_deletions` | ativo | não | 1 |
| `artifacts` | ativo | não | 4 |
| `conversations` | ativo | não | 4 |
| `profiles` | ativo | não | 2 |
| `purchases` | ativo | não | 1 |

O RLS está ligado em todas as cinco tabelas, o que é positivo. Ainda é necessário auditar o conteúdo de cada policy, grants efetivos, constraints, cascatas e funções privilegiadas; a ausência de `FORCE ROW LEVEL SECURITY` não é automaticamente uma falha, mas deve ser avaliada junto com o papel que executa as funções e com o acesso administrativo.


## Policies observadas

A consulta de `pg_policies` retornou 12 policies. `artifacts` e `conversations` têm SELECT, INSERT, UPDATE e DELETE limitados por `user_id = auth.uid()`. `profiles` tem SELECT e UPDATE limitados por `id = auth.uid()`. `purchases` tem somente SELECT próprio. `account_deletions` tem somente SELECT próprio; não há policy pública de INSERT, UPDATE ou DELETE.

Essa configuração evita que o cliente autenticado escreva diretamente em compras ou crie/exclua solicitações de conta por REST. Porém, também significa que o fluxo de solicitação de exclusão precisa de uma função/endpoint controlado ou de uma policy específica cuidadosamente limitada; o app não deve receber `service_role`. Não existe policy administrativa pública, o que é correto para segurança, mas exige uma superfície administrativa separada e protegida.


## Integridade referencial e exclusão

A consulta de foreign keys no schema `public` retornou **0 linhas**. Embora as tabelas tenham colunas `user_id`/`id`, não existe constraint referenciando `auth.users(id)`. Portanto, excluir um usuário do Supabase Auth não garante a remoção de conversas, artefatos, compras, perfil ou solicitação de exclusão; os dados públicos podem ficar órfãos. Esse é um achado crítico para o requisito de apagar conta e deve ser corrigido com foreign keys `on delete cascade` ou uma rotina administrativa transacional explicitamente versionada.

A tabela `profiles` também não possui coluna de última atividade; os campos observados são criação e atualização. Para uma regra de inatividade de 1–2 anos, será necessário registrar `last_seen_at`/`last_activity_at` de forma controlada, com atualização em login e em ações relevantes, sem confiar somente em `updated_at` de conteúdo.


## Triggers e automação observados

O banco possui apenas cinco triggers relevantes: criação de perfil após `auth.users`, atualização automática de `updated_at` em `artifacts`, `conversations`, `profiles` e `purchases`. Não foi encontrada trigger ou rotina de limpeza para `account_deletions`, não foi encontrado registro de última atividade e não foi observada automação de exclusão por inatividade. A tabela `account_deletions` tem campos de agendamento, mas eles não estão ligados a um worker/cron confirmado.


## Estado atual de usuários

Consulta agregada em `auth.users` retornou `total_users = 0`, sem contas antigas ou sessões existentes. Isso reduz o risco de migração imediata: as correções de integridade e de ciclo de vida podem ser aplicadas antes do primeiro cadastro real, sem precisar transformar dados de usuários atuais.


## Funções SECURITY DEFINER e privilégios de execução

O banco possui funções `public.cancel_account_deletion`, `public.handle_new_user`, `public.purge_due_accounts`, `public.request_account_deletion` e `public.rls_auto_enable` marcadas como `SECURITY DEFINER`.

Os privilégios observados foram:

| Função | anon | authenticated | risco a revisar |
|---|---:|---:|---|
| `cancel_account_deletion()` | não | sim | precisa validar que só cancela a própria conta |
| `handle_new_user()` | não | não | trigger interna; deve ter `search_path` fixo |
| `purge_due_accounts()` | não | não | apropriado manter somente administrativo/cron |
| `request_account_deletion(text)` | não | sim | precisa validar `auth.uid()` e limitar a própria solicitação |
| `rls_auto_enable()` | sim | sim | **alto risco**: função de manutenção de segurança está executável por clientes |
| `set_updated_at()` | sim | sim | baixo isoladamente, mas deve ser restrita se não for chamada pelo trigger בלבד |

A exposição de `rls_auto_enable()` a `anon`/`authenticated` deve ser removida. As funções SECURITY DEFINER precisam definir `search_path` seguro, validar identidade e receber somente os privilégios mínimos necessários.


## Definições das funções

As funções `request_account_deletion` e `cancel_account_deletion` validam `auth.uid()` e operam sobre a própria conta. `purge_due_accounts` percorre solicitações pendentes e executa `delete from auth.users` após `scheduled_for`, mas não remove os registros públicos órfãos porque não há foreign keys. Os `search_path` estão configurados (`public` ou `public, auth`), o que é melhor que deixar o caminho implícito.

`rls_auto_enable` é uma função de event trigger com `search_path=pg_catalog`, mas seu privilégio EXECUTE está aberto para `anon` e `authenticated` sem necessidade. `set_updated_at` também pode ser executada por clientes, embora pareça ser apenas helper de trigger. O endurecimento recomendado é revogar EXECUTE de funções auxiliares e conceder somente a funções de aplicação ou triggers quando necessário.


## Event triggers

A consulta corrigida de `pg_event_trigger` mostrou sete event triggers internos do Supabase, mas nenhum trigger customizado `ensure_rls` ou outro vínculo à função pública `rls_auto_enable`. Assim, a função de RLS automático está exposta sem cumprir uma função operacional observada; deve ser removida ou ter EXECUTE revogado e permanecer apenas como mecanismo de migração controlado, se ainda for necessária.


## Agendamento

A consulta de extensões retornou zero linhas para `pg_cron` e `pg_net`. Não há, portanto, um job nativo confirmado para executar `purge_due_accounts`; a existência da função de limpeza não significa que a exclusão automática esteja funcionando. Para uma regra de 1–2 anos, será necessário instalar/configurar um agendador controlado ou executar a limpeza por uma função/serviço administrativo seguro.


## GitHub e organização do repositório

O repositório `jeanvicen/klipza.zzz` está **público**. O branch `main` não possui proteção configurada, e a consulta de workflows não retornou pipelines ativos. Isso facilita publicação acidental sem revisão e deixa validações de segurança dependentes do ambiente local. O repositório não expõe secrets registrados na auditoria do shell, mas a variável de ambiente Supabase disponível no sandbox estava malformada e não deve ser usada como fonte de configuração sem correção.

Recomendação: manter o código público somente se essa for a decisão consciente; ativar proteção do `main`, exigir pull request/revisão quando possível, adicionar CI para `check:html`, testes web.klip, `pnpm audit` e validações de segredos, e nunca colocar service role, SMTP password ou credenciais administrativas no GitHub.


## Referências oficiais para a arquitetura

A documentação oficial do Supabase informa que Cron usa `pg_cron`, armazena jobs em `cron.job`, registra execuções em `cron.job_run_details` e pode executar SQL, funções ou chamadas HTTP para Edge Functions [1]. A referência de Auth Admin informa que `auth.admin.deleteUser` exige uma chave com privilégios administrativos e que essa operação deve ser chamada somente em servidor; a `service_role` nunca deve ser exposta no navegador [2].

Essas referências sustentam a arquitetura recomendada: o cliente usa somente a chave publicável; a exclusão real de `auth.users`, bloqueios administrativos e troca forçada de senha ficam em uma Edge Function/servidor protegido; a execução recorrente fica no Cron do Supabase ou em uma alternativa externa monitorável.

[1]: https://supabase.com/docs/guides/cron
[2]: https://supabase.com/docs/reference/javascript/auth-admin-deleteuser


## SSRF no web.klip

O endpoint `/api/webklip?check=URL` faz requisições server-side para uma URL controlada pelo usuário e segue redirects. A validação atual aceita qualquer host HTTP/HTTPS e não revalida o destino final contra localhost, redes privadas, link-local, metadata endpoints ou DNS rebinding. Isso não significa que houve exploração, mas representa uma superfície SSRF que precisa de correção antes de considerar o app 100% seguro. A OWASP recomenda validar protocolo e destino, controlar redirects e aplicar validação de rede/allowlist conforme o caso [3].

[3]: https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html


## Status da conta

O enum `klipza_account_status` possui somente `active`, `blocked` e `pending_deletion`. Não existe estado de aviso de inatividade ou restrição, então a política de 1–2 anos deve usar colunas de controle e notificações ou adicionar estados versionados com cuidado. A sessão do SQL Editor expirou após a consulta; nenhuma alteração foi executada nesta auditoria.


## Aplicação live

Em 20 de agosto de 2026, a migração `20260820000001_security_lifecycle.sql` foi executada com sucesso no projeto `klipza.ia` pelo SQL Editor autenticado. O resultado foi `Success. No rows returned`; não havia usuários Auth no momento da aplicação. O job diário do Cron ainda não foi aplicado, pois a extensão Cron/`pg_cron` precisa ser habilitada separadamente no Dashboard.


## Cron live

Em 20 de agosto de 2026, a integração Supabase Cron foi instalada com sucesso no projeto `klipza.ia`. O Dashboard mostra `Cron`, `pg_cron` e o status `Installed`; o job de ciclo de vida ainda precisa ser criado pela migração versionada `20260820000002_cron.sql`.


## Job de ciclo de vida live

A migração `20260820000002_cron.sql` foi executada com sucesso em 20 de agosto de 2026 após a instalação do `pg_cron`, com resultado `Success. No rows returned`. Ela agenda `klipza-account-lifecycle-daily` às 03:15 UTC e chama `public.process_account_lifecycle()` seguido de `public.purge_due_accounts()`; a existência do job será confirmada no painel Cron.


## Validação do job Cron

A lista live do Supabase Cron confirma 1 job ativo chamado `klipza-account-lifecycle-daily`, com agenda `15 3 * * *`, próximo disparo em `21 Aug 2026 03:15:00 (+0000)` e comando `select public.process_account_lifecycle(); select public.purge_due_accounts();`. O painel informa que ainda não houve execução, pois o primeiro horário ainda não chegou.


## Variáveis de produção

A página correta do Vercel é o projeto `klipza-zzz` no time `jeanvicens-projects`; ela informa `No Environment Variables Added`. O endpoint administrativo depende de `SUPABASE_SERVICE_ROLE_KEY`, portanto essa variável ainda precisa ser criada no ambiente Production junto com `SUPABASE_URL`. A chave service_role foi localizada somente na seção protegida `Supabase → Settings → API Keys → Legacy`; seu valor não foi copiado para o repositório, arquivo ou mensagem.


## Vercel live

No projeto `jeanvicens-projects/klipza-zzz`, foram cadastradas as variáveis sensíveis `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_URL`; o painel confirmou `Added just now` e `Production and Preview`. O redeploy solicitado foi criado e ficou `Ready` em produção, com domínio `https://klipza-zzz.vercel.app/`. Essa implantação ainda aponta para o commit `11581ee`; as alterações locais de hardening/admin precisam ser commitadas e enviadas ao `main` para o deploy automático final.


## Validação pós-deploy

Após a propagação do commit `77689e4`, `https://klipza-zzz.vercel.app/admin.html` respondeu `200` e `https://klipza-zzz.vercel.app/api/admin-users` respondeu `401 {"error":"Não autenticado."}`, confirmando que a função existe e permanece protegida sem token. O domínio de deployment recebeu redirecionamento `302`, enquanto o domínio de produção respondeu diretamente.


## Administrador inicial

A tela Auth Users do projeto confirmou que não há usuários cadastrados. Portanto, não foi executado nenhum `UPDATE public.profiles SET is_admin=true` sem um UUID real. Depois que o proprietário criar e confirmar a primeira conta no app, o UUID dessa conta deverá ser usado uma única vez no SQL Editor para marcar `is_admin=true`; até lá, o endpoint admin permanece corretamente sem uma conta administrativa ativa.

