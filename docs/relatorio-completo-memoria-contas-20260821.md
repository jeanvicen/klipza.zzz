# Relatório completo — memória inteligente e gestão de contas do Klipza.IA

**Projeto:** `jeanvicen/klipza.zzz`  
**Aplicação:** Klipza.IA  
**Data:** 21 de agosto de 2026  
**Autor:** Manus AI  
**Estado:** implementado no branch `main`, com migração de produção aplicada e deploy automático no Vercel.

## 1. Escopo e resultado

Esta etapa adicionou uma camada modular de memória por usuário, controles de privacidade e retenção, exportação, snapshots e restauração, além de ajustes no modo de IA, artefatos, configurações e histórico. A implementação preserva a arquitetura existente — frontend estático, funções serverless e Supabase — e evita guardar memória ilimitada no JSON de estado do aplicativo.

| Área | Resultado | Local principal |
|---|---|---|
| Memória por conta | Tabelas normalizadas, deduplicação por chave e hash, prioridade e retenção | `supabase/migrations/20260821000007_memory_accounts.sql` |
| API privada | Leitura, gravação, exclusão, configurações, notificações, exportação e restauração | `api/memory.js`, `api/_auth.js` |
| Contexto de IA | Memórias autorizadas entram apenas no contexto do usuário autenticado | `api/ai.js` |
| Pensamento profundo | Modo configurável, sem expor raciocínio privado | `index.html` |
| Qwen/Hermes | Roteamento opcional por variáveis de ambiente, com fallback seguro | `api/ai.js` |
| Artefatos | Blocos de código úteis geram artefatos automaticamente e HTML tem preview sandbox | `index.html` |
| Histórico | Limite rígido de 50 conversas recentes por conta | `index.html` |
| Inatividade | Avisos em 90, 30 e 7 dias antes do ciclo de 24 meses | migrações de ciclo de vida e memória |
| Relatórios | Este documento e a auditoria técnica anterior ficam versionados no GitHub | `docs/` |

## 2. Arquitetura de dados e isolamento

As memórias não são armazenadas junto ao estado local ou no estado JSON compartilhado do aplicativo. Cada registro possui `user_id`, `memory_key`, conteúdo normalizado, classe de retenção, prioridade, confiança, hash de conteúdo e timestamps. A chave única composta por `(user_id, memory_key)` e a chave única `(user_id, content_hash)` impedem que a mesma conta acumule duplicatas previsíveis.

> O isolamento de uma memória é uma propriedade do banco: as políticas RLS usam `auth.uid() = user_id`, e as funções de negócio validam o usuário autenticado antes de criar, atualizar, restaurar ou podar dados.

| Tabela | Finalidade | Proteção |
|---|---|---|
| `public.user_memories` | Memórias úteis e seus metadados | RLS de leitura, inserção, alteração e exclusão do próprio usuário |
| `public.user_memory_settings` | Ativação, modo de captura, limite e avisos | RLS de leitura, inserção, alteração e exclusão do próprio usuário |
| `public.user_notifications` | Avisos privados de inatividade e organização | RLS do próprio usuário; usuário não insere notificações arbitrárias |
| `public.user_data_backups` | Snapshots e exportações versionadas | RLS de leitura e inserção do próprio usuário; payload privado |

A API valida o bearer token no servidor com o Supabase Auth e cria um cliente com o JWT do usuário para que `auth.uid()` seja preservado nas chamadas às RPCs. Consultas administrativas ou com service role não são expostas ao navegador. As respostas têm `Cache-Control: no-store`, e o endpoint sem autenticação foi verificado retornando HTTP 401.

## 3. Captura, prioridade e deduplicação

O modo padrão é **Sugestivo**. Nesse modo, a captura automática considera somente declarações explícitas, como “meu nome é”, “prefiro”, “gosto de” e “lembre que”. O usuário pode escolher **Automático** para ampliar a identificação de informações úteis ou **Desativado** para impedir leitura e gravação de memórias. O botão “Adicionar” permite criar uma memória manual, mas orienta a não inserir senhas, tokens ou dados sensíveis.

A função `upsert_user_memory` normaliza espaços e chaves, calcula `md5` do conteúdo normalizado e atualiza a memória existente quando a chave ou o hash já pertencem à conta. A nova versão conserva a maior prioridade e a maior confiança, marca confirmações feitas pelo usuário e restaura registros arquivados quando aplicável.

