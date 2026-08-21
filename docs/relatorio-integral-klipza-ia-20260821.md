# Relatório integral do Klipza.IA

**Projeto:** `jeanvicen/klipza.zzz`  
**Aplicação pública:** [Klipza.IA](https://klipza-zzz.vercel.app)  
**Branch:** `main`  
**Data da documentação:** 21 de agosto de 2026  
**Responsável pela documentação:** Manus AI  
**Escopo:** inventário técnico e funcional das alterações implementadas no aplicativo, sem exposição de senhas, chaves, tokens ou instruções internas confidenciais.

> Este documento explica o que foi construído, como as partes se conectam, quais arquivos participam do sistema, como os dados são protegidos, como o aplicativo é validado e quais limites continuam conhecidos.

## 1. Resumo executivo

O Klipza.IA foi evoluído de um chat estático para uma aplicação autenticada com memória por usuário, sincronização de estado, artefatos de código, Studio Klip, histórico limitado, avaliações, regeneração, transcrição por voz, pesquisa, análise de anexos e um modo de Pensamento profundo. O frontend permanece em HTML, CSS e JavaScript, enquanto a autenticação e os dados de conta usam Supabase, as funções privadas são executadas pela camada serverless do Vercel e a publicação ocorre automaticamente a partir do GitHub.

A experiência de usuário foi simplificada. O modo Pensamento profundo fica no botão **+**, e as Configurações não exibem nomes de provedores, chaves, APIs ou detalhes de infraestrutura. A Memória da conta usa captura automática e um teto de 500 memórias por usuário; a pessoa pode excluir memórias e baixar os próprios dados.

Nesta entrega, o modo profundo passou a consumir **7 pontos de energia por resposta**: o custo normal é 2 e o adicional do modo profundo é 5. O modo normal continua consumindo 2 pontos. O modo profundo também recebeu uma instrução simples de especialista, que orienta a análise contextual, comparação de alternativas, verificação de riscos e revisão antes da entrega.

## 2. Arquitetura geral

| Camada | Tecnologia ou serviço | Responsabilidade |
|---|---|---|
| Interface | HTML, CSS e JavaScript em `index.html` | Chat, menus, configurações, histórico, artefatos, voz, energia e estado visual |
| Build | Node.js e `scripts/build-web.mjs` | Geração da cópia publicada em `www/` |
| Validação | `scripts/check-html.mjs`, `node --check`, `git diff --check` | Integridade estrutural e sintaxe |
| API serverless | Vercel Functions em `api/` | IA, autenticação de bearer e memória privada |
| Autenticação | Supabase Auth | Sessão, usuário e JWT |
| Banco | Supabase Postgres com RLS | Estado de conta, memória, notificações, backups e feedback |
| Publicação | GitHub + Vercel | Deploy automático do branch `main` |
| PWA | `sw.js`, manifest e ícones | Cache do shell, instalação e atualização do aplicativo |
| Editor | `Studio.html` | Studio Klip para arquivos e preview |

A arquitetura não coloca chaves de IA no navegador. O frontend envia a mensagem com o JWT do usuário para `/api/ai`; o backend valida a sessão, carrega apenas a memória daquele usuário e usa as credenciais server-side para chamar o provedor configurado. A API de memória segue a mesma regra de autenticação.

## 3. Alterações de produto e interface

### 3.1 Chat principal e navegação

O menu lateral contém nova conversa, histórico recente, web.klip, Artefatos, perfil e Configurações. O botão **+** reúne câmera, fotos, arquivos, pesquisa, Pensamento profundo, projetos, conexões, voz e criação de artefatos. Recursos ainda não disponíveis são apresentados como “Em breve”, sem fingir que estão ativos.

O Pensamento profundo foi retirado da seção técnica das Configurações e permanece somente no menu +. Ao ativá-lo, o estado visual mostra Ativo ou Desativado e o menu fecha após a escolha. Os nomes de provedores e detalhes sobre APIs não são exibidos para o usuário final.

### 3.2 Respostas, código e artefatos

As respostas Markdown são renderizadas no chat. Blocos de código têm botão para copiar apenas o código, sem copiar a mensagem inteira, e botão para criar um artefato. O aplicativo identifica HTML, CSS, JavaScript, TypeScript, Python, JSON, JSX, TSX, SQL, Bash, Java, Go, Rust, C, C++, PHP e Ruby.

Quando uma resposta contém código útil, o Klipza cria artefatos automaticamente sem exigir que a pessoa use a palavra “artefato”. HTML pode ser aberto em preview dentro de iframe sandbox. Mensagens anônimas não persistem artefatos na conta.

Cada resposta de IA possui ações de gostei, não gostei e regeneração. A regeneração é limitada a três vezes por resposta. Feedback é salvo com RLS por usuário e pode ser usado posteriormente para análise administrativa, sem misturar dados entre contas.

### 3.3 Studio Klip

O `Studio.html` é um editor separado, inspirado em fluxos de CodePen e editores de código modernos. Ele abre com estado vazio, permite criar e excluir arquivos, oferece linguagens de programação adicionais, preview HTML, navegação de volta, área de trabalho responsiva e sincronização por conta. O editor e o chat são módulos separados para evitar que arquivos grandes travem a interface principal.

### 3.4 Transcrição por voz

A transcrição usa reconhecimento de voz contínuo quando disponível no navegador, resultados intermediários, múltiplas alternativas e reinício controlado após pausas. A interface mostra um painel de escuta ao vivo e permite parar a captura. Caso o navegador não ofereça a API, o aplicativo informa a limitação em vez de falhar silenciosamente.

### 3.5 Histórico e estado da conta

O histórico é limitado a 50 conversas recentes por conta. O estado de chats, artefatos, quota, preferências e conversa ativa é compactado antes de ser sincronizado no Supabase. O salvamento remoto usa debounce e timeout para que uma falha de rede não bloqueie o chat local.

## 4. Pensamento profundo

### 4.1 Comportamento

Quando ativado no botão +, o modo profundo executa duas etapas server-side: primeiro cria um plano estruturado seguro e depois gera a resposta final orientada por esse plano. O plano contém até cinco tópicos, até cinco verificações e um resumo curto. O frontend mostra um bloco expansível dentro da própria mensagem do Klipza, semelhante ao padrão visual de modos de pensamento de assistentes de raciocínio.

Durante o processamento, o usuário vê um resumo operacional contextual, como “Vou entender o objetivo”, “Vou separar os tópicos”, “Vou conferir riscos” e “Vou revisar o resultado”. Depois da resposta, o bloco continua anexado à mensagem e pode ser recolhido ou aberto novamente. O sistema mostra tópicos, verificações e resumo, mas não mostra a cadeia de raciocínio privada completa do modelo.

### 4.2 Texto simples de especialista

O prompt server-side do modo profundo foi simplificado para orientar o seguinte comportamento: agir como especialista adequado ao assunto, entender objetivo e contexto, organizar tópicos, escolher abordagem, comparar alternativas, considerar riscos e casos especiais, conferir lógica, segurança, compatibilidade e clareza, e entregar uma resposta prática proporcional à dificuldade. Para código, a instrução exige revisar estrutura e execução antes de responder.

Esse texto é uma regra de comportamento do backend. Ele não autoriza o modelo a inventar fatos, fontes ou capacidades, e mantém a proibição de solicitar senhas, tokens, códigos de segurança ou dados completos de cartão.

### 4.3 Energia

| Tipo de resposta | Custo |
|---|---:|
| Mensagem normal | 2 pontos |
| Adicional do Pensamento profundo | 5 pontos |
| Total de uma mensagem profunda | 7 pontos |
| Energia por ciclo | 100 pontos |

O custo é aplicado antes da chamada da IA. A interface atualiza o indicador de energia e informa quando os pontos disponíveis não são suficientes. O caminho de tokens comprados permanece preparado, mas a função de consumo de tokens continua marcada como recurso em desenvolvimento; nenhum checkout ou cobrança real é inventado pelo frontend.

## 5. Memória inteligente e gestão de contas

### 5.1 Captura automática

A memória é capturada automaticamente a partir de declarações úteis do próprio usuário, como nome preferido, preferências, lembretes, projetos, objetivos, contexto de trabalho e estilo de resposta. O filtro bloqueia padrões de senha, token, chave de API, credencial, cartão, CVV, documentos pessoais e outros dados sensíveis.

A captura usa chave lógica e hash para evitar duplicatas. A prioridade diferencia informações permanentes, padrão e temporárias. A poda remove registros expirados e prioriza memórias antigas, temporárias, pouco usadas e de menor prioridade.

### 5.2 Regra de 500 memórias

A nova regra fixa o limite em 500 registros por conta e usa captura automática. A regra foi aplicada no frontend, na API de memória, no endpoint de IA e na migração `20260821000008_memory_automatic_500.sql`, incluindo contas antigas e restaurações futuras. O banco foi normalizado para duas contas verificadas durante a aplicação da migração.

A interface da Memória da conta foi simplificada para mostrar o estado das memórias, a lista essencial, a ação de **Excluir** e a ação de **Baixar dados**. Os controles de captura manual, provedor, banco, limite editável e configurações técnicas não são apresentados ao usuário final.

### 5.3 Isolamento

As tabelas de memória possuem `user_id` e políticas RLS baseadas em `auth.uid()`. O helper `api/_auth.js` valida o bearer com Supabase Auth e cria um cliente com o JWT do usuário, permitindo que as RPCs mantenham o isolamento da conta. Memórias de uma conta não são carregadas como contexto de outra.

### 5.4 Exportação, backup e retenção

A exportação gera JSON com estado de conta, conversas, artefatos, memórias e configurações aplicáveis. Snapshots têm checksum e versão. A restauração usa deduplicação e preserva a separação por usuário. A rotina de ciclo de vida processa poda e avisos de inatividade, incluindo notificações em 90, 30 e 7 dias antes do marco de 24 meses.

## 6. API e integrações de IA

### 6.1 Endpoint de IA

O arquivo `api/ai.js` autentica o usuário, normaliza mensagem, histórico e anexos, carrega memória autorizada, cria o plano profundo quando solicitado e seleciona o fluxo de chat, pesquisa ou anexos. O endpoint devolve texto, modo, resumo seguro do pensamento e contadores de memória. O provedor não precisa ser conhecido pelo usuário.

### 6.2 Provedores server-side

Groq é o caminho padrão e fallback. Qwen e Hermes foram preparados como rotas compatíveis com OpenAI, mas só entram quando base URL, chave e modelo estiverem configurados no servidor. As variáveis utilizadas pelo backend são `GROQ_API_KEY`, `GEMINI_API_KEY`, `QWEN_BASE_URL`, `QWEN_API_KEY`, `QWEN_MODEL`, `HERMES_BASE_URL`, `HERMES_API_KEY` e `HERMES_MODEL`. Os valores nunca são documentados neste arquivo.

Gemini atende pesquisa e alguns fluxos multimodais; Groq atende texto e fallback multimodal. Pesquisa usa contexto do web.klip e referências quando disponíveis. Anexos são limitados e normalizados antes de serem encaminhados.

### 6.3 Pesquisa e web.klip

O web.klip apresenta referências públicas, categorias, resumos, pesquisa e carregamento progressivo. Uma referência pode ser enviada para o chat como contexto de pesquisa. O backend recebe esse contexto separado do texto principal.

## 7. Supabase, migrations e tabelas

| Migração | Função principal |
|---|---|
| `20260820000001_security_lifecycle.sql` | Segurança e ciclo de vida da conta |
| `20260820000002_cron.sql` | Rotinas agendadas existentes |
| `20260820000003_billing.sql` | Estrutura de billing em desenvolvimento |
| `20260820000004_prime_only.sql` | Regras de recursos Prime em desenvolvimento |
| `20260821000005_app_user_state.sql` | Estado sincronizado por conta |
| `20260821000006_message_feedback.sql` | Gostei e não gostei por mensagem |
| `20260821000007_memory_accounts.sql` | Memória, configurações, notificações e backups |
| `20260821000008_memory_automatic_500.sql` | Captura automática, teto 500 e poda normalizada |

As principais tabelas são `app_user_state`, `message_feedback`, `user_memories`, `user_memory_settings`, `user_notifications` e `user_data_backups`. As RPCs relevantes incluem `sync_app_user_state`, `upsert_user_memory`, `prune_user_memories`, `create_user_data_backup`, `restore_user_data_backup`, `process_memory_retention` e `process_inactivity_notifications`.

## 8. Segurança e privacidade

A autenticação usa JWT do Supabase. Endpoints privados recusam chamadas sem bearer. As respostas de memória usam `Cache-Control: no-store`. Service role e chaves de IA não são enviados ao frontend. O repository foi verificado para não conter os padrões de chaves Qwen ou Hermes fornecidos durante a solicitação.

O bloqueio de F12, atalhos de inspeção e menu contextual é apenas uma barreira de experiência; não é considerado mecanismo de segurança. A segurança real depende de RLS, autenticação, validação server-side, isolamento por `user_id` e não exposição de segredos.

As chaves fornecidas anteriormente não são repetidas neste relatório. Como foram expostas no histórico da conversa, a recomendação operacional continua sendo revogar e substituir essas chaves antes de uso prolongado.

## 9. Arquivos principais

| Arquivo | Responsabilidade |
|---|---|
| `index.html` | Interface completa, chat, energia, menus, memória, pensamento, voz, feedback e artefatos |
| `Studio.html` | Editor Studio Klip e preview |
| `api/ai.js` | IA autenticada, memória, plano profundo, provedores e fallback |
| `api/memory.js` | API privada de memórias, exportação, notificações e backups |
| `api/_auth.js` | Validação de JWT e cliente Supabase com escopo do usuário |
| `api/webklip.js` | Backend do web.klip |
| `api/admin-users.js` | Operações administrativas protegidas |
| `sw.js` | Service worker PWA e atualização de cache |
| `scripts/build-web.mjs` | Cópia dos arquivos para `www/` |
| `scripts/check-html.mjs` | Verificações de integridade e marcadores obrigatórios |
| `supabase/migrations/` | Alterações versionadas do banco |
| `docs/` | Relatórios, auditorias, testes e referências |
| `.env.example` | Nomes e placeholders de ambiente, sem valores reais |

## 10. Validações e publicação

As validações executadas nesta entrega foram `node --check api/ai.js`, `node --check api/memory.js`, `pnpm check:html`, `pnpm build:web` e `git diff --check`. Também foram realizados testes no navegador autenticado para ativação do modo profundo, visualização do bloco dentro da resposta, expansão e recolhimento, controle de energia e configuração da Memória.

A publicação usa `git push origin main`, acionando o Vercel. O arquivo publicado `www/index.html` é gerado pelo build e deve ser sincronizado antes de cada commit. O service worker utiliza nome de cache versionado para evitar que clientes antigos mantenham uma interface desatualizada.

## 11. Histórico de commits relevantes

| Commit | Alteração |
|---|---|
| `cadac94` | Memória por conta, API privada, migrações iniciais, configurações, pensamento, artefatos e histórico |
| `60280ed` | Correção do estado visual do pensamento |
| `5e7e43d` | Memória aplicada a chat, pesquisa e anexos |
| `abd26e8` | Evidências de validação e relatório |
| `8acc27b` | Simplificação da Memória e do Pensamento para a experiência do usuário |
| `465deea` | Resumo operacional contextual do pensamento |
| `e712f9e` | Bloco expansível de pensamento incorporado à mensagem |
| **Próxima publicação** | Prompt especialista, custo profundo de 7 pontos e documentação integral |

## 12. Limites conhecidos

O modo profundo mostra um resumo operacional seguro, não uma transcrição literal de pensamentos privados. Qwen e Hermes continuam opcionais até que suas URLs base HTTPS específicas sejam configuradas no Vercel. Tokens comprados e checkout permanecem em desenvolvimento. A transcrição depende do suporte do navegador. A sincronização remota possui timeout para preservar a responsividade local.

## Referências públicas

[1]: https://api-docs.deepseek.com/guides/thinking_mode/ "DeepSeek API — Thinking Mode"

[2]: https://www.alibabacloud.com/help/en/model-studio/first-api-call-to-qwen "Alibaba Cloud Model Studio — Qwen API"

[3]: https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server "Hermes Agent — API Server"

[4]: https://supabase.com/docs/guides/database/postgres/row-level-security "Supabase — Row Level Security"

[5]: https://vercel.com/docs/functions "Vercel — Functions"


## 13. Evidência final do modo especialista e energia

No deploy do commit `9822d43`, o botão + mostrou Pensamento profundo ativo e uma pergunta real recebeu plano contextual com tópicos e verificações adequados ao assunto. A primeira medição ainda usou cache anterior e consumiu 2 pontos. Depois da remoção controlada do service worker e dos caches do navegador, o cliente carregou `DEEP_EXTRA_ENERGY=5` e `DEEP_MSG_COST=7`; a mensagem seguinte reduziu a energia de 84 para 77, confirmando 7 pontos por resposta profunda. O estado permaneceu em `thinkingMode: deep`.

O relatório detalhado desse teste está em `docs/teste-pensamento-especialista-energia-20260821.md`.
