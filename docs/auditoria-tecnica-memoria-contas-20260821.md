# Auditoria inicial do Klipza.IA — nova etapa

## Estado atual

O repositório `jeanvicen/klipza.zzz` é um frontend HTML/CSS/JavaScript estático publicado no Vercel, com funções serverless em `api/` e Supabase como camada de autenticação e persistência. `index.html` contém o chat, configurações, histórico, artefatos, compositor e sincronização de estado. `api/ai.js` autentica o bearer token com `SUPABASE_SERVICE_ROLE_KEY` e hoje roteia chat para Groq e pesquisa/visão para Gemini, sem memória persistente, QWE ou Hermes.

A tabela `app_user_state` armazena um JSON por `user_id` com conversas, artefatos, quota, preferências e Studio. A função `sync_app_user_state` usa `auth.uid()` em `security definer`, com RLS/grants restritos. A migração de ciclo de vida já tem `profiles.last_activity_at`, avisos de 90/30/7 dias antes de 24 meses e filas de exclusão; `pg_cron` agenda esse processamento uma vez por dia. A camada administrativa usa bearer + `profiles.is_admin` e registra auditoria.

O histórico lateral atualmente lista todas as conversas; precisa ser limitado a 50 novas conversas por conta. A seção de dados ainda mostra exportação como “Em breve”. A aba de configurações tem seções funcionais de conta, dados, notificações e segurança, mas precisa receber controles de memória, exportação, recuperação e retenção. Os artefatos atualmente são criados por ação explícita ou pelo botão de bloco; a criação automática por resposta precisa ser adicionada no pipeline.

## Decisões de segurança

As chaves fornecidas pelo usuário não serão inseridas em arquivos, commits, URLs, logs, frontend, localStorage ou prompts persistidos. A integração deve receber segredos exclusivamente por variáveis de ambiente do Vercel/Supabase. A memória usará `user_id` como chave e políticas RLS `auth.uid() = user_id`; funções `security definer` terão `search_path` fixo, validação de tamanho e grants mínimos. Exportação e restauração serão autenticadas por bearer e limitadas ao próprio usuário; operações administrativas separadas exigirão `is_admin` e auditoria.

Para escalar, memórias serão linhas normalizadas em tabela própria, não um JSON ilimitado em `app_user_state`. Índices serão compostos por usuário, status, prioridade e atualização. O armazenamento será limitado por conta e por conteúdo, com deduplicação por hash normalizado e atualização de memória existente em vez de inserção repetida. Backups serão snapshots versionados, privados e vinculados a `user_id`; o app não usará URLs públicas.

## QWE/Qwen

A chave com prefixo `sk-ws` corresponde ao padrão atual de chaves do Alibaba Cloud Model Studio, não a um serviço chamado “QWE”. A documentação oficial informa que o Model Studio oferece interfaces compatíveis com OpenAI e que as URLs variam por região/workspace. O exemplo de Singapore usa `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions`, `Authorization: Bearer $DASHSCOPE_API_KEY` e o modelo `qwen-plus`. A implementação deve deixar `QWEN_BASE_URL`, `QWEN_API_KEY` e `QWEN_MODEL` configuráveis; sem uma base URL/workspace confirmada, a integração deve permanecer desativada e usar o provedor atual.

Fonte: [Alibaba Cloud Model Studio — Make your first API call to Qwen](https://www.alibabacloud.com/help/en/model-studio/first-api-call-to-qwen).

## Hermes

A documentação oficial do Hermes Agent descreve um servidor local/gateway que expõe endpoints OpenAI-compatíveis como `POST /v1/chat/completions`, `POST /v1/responses`, `GET /v1/models` e `GET /health`. O servidor precisa estar executando e ter um provedor configurado; a chave `API_SERVER_KEY` autentica o gateway. O streaming pode emitir eventos SSE de tokens e eventos `hermes.tool.progress`. Isso não é uma API hospedada universal automaticamente disponível no Vercel: para produção, é necessário um endpoint Hermes acessível por HTTPS ou um gateway mantido pelo usuário. O código deve aceitar `HERMES_BASE_URL`, `HERMES_API_KEY` e `HERMES_MODEL`, aplicar timeout e fallback seguro, e nunca chamar Hermes se a configuração estiver incompleta.

Fonte: [Hermes Agent — API Server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server).

## Rotinas de retenção

A rotina existente já cobre aviso de inatividade da conta, mas a nova camada precisa incluir ciclo de memória: memórias temporárias serão resumidas/removidas quando ultrapassarem a cota; memórias permanentes e de alta prioridade serão preservadas. A limpeza diária deve ser idempotente, limitada por lote, auditável e executada pelo cron do Supabase, sem criar polling frequente no navegador. A notificação de aviso precisa ser gravada como evento por usuário e exibida na próxima sessão; envio de e-mail só deve ser implementado se houver provedor/configuração confirmados.

A migração `20260821000007_memory_accounts.sql` foi criada no repositório e carregada no SQL Editor sem segredos. Ela contém 4 tabelas privadas, políticas RLS, índices por usuário/prioridade, funções de upsert/deduplicação, poda por prioridade, backup/restauração e notificações de inatividade/memória. O editor confirmou 18.559 caracteres e 263 linhas.

A migração foi executada no Supabase de produção e retornou `Success. No rows returned`. As quatro tabelas, políticas e funções foram aceitas pelo banco.

## Validação pública da etapa de memória

A versão `60280ed` carregou no Vercel com sessão autenticada. O menu Mais exibiu `Studio Klip` e `Pensamento profundo`, sem template literal visível; o toggle mudou de `Desativado` para `Ativo` e exibiu a confirmação no chat. A central de configurações exibiu a seção `Memória da conta` com captura sugestiva, limite padrão de 200, avisos de inatividade, adicionar/apagar, exportar JSON, snapshot e restauração.

O navegador registrou chamadas reais a `/api/memory` autenticadas enquanto a seção era carregada. O painel retornou zero memórias e nenhum backup/notificação para a conta de teste, sem exibir dados de outra conta. O endpoint sem autenticação respondeu HTTP 401.

Foi enviado um pedido explícito de memória de teste em sessão autenticada com Pensamento profundo ativo. A resposta foi concluída normalmente; o chat permaneceu isolado e sem exposição de dados. A seguir, a memória de teste será conferida na central da conta e removida para não poluir os dados do usuário.

O endpoint autenticado também foi exercitado com uma memória sintética temporária: `upsert` retornou HTTP 200, produziu um ID e `delete` retornou HTTP 200. O registro de teste foi removido imediatamente; nenhum conteúdo real foi incluído no relatório.

Na checagem final do commit `ca0d7e8`, a aba Artefatos carregou o item existente e o botão `Abrir preview` abriu o HTML com sucesso dentro do painel isolado. O frontend respondeu HTTP 200 e os marcadores de memória, histórico de 50 e artefatos automáticos estavam presentes; `/api/memory` sem bearer continuou respondendo HTTP 401.