| Classe | Tratamento | Exemplo de prioridade |
|---|---|---:|
| `permanent` | Preservada pela poda normal, salvo exclusão manual ou política futura | Nome preferido, instrução explícita |
| `standard` | Pode ser revisada se a conta crescer além do limite | Preferência ou fato de projeto |
| `temporary` | Expira por `expires_at` e é removida primeiro na poda | Contexto de uma tarefa curta |

A rotina de poda remove memórias expiradas e, quando necessário, prioriza registros temporários de menor prioridade e menor uso. O limite padrão é 200 por conta, configurável entre 20 e 5.000. O desenho é deliberadamente conservador: memórias permanentes não são resumidas por um modelo sem uma política adicional de consentimento; quando a conta excede o limite, o sistema remove temporárias antes de considerar qualquer classe mais durável.

## 4. Retenção, inatividade e notificações

A rotina diária existente do ciclo de vida da conta foi estendida, sem criar um segundo cron paralelo. O job `klipza-account-lifecycle-daily` chama o processamento de ciclo de vida, poda de memórias, criação de notificações de memória e expurgo devido. As notificações de inatividade são alimentadas pelos eventos de 90, 30 e 7 dias já existentes antes da revisão de uma conta sem atividade por 24 meses.

Os avisos são gravados por usuário em `user_notifications` e aparecem na central da conta na próxima sessão. O aplicativo pode exibir o aviso dentro do app e, se o usuário conceder permissão, utilizar a notificação do navegador já existente. Não foi inventado envio de e-mail: isso exigiria um provedor transacional e uma configuração de produção ainda não confirmados.

## 5. Exportação e recuperação

A opção **Exportar JSON** chama `create_user_data_backup` com o tipo `export`, gera uma cópia privada no Supabase e baixa um arquivo JSON para o dispositivo. O payload inclui memórias, preferências de memória e o `app_user_state` já sincronizado. Os snapshots privados podem ser criados pela interface e aparecem na lista de backups com checksum e data.

A restauração usa `restore_user_data_backup`, verifica o checksum, mescla as memórias por meio da mesma função de deduplicação e restaura as preferências de memória. Dessa forma, a recuperação não cria cópias repetidas. A versão atual restaura explicitamente memórias e configurações; o estado completo do aplicativo continua disponível no payload exportado para uma futura rotina de recuperação integral, caso seja necessário ampliar o escopo.

## 6. Pensamento profundo e provedores opcionais

O modo **Pensamento profundo** fica dentro de **Mais** e também em **Configurações → Pensamento e IA**. Quando ativo, o backend acrescenta instruções para analisar requisitos, riscos, casos-limite, compatibilidade e critérios de qualidade antes de responder. O produto não exibe cadeia de raciocínio privada; exibe somente um resumo útil quando a própria resposta final considerar isso apropriado.

A seleção de provedor nunca recebe chave do frontend. O backend aceita `provider: auto`, `groq`, `qwen` ou `hermes`. No modo automático, Qwen ou Hermes só são tentados se a respectiva base URL e chave estiverem configuradas no servidor; caso contrário, o fluxo usa Groq. Se uma seleção opcional falhar, o backend mantém fallback para Groq quando possível.

| Variável | Necessidade | Estado desta entrega |
|---|---|---|
| `QWEN_BASE_URL` | URL compatível com OpenAI, incluindo workspace/região | Não definida automaticamente |
| `QWEN_API_KEY` ou `DASHSCOPE_API_KEY` | Chave do Model Studio | Não versionada |
| `QWEN_MODEL` | Padrão `qwen-plus` | Configurável |
| `HERMES_BASE_URL` | Endpoint HTTPS de um servidor Hermes mantido pelo usuário | Não definido automaticamente |
| `HERMES_API_KEY` | Chave do gateway Hermes | Não versionada |
| `HERMES_MODEL` | Modelo exposto pelo gateway | Configurável, padrão `hermes-agent` |

A chave com prefixo `sk-ws` foi tratada como compatível com o ecossistema Qwen/Alibaba Model Studio, não como uma “API QWE” universal. A documentação do Model Studio usa endpoints compatíveis com OpenAI que dependem de região e workspace [1]. O Hermes Agent, por sua vez, documenta um servidor/gateway que precisa estar em execução e acessível, com endpoint OpenAI-compatible e chave do próprio gateway [2]. Portanto, a integração foi preparada, mas nenhuma chave exposta em conversa foi inserida no código, no GitHub, no localStorage, em URLs ou em logs.

