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

A cota fica no Supabase em uma tabela própria por usuário, com janela deslizante de 48 horas, limite de 3 usos, RPCs autenticadas e limpeza de registros expirados. O job usa RLS, `auth.uid()`, chave única por usuário/mensagem e estados `queued`, `processing`, `awaiting_user`, `completed`, `failed` e `canceled`. O worker existente foi reutilizado e agendado para retomar etapas enfileiradas fora da tela.

O resultado final passa pelo fluxo automático de artefatos já existente, portanto códigos, PDFs, DOCX e XLSX continuam sendo detectados, cards e downloads permanecem disponíveis e o custo de 15 pontos por artefato não foi alterado.

## Resultado final da validação

A bateria final aprovou sintaxe dos quatro endpoints, teste estático do contrato Especialista, JSON do Vercel, `pnpm check:html`, reconstrução do `www`, `git diff --check` e varredura de padrões de credenciais no diff. O navegador local carregou a tela inicial sem exceções; os handlers públicos do Especialista, o cartão de plano, o item do menu e o caminho automático de artefatos foram confirmados no DOM. Nenhuma sessão foi autenticada e nenhuma mensagem real à IA foi enviada nesta implementação.
