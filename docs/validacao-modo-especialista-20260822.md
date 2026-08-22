# Validação do Modo Especialista — 22/08/2026

## Testes sem consumo de quota

- `node --check api/ai.js`, `api/deep-jobs.js`, `api/cron-deep-jobs.js` e `api/expert-mode.js`: aprovados.
- Teste estático do contrato Especialista: aprovado (`expert mode static contract OK`).
- `pnpm check:html`: aprovado.
- `pnpm build:web`: aprovado e build `www` reconstruído.
- Smoke test local em `http://127.0.0.1:4176/index.html?expert-mode-check=1`: tela de login carregou.
- Console local: sem saída de erro.
- Console DOM: `window.K` expõe `startExpertMode`, `confirmExpertPlan`, `resumeExpertJob`, `cancelExpertPlan` e `cancelDeepJob`; o markup contém `Modo Especialista` e `expert-plan-card`; `#attachMenu` não contém `Criar artefato`.

Nenhuma sessão foi autenticada e nenhuma mensagem real à IA foi enviada durante estes testes.

## Segunda inspeção do build

Após a reconstrução final, o navegador carregou a tela inicial sem exceções visíveis. O DOM confirmou que `window.K` expõe os cinco handlers Especialista, o markup contém `Modo Especialista` e `expert-plan-card`, o menu de anexos não contém `Criar artefato` e o caminho automático `autoCreateArtifactsFromReply` continua presente.

A inspeção foi local, sem autenticação, sem chamada ao endpoint de IA e sem consumo de energia.

## Escopo implementado

O Modo Especialista foi adicionado exclusivamente ao menu `+`. Ele consulta a cota da conta, gera um plano específico sem consumir uso, aguarda confirmação explícita, reserva um uso de forma idempotente somente após a confirmação e executa o plano em jobs por etapas. Cada etapa pode publicar narrativas operacionais, atualizar o checklist, ajustar o plano quando houver evidência ou pausar para uma decisão do usuário.

A cota fica no Supabase em uma tabela própria por usuário, com janela deslizante de 48 horas, limite de 3 usos, RPCs autenticadas e limpeza de registros expirados. O job usa RLS, `auth.uid()`, chave única por usuário/mensagem e estados `awaiting_confirmation`, `queued`, `processing`, `awaiting_user`, `completed`, `failed` e `canceled`. O worker existente foi reutilizado para retomar apenas etapas `queued` fora da tela.

O resultado final passa pelo fluxo automático de artefatos já existente, portanto códigos, PDFs, DOCX e XLSX continuam sendo detectados, cards e downloads permanecem disponíveis e o custo de 15 pontos por artefato não foi alterado.

## Resultado final da validação

A bateria final aprovou sintaxe dos quatro endpoints, teste estático do contrato Especialista, JSON do Vercel, `pnpm check:html`, reconstrução do `www` e `git diff --check`. O navegador local carregou a tela inicial sem exceções; os handlers públicos do Especialista, o cartão de plano, o item do menu e o caminho automático de artefatos foram confirmados no DOM. Nenhuma sessão foi autenticada e nenhuma mensagem real à IA foi enviada nesta implementação.

## Correção de concorrência e hospedagem

Após a primeira revisão, o job Especialista passou a ser criado com status `awaiting_confirmation`. A ação autenticada `start` valida a cota por RPC com a mesma `event_key` idempotente e só depois faz a transição para `processing`. Assim, o worker não consegue iniciar um plano antes da confirmação e do débito autorizado; se a resposta da rede for perdida, repetir o início reutiliza o mesmo evento sem consumir novamente.

O cron foi configurado para `0 3 * * *` como fallback compatível com o plano Hobby. A documentação oficial da Vercel informa que o Hobby aceita somente uma execução diária; frequências por minuto ficam disponíveis nos planos Pro e Enterprise [1]. O início imediato pelo app continua sendo o caminho principal.

As migrações `20260822000001_expert_mode.sql` e `20260822000002_expert_deep_jobs.sql` estão versionadas neste repositório, mas **não foram aplicadas ao Supabase de produção nesta validação**. Antes de liberar o recurso para contas reais, elas precisam ser executadas no SQL Editor ou por uma conexão administrativa autorizada.

## Referências

[1]: https://vercel.com/docs/cron-jobs/usage-and-pricing "Vercel — Usage & Pricing for Cron Jobs"