## 7. Artefatos automáticos e preview

A resposta final é analisada por blocos Markdown de código. Blocos úteis recebem automaticamente um arquivo com extensão compatível; HTML recebe `index.html`. O item é salvo na aba Artefatos sem exigir que o usuário diga “criar artefato”. A criação continua desativada para mensagens anônimas, pois esse modo não deve persistir dados na conta.

O preview de HTML é aberto em um iframe com `sandbox="allow-scripts"`, sem `allow-same-origin`, reduzindo o alcance do conteúdo gerado. JavaScript, CSS e outras linguagens são exibidos como código textual. A criação manual existente continua disponível para casos em que o usuário queira nomear e colar um arquivo específico.

## 8. Histórico e configurações

O aplicativo agora aplica `MAX_HISTORY_CHATS = 50` no salvamento local e na sincronização remota. Quando o limite é ultrapassado, as conversas menos recentes são removidas do conjunto de histórico sincronizado. A central de configurações mostra o contador atual e explica a regra ao usuário.

A nova seção **Memória da conta** permite ligar ou desligar a memória, escolher o modo de captura, ajustar o limite, controlar avisos de inatividade, revisar prioridades, apagar memórias, adicionar uma memória manual, exportar JSON, criar snapshot e restaurar backup. A seção **Pensamento e IA** controla o modo profundo, o provedor preferido e informa que os artefatos são criados automaticamente.

## 9. Testes executados

A validação automatizada executada no repositório foi:

| Teste | Resultado |
|---|---|
| `node --check api/_auth.js` | OK |
| `node --check api/memory.js` | OK |
| `node --check api/ai.js` | OK |
| `pnpm check:html` | OK |
| `pnpm build:web` | OK |
| `git diff --check` | OK |
| `GET /api/memory` sem bearer | HTTP 401 |
| Carregamento público autenticado | OK |
| Menu Mais e toggle de Pensamento profundo | OK; `Desativado` → `Ativo` |
| Central de Memória da conta | OK; endpoint chamado no navegador |
| Upsert de memória sintética | HTTP 200 |
| Exclusão da memória sintética | HTTP 200; removida imediatamente |
| Artefatos e preview existentes | Mantidos e compatíveis |

O teste de memória usou uma frase sintética, sem dados pessoais, e removeu o registro imediatamente. A validação confirma o caminho autenticado e a deduplicação básica; um teste entre duas contas reais deve ser executado em ambiente de homologação com dois usuários controlados antes de uma auditoria de produção.

## 10. Operação segura e próximos passos

As chaves QWE e Hermes fornecidas durante a solicitação não foram armazenadas, mas foram expostas no histórico da conversa. Elas devem ser **revogadas e substituídas** antes de qualquer uso. Depois da rotação, o administrador pode configurar somente no ambiente server-side do Vercel: `QWEN_BASE_URL`, `QWEN_API_KEY`, `QWEN_MODEL`, `HERMES_BASE_URL`, `HERMES_API_KEY` e `HERMES_MODEL`. Não coloque essas variáveis no frontend nem em arquivos `.env` versionados.

A operação diária deve acompanhar o crescimento das tabelas por índices de `user_id`, prioridade e atualização, revisar o volume de backups e monitorar erros serverless. Para milhões de usuários, o caminho de escala é manter as funções stateless, limitar payloads, usar paginação para telas de memória, separar exportações grandes em jobs assíncronos e mover embeddings/busca semântica para uma camada especializada somente quando houver necessidade comprovada.

## 11. Histórico de publicação

A nova arquitetura foi publicada no branch `main` em commits separados para facilitar auditoria:

| Commit | Conteúdo |
|---|---|
| `cadac94` | Memória por conta, API privada, migração, configurações, pensamento profundo, artefatos automáticos e limite de 50 |
| `60280ed` | Correção do status visual do Pensamento profundo |
| `5e7e43d` | Memória aplicada também a pesquisa e análise de anexos |

A migração `20260821000007_memory_accounts.sql` foi executada no projeto Supabase de produção e retornou `Success. No rows returned`. O deploy público foi verificado por HTTP e no navegador autenticado.

## Referências

[1]: https://www.alibabacloud.com/help/en/model-studio/first-api-call-to-qwen "Alibaba Cloud Model Studio — Make your first API call to Qwen"

[2]: https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server "Hermes Agent — API Server"
