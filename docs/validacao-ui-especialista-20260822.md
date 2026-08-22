# Validação da interface do Modo Especialista

Data: 22 de agosto de 2026.

## Resultado

O `index.html` local carregou no Chromium com `window.K` disponível. O DOM inicial contém os handlers da aplicação e o código do novo `composerActiveModes` foi incluído no build.

Foi feita uma tentativa isolada de renderizar a conversa sem login, sem chamada de IA, sem consumo de energia e sem cota real. A função pública `window.K.enter()` exige `state.user.name` e retornou `Cannot read properties of null (reading 'name')` quando chamada sem uma conta sintética. Isso é uma pré-condição existente do fluxo autenticado, não uma falha do menu ou do indicador. O teste não enviou mensagens nem alterou dados de produção.

## Verificações estáticas aprovadas

- `node --check api/expert-mode.js`
- `node --check api/deep-jobs.js`
- `node --check api/quota.js`
- `pnpm check:html`
- `pnpm build:web`
- `git diff --check`
- `node /tmp/test-klipza-expert-mode.mjs`

## Observação operacional

O Modo Especialista depende das migrações `20260822000001_expert_mode.sql` e `20260822000002_expert_deep_jobs.sql` no Supabase de produção. Se as funções/tabelas ainda não existirem, a aplicação agora informa que o modo precisa ser ativado no banco, sem expor erro técnico interno.

Nenhum recurso real foi consumido durante esta validação.

---

Autor: Manus AI

Após a publicação, deve ser repetido um teste autenticado com uma conta de teste autorizada e sem enviar uma tarefa de IA real, verificando apenas a leitura da quota e a criação/cancelamento de um plano conforme permitido pelo ambiente.

## Teste visual do compositor

Com uma conta sintética restrita ao `localStorage` da página local, o chat foi renderizado e o menu `+` foi aberto. O drawer exibiu apenas Câmera, Fotos e imagens, Arquivos, Pesquisa na web, Pensamento profundo e Modo Especialista; os itens demonstrativos de Projetos, Conexões e Voz não aparecem mais.

Ao ativar Pensamento profundo, o menu fechou e surgiu acima do campo de escrita um chip com ícone, nome, descrição do estado e botão `×` para desativar. A energia exibida no teste era sintética e não houve requisição de IA ou consumo de cota.

A renderização completa sem conta real funcionou quando foi injetado um usuário sintético local; a chamada anterior sem usuário falhou somente pela pré-condição já existente de `state.user.name`.

## Teste do Modo Especialista no estado sintético

Com Pensamento profundo já ativo, o menu `+` foi reaberto e o Modo Especialista foi ativado. O chip apareceu ao lado do chip de Pensamento profundo, ambos acima da caixa de escrita, e o placeholder mudou para orientar o pedido específico do Especialista.

Como o teste usava um usuário apenas no `localStorage` e não havia sessão Supabase, a chamada foi interrompida com `Sua sessão expirou.`; nenhuma mensagem, plano real, RPC de quota ou energia foi consumido. O estado visual permaneceu correto, com os dois botões `×` disponíveis para desativação.
