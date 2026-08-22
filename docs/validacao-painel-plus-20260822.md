# Validação do painel `+` do chat

**Data:** 22 de agosto de 2026  
**Commit:** `0892c0a`  
**Ambiente público:** [klipza-zzz.vercel.app](https://klipza-zzz.vercel.app/)

## Objetivo

O botão `+` foi reorganizado como um painel inferior completo, responsivo e rolável. A implementação usa somente recursos que já existem no Klipza e mantém os handlers funcionais de anexos, pesquisa na web, Pensamento profundo e Modo Especialista.

## Resultado funcional

| Área | Resultado verificado |
|---|---|
| Câmera | Card de ação ligado a `window.K.pick('camera')`. |
| Fotos e imagens | Card de ação ligado a `window.K.pick('image')`. |
| Arquivos locais | Linha de ação ligada a `window.K.pick('file')`. |
| Pesquisa na web | Linha de ação ligada a `window.K.openWebKlipModal()`. |
| Pensamento profundo | Alternância ligada a `window.K.toggleDeepThinking()`, com estado `Ativo` e chip no compositor. |
| Modo Especialista | Ação ligada a `window.K.startExpertMode()`, com quota existente preservada. |
| Recursos removidos | Projetos, Conexões, Voz e demais placeholders não foram reintroduzidos. |

## Responsividade e acessibilidade

No desktop, o painel aparece acima do compositor com largura limitada e rolagem interna. No mobile, ocupa a base da tela, usa largura total, respeita a área segura do dispositivo, aplica scrim, bloqueia a rolagem do body somente enquanto está aberto e mantém o compositor abaixo da folha sem recorte visual.

O botão expõe `aria-expanded` e `aria-controls`. A abertura move o foco para o botão de fechar; Escape, clique no scrim e o botão de fechar encerram o painel; ao fechar, o foco retorna ao botão `+`. A animação pode ser desativada por `prefers-reduced-motion`.

## Validações executadas

| Validação | Resultado |
|---|---|
| Sintaxe dos endpoints JavaScript | Aprovada para `api/ai.js`, `api/deep-jobs.js`, `api/cron-deep-jobs.js`, `api/expert-mode.js` e `api/quota.js`. |
| Contrato estático existente | Aprovado, incluindo Expert, quotas, artefatos e ausência de placeholders. |
| Verificação HTML/PWA | Aprovada por `pnpm check:html`. |
| Build web | Aprovado por `pnpm build:web`; `www/index.html` foi atualizado e versionado. |
| Diff e configuração Vercel | `git diff --check` e parse de `vercel.json` aprovados. |
| Navegador local | Abertura, cards, opções reais, estado do modo, Escape, scrim, ARIA e retorno de foco aprovados sem enviar mensagens ou consumir recursos. |
| Smoke público | `/` retornou 200; `POST /api/ai` sem bearer retornou 401; `/api/memory` sem bearer retornou 401. |

A publicação foi enviada para `main` e o conteúdo público já contém `attach-feature-grid` e o título `Adicionar ao chat`. Nenhuma migração Supabase foi aplicada como parte desta alteração visual.

## Correção complementar do mobile

Na revisão posterior, foi localizado um segundo bloco responsivo que sobrescrevia a folha com `bottom:58px`, largura automática, altura menor e cantos inferiores arredondados. Essa regra foi removida. A folha mobile agora permanece fixa em `bottom:0`, ocupa toda a largura, adapta a altura com `max-height:min(86dvh,760px)`, mantém rolagem interna e usa arredondamento somente no topo, ficando visualmente grudada à base como uma folha que sobe de baixo para cima.

A seleção de anexos fecha o painel antes de abrir o seletor ou validar a quota. Pesquisa na web também fecha o painel antes da navegação; Pensamento profundo e Modo Especialista preservam o fechamento já existente. O botão `+` continua reabrindo o painel no chat, enquanto o comportamento desktop permanece absoluto acima do compositor.

Essa correção complementar foi validada no commit posterior ao registro original, sem consumo de IA, energia, tokens ou anexos.
