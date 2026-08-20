# Diagnóstico Auth — 20 Aug 2026

O painel Supabase Authentication > Sign In / Providers confirmou que **User Signups** está habilitado, **Email** está habilitado e a configuração **Confirm email** está disponível. O texto do painel informa que, quando Confirm email está habilitado, o usuário precisa confirmar o e-mail antes do primeiro login. Isso explica por que `auth.signUp()` pode retornar `data.user` sem `data.session`; o fluxo atual tratava esse caso somente como aviso de confirmação e não fazia login automático.

Ainda é necessário verificar o erro concreto relatado no cadastro, melhorar a mensagem de erro para não mascarar falhas do Supabase e decidir/configurar explicitamente a confirmação de e-mail conforme o requisito de entrar direto após o cadastro.


A consulta de esquema confirmou que `public.profiles` tem `display_name` NOT NULL com default `'Usuário Klipza'`, `country` NOT NULL com default `BR`, `language` NOT NULL com default `pt-BR`, `status` NOT NULL com default `active` e as colunas de lifecycle com defaults. Não foi identificado, nesse resultado, um campo obrigatório que explique sozinho o erro. O SQL Editor mostrou 17 colunas em `profiles`; os resultados de função/trigger precisam ser consultados separadamente porque o painel exibiu a última seleção como resultado ativo.


A função live `public.handle_new_user()` foi consultada e está definida como `SECURITY DEFINER`, com `search_path = public`, inserindo `id`, `display_name`, `email` e `avatar_url` em `public.profiles`, usando `coalesce` e `on conflict`. A definição não referencia colunas removidas e parece compatível com o esquema atual. A trigger associada a `auth.users` ainda será consultada isoladamente.


A trigger live também está presente: `on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user()`. Portanto, a criação de perfil deveria ocorrer automaticamente; o diagnóstico agora aponta para configuração de confirmação de e-mail, política de senha ou um erro do endpoint Auth que precisa de mensagem mais específica, não para ausência do trigger.


A configuração foi salva no Supabase após confirmação explícita do usuário. Estado acessível live: `signup=true`, `manualLinking=false`, `anonymous=false`, `confirmEmail=false`. Assim, novos cadastros por e-mail podem receber sessão imediatamente; nenhum provedor social ou login anônimo foi ativado.

