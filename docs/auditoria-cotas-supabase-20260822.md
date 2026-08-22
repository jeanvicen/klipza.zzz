# Auditoria de energia, tokens e limites do Klipza

**Data:** 22 de agosto de 2026  
**Autor:** Manus AI  
**Escopo:** energia diária, tokens comprados, anexos, mensagens de IA, artefatos, Modo Especialista, histórico, sincronização de conta e isolamento entre usuários.

## Conclusão executiva

A auditoria confirmou que os saldos autoritativos devem ficar em `profiles` e nos ledgers do Supabase. O navegador agora trata seus valores locais apenas como cache visual: ele não envia mais `quota` no snapshot remoto e não pode sobrescrever energia, tokens ou contadores de anexos por meio de `sync_app_user_state`.

As mensagens autenticadas de IA passaram a enviar apenas uma chave estável e os custos esperados. O servidor chama uma RPC baseada em `auth.uid()`, usa energia primeiro e tokens como fallback quando a energia não cobre o custo. A operação é idempotente por evento e possui estorno idempotente em falha da IA. Anexos são debitados na mesma requisição de envio, e não no momento em que o arquivo é apenas selecionado; se a IA falhar, o limite de anexos é estornado pela chave da mensagem.

O Modo Especialista permanece separado da cobrança normal: o plano pode ser gerado antes da confirmação, a cota de três usos em janela de 48 horas é consumida somente ao iniciar o job confirmado, e as etapas só são executadas pelo worker interno. O indicador visual no compositor não altera nenhuma quota.

> **Estado de aplicação:** as migrações descritas neste documento estão no repositório e foram validadas estaticamente. A sessão não teve uma conexão administrativa autorizada para confirmar a aplicação no banco de produção. Portanto, não se deve considerar a cobrança server-side ativa em produção até executar as migrações no SQL Editor do Supabase, na ordem indicada.

## Matriz de fonte de verdade

| Recurso | Fonte oficial | Operação | Idempotência | Estado após a correção |
|---|---|---|---|---|
| Energia diária | `profiles.energy_balance` + `user_energy_ledger` | RPC autenticada por `auth.uid()` | `event_key` único | Server-side |
| Tokens comprados | `profiles.token_balance` + `wallet_ledger` | RPC autenticada por `auth.uid()` para o usuário; função com `user_id` somente para serviço | `event_key` único | Server-side |
| Anexos gratuitos | `profiles.attachment_used` + `user_attachment_ledger` | RPC autenticada por `auth.uid()` no envio | `event_key` único | Server-side |
| Artefatos | `user_energy_ledger`, 15 pontos por artefato | RPC própria do artefato | chave por artefato | Server-side |
| Modo Especialista | `expert_mode_usage` | RPC de consumo na confirmação/início | `event_key` único | Server-side, após migração Expert |
| Histórico | `app_user_state.chats` e estado local de interface | sincronização por conta | upsert por usuário | Retenção visual de 50 conversas; não é saldo |
| Configuração visual | `app_user_state.settings` | sincronização por conta | upsert por usuário | Não controla saldo |

## Correções aplicadas

### Energia e tokens das mensagens

O endpoint `/api/ai` agora exige uma chave de cobrança válida para chamadas normais. O servidor associa essa chave ao usuário autenticado e não aceita que o cliente escolha outro `user_id`. O custo padrão é de 2 pontos para uma mensagem normal e 7 pontos para Pensamento profundo, mantendo os custos já usados pela interface.

A RPC `consume_user_ai_usage` bloqueia a conta com `FOR UPDATE`, verifica novamente a chave após o lock e debita energia ou tokens em uma única decisão. Uma repetição da mesma requisição retorna `already_processed` e não debita novamente. Se nenhum dos dois saldos cobrir o custo, o servidor responde com erro de saldo insuficiente.

Em falha posterior da IA, `refund_user_ai_usage` devolve o recurso utilizado uma única vez. A falha de estorno é registrada no log do servidor sem expor credenciais ou dados sensíveis ao usuário.

### Anexos

A seleção do arquivo deixou de consumir quota. A interface apenas limita a seleção de forma otimista com base no último saldo sincronizado; o servidor confirma o limite real no envio. Isso evita cobrar arquivos que o usuário selecionou e removeu antes de enviar.

A mesma operação de envio chama `consume_user_attachments`. Em caso de limite excedido, a IA não é chamada. Em caso de erro da IA após a reserva, `refund_user_attachments` devolve o contador de forma idempotente.

### Snapshot remoto

A migração `20260822000003_quota_source_of_truth.sql` reescreve `sync_app_user_state` para remover `quota` do patch recebido. O snapshot continua armazenando compatibilidade histórica, conversas, artefatos e configurações, mas não é mais uma rota de escrita de energia, tokens ou anexos.

### Modo Especialista

O endpoint Expert continua autenticado e separado da energia. O job nasce como `awaiting_confirmation`, o cron seleciona apenas `queued`, e a ação de início consome a cota de 48 horas somente depois de autorização. A etapa `expert_step` é rejeitada quando tentada diretamente pelo navegador; ela só é executada pelo job interno.

### Estornos públicos

O endpoint público não aceita mais estorno genérico de energia ou tokens. Artefatos usam somente uma RPC autenticada com prefixo de evento de artefato. Estornos de mensagens de IA ficam sob o fluxo server-side do endpoint de IA.

## Migrações necessárias

Executar no SQL Editor do Supabase, nesta ordem:

1. `20260821000010_account_quota.sql`
2. `20260821000011_quota_idempotency_hardening.sql`
3. `20260821000012_account_attachment_quota.sql`
4. `20260822000001_expert_mode.sql`
5. `20260822000002_expert_deep_jobs.sql`
6. `20260822000003_quota_source_of_truth.sql`

As duas migrações de quota antigas foram limpas de linhas acidentais `EOF` e `wc -l` que tornavam o SQL inválido. A última migração contém a fonte de verdade do snapshot, wrappers autenticados de tokens, cobrança de IA, estorno de IA, estorno de anexos e RPC específica para artefatos.

## Segurança e isolamento

Todas as RPCs públicas de consumo usam `auth.uid()` para derivar a conta. As tabelas de ledger têm RLS e leitura limitada ao próprio usuário. As funções de serviço com `p_user_id` ficam sem grant para `anon` e `authenticated`; somente a função interna do worker usa a credencial de serviço. Nenhum valor de saldo é aceito como autoridade vindo do navegador.

O endpoint administrativo não recebeu permissão para editar energia, tokens, anexos ou quotas. O frontend não envia chaves, senhas, tokens de acesso ou identificadores de usuário arbitrários para alterar saldo.

## Validações realizadas

Foram aprovados os seguintes checks locais:

- Sintaxe de `api/ai.js`, `api/deep-jobs.js`, `api/cron-deep-jobs.js`, `api/expert-mode.js` e `api/quota.js`.
- Teste estático do contrato Expert, da chave idempotente e do gate server-side de IA.
- `pnpm check:html`.
- `pnpm build:web`.
- `git diff --check`.
- Validação do JSON de `vercel.json`.
- Teste visual local com usuário sintético, sem sessão Supabase, sem chamada de IA e sem consumo real. O menu `+` mostra somente recursos existentes, e os chips de Pensamento profundo e Modo Especialista aparecem acima do compositor com botão de remoção.

Não foram enviadas mensagens reais à IA, não foram usados tokens comprados, não foi consumida energia de uma conta e não houve tentativa de alterar o banco de produção sem autorização administrativa.

## Limitações honestas

A aplicação do SQL de produção não foi confirmada nesta sessão. Se o endpoint retornar que a cobrança por conta precisa ser ativada, execute as seis migrações acima e aguarde o novo deploy. Depois disso, faça um teste autenticado controlado com uma conta de teste, verificando apenas leitura da quota, tentativa de saldo insuficiente e idempotência; não use uma conta real para simular consumo sem autorização.

A camada de IA não finge possuir um computador cloud, executar testes externos ou pesquisar na internet quando esses recursos não foram realmente chamados. O Modo Especialista apresenta um resumo operacional seguro, não uma cadeia de raciocínio privada.

## Arquivos principais alterados

| Arquivo | Finalidade |
|---|---|
| `api/ai.js` | Gate server-side de energia, tokens e anexos; estornos e proteção do Expert |
| `api/deep-jobs.js` | Chave idempotente de cobrança em jobs profundos |
| `api/quota.js` | Bloqueio de estornos públicos genéricos e RPC específica de artefato |
| `index.html` | Chave de cobrança no envio, débito de anexo no envio, menu + e chips ativos |
| `www/index.html` | Build web reconstruído |
| `supabase/migrations/20260822000003_quota_source_of_truth.sql` | RPCs e hardening final de quota |
| `docs/validacao-ui-especialista-20260822.md` | Evidências do teste visual local |

---

Este relatório descreve somente alterações verificadas no repositório e não afirma uma aplicação de banco que não foi observada.
